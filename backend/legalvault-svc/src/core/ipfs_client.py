"""
Client IPFS pour LegalVault.

Supporte 3 modes :
1. IPFS reel via Kubo HTTP API (si IPFS_API_URL est configure)
2. Fallback MinIO (si USE_IPFS_FALLBACK_MINIO=true)
3. CID simule (mode par defaut en dev)
"""

from __future__ import annotations

import base64
import os

import httpx
import structlog

log = structlog.get_logger()

IPFS_API_URL = os.getenv("IPFS_API_URL", "http://ipfs:5001/api/v0")
USE_IPFS_FALLBACK_MINIO = os.getenv("USE_IPFS_FALLBACK_MINIO", "true").lower() == "true"


# ---------------------------------------------------------------------------
# Client IPFS reel (Kubo HTTP API)
# ---------------------------------------------------------------------------

async def add_to_ipfs(data: bytes, filename: str) -> str | None:
    """
    Ajouter un fichier a IPFS via l'API Kubo.
    Retourne le CID reel, ou None si IPFS n'est pas disponible.
    """
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{IPFS_API_URL}/add",
                files={"file": (filename, data)},
            )
            response.raise_for_status()
            result = response.json()
            cid = result.get("Hash")
            log.info("ipfs.fichier_ajoute", filename=filename, cid=cid)
            return cid
    except Exception as exc:
        log.warning("ipfs.echec_ajout", error=str(exc), filename=filename)
        return None


async def pin_to_ipfs(cid: str) -> bool:
    """Epingler un CID pour empecher le garbage collection."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                f"{IPFS_API_URL}/pin/add",
                params={"arg": cid},
            )
            response.raise_for_status()
            log.info("ipfs.fichier_epingle", cid=cid)
            return True
    except Exception as exc:
        log.warning("ipfs.echec_epinglage", error=str(exc), cid=cid)
        return False


async def get_from_ipfs(cid: str) -> bytes | None:
    """Recuperer un fichier depuis IPFS par son CID."""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{IPFS_API_URL}/cat",
                params={"arg": cid},
            )
            response.raise_for_status()
            return response.content
    except Exception as exc:
        log.warning("ipfs.echec_recuperation", error=str(exc), cid=cid)
        return None


# ---------------------------------------------------------------------------
# CID simule (fallback quand IPFS non disponible)
# ---------------------------------------------------------------------------

def generate_cid(sha256_hex: str) -> str:
    """
    Generer un CID simule de type CIDv1 a partir d'un hash SHA-256.
    Prefixe "bafy" pour imiter le format CIDv1 (dag-pb + sha2-256).
    """
    raw_bytes = bytes.fromhex(sha256_hex)
    b32 = base64.b32encode(raw_bytes).decode("ascii").lower().rstrip("=")
    return f"bafy{b32}"


def cid_to_sha256(cid: str) -> str:
    """Inverser un CID simule pour retrouver le hash SHA-256."""
    b32_part = cid[4:]
    padding = (8 - len(b32_part) % 8) % 8
    b32_padded = b32_part.upper() + "=" * padding
    raw_bytes = base64.b32decode(b32_padded)
    return raw_bytes.hex()


# ---------------------------------------------------------------------------
# Fonction principale : ajouter avec fallback
# ---------------------------------------------------------------------------

async def store_evidence(
    data: bytes,
    filename: str,
    sha256_hash: str,
) -> tuple[str, str]:
    """
    Stocker un fichier de preuve et retourner (cid, storage_mode).

    Essaie d'abord IPFS reel, puis fallback sur CID simule.
    Le stockage physique MinIO est gere separement dans evidence.py.

    Retourne:
        (cid, "ipfs") si IPFS reel fonctionne
        (cid, "mock") si CID simule
    """
    # Tenter IPFS reel
    real_cid = await add_to_ipfs(data, filename)
    if real_cid:
        await pin_to_ipfs(real_cid)
        return real_cid, "ipfs"

    # Fallback : CID simule
    mock_cid = generate_cid(sha256_hash)
    log.info("ipfs.fallback_mock_cid", filename=filename, cid=mock_cid)
    return mock_cid, "mock"
