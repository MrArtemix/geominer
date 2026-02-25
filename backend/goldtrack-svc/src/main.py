"""
GoldTrack Service - Blockchain wrapper for gold supply-chain tracking.

Provides endpoints for registering mining sites and recording gold transactions
on a blockchain ledger (placeholder implementation).
"""

import structlog
from contextlib import asynccontextmanager
from fastapi import FastAPI
from pydantic_settings import BaseSettings
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker


class Settings(BaseSettings):
    database_url: str = "postgresql://geominer:geominer_secret_2024@postgres:5432/geominerdb"
    service_name: str = "goldtrack-svc"
    host: str = "0.0.0.0"
    port: int = 8004
    debug: bool = False

    class Config:
        env_prefix = "GOLDTRACK_"


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


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("goldtrack_starting", port=settings.port)
    yield
    logger.info("goldtrack_shutting_down")


app = FastAPI(
    title="GoldTrack Service",
    description="Blockchain wrapper for gold mining site registration and transaction tracking.",
    version="1.0.0",
    lifespan=lifespan,
)


@app.get("/health", tags=["health"])
async def health():
    """Health check endpoint."""
    return {"status": "healthy", "service": settings.service_name}


# ------------------------------------------------------------------
# Register blockchain routes
# ------------------------------------------------------------------
from src.routes.blockchain import router as blockchain_router  # noqa: E402

app.include_router(blockchain_router)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("src.main:app", host=settings.host, port=settings.port, reload=settings.debug)
