"""
Routes de gestion des mineurs artisanaux.

Enregistrement avec biometrie et photo, generation de QR code,
consultation et mise a jour du statut de formation.
"""

from __future__ import annotations

import base64
import hashlib
import json
import uuid
from datetime import datetime, timezone
from io import BytesIO

import qrcode
import structlog
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from src.main import get_db, minio_client

logger = structlog.get_logger("goldpath.miners")

router = APIRouter(prefix="/miners", tags=["mineurs"])


# ---------------------------------------------------------------------------
# Schemas Pydantic
# ---------------------------------------------------------------------------

class MinerRegistrationResponse(BaseModel):
    """Reponse apres enregistrement d'un mineur."""
    miner_id: uuid.UUID
    qr_code_dataurl: str
    status: str


class MinerDetail(BaseModel):
    """Detail complet d'un mineur enregistre."""
    id: uuid.UUID
    full_name: str
    national_id: str
    phone: str | None
    photo_url: str | None
    qr_code_data: str | None
    status: str
    training_completed: bool
    training_date: datetime | None
    registered_by: str | None
    created_at: datetime


class MinerListResponse(BaseModel):
    """Reponse paginee de la liste des mineurs."""
    total: int
    miners: list[MinerDetail]
    page: int
    page_size: int


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _generate_qr_dataurl(data: str) -> str:
    """Generer un QR code au format Data URL (base64 PNG)."""
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=10,
        border=4,
    )
    qr.add_data(data)
    qr.make(fit=True)

    img = qr.make_image(fill_color="black", back_color="white")
    buffer = BytesIO()
    img.save(buffer, format="PNG")
    buffer.seek(0)

    # Encoder en base64 pour le Data URL
    b64 = base64.b64encode(buffer.getvalue()).decode("utf-8")
    return f"data:image/png;base64,{b64}"


def _hash_biometrics(biometrics: dict) -> str:
    """Calculer un hash SHA-256 des donnees biometriques pour stockage securise."""
    raw = json.dumps(biometrics, sort_keys=True)
    return hashlib.sha256(raw.encode()).hexdigest()


# ---------------------------------------------------------------------------
# POST /miners/register - Enregistrement d'un nouveau mineur
# ---------------------------------------------------------------------------

@router.post("/register", response_model=MinerRegistrationResponse, status_code=201)
async def register_miner(
    full_name: str = Form(..., description="Nom complet du mineur"),
    national_id: str = Form(..., description="Numero de piece d'identite nationale"),
    phone: str = Form(None, description="Numero de telephone"),
    biometrics: str = Form(..., description="Donnees biometriques au format JSON"),
    zone_polygon_wkt: str = Form(None, description="Polygone de zone autorisee au format WKT"),
    registered_by: str = Form(None, description="Identifiant de l'agent enregistreur"),
    photo: UploadFile = File(..., description="Photo d'identite du mineur"),
    db: Session = Depends(get_db),
):
    """
    Enregistrer un nouveau mineur artisanal.

    Accepte les donnees en multipart : informations personnelles,
    biometrie (JSON), et photo d'identite. Genere un QR code unique
    et stocke la photo dans MinIO.
    """
    miner_id = uuid.uuid4()
    now = datetime.now(timezone.utc)

    # Parser et hasher les donnees biometriques
    try:
        biometrics_dict = json.loads(biometrics)
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=400,
            detail="Les donnees biometriques doivent etre un JSON valide.",
        )
    biometrics_hash = _hash_biometrics(biometrics_dict)

    # Stocker la photo dans MinIO (bucket "miners")
    photo_content = await photo.read()
    photo_extension = photo.filename.rsplit(".", 1)[-1] if photo.filename and "." in photo.filename else "jpg"
    photo_object_name = f"{miner_id}.{photo_extension}"

    minio_client.put_object(
        bucket_name="miners",
        object_name=photo_object_name,
        data=BytesIO(photo_content),
        length=len(photo_content),
        content_type=photo.content_type or "image/jpeg",
    )
    photo_url = f"miners/{photo_object_name}"

    logger.info("photo_mineur_stockee", miner_id=str(miner_id), photo_url=photo_url)

    # Generer le QR code avec l'identifiant du mineur
    qr_dataurl = _generate_qr_dataurl(str(miner_id))

    # Preparer le polygone de zone (WKT -> geometry via ST_GeomFromText)
    zone_sql = "ST_GeomFromText(:zone_wkt, 4326)" if zone_polygon_wkt else "NULL"

    # Inserer dans la table miners_registry
    params = {
        "id": str(miner_id),
        "full_name": full_name,
        "national_id": national_id,
        "phone": phone,
        "photo_url": photo_url,
        "biometrics_hash": biometrics_hash,
        "qr_code_data": qr_dataurl,
        "status": "PENDING",
        "registered_by": registered_by,
        "created_at": now,
    }
    if zone_polygon_wkt:
        params["zone_wkt"] = zone_polygon_wkt

    db.execute(
        text(f"""
            INSERT INTO miners_registry
                (id, full_name, national_id, phone, photo_url,
                 biometrics_hash, qr_code_data, zone_polygon,
                 status, registered_by, created_at)
            VALUES
                (:id, :full_name, :national_id, :phone, :photo_url,
                 :biometrics_hash, :qr_code_data, {zone_sql},
                 :status, :registered_by, :created_at)
        """),
        params,
    )
    db.commit()

    logger.info(
        "mineur_enregistre",
        miner_id=str(miner_id),
        full_name=full_name,
        status="PENDING",
    )

    return MinerRegistrationResponse(
        miner_id=miner_id,
        qr_code_dataurl=qr_dataurl,
        status="PENDING",
    )


# ---------------------------------------------------------------------------
# GET /miners - Liste paginee des mineurs avec filtres
# ---------------------------------------------------------------------------

@router.get("", response_model=MinerListResponse)
async def list_miners(
    status: str | None = Query(None, description="Filtrer par statut (PENDING, APPROVED, REJECTED)"),
    zone: str | None = Query(None, description="Filtrer par region/zone"),
    page: int = Query(1, ge=1, description="Numero de page"),
    page_size: int = Query(20, ge=1, le=100, description="Taille de page"),
    db: Session = Depends(get_db),
):
    """Lister les mineurs enregistres avec filtres et pagination."""
    conditions = []
    params: dict = {
        "limit": page_size,
        "offset": (page - 1) * page_size,
    }

    if status:
        conditions.append("status = :status")
        params["status"] = status
    if zone:
        conditions.append("registered_by ILIKE :zone")
        params["zone"] = f"%{zone}%"

    where_clause = "WHERE " + " AND ".join(conditions) if conditions else ""

    # Compter le total
    count_row = db.execute(
        text(f"SELECT COUNT(*) AS total FROM miners_registry {where_clause}"),
        params,
    ).fetchone()
    total = count_row.total if count_row else 0

    # Recuperer la page
    rows = db.execute(
        text(f"""
            SELECT id, full_name, national_id, phone, photo_url,
                   qr_code_data, status, training_completed,
                   training_date, registered_by, created_at
            FROM miners_registry
            {where_clause}
            ORDER BY created_at DESC
            LIMIT :limit OFFSET :offset
        """),
        params,
    ).fetchall()

    miners = [
        MinerDetail(
            id=r.id,
            full_name=r.full_name,
            national_id=r.national_id,
            phone=r.phone,
            photo_url=r.photo_url,
            qr_code_data=r.qr_code_data,
            status=r.status,
            training_completed=r.training_completed or False,
            training_date=r.training_date,
            registered_by=r.registered_by,
            created_at=r.created_at,
        )
        for r in rows
    ]

    return MinerListResponse(
        total=total,
        miners=miners,
        page=page,
        page_size=page_size,
    )


# ---------------------------------------------------------------------------
# GET /miners/{miner_id} - Details d'un mineur
# ---------------------------------------------------------------------------

@router.get("/{miner_id}", response_model=MinerDetail)
async def get_miner(miner_id: uuid.UUID, db: Session = Depends(get_db)):
    """Recuperer les details complets d'un mineur par son identifiant."""
    row = db.execute(
        text("""
            SELECT id, full_name, national_id, phone, photo_url,
                   qr_code_data, status, training_completed,
                   training_date, registered_by, created_at
            FROM miners_registry
            WHERE id = :miner_id
        """),
        {"miner_id": str(miner_id)},
    ).fetchone()

    if not row:
        raise HTTPException(
            status_code=404,
            detail=f"Mineur {miner_id} non trouve dans le registre.",
        )

    return MinerDetail(
        id=row.id,
        full_name=row.full_name,
        national_id=row.national_id,
        phone=row.phone,
        photo_url=row.photo_url,
        qr_code_data=row.qr_code_data,
        status=row.status,
        training_completed=row.training_completed or False,
        training_date=row.training_date,
        registered_by=row.registered_by,
        created_at=row.created_at,
    )


# ---------------------------------------------------------------------------
# PUT /miners/{miner_id}/training - Marquer la formation comme terminee
# ---------------------------------------------------------------------------

@router.put("/{miner_id}/training")
async def update_training(miner_id: uuid.UUID, db: Session = Depends(get_db)):
    """
    Mettre a jour le statut de formation d'un mineur.

    Marque la formation comme terminee et enregistre la date.
    """
    result = db.execute(
        text("""
            UPDATE miners_registry
            SET training_completed = true,
                training_date = NOW()
            WHERE id = :miner_id
            RETURNING id, full_name, training_completed, training_date
        """),
        {"miner_id": str(miner_id)},
    )
    db.commit()

    row = result.fetchone()
    if not row:
        raise HTTPException(
            status_code=404,
            detail=f"Mineur {miner_id} non trouve dans le registre.",
        )

    logger.info(
        "formation_mineur_completee",
        miner_id=str(miner_id),
        full_name=row.full_name,
    )

    return {
        "miner_id": str(row.id),
        "full_name": row.full_name,
        "training_completed": row.training_completed,
        "training_date": row.training_date.isoformat() if row.training_date else None,
        "message": "Formation marquee comme terminee avec succes.",
    }
