from typing import Annotated

import httpx
from fastapi import Depends, HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from pydantic import BaseModel

from ..config import settings

security = HTTPBearer()

_jwks_cache: dict | None = None


class TokenPayload(BaseModel):
    sub: str
    email: str | None = None
    preferred_username: str | None = None
    realm_roles: list[str] = []
    exp: int | None = None


async def _get_jwks() -> dict:
    global _jwks_cache
    if _jwks_cache is None:
        async with httpx.AsyncClient() as client:
            resp = await client.get(settings.keycloak_jwks_url)
            resp.raise_for_status()
            _jwks_cache = resp.json()
    return _jwks_cache


async def decode_token(
    credentials: Annotated[HTTPAuthorizationCredentials, Security(security)],
) -> TokenPayload:
    token = credentials.credentials
    try:
        jwks = await _get_jwks()
        unverified_header = jwt.get_unverified_header(token)
        key = None
        for k in jwks.get("keys", []):
            if k["kid"] == unverified_header.get("kid"):
                key = k
                break
        if key is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token signing key",
            )

        payload = jwt.decode(
            token,
            key,
            algorithms=["RS256"],
            audience="account",
            issuer=settings.keycloak_issuer_url,
        )

        realm_roles = (
            payload.get("realm_access", {}).get("roles", [])
        )

        return TokenPayload(
            sub=payload.get("sub", ""),
            email=payload.get("email"),
            preferred_username=payload.get("preferred_username"),
            realm_roles=realm_roles,
            exp=payload.get("exp"),
        )
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Token validation failed: {e}",
        ) from e


CurrentUser = Annotated[TokenPayload, Depends(decode_token)]


def require_roles(*allowed_roles: str):
    async def _check(user: CurrentUser) -> TokenPayload:
        if not any(r in user.realm_roles for r in allowed_roles):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Required roles: {', '.join(allowed_roles)}",
            )
        return user
    return _check
