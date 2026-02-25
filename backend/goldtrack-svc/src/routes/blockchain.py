"""
Blockchain routes - register sites and record gold transactions on-chain.

This is a placeholder implementation that simulates blockchain interactions
by storing transaction IDs in the gold_transactions table in PostgreSQL.
"""

import uuid
import hashlib
from datetime import datetime, timezone
from typing import Optional

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from src.main import get_db

logger = structlog.get_logger("goldtrack.blockchain")

router = APIRouter(prefix="/blockchain", tags=["blockchain"])


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class SiteRegistrationRequest(BaseModel):
    site_id: uuid.UUID = Field(..., description="Mining site UUID to register on chain")
    site_name: str = Field(..., description="Human-readable site name")
    latitude: float
    longitude: float
    registered_by: Optional[str] = None


class SiteRegistrationResponse(BaseModel):
    site_id: uuid.UUID
    blockchain_txid: str
    registered_at: datetime
    status: str


class TransactionCreateRequest(BaseModel):
    site_id: uuid.UUID = Field(..., description="Origin mining site")
    from_entity: str = Field(..., description="Seller / source entity")
    to_entity: str = Field(..., description="Buyer / destination entity")
    quantity_grams: float = Field(..., gt=0, description="Gold quantity in grams")
    is_legal: bool = Field(True, description="Whether the transaction is from a legal source")
    metadata: Optional[dict] = None


class TransactionResponse(BaseModel):
    id: uuid.UUID
    site_id: uuid.UUID
    blockchain_txid: str
    from_entity: str
    to_entity: str
    quantity_grams: float
    is_legal: bool
    metadata: Optional[dict]
    created_at: datetime


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _generate_blockchain_txid(payload: str) -> str:
    """
    Generate a deterministic, fake blockchain transaction ID.

    In production this would submit a real transaction to the chain and
    return the resulting txid.  Here we simply SHA-256-hash the payload
    and prefix it with '0x' to mimic an Ethereum-style txid.
    """
    digest = hashlib.sha256(payload.encode()).hexdigest()
    return f"0x{digest}"


# ---------------------------------------------------------------------------
# Site registration
# ---------------------------------------------------------------------------

@router.post("/sites", response_model=SiteRegistrationResponse, status_code=201)
async def register_site(body: SiteRegistrationRequest, db: Session = Depends(get_db)):
    """Register a mining site on the blockchain (placeholder)."""

    payload = f"{body.site_id}:{body.site_name}:{body.latitude}:{body.longitude}:{datetime.now(timezone.utc).isoformat()}"
    txid = _generate_blockchain_txid(payload)
    now = datetime.now(timezone.utc)

    # Store the blockchain reference in gold_transactions as a registration event
    db.execute(
        text(
            """
            INSERT INTO gold_transactions
                (id, site_id, blockchain_txid, from_entity, to_entity,
                 quantity_grams, is_legal, metadata, created_at)
            VALUES
                (:id, :site_id, :txid, :from_entity, :to_entity,
                 :quantity, :is_legal, :metadata, :created_at)
            """
        ),
        {
            "id": str(uuid.uuid4()),
            "site_id": str(body.site_id),
            "txid": txid,
            "from_entity": body.registered_by or "system",
            "to_entity": "blockchain-registry",
            "quantity": 0,
            "is_legal": True,
            "metadata": f'{{"type":"site_registration","site_name":"{body.site_name}","lat":{body.latitude},"lng":{body.longitude}}}',
            "created_at": now,
        },
    )
    db.commit()

    logger.info("site_registered", site_id=str(body.site_id), txid=txid)

    return SiteRegistrationResponse(
        site_id=body.site_id,
        blockchain_txid=txid,
        registered_at=now,
        status="confirmed",
    )


@router.get("/sites/{site_id}", response_model=list[TransactionResponse])
async def get_site_blockchain_records(site_id: uuid.UUID, db: Session = Depends(get_db)):
    """Return all blockchain records associated with a mining site."""

    rows = db.execute(
        text(
            """
            SELECT id, site_id, blockchain_txid, from_entity, to_entity,
                   quantity_grams, is_legal, metadata, created_at
            FROM gold_transactions
            WHERE site_id = :site_id
            ORDER BY created_at DESC
            """
        ),
        {"site_id": str(site_id)},
    ).fetchall()

    if not rows:
        raise HTTPException(status_code=404, detail=f"No blockchain records found for site {site_id}")

    results = []
    for r in rows:
        meta = r.metadata if isinstance(r.metadata, dict) else None
        results.append(
            TransactionResponse(
                id=r.id,
                site_id=r.site_id,
                blockchain_txid=r.blockchain_txid,
                from_entity=r.from_entity,
                to_entity=r.to_entity,
                quantity_grams=r.quantity_grams,
                is_legal=r.is_legal,
                metadata=meta,
                created_at=r.created_at,
            )
        )
    return results


# ---------------------------------------------------------------------------
# Gold transactions
# ---------------------------------------------------------------------------

@router.post("/transactions", response_model=TransactionResponse, status_code=201)
async def create_transaction(body: TransactionCreateRequest, db: Session = Depends(get_db)):
    """Record a gold transaction on the blockchain (placeholder)."""

    tx_id = uuid.uuid4()
    now = datetime.now(timezone.utc)

    payload = f"{tx_id}:{body.site_id}:{body.from_entity}:{body.to_entity}:{body.quantity_grams}:{now.isoformat()}"
    txid = _generate_blockchain_txid(payload)

    metadata_json = None
    if body.metadata:
        import json
        metadata_json = json.dumps(body.metadata)

    db.execute(
        text(
            """
            INSERT INTO gold_transactions
                (id, site_id, blockchain_txid, from_entity, to_entity,
                 quantity_grams, is_legal, metadata, created_at)
            VALUES
                (:id, :site_id, :txid, :from_entity, :to_entity,
                 :quantity, :is_legal, :metadata, :created_at)
            """
        ),
        {
            "id": str(tx_id),
            "site_id": str(body.site_id),
            "txid": txid,
            "from_entity": body.from_entity,
            "to_entity": body.to_entity,
            "quantity": body.quantity_grams,
            "is_legal": body.is_legal,
            "metadata": metadata_json,
            "created_at": now,
        },
    )
    db.commit()

    logger.info(
        "transaction_recorded",
        tx_id=str(tx_id),
        site_id=str(body.site_id),
        txid=txid,
        quantity=body.quantity_grams,
        is_legal=body.is_legal,
    )

    return TransactionResponse(
        id=tx_id,
        site_id=body.site_id,
        blockchain_txid=txid,
        from_entity=body.from_entity,
        to_entity=body.to_entity,
        quantity_grams=body.quantity_grams,
        is_legal=body.is_legal,
        metadata=body.metadata,
        created_at=now,
    )


@router.get("/transactions", response_model=list[TransactionResponse])
async def list_transactions(
    is_legal: Optional[bool] = Query(None, description="Filter by legality status"),
    from_entity: Optional[str] = Query(None, description="Filter by source entity"),
    to_entity: Optional[str] = Query(None, description="Filter by destination entity"),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """List gold transactions with optional filters."""

    conditions = []
    params: dict = {"limit": limit, "offset": offset}

    if is_legal is not None:
        conditions.append("is_legal = :is_legal")
        params["is_legal"] = is_legal

    if from_entity is not None:
        conditions.append("from_entity = :from_entity")
        params["from_entity"] = from_entity

    if to_entity is not None:
        conditions.append("to_entity = :to_entity")
        params["to_entity"] = to_entity

    where_clause = "WHERE " + " AND ".join(conditions) if conditions else ""

    query = f"""
        SELECT id, site_id, blockchain_txid, from_entity, to_entity,
               quantity_grams, is_legal, metadata, created_at
        FROM gold_transactions
        {where_clause}
        ORDER BY created_at DESC
        LIMIT :limit OFFSET :offset
    """

    rows = db.execute(text(query), params).fetchall()

    results = []
    for r in rows:
        meta = r.metadata if isinstance(r.metadata, dict) else None
        results.append(
            TransactionResponse(
                id=r.id,
                site_id=r.site_id,
                blockchain_txid=r.blockchain_txid,
                from_entity=r.from_entity,
                to_entity=r.to_entity,
                quantity_grams=r.quantity_grams,
                is_legal=r.is_legal,
                metadata=meta,
                created_at=r.created_at,
            )
        )
    return results


@router.get("/transactions/{tx_id}", response_model=TransactionResponse)
async def get_transaction(tx_id: uuid.UUID, db: Session = Depends(get_db)):
    """Retrieve a single gold transaction by its ID."""

    row = db.execute(
        text(
            """
            SELECT id, site_id, blockchain_txid, from_entity, to_entity,
                   quantity_grams, is_legal, metadata, created_at
            FROM gold_transactions
            WHERE id = :tx_id
            """
        ),
        {"tx_id": str(tx_id)},
    ).fetchone()

    if not row:
        raise HTTPException(status_code=404, detail=f"Transaction {tx_id} not found")

    meta = row.metadata if isinstance(row.metadata, dict) else None

    return TransactionResponse(
        id=row.id,
        site_id=row.site_id,
        blockchain_txid=row.blockchain_txid,
        from_entity=row.from_entity,
        to_entity=row.to_entity,
        quantity_grams=row.quantity_grams,
        is_legal=row.is_legal,
        metadata=meta,
        created_at=row.created_at,
    )
