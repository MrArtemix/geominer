"""
AquaGuard IoT Service - Application FastAPI.

Ingestion de telemetrie qualite de l'eau via MQTT, persistance
dans TimescaleDB (hypertable), et alertes via alertflow-svc.
"""

from __future__ import annotations

import threading
from contextlib import asynccontextmanager

import structlog
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .ingestor import start_mqtt_subscriber
from .routes.sensors import router as sensors_router

log = structlog.get_logger()

APP_NAME = "AquaGuard IoT Service"
APP_VERSION = "0.1.0"


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Demarrage / arret du service."""
    log.info("aquaguard_svc.demarrage", version=APP_VERSION)

    # Lancer le souscripteur MQTT dans un thread daemon
    mqtt_thread = threading.Thread(
        target=start_mqtt_subscriber,
        name="mqtt-subscriber",
        daemon=True,
    )
    mqtt_thread.start()
    log.info("aquaguard_svc.mqtt_thread_demarre")

    yield

    log.info("aquaguard_svc.arret")


app = FastAPI(
    title=APP_NAME,
    description="Service d'ingestion IoT capteurs qualite de l'eau.",
    version=APP_VERSION,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routes capteurs
app.include_router(sensors_router)


@app.get("/health", tags=["health"])
async def health():
    """Healthcheck du service AquaGuard."""
    return {"status": "healthy", "service": "aquaguard-svc", "version": APP_VERSION}


@app.get("/ready", tags=["health"])
async def ready():
    return {"status": "ready"}


if __name__ == "__main__":
    uvicorn.run("src.main:app", host="0.0.0.0", port=8005, reload=True)
