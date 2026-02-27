"""
Reporting Service - Generation de rapports et indicateurs Ge O'Miner.

Production de rapports PDF, exports CSV, metriques de synthese
et indicateurs de contribution aux ODD (Objectifs de Developpement Durable).
"""

import structlog
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from minio import Minio
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from src.config import settings

# ---------------------------------------------------------------------------
# Configuration structlog
# ---------------------------------------------------------------------------
structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.add_log_level,
        structlog.processors.StackInfoRenderer(),
        structlog.dev.ConsoleRenderer(),
    ],
)
logger = structlog.get_logger(settings.service_name)

# ---------------------------------------------------------------------------
# Connexion base de donnees (SQLAlchemy)
# ---------------------------------------------------------------------------
engine = create_engine(settings.database_url, pool_pre_ping=True, pool_size=5)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    """Dependance FastAPI pour obtenir une session de base de donnees."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Client MinIO
# ---------------------------------------------------------------------------
minio_client = Minio(
    settings.minio_endpoint,
    access_key=settings.minio_access_key,
    secret_key=settings.minio_secret_key,
    secure=settings.minio_secure,
)


# ---------------------------------------------------------------------------
# Cycle de vie de l'application
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Demarrage et arret du service Reporting."""
    logger.info("reporting_demarrage", port=settings.port)

    # Creer le bucket MinIO pour les rapports si necessaire
    if not minio_client.bucket_exists(settings.minio_bucket_reports):
        minio_client.make_bucket(settings.minio_bucket_reports)
        logger.info("minio_bucket_cree", bucket=settings.minio_bucket_reports)

    yield
    logger.info("reporting_arret")


# ---------------------------------------------------------------------------
# Application FastAPI
# ---------------------------------------------------------------------------
app = FastAPI(
    title="Reporting Service",
    description="Service de generation de rapports, metriques et exports pour Ge O'Miner.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Routes de sante
# ---------------------------------------------------------------------------
@app.get("/health", tags=["health"])
async def health():
    """Healthcheck du service Reporting."""
    return {
        "status": "healthy",
        "service": settings.service_name,
    }


@app.get("/ready", tags=["health"])
async def ready():
    """Verification de disponibilite du service."""
    return {"status": "ready"}


# ---------------------------------------------------------------------------
# Enregistrement des routeurs
# ---------------------------------------------------------------------------
from src.routes.reports import router as reports_router  # noqa: E402

app.include_router(reports_router)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "src.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
    )
