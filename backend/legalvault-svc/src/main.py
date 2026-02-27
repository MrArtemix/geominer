"""
LegalVault Service - Stockage de preuves avec IPFS, MinIO et blockchain.

Upload de fichiers de preuves avec hash SHA-256, stockage sur IPFS (ou MinIO),
enregistrement sur la blockchain, et verification d'integrite.
"""

import os

import structlog
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic_settings import BaseSettings
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from minio import Minio


class Settings(BaseSettings):
    database_url: str = "postgresql://geominer:geominer2026@postgres:5432/geominerdb"
    minio_endpoint: str = "minio:9000"
    minio_access_key: str = "geominer"
    minio_secret_key: str = "geominer2026"
    minio_secure: bool = False
    minio_bucket: str = "evidence"
    ipfs_api_url: str = "http://ipfs:5001/api/v0"
    use_ipfs_fallback_minio: bool = True
    goldtrack_url: str = "http://goldtrack-svc:8004"
    service_name: str = "legalvault-svc"
    host: str = "0.0.0.0"
    port: int = 8007
    debug: bool = False

    model_config = {"env_prefix": "", "env_file": ".env"}


settings = Settings()

structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.add_log_level,
        structlog.processors.StackInfoRenderer(),
        structlog.dev.ConsoleRenderer(),
    ],
)
logger = structlog.get_logger(settings.service_name)

engine = create_engine(settings.database_url, pool_pre_ping=True, pool_size=5)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    """Dependance FastAPI pour session DB."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_minio_client() -> Minio:
    """Creer un client MinIO."""
    return Minio(
        settings.minio_endpoint,
        access_key=settings.minio_access_key,
        secret_key=settings.minio_secret_key,
        secure=settings.minio_secure,
    )


def _ensure_bucket(client: Minio, bucket: str):
    """Creer le bucket evidence s'il n'existe pas."""
    if not client.bucket_exists(bucket):
        client.make_bucket(bucket)
        logger.info("minio_bucket_cree", bucket=bucket)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("legalvault_demarrage", port=settings.port)
    try:
        minio_client = get_minio_client()
        _ensure_bucket(minio_client, settings.minio_bucket)
    except Exception as exc:
        logger.warning("minio_init_echec", error=str(exc))
    yield
    logger.info("legalvault_arret")


app = FastAPI(
    title="LegalVault Service",
    description="Stockage de preuves avec hachage SHA-256, IPFS, MinIO et blockchain.",
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


@app.get("/health", tags=["health"])
async def health():
    """Healthcheck du service LegalVault."""
    return {"status": "healthy", "service": settings.service_name}


@app.get("/ready", tags=["health"])
async def ready():
    return {"status": "ready"}


# Enregistrement des routes evidence
from src.routes.evidence import router as evidence_router  # noqa: E402

app.include_router(evidence_router)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("src.main:app", host=settings.host, port=settings.port, reload=settings.debug)
