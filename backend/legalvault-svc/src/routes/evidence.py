"""
Evidence routes - upload, retrieve, verify, and list evidence files.

Files are stored in MinIO and referenced in the evidence_files table.
Each upload produces a SHA-256 hash and a simulated IPFS CID.
"""

import io
import uuid
from datetime import datetime, timezone
from typing import Optional

import structlog
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from src.main import get_db, get_minio_client, settings
from src.core.hasher import compute_sha256, compute_sha256_stream, verify_hash
from src.core.ipfs_client import generate_cid

logger = structlog.get_logger("legalvault.evidence")

router = APIRouter(prefix="/evidence", tags=["evidence"])


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class EvidenceUploadResponse(BaseModel):
    id: uuid.UUID
    site_id: uuid.UUID
    original_filename: str
    sha256_hash: str
    ipfs_cid: str
    file_size_bytes: int
    uploaded_at: datetime


class EvidenceMetadataResponse(BaseModel):
    id: uuid.UUID
    site_id: uuid.UUID
    original_filename: str
    sha256_hash: str
    ipfs_cid: str
    file_size_bytes: int
    uploaded_by: Optional[str]
    uploaded_at: datetime


class VerificationResponse(BaseModel):
    id: uuid.UUID
    original_filename: str
    stored_hash: str
    computed_hash: str
    hashes_match: bool
    verified_at: datetime


# ---------------------------------------------------------------------------
# POST /evidence  -  Upload evidence file
# ---------------------------------------------------------------------------

@router.post("", response_model=EvidenceUploadResponse, status_code=201)
async def upload_evidence(
    file: UploadFile = File(..., description="Evidence file to upload"),
    site_id: uuid.UUID = Form(..., description="Associated mining site ID"),
    uploaded_by: Optional[str] = Form(None, description="Name or ID of uploader"),
    db: Session = Depends(get_db),
):
    """
    Upload an evidence file.

    1. Read the file contents
    2. Compute SHA-256 hash
    3. Store file in MinIO "evidence" bucket
    4. Generate a simulated IPFS CID from the hash
    5. Insert metadata into the evidence_files table
    6. Return CID, hash, and record ID
    """
    contents = await file.read()
    file_size = len(contents)

    # Compute SHA-256 hash
    sha256_hash = compute_sha256(contents)

    # Generate simulated IPFS CID
    ipfs_cid = generate_cid(sha256_hash)

    # Store in MinIO
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
        logger.error("minio_upload_failed", error=str(exc), evidence_id=str(evidence_id))
        raise HTTPException(status_code=502, detail=f"Failed to store file in object storage: {exc}")

    now = datetime.now(timezone.utc)

    # Insert into evidence_files table
    db.execute(
        text(
            """
            INSERT INTO evidence_files
                (id, site_id, original_filename, sha256_hash, ipfs_cid,
                 file_size_bytes, minio_object_name, uploaded_by, uploaded_at)
            VALUES
                (:id, :site_id, :filename, :sha256, :cid,
                 :file_size, :object_name, :uploaded_by, :uploaded_at)
            """
        ),
        {
            "id": str(evidence_id),
            "site_id": str(site_id),
            "filename": file.filename,
            "sha256": sha256_hash,
            "cid": ipfs_cid,
            "file_size": file_size,
            "object_name": object_name,
            "uploaded_by": uploaded_by,
            "uploaded_at": now,
        },
    )
    db.commit()

    logger.info(
        "evidence_uploaded",
        evidence_id=str(evidence_id),
        site_id=str(site_id),
        filename=file.filename,
        sha256=sha256_hash,
        cid=ipfs_cid,
        size=file_size,
    )

    return EvidenceUploadResponse(
        id=evidence_id,
        site_id=site_id,
        original_filename=file.filename,
        sha256_hash=sha256_hash,
        ipfs_cid=ipfs_cid,
        file_size_bytes=file_size,
        uploaded_at=now,
    )


# ---------------------------------------------------------------------------
# GET /evidence/{id}  -  Get evidence metadata
# ---------------------------------------------------------------------------

@router.get("/{evidence_id}", response_model=EvidenceMetadataResponse)
async def get_evidence(evidence_id: uuid.UUID, db: Session = Depends(get_db)):
    """Retrieve metadata for a single evidence file."""

    row = db.execute(
        text(
            """
            SELECT id, site_id, original_filename, sha256_hash, ipfs_cid,
                   file_size_bytes, uploaded_by, uploaded_at
            FROM evidence_files
            WHERE id = :id
            """
        ),
        {"id": str(evidence_id)},
    ).fetchone()

    if not row:
        raise HTTPException(status_code=404, detail=f"Evidence {evidence_id} not found")

    return EvidenceMetadataResponse(
        id=row.id,
        site_id=row.site_id,
        original_filename=row.original_filename,
        sha256_hash=row.sha256_hash,
        ipfs_cid=row.ipfs_cid,
        file_size_bytes=row.file_size_bytes,
        uploaded_by=row.uploaded_by,
        uploaded_at=row.uploaded_at,
    )


# ---------------------------------------------------------------------------
# GET /evidence/{id}/verify  -  Verify file integrity
# ---------------------------------------------------------------------------

@router.get("/{evidence_id}/verify", response_model=VerificationResponse)
async def verify_evidence(evidence_id: uuid.UUID, db: Session = Depends(get_db)):
    """
    Re-download the file from MinIO, recompute its SHA-256 hash, and compare
    with the stored hash to verify integrity.
    """

    row = db.execute(
        text(
            """
            SELECT id, original_filename, sha256_hash, minio_object_name
            FROM evidence_files
            WHERE id = :id
            """
        ),
        {"id": str(evidence_id)},
    ).fetchone()

    if not row:
        raise HTTPException(status_code=404, detail=f"Evidence {evidence_id} not found")

    # Download from MinIO
    minio_client = get_minio_client()
    try:
        response = minio_client.get_object(settings.minio_bucket, row.minio_object_name)
        file_data = response.read()
        response.close()
        response.release_conn()
    except Exception as exc:
        logger.error("minio_download_failed", error=str(exc), evidence_id=str(evidence_id))
        raise HTTPException(status_code=502, detail=f"Failed to retrieve file from object storage: {exc}")

    # Recompute hash
    computed_hash = compute_sha256(file_data)
    hashes_match = verify_hash(file_data, row.sha256_hash)
    now = datetime.now(timezone.utc)

    logger.info(
        "evidence_verified",
        evidence_id=str(evidence_id),
        hashes_match=hashes_match,
        stored_hash=row.sha256_hash,
        computed_hash=computed_hash,
    )

    return VerificationResponse(
        id=row.id,
        original_filename=row.original_filename,
        stored_hash=row.sha256_hash,
        computed_hash=computed_hash,
        hashes_match=hashes_match,
        verified_at=now,
    )


# ---------------------------------------------------------------------------
# GET /evidence/site/{site_id}  -  List evidence for a site
# ---------------------------------------------------------------------------

@router.get("/site/{site_id}", response_model=list[EvidenceMetadataResponse])
async def list_evidence_for_site(
    site_id: uuid.UUID,
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """List all evidence files associated with a given mining site."""

    rows = db.execute(
        text(
            """
            SELECT id, site_id, original_filename, sha256_hash, ipfs_cid,
                   file_size_bytes, uploaded_by, uploaded_at
            FROM evidence_files
            WHERE site_id = :site_id
            ORDER BY uploaded_at DESC
            LIMIT :limit OFFSET :offset
            """
        ),
        {"site_id": str(site_id), "limit": limit, "offset": offset},
    ).fetchall()

    return [
        EvidenceMetadataResponse(
            id=r.id,
            site_id=r.site_id,
            original_filename=r.original_filename,
            sha256_hash=r.sha256_hash,
            ipfs_cid=r.ipfs_cid,
            file_size_bytes=r.file_size_bytes,
            uploaded_by=r.uploaded_by,
            uploaded_at=r.uploaded_at,
        )
        for r in rows
    ]
