from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from ...db import crud
from ...db.schemas.site import (
    SiteCreate,
    SiteFeature,
    SiteFeatureCollection,
    SiteStatusUpdate,
)
from ...db.session import get_db

router = APIRouter(prefix="/sites", tags=["sites"])


@router.get("", response_model=SiteFeatureCollection)
def list_sites(
    status_filter: str | None = Query(None, alias="status"),
    region: str | None = None,
    bbox: str | None = Query(None, description="min_lon,min_lat,max_lon,max_lat"),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    if bbox:
        parts = bbox.split(",")
        if len(parts) != 4:
            raise HTTPException(400, "bbox must be min_lon,min_lat,max_lon,max_lat")
        min_lon, min_lat, max_lon, max_lat = map(float, parts)
        rows = crud.get_sites_by_bbox(db, min_lon, min_lat, max_lon, max_lat, limit)
    else:
        rows = crud.get_sites(
            db, status=status_filter, region=region, limit=limit, offset=offset
        )

    features = []
    for row in rows:
        geom = row.get("geometry", {})
        features.append(
            SiteFeature(
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
                    "region": row.get("region"),
                    "department": row.get("department"),
                    "sous_prefecture": row.get("sous_prefecture"),
                },
            )
        )

    total = crud.count_sites(db, status=status_filter)
    return SiteFeatureCollection(features=features, total_count=total)


@router.get("/{site_id}")
def get_site(site_id: UUID, db: Session = Depends(get_db)):
    row = crud.get_site_by_id(db, site_id)
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Site not found")
    return SiteFeature(
        id=row["id"],
        geometry=row.get("geometry", {}),
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
            "notes": row.get("notes"),
        },
    )


@router.post("", status_code=status.HTTP_201_CREATED)
def create_site(payload: SiteCreate, db: Session = Depends(get_db)):
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
    result = crud.create_site(db, site_data)
    return result


@router.patch("/{site_id}/status")
def update_status(
    site_id: UUID,
    payload: SiteStatusUpdate,
    db: Session = Depends(get_db),
):
    result = crud.update_site_status(
        db, site_id, payload.status.value, payload.notes
    )
    if not result:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Site not found")
    return result


@router.get("/h3/{h3_index}")
def get_sites_by_h3(h3_index: str, db: Session = Depends(get_db)):
    rows = crud.get_sites_by_h3(db, h3_index)
    return {"h3_index": h3_index, "count": len(rows), "sites": rows}
