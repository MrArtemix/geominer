"""Configuration centralisee de l'API Gateway via pydantic-settings."""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "Ge O'Miner API Gateway"
    app_version: str = "0.1.0"
    debug: bool = False

    # Server
    host: str = "0.0.0.0"
    port: int = 8000

    # Keycloak / JWT
    keycloak_url: str = "http://keycloak:8080"
    keycloak_realm: str = "geominer"
    keycloak_client_id: str = "geominer-api"
    keycloak_client_secret: str = "change-me-in-production"

    # Redis (cache tokens + streams)
    redis_url: str = "redis://:redis_secret_2024@redis:6379/0"

    # URLs des microservices
    minespotai_url: str = "http://minespotai-svc:8001"
    alertflow_url: str = "http://alertflow-svc:8003"
    goldtrack_url: str = "http://goldtrack-svc:8004"
    aquaguard_url: str = "http://aquaguard-svc:8005"
    goldpath_url: str = "http://goldpath-svc:8006"
    legalvault_url: str = "http://legalvault-svc:8007"

    # Rate limiting
    rate_limit: str = "100/minute"

    # CORS
    cors_origins: list[str] = [
        "http://localhost:3000",
        "https://geominer.ci",
    ]

    @property
    def keycloak_issuer_url(self) -> str:
        return f"{self.keycloak_url}/realms/{self.keycloak_realm}"

    @property
    def keycloak_jwks_url(self) -> str:
        return f"{self.keycloak_issuer_url}/protocol/openid-connect/certs"

    model_config = {"env_prefix": "", "env_file": ".env"}


settings = Settings()
