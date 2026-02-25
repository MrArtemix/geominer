from uuid import UUID

from sqlalchemy import text
from sqlalchemy.orm import Session


def get_sites(
    db: Session,
    *,
    status: str | None = None,
    region: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[dict]:
    query = "SELECT id, site_code, ST_AsGeoJSON(geometry)::json as geometry, area_ha, h3_index_r7, confidence_ai, detected_at, satellite_date, sat_source, status, blockchain_txid, ipfs_cid, region, department, sous_prefecture, created_at, ST_Y(centroid) as centroid_lat, ST_X(centroid) as centroid_lon FROM mining_sites WHERE 1=1"
    params: dict = {"limit": limit, "offset": offset}

    if status:
        query += " AND status = :status"
        params["status"] = status
    if region:
        query += " AND region = :region"
        params["region"] = region

    query += " ORDER BY detected_at DESC LIMIT :limit OFFSET :offset"

    result = db.execute(text(query), params)
    return [dict(row._mapping) for row in result]


def get_site_by_id(db: Session, site_id: UUID) -> dict | None:
    query = text(
        "SELECT id, site_code, ST_AsGeoJSON(geometry)::json as geometry, area_ha, h3_index_r7, confidence_ai, detected_at, satellite_date, sat_source, status, blockchain_txid, ipfs_cid, region, department, sous_prefecture, notes, created_at, updated_at, ST_Y(centroid) as centroid_lat, ST_X(centroid) as centroid_lon FROM mining_sites WHERE id = :site_id"
    )
    result = db.execute(query, {"site_id": str(site_id)})
    row = result.fetchone()
    return dict(row._mapping) if row else None


def get_sites_by_bbox(
    db: Session,
    min_lon: float,
    min_lat: float,
    max_lon: float,
    max_lat: float,
    limit: int = 100,
) -> list[dict]:
    query = text(
        """
        SELECT id, site_code, ST_AsGeoJSON(geometry)::json as geometry,
               area_ha, h3_index_r7, confidence_ai, detected_at, status, region,
               ST_Y(centroid) as centroid_lat, ST_X(centroid) as centroid_lon
        FROM mining_sites
        WHERE geometry && ST_MakeEnvelope(:min_lon, :min_lat, :max_lon, :max_lat, 4326)
        ORDER BY detected_at DESC
        LIMIT :limit
        """
    )
    result = db.execute(
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


def get_sites_by_h3(db: Session, h3_index: str) -> list[dict]:
    query = text(
        """
        SELECT id, site_code, ST_AsGeoJSON(geometry)::json as geometry,
               area_ha, confidence_ai, detected_at, status, region,
               ST_Y(centroid) as centroid_lat, ST_X(centroid) as centroid_lon
        FROM mining_sites
        WHERE h3_index_r7 = :h3_index
        ORDER BY detected_at DESC
        """
    )
    result = db.execute(query, {"h3_index": h3_index})
    return [dict(row._mapping) for row in result]


def create_site(db: Session, site_data: dict) -> dict:
    geojson = site_data.pop("geometry")
    import json

    geojson_str = json.dumps(geojson)

    columns = ", ".join(site_data.keys())
    placeholders = ", ".join(f":{k}" for k in site_data.keys())

    query = text(
        f"""
        INSERT INTO mining_sites ({columns}, geometry)
        VALUES ({placeholders}, ST_GeomFromGeoJSON(:geojson))
        RETURNING id, site_code, area_ha, h3_index_r7, confidence_ai, detected_at, status, created_at
        """
    )
    params = {**site_data, "geojson": geojson_str}
    result = db.execute(query, params)
    db.commit()
    row = result.fetchone()
    return dict(row._mapping)


def update_site_status(
    db: Session, site_id: UUID, status: str, notes: str | None = None
) -> dict | None:
    params: dict = {"site_id": str(site_id), "status": status}
    notes_clause = ""
    if notes:
        notes_clause = ", notes = :notes"
        params["notes"] = notes

    query = text(
        f"""
        UPDATE mining_sites
        SET status = :status{notes_clause}, updated_at = NOW()
        WHERE id = :site_id
        RETURNING id, site_code, status, updated_at
        """
    )
    result = db.execute(query, params)
    db.commit()
    row = result.fetchone()
    return dict(row._mapping) if row else None


def count_sites(db: Session, status: str | None = None) -> int:
    query = "SELECT COUNT(*) FROM mining_sites WHERE 1=1"
    params: dict = {}
    if status:
        query += " AND status = :status"
        params["status"] = status
    result = db.execute(text(query), params)
    return result.scalar() or 0
