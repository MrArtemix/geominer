"""Alert engine: creates alerts in PostgreSQL and publishes to Redis Stream."""

import json
import os
from datetime import datetime, timezone
from typing import Any
from uuid import UUID, uuid4

import redis
import structlog
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

logger = structlog.get_logger(service="alertflow-svc")

# ---------------------------------------------------------------------------
# Configuration from environment
# ---------------------------------------------------------------------------
DATABASE_URL: str = os.environ.get(
    "DATABASE_URL",
    "postgresql://geominer:geominer_secret_2024@postgres:5432/geominerdb",
)

REDIS_URL: str = os.environ.get(
    "REDIS_URL",
    "redis://:redis_secret_2024@redis:6379/0",
)

# ---------------------------------------------------------------------------
# Database engine (shared across module)
# ---------------------------------------------------------------------------
_engine = create_engine(
    DATABASE_URL,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,
)
_SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=_engine)

# ---------------------------------------------------------------------------
# Redis client
# ---------------------------------------------------------------------------
_redis_client: redis.Redis = redis.Redis.from_url(
    REDIS_URL,
    decode_responses=True,
)

# Redis stream name for new alerts
ALERTS_STREAM = "alerts:new"


def create_alert(
    *,
    alert_type: str,
    severity: str,
    title: str,
    message: str | None = None,
    site_id: UUID | None = None,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Insert a new alert into PostgreSQL and publish it to the Redis Stream.

    Parameters
    ----------
    alert_type:
        Category of the alert (e.g. "DEFORESTATION", "INTRUSION", "EQUIPMENT").
    severity:
        One of LOW, MEDIUM, HIGH, CRITICAL.
    title:
        Short human-readable title.
    message:
        Optional longer description.
    site_id:
        Optional FK to mining_sites.
    metadata:
        Optional JSON payload with extra context.

    Returns
    -------
    dict  The newly created alert row as a dictionary.
    """
    alert_id = uuid4()

    db = _SessionLocal()
    try:
        query = text(
            """
            INSERT INTO alerts (id, site_id, alert_type, severity, title, message, metadata, created_at, updated_at)
            VALUES (:id, :site_id, :alert_type, :severity, :title, :message, :metadata, NOW(), NOW())
            RETURNING id, site_id, alert_type, severity, title, message,
                      acknowledged_by, acknowledged_at, created_at, updated_at
            """
        )
        params = {
            "id": str(alert_id),
            "site_id": str(site_id) if site_id else None,
            "alert_type": alert_type,
            "severity": severity,
            "title": title,
            "message": message,
            "metadata": json.dumps(metadata) if metadata else None,
        }
        result = db.execute(query, params)
        db.commit()
        row = result.fetchone()
        alert_row = dict(row._mapping)
    except Exception:
        db.rollback()
        logger.exception("alert_engine.create_alert.db_error", alert_type=alert_type, severity=severity)
        raise
    finally:
        db.close()

    # ---- Publish to Redis Stream ----
    stream_payload: dict[str, str] = {
        "id": str(alert_row["id"]),
        "alert_type": alert_type,
        "severity": severity,
        "title": title,
        "site_id": str(site_id) if site_id else "",
        "created_at": alert_row["created_at"].isoformat()
        if isinstance(alert_row["created_at"], datetime)
        else str(alert_row["created_at"]),
    }
    if message:
        stream_payload["message"] = message

    try:
        _redis_client.xadd(ALERTS_STREAM, stream_payload)
        logger.info(
            "alert_engine.published",
            alert_id=str(alert_row["id"]),
            stream=ALERTS_STREAM,
        )
    except redis.RedisError:
        logger.exception(
            "alert_engine.redis_publish_failed",
            alert_id=str(alert_row["id"]),
        )
        # We do not re-raise: the alert is already persisted in PostgreSQL.
        # A background reconciliation job can replay missed publishes.

    logger.info(
        "alert_engine.created",
        alert_id=str(alert_row["id"]),
        alert_type=alert_type,
        severity=severity,
    )
    return alert_row
