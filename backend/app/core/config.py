"""Application settings, loaded from environment variables / .env file."""

from functools import lru_cache

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    # --- API metadata -----------------------------------------------------
    PROJECT_NAME: str = "Darukaa.Earth"
    VERSION: str = "1.0.0"
    API_V1_PREFIX: str = "/api/v1"
    ENVIRONMENT: str = "development"
    LOG_LEVEL: str = "INFO"

    # --- Database ---------------------------------------------------------
    DATABASE_URL: str = "postgresql+psycopg://darukaa:darukaa@localhost:5432/darukaa"
    DB_POOL_SIZE: int = 5
    DB_MAX_OVERFLOW: int = 10
    DB_ECHO: bool = False

    # --- Auth -------------------------------------------------------------
    SECRET_KEY: str = "change-me-to-a-long-random-string"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # --- CORS -------------------------------------------------------------
    BACKEND_CORS_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173"

    # --- Seed data --------------------------------------------------------
    FIRST_SUPERUSER_EMAIL: str = "admin@darukaa.earth"
    FIRST_SUPERUSER_PASSWORD: str = "Admin@12345"

    @field_validator("BACKEND_CORS_ORIGINS")
    @classmethod
    def _strip_origins(cls, value: str) -> str:
        return ",".join(origin.strip() for origin in value.split(",") if origin.strip())

    @property
    def cors_origins(self) -> list[str]:
        """CORS origins parsed into the list shape Starlette expects."""
        return [origin.strip() for origin in self.BACKEND_CORS_ORIGINS.split(",") if origin.strip()]

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT.lower() in {"production", "prod"}

    @property
    def sync_database_url(self) -> str:
        """Plain (non-SQLAlchemy) DSN used by raw PostGIS checks."""
        return self.DATABASE_URL.replace("postgresql+psycopg://", "postgresql://")


@lru_cache
def get_settings() -> Settings:
    """Cached settings accessor - import this, never instantiate Settings() directly."""
    return Settings()


settings = get_settings()

# Expose a couple of module-level conveniences for Alembic / scripts.
DATABASE_URL: str = Field(default=settings.DATABASE_URL)
