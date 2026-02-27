"""Configuration du service Reporting via pydantic-settings."""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Parametres de configuration pour le service Reporting (rapports et indicateurs)."""

    # Base de donnees PostgreSQL + PostGIS
    database_url: str = "postgresql://geominer:geominer2026@postgres:5432/geominerdb"

    # Redis (cache)
    redis_url: str = "redis://:redis_secret_2024@redis:6379/0"

    # MinIO (stockage des rapports PDF)
    minio_endpoint: str = "minio:9000"
    minio_access_key: str = "geominer"
    minio_secret_key: str = "geominer2026"
    minio_secure: bool = False
    minio_bucket_reports: str = "reports"

    # Identite du service
    service_name: str = "reporting-svc"
    host: str = "0.0.0.0"
    port: int = 8010
    debug: bool = False

    model_config = {"env_prefix": "", "env_file": ".env"}


settings = Settings()
