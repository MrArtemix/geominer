"""
LegalVault Service - IPFS & evidence hashing for legal mining evidence.

Provides endpoints for uploading evidence files, computing cryptographic
hashes, storing files in MinIO (S3-compatible), generating simulated IPFS
CIDs, and verifying file integrity.
"""

import structlog
from contextlib import asynccontextmanager
from fastapi import FastAPI
from pydantic_settings import BaseSettings
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from minio import Minio


class Settings(BaseSettings):
    database_url: str = "postgresql://geominer:geominer_secret_2024@postgres:5432/geominerdb"
    minio_endpoint: str = "minio:9000"
    minio_access_key: str = "geominer-admin"
    minio_secret_key: str = "minio_secret_2024"
    minio_secure: bool = False
    minio_bucket: str = "evidence"
    service_name: str = "legalvault-svc"
    host: str = "0.0.0.0"
    port: int = 8005
    debug: bool = False

    class Config:
        env_prefix = "LEGALVAULT_"


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
    """Dependency that provides a database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_minio_client() -> Minio:
    """Create and return a MinIO client instance."""
    return Minio(
        settings.minio_endpoint,
        access_key=settings.minio_access_key,
        secret_key=settings.minio_secret_key,
        secure=settings.minio_secure,
    )


def _ensure_bucket(client: Minio, bucket: str):
    """Create the evidence bucket if it does not exist."""
    if not client.bucket_exists(bucket):
        client.make_bucket(bucket)
        logger.info("minio_bucket_created", bucket=bucket)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("legalvault_starting", port=settings.port)
    # Ensure the evidence bucket exists on startup
    try:
        minio_client = get_minio_client()
        _ensure_bucket(minio_client, settings.minio_bucket)
    except Exception as exc:
        logger.warning("minio_init_failed", error=str(exc))
    yield
    logger.info("legalvault_shutting_down")


app = FastAPI(
    title="LegalVault Service",
    description="Evidence hashing, IPFS CID generation, and file integrity verification for legal mining data.",
    version="1.0.0",
    lifespan=lifespan,
)


@app.get("/health", tags=["health"])
async def health():
    """Health check endpoint."""
    return {"status": "healthy", "service": settings.service_name}


# ------------------------------------------------------------------
# Register evidence routes
# ------------------------------------------------------------------
from src.routes.evidence import router as evidence_router  # noqa: E402

app.include_router(evidence_router)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("src.main:app", host=settings.host, port=settings.port, reload=settings.debug)
