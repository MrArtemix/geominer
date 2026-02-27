from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api.routes.analysis import router as analysis_router
from .api.routes.health import router as health_router
from .api.routes.inference import router as inference_router
from .api.routes.sites import router as sites_router
from .config import settings
from .utils.logger import get_logger

logger = get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting MineSpot AI Service", version=settings.app_version)
    yield
    logger.info("Shutting down MineSpot AI Service")


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Prometheus metrics
try:
    from prometheus_fastapi_instrumentator import Instrumentator
    Instrumentator(
        should_group_status_codes=True,
        should_ignore_untemplated=True,
        excluded_handlers=["/health", "/ready", "/metrics"],
    ).instrument(app).expose(app, endpoint="/metrics")
except ImportError:
    pass

app.include_router(health_router)
app.include_router(sites_router)
app.include_router(inference_router)
app.include_router(analysis_router)
