"""Client MinIO pour le stockage d'images satellite et predictions."""

from io import BytesIO

from minio import Minio

from ..config import settings

_client: Minio | None = None


def get_minio_client() -> Minio:
    global _client
    if _client is None:
        _client = Minio(
            settings.minio_endpoint,
            access_key=settings.minio_access_key,
            secret_key=settings.minio_secret_key,
            secure=settings.minio_secure,
        )
    return _client


def upload_file(
    bucket: str, object_name: str, data: bytes, content_type: str = "application/octet-stream"
) -> str:
    client = get_minio_client()
    client.put_object(
        bucket,
        object_name,
        BytesIO(data),
        length=len(data),
        content_type=content_type,
    )
    return f"{bucket}/{object_name}"


def download_file(bucket: str, object_name: str) -> bytes:
    client = get_minio_client()
    response = client.get_object(bucket, object_name)
    try:
        return response.read()
    finally:
        response.close()
        response.release_conn()


def get_presigned_url(bucket: str, object_name: str, expires_hours: int = 1) -> str:
    from datetime import timedelta
    client = get_minio_client()
    return client.presigned_get_object(
        bucket, object_name, expires=timedelta(hours=expires_hours)
    )
