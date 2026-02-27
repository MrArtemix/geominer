"""Operations CRUD async pour mining_sites avec PostGIS."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


# ---------------------------------------------------------------------------
# Lecture
# ---------------------------------------------------------------------------

async def get_sites(
    db: AsyncSession,
    *,
    status: str | None = None,
    region: str | None = None,
    confidence_min: float | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[dict]:
    """Lister les sites avec filtres optionnels."""
    query = (
        "SELECT id, site_code, ST_AsGeoJSON(geometry)::json AS geometry, "
        "area_ha, h3_index_r7, confidence_ai, detected_at, satellite_date, "
        "sat_source, status, blockchain_txid, ipfs_cid, region, department, "
        "sous_prefecture, gold_estim_ton, created_at, "
        "ST_Y(centroid) AS centroid_lat, ST_X(centroid) AS centroid_lon "
        "FROM mining_sites WHERE 1=1"
    )
    params: dict = {"limit": limit, "offset": offset}

    if status:
        query += " AND status = :status"
        params["status"] = status
    if region:
        query += " AND region = :region"
        params["region"] = region
    if confidence_min is not None:
        query += " AND confidence_ai >= :confidence_min"
        params["confidence_min"] = confidence_min
    if date_from:
        query += " AND detected_at >= :date_from"
        params["date_from"] = date_from
    if date_to:
        query += " AND detected_at <= :date_to"
        params["date_to"] = date_to

    query += " ORDER BY detected_at DESC LIMIT :limit OFFSET :offset"

    result = await db.execute(text(query), params)
    return [dict(row._mapping) for row in result]


async def get_site_by_id(db: AsyncSession, site_id: UUID) -> dict | None:
    """Recuperer un site par son ID avec toutes les colonnes."""
    query = text(
        "SELECT id, site_code, ST_AsGeoJSON(geometry)::json AS geometry, "
        "area_ha, h3_index_r7, confidence_ai, detected_at, satellite_date, "
        "sat_source, status, blockchain_txid, ipfs_cid, region, department, "
        "sous_prefecture, gold_estim_ton, status_history, notes, "
        "created_at, updated_at, "
        "ST_Y(centroid) AS centroid_lat, ST_X(centroid) AS centroid_lon "
        "FROM mining_sites WHERE id = :site_id"
    )
    result = await db.execute(query, {"site_id": str(site_id)})
    row = result.fetchone()
    return dict(row._mapping) if row else None


async def get_sites_by_bbox(
    db: AsyncSession,
    min_lon: float,
    min_lat: float,
    max_lon: float,
    max_lat: float,
    limit: int = 100,
) -> list[dict]:
    """Rechercher les sites dans une bounding box."""
    query = text("""
        SELECT id, site_code, ST_AsGeoJSON(geometry)::json AS geometry,
               area_ha, h3_index_r7, confidence_ai, detected_at, status,
               region, gold_estim_ton,
               ST_Y(centroid) AS centroid_lat, ST_X(centroid) AS centroid_lon
        FROM mining_sites
        WHERE geometry && ST_MakeEnvelope(:min_lon, :min_lat, :max_lon, :max_lat, 4326)
        ORDER BY detected_at DESC
        LIMIT :limit
    """)
    result = await db.execute(
        query,
        {
            "min_lon": min_lon,
            "min_lat": min_lat,
            "max_lon": max_lon,
            "max_lat": max_lat,
            "limit": limit,
        },
    )
    return [dict(row._mapping) for row in result]


async def get_sites_by_h3(db: AsyncSession, h3_index: str) -> list[dict]:
    """Recuperer les sites dans une cellule H3."""
    query = text("""
        SELECT id, site_code, ST_AsGeoJSON(geometry)::json AS geometry,
               area_ha, confidence_ai, detected_at, status, region,
               gold_estim_ton,
               ST_Y(centroid) AS centroid_lat, ST_X(centroid) AS centroid_lon
        FROM mining_sites
        WHERE h3_index_r7 = :h3_index
        ORDER BY detected_at DESC
    """)
    result = await db.execute(query, {"h3_index": h3_index})
    return [dict(row._mapping) for row in result]


# ---------------------------------------------------------------------------
# Ecriture
# ---------------------------------------------------------------------------

async def create_site(db: AsyncSession, site_data: dict) -> dict:
    """Creer un nouveau site minier."""
    geojson = site_data.pop("geometry")
    geojson_str = json.dumps(geojson)

    columns = ", ".join(site_data.keys())
    placeholders = ", ".join(f":{k}" for k in site_data.keys())

    query = text(f"""
        INSERT INTO mining_sites ({columns}, geometry)
        VALUES ({placeholders}, ST_GeomFromGeoJSON(:geojson))
        RETURNING id, site_code, area_ha, h3_index_r7, confidence_ai,
                  detected_at, status, created_at
    """)
    params = {**site_data, "geojson": geojson_str}
    result = await db.execute(query, params)
    await db.commit()
    row = result.fetchone()
    return dict(row._mapping)


async def update_site_status(
    db: AsyncSession,
    site_id: UUID,
    new_status: str,
    notes: str | None = None,
    changed_by: str | None = None,
) -> dict | None:
    """
    Mettre a jour le statut d'un site et appender l'historique dans status_history JSONB.
    """
    # Construire l'entree d'historique
    history_entry = json.dumps({
        "status": new_status,
        "changed_at": datetime.now(timezone.utc).isoformat(),
        "changed_by": changed_by or "system",
        "notes": notes,
    })

    notes_clause = ""
    params: dict = {
        "site_id": str(site_id),
        "status": new_status,
        "history_entry": history_entry,
    }
    if notes:
        notes_clause = ", notes = :notes"
        params["notes"] = notes

    query = text(f"""
        UPDATE mining_sites
        SET status = :status,
            status_history = COALESCE(status_history, '[]'::jsonb) || :history_entry::jsonb,
            updated_at = NOW()
            {notes_clause}
        WHERE id = :site_id
        RETURNING id, site_code, status, status_history, updated_at
    """)
    result = await db.execute(query, params)
    await db.commit()
    row = result.fetchone()
    return dict(row._mapping) if row else None


# ---------------------------------------------------------------------------
# Statistiques
# ---------------------------------------------------------------------------

async def count_sites(db: AsyncSession, status: str | None = None) -> int:
    """Compter les sites avec filtre optionnel par statut."""
    query = "SELECT COUNT(*) FROM mining_sites WHERE 1=1"
    params: dict = {}
    if status:
        query += " AND status = :status"
        params["status"] = status
    result = await db.execute(text(query), params)
    return result.scalar() or 0


async def get_site_stats(db: AsyncSession) -> dict:
    """
    Statistiques globales des sites miniers.
    Retourne le total, les comptes par statut, la surface totale,
    la confiance moyenne et l'estimation or totale.
    """
    query = text("""
        SELECT
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE status = 'DETECTED') AS detected,
            COUNT(*) FILTER (WHERE status = 'CONFIRMED') AS confirmed,
            COUNT(*) FILTER (WHERE status = 'ACTIVE') AS active,
            COUNT(*) FILTER (WHERE status = 'ESCALATED') AS escalated,
            COUNT(*) FILTER (WHERE status = 'DISMANTLED') AS dismantled,
            COUNT(*) FILTER (WHERE status = 'RECURRED') AS recurred,
            COUNT(*) FILTER (WHERE status = 'UNDER_REVIEW') AS under_review,
            COALESCE(SUM(area_ha), 0) AS total_area_ha,
            COALESCE(AVG(confidence_ai), 0) AS avg_confidence,
            COALESCE(SUM(gold_estim_ton), 0) AS total_gold_estim_ton
        FROM mining_sites
    """)
    result = await db.execute(query)
    row = result.fetchone()
    m = dict(row._mapping)
    return {
        "total": m["total"],
        "by_status": {
            "DETECTED": m["detected"],
            "CONFIRMED": m["confirmed"],
            "ACTIVE": m["active"],
            "ESCALATED": m["escalated"],
            "DISMANTLED": m["dismantled"],
            "RECURRED": m["recurred"],
            "UNDER_REVIEW": m["under_review"],
        },
        "total_area_ha": float(m["total_area_ha"]),
        "avg_confidence": round(float(m["avg_confidence"]), 4),
        "total_gold_estim_ton": float(m["total_gold_estim_ton"]),
    }


async def check_recurrence(
    db: AsyncSession,
    site_id: UUID,
    days: int = 90,
) -> bool:
    """
    Verifier si un site a ete demantele puis detecte a nouveau
    dans le meme polygone dans les N derniers jours.
    Si oui, mettre le statut a RECURRED.
    """
    query = text("""
        WITH site AS (
            SELECT geometry, status FROM mining_sites WHERE id = :site_id
        )
        SELECT COUNT(*) AS nearby
        FROM mining_sites m, site s
        WHERE m.id != :site_id
          AND m.status = 'DISMANTLED'
          AND m.detected_at >= NOW() - INTERVAL '1 day' * :days
          AND ST_Intersects(m.geometry, s.geometry)
    """)
    result = await db.execute(query, {"site_id": str(site_id), "days": days})
    count = result.scalar() or 0

    if count > 0:
        await update_site_status(
            db, site_id, "RECURRED",
            notes=f"Recurrence detectee: {count} site(s) demantele(s) dans la meme zone ({days}j)",
            changed_by="system",
        )
        return True
    return False


# ---------------------------------------------------------------------------
# Carte de risque H3
# ---------------------------------------------------------------------------

async def get_h3_risk_map(db: AsyncSession) -> list[dict]:
    """Recuperer les scores de risque H3 pour la heatmap."""
    query = text("""
        SELECT h3_index, risk_score, site_count, last_detected,
               avg_confidence, total_area_ha
        FROM h3_risk_scores
        ORDER BY risk_score DESC
    """)
    result = await db.execute(query)
    return [dict(row._mapping) for row in result]
