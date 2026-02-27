"""Routes REST enrichies pour les sites miniers (async + PostGIS)."""

from __future__ import annotations

import json
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from ...db import crud
from ...db.schemas.site import (
    SiteCreate,
    SiteFeature,
    SiteFeatureCollection,
    SiteStatusUpdate,
)
from ...db.session import get_db

router = APIRouter(prefix="/sites", tags=["sites"])


def _row_to_feature(row: dict) -> SiteFeature:
    """Convertir une ligne DB en GeoJSON Feature."""
    geom = row.get("geometry", {})
    return SiteFeature(
        id=row["id"],
        geometry=geom,
        properties={
            "site_code": row["site_code"],
            "area_ha": row.get("area_ha"),
            "h3_index_r7": row.get("h3_index_r7"),
            "confidence_ai": row.get("confidence_ai"),
            "detected_at": row.get("detected_at"),
            "satellite_date": row.get("satellite_date"),
            "sat_source": row.get("sat_source"),
            "status": row.get("status", "DETECTED"),
            "blockchain_txid": row.get("blockchain_txid"),
            "ipfs_cid": row.get("ipfs_cid"),
            "region": row.get("region"),
            "department": row.get("department"),
            "sous_prefecture": row.get("sous_prefecture"),
            "gold_estim_ton": row.get("gold_estim_ton"),
            "notes": row.get("notes"),
        },
    )


# ---------------------------------------------------------------------------
# GET /sites - Liste paginee avec filtres
# ---------------------------------------------------------------------------

@router.get("", response_model=SiteFeatureCollection)
async def list_sites(
    status_filter: str | None = Query(None, alias="status"),
    region: str | None = None,
    confidence_min: float | None = Query(None, ge=0, le=1),
    date_from: str | None = Query(None, description="ISO 8601"),
    date_to: str | None = Query(None, description="ISO 8601"),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """Lister les sites miniers avec filtres optionnels."""
    from datetime import datetime

    df = datetime.fromisoformat(date_from) if date_from else None
    dt = datetime.fromisoformat(date_to) if date_to else None

    rows = await crud.get_sites(
        db,
        status=status_filter,
        region=region,
        confidence_min=confidence_min,
        date_from=df,
        date_to=dt,
        limit=limit,
        offset=offset,
    )

    features = [_row_to_feature(row) for row in rows]
    total = await crud.count_sites(db, status=status_filter)

    return SiteFeatureCollection(features=features, total_count=total)


# ---------------------------------------------------------------------------
# GET /sites/stats - Statistiques globales
# ---------------------------------------------------------------------------

@router.get("/stats")
async def get_stats(db: AsyncSession = Depends(get_db)):
    """Statistiques globales des sites miniers."""
    return await crud.get_site_stats(db)


# ---------------------------------------------------------------------------
# GET /sites/bbox - Recherche par bounding box
# ---------------------------------------------------------------------------

@router.get("/bbox", response_model=SiteFeatureCollection)
async def get_sites_bbox(
    min_lon: float = Query(..., ge=-180, le=180),
    min_lat: float = Query(..., ge=-90, le=90),
    max_lon: float = Query(..., ge=-180, le=180),
    max_lat: float = Query(..., ge=-90, le=90),
    limit: int = Query(100, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
):
    """Rechercher les sites dans une bounding box."""
    rows = await crud.get_sites_by_bbox(db, min_lon, min_lat, max_lon, max_lat, limit)
    features = [_row_to_feature(row) for row in rows]
    return SiteFeatureCollection(features=features, total_count=len(features))


# ---------------------------------------------------------------------------
# GET /risk-map/h3 - Heatmap H3 des risques
# ---------------------------------------------------------------------------

@router.get("/risk-map/h3")
async def get_risk_map_h3(db: AsyncSession = Depends(get_db)):
    """Carte de risque H3 pour la heatmap. Donnees cachees Redis 24h cote gateway."""
    return await crud.get_h3_risk_map(db)


# ---------------------------------------------------------------------------
# GET /sites/{site_id} - Detail d'un site
# ---------------------------------------------------------------------------

@router.get("/{site_id}")
async def get_site(site_id: UUID, db: AsyncSession = Depends(get_db)):
    """Recuperer les details complets d'un site minier."""
    row = await crud.get_site_by_id(db, site_id)
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Site non trouve")
    return _row_to_feature(row)


# ---------------------------------------------------------------------------
# POST /sites - Creer un site
# ---------------------------------------------------------------------------

@router.post("", status_code=status.HTTP_201_CREATED)
async def create_site(payload: SiteCreate, db: AsyncSession = Depends(get_db)):
    """Creer un nouveau site minier detecte."""
    site_data = {
        "site_code": payload.site_code,
        "geometry": payload.geometry.model_dump(),
        "h3_index_r7": payload.h3_index_r7,
        "confidence_ai": payload.confidence_ai,
        "satellite_date": payload.satellite_date,
        "sat_source": payload.sat_source,
        "region": payload.region,
        "department": payload.department,
        "sous_prefecture": payload.sous_prefecture,
        "notes": payload.notes,
    }
    site_data = {k: v for k, v in site_data.items() if v is not None}
    result = await crud.create_site(db, site_data)
    return result


# ---------------------------------------------------------------------------
# PATCH /sites/{site_id}/status - Mettre a jour le statut
# ---------------------------------------------------------------------------

@router.patch("/{site_id}/status")
async def update_status(
    site_id: UUID,
    payload: SiteStatusUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Mettre a jour le statut d'un site avec historique JSONB."""
    result = await crud.update_site_status(
        db, site_id, payload.status.value, payload.notes
    )
    if not result:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Site non trouve")
    return result


# ---------------------------------------------------------------------------
# POST /sites/{site_id}/check-recurrence - Detection de recurrence
# ---------------------------------------------------------------------------

@router.post("/{site_id}/check-recurrence")
async def check_recurrence(
    site_id: UUID,
    days: int = Query(90, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
):
    """Verifier si un site demantele a recidive dans la meme zone."""
    recurred = await crud.check_recurrence(db, site_id, days)
    return {"site_id": str(site_id), "recurred": recurred, "check_days": days}


# ---------------------------------------------------------------------------
# GET /sites/h3/{h3_index} - Sites par cellule H3
# ---------------------------------------------------------------------------

@router.get("/h3/{h3_index}")
async def get_sites_by_h3(
    h3_index: str,
    db: AsyncSession = Depends(get_db),
):
    """Recuperer les sites dans une cellule H3."""
    rows = await crud.get_sites_by_h3(db, h3_index)
    return {"h3_index": h3_index, "count": len(rows), "sites": rows}
