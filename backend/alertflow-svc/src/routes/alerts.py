"""
Routes REST AlertFlow - alertes avec filtres, acquittement, test-fire, soft-delete.
"""

from __future__ import annotations

from collections.abc import Generator
from datetime import datetime
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from ..core.alert_engine import (
    DATABASE_URL,
    check_sensor_thresholds,
    check_site_escalation,
    create_alert,
)

logger = structlog.get_logger(service="alertflow-svc")

# ---------------------------------------------------------------------------
# Session DB
# ---------------------------------------------------------------------------
engine = create_engine(DATABASE_URL, pool_size=10, max_overflow=20, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Schemas Pydantic
# ---------------------------------------------------------------------------
class AcknowledgeRequest(BaseModel):
    acknowledged_by: str


class AlertCreateRequest(BaseModel):
    alert_type: str = Field(..., description="Type d'alerte (DEFORESTATION, INTRUSION, etc.)")
    severity: str = Field(..., description="Severite: LOW, MEDIUM, HIGH, CRITICAL")
    title: str
    message: str | None = None
    site_id: UUID | None = None
    sensor_id: str | None = None
    metadata: dict | None = None


class AlertResponse(BaseModel):
    id: UUID
    site_id: UUID | None = None
    alert_type: str
    severity: str
    title: str
    message: str | None = None
    acknowledged_by: str | None = None
    acknowledged_at: datetime | None = None
    is_deleted: bool = False
    created_at: datetime
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}


class AlertListResponse(BaseModel):
    alerts: list[AlertResponse]
    total_count: int
    limit: int
    offset: int


# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------
router = APIRouter(prefix="/alerts", tags=["alerts"])


@router.get("", response_model=AlertListResponse)
def list_alerts(
    severity: str | None = Query(None, description="Filtrer par severite"),
    alert_type: str | None = Query(None, alias="type", description="Filtrer par type"),
    site_id: UUID | None = Query(None, description="Filtrer par site"),
    acknowledged: bool | None = Query(None, description="Filtrer par acquittement"),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
) -> AlertListResponse:
    """Liste paginee des alertes, triees par date decroissante."""
    query = (
        "SELECT id, site_id, alert_type, severity, title, message, "
        "acknowledged_by, acknowledged_at, "
        "COALESCE((metadata->>'is_deleted')::boolean, false) AS is_deleted, "
        "created_at, updated_at "
        "FROM alerts WHERE COALESCE((metadata->>'is_deleted')::boolean, false) = false"
    )
    count_query = (
        "SELECT COUNT(*) FROM alerts "
        "WHERE COALESCE((metadata->>'is_deleted')::boolean, false) = false"
    )
    params: dict = {"limit": limit, "offset": offset}

    if severity:
        query += " AND severity = :severity"
        count_query += " AND severity = :severity"
        params["severity"] = severity
    if alert_type:
        query += " AND alert_type = :alert_type"
        count_query += " AND alert_type = :alert_type"
        params["alert_type"] = alert_type
    if site_id:
        query += " AND site_id = :site_id"
        count_query += " AND site_id = :site_id"
        params["site_id"] = str(site_id)
    if acknowledged is not None:
        if acknowledged:
            query += " AND acknowledged_at IS NOT NULL"
            count_query += " AND acknowledged_at IS NOT NULL"
        else:
            query += " AND acknowledged_at IS NULL"
            count_query += " AND acknowledged_at IS NULL"

    query += " ORDER BY created_at DESC LIMIT :limit OFFSET :offset"

    result = db.execute(text(query), params)
    rows = [dict(row._mapping) for row in result]

    total = db.execute(text(count_query), params).scalar() or 0

    logger.info("alerts.list", count=len(rows), total=total)

    return AlertListResponse(
        alerts=[AlertResponse(**row) for row in rows],
        total_count=total,
        limit=limit,
        offset=offset,
    )


@router.get("/{alert_id}", response_model=AlertResponse)
def get_alert(alert_id: UUID, db: Session = Depends(get_db)) -> AlertResponse:
    """Recuperer une alerte par ID."""
    query = text(
        "SELECT id, site_id, alert_type, severity, title, message, "
        "acknowledged_by, acknowledged_at, "
        "COALESCE((metadata->>'is_deleted')::boolean, false) AS is_deleted, "
        "created_at, updated_at "
        "FROM alerts WHERE id = :alert_id"
    )
    result = db.execute(query, {"alert_id": str(alert_id)})
    row = result.fetchone()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Alerte non trouvee")

    return AlertResponse(**dict(row._mapping))


@router.patch("/{alert_id}/acknowledge", response_model=AlertResponse)
def acknowledge_alert(
    alert_id: UUID,
    payload: AcknowledgeRequest,
    db: Session = Depends(get_db),
) -> AlertResponse:
    """Acquitter une alerte."""
    query = text(
        "UPDATE alerts "
        "SET acknowledged_by = :acknowledged_by, "
        "    acknowledged_at = NOW(), "
        "    updated_at = NOW() "
        "WHERE id = :alert_id "
        "RETURNING id, site_id, alert_type, severity, title, message, "
        "          acknowledged_by, acknowledged_at, created_at, updated_at"
    )
    result = db.execute(
        query,
        {"alert_id": str(alert_id), "acknowledged_by": payload.acknowledged_by},
    )
    db.commit()
    row = result.fetchone()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Alerte non trouvee")

    logger.info("alerts.acknowledged", alert_id=str(alert_id), by=payload.acknowledged_by)
    return AlertResponse(**dict(row._mapping))


@router.delete("/{alert_id}", status_code=status.HTTP_200_OK)
def soft_delete_alert(alert_id: UUID, db: Session = Depends(get_db)):
    """Suppression logique d'une alerte (soft-delete via metadata)."""
    query = text("""
        UPDATE alerts
        SET metadata = COALESCE(metadata, '{}'::jsonb) || '{"is_deleted": true}'::jsonb,
            updated_at = NOW()
        WHERE id = :alert_id
        RETURNING id
    """)
    result = db.execute(query, {"alert_id": str(alert_id)})
    db.commit()
    row = result.fetchone()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Alerte non trouvee")

    logger.info("alerts.soft_deleted", alert_id=str(alert_id))
    return {"detail": "Alerte supprimee", "id": str(alert_id)}


@router.post("/test-fire", status_code=status.HTTP_201_CREATED)
def test_fire_alert(payload: AlertCreateRequest):
    """
    Declencher une alerte de test (reserve SUPER_ADMIN).
    L'autorisation est verifiee cote API Gateway via X-User-Roles.
    """
    alert = create_alert(
        alert_type=payload.alert_type,
        severity=payload.severity,
        title=f"[TEST] {payload.title}",
        message=payload.message,
        site_id=payload.site_id,
        sensor_id=payload.sensor_id,
        metadata={**(payload.metadata or {}), "is_test": True},
    )

    logger.info("alerts.test_fired", alert_id=str(alert["id"]))
    return alert


@router.post("/escalate", status_code=status.HTTP_200_OK)
def trigger_escalation():
    """
    Declencher manuellement l'escalade automatique.
    Escalade les sites CONFIRMED depuis > 7 jours vers ESCALATED.
    """
    escalated = check_site_escalation()
    return {
        "escalated_count": len(escalated),
        "sites": escalated,
    }
