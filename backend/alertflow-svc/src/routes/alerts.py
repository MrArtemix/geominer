from collections.abc import Generator
from datetime import datetime
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from ..core.alert_engine import DATABASE_URL

logger = structlog.get_logger(service="alertflow-svc")

# ---------------------------------------------------------------------------
# Database session (mirrors minespotai-svc pattern)
# ---------------------------------------------------------------------------
engine = create_engine(
    DATABASE_URL,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------
class AcknowledgeRequest(BaseModel):
    acknowledged_by: str


class AlertResponse(BaseModel):
    id: UUID
    site_id: UUID | None = None
    alert_type: str
    severity: str
    title: str
    message: str | None = None
    acknowledged_by: str | None = None
    acknowledged_at: datetime | None = None
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
    severity: str | None = Query(None, description="Filter by severity (LOW, MEDIUM, HIGH, CRITICAL)"),
    alert_type: str | None = Query(None, alias="type", description="Filter by alert type"),
    site_id: UUID | None = Query(None, description="Filter by site ID"),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
) -> AlertListResponse:
    """Return a paginated list of alerts, ordered by created_at DESC."""

    query = (
        "SELECT id, site_id, alert_type, severity, title, message, "
        "acknowledged_by, acknowledged_at, created_at, updated_at "
        "FROM alerts WHERE 1=1"
    )
    count_query = "SELECT COUNT(*) FROM alerts WHERE 1=1"
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

    query += " ORDER BY created_at DESC LIMIT :limit OFFSET :offset"

    result = db.execute(text(query), params)
    rows = [dict(row._mapping) for row in result]

    total = db.execute(text(count_query), params).scalar() or 0

    logger.info("alerts.list", count=len(rows), total=total, severity=severity, alert_type=alert_type)

    return AlertListResponse(
        alerts=[AlertResponse(**row) for row in rows],
        total_count=total,
        limit=limit,
        offset=offset,
    )


@router.get("/{alert_id}", response_model=AlertResponse)
def get_alert(
    alert_id: UUID,
    db: Session = Depends(get_db),
) -> AlertResponse:
    """Return a single alert by ID."""

    query = text(
        "SELECT id, site_id, alert_type, severity, title, message, "
        "acknowledged_by, acknowledged_at, created_at, updated_at "
        "FROM alerts WHERE id = :alert_id"
    )
    result = db.execute(query, {"alert_id": str(alert_id)})
    row = result.fetchone()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Alert not found")

    logger.info("alerts.get", alert_id=str(alert_id))
    return AlertResponse(**dict(row._mapping))


@router.patch("/{alert_id}/acknowledge", response_model=AlertResponse)
def acknowledge_alert(
    alert_id: UUID,
    payload: AcknowledgeRequest,
    db: Session = Depends(get_db),
) -> AlertResponse:
    """Acknowledge an alert: sets acknowledged_by and acknowledged_at."""

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
        {
            "alert_id": str(alert_id),
            "acknowledged_by": payload.acknowledged_by,
        },
    )
    db.commit()
    row = result.fetchone()

    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Alert not found")

    logger.info(
        "alerts.acknowledged",
        alert_id=str(alert_id),
        acknowledged_by=payload.acknowledged_by,
    )
    return AlertResponse(**dict(row._mapping))
