"""
AquaGuard IoT Service - FastAPI application.

Ingests water-quality telemetry from MQTT-connected sensors, persists
readings to PostgreSQL, and raises alerts via Redis Streams when OMS
thresholds are breached.
"""

from __future__ import annotations

import threading
from contextlib import asynccontextmanager

import structlog
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.ingestor import start_mqtt_subscriber
from src.routes.sensors import router as sensors_router

log = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown lifecycle hook."""
    log.info("aquaguard_svc.starting")

    # Launch the MQTT subscriber in a daemon thread so it does not
    # block the async event loop.
    mqtt_thread = threading.Thread(
        target=start_mqtt_subscriber,
        name="mqtt-subscriber",
        daemon=True,
    )
    mqtt_thread.start()
    log.info("aquaguard_svc.mqtt_thread_started")

    yield  # application is running

    log.info("aquaguard_svc.shutting_down")


app = FastAPI(
    title="AquaGuard IoT Service",
    description="Water-quality sensor ingestion and alerting micro-service.",
    version="0.1.0",
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
# Routes
# ---------------------------------------------------------------------------
app.include_router(sensors_router)


@app.get("/health", tags=["health"])
async def health():
    """Liveness / readiness probe."""
    return {"status": "ok", "service": "aquaguard-svc"}


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    uvicorn.run(
        "src.main:app",
        host="0.0.0.0",
        port=8003,
        reload=True,
    )
