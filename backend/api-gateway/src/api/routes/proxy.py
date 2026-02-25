from fastapi import APIRouter, Request, Response

import httpx

from ...config import settings

router = APIRouter()

SERVICE_MAP = {
    "sites": settings.minespotai_url,
    "infer": settings.minespotai_url,
    "alerts": settings.alertflow_url,
    "sensors": settings.aquaguard_url,
    "aquaguard": settings.aquaguard_url,
    "blockchain": settings.goldtrack_url,
    "goldtrack": settings.goldtrack_url,
    "evidence": settings.legalvault_url,
    "legalvault": settings.legalvault_url,
}


def _resolve_upstream(path: str) -> str | None:
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
    upstream = _resolve_upstream(f"/api/{path}")
    if upstream is None:
        return Response(
            content='{"detail": "Service not found"}',
            status_code=404,
            media_type="application/json",
        )

    target_url = f"{upstream}/{path}"

    headers = dict(request.headers)
    headers.pop("host", None)

    body = await request.body()

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.request(
            method=request.method,
            url=target_url,
            headers=headers,
            content=body,
            params=request.query_params,
        )

    return Response(
        content=resp.content,
        status_code=resp.status_code,
        headers=dict(resp.headers),
        media_type=resp.headers.get("content-type"),
    )
