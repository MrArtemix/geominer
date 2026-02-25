from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "MineSpot AI Service"
    app_version: str = "0.1.0"
    debug: bool = False

    # Database
    database_url: str = "postgresql://geominer:geominer_secret_2024@postgres:5432/geominerdb"
    db_pool_size: int = 10
    db_max_overflow: int = 20

    # Redis
    redis_url: str = "redis://:redis_secret_2024@redis:6379/0"

    # MinIO
    minio_endpoint: str = "minio:9000"
    minio_access_key: str = "geominer-admin"
    minio_secret_key: str = "minio_secret_2024"
    minio_secure: bool = False
    minio_bucket_raw: str = "raw-satellite"
    minio_bucket_predictions: str = "predictions"

    # Model
    model_weights_path: str = "src/models/weights/minespot_segformer_b4.pt"
    model_device: str = "cpu"
    inference_batch_size: int = 4
    confidence_threshold: float = 0.7

    # Keycloak
    keycloak_url: str = "http://keycloak:8080"
    keycloak_realm: str = "geominer"

    model_config = {"env_prefix": "", "env_file": ".env"}


settings = Settings()
