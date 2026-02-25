"""
Sensor REST endpoints for the AquaGuard IoT service.

Provides read access to registered sensors and their telemetry readings
stored in the ``sensor_readings`` PostgreSQL table.
"""

from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Optional

import structlog
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import create_engine, text

log = structlog.get_logger()

# ---------------------------------------------------------------------------
# Database connection
# ---------------------------------------------------------------------------
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:postgres@localhost:5432/geominer",
)
engine = create_engine(DATABASE_URL, pool_pre_ping=True)

# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------

class SensorOut(BaseModel):
    sensor_id: str
    last_seen: Optional[datetime] = None
    reading_count: int = 0


class ReadingOut(BaseModel):
    id: int
    sensor_id: str
    parameter: str
    value: float
    unit: str
    timestamp: datetime
    battery: Optional[float] = None
    lat: Optional[float] = None
    lon: Optional[float] = None


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
    """Return all known sensors with their last-seen timestamp and reading count."""
    query = text("""
        SELECT
            sensor_id,
            MAX(timestamp) AS last_seen,
            COUNT(*)       AS reading_count
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
        )
        for row in rows
    ]


@router.get("/{sensor_id}/readings", response_model=list[ReadingOut])
async def get_readings(
    sensor_id: str,
    start: Optional[datetime] = Query(None, description="Start of time range (ISO 8601)"),
    end: Optional[datetime] = Query(None, description="End of time range (ISO 8601)"),
    parameter: Optional[str] = Query(None, description="Filter by parameter name"),
    limit: int = Query(100, ge=1, le=1000, description="Max rows to return"),
):
    """Return recent readings for a sensor with optional time-range and parameter filters."""

    clauses = ["sensor_id = :sensor_id"]
    params: dict = {"sensor_id": sensor_id, "limit": limit}

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
        raise HTTPException(status_code=404, detail=f"No readings found for sensor {sensor_id}")

    return [ReadingOut(**row) for row in rows]


@router.get("/{sensor_id}/latest", response_model=list[LatestReadingOut])
async def get_latest(sensor_id: str):
    """Return the most recent reading for each parameter measured by the sensor."""
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
        raise HTTPException(status_code=404, detail=f"No readings found for sensor {sensor_id}")

    return [LatestReadingOut(**row) for row in rows]
