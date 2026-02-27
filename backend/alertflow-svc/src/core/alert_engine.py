"""
Moteur d'alertes AlertFlow.

Cree les alertes dans PostgreSQL, publie sur Redis Stream,
et fournit la detection de seuils capteurs + escalade automatique.
"""

from __future__ import annotations

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
# Configuration
# ---------------------------------------------------------------------------
DATABASE_URL: str = os.environ.get(
    "DATABASE_URL",
    "postgresql://geominer:geominer2026@postgres:5432/geominerdb",
)

REDIS_URL: str = os.environ.get(
    "REDIS_URL",
    "redis://:redis_secret_2024@redis:6379/0",
)

# ---------------------------------------------------------------------------
# Database engine
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

ALERTS_STREAM = "alerts:new"

# ---------------------------------------------------------------------------
# Seuils capteurs (OMS + mining specifiques)
# ---------------------------------------------------------------------------
SENSOR_THRESHOLDS: dict[str, dict[str, Any]] = {
    "mercury": {
        "max": 1.0,       # ug/L - seuil mining (OMS = 1 ug/L)
        "severity": "CRITICAL",
        "alert_type": "WATER_CONTAMINATION",
        "title": "Mercure au-dessus du seuil OMS",
    },
    "turbidity": {
        "max": 500.0,     # NTU - seuil mining (eau tres trouble)
        "severity": "HIGH",
        "alert_type": "WATER_CONTAMINATION",
        "title": "Turbidite anormalement elevee",
    },
    "ph": {
        "min": 6.0,
        "max": 9.0,
        "severity": "MEDIUM",
        "alert_type": "WATER_QUALITY",
        "title": "pH hors des normes acceptables",
    },
    "dissolved_oxygen": {
        "min": 4.0,       # mg/L
        "severity": "HIGH",
        "alert_type": "WATER_QUALITY",
        "title": "Oxygene dissous insuffisant",
    },
}


# ---------------------------------------------------------------------------
# Creation d'alertes
# ---------------------------------------------------------------------------

def create_alert(
    *,
    alert_type: str,
    severity: str,
    title: str,
    message: str | None = None,
    site_id: UUID | None = None,
    sensor_id: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Inserer une alerte dans PostgreSQL et publier sur Redis Stream."""
    alert_id = uuid4()

    db = _SessionLocal()
    try:
        query = text("""
            INSERT INTO alerts (id, site_id, alert_type, severity, title,
                                message, metadata, created_at, updated_at)
            VALUES (:id, :site_id, :alert_type, :severity, :title,
                    :message, :metadata, NOW(), NOW())
            RETURNING id, site_id, alert_type, severity, title, message,
                      acknowledged_by, acknowledged_at, created_at, updated_at
        """)
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
        logger.exception("create_alert.db_error", alert_type=alert_type, severity=severity)
        raise
    finally:
        db.close()

    # Publier sur Redis Stream
    stream_payload: dict[str, str] = {
        "id": str(alert_row["id"]),
        "alert_type": alert_type,
        "severity": severity,
        "title": title,
        "site_id": str(site_id) if site_id else "",
        "sensor_id": sensor_id or "",
        "created_at": alert_row["created_at"].isoformat()
        if isinstance(alert_row["created_at"], datetime)
        else str(alert_row["created_at"]),
    }
    if message:
        stream_payload["message"] = message

    try:
        _redis_client.xadd(ALERTS_STREAM, stream_payload, maxlen=10000)
        logger.info("alert.published", alert_id=str(alert_row["id"]), stream=ALERTS_STREAM)
    except redis.RedisError:
        logger.exception("alert.redis_publish_failed", alert_id=str(alert_row["id"]))

    logger.info(
        "alert.created",
        alert_id=str(alert_row["id"]),
        alert_type=alert_type,
        severity=severity,
    )
    return alert_row


# ---------------------------------------------------------------------------
# Verification des seuils capteurs
# ---------------------------------------------------------------------------

def check_sensor_thresholds(
    sensor_id: str,
    parameter: str,
    value: float,
    unit: str,
    lat: float | None = None,
    lon: float | None = None,
) -> dict[str, Any] | None:
    """
    Evaluer les seuils pour un parametre de capteur.
    Retourne l'alerte creee si seuil depasse, None sinon.
    - mercury > 1 ug/L → CRITICAL
    - turbidity > 500 NTU → HIGH
    - ph < 6.0 ou ph > 9.0 → MEDIUM
    - dissolved_oxygen < 4.0 mg/L → HIGH
    """
    threshold = SENSOR_THRESHOLDS.get(parameter)
    if threshold is None:
        return None

    breached = False
    detail = ""

    if "max" in threshold and value > threshold["max"]:
        breached = True
        detail = f"{parameter} = {value} {unit} depasse le seuil max {threshold['max']}"
    if "min" in threshold and value < threshold["min"]:
        breached = True
        detail = f"{parameter} = {value} {unit} sous le seuil min {threshold['min']}"

    if not breached:
        return None

    metadata = {
        "sensor_id": sensor_id,
        "parameter": parameter,
        "value": value,
        "unit": unit,
        "threshold": threshold,
        "lat": lat,
        "lon": lon,
    }

    alert = create_alert(
        alert_type=threshold["alert_type"],
        severity=threshold["severity"],
        title=threshold["title"],
        message=detail,
        sensor_id=sensor_id,
        metadata=metadata,
    )
    return alert


# ---------------------------------------------------------------------------
# Escalade automatique des sites
# ---------------------------------------------------------------------------

def check_site_escalation() -> list[dict]:
    """
    Verifier les sites CONFIRMED depuis plus de 7 jours
    et les escalader automatiquement vers ESCALATED.
    """
    db = _SessionLocal()
    escalated = []
    try:
        # Trouver les sites CONFIRMED depuis > 7 jours
        query = text("""
            UPDATE mining_sites
            SET status = 'ESCALATED',
                status_history = COALESCE(status_history, '[]'::jsonb)
                    || jsonb_build_object(
                        'status', 'ESCALATED',
                        'changed_at', NOW()::text,
                        'changed_by', 'system-escalation',
                        'notes', 'Auto-escalade: CONFIRMED > 7 jours'
                    ),
                updated_at = NOW()
            WHERE status = 'CONFIRMED'
              AND updated_at < NOW() - INTERVAL '7 days'
            RETURNING id, site_code, status
        """)
        result = db.execute(query)
        db.commit()
        rows = result.fetchall()

        for row in rows:
            r = dict(row._mapping)
            escalated.append(r)

            # Creer une alerte pour chaque escalade
            create_alert(
                alert_type="SITE_ESCALATION",
                severity="HIGH",
                title=f"Site {r['site_code']} auto-escalade",
                message=f"Le site {r['site_code']} est CONFIRMED depuis plus de 7 jours",
                site_id=r["id"],
            )

        if escalated:
            logger.info("escalation.completed", count=len(escalated))

    except Exception:
        db.rollback()
        logger.exception("escalation.error")
    finally:
        db.close()

    return escalated
