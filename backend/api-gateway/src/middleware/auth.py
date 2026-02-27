"""
Middleware d'authentification JWT Keycloak avec cache Redis.

Verification OIDC introspection + cache 5min sur hash du token.
get_current_user() -> UserContext(id, email, roles)
require_role(*roles) -> 403 si absent
"""

from __future__ import annotations

import hashlib
import json
from typing import Annotated

import httpx
from fastapi import Depends, HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from pydantic import BaseModel

from ..config import settings

security = HTTPBearer()

# Cache JWKS en memoire (rafraichi au redemarrage)
_jwks_cache: dict | None = None

# Cache Redis pour tokens valides (optionnel)
_redis_client = None

TOKEN_CACHE_TTL = 300  # 5 minutes


class UserContext(BaseModel):
    """Contexte utilisateur extrait du token JWT."""
    id: str
    email: str | None = None
    username: str | None = None
    roles: list[str] = []
    exp: int | None = None


def _get_redis():
    """Obtenir le client Redis (lazy init)."""
    global _redis_client
    if _redis_client is None:
        try:
            import redis
            _redis_client = redis.from_url(settings.redis_url, decode_responses=True)
            _redis_client.ping()
        except Exception:
            _redis_client = False  # Desactiver le cache
    return _redis_client if _redis_client is not False else None


def _token_cache_key(token: str) -> str:
    """Generer la cle de cache Redis pour un token (hash SHA-256)."""
    token_hash = hashlib.sha256(token.encode()).hexdigest()[:16]
    return f"auth:token:{token_hash}"


async def _get_jwks() -> dict:
    """Recuperer les JWKS depuis Keycloak (avec cache memoire)."""
    global _jwks_cache
    if _jwks_cache is None:
        async with httpx.AsyncClient() as client:
            resp = await client.get(settings.keycloak_jwks_url)
            resp.raise_for_status()
            _jwks_cache = resp.json()
    return _jwks_cache


def _invalidate_jwks():
    """Invalider le cache JWKS (appele en cas d'echec de verification)."""
    global _jwks_cache
    _jwks_cache = None


async def verify_jwt_token(
    credentials: Annotated[HTTPAuthorizationCredentials, Security(security)],
) -> UserContext:
    """
    Verifier le token JWT et retourner le contexte utilisateur.
    Cache Redis 5min sur le hash du token pour eviter les appels JWKS repetes.
    """
    token = credentials.credentials

    # Verifier le cache Redis
    redis_client = _get_redis()
    if redis_client:
        cache_key = _token_cache_key(token)
        cached = redis_client.get(cache_key)
        if cached:
            return UserContext(**json.loads(cached))

    try:
        jwks = await _get_jwks()
        unverified_header = jwt.get_unverified_header(token)
        key = None
        for k in jwks.get("keys", []):
            if k["kid"] == unverified_header.get("kid"):
                key = k
                break

        if key is None:
            # Tenter de rafraichir les JWKS (rotation de cles)
            _invalidate_jwks()
            jwks = await _get_jwks()
            for k in jwks.get("keys", []):
                if k["kid"] == unverified_header.get("kid"):
                    key = k
                    break

        if key is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Cle de signature du token invalide",
            )

        payload = jwt.decode(
            token,
            key,
            algorithms=["RS256"],
            audience="account",
            issuer=settings.keycloak_issuer_url,
        )

        realm_roles = payload.get("realm_access", {}).get("roles", [])

        user = UserContext(
            id=payload.get("sub", ""),
            email=payload.get("email"),
            username=payload.get("preferred_username"),
            roles=realm_roles,
            exp=payload.get("exp"),
        )

        # Mettre en cache Redis
        if redis_client:
            cache_key = _token_cache_key(token)
            redis_client.setex(cache_key, TOKEN_CACHE_TTL, user.model_dump_json())

        return user

    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Validation du token echouee: {e}",
        ) from e


# Alias pour injection de dependance
CurrentUser = Annotated[UserContext, Depends(verify_jwt_token)]


def get_current_user():
    """Dependance FastAPI pour obtenir l'utilisateur courant."""
    return Depends(verify_jwt_token)


def require_role(*allowed_roles: str):
    """
    Fabrique de dependance pour exiger un ou plusieurs roles.
    Retourne 403 si l'utilisateur n'a aucun des roles requis.
    """
    async def _check(user: CurrentUser) -> UserContext:
        if not any(r in user.roles for r in allowed_roles):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Roles requis: {', '.join(allowed_roles)}",
            )
        return user
    return _check
