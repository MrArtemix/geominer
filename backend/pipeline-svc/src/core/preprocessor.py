"""
Preprocessing utilities for satellite imagery.

Provides cloud masking, atmospheric correction, SAR speckle filtering,
spectral index computation, band stacking, and tiling.
"""

from __future__ import annotations

from typing import Dict, List, Tuple

import numpy as np
from scipy.ndimage import uniform_filter


# ---------------------------------------------------------------------------
# SAR filtering
# ---------------------------------------------------------------------------

def apply_lee_filter(sar_band: np.ndarray, window_size: int = 7) -> np.ndarray:
    """
    Apply a Lee speckle filter to a SAR intensity band.

    The Lee filter is an adaptive filter that reduces speckle noise while
    preserving edges.  It works by computing local statistics within a
    sliding window and weighting the output between the local mean and the
    observed value based on the local coefficient of variation.

    Args:
        sar_band: 2-D numpy array with SAR intensity values.
        window_size: Size of the square sliding window (must be odd).

    Returns:
        Filtered 2-D array with the same shape and dtype.
    """
    if window_size % 2 == 0:
        raise ValueError("window_size must be odd")

    img = sar_band.astype(np.float64)

    # Local statistics
    local_mean = uniform_filter(img, size=window_size)
    local_sq_mean = uniform_filter(img ** 2, size=window_size)
    local_var = local_sq_mean - local_mean ** 2
    local_var = np.maximum(local_var, 0.0)

    # Overall noise variance estimate (assumes multiplicative noise model)
    overall_var = np.var(img)

    # Weight factor
    weight = local_var / (local_var + overall_var + 1e-10)

    filtered = local_mean + weight * (img - local_mean)
    return filtered.astype(sar_band.dtype)


# ---------------------------------------------------------------------------
# Cloud masking
# ---------------------------------------------------------------------------

def cloud_mask_s2(
    bands_dict: Dict[str, np.ndarray],
    cloud_prob_threshold: float = 0.3,
) -> np.ndarray:
    """
    Simple cloud detection for Sentinel-2 using a blue-band brightness ratio.

    This is a lightweight heuristic -- in production you would use the
    Sentinel-2 Scene Classification Layer (SCL) or a dedicated cloud
    probability band (e.g. s2cloudless).

    The approach flags pixels where the blue band (B2) reflectance exceeds
    *cloud_prob_threshold* relative to the image's dynamic range.

    Args:
        bands_dict: Mapping of band names to 2-D arrays.  Must contain
                    ``"B2"`` (blue band).
        cloud_prob_threshold: Normalised brightness threshold (0-1).

    Returns:
        Boolean mask -- ``True`` where clouds are detected.
    """
    blue = bands_dict["B2"].astype(np.float64)

    # Normalise blue band to 0-1 using its own range
    b_min, b_max = np.nanmin(blue), np.nanmax(blue)
    if b_max - b_min < 1e-10:
        return np.zeros(blue.shape, dtype=bool)

    blue_norm = (blue - b_min) / (b_max - b_min)

    # High blue reflectance indicates cloud
    cloud = blue_norm > (1.0 - cloud_prob_threshold)
    return cloud


# ---------------------------------------------------------------------------
# Atmospheric correction
# ---------------------------------------------------------------------------

def atmospheric_correction(
    bands: np.ndarray,
    method: str = "dos1",
) -> np.ndarray:
    """
    Apply Dark Object Subtraction (DOS1) atmospheric correction.

    DOS1 assumes the darkest pixel in each band represents atmospheric path
    radiance and subtracts it.  This is a first-order correction suitable
    for relative comparison across dates.

    Args:
        bands: 3-D array of shape ``(C, H, W)`` with optical band values.
        method: Correction method.  Currently only ``"dos1"`` is implemented.

    Returns:
        Corrected array with the same shape.  Values are clipped to >= 0.
    """
    if method != "dos1":
        raise NotImplementedError(f"Atmospheric correction method '{method}' not supported")

    corrected = np.empty_like(bands, dtype=np.float32)
    for i in range(bands.shape[0]):
        band = bands[i].astype(np.float64)
        dark_value = np.nanpercentile(band, 1)  # 1st percentile as dark object
        corrected[i] = np.clip(band - dark_value, 0, None).astype(np.float32)

    return corrected


# ---------------------------------------------------------------------------
# Spectral indices
# ---------------------------------------------------------------------------

def compute_spectral_indices(
    bands_dict: Dict[str, np.ndarray],
) -> Dict[str, np.ndarray]:
    """
    Compute common spectral indices used for mining site detection.

    Indices:
        NDVI  = (B8 - B4)  / (B8 + B4)
        NDWI  = (B3 - B8)  / (B3 + B8)
        BSI   = ((B11 + B4) - (B8 + B2)) / ((B11 + B4) + (B8 + B2))
        NBI   = (B11 * B4) / B8
        MNDWI = (B3 - B11) / (B3 + B11)

    Args:
        bands_dict: Mapping of Sentinel-2 band names (``"B2"``, ``"B3"``,
                    ``"B4"``, ``"B8"``, ``"B11"``) to 2-D float arrays.

    Returns:
        Dict mapping index name to 2-D float32 array.
    """
    eps = 1e-10

    B2 = bands_dict["B2"].astype(np.float64)
    B3 = bands_dict["B3"].astype(np.float64)
    B4 = bands_dict["B4"].astype(np.float64)
    B8 = bands_dict["B8"].astype(np.float64)
    B11 = bands_dict["B11"].astype(np.float64)

    ndvi = ((B8 - B4) / (B8 + B4 + eps)).astype(np.float32)
    ndwi = ((B3 - B8) / (B3 + B8 + eps)).astype(np.float32)
    bsi = (((B11 + B4) - (B8 + B2)) / ((B11 + B4) + (B8 + B2) + eps)).astype(np.float32)
    nbi = ((B11 * B4) / (B8 + eps)).astype(np.float32)
    mndwi = ((B3 - B11) / (B3 + B11 + eps)).astype(np.float32)

    return {
        "NDVI": ndvi,
        "NDWI": ndwi,
        "BSI": bsi,
        "NBI": nbi,
        "MNDWI": mndwi,
    }


# ---------------------------------------------------------------------------
# Band stacking
# ---------------------------------------------------------------------------

def stack_bands(bands_list: List[np.ndarray]) -> np.ndarray:
    """
    Stack a list of 2-D band arrays into a single ``(C, H, W)`` array.

    All bands must share the same spatial dimensions.

    Args:
        bands_list: List of 2-D arrays each with shape ``(H, W)``.

    Returns:
        3-D float32 array of shape ``(C, H, W)`` where ``C = len(bands_list)``.
    """
    if not bands_list:
        raise ValueError("bands_list must contain at least one band")

    ref_shape = bands_list[0].shape
    for i, band in enumerate(bands_list):
        if band.shape != ref_shape:
            raise ValueError(
                f"Band {i} has shape {band.shape}, expected {ref_shape}"
            )

    stacked = np.stack([b.astype(np.float32) for b in bands_list], axis=0)
    return stacked


# ---------------------------------------------------------------------------
# Tuilage (Tiling)
# ---------------------------------------------------------------------------

def tile_image(
    image: np.ndarray,
    patch_size: int = 256,
    overlap: int = 32,
) -> List[Tuple[np.ndarray, Tuple[int, int, int, int]]]:
    """
    Tile a multi-band image into overlapping patches.

    Patches at the edges are padded with zeros if necessary.

    Args:
        image: 3-D array of shape ``(C, H, W)``.
        patch_size: Width and height of each square patch.
        overlap: Number of overlapping pixels between adjacent patches.

    Returns:
        List of ``(patch, (y_start, x_start, y_end, x_end))`` tuples.
        Each patch has shape ``(C, patch_size, patch_size)``.
    """
    if image.ndim != 3:
        raise ValueError(f"Expected 3-D image (C, H, W), got {image.ndim}-D")

    C, H, W = image.shape
    step = patch_size - overlap
    if step <= 0:
        raise ValueError("overlap must be less than patch_size")

    patches: List[Tuple[np.ndarray, Tuple[int, int, int, int]]] = []

    for y in range(0, H, step):
        for x in range(0, W, step):
            y_end = min(y + patch_size, H)
            x_end = min(x + patch_size, W)
            y_start = max(y_end - patch_size, 0)
            x_start = max(x_end - patch_size, 0)

            patch = image[:, y_start:y_end, x_start:x_end]

            # Zero-pad if the patch is smaller than patch_size
            ph, pw = patch.shape[1], patch.shape[2]
            if ph < patch_size or pw < patch_size:
                padded = np.zeros((C, patch_size, patch_size), dtype=image.dtype)
                padded[:, :ph, :pw] = patch
                patch = padded

            patches.append((patch, (y_start, x_start, y_end, x_end)))

    return patches


# ---------------------------------------------------------------------------
# Preprocessing SAR (Sentinel-1 GRD)
# ---------------------------------------------------------------------------

class SARPreprocessor:
    """Preprocessing SAR (Sentinel-1 GRD)."""

    @staticmethod
    def calibrate_radiometric(dn_band: np.ndarray) -> np.ndarray:
        """Calibration radiometrique DN -> Sigma0 dB via 10*log10(DN^2)."""
        dn = np.clip(dn_band.astype(np.float64), 1e-10, None)
        sigma0_db = 10.0 * np.log10(dn ** 2)
        return sigma0_db.astype(np.float32)

    @staticmethod
    def lee_filter_7x7(sar_band: np.ndarray) -> np.ndarray:
        """Filtre Lee 7x7 pour reduction du speckle."""
        return apply_lee_filter(sar_band, window_size=7)

    @staticmethod
    def reproject_to_utm(data, src_crs, dst_epsg=32630):
        """Reprojection vers UTM zone 30N (EPSG:32630) pour la Cote d'Ivoire."""
        # Placeholder - en production utiliser rasterio.warp.reproject
        return data


# ---------------------------------------------------------------------------
# Preprocessing optique (Sentinel-2 L2A)
# ---------------------------------------------------------------------------

class OpticalPreprocessor:
    """Preprocessing optique (Sentinel-2 L2A)."""

    @staticmethod
    def apply_cloud_mask(bands_dict, threshold=40):
        """Masque nuage SCL avec seuil de brillance."""
        return cloud_mask_s2(bands_dict, cloud_prob_threshold=threshold / 100.0)

    @staticmethod
    def compute_indices(bands_dict):
        """Calcul des indices spectraux (NDVI, NDWI, BSI, NBI, MNDWI)."""
        return compute_spectral_indices(bands_dict)


# ---------------------------------------------------------------------------
# Construction du stack 12 canaux normalise
# ---------------------------------------------------------------------------

class StackBuilder:
    """Construction du stack 12 canaux normalise."""

    @staticmethod
    def build_12channel_stack(
        sar_vv, sar_vh, sar_vv_prev, sar_vh_prev,
        s2_indices: dict,
        optical_bands: list[np.ndarray] | None = None,
    ) -> np.ndarray:
        """
        Construire le stack 12 canaux normalise min-max.
        Canaux: [B2, B3, B4, B8, B8A, B11, B12, VV, VH, NDVI, NDWI, BSI]
        """
        bands = []
        if optical_bands:
            bands.extend(optical_bands[:7])
        bands.extend([sar_vv, sar_vh])
        for idx_name in ["NDVI", "NDWI", "BSI"]:
            if idx_name in s2_indices:
                bands.append(s2_indices[idx_name])

        # Padding si moins de 12 canaux
        while len(bands) < 12:
            bands.append(np.zeros_like(bands[0]))

        stacked = np.stack(bands[:12], axis=0).astype(np.float32)

        # Normalisation min-max par canal
        for i in range(stacked.shape[0]):
            band = stacked[i]
            bmin, bmax = np.nanmin(band), np.nanmax(band)
            if bmax - bmin > 1e-10:
                stacked[i] = (band - bmin) / (bmax - bmin)

        return stacked


# ---------------------------------------------------------------------------
# Telechargement Sentinel (mode test = patches synthetiques)
# ---------------------------------------------------------------------------

class SentinelDownloader:
    """Telechargement Sentinel (mode test = patches synthetiques)."""

    @staticmethod
    def download_sentinel_data(zone_bbox, date_range, source="test"):
        """
        Telecharger les donnees Sentinel pour une zone.
        Si source='test', utiliser les patches synthetiques du dataset.
        """
        if source == "test":
            # Mode MVP: generer des patches synthetiques
            height, width = 512, 512
            data = np.random.rand(12, height, width).astype(np.float32)
            return data
        # En production: connexion API Copernicus
        raise NotImplementedError("Telechargement reel non implemente pour le MVP")
