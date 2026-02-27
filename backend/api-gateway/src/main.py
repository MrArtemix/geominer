"""
Ge O'Miner - API Gateway principal.

FastAPI + CORS + SlowAPI rate-limit 100req/min/IP.
Proxy vers tous les microservices avec audit middleware.
"""

from contextlib import asynccontextmanager
from datetime import datetime, timezone
import uuid

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
import httpx

from .api.routes.proxy import router as proxy_router
from .config import settings

limiter = Limiter(key_func=get_remote_address, default_limits=[settings.rate_limit])

# Client Redis pour l'audit (optionnel)
_redis_audit = None


def _get_audit_redis():
    """Client Redis pour ecrire les logs d'audit."""
    global _redis_audit
    if _redis_audit is None:
        try:
            import redis
            _redis_audit = redis.from_url(settings.redis_url, decode_responses=True)
            _redis_audit.ping()
        except Exception:
            _redis_audit = False
    return _redis_audit if _redis_audit is not False else None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifecycle de l'application."""
    yield


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    docs_url="/docs" if settings.debug else None,
    redoc_url="/redoc" if settings.debug else None,
    lifespan=lifespan,
)

app.state.limiter = limiter

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Middleware d'audit (log mutations POST/PUT/PATCH/DELETE) ---
@app.middleware("http")
async def audit_middleware(request: Request, call_next):
    """Logger les mutations dans la table audit_logs via Redis Stream."""
    request_id = str(uuid.uuid4())
    request.state.request_id = request_id

    response = await call_next(request)

    # Logger les mutations (POST, PUT, PATCH, DELETE)
    if request.method in ("POST", "PUT", "PATCH", "DELETE"):
        redis_client = _get_audit_redis()
        if redis_client:
            try:
                redis_client.xadd(
                    "audit:requests",
                    {
                        "request_id": request_id,
                        "method": request.method,
                        "path": str(request.url.path),
                        "status_code": str(response.status_code),
                        "ip_address": request.client.host if request.client else "unknown",
                        "user_agent": request.headers.get("user-agent", "")[:200],
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    },
                    maxlen=10000,
                )
            except Exception:
                pass  # Ne pas bloquer la requete si Redis echoue

    return response


@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={"detail": "Limite de requetes depassee. Veuillez ralentir."},
    )


# --- Routes sante ---

@app.get("/health")
async def health():
    """Healthcheck simple du gateway."""
    return {
        "status": "healthy",
        "service": "api-gateway",
        "version": settings.app_version,
    }


@app.get("/health/services")
async def health_services():
    """Ping tous les microservices et retourner leur statut."""
    services = {
        "minespotai": settings.minespotai_url,
        "alertflow": settings.alertflow_url,
        "goldtrack": settings.goldtrack_url,
        "aquaguard": settings.aquaguard_url,
        "goldpath": settings.goldpath_url,
        "legalvault": settings.legalvault_url,
    }

    results = {}
    async with httpx.AsyncClient(timeout=5.0) as client:
        for name, url in services.items():
            try:
                resp = await client.get(f"{url}/health")
                results[name] = {
                    "status": "healthy" if resp.status_code == 200 else "unhealthy",
                    "code": resp.status_code,
                }
            except Exception as e:
                results[name] = {
                    "status": "unreachable",
                    "error": str(e)[:100],
                }

    all_healthy = all(r["status"] == "healthy" for r in results.values())
    return {
        "gateway": "healthy",
        "services": results,
        "all_healthy": all_healthy,
    }


@app.get("/ready")
async def ready():
    return {"status": "ready"}


# --- Health probes SLA (Prompt 14) ---

_startup_time = datetime.now(timezone.utc)


@app.get("/health/live")
async def health_live():
    """
    Liveness probe pour Kubernetes.
    Retourne 200 si le processus est vivant.
    """
    return {
        "status": "alive",
        "service": "api-gateway",
        "uptime_seconds": (datetime.now(timezone.utc) - _startup_time).total_seconds(),
    }


@app.get("/health/ready")
async def health_ready():
    """
    Readiness probe pour Kubernetes.
    Verifie la connectivite vers les dependances critiques
    (PostgreSQL, Redis, MinIO).
    """
    checks = {}
    all_ready = True

    # Verifier Redis
    try:
        redis_client = _get_audit_redis()
        if redis_client:
            redis_client.ping()
            checks["redis"] = {"status": "connected"}
        else:
            checks["redis"] = {"status": "unavailable"}
            all_ready = False
    except Exception as e:
        checks["redis"] = {"status": "error", "detail": str(e)[:100]}
        all_ready = False

    # Verifier PostgreSQL via un service backend
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(f"{settings.minespotai_url}/health")
            if resp.status_code == 200:
                checks["database"] = {"status": "connected"}
            else:
                checks["database"] = {"status": "degraded"}
                all_ready = False
    except Exception as e:
        checks["database"] = {"status": "error", "detail": str(e)[:100]}
        all_ready = False

    # Verifier MinIO
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get("http://minio:9000/minio/health/live")
            if resp.status_code == 200:
                checks["minio"] = {"status": "connected"}
            else:
                checks["minio"] = {"status": "degraded"}
                all_ready = False
    except Exception as e:
        checks["minio"] = {"status": "error", "detail": str(e)[:100]}
        all_ready = False

    status_code = 200 if all_ready else 503
    return JSONResponse(
        status_code=status_code,
        content={
            "status": "ready" if all_ready else "not_ready",
            "checks": checks,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        },
    )


@app.get("/health/metrics")
async def health_metrics():
    """
    Metriques SLA pour le monitoring.
    Retourne les metriques de performance et de disponibilite.
    """
    import os

    uptime = (datetime.now(timezone.utc) - _startup_time).total_seconds()

    # SLA targets depuis les variables d'environnement
    sla_targets = {
        "availability_target_percent": float(
            os.getenv("SLA_AVAILABILITY_TARGET", "99.9")
        ),
        "dashboard_response_target_ms": int(
            os.getenv("SLA_DASHBOARD_RESPONSE_MS", "2000")
        ),
        "analysis_response_target_ms": int(
            os.getenv("SLA_ANALYSIS_RESPONSE_MS", "30000")
        ),
        "max_concurrent_users": int(
            os.getenv("SLA_MAX_CONCURRENT_USERS", "1000000")
        ),
    }

    return {
        "service": "api-gateway",
        "version": settings.app_version,
        "uptime_seconds": round(uptime, 2),
        "sla_targets": sla_targets,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/")
async def root():
    return {
        "message": "Bienvenue sur l'API Gateway Ge O'Miner",
        "docs": "/docs",
        "health": "/health",
        "health_live": "/health/live",
        "health_ready": "/health/ready",
        "health_metrics": "/health/metrics",
        "services": "/health/services",
    }


# Prometheus metrics
try:
    from prometheus_fastapi_instrumentator import Instrumentator
    Instrumentator(
        should_group_status_codes=True,
        should_ignore_untemplated=True,
        excluded_handlers=["/health", "/health/live", "/health/ready", "/ready", "/metrics"],
    ).instrument(app).expose(app, endpoint="/metrics")
except ImportError:
    pass

app.include_router(proxy_router)
