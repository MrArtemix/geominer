"""
Routes d'analyse d'images pour MineSpot AI.

Endpoints :
    POST /analysis/batch          - Lancer analyse batch d'images
    GET  /analysis/{image_id}/similar - Recherche images similaires
    GET  /analysis/{image_id}/changes - Detection changements temporels
    GET  /analysis/{image_id}/quality - Evaluation qualite image
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from ...core.image_analysis import (
    ImageQuality,
    get_analysis_system,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/analysis", tags=["analysis"])


# ---------------------------------------------------------------------------
# Schemas Pydantic
# ---------------------------------------------------------------------------

class BatchAnalysisRequest(BaseModel):
    """Requete d'analyse batch d'images."""
    bbox: list[float] | None = Field(
        None,
        description="Emprise spatiale [min_lon, min_lat, max_lon, max_lat]",
        min_length=4,
        max_length=4,
    )
    date_from: datetime | None = Field(
        None, description="Date de debut du filtrage temporel"
    )
    date_to: datetime | None = Field(
        None, description="Date de fin du filtrage temporel"
    )
    limit: int = Field(
        100, ge=1, le=1000,
        description="Nombre maximum d'images a analyser",
    )


class QualityResponse(BaseModel):
    """Reponse d'evaluation de qualite."""
    image_id: str
    sharpness: float
    noise: float
    contrast: float
    brightness: float
    entropy: float
    colorfulness: float
    overall_score: float


class SimilarImageResponse(BaseModel):
    """Reponse de recherche d'images similaires."""
    image_id: str
    distance: float
    similarity_score: float


class ChangeRegion(BaseModel):
    """Region de changement detectee."""
    bbox: list[int]
    area_pixels: int
    centroid: list[int]


class ChangeDetectionResponse(BaseModel):
    """Reponse de detection de changements."""
    image_id_before: str
    image_id_after: str
    change_percentage: float
    changed_regions: list[ChangeRegion]
    timestamp_before: str
    timestamp_after: str


class BatchAnalysisResultItem(BaseModel):
    """Resultat d'analyse pour une image."""
    image_id: str
    quality_score: float
    analysis_timestamp: str


class BatchAnalysisResponse(BaseModel):
    """Reponse d'analyse batch."""
    total_analyzed: int
    results: list[BatchAnalysisResultItem]


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/batch", response_model=BatchAnalysisResponse)
async def run_batch_analysis(
    request: BatchAnalysisRequest,
) -> BatchAnalysisResponse:
    """
    Lancer une analyse batch d'images satellite.

    Filtre les images par emprise spatiale et periode temporelle,
    puis execute l'analyse (features, qualite, anomalies) sur chaque image.
    """
    system = get_analysis_system()

    try:
        await system.initialize()
    except Exception as e:
        raise HTTPException(
            status_code=503,
            detail=f"Erreur initialisation du systeme d'analyse : {str(e)}",
        )

    bbox = None
    if request.bbox:
        bbox = (
            request.bbox[0], request.bbox[1],
            request.bbox[2], request.bbox[3],
        )

    try:
        results = await system.analyze_batch(
            bbox=bbox,
            date_from=request.date_from,
            date_to=request.date_to,
            limit=request.limit,
        )
    except Exception as e:
        logger.exception("Erreur analyse batch")
        raise HTTPException(
            status_code=500,
            detail=f"Erreur lors de l'analyse batch : {str(e)}",
        )

    items = [
        BatchAnalysisResultItem(
            image_id=r.image_id,
            quality_score=r.quality_score,
            analysis_timestamp=r.analysis_timestamp,
        )
        for r in results
    ]

    return BatchAnalysisResponse(
        total_analyzed=len(items),
        results=items,
    )


@router.get(
    "/{image_id}/similar",
    response_model=list[SimilarImageResponse],
)
async def find_similar_images(
    image_id: str,
    top_k: int = Query(10, ge=1, le=100, description="Nombre de resultats"),
) -> list[SimilarImageResponse]:
    """
    Rechercher les images les plus similaires a une image donnee.

    Utilise l'index FAISS (distance L2) pour trouver les voisins les
    plus proches dans l'espace des features CNN.
    """
    system = get_analysis_system()

    try:
        await system.initialize()
    except Exception as e:
        raise HTTPException(
            status_code=503,
            detail=f"Erreur initialisation : {str(e)}",
        )

    results = await system.find_similar_images(
        image_id=image_id,
        top_k=top_k,
    )

    return [SimilarImageResponse(**r) for r in results]


@router.get(
    "/{image_id}/changes",
    response_model=ChangeDetectionResponse | None,
)
async def detect_image_changes(
    image_id: str,
) -> ChangeDetectionResponse | None:
    """
    Detecter les changements entre une image et sa precedente temporelle.

    Compare l'image specifiee avec la derniere image du meme site
    (proximite spatiale) pour identifier les zones de changement.
    """
    system = get_analysis_system()

    try:
        await system.initialize()
    except Exception as e:
        raise HTTPException(
            status_code=503,
            detail=f"Erreur initialisation : {str(e)}",
        )

    result = await system.detect_temporal_changes(image_id=image_id)

    if result is None:
        raise HTTPException(
            status_code=404,
            detail=(
                f"Pas de changement detectable pour l'image {image_id}. "
                "Aucune image precedente trouvee ou images indisponibles."
            ),
        )

    regions = [
        ChangeRegion(**r) for r in result.changed_regions
    ]

    return ChangeDetectionResponse(
        image_id_before=result.image_id_before,
        image_id_after=result.image_id_after,
        change_percentage=result.change_percentage,
        changed_regions=regions,
        timestamp_before=result.timestamp_before,
        timestamp_after=result.timestamp_after,
    )


@router.get(
    "/{image_id}/quality",
    response_model=QualityResponse,
)
async def evaluate_image_quality(
    image_id: str,
) -> QualityResponse:
    """
    Evaluer la qualite d'une image satellite.

    Retourne les metriques : sharpness, noise, contrast,
    brightness, entropy, colorfulness et un score global.
    """
    system = get_analysis_system()

    try:
        await system.initialize()
    except Exception as e:
        raise HTTPException(
            status_code=503,
            detail=f"Erreur initialisation : {str(e)}",
        )

    # Charger l'image
    image = await system._load_image_from_minio(image_id)
    if image is None:
        raise HTTPException(
            status_code=404,
            detail=f"Image {image_id} introuvable dans le stockage.",
        )

    quality = system.evaluate_quality(image)

    return QualityResponse(
        image_id=image_id,
        sharpness=quality.sharpness,
        noise=quality.noise,
        contrast=quality.contrast,
        brightness=quality.brightness,
        entropy=quality.entropy,
        colorfulness=quality.colorfulness,
        overall_score=quality.overall_score,
    )
