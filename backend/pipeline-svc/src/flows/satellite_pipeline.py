"""
Satellite Detection Pipeline -- Prefect 2 flow.

Orchestrates the end-to-end process of downloading Sentinel imagery,
preprocessing, computing spectral indices, running ML inference,
vectorising predictions, storing results, and triggering alerts.
"""

from __future__ import annotations

import json
import tempfile
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import httpx
import numpy as np
import rasterio
import structlog
import torch
from prefect import flow, task
from rasterio.features import shapes
from rasterio.transform import from_bounds
from shapely.geometry import mapping, shape

logger = structlog.get_logger(__name__)

# ---------------------------------------------------------------------------
# Configuration defaults
# ---------------------------------------------------------------------------

MINIO_BUCKET_RAW = "raw-satellite"
MINIO_BUCKET_PROCESSED = "processed-satellite"
MINIO_BUCKET_PREDICTIONS = "predictions"
MINESPOTAI_BASE_URL = "http://minespotai-svc:8000"
ALERTFLOW_BASE_URL = "http://alertflow-svc:8000"
DEFAULT_PATCH_SIZE = 256
DEFAULT_OVERLAP = 32
DEFAULT_THRESHOLD = 0.5
DEFAULT_MIN_AREA = 100


# ---------------------------------------------------------------------------
# Tasks
# ---------------------------------------------------------------------------

@task(name="download_sentinel", retries=2, retry_delay_seconds=30)
def download_sentinel(
    bbox: Tuple[float, float, float, float],
    date_range: Tuple[str, str],
    sat_source: str = "copernicus",
) -> str:
    """
    Download Sentinel-2 + SAR imagery for the given bounding box and date range.

    In production this would authenticate with the Copernicus Open Access Hub
    (or a STAC catalogue) and pull the tiles into a MinIO bucket.  For now it
    creates a placeholder GeoTIFF with the expected 7 optical + 2 SAR bands.

    Args:
        bbox: (min_lon, min_lat, max_lon, max_lat).
        date_range: (start_date, end_date) as ISO-8601 strings.
        sat_source: Data provider identifier.

    Returns:
        Local filesystem path to the downloaded raw raster.
    """
    logger.info(
        "download_sentinel",
        bbox=bbox,
        date_range=date_range,
        sat_source=sat_source,
        bucket=MINIO_BUCKET_RAW,
    )

    # --- placeholder: create a dummy 9-band raster (7 optical + VV + VH) ---
    height, width = 512, 512
    num_bands = 9  # B2,B3,B4,B8,B8A,B11,B12,VV,VH
    data = np.random.rand(num_bands, height, width).astype(np.float32)

    transform = from_bounds(*bbox, width, height)

    tmp_dir = Path(tempfile.mkdtemp(prefix="geominer_raw_"))
    raw_path = tmp_dir / "sentinel_raw.tif"

    with rasterio.open(
        raw_path,
        "w",
        driver="GTiff",
        height=height,
        width=width,
        count=num_bands,
        dtype="float32",
        crs="EPSG:4326",
        transform=transform,
    ) as dst:
        dst.write(data)

    logger.info("download_sentinel.complete", path=str(raw_path))
    return str(raw_path)


@task(name="preprocess", retries=1)
def preprocess(raw_path: str) -> str:
    """
    Apply cloud masking and atmospheric correction to raw imagery.

    Args:
        raw_path: Path to the raw multi-band GeoTIFF.

    Returns:
        Path to the preprocessed GeoTIFF.
    """
    from src.core.preprocessor import atmospheric_correction, cloud_mask_s2

    logger.info("preprocess.start", raw_path=raw_path)

    with rasterio.open(raw_path) as src:
        data = src.read()  # (C, H, W)
        profile = src.profile.copy()

    # Band mapping: 0=B2, 1=B3, 2=B4, 3=B8, 4=B8A, 5=B11, 6=B12, 7=VV, 8=VH
    bands_dict = {
        "B2": data[0], "B3": data[1], "B4": data[2],
        "B8": data[3], "B8A": data[4], "B11": data[5], "B12": data[6],
    }

    cloud_msk = cloud_mask_s2(bands_dict, cloud_prob_threshold=0.3)

    # Apply cloud mask -- set cloudy pixels to NaN
    optical = data[:7].copy()
    optical[:, cloud_msk] = np.nan

    # Atmospheric correction on optical bands
    corrected = atmospheric_correction(optical, method="dos1")
    data[:7] = corrected

    # Write preprocessed raster
    out_path = raw_path.replace("_raw.tif", "_preprocessed.tif")
    with rasterio.open(out_path, "w", **profile) as dst:
        dst.write(data)

    logger.info("preprocess.complete", path=out_path)
    return out_path


@task(name="compute_indices", retries=1)
def compute_indices(processed_path: str) -> str:
    """
    Compute spectral indices and stack them with the preprocessed bands.

    Indices computed:
        NDVI  = (B8 - B4) / (B8 + B4)
        NDWI  = (B3 - B8) / (B3 + B8)
        BSI   = ((B11 + B4) - (B8 + B2)) / ((B11 + B4) + (B8 + B2))
        NBI   = (B11 * B4) / B8
        MNDWI = (B3 - B11) / (B3 + B11)

    Args:
        processed_path: Path to the preprocessed 9-band GeoTIFF.

    Returns:
        Path to the stacked 12-band GeoTIFF (original 9 + NDVI + NDWI + BSI).
        NBI replaces MNDWI in the final 12-band stack to match the model's
        expected 12-channel input.
    """
    logger.info("compute_indices.start", path=processed_path)

    with rasterio.open(processed_path) as src:
        data = src.read().astype(np.float32)  # (9, H, W)
        profile = src.profile.copy()
        transform = src.transform

    # Band indices within the 9-band raster
    B2, B3, B4, B8 = data[0], data[1], data[2], data[3]
    B11 = data[5]
    eps = 1e-10

    ndvi = (B8 - B4) / (B8 + B4 + eps)
    ndwi = (B3 - B8) / (B3 + B8 + eps)
    bsi = ((B11 + B4) - (B8 + B2)) / ((B11 + B4) + (B8 + B2) + eps)
    nbi = (B11 * B4) / (B8 + eps)

    # Stack: 9 original bands + NDVI, NDWI, BSI = 12 channels
    # Model expects: [B2,B3,B4,B8,B8A,B11,B12, VV,VH, NDVI,NDWI,BSI]
    #   (NBI can be used as 12th if desired; here we use BSI)
    stacked = np.concatenate([data, ndvi[None], ndwi[None], bsi[None]], axis=0)

    profile.update(count=stacked.shape[0], dtype="float32")
    out_path = processed_path.replace("_preprocessed.tif", "_stacked.tif")

    with rasterio.open(out_path, "w", **profile) as dst:
        dst.write(stacked)

    logger.info("compute_indices.complete", path=out_path, bands=stacked.shape[0])
    return out_path


@task(name="run_inference", retries=1)
def run_inference(
    stacked_path: str,
    model_path: str,
    patch_size: int = DEFAULT_PATCH_SIZE,
    overlap: int = DEFAULT_OVERLAP,
) -> str:
    """
    Tile image into patches, run SegFormer inference, stitch predictions.

    Args:
        stacked_path: Path to the 12-band stacked GeoTIFF.
        model_path: Path to the saved model weights.
        patch_size: Tile size in pixels.
        overlap: Overlap between adjacent tiles in pixels.

    Returns:
        Path to the prediction mask GeoTIFF.
    """
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parents[4] / "minespotai-svc" / "src"))
    from models.minespot_segformer import load_model

    logger.info("run_inference.start", stacked_path=stacked_path, model_path=model_path)

    device = "cuda" if torch.cuda.is_available() else "cpu"
    model = load_model(model_path, device=device)

    with rasterio.open(stacked_path) as src:
        data = src.read().astype(np.float32)  # (C, H, W)
        profile = src.profile.copy()

    C, H, W = data.shape
    step = patch_size - overlap
    prediction = np.zeros((H, W), dtype=np.float32)
    weight_map = np.zeros((H, W), dtype=np.float32)

    # Tile and infer
    for y in range(0, H, step):
        for x in range(0, W, step):
            y_end = min(y + patch_size, H)
            x_end = min(x + patch_size, W)
            y_start = y_end - patch_size
            x_start = x_end - patch_size

            if y_start < 0:
                y_start = 0
                y_end = min(patch_size, H)
            if x_start < 0:
                x_start = 0
                x_end = min(patch_size, W)

            patch = data[:, y_start:y_end, x_start:x_end]

            # Pad if necessary
            ph, pw = patch.shape[1], patch.shape[2]
            if ph < patch_size or pw < patch_size:
                padded = np.zeros((C, patch_size, patch_size), dtype=np.float32)
                padded[:, :ph, :pw] = patch
                patch = padded

            tensor = torch.from_numpy(patch).unsqueeze(0).to(device)

            with torch.no_grad():
                logits = model(tensor)  # (1, 2, 256, 256)
                probs = torch.softmax(logits, dim=1)
                mining_prob = probs[0, 1].cpu().numpy()  # class 1 probability

            # Accumulate (handles overlap via averaging)
            prediction[y_start:y_end, x_start:x_end] += mining_prob[:ph, :pw]
            weight_map[y_start:y_end, x_start:x_end] += 1.0

    # Average overlapping regions
    weight_map = np.maximum(weight_map, 1.0)
    prediction /= weight_map

    # Write prediction raster
    pred_profile = profile.copy()
    pred_profile.update(count=1, dtype="float32")
    out_path = stacked_path.replace("_stacked.tif", "_prediction.tif")

    with rasterio.open(out_path, "w", **pred_profile) as dst:
        dst.write(prediction[np.newaxis])

    logger.info("run_inference.complete", path=out_path)
    return out_path


@task(name="vectorize_predictions")
def vectorize_predictions(
    predictions_path: str,
    threshold: float = DEFAULT_THRESHOLD,
    min_area: int = DEFAULT_MIN_AREA,
) -> Dict[str, Any]:
    """
    Convert raster prediction mask to vector GeoJSON polygons.

    Args:
        predictions_path: Path to the prediction probability raster.
        threshold: Probability threshold for binarisation.
        min_area: Minimum polygon area in pixels to retain.

    Returns:
        GeoJSON FeatureCollection dict.
    """
    logger.info("vectorize_predictions.start", path=predictions_path, threshold=threshold)

    with rasterio.open(predictions_path) as src:
        mask = src.read(1)
        transform = src.transform
        crs = src.crs

    binary = (mask >= threshold).astype(np.uint8)

    features: List[Dict[str, Any]] = []
    for geom, value in shapes(binary, transform=transform):
        if value == 0:
            continue
        poly = shape(geom)
        if poly.area < min_area:
            continue
        features.append({
            "type": "Feature",
            "geometry": mapping(poly),
            "properties": {
                "class": "mining_site",
                "confidence": float(np.mean(mask[binary == 1])),
            },
        })

    geojson = {
        "type": "FeatureCollection",
        "crs": str(crs) if crs else None,
        "features": features,
    }

    logger.info("vectorize_predictions.complete", num_features=len(features))
    return geojson


@task(name="store_results", retries=2, retry_delay_seconds=10)
def store_results(
    geojson: Dict[str, Any],
    metadata: Dict[str, Any],
) -> List[str]:
    """
    POST detected mining site polygons to the minespotai-svc /sites endpoint.

    Args:
        geojson: GeoJSON FeatureCollection with detected polygons.
        metadata: Additional metadata (date_range, bbox, pipeline run id, etc.).

    Returns:
        List of created site IDs.
    """
    logger.info("store_results.start", num_features=len(geojson.get("features", [])))

    site_ids: List[str] = []

    with httpx.Client(base_url=MINESPOTAI_BASE_URL, timeout=30) as client:
        for feature in geojson.get("features", []):
            payload = {
                "geometry": feature["geometry"],
                "properties": feature.get("properties", {}),
                "metadata": metadata,
            }
            try:
                resp = client.post("/sites", json=payload)
                resp.raise_for_status()
                site_id = resp.json().get("id", "unknown")
                site_ids.append(site_id)
                logger.info("store_results.created", site_id=site_id)
            except httpx.HTTPStatusError as exc:
                logger.error("store_results.failed", status=exc.response.status_code,
                             detail=exc.response.text)
            except httpx.RequestError as exc:
                logger.error("store_results.connection_error", error=str(exc))

    logger.info("store_results.complete", site_ids=site_ids)
    return site_ids


@task(name="trigger_alerts", retries=2, retry_delay_seconds=10)
def trigger_alerts(site_ids: List[str]) -> None:
    """
    Notify the alertflow-svc about newly detected mining sites.

    Args:
        site_ids: List of site IDs to generate alerts for.
    """
    if not site_ids:
        logger.info("trigger_alerts.skip", reason="no new sites detected")
        return

    logger.info("trigger_alerts.start", site_ids=site_ids)

    with httpx.Client(base_url=ALERTFLOW_BASE_URL, timeout=30) as client:
        for site_id in site_ids:
            payload = {
                "site_id": site_id,
                "alert_type": "new_detection",
            }
            try:
                resp = client.post("/alerts", json=payload)
                resp.raise_for_status()
                logger.info("trigger_alerts.sent", site_id=site_id)
            except httpx.HTTPStatusError as exc:
                logger.error("trigger_alerts.failed", site_id=site_id,
                             status=exc.response.status_code)
            except httpx.RequestError as exc:
                logger.error("trigger_alerts.connection_error", site_id=site_id,
                             error=str(exc))

    logger.info("trigger_alerts.complete")


# ---------------------------------------------------------------------------
# Flow
# ---------------------------------------------------------------------------

@flow(name="satellite_detection_pipeline", log_prints=True)
def satellite_detection_pipeline(
    bbox: Tuple[float, float, float, float],
    date_range: Tuple[str, str],
    sat_source: str = "copernicus",
    model_path: str = "/models/minespot_segformer_b4.pt",
    threshold: float = DEFAULT_THRESHOLD,
    min_area: int = DEFAULT_MIN_AREA,
) -> Dict[str, Any]:
    """
    End-to-end satellite mining-site detection pipeline.

    Steps:
        1. Download Sentinel-2 + SAR imagery
        2. Preprocess (cloud masking, atmospheric correction)
        3. Compute spectral indices and stack bands
        4. Run SegFormer inference (tiled)
        5. Vectorise predictions to GeoJSON polygons
        6. Store results in minespotai-svc
        7. Trigger alerts via alertflow-svc

    Args:
        bbox: Bounding box (min_lon, min_lat, max_lon, max_lat).
        date_range: Start/end dates as ISO strings.
        sat_source: Satellite data provider.
        model_path: Path to SegFormer weights file.
        threshold: Probability threshold for binarisation.
        min_area: Minimum polygon area (pixels) to keep.

    Returns:
        Summary dict with site_ids and feature count.
    """
    print(f"Starting pipeline for bbox={bbox}, dates={date_range}")

    # Step 1 -- Download
    raw_path = download_sentinel(bbox, date_range, sat_source)

    # Step 2 -- Preprocess
    processed_path = preprocess(raw_path)

    # Step 3 -- Spectral indices
    stacked_path = compute_indices(processed_path)

    # Step 4 -- Inference
    predictions_path = run_inference(stacked_path, model_path)

    # Step 5 -- Vectorise
    geojson = vectorize_predictions(predictions_path, threshold, min_area)

    # Step 6 -- Store
    metadata = {
        "bbox": bbox,
        "date_range": date_range,
        "sat_source": sat_source,
        "model_path": model_path,
        "threshold": threshold,
    }
    site_ids = store_results(geojson, metadata)

    # Step 7 -- Alerts
    trigger_alerts(site_ids)

    summary = {
        "site_ids": site_ids,
        "num_features": len(geojson.get("features", [])),
        "bbox": bbox,
        "date_range": date_range,
    }
    print(f"Pipeline complete: {len(site_ids)} sites stored, "
          f"{summary['num_features']} features detected.")
    return summary


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Run satellite detection pipeline")
    parser.add_argument("--bbox", nargs=4, type=float, required=True,
                        help="Bounding box: min_lon min_lat max_lon max_lat")
    parser.add_argument("--start-date", required=True, help="Start date (ISO)")
    parser.add_argument("--end-date", required=True, help="End date (ISO)")
    parser.add_argument("--model-path", default="/models/minespot_segformer_b4.pt")
    parser.add_argument("--threshold", type=float, default=DEFAULT_THRESHOLD)
    parser.add_argument("--min-area", type=int, default=DEFAULT_MIN_AREA)

    args = parser.parse_args()

    satellite_detection_pipeline(
        bbox=tuple(args.bbox),
        date_range=(args.start_date, args.end_date),
        model_path=args.model_path,
        threshold=args.threshold,
        min_area=args.min_area,
    )
