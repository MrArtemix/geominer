"""
GoldPath Service - Formalisation et suivi des mineurs artisanaux.

Gestion des enregistrements de mineurs, delivrance de permis artisanaux,
geofencing des zones autorisees, et generation de QR codes d'identification.
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
    """Demarrage et arret du service GoldPath."""
    logger.info("goldpath_demarrage", port=settings.port)

    # Creer les buckets MinIO si necessaire
    for bucket_name in ("miners", "permits"):
        if not minio_client.bucket_exists(bucket_name):
            minio_client.make_bucket(bucket_name)
            logger.info("minio_bucket_cree", bucket=bucket_name)

    yield
    logger.info("goldpath_arret")


# ---------------------------------------------------------------------------
# Application FastAPI
# ---------------------------------------------------------------------------
app = FastAPI(
    title="GoldPath Service",
    description="Service de formalisation miniere : enregistrement des mineurs, permis artisanaux et geofencing.",
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
    """Healthcheck du service GoldPath."""
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
from src.routes.miners import router as miners_router  # noqa: E402
from src.routes.permits import router as permits_router  # noqa: E402
from src.core.geofencing import router as geofencing_router  # noqa: E402

app.include_router(miners_router)
app.include_router(permits_router)
app.include_router(geofencing_router)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "src.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
    )
