"""
Routes blockchain GoldTrack enrichies.

Mode mock avec SHA-256 txid, ou futur connecteur Hyperledger Fabric.
Ajout: historique site, mise a jour statut, score de divergence H3.
"""

from __future__ import annotations

import hashlib
import json
import uuid
from datetime import datetime, timezone

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from src.main import get_db, settings

logger = structlog.get_logger("goldtrack.blockchain")

router = APIRouter(prefix="/blockchain", tags=["blockchain"])


# ---------------------------------------------------------------------------
# Schemas Pydantic
# ---------------------------------------------------------------------------

class SiteRegistrationRequest(BaseModel):
    site_id: uuid.UUID = Field(..., description="UUID du site minier")
    site_name: str = Field(..., description="Nom du site")
    latitude: float
    longitude: float
    registered_by: str | None = None


class SiteRegistrationResponse(BaseModel):
    site_id: uuid.UUID
    blockchain_txid: str
    registered_at: datetime
    status: str
    mock_mode: bool = True


class TransactionCreateRequest(BaseModel):
    site_id: uuid.UUID = Field(..., description="Site d'origine")
    from_entity: str = Field(..., description="Entite emettrice")
    to_entity: str = Field(..., description="Entite destinataire")
    quantity_grams: float = Field(..., gt=0, description="Quantite en grammes")
    is_legal: bool = Field(True, description="Transaction legale")
    h3_index: str | None = Field(None, description="Cellule H3 de la zone")
    metadata: dict | None = None


class TransactionResponse(BaseModel):
    id: uuid.UUID
    site_id: uuid.UUID
    blockchain_txid: str
    from_entity: str
    to_entity: str
    quantity_grams: float
    is_legal: bool
    metadata: dict | None
    created_at: datetime


class StatusUpdateRequest(BaseModel):
    status: str = Field(..., description="Nouveau statut")
    updated_by: str = Field("system", description="Auteur de la mise a jour")
    notes: str | None = None


class DivergenceResponse(BaseModel):
    h3_index: str
    total_legal_grams: float
    total_illegal_grams: float
    divergence_score: float
    transaction_count: int


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _generate_blockchain_txid(payload: str) -> str:
    """Generer un txid mock (SHA-256) simulant une transaction blockchain."""
    digest = hashlib.sha256(payload.encode()).hexdigest()
    return f"0x{digest}"


def _parse_metadata(row_metadata) -> dict | None:
    """Parser le champ metadata d'une ligne DB."""
    if isinstance(row_metadata, dict):
        return row_metadata
    if isinstance(row_metadata, str):
        try:
            return json.loads(row_metadata)
        except (json.JSONDecodeError, TypeError):
            return None
    return None


# ---------------------------------------------------------------------------
# Enregistrement de site
# ---------------------------------------------------------------------------

@router.post("/sites", response_model=SiteRegistrationResponse, status_code=201)
async def register_site(body: SiteRegistrationRequest, db: Session = Depends(get_db)):
    """Enregistrer un site minier sur la blockchain (mock)."""
    payload = f"{body.site_id}:{body.site_name}:{body.latitude}:{body.longitude}:{datetime.now(timezone.utc).isoformat()}"
    txid = _generate_blockchain_txid(payload)
    now = datetime.now(timezone.utc)

    db.execute(
        text("""
            INSERT INTO gold_transactions
                (id, site_id, blockchain_txid, from_entity, to_entity,
                 quantity_grams, is_legal, metadata, created_at)
            VALUES
                (:id, :site_id, :txid, :from_entity, :to_entity,
                 :quantity, :is_legal, :metadata, :created_at)
        """),
        {
            "id": str(uuid.uuid4()),
            "site_id": str(body.site_id),
            "txid": txid,
            "from_entity": body.registered_by or "system",
            "to_entity": "blockchain-registry",
            "quantity": 0,
            "is_legal": True,
            "metadata": json.dumps({
                "type": "site_registration",
                "site_name": body.site_name,
                "lat": body.latitude,
                "lng": body.longitude,
            }),
            "created_at": now,
        },
    )

    # Mettre a jour le txid sur le site minier
    db.execute(
        text("""
            UPDATE mining_sites
            SET blockchain_txid = :txid, updated_at = NOW()
            WHERE id = :site_id
        """),
        {"txid": txid, "site_id": str(body.site_id)},
    )
    db.commit()

    logger.info("site_enregistre", site_id=str(body.site_id), txid=txid)

    return SiteRegistrationResponse(
        site_id=body.site_id,
        blockchain_txid=txid,
        registered_at=now,
        status="confirmed",
        mock_mode=settings.use_mock_blockchain,
    )


# ---------------------------------------------------------------------------
# Historique blockchain d'un site
# ---------------------------------------------------------------------------

@router.get("/sites/{site_id}", response_model=list[TransactionResponse])
async def get_site_blockchain_records(site_id: uuid.UUID, db: Session = Depends(get_db)):
    """Retourner tous les enregistrements blockchain d'un site."""
    rows = db.execute(
        text("""
            SELECT id, site_id, blockchain_txid, from_entity, to_entity,
                   quantity_grams, is_legal, metadata, created_at
            FROM gold_transactions
            WHERE site_id = :site_id
            ORDER BY created_at DESC
        """),
        {"site_id": str(site_id)},
    ).fetchall()

    if not rows:
        raise HTTPException(status_code=404, detail=f"Aucun enregistrement blockchain pour le site {site_id}")

    return [
        TransactionResponse(
            id=r.id, site_id=r.site_id, blockchain_txid=r.blockchain_txid,
            from_entity=r.from_entity, to_entity=r.to_entity,
            quantity_grams=r.quantity_grams, is_legal=r.is_legal,
            metadata=_parse_metadata(r.metadata), created_at=r.created_at,
        )
        for r in rows
    ]


# ---------------------------------------------------------------------------
# Historique des changements de statut d'un site
# ---------------------------------------------------------------------------

@router.get("/sites/{site_id}/history")
async def get_site_status_history(site_id: uuid.UUID, db: Session = Depends(get_db)):
    """Retourner l'historique des statuts d'un site (depuis status_history JSONB)."""
    row = db.execute(
        text("""
            SELECT site_code, status, status_history
            FROM mining_sites WHERE id = :site_id
        """),
        {"site_id": str(site_id)},
    ).fetchone()

    if not row:
        raise HTTPException(status_code=404, detail=f"Site {site_id} non trouve")

    history = row.status_history if isinstance(row.status_history, list) else []

    return {
        "site_id": str(site_id),
        "site_code": row.site_code,
        "current_status": row.status,
        "history": history,
    }


# ---------------------------------------------------------------------------
# Mise a jour du statut d'un site via blockchain
# ---------------------------------------------------------------------------

@router.patch("/sites/{site_id}/status")
async def update_site_blockchain_status(
    site_id: uuid.UUID,
    body: StatusUpdateRequest,
    db: Session = Depends(get_db),
):
    """Mettre a jour le statut d'un site et enregistrer sur la blockchain."""
    # Generer un txid pour cette transition
    payload = f"status:{site_id}:{body.status}:{datetime.now(timezone.utc).isoformat()}"
    txid = _generate_blockchain_txid(payload)
    now = datetime.now(timezone.utc)

    # Enregistrer la transaction de changement de statut
    db.execute(
        text("""
            INSERT INTO gold_transactions
                (id, site_id, blockchain_txid, from_entity, to_entity,
                 quantity_grams, is_legal, metadata, created_at)
            VALUES
                (:id, :site_id, :txid, :from_entity, :to_entity,
                 0, true, :metadata, :created_at)
        """),
        {
            "id": str(uuid.uuid4()),
            "site_id": str(site_id),
            "txid": txid,
            "from_entity": body.updated_by,
            "to_entity": "status-update",
            "metadata": json.dumps({
                "type": "status_update",
                "new_status": body.status,
                "notes": body.notes,
            }),
            "created_at": now,
        },
    )

    # Mettre a jour le site avec historique JSONB
    history_entry = json.dumps({
        "status": body.status,
        "changed_at": now.isoformat(),
        "changed_by": body.updated_by,
        "blockchain_txid": txid,
        "notes": body.notes,
    })

    result = db.execute(
        text("""
            UPDATE mining_sites
            SET status = :status,
                blockchain_txid = :txid,
                status_history = COALESCE(status_history, '[]'::jsonb) || :history_entry::jsonb,
                updated_at = NOW()
            WHERE id = :site_id
            RETURNING id, site_code, status
        """),
        {
            "status": body.status,
            "txid": txid,
            "history_entry": history_entry,
            "site_id": str(site_id),
        },
    )
    db.commit()

    row = result.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail=f"Site {site_id} non trouve")

    logger.info("statut_site_mis_a_jour", site_id=str(site_id), status=body.status, txid=txid)

    return {
        "site_id": str(site_id),
        "site_code": row.site_code,
        "new_status": body.status,
        "blockchain_txid": txid,
        "mock_mode": settings.use_mock_blockchain,
    }


# ---------------------------------------------------------------------------
# Transactions d'or
# ---------------------------------------------------------------------------

@router.post("/transactions", response_model=TransactionResponse, status_code=201)
async def create_transaction(body: TransactionCreateRequest, db: Session = Depends(get_db)):
    """Enregistrer une transaction d'or sur la blockchain (mock)."""
    tx_id = uuid.uuid4()
    now = datetime.now(timezone.utc)

    payload = f"{tx_id}:{body.site_id}:{body.from_entity}:{body.to_entity}:{body.quantity_grams}:{now.isoformat()}"
    txid = _generate_blockchain_txid(payload)

    metadata_json = json.dumps(body.metadata) if body.metadata else None

    db.execute(
        text("""
            INSERT INTO gold_transactions
                (id, site_id, blockchain_txid, from_entity, to_entity,
                 quantity_grams, is_legal, metadata, created_at)
            VALUES
                (:id, :site_id, :txid, :from_entity, :to_entity,
                 :quantity, :is_legal, :metadata, :created_at)
        """),
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
        "transaction_enregistree",
        tx_id=str(tx_id),
        site_id=str(body.site_id),
        txid=txid,
        quantity=body.quantity_grams,
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
    is_legal: bool | None = Query(None, description="Filtrer par legalite"),
    from_entity: str | None = Query(None, description="Filtrer par emetteur"),
    to_entity: str | None = Query(None, description="Filtrer par destinataire"),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """Lister les transactions avec filtres optionnels."""
    conditions = []
    params: dict = {"limit": limit, "offset": offset}

    if is_legal is not None:
        conditions.append("is_legal = :is_legal")
        params["is_legal"] = is_legal
    if from_entity:
        conditions.append("from_entity = :from_entity")
        params["from_entity"] = from_entity
    if to_entity:
        conditions.append("to_entity = :to_entity")
        params["to_entity"] = to_entity

    where_clause = "WHERE " + " AND ".join(conditions) if conditions else ""

    rows = db.execute(
        text(f"""
            SELECT id, site_id, blockchain_txid, from_entity, to_entity,
                   quantity_grams, is_legal, metadata, created_at
            FROM gold_transactions
            {where_clause}
            ORDER BY created_at DESC
            LIMIT :limit OFFSET :offset
        """),
        params,
    ).fetchall()

    return [
        TransactionResponse(
            id=r.id, site_id=r.site_id, blockchain_txid=r.blockchain_txid,
            from_entity=r.from_entity, to_entity=r.to_entity,
            quantity_grams=r.quantity_grams, is_legal=r.is_legal,
            metadata=_parse_metadata(r.metadata), created_at=r.created_at,
        )
        for r in rows
    ]


@router.get("/transactions/{tx_id}", response_model=TransactionResponse)
async def get_transaction(tx_id: uuid.UUID, db: Session = Depends(get_db)):
    """Recuperer une transaction par son ID."""
    row = db.execute(
        text("""
            SELECT id, site_id, blockchain_txid, from_entity, to_entity,
                   quantity_grams, is_legal, metadata, created_at
            FROM gold_transactions WHERE id = :tx_id
        """),
        {"tx_id": str(tx_id)},
    ).fetchone()

    if not row:
        raise HTTPException(status_code=404, detail=f"Transaction {tx_id} non trouvee")

    return TransactionResponse(
        id=row.id, site_id=row.site_id, blockchain_txid=row.blockchain_txid,
        from_entity=row.from_entity, to_entity=row.to_entity,
        quantity_grams=row.quantity_grams, is_legal=row.is_legal,
        metadata=_parse_metadata(row.metadata), created_at=row.created_at,
    )


# ---------------------------------------------------------------------------
# Score de divergence H3
# ---------------------------------------------------------------------------

@router.get("/gold/divergence/{h3_index}", response_model=DivergenceResponse)
async def get_divergence_score(h3_index: str, db: Session = Depends(get_db)):
    """
    Calculer le score de divergence pour une zone H3.
    Score = |legal - illegal| / total.
    Proche de 0 = zone mixte suspecte, proche de 1 = zone homogene.
    """
    row = db.execute(
        text("""
            SELECT
                COALESCE(SUM(CASE WHEN is_legal THEN quantity_grams ELSE 0 END), 0) AS total_legal,
                COALESCE(SUM(CASE WHEN NOT is_legal THEN quantity_grams ELSE 0 END), 0) AS total_illegal,
                COUNT(*) AS tx_count
            FROM gold_transactions gt
            JOIN mining_sites ms ON gt.site_id = ms.id
            WHERE ms.h3_index_r7 = :h3_index
        """),
        {"h3_index": h3_index},
    ).fetchone()

    total_legal = float(row.total_legal)
    total_illegal = float(row.total_illegal)
    total = total_legal + total_illegal
    divergence = abs(total_legal - total_illegal) / total if total > 0 else 0.0

    return DivergenceResponse(
        h3_index=h3_index,
        total_legal_grams=total_legal,
        total_illegal_grams=total_illegal,
        divergence_score=round(divergence, 4),
        transaction_count=row.tx_count,
    )
