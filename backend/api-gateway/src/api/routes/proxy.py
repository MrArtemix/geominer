"""
Proxy inverse vers les microservices backend.

Route toutes les requetes /api/{service}/... vers le service correspondant.
Transmet les headers d'authentification (X-User-ID, X-User-Roles, X-Request-Id).
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Request, Response
import httpx

from ...config import settings

router = APIRouter()

# Mapping service_key -> URL upstream
SERVICE_MAP = {
    "sites": settings.minespotai_url,
    "infer": settings.minespotai_url,
    "alerts": settings.alertflow_url,
    "sensors": settings.aquaguard_url,
    "aquaguard": settings.aquaguard_url,
    "blockchain": settings.goldtrack_url,
    "goldtrack": settings.goldtrack_url,
    "gold": settings.goldtrack_url,
    "evidence": settings.legalvault_url,
    "legalvault": settings.legalvault_url,
    "miners": settings.goldpath_url,
    "permits": settings.goldpath_url,
    "geofencing": settings.goldpath_url,
    "goldpath": settings.goldpath_url,
}


def _resolve_upstream(path: str) -> str | None:
    """Resoudre l'URL upstream a partir du chemin de la requete."""
    parts = path.strip("/").split("/")
    if len(parts) >= 2:
        service_key = parts[1]
        return SERVICE_MAP.get(service_key)
    return None


@router.api_route(
    "/api/{path:path}",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
)
async def proxy(request: Request, path: str) -> Response:
    """Proxy transparent vers les microservices avec forwarding des headers."""
    upstream = _resolve_upstream(f"/api/{path}")
    if upstream is None:
        return Response(
            content='{"detail": "Service non trouve"}',
            status_code=404,
            media_type="application/json",
        )

    target_url = f"{upstream}/{path}"

    # Preparer les headers a transmettre
    headers = dict(request.headers)
    headers.pop("host", None)

    # Generer un ID de requete unique pour le tracage
    request_id = headers.get("x-request-id", str(uuid.uuid4()))
    headers["X-Request-Id"] = request_id

    # Transmettre les infos utilisateur si presentes dans le state
    if hasattr(request.state, "user_id"):
        headers["X-User-ID"] = request.state.user_id
    if hasattr(request.state, "user_roles"):
        headers["X-User-Roles"] = request.state.user_roles

    body = await request.body()

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.request(
            method=request.method,
            url=target_url,
            headers=headers,
            content=body,
            params=request.query_params,
        )

    # Transmettre les headers de reponse (sauf ceux internes)
    response_headers = dict(resp.headers)
    response_headers.pop("transfer-encoding", None)

    return Response(
        content=resp.content,
        status_code=resp.status_code,
        headers=response_headers,
        media_type=resp.headers.get("content-type"),
    )
