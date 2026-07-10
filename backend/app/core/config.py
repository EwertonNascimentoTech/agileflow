from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # ── APP ──────────────────────────────────────
    PROJECT_NAME: str = "AgileFlow"
    DEBUG: bool = False
    # Logging síncrono de toda query SQL — SÓ para debug local. Nunca em runtime
    # sob carga (serializa I/O e derruba throughput). Desacoplado de DEBUG de
    # propósito: DEBUG controla /docs, SQL_ECHO controla o log de queries.
    SQL_ECHO: bool = False
    SECRET_KEY: str
    ALLOWED_ORIGINS: List[str] = ["http://localhost:3000"]

    # ── JWT ──────────────────────────────────────
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # ── DATABASE ─────────────────────────────────
    POSTGRES_USER: str
    POSTGRES_PASSWORD: str
    POSTGRES_DB: str
    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: int = 5432
    # Pool por PROCESSO. Com N workers uvicorn, o total de conexões é
    # N × (DB_POOL_SIZE + DB_MAX_OVERFLOW) e precisa caber no max_connections do
    # Postgres (default 100), reservando espaço para Celery e psql. Ex.: 4 workers
    # × (5 + 10) = 60.
    DB_POOL_SIZE: int = 5
    DB_MAX_OVERFLOW: int = 10

    @property
    def DATABASE_URL(self) -> str:
        return (
            f"postgresql+asyncpg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
            f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )

    @property
    def DATABASE_URL_SYNC(self) -> str:
        """Usado pelo Alembic (não suporta asyncpg)."""
        return (
            f"postgresql+psycopg2://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
            f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )

    # ── REDIS ────────────────────────────────────
    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379
    REDIS_PASSWORD: str = ""
    # TTL (segundos) do cache de autorização (user / módulo-tenant / permissão).
    # Curto de propósito: limita a janela de inconsistência caso alguma
    # invalidação explícita seja perdida. 0 desativa o cache de auth.
    AUTH_CACHE_TTL: int = 30

    @property
    def REDIS_URL(self) -> str:
        if self.REDIS_PASSWORD:
            return f"redis://:{self.REDIS_PASSWORD}@{self.REDIS_HOST}:{self.REDIS_PORT}/0"
        return f"redis://{self.REDIS_HOST}:{self.REDIS_PORT}/0"

    # ── RABBITMQ / CELERY ────────────────────────
    RABBITMQ_USER: str = "guest"
    RABBITMQ_PASSWORD: str = "guest"
    RABBITMQ_HOST: str = "localhost"
    RABBITMQ_PORT: int = 5672

    @property
    def CELERY_BROKER_URL(self) -> str:
        return (
            f"amqp://{self.RABBITMQ_USER}:{self.RABBITMQ_PASSWORD}"
            f"@{self.RABBITMQ_HOST}:{self.RABBITMQ_PORT}//"
        )

    @property
    def CELERY_RESULT_BACKEND(self) -> str:
        return self.REDIS_URL

    # ── MINIO ────────────────────────────────────
    MINIO_ENDPOINT: str = "localhost:9000"
    MINIO_ACCESS_KEY: str
    MINIO_SECRET_KEY: str
    MINIO_BUCKET_DEFAULT: str = "saas-storage"
    MINIO_SECURE: bool = False

    # ── Azure AI Foundry — Agent Service (agentes por etapa do kanban) ──
    # Endpoint do PROJETO Foundry (base até antes de "/threads"). Ex.:
    # https://<recurso>.services.ai.azure.com/api/projects/<projeto>
    AZURE_AI_ENDPOINT: str = ""
    AZURE_AI_API_VERSION: str = "2025-05-01"
    # Autenticação por Microsoft Entra ID (o Agent Service NÃO aceita api-key).
    # Service principal com a role "Cognitive Services User" / "Foundry User" no recurso.
    AZURE_AI_TENANT_ID: str = ""
    AZURE_AI_CLIENT_ID: str = ""
    AZURE_AI_CLIENT_SECRET: str = ""


settings = Settings()
