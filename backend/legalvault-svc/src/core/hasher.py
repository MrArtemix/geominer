"""
Cryptographic hashing utilities for LegalVault.

Provides SHA-256 computation and verification for evidence files.
Supports both in-memory byte arrays and streaming file objects.
"""

import hashlib
from typing import BinaryIO

# Chunk size for streaming hash computation (64 KB)
_CHUNK_SIZE = 65_536


def compute_sha256(data: bytes) -> str:
    """
    Compute the SHA-256 hash of a byte array.

    Args:
        data: Raw bytes to hash.

    Returns:
        Lowercase hex-encoded SHA-256 digest string.
    """
    return hashlib.sha256(data).hexdigest()


def verify_hash(data: bytes, expected_hash: str) -> bool:
    """
    Verify that the SHA-256 hash of *data* matches *expected_hash*.

    Args:
        data: Raw bytes to hash.
        expected_hash: The expected hex-encoded SHA-256 digest.

    Returns:
        True if the computed hash matches expected_hash (case-insensitive),
        False otherwise.
    """
    computed = compute_sha256(data)
    return computed.lower() == expected_hash.lower()


def compute_sha256_stream(file_obj: BinaryIO) -> str:
    """
    Compute the SHA-256 hash of a file-like object by reading in chunks.

    This is memory-efficient and suitable for large files that should not
    be loaded entirely into memory.

    Args:
        file_obj: A binary file-like object supporting .read(size).
                  The caller is responsible for opening/closing the object.

    Returns:
        Lowercase hex-encoded SHA-256 digest string.
    """
    hasher = hashlib.sha256()
    while True:
        chunk = file_obj.read(_CHUNK_SIZE)
        if not chunk:
            break
        hasher.update(chunk)
    return hasher.hexdigest()
