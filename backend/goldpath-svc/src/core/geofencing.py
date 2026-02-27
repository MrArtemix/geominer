"""
Module de geofencing pour le controle des zones minieres autorisees.

Verification de la position GPS d'un mineur par rapport a son polygone
de zone autorisee. Declenchement d'alertes via alertflow-svc en cas
de violation de perimetre.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

import httpx
import structlog
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from shapely.geometry import Point, shape
from shapely import wkt as shapely_wkt
from sqlalchemy import text
from sqlalchemy.orm import Session

from src.config import settings
from src.main import get_db

logger = structlog.get_logger("goldpath.geofencing")

router = APIRouter(prefix="/geofencing", tags=["geofencing"])


# ---------------------------------------------------------------------------
# Schemas Pydantic
# ---------------------------------------------------------------------------

class GeofenceCheckRequest(BaseModel):
    """Requete de verification de position dans la zone autorisee."""
    miner_id: uuid.UUID = Field(..., description="Identifiant du mineur")
    lat: float = Field(..., description="Latitude de la position GPS")
    lon: float = Field(..., description="Longitude de la position GPS")


class GeofenceCheckResponse(BaseModel):
    """Resultat de la verification de geofencing."""
    miner_id: uuid.UUID
    inside: bool
    distance_m: float
    lat: float
    lon: float
    message: str


# ---------------------------------------------------------------------------
# Fonction principale de verification
# ---------------------------------------------------------------------------

def check_position_in_zone(
    db: Session,
    miner_id: uuid.UUID,
    lat: float,
    lon: float,
) -> dict:
    """
    Verifier si une position GPS se trouve dans la zone autorisee d'un mineur.

    Utilise PostGIS ST_Contains pour la verification d'inclusion et
    ST_Distance pour le calcul de distance en cas de sortie de zone.

    Retourne:
        dict avec les cles 'inside' (bool) et 'distance_m' (float).
              distance_m = 0 si le point est dans la zone,
              sinon la distance en metres jusqu'au bord le plus proche.
    """
    # Recuperer le polygone de zone du mineur
    row = db.execute(
        text("""
            SELECT ST_AsText(zone_polygon) AS zone_wkt
            FROM miners_registry
            WHERE id = :miner_id
        """),
        {"miner_id": str(miner_id)},
    ).fetchone()

    if not row:
        raise HTTPException(
            status_code=404,
            detail=f"Mineur {miner_id} non trouve dans le registre.",
        )

    if not row.zone_wkt:
        raise HTTPException(
            status_code=400,
            detail=f"Aucune zone autorisee definie pour le mineur {miner_id}.",
        )

    # Parser le polygone avec shapely
    zone_polygon = shapely_wkt.loads(row.zone_wkt)
    point = Point(lon, lat)  # Shapely utilise (x=lon, y=lat)

    # Verifier si le point est dans le polygone
    inside = zone_polygon.contains(point)

    if inside:
        distance_m = 0.0
    else:
        # Calculer la distance en degres, puis convertir approximativement en metres
        # (1 degre ~ 111 320 metres a l'equateur, ajuste selon la latitude)
        import math
        distance_deg = zone_polygon.exterior.distance(point)
        # Facteur de conversion approximatif a la latitude donnee
        meters_per_deg = 111_320 * math.cos(math.radians(lat))
        distance_m = round(distance_deg * meters_per_deg, 2)

    return {
        "inside": inside,
        "distance_m": distance_m,
    }


# ---------------------------------------------------------------------------
# Alerte via alertflow-svc
# ---------------------------------------------------------------------------

async def _create_geofencing_alert(
    miner_id: uuid.UUID,
    lat: float,
    lon: float,
    distance_m: float,
) -> None:
    """
    Creer une alerte de violation de geofencing via alertflow-svc.

    L'alerte est de severite MEDIUM et de type GEOFENCING_VIOLATION.
    """
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                f"{settings.alertflow_url}/alerts",
                json={
                    "id": str(uuid.uuid4()),
                    "type": "GEOFENCING_VIOLATION",
                    "severity": "MEDIUM",
                    "title": f"Violation de geofencing - Mineur {miner_id}",
                    "description": (
                        f"Le mineur {miner_id} a ete detecte a {distance_m:.1f}m "
                        f"en dehors de sa zone autorisee (lat={lat}, lon={lon})."
                    ),
                    "metadata": {
                        "miner_id": str(miner_id),
                        "latitude": lat,
                        "longitude": lon,
                        "distance_meters": distance_m,
                    },
                    "created_at": datetime.now(timezone.utc).isoformat(),
                },
            )
            if response.status_code in (200, 201):
                logger.info(
                    "alerte_geofencing_creee",
                    miner_id=str(miner_id),
                    distance_m=distance_m,
                )
            else:
                logger.warning(
                    "erreur_creation_alerte",
                    miner_id=str(miner_id),
                    status_code=response.status_code,
                )
    except Exception as exc:
        logger.error(
            "echec_communication_alertflow",
            miner_id=str(miner_id),
            erreur=str(exc),
        )


# ---------------------------------------------------------------------------
# POST /geofencing/check - Verifier la position d'un mineur
# ---------------------------------------------------------------------------

@router.post("/check", response_model=GeofenceCheckResponse)
async def check_geofence(
    body: GeofenceCheckRequest,
    db: Session = Depends(get_db),
):
    """
    Verifier si un mineur se trouve dans sa zone autorisee.

    Si le mineur est en dehors de sa zone, une alerte de type
    GEOFENCING_VIOLATION est automatiquement creee via alertflow-svc.
    """
    result = check_position_in_zone(db, body.miner_id, body.lat, body.lon)

    inside = result["inside"]
    distance_m = result["distance_m"]

    if inside:
        message = "Le mineur se trouve dans sa zone autorisee."
    else:
        message = (
            f"ALERTE : Le mineur se trouve a {distance_m:.1f}m "
            f"en dehors de sa zone autorisee."
        )
        # Creer une alerte de violation de geofencing
        await _create_geofencing_alert(
            miner_id=body.miner_id,
            lat=body.lat,
            lon=body.lon,
            distance_m=distance_m,
        )
        logger.warning(
            "violation_geofencing_detectee",
            miner_id=str(body.miner_id),
            lat=body.lat,
            lon=body.lon,
            distance_m=distance_m,
        )

    return GeofenceCheckResponse(
        miner_id=body.miner_id,
        inside=inside,
        distance_m=distance_m,
        lat=body.lat,
        lon=body.lon,
        message=message,
    )
