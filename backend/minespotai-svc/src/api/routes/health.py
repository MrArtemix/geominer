from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from ...config import settings
from ...db.session import get_db

router = APIRouter(tags=["health"])


@router.get("/health")
def health():
    return {
        "status": "healthy",
        "service": "minespotai-svc",
        "version": settings.app_version,
    }


@router.get("/ready")
def ready(db: Session = Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))
        db_ok = True
    except Exception:
        db_ok = False

    return {
        "status": "ready" if db_ok else "degraded",
        "checks": {"database": db_ok},
    }
