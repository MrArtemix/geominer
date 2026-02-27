"""
Routes d'inference pour MineSpot SegFormer.

Endpoints:
    POST /infer         - Inference complete sur un GeoTIFF depuis MinIO
    POST /infer/patch   - Inference sur un patch numpy encode en base64
    GET  /models        - Lister les modeles disponibles
    POST /models/reload - Recharger le modele a chaud sans interruption
"""

from __future__ import annotations

import base64
import io
import logging
import os
import threading
from pathlib import Path
from typing import Any

import numpy as np
import torch
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

# Import des fonctions du modele
from models.minespot_segformer import (
    MineSpotSegFormer,
    load_model,
    predict_patch,
    postprocess_mask,
    warmup_model,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["inference"])

# ---------------------------------------------------------------------------
# Variable globale du modele (initialisee dans le lifespan de l'application)
# ---------------------------------------------------------------------------
_model: MineSpotSegFormer | None = None
_model_lock = threading.Lock()

# Chemin par defaut des poids du modele
DEFAULT_WEIGHTS_PATH = os.getenv(
    "MINESPOT_WEIGHTS_PATH", "/models/best_f1.pth"
)
# Peripherique d'inference
DEVICE = os.getenv("MINESPOT_DEVICE", "cuda" if torch.cuda.is_available() else "cpu")

# Configuration MinIO
MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "minio:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "minioadmin")
MINIO_BUCKET = os.getenv("MINIO_BUCKET_PROCESSED", "processed-satellite")


def get_model() -> MineSpotSegFormer:
    """Recuperer le modele global, lever une erreur si non initialise."""
    global _model
    if _model is None:
        raise HTTPException(
            status_code=503,
            detail="Modele non charge. Veuillez d'abord initialiser ou recharger le modele.",
        )
    return _model


def init_model(weights_path: str | None = None) -> None:
    """Initialiser le modele global au demarrage de l'application."""
    global _model
    path = weights_path or DEFAULT_WEIGHTS_PATH
    if not Path(path).exists():
        logger.warning(f"Fichier de poids introuvable: {path}. Le modele sera en mode stub.")
        return

    logger.info(f"Chargement du modele depuis {path} sur {DEVICE}")
    _model = load_model(path, device=DEVICE)
    warmup_model(_model, device=DEVICE)
    logger.info("Modele charge et prechauffe avec succes")


# ---------------------------------------------------------------------------
# Schemas Pydantic
# ---------------------------------------------------------------------------

class InferenceRequest(BaseModel):
    """Requete d'inference sur un GeoTIFF stocke dans MinIO."""
    minio_key: str = Field(..., description="Cle du GeoTIFF 12 canaux dans le bucket MinIO")


class PatchInferenceRequest(BaseModel):
    """Requete d'inference sur un patch numpy encode en base64."""
    data: str = Field(..., description="Donnees numpy encodees en base64")
    shape: list[int] = Field(
        default=[12, 256, 256],
        description="Forme du tableau numpy [canaux, hauteur, largeur]",
    )


class ModelInfo(BaseModel):
    """Informations sur un modele disponible."""
    name: str
    version: str
    stage: str
    f1_score: float | None = None


class ModelsResponse(BaseModel):
    """Reponse de la liste des modeles."""
    models: list[ModelInfo]


class PatchInferenceResponse(BaseModel):
    """Reponse d'inference sur un patch."""
    probability: str  # base64 du tableau de probabilites
    confidence: float
    shape: list[int]


class ReloadRequest(BaseModel):
    """Requete de rechargement du modele."""
    weights_path: str | None = Field(
        None, description="Chemin optionnel vers les nouveaux poids"
    )


# ---------------------------------------------------------------------------
# Utilitaires MinIO
# ---------------------------------------------------------------------------

def _get_minio_client():
    """Creer un client MinIO."""
    try:
        from minio import Minio
        return Minio(
            MINIO_ENDPOINT,
            access_key=MINIO_ACCESS_KEY,
            secret_key=MINIO_SECRET_KEY,
            secure=False,
        )
    except ImportError:
        raise HTTPException(
            status_code=500,
            detail="Le package 'minio' n'est pas installe.",
        )


def _load_geotiff_from_minio(minio_key: str) -> tuple[np.ndarray, Any]:
    """
    Charger un GeoTIFF depuis MinIO et retourner les donnees et le profil rasterio.

    Retourne:
        (data, profile) ou data est un ndarray (C, H, W) et profile le profil rasterio.
    """
    import rasterio
    import tempfile

    client = _get_minio_client()

    # Telecharger le fichier temporairement
    with tempfile.NamedTemporaryFile(suffix=".tif", delete=False) as tmp:
        tmp_path = tmp.name

    try:
        client.fget_object(MINIO_BUCKET, minio_key, tmp_path)

        with rasterio.open(tmp_path) as src:
            data = src.read().astype(np.float32)  # (C, H, W)
            profile = src.profile.copy()
            transform = src.transform

        return data, {"profile": profile, "transform": transform}

    except Exception as e:
        raise HTTPException(
            status_code=404,
            detail=f"Erreur lors du chargement du GeoTIFF '{minio_key}': {str(e)}",
        )
    finally:
        # Nettoyage du fichier temporaire
        if Path(tmp_path).exists():
            os.unlink(tmp_path)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/infer")
async def run_inference(request: InferenceRequest) -> dict:
    """
    Inference complete sur un GeoTIFF 12 canaux depuis MinIO.

    Charge le GeoTIFF, le decoupe en tuiles, execute l'inference avec le modele,
    vectorise les resultats et retourne un GeoJSON FeatureCollection.
    """
    model = get_model()

    # Charger le GeoTIFF depuis MinIO
    data, meta = _load_geotiff_from_minio(request.minio_key)

    C, H, W = data.shape
    if C < 12:
        raise HTTPException(
            status_code=400,
            detail=f"Le GeoTIFF doit avoir 12 canaux, mais {C} canaux trouves.",
        )

    # Decoupage en tuiles avec chevauchement
    patch_size = 256
    overlap = 32
    step = patch_size - overlap

    prediction = np.zeros((H, W), dtype=np.float32)
    weight_map = np.zeros((H, W), dtype=np.float32)

    for y in range(0, H, step):
        for x in range(0, W, step):
            y_end = min(y + patch_size, H)
            x_end = min(x + patch_size, W)
            y_start = max(y_end - patch_size, 0)
            x_start = max(x_end - patch_size, 0)

            patch = data[:12, y_start:y_end, x_start:x_end]
            ph, pw = patch.shape[1], patch.shape[2]

            # Padding si necessaire
            if ph < patch_size or pw < patch_size:
                padded = np.zeros((12, patch_size, patch_size), dtype=np.float32)
                padded[:, :ph, :pw] = patch
                patch = padded

            # Inference sur le patch
            result = predict_patch(model, patch, device=DEVICE)
            prob_map = result["probability"]

            # Accumuler les predictions (gestion du chevauchement par moyennage)
            prediction[y_start:y_end, x_start:x_end] += prob_map[:ph, :pw]
            weight_map[y_start:y_end, x_start:x_end] += 1.0

    # Moyenner les regions chevauchantes
    weight_map = np.maximum(weight_map, 1.0)
    prediction /= weight_map

    # Vectoriser les resultats en polygones GeoJSON
    transform = meta.get("transform")
    polygons = postprocess_mask(
        prediction, threshold=0.5, min_area=100, transform=transform
    )

    # Construire le GeoJSON FeatureCollection
    features = []
    for poly in polygons:
        features.append({
            "type": "Feature",
            "geometry": poly["geometry"],
            "properties": {
                "class": poly["properties"]["class"],
                "area_px": poly["properties"]["area_px"],
                "confidence": float(prediction[prediction >= 0.5].mean())
                if prediction[prediction >= 0.5].size > 0 else 0.0,
            },
        })

    geojson = {
        "type": "FeatureCollection",
        "features": features,
    }

    logger.info(
        f"Inference terminee: {len(features)} sites detectes "
        f"pour la cle '{request.minio_key}'"
    )

    return geojson


@router.post("/infer/patch", response_model=PatchInferenceResponse)
async def infer_patch(request: PatchInferenceRequest) -> PatchInferenceResponse:
    """
    Inference sur un patch numpy encode en base64.

    Decode le tableau numpy, execute predict_patch, retourne la carte de
    probabilite en base64 et le score de confiance.
    """
    model = get_model()

    try:
        # Decoder les donnees base64 en tableau numpy
        raw_bytes = base64.b64decode(request.data)
        patch = np.frombuffer(raw_bytes, dtype=np.float32).reshape(request.shape)
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Erreur de decodage du patch numpy: {str(e)}",
        )

    # Verifier la forme du patch
    if len(request.shape) != 3 or request.shape[0] != 12:
        raise HTTPException(
            status_code=400,
            detail=f"Le patch doit avoir la forme [12, H, W], recu {request.shape}",
        )

    # Executer l'inference
    result = predict_patch(model, patch, device=DEVICE)

    # Encoder la carte de probabilite en base64
    prob_bytes = result["probability"].astype(np.float32).tobytes()
    prob_b64 = base64.b64encode(prob_bytes).decode("utf-8")

    return PatchInferenceResponse(
        probability=prob_b64,
        confidence=result["confidence"],
        shape=list(result["probability"].shape),
    )


@router.get("/models", response_model=ModelsResponse)
async def list_models() -> ModelsResponse:
    """
    Lister les modeles disponibles.

    Interroge le MLflow Model Registry si disponible, sinon retourne
    les modeles trouves sur le systeme de fichiers.
    """
    models_info: list[ModelInfo] = []

    # Tentative via MLflow Model Registry
    try:
        import mlflow
        from mlflow.tracking import MlflowClient

        client = MlflowClient()
        registered_models = client.search_registered_models(
            filter_string="name='MineSpotSegFormer'"
        )

        for rm in registered_models:
            for mv in rm.latest_versions:
                # Recuperer le F1 score depuis les metriques du run
                f1_score = None
                try:
                    run = client.get_run(mv.run_id)
                    f1_score = run.data.metrics.get("best_val_f1")
                except Exception:
                    pass

                models_info.append(ModelInfo(
                    name=mv.name,
                    version=mv.version,
                    stage=mv.current_stage,
                    f1_score=f1_score,
                ))

        if models_info:
            return ModelsResponse(models=models_info)

    except Exception as e:
        logger.info(f"MLflow non disponible, repli sur le systeme de fichiers: {e}")

    # Repli sur le systeme de fichiers
    models_dir = Path("/models")
    if models_dir.exists():
        for weight_file in sorted(models_dir.glob("*.pth")) + sorted(models_dir.glob("*.pt")):
            models_info.append(ModelInfo(
                name=weight_file.stem,
                version="local",
                stage="filesystem",
                f1_score=None,
            ))

    # Ajouter le modele par defaut s'il existe
    default_path = Path(DEFAULT_WEIGHTS_PATH)
    if default_path.exists() and not any(m.name == default_path.stem for m in models_info):
        models_info.append(ModelInfo(
            name=default_path.stem,
            version="default",
            stage="active",
            f1_score=None,
        ))

    return ModelsResponse(models=models_info)


@router.post("/models/reload")
async def reload_model(request: ReloadRequest | None = None) -> dict:
    """
    Recharger le modele a chaud sans interruption de service.

    Charge les nouveaux poids, remplace la reference globale de maniere atomique.
    """
    global _model

    weights_path = DEFAULT_WEIGHTS_PATH
    if request and request.weights_path:
        weights_path = request.weights_path

    if not Path(weights_path).exists():
        raise HTTPException(
            status_code=404,
            detail=f"Fichier de poids introuvable: {weights_path}",
        )

    try:
        # Charger le nouveau modele dans une variable separee
        logger.info(f"Rechargement du modele depuis {weights_path}")
        new_model = load_model(weights_path, device=DEVICE)
        warmup_model(new_model, device=DEVICE)

        # Remplacement atomique de la reference globale avec verrou
        with _model_lock:
            _model = new_model

        logger.info("Modele recharge avec succes")

        return {
            "status": "succes",
            "message": f"Modele recharge depuis {weights_path}",
            "device": DEVICE,
        }

    except Exception as e:
        logger.error(f"Echec du rechargement du modele: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Echec du rechargement du modele: {str(e)}",
        )
