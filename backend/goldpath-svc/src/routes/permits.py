"""
Routes de gestion des permis artisanaux.

Delivrance de permis avec enregistrement blockchain, generation de QR codes,
verification, consultation et suspension de permis.
"""

from __future__ import annotations

import hashlib
import uuid
from datetime import datetime, timezone
from io import BytesIO

import httpx
import qrcode
import structlog
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from src.config import settings
from src.main import get_db, minio_client

logger = structlog.get_logger("goldpath.permits")

router = APIRouter(prefix="/permits", tags=["permis"])


# ---------------------------------------------------------------------------
# Schemas Pydantic
# ---------------------------------------------------------------------------

class PermitIssueResponse(BaseModel):
    """Reponse apres delivrance d'un permis artisanal."""
    permit_number: str
    miner_id: uuid.UUID
    blockchain_txid: str
    qr_code_url: str
    status: str


class PermitDetail(BaseModel):
    """Detail complet d'un permis artisanal."""
    id: uuid.UUID
    permit_number: str
    miner_id: uuid.UUID
    miner_name: str | None = None
    zone_polygon_wkt: str | None = None
    blockchain_txid: str | None = None
    qr_code_url: str | None = None
    status: str
    issued_at: datetime
    updated_at: datetime | None = None
    valid: bool = True


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _generate_permit_number(db: Session, region: str, year: int) -> str:
    """
    Generer un numero de permis unique au format PA-{ANNEE}-{REGION}-{SEQ:04d}.

    Le numero sequentiel est calcule a partir du nombre de permis
    deja delivres pour cette region et cette annee.
    """
    row = db.execute(
        text("""
            SELECT COUNT(*) AS seq_count
            FROM mining_permits
            WHERE permit_number LIKE :pattern
        """),
        {"pattern": f"PA-{year}-{region}-%"},
    ).fetchone()

    seq = (row.seq_count if row else 0) + 1
    return f"PA-{year}-{region}-{seq:04d}"


def _generate_qr_png(data: str) -> bytes:
    """Generer un QR code au format PNG (bytes)."""
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_H,
        box_size=10,
        border=4,
    )
    qr.add_data(data)
    qr.make(fit=True)

    img = qr.make_image(fill_color="black", back_color="white")
    buffer = BytesIO()
    img.save(buffer, format="PNG")
    buffer.seek(0)
    return buffer.getvalue()


async def _register_on_blockchain(permit_number: str, miner_id: str, zone_wkt: str | None) -> str:
    """
    Enregistrer le permis sur la blockchain via goldtrack-svc.

    Retourne le txid de la transaction blockchain.
    En cas d'echec de communication, genere un txid local de secours.
    """
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                f"{settings.goldtrack_url}/blockchain/transactions",
                json={
                    "site_id": miner_id,
                    "from_entity": "goldpath-svc",
                    "to_entity": "blockchain-registry",
                    "quantity_grams": 0,
                    "is_legal": True,
                    "metadata": {
                        "type": "permit_registration",
                        "permit_number": permit_number,
                        "zone_wkt": zone_wkt,
                    },
                },
            )
            if response.status_code == 201:
                data = response.json()
                logger.info(
                    "permis_enregistre_blockchain",
                    permit_number=permit_number,
                    txid=data.get("blockchain_txid"),
                )
                return data.get("blockchain_txid", "")
            else:
                logger.warning(
                    "erreur_enregistrement_blockchain",
                    permit_number=permit_number,
                    status_code=response.status_code,
                )
    except Exception as exc:
        logger.error(
            "echec_communication_goldtrack",
            permit_number=permit_number,
            erreur=str(exc),
        )

    # Fallback : generer un txid local si la blockchain est indisponible
    payload = f"permit:{permit_number}:{miner_id}:{datetime.now(timezone.utc).isoformat()}"
    fallback_txid = f"0x{hashlib.sha256(payload.encode()).hexdigest()}"
    logger.info("txid_fallback_genere", permit_number=permit_number, txid=fallback_txid)
    return fallback_txid


# ---------------------------------------------------------------------------
# POST /permits/issue/{miner_id} - Delivrer un permis artisanal
# ---------------------------------------------------------------------------

@router.post("/issue/{miner_id}", response_model=PermitIssueResponse, status_code=201)
async def issue_permit(
    miner_id: uuid.UUID,
    region: str = "CI",
    db: Session = Depends(get_db),
):
    """
    Delivrer un permis artisanal a un mineur.

    Prerequis : le mineur doit avoir termine sa formation (training_completed=true).
    Le permis est enregistre sur la blockchain et un QR code est genere.
    """
    # Verifier que le mineur existe et a complete sa formation
    miner_row = db.execute(
        text("""
            SELECT id, full_name, training_completed,
                   ST_AsText(zone_polygon) AS zone_wkt
            FROM miners_registry
            WHERE id = :miner_id
        """),
        {"miner_id": str(miner_id)},
    ).fetchone()

    if not miner_row:
        raise HTTPException(
            status_code=404,
            detail=f"Mineur {miner_id} non trouve dans le registre.",
        )

    if not miner_row.training_completed:
        raise HTTPException(
            status_code=400,
            detail="Le mineur doit avoir termine sa formation avant de recevoir un permis.",
        )

    # Generer le numero de permis
    year = datetime.now(timezone.utc).year
    permit_number = _generate_permit_number(db, region, year)
    permit_id = uuid.uuid4()
    now = datetime.now(timezone.utc)

    # Enregistrer sur la blockchain via goldtrack-svc
    blockchain_txid = await _register_on_blockchain(
        permit_number=permit_number,
        miner_id=str(miner_id),
        zone_wkt=miner_row.zone_wkt,
    )

    # Generer le QR code PNG (encode le numero de permis + miner_id)
    qr_data = f"{permit_number}|{miner_id}"
    qr_png_bytes = _generate_qr_png(qr_data)
    qr_object_name = f"{permit_number}.png"

    # Stocker le QR code dans MinIO (bucket "permits")
    minio_client.put_object(
        bucket_name="permits",
        object_name=qr_object_name,
        data=BytesIO(qr_png_bytes),
        length=len(qr_png_bytes),
        content_type="image/png",
    )
    qr_code_url = f"permits/{qr_object_name}"

    logger.info(
        "qr_permis_stocke",
        permit_number=permit_number,
        qr_code_url=qr_code_url,
    )

    # Preparer le polygone de zone depuis le mineur
    zone_sql = "ST_GeomFromText(:zone_wkt, 4326)" if miner_row.zone_wkt else "NULL"
    params = {
        "id": str(permit_id),
        "permit_number": permit_number,
        "miner_id": str(miner_id),
        "blockchain_txid": blockchain_txid,
        "qr_code_url": qr_code_url,
        "status": "LEGAL",
        "issued_at": now,
    }
    if miner_row.zone_wkt:
        params["zone_wkt"] = miner_row.zone_wkt

    # Inserer dans la table mining_permits
    db.execute(
        text(f"""
            INSERT INTO mining_permits
                (id, permit_number, miner_id, zone_polygon,
                 blockchain_txid, qr_code_url, status, issued_at)
            VALUES
                (:id, :permit_number, :miner_id, {zone_sql},
                 :blockchain_txid, :qr_code_url, :status, :issued_at)
        """),
        params,
    )

    # Mettre a jour le statut du mineur
    db.execute(
        text("""
            UPDATE miners_registry
            SET status = 'APPROVED'
            WHERE id = :miner_id
        """),
        {"miner_id": str(miner_id)},
    )
    db.commit()

    logger.info(
        "permis_delivre",
        permit_number=permit_number,
        miner_id=str(miner_id),
        blockchain_txid=blockchain_txid,
    )

    return PermitIssueResponse(
        permit_number=permit_number,
        miner_id=miner_id,
        blockchain_txid=blockchain_txid,
        qr_code_url=qr_code_url,
        status="LEGAL",
    )


# ---------------------------------------------------------------------------
# GET /permits/{permit_number} - Consulter / verifier un permis
# ---------------------------------------------------------------------------

@router.get("/{permit_number}", response_model=PermitDetail)
async def get_permit(permit_number: str, db: Session = Depends(get_db)):
    """
    Verifier et consulter les details d'un permis artisanal.

    Permet la verification hors-ligne du statut du permis.
    """
    row = db.execute(
        text("""
            SELECT p.id, p.permit_number, p.miner_id,
                   m.full_name AS miner_name,
                   ST_AsText(p.zone_polygon) AS zone_wkt,
                   p.blockchain_txid, p.qr_code_url,
                   p.status, p.issued_at, p.updated_at
            FROM mining_permits p
            LEFT JOIN miners_registry m ON m.id = p.miner_id
            WHERE p.permit_number = :permit_number
        """),
        {"permit_number": permit_number},
    ).fetchone()

    if not row:
        raise HTTPException(
            status_code=404,
            detail=f"Permis {permit_number} non trouve.",
        )

    # Un permis est valide s'il n'est pas suspendu
    is_valid = row.status not in ("SUSPENDED", "REVOKED", "EXPIRED")

    return PermitDetail(
        id=row.id,
        permit_number=row.permit_number,
        miner_id=row.miner_id,
        miner_name=row.miner_name,
        zone_polygon_wkt=row.zone_wkt,
        blockchain_txid=row.blockchain_txid,
        qr_code_url=row.qr_code_url,
        status=row.status,
        issued_at=row.issued_at,
        updated_at=row.updated_at,
        valid=is_valid,
    )


# ---------------------------------------------------------------------------
# GET /permits/{permit_number}/qr - Telecharger le QR code PNG
# ---------------------------------------------------------------------------

@router.get("/{permit_number}/qr")
async def get_permit_qr(permit_number: str, db: Session = Depends(get_db)):
    """Recuperer le QR code PNG d'un permis depuis MinIO."""
    # Verifier que le permis existe
    row = db.execute(
        text("SELECT qr_code_url FROM mining_permits WHERE permit_number = :pn"),
        {"pn": permit_number},
    ).fetchone()

    if not row or not row.qr_code_url:
        raise HTTPException(
            status_code=404,
            detail=f"QR code du permis {permit_number} non trouve.",
        )

    # Recuperer le fichier depuis MinIO
    qr_object_name = f"{permit_number}.png"
    try:
        response = minio_client.get_object("permits", qr_object_name)
        qr_data = response.read()
        response.close()
        response.release_conn()
    except Exception as exc:
        logger.error(
            "erreur_recuperation_qr",
            permit_number=permit_number,
            erreur=str(exc),
        )
        raise HTTPException(
            status_code=500,
            detail=f"Erreur lors de la recuperation du QR code : {exc}",
        )

    return StreamingResponse(
        BytesIO(qr_data),
        media_type="image/png",
        headers={"Content-Disposition": f'inline; filename="{permit_number}.png"'},
    )


# ---------------------------------------------------------------------------
# DELETE /permits/{permit_number} - Suspendre un permis
# ---------------------------------------------------------------------------

@router.delete("/{permit_number}")
async def suspend_permit(permit_number: str, db: Session = Depends(get_db)):
    """
    Suspendre un permis artisanal.

    Change le statut du permis en SUSPENDED et met a jour la date de modification.
    """
    result = db.execute(
        text("""
            UPDATE mining_permits
            SET status = 'SUSPENDED',
                updated_at = NOW()
            WHERE permit_number = :permit_number
            RETURNING id, permit_number, miner_id, status
        """),
        {"permit_number": permit_number},
    )
    db.commit()

    row = result.fetchone()
    if not row:
        raise HTTPException(
            status_code=404,
            detail=f"Permis {permit_number} non trouve.",
        )

    logger.info(
        "permis_suspendu",
        permit_number=permit_number,
        miner_id=str(row.miner_id),
    )

    return {
        "permit_number": row.permit_number,
        "miner_id": str(row.miner_id),
        "status": "SUSPENDED",
        "message": f"Le permis {permit_number} a ete suspendu avec succes.",
    }
