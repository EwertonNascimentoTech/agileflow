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
    # TTL (segundos) dos marcadores de bootstrap idempotente (ex.: funil Contratar).
    # Tira o `ensure_*` do caminho de leitura sem torná-lo permanente: se a estrutura
    # for removida à mão, a próxima leitura após o TTL a recria. 0 desativa o marcador.
    BOOTSTRAP_CACHE_TTL: int = 3600

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
    # Endpoint interno (rede Docker) — upload/delete/list.
    MINIO_ENDPOINT: str = "localhost:9000"
    MINIO_ACCESS_KEY: str
    MINIO_SECRET_KEY: str
    MINIO_BUCKET_DEFAULT: str = "saas-storage"
    MINIO_SECURE: bool = False
    # Host público nas URLs pré-assinadas (browser). Sem porta = 443 se secure.
    # Ex.: agileflow.tdsistemafiea.com.br — o nginx do frontend faz proxy de
    # /{bucket}/ para o MinIO interno. Vazio = usa MINIO_ENDPOINT (dev local).
    MINIO_PUBLIC_ENDPOINT: str = ""
    MINIO_PUBLIC_SECURE: bool = True
    MINIO_REGION: str = "us-east-1"

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

    # ── Azure DevOps — commits dos repositórios vinculados aos produtos ──
    # PAT único da instituição (escopo mínimo: Code → Read). Sem PAT a integração fica
    # inerte: o job vira no-op e a UI mostra "não configurada".
    AZURE_DEVOPS_ORG_URL: str = "https://dev.azure.com/processostotecnologia"
    AZURE_DEVOPS_PAT: str = ""
    AZURE_DEVOPS_API_VERSION: str = "7.1"
    # Janela do backfill inicial de cada repositório (dias).
    AZURE_DEVOPS_BACKFILL_DAYS: int = 365
    # Basic auth do service hook (git.push). Vazio = webhook recusa tudo.
    AZURE_DEVOPS_WEBHOOK_USER: str = ""
    AZURE_DEVOPS_WEBHOOK_SECRET: str = ""
    # Teto de branches percorridas por repositório no sync. Repos com dezenas de branches
    # de feature (o maior aqui tem 63) tornariam o backfill lento demais. As de maior
    # precedência (main/preview) vêm primeiro, então o corte atinge só branches de dev.
    AZURE_DEVOPS_MAX_BRANCHES: int = 25
    # Substrings que marcam o autor como bot/pipeline (separadas por vírgula).
    AZURE_DEVOPS_BOT_EMAIL_PATTERNS: str = "noreply,azuredevops,build@,pipeline,bot@,@bot"

    # ── EPA (Sistema de Planos de Ação — sysepa) ──
    # Integração usada pelo RTD (slide de Planos Estratégicos). Login/senha únicos da
    # instituição, definidos no .env; token JWT obtido em /epa/api/api/login e cacheado.
    EPA_API_BASE_URL: str = "https://sistemafiea.sysepa.com.br"
    EPA_LOGIN: str = ""
    EPA_SENHA: str = ""
    # Códigos dos planos do EPA exibidos por padrão nos slides do RTD (separados por
    # vírgula). A reunião pode sobrescrever no próprio slide.
    EPA_PLANOS_ESTRATEGICO: str = ""
    EPA_PLANOS_TATICOS: str = ""

    # ── Documentação (Markdown em docs/) ─────────
    # Caminho absoluto da pasta docs/ no host/container. Vazio = auto-detect
    # (/docs no Docker, ou <repo>/docs em desenvolvimento).
    DOCS_ROOT: str = ""


settings = Settings()
