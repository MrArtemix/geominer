"""
Routes REST enrichies pour AquaGuard IoT - capteurs et lectures.

Fournit : liste capteurs, lectures avec filtres, agregation temporelle,
carte GeoJSON, alertes actives, et endpoint interne d'enregistrement.
"""

from __future__ import annotations

import os
from datetime import datetime
from typing import Any

import structlog
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import create_engine, text

log = structlog.get_logger()

# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://geominer:geominer2026@postgres:5432/geominerdb",
)
engine = create_engine(DATABASE_URL, pool_pre_ping=True, pool_size=5)

# ---------------------------------------------------------------------------
# Schemas de reponse
# ---------------------------------------------------------------------------

class SensorOut(BaseModel):
    sensor_id: str
    last_seen: datetime | None = None
    reading_count: int = 0
    parameters: list[str] = []


class ReadingOut(BaseModel):
    id: int
    sensor_id: str
    parameter: str
    value: float
    unit: str
    timestamp: datetime
    battery: float | None = None
    lat: float | None = None
    lon: float | None = None


class AggregateOut(BaseModel):
    bucket: str
    parameter: str
    avg_value: float
    min_value: float
    max_value: float
    count: int


class SensorGeoJSON(BaseModel):
    type: str = "FeatureCollection"
    features: list[dict[str, Any]]


class ActiveAlertOut(BaseModel):
    id: str
    sensor_id: str
    parameter: str
    value: float
    severity: str
    title: str
    created_at: datetime


class SensorRegisterRequest(BaseModel):
    sensor_id: str
    name: str | None = None
    lat: float | None = None
    lon: float | None = None


class LatestReadingOut(BaseModel):
    parameter: str
    value: float
    unit: str
    timestamp: datetime


# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------
router = APIRouter(prefix="/sensors", tags=["sensors"])


@router.get("", response_model=list[SensorOut])
async def list_sensors():
    """Lister tous les capteurs connus avec leur derniere activite."""
    query = text("""
        SELECT
            sensor_id,
            MAX(timestamp) AS last_seen,
            COUNT(*) AS reading_count,
            ARRAY_AGG(DISTINCT parameter) AS parameters
        FROM sensor_readings
        GROUP BY sensor_id
        ORDER BY sensor_id
    """)
    with engine.connect() as conn:
        rows = conn.execute(query).mappings().all()

    return [
        SensorOut(
            sensor_id=row["sensor_id"],
            last_seen=row["last_seen"],
            reading_count=row["reading_count"],
            parameters=row["parameters"] or [],
        )
        for row in rows
    ]


@router.get("/{sensor_id}/readings", response_model=list[ReadingOut])
async def get_readings(
    sensor_id: str,
    hours: int | None = Query(None, ge=1, le=720, description="Dernieres N heures"),
    parameter: str | None = Query(None, description="Filtrer par parametre"),
    start: datetime | None = Query(None, description="Debut (ISO 8601)"),
    end: datetime | None = Query(None, description="Fin (ISO 8601)"),
    limit: int = Query(100, ge=1, le=5000),
):
    """Lectures d'un capteur avec filtres temporels et par parametre."""
    clauses = ["sensor_id = :sensor_id"]
    params: dict[str, Any] = {"sensor_id": sensor_id, "limit": limit}

    if hours is not None:
        clauses.append(f"timestamp >= NOW() - INTERVAL '{hours} hours'")
    if start is not None:
        clauses.append("timestamp >= :start")
        params["start"] = start
    if end is not None:
        clauses.append("timestamp <= :end")
        params["end"] = end
    if parameter is not None:
        clauses.append("parameter = :parameter")
        params["parameter"] = parameter

    where = " AND ".join(clauses)
    query = text(f"""
        SELECT id, sensor_id, parameter, value, unit, timestamp, battery, lat, lon
        FROM sensor_readings
        WHERE {where}
        ORDER BY timestamp DESC
        LIMIT :limit
    """)

    with engine.connect() as conn:
        rows = conn.execute(query, params).mappings().all()

    if not rows:
        raise HTTPException(
            status_code=404,
            detail=f"Aucune lecture trouvee pour le capteur {sensor_id}",
        )

    return [ReadingOut(**row) for row in rows]


@router.get("/{sensor_id}/readings/aggregate", response_model=list[AggregateOut])
async def get_readings_aggregate(
    sensor_id: str,
    interval: str = Query("1h", description="Intervalle: 1h, 6h, 1d, 7d"),
    parameter: str | None = Query(None, description="Filtrer par parametre"),
    hours: int = Query(24, ge=1, le=720, description="Periode en heures"),
):
    """Lectures agregees par intervalle (time_bucket TimescaleDB)."""
    # Mapper les intervalles utilisateur vers des intervalles PostgreSQL
    interval_map = {
        "1h": "1 hour",
        "6h": "6 hours",
        "1d": "1 day",
        "7d": "7 days",
    }
    pg_interval = interval_map.get(interval, "1 hour")

    clauses = ["sensor_id = :sensor_id", f"timestamp >= NOW() - INTERVAL '{hours} hours'"]
    params: dict[str, Any] = {"sensor_id": sensor_id}

    if parameter:
        clauses.append("parameter = :parameter")
        params["parameter"] = parameter

    where = " AND ".join(clauses)

    # Utiliser time_bucket de TimescaleDB si disponible, sinon date_trunc
    query = text(f"""
        SELECT
            date_trunc('hour', timestamp)::text AS bucket,
            parameter,
            AVG(value) AS avg_value,
            MIN(value) AS min_value,
            MAX(value) AS max_value,
            COUNT(*) AS count
        FROM sensor_readings
        WHERE {where}
        GROUP BY bucket, parameter
        ORDER BY bucket DESC
    """)

    with engine.connect() as conn:
        rows = conn.execute(query, params).mappings().all()

    return [AggregateOut(**row) for row in rows]


@router.get("/{sensor_id}/latest", response_model=list[LatestReadingOut])
async def get_latest(sensor_id: str):
    """Derniere lecture pour chaque parametre du capteur."""
    query = text("""
        SELECT DISTINCT ON (parameter)
            parameter, value, unit, timestamp
        FROM sensor_readings
        WHERE sensor_id = :sensor_id
        ORDER BY parameter, timestamp DESC
    """)

    with engine.connect() as conn:
        rows = conn.execute(query, {"sensor_id": sensor_id}).mappings().all()

    if not rows:
        raise HTTPException(
            status_code=404,
            detail=f"Aucune lecture trouvee pour le capteur {sensor_id}",
        )

    return [LatestReadingOut(**row) for row in rows]


@router.get("/map", response_model=SensorGeoJSON)
async def sensors_map():
    """Carte GeoJSON de tous les capteurs avec leur derniere position."""
    query = text("""
        SELECT DISTINCT ON (sensor_id)
            sensor_id, lat, lon, timestamp,
            parameter, value, unit
        FROM sensor_readings
        WHERE lat IS NOT NULL AND lon IS NOT NULL
        ORDER BY sensor_id, timestamp DESC
    """)

    with engine.connect() as conn:
        rows = conn.execute(query).mappings().all()

    features = []
    for row in rows:
        features.append({
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [float(row["lon"]), float(row["lat"])],
            },
            "properties": {
                "sensor_id": row["sensor_id"],
                "last_seen": row["timestamp"].isoformat() if row["timestamp"] else None,
                "last_parameter": row["parameter"],
                "last_value": float(row["value"]),
                "last_unit": row["unit"],
            },
        })

    return SensorGeoJSON(features=features)


@router.get("/alerts/active", response_model=list[ActiveAlertOut])
async def active_sensor_alerts():
    """Alertes actives (non acquittees) liees aux capteurs."""
    query = text("""
        SELECT id::text,
               COALESCE(metadata->>'sensor_id', '') AS sensor_id,
               COALESCE(metadata->>'parameter', '') AS parameter,
               COALESCE((metadata->>'value')::float, 0) AS value,
               severity, title, created_at
        FROM alerts
        WHERE alert_type IN ('WATER_CONTAMINATION', 'WATER_QUALITY')
          AND acknowledged_at IS NULL
          AND COALESCE((metadata->>'is_deleted')::boolean, false) = false
        ORDER BY created_at DESC
        LIMIT 50
    """)

    with engine.connect() as conn:
        rows = conn.execute(query).mappings().all()

    return [ActiveAlertOut(**row) for row in rows]


@router.post("/internal/sensor", status_code=201)
async def register_sensor(payload: SensorRegisterRequest):
    """
    Endpoint interne pour enregistrer un nouveau capteur.
    Insere une lecture initiale de type 'heartbeat' pour le referencement.
    """
    insert = text("""
        INSERT INTO sensor_readings
            (sensor_id, parameter, value, unit, timestamp, lat, lon)
        VALUES
            (:sensor_id, 'heartbeat', 0, 'status', NOW(), :lat, :lon)
    """)
    with engine.begin() as conn:
        conn.execute(
            insert,
            {
                "sensor_id": payload.sensor_id,
                "lat": payload.lat,
                "lon": payload.lon,
            },
        )

    log.info("capteur_enregistre", sensor_id=payload.sensor_id)
    return {"sensor_id": payload.sensor_id, "status": "registered"}
