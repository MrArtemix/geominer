"""
GoldTrack Service - Tracabilite blockchain de l'or.

Mode mock (USE_MOCK_BLOCKCHAIN=true) ou connecteur reel Hyperledger Fabric.
Enregistrement des sites, transactions, historique et score de divergence.
"""

import os

import structlog
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic_settings import BaseSettings
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker


class Settings(BaseSettings):
    database_url: str = "postgresql://geominer:geominer2026@postgres:5432/geominerdb"
    redis_url: str = "redis://:redis_secret_2024@redis:6379/0"
    service_name: str = "goldtrack-svc"
    host: str = "0.0.0.0"
    port: int = 8004
    debug: bool = False
    use_mock_blockchain: bool = True

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


@asynccontextmanager
async def lifespan(app: FastAPI):
    mode = "MOCK" if settings.use_mock_blockchain else "FABRIC"
    logger.info("goldtrack_demarrage", port=settings.port, mode=mode)
    yield
    logger.info("goldtrack_arret")


app = FastAPI(
    title="GoldTrack Service",
    description="Tracabilite blockchain pour l'or minier (mock ou Hyperledger Fabric).",
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
    """Healthcheck du service GoldTrack."""
    return {
        "status": "healthy",
        "service": settings.service_name,
        "mock_mode": settings.use_mock_blockchain,
    }


@app.get("/ready", tags=["health"])
async def ready():
    return {"status": "ready"}


# Enregistrement des routes blockchain
from src.routes.blockchain import router as blockchain_router  # noqa: E402

app.include_router(blockchain_router)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("src.main:app", host=settings.host, port=settings.port, reload=settings.debug)
