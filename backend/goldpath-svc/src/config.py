"""Configuration du service GoldPath via pydantic-settings."""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Parametres de configuration pour le service GoldPath (formalisation miniere)."""

    # Base de donnees PostgreSQL + PostGIS
    database_url: str = "postgresql://geominer:geominer2026@postgres:5432/geominerdb"

    # Redis (cache et streams)
    redis_url: str = "redis://:redis_secret_2024@redis:6379/0"

    # URLs des microservices partenaires
    goldtrack_url: str = "http://goldtrack-svc:8004"
    alertflow_url: str = "http://alertflow-svc:8003"

    # MinIO (stockage objets)
    minio_endpoint: str = "minio:9000"
    minio_access_key: str = "geominer"
    minio_secret_key: str = "geominer2026"
    minio_secure: bool = False

    # Identite du service
    service_name: str = "goldpath-svc"
    host: str = "0.0.0.0"
    port: int = 8006
    debug: bool = False

    model_config = {"env_prefix": "", "env_file": ".env"}


settings = Settings()
