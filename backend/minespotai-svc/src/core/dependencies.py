from typing import Annotated

import httpx
from fastapi import Depends, HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..config import settings
from ..db.session import get_db

security = HTTPBearer(auto_error=False)

_jwks_cache: dict | None = None


class CurrentUser(BaseModel):
    sub: str
    email: str | None = None
    roles: list[str] = []


async def _get_jwks() -> dict:
    global _jwks_cache
    if _jwks_cache is None:
        jwks_url = f"{settings.keycloak_url}/realms/{settings.keycloak_realm}/protocol/openid-connect/certs"
        async with httpx.AsyncClient() as client:
            resp = await client.get(jwks_url)
            resp.raise_for_status()
            _jwks_cache = resp.json()
    return _jwks_cache


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Security(security),
) -> CurrentUser | None:
    if credentials is None:
        return None

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
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid signing key")

        payload = jwt.decode(
            token,
            key,
            algorithms=["RS256"],
            audience="account",
            issuer=f"{settings.keycloak_url}/realms/{settings.keycloak_realm}",
        )
        return CurrentUser(
            sub=payload.get("sub", ""),
            email=payload.get("email"),
            roles=payload.get("realm_access", {}).get("roles", []),
        )
    except JWTError as e:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, str(e)) from e


def require_auth(user: CurrentUser | None = Depends(get_current_user)) -> CurrentUser:
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Authentication required")
    return user


DBSession = Annotated[Session, Depends(get_db)]
AuthUser = Annotated[CurrentUser, Depends(require_auth)]
