"""
Routes evidence enrichies - upload avec SHA-256 + IPFS + blockchain + DB evidence_records.

Pipeline complet :
1. Lire le fichier
2. Calculer SHA-256
3. Stocker dans MinIO (bucket "evidence")
4. Stocker sur IPFS (ou CID mock)
5. Enregistrer sur la blockchain (via goldtrack-svc)
6. Inserer dans evidence_records
"""

from __future__ import annotations

import io
import json
import uuid
from datetime import datetime, timezone

import httpx
import structlog
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from src.main import get_db, get_minio_client, settings
from src.core.hasher import compute_sha256, verify_hash
from src.core.ipfs_client import store_evidence as ipfs_store_evidence

logger = structlog.get_logger("legalvault.evidence")

router = APIRouter(prefix="/evidence", tags=["evidence"])


# ---------------------------------------------------------------------------
# Schemas Pydantic
# ---------------------------------------------------------------------------

class EvidenceUploadResponse(BaseModel):
    id: uuid.UUID
    site_id: uuid.UUID
    original_filename: str
    sha256_hash: str
    ipfs_cid: str
    storage_mode: str
    blockchain_txid: str | None = None
    file_size_bytes: int
    uploaded_at: datetime


class EvidenceMetadataResponse(BaseModel):
    id: uuid.UUID
    site_id: uuid.UUID
    original_filename: str
    sha256_hash: str
    ipfs_cid: str
    blockchain_txid: str | None = None
    file_size_bytes: int
    uploaded_by: str | None = None
    uploaded_at: datetime


class VerificationResponse(BaseModel):
    id: uuid.UUID
    original_filename: str
    stored_hash: str
    computed_hash: str
    hashes_match: bool
    verified_at: datetime


class EvidenceManifest(BaseModel):
    evidence_id: uuid.UUID
    site_id: uuid.UUID
    sha256_hash: str
    ipfs_cid: str
    blockchain_txid: str | None
    minio_path: str
    created_at: str
    chain_of_custody: list[dict]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _register_on_blockchain(
    site_id: uuid.UUID,
    evidence_id: uuid.UUID,
    sha256_hash: str,
    ipfs_cid: str,
    filename: str,
) -> str | None:
    """Enregistrer la preuve sur la blockchain via goldtrack-svc."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                f"{settings.goldtrack_url}/blockchain/transactions",
                json={
                    "site_id": str(site_id),
                    "from_entity": "legalvault",
                    "to_entity": "evidence-registry",
                    "quantity_grams": 0,
                    "is_legal": True,
                    "metadata": {
                        "type": "evidence_upload",
                        "evidence_id": str(evidence_id),
                        "sha256": sha256_hash,
                        "ipfs_cid": ipfs_cid,
                        "filename": filename,
                    },
                },
            )
            if resp.status_code in (200, 201):
                data = resp.json()
                return data.get("blockchain_txid")
    except Exception as exc:
        logger.warning("blockchain_enregistrement_echec", error=str(exc))
    return None


# ---------------------------------------------------------------------------
# POST /evidence - Upload avec pipeline complet
# ---------------------------------------------------------------------------

@router.post("", response_model=EvidenceUploadResponse, status_code=201)
async def upload_evidence(
    file: UploadFile = File(..., description="Fichier de preuve a uploader"),
    site_id: uuid.UUID = Form(..., description="ID du site minier associe"),
    uploaded_by: str | None = Form(None, description="Auteur de l'upload"),
    db: Session = Depends(get_db),
):
    """
    Pipeline complet d'upload de preuve :
    1. SHA-256 du fichier
    2. Stockage MinIO (bucket "evidence")
    3. Stockage IPFS (reel ou mock)
    4. Enregistrement blockchain
    5. Insertion dans evidence_records
    """
    contents = await file.read()
    file_size = len(contents)

    # 1. Hash SHA-256
    sha256_hash = compute_sha256(contents)

    # 2. Stockage MinIO
    evidence_id = uuid.uuid4()
    object_name = f"{site_id}/{evidence_id}/{file.filename}"
    minio_client = get_minio_client()

    try:
        minio_client.put_object(
            bucket_name=settings.minio_bucket,
            object_name=object_name,
            data=io.BytesIO(contents),
            length=file_size,
            content_type=file.content_type or "application/octet-stream",
        )
    except Exception as exc:
        logger.error("minio_upload_echec", error=str(exc), evidence_id=str(evidence_id))
        raise HTTPException(
            status_code=502,
            detail=f"Echec stockage fichier dans MinIO: {exc}",
        )

    # 3. Stockage IPFS (reel ou mock)
    ipfs_cid, storage_mode = await ipfs_store_evidence(contents, file.filename, sha256_hash)

    # 4. Enregistrement blockchain
    blockchain_txid = await _register_on_blockchain(
        site_id, evidence_id, sha256_hash, ipfs_cid, file.filename
    )

    now = datetime.now(timezone.utc)

    # 5. Insertion dans evidence_records (table enrichie)
    db.execute(
        text("""
            INSERT INTO evidence_records
                (id, site_id, evidence_type, file_hash, ipfs_cid,
                 blockchain_txid, collected_by, collected_at, metadata)
            VALUES
                (:id, :site_id, :evidence_type, :file_hash, :ipfs_cid,
                 :blockchain_txid, :collected_by, :collected_at, :metadata)
        """),
        {
            "id": str(evidence_id),
            "site_id": str(site_id),
            "evidence_type": _detect_evidence_type(file.filename),
            "file_hash": sha256_hash,
            "ipfs_cid": ipfs_cid,
            "blockchain_txid": blockchain_txid,
            "collected_by": uploaded_by,
            "collected_at": now,
            "metadata": json.dumps({
                "original_filename": file.filename,
                "file_size_bytes": file_size,
                "content_type": file.content_type,
                "minio_object_name": object_name,
                "storage_mode": storage_mode,
            }),
        },
    )
    db.commit()

    logger.info(
        "preuve_uploadee",
        evidence_id=str(evidence_id),
        site_id=str(site_id),
        sha256=sha256_hash,
        ipfs_cid=ipfs_cid,
        storage_mode=storage_mode,
        blockchain_txid=blockchain_txid,
    )

    return EvidenceUploadResponse(
        id=evidence_id,
        site_id=site_id,
        original_filename=file.filename,
        sha256_hash=sha256_hash,
        ipfs_cid=ipfs_cid,
        storage_mode=storage_mode,
        blockchain_txid=blockchain_txid,
        file_size_bytes=file_size,
        uploaded_at=now,
    )


# ---------------------------------------------------------------------------
# GET /evidence/{id} - Metadonnees
# ---------------------------------------------------------------------------

@router.get("/{evidence_id}", response_model=EvidenceMetadataResponse)
async def get_evidence(evidence_id: uuid.UUID, db: Session = Depends(get_db)):
    """Recuperer les metadonnees d'une preuve."""
    row = db.execute(
        text("""
            SELECT id, site_id, file_hash AS sha256_hash, ipfs_cid,
                   blockchain_txid, collected_by AS uploaded_by,
                   collected_at AS uploaded_at,
                   metadata->>'original_filename' AS original_filename,
                   COALESCE((metadata->>'file_size_bytes')::int, 0) AS file_size_bytes
            FROM evidence_records
            WHERE id = :id
        """),
        {"id": str(evidence_id)},
    ).fetchone()

    if not row:
        raise HTTPException(status_code=404, detail=f"Preuve {evidence_id} non trouvee")

    return EvidenceMetadataResponse(
        id=row.id,
        site_id=row.site_id,
        original_filename=row.original_filename or "inconnu",
        sha256_hash=row.sha256_hash,
        ipfs_cid=row.ipfs_cid or "",
        blockchain_txid=row.blockchain_txid,
        file_size_bytes=row.file_size_bytes,
        uploaded_by=row.uploaded_by,
        uploaded_at=row.uploaded_at,
    )


# ---------------------------------------------------------------------------
# GET /evidence/{id}/verify - Verification d'integrite
# ---------------------------------------------------------------------------

@router.get("/{evidence_id}/verify", response_model=VerificationResponse)
async def verify_evidence(evidence_id: uuid.UUID, db: Session = Depends(get_db)):
    """Re-telecharger depuis MinIO et verifier l'integrite SHA-256."""
    row = db.execute(
        text("""
            SELECT id, file_hash AS sha256_hash,
                   metadata->>'original_filename' AS original_filename,
                   metadata->>'minio_object_name' AS minio_object_name
            FROM evidence_records
            WHERE id = :id
        """),
        {"id": str(evidence_id)},
    ).fetchone()

    if not row:
        raise HTTPException(status_code=404, detail=f"Preuve {evidence_id} non trouvee")

    minio_client = get_minio_client()
    try:
        response = minio_client.get_object(settings.minio_bucket, row.minio_object_name)
        file_data = response.read()
        response.close()
        response.release_conn()
    except Exception as exc:
        logger.error("minio_download_echec", error=str(exc), evidence_id=str(evidence_id))
        raise HTTPException(
            status_code=502,
            detail=f"Echec recuperation fichier depuis MinIO: {exc}",
        )

    computed_hash = compute_sha256(file_data)
    hashes_match = verify_hash(file_data, row.sha256_hash)
    now = datetime.now(timezone.utc)

    logger.info(
        "preuve_verifiee",
        evidence_id=str(evidence_id),
        hashes_match=hashes_match,
    )

    return VerificationResponse(
        id=row.id,
        original_filename=row.original_filename or "inconnu",
        stored_hash=row.sha256_hash,
        computed_hash=computed_hash,
        hashes_match=hashes_match,
        verified_at=now,
    )


# ---------------------------------------------------------------------------
# GET /evidence/{id}/manifest - Manifeste de preuve
# ---------------------------------------------------------------------------

@router.get("/{evidence_id}/manifest", response_model=EvidenceManifest)
async def get_evidence_manifest(evidence_id: uuid.UUID, db: Session = Depends(get_db)):
    """Generer un manifeste complet de la preuve (chaine de custody)."""
    row = db.execute(
        text("""
            SELECT id, site_id, file_hash, ipfs_cid, blockchain_txid,
                   collected_by, collected_at, metadata
            FROM evidence_records
            WHERE id = :id
        """),
        {"id": str(evidence_id)},
    ).fetchone()

    if not row:
        raise HTTPException(status_code=404, detail=f"Preuve {evidence_id} non trouvee")

    metadata = row.metadata if isinstance(row.metadata, dict) else {}
    minio_path = metadata.get("minio_object_name", "")

    chain_of_custody = [
        {
            "action": "upload",
            "by": row.collected_by or "inconnu",
            "at": row.collected_at.isoformat() if row.collected_at else "",
            "sha256": row.file_hash,
        },
        {
            "action": "stockage_minio",
            "bucket": settings.minio_bucket,
            "path": minio_path,
        },
        {
            "action": "stockage_ipfs",
            "cid": row.ipfs_cid or "",
            "mode": metadata.get("storage_mode", "mock"),
        },
    ]

    if row.blockchain_txid:
        chain_of_custody.append({
            "action": "enregistrement_blockchain",
            "txid": row.blockchain_txid,
        })

    return EvidenceManifest(
        evidence_id=row.id,
        site_id=row.site_id,
        sha256_hash=row.file_hash,
        ipfs_cid=row.ipfs_cid or "",
        blockchain_txid=row.blockchain_txid,
        minio_path=minio_path,
        created_at=row.collected_at.isoformat() if row.collected_at else "",
        chain_of_custody=chain_of_custody,
    )


# ---------------------------------------------------------------------------
# GET /evidence/site/{site_id} - Lister par site
# ---------------------------------------------------------------------------

@router.get("/site/{site_id}", response_model=list[EvidenceMetadataResponse])
async def list_evidence_for_site(
    site_id: uuid.UUID,
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """Lister toutes les preuves associees a un site minier."""
    rows = db.execute(
        text("""
            SELECT id, site_id, file_hash AS sha256_hash, ipfs_cid,
                   blockchain_txid, collected_by AS uploaded_by,
                   collected_at AS uploaded_at,
                   metadata->>'original_filename' AS original_filename,
                   COALESCE((metadata->>'file_size_bytes')::int, 0) AS file_size_bytes
            FROM evidence_records
            WHERE site_id = :site_id
            ORDER BY collected_at DESC
            LIMIT :limit OFFSET :offset
        """),
        {"site_id": str(site_id), "limit": limit, "offset": offset},
    ).fetchall()

    return [
        EvidenceMetadataResponse(
            id=r.id,
            site_id=r.site_id,
            original_filename=r.original_filename or "inconnu",
            sha256_hash=r.sha256_hash,
            ipfs_cid=r.ipfs_cid or "",
            blockchain_txid=r.blockchain_txid,
            file_size_bytes=r.file_size_bytes,
            uploaded_by=r.uploaded_by,
            uploaded_at=r.uploaded_at,
        )
        for r in rows
    ]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _detect_evidence_type(filename: str) -> str:
    """Detecter le type de preuve a partir de l'extension du fichier."""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    type_map = {
        "jpg": "PHOTO",
        "jpeg": "PHOTO",
        "png": "PHOTO",
        "tiff": "SATELLITE",
        "tif": "SATELLITE",
        "mp4": "VIDEO",
        "mov": "VIDEO",
        "pdf": "DOCUMENT",
        "doc": "DOCUMENT",
        "docx": "DOCUMENT",
        "geojson": "GEOSPATIAL",
        "shp": "GEOSPATIAL",
        "gpkg": "GEOSPATIAL",
    }
    return type_map.get(ext, "OTHER")
