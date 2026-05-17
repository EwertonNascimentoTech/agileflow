"""
Migrations específicas para schemas de tenant.

Tabelas de tenant ficam em schemas isolados (`tenant_<slug>`) e não fazem parte
do Alembic público. Este módulo aplica DDL idempotente em cada schema de tenant
no startup do app — barato porque cada step verifica `IF NOT EXISTS` ou
`information_schema`.

Cada step recebe `(conn, schema)` e roda DDL escopado ao schema do tenant.
A ordem importa: steps são aplicados sequencialmente.
"""
from typing import Awaitable, Callable

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

from app.core.database import engine


# ─────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────

async def _column_exists(conn: AsyncConnection, schema: str, table: str, column: str) -> bool:
    result = await conn.execute(
        text("""
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = :schema AND table_name = :table AND column_name = :column
        """),
        {"schema": schema, "table": table, "column": column},
    )
    return result.scalar() is not None


async def _table_exists(conn: AsyncConnection, schema: str, table: str) -> bool:
    result = await conn.execute(
        text("""
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = :schema AND table_name = :table
        """),
        {"schema": schema, "table": table},
    )
    return result.scalar() is not None


# ─────────────────────────────────────────────
# Steps (cronológicos — não reordenar)
# ─────────────────────────────────────────────

async def _step_001_funnels(conn: AsyncConnection, schema: str) -> None:
    """Cria tabela funnels e adiciona colunas em attendance_status_configs."""
    if not await _table_exists(conn, schema, "attendance_status_configs"):
        # Tenant ainda não tem o módulo atendimento. TenantBase.metadata.create_all() já cobre.
        return

    # Cria funnels se ainda não existe
    if not await _table_exists(conn, schema, "funnels"):
        await conn.execute(text(f"""
            CREATE TABLE {schema}.funnels (
                id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name          VARCHAR(100) NOT NULL UNIQUE,
                description   TEXT,
                color         VARCHAR(7) NOT NULL DEFAULT '#3B82F6',
                "order"       INTEGER DEFAULT 0,
                is_default    BOOLEAN DEFAULT FALSE,
                is_active     BOOLEAN DEFAULT TRUE,
                created_at    TIMESTAMP DEFAULT now(),
                updated_at    TIMESTAMP DEFAULT now()
            )
        """))

    # Adiciona colunas novas em attendance_status_configs
    if not await _column_exists(conn, schema, "attendance_status_configs", "funnel_id"):
        await conn.execute(text(
            f'ALTER TABLE {schema}.attendance_status_configs ADD COLUMN funnel_id UUID'
        ))

    if not await _column_exists(conn, schema, "attendance_status_configs", "outcome"):
        await conn.execute(text(
            f"ALTER TABLE {schema}.attendance_status_configs "
            f"ADD COLUMN outcome VARCHAR(20) NOT NULL DEFAULT 'neutral'"
        ))

    if not await _column_exists(conn, schema, "attendance_status_configs", "lead_page_policy"):
        await conn.execute(text(
            f"ALTER TABLE {schema}.attendance_status_configs ADD COLUMN lead_page_policy JSONB"
        ))

    # Garante um funil "Padrão" e linka todos os statuses sem funnel_id
    has_default = await conn.execute(text(
        f"SELECT id FROM {schema}.funnels WHERE is_default = TRUE LIMIT 1"
    ))
    default_id = has_default.scalar()
    if default_id is None:
        result = await conn.execute(text(f"""
            INSERT INTO {schema}.funnels (name, description, is_default, "order")
            VALUES ('Padrão', 'Funil padrão criado automaticamente.', TRUE, 0)
            RETURNING id
        """))
        default_id = result.scalar()

    # Aponta status órfãos para o funil padrão
    await conn.execute(text(f"""
        UPDATE {schema}.attendance_status_configs
        SET funnel_id = :fid
        WHERE funnel_id IS NULL
    """), {"fid": default_id})

    # Após popular, força NOT NULL + FK
    await conn.execute(text(f"""
        ALTER TABLE {schema}.attendance_status_configs
        ALTER COLUMN funnel_id SET NOT NULL
    """))

    # Adiciona FK só se ainda não existe
    fk_exists = await conn.execute(text("""
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_schema = :schema
          AND table_name = 'attendance_status_configs'
          AND constraint_name = 'attendance_status_configs_funnel_id_fkey'
    """), {"schema": schema})
    if fk_exists.scalar() is None:
        await conn.execute(text(f"""
            ALTER TABLE {schema}.attendance_status_configs
            ADD CONSTRAINT attendance_status_configs_funnel_id_fkey
            FOREIGN KEY (funnel_id) REFERENCES {schema}.funnels(id) ON DELETE CASCADE
        """))


async def _step_002_attendance_commercial_fields(conn: AsyncConnection, schema: str) -> None:
    """Adiciona campos comerciais em attendance + entity_type em client."""
    if await _table_exists(conn, schema, "attendances"):
        if not await _column_exists(conn, schema, "attendances", "value"):
            await conn.execute(text(
                f"ALTER TABLE {schema}.attendances ADD COLUMN value NUMERIC(12,2)"
            ))
        if not await _column_exists(conn, schema, "attendances", "expected_close_date"):
            await conn.execute(text(
                f"ALTER TABLE {schema}.attendances ADD COLUMN expected_close_date TIMESTAMP"
            ))
        if not await _column_exists(conn, schema, "attendances", "last_interaction"):
            await conn.execute(text(
                f"ALTER TABLE {schema}.attendances ADD COLUMN last_interaction TIMESTAMP"
            ))

    if await _table_exists(conn, schema, "clients"):
        if not await _column_exists(conn, schema, "clients", "entity_type"):
            await conn.execute(text(
                f"ALTER TABLE {schema}.clients "
                f"ADD COLUMN entity_type VARCHAR(10) NOT NULL DEFAULT 'pf'"
            ))


async def _step_003_companies_and_tasks(conn: AsyncConnection, schema: str) -> None:
    """Cria tabelas companies e tasks + company_id em clients e attendances."""
    if not await _table_exists(conn, schema, "companies"):
        await conn.execute(text(f"""
            CREATE TABLE {schema}.companies (
                id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name          VARCHAR(200) NOT NULL,
                trade_name    VARCHAR(200),
                document      VARCHAR(20),
                email         VARCHAR(255),
                phone         VARCHAR(30),
                website       VARCHAR(255),
                industry      VARCHAR(100),
                address       JSONB,
                notes         TEXT,
                custom_data   JSONB,
                is_active     BOOLEAN DEFAULT TRUE,
                created_at    TIMESTAMP DEFAULT now(),
                updated_at    TIMESTAMP DEFAULT now()
            )
        """))

    if await _table_exists(conn, schema, "clients"):
        if not await _column_exists(conn, schema, "clients", "company_id"):
            await conn.execute(text(
                f"ALTER TABLE {schema}.clients ADD COLUMN company_id UUID "
                f"REFERENCES {schema}.companies(id) ON DELETE SET NULL"
            ))

    if await _table_exists(conn, schema, "attendances"):
        if not await _column_exists(conn, schema, "attendances", "company_id"):
            await conn.execute(text(
                f"ALTER TABLE {schema}.attendances ADD COLUMN company_id UUID "
                f"REFERENCES {schema}.companies(id) ON DELETE SET NULL"
            ))

    if not await _table_exists(conn, schema, "tasks"):
        await conn.execute(text(f"""
            CREATE TABLE {schema}.tasks (
                id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                title         VARCHAR(200) NOT NULL,
                description   TEXT,
                status        VARCHAR(20) NOT NULL DEFAULT 'pending',
                priority      VARCHAR(20) NOT NULL DEFAULT 'medium',
                due_date      TIMESTAMP,
                attendance_id UUID REFERENCES {schema}.attendances(id) ON DELETE CASCADE,
                assigned_to   UUID,
                created_by    UUID,
                completed_at  TIMESTAMP,
                completed_by  UUID,
                created_at    TIMESTAMP DEFAULT now(),
                updated_at    TIMESTAMP DEFAULT now()
            )
        """))
        await conn.execute(text(
            f"CREATE INDEX ix_{schema}_tasks_attendance ON {schema}.tasks(attendance_id)"
        ))
        await conn.execute(text(
            f"CREATE INDEX ix_{schema}_tasks_assigned ON {schema}.tasks(assigned_to)"
        ))


async def _step_004_normalize_enum_values(conn: AsyncConnection, schema: str) -> None:
    """
    Normaliza valores de enums novos (StageOutcome, ClientEntityType, TaskStatus, TaskPriority)
    para lowercase. SQLAlchemy salvava o .name (UPPERCASE) por padrão; agora os modelos
    usam values_callable e esperam o .value (lowercase) no DB.
    """
    if await _table_exists(conn, schema, "attendance_status_configs"):
        await conn.execute(text(
            f"UPDATE {schema}.attendance_status_configs SET outcome = LOWER(outcome) "
            f"WHERE outcome <> LOWER(outcome)"
        ))

    if await _table_exists(conn, schema, "clients"):
        if await _column_exists(conn, schema, "clients", "entity_type"):
            await conn.execute(text(
                f"UPDATE {schema}.clients SET entity_type = LOWER(entity_type) "
                f"WHERE entity_type <> LOWER(entity_type)"
            ))

    if await _table_exists(conn, schema, "tasks"):
        await conn.execute(text(
            f"UPDATE {schema}.tasks SET status = LOWER(status) WHERE status <> LOWER(status)"
        ))
        await conn.execute(text(
            f"UPDATE {schema}.tasks SET priority = LOWER(priority) WHERE priority <> LOWER(priority)"
        ))


async def _step_005_timeline_and_automations(conn: AsyncConnection, schema: str) -> None:
    """Cria tabelas lead_events e automation_rules."""
    if not await _table_exists(conn, schema, "lead_events"):
        await conn.execute(text(f"""
            CREATE TABLE {schema}.lead_events (
                id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                attendance_id UUID NOT NULL REFERENCES {schema}.attendances(id) ON DELETE CASCADE,
                type          VARCHAR(30) NOT NULL DEFAULT 'system',
                content       TEXT NOT NULL,
                author_id     UUID,
                author_name   VARCHAR(200),
                extra_data    JSONB,
                created_at    TIMESTAMP DEFAULT now()
            )
        """))
        await conn.execute(text(
            f"CREATE INDEX ix_{schema}_lead_events_attendance "
            f"ON {schema}.lead_events(attendance_id, created_at DESC)"
        ))

    if not await _table_exists(conn, schema, "automation_rules"):
        await conn.execute(text(f"""
            CREATE TABLE {schema}.automation_rules (
                id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name           VARCHAR(200) NOT NULL,
                description    TEXT,
                trigger        VARCHAR(30) NOT NULL,
                funnel_id      UUID REFERENCES {schema}.funnels(id) ON DELETE CASCADE,
                stage_id       UUID REFERENCES {schema}.attendance_status_configs(id) ON DELETE CASCADE,
                action         VARCHAR(30) NOT NULL,
                action_config  JSONB,
                "order"        INTEGER DEFAULT 0,
                is_active      BOOLEAN DEFAULT TRUE,
                created_at     TIMESTAMP DEFAULT now(),
                updated_at     TIMESTAMP DEFAULT now()
            )
        """))
        await conn.execute(text(
            f"CREATE INDEX ix_{schema}_automation_rules_trigger "
            f"ON {schema}.automation_rules(trigger, is_active)"
        ))


async def _step_006_follow_up_templates(conn: AsyncConnection, schema: str) -> None:
    """Cria tabela follow_up_templates."""
    if not await _table_exists(conn, schema, "follow_up_templates"):
        await conn.execute(text(f"""
            CREATE TABLE {schema}.follow_up_templates (
                id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name          VARCHAR(200) NOT NULL,
                funnel_id     UUID REFERENCES {schema}.funnels(id) ON DELETE CASCADE,
                stage_id      UUID REFERENCES {schema}.attendance_status_configs(id) ON DELETE CASCADE,
                channel       VARCHAR(20) NOT NULL DEFAULT 'auto',
                message       TEXT NOT NULL,
                delay_minutes INTEGER NOT NULL DEFAULT 0,
                is_active     BOOLEAN NOT NULL DEFAULT TRUE,
                created_at    TIMESTAMP DEFAULT now(),
                updated_at    TIMESTAMP DEFAULT now()
            )
        """))
        await conn.execute(text(
            f"CREATE INDEX ix_{schema}_followup_stage "
            f"ON {schema}.follow_up_templates(stage_id, is_active)"
        ))


async def _step_007_propostas_contratos(conn: AsyncConnection, schema: str) -> None:
    """Cria tabelas do módulo Propostas e Contratos."""
    if not await _table_exists(conn, schema, "proposals"):
        await conn.execute(text(f"""
            CREATE TABLE {schema}.proposals (
                id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                number          VARCHAR(30) NOT NULL UNIQUE,
                version         INTEGER NOT NULL DEFAULT 1,
                title           VARCHAR(300) NOT NULL,
                description     TEXT,
                status          VARCHAR(20) NOT NULL DEFAULT 'draft',
                attendance_id   UUID,
                client_id       UUID,
                company_id      UUID,
                client_name     VARCHAR(200),
                client_email    VARCHAR(255),
                client_phone    VARCHAR(30),
                client_document VARCHAR(20),
                total_value     NUMERIC(12, 2) NOT NULL DEFAULT 0,
                discount        NUMERIC(12, 2) NOT NULL DEFAULT 0,
                payment_terms   TEXT,
                delivery_terms  TEXT,
                notes           TEXT,
                valid_until     TIMESTAMP,
                sent_at         TIMESTAMP,
                accepted_at     TIMESTAMP,
                rejected_at     TIMESTAMP,
                created_by      UUID,
                custom_data     JSONB,
                created_at      TIMESTAMP DEFAULT now(),
                updated_at      TIMESTAMP DEFAULT now()
            )
        """))
        await conn.execute(text(
            f"CREATE INDEX ix_{schema}_proposals_status ON {schema}.proposals(status)"
        ))
        await conn.execute(text(
            f"CREATE INDEX ix_{schema}_proposals_attendance ON {schema}.proposals(attendance_id)"
        ))
        await conn.execute(text(
            f"CREATE INDEX ix_{schema}_proposals_client ON {schema}.proposals(client_id)"
        ))

    if not await _table_exists(conn, schema, "proposal_items"):
        await conn.execute(text(f"""
            CREATE TABLE {schema}.proposal_items (
                id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                proposal_id UUID NOT NULL REFERENCES {schema}.proposals(id) ON DELETE CASCADE,
                description TEXT NOT NULL,
                quantity    NUMERIC(12, 3) NOT NULL DEFAULT 1,
                unit        VARCHAR(20),
                unit_price  NUMERIC(12, 2) NOT NULL DEFAULT 0,
                total       NUMERIC(12, 2) NOT NULL DEFAULT 0,
                "order"     INTEGER NOT NULL DEFAULT 0,
                custom_data JSONB,
                created_at  TIMESTAMP DEFAULT now()
            )
        """))

    if not await _table_exists(conn, schema, "proposal_status_logs"):
        await conn.execute(text(f"""
            CREATE TABLE {schema}.proposal_status_logs (
                id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                proposal_id UUID NOT NULL REFERENCES {schema}.proposals(id) ON DELETE CASCADE,
                from_status VARCHAR(20),
                to_status   VARCHAR(20) NOT NULL,
                changed_by  UUID,
                notes       TEXT,
                changed_at  TIMESTAMP DEFAULT now()
            )
        """))


async def _step_009_proposal_public_token(conn: AsyncConnection, schema: str) -> None:
    """Adiciona campos pra link público de aceitação."""
    if await _table_exists(conn, schema, "proposals"):
        if not await _column_exists(conn, schema, "proposals", "public_token"):
            await conn.execute(text(
                f"ALTER TABLE {schema}.proposals ADD COLUMN public_token VARCHAR(64)"
            ))
            await conn.execute(text(
                f"CREATE UNIQUE INDEX ix_{schema}_proposals_token "
                f"ON {schema}.proposals(public_token) WHERE public_token IS NOT NULL"
            ))
        if not await _column_exists(conn, schema, "proposals", "public_acceptance"):
            await conn.execute(text(
                f"ALTER TABLE {schema}.proposals ADD COLUMN public_acceptance JSONB"
            ))


async def _step_008_proposal_templates(conn: AsyncConnection, schema: str) -> None:
    """Cria tabelas de templates de proposta."""
    if not await _table_exists(conn, schema, "proposal_templates"):
        await conn.execute(text(f"""
            CREATE TABLE {schema}.proposal_templates (
                id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name            VARCHAR(200) NOT NULL,
                description     TEXT,
                title           VARCHAR(300),
                body            TEXT,
                payment_terms   TEXT,
                delivery_terms  TEXT,
                notes           TEXT,
                discount        NUMERIC(12, 2) DEFAULT 0,
                validity_days   INTEGER,
                is_active       BOOLEAN NOT NULL DEFAULT TRUE,
                created_at      TIMESTAMP DEFAULT now(),
                updated_at      TIMESTAMP DEFAULT now()
            )
        """))
    if not await _table_exists(conn, schema, "proposal_template_items"):
        await conn.execute(text(f"""
            CREATE TABLE {schema}.proposal_template_items (
                id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                template_id  UUID NOT NULL REFERENCES {schema}.proposal_templates(id) ON DELETE CASCADE,
                description  TEXT NOT NULL,
                quantity     NUMERIC(12, 3) NOT NULL DEFAULT 1,
                unit         VARCHAR(20),
                unit_price   NUMERIC(12, 2) NOT NULL DEFAULT 0,
                "order"      INTEGER NOT NULL DEFAULT 0
            )
        """))


async def _step_010_contracts(conn: AsyncConnection, schema: str) -> None:
    """Cria tabelas contract_templates e contracts."""
    if not await _table_exists(conn, schema, "contract_templates"):
        await conn.execute(text(f"""
            CREATE TABLE {schema}.contract_templates (
                id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name        VARCHAR(200) NOT NULL,
                description TEXT,
                body        TEXT NOT NULL,
                is_active   BOOLEAN NOT NULL DEFAULT TRUE,
                created_at  TIMESTAMP DEFAULT now(),
                updated_at  TIMESTAMP DEFAULT now()
            )
        """))

    if not await _table_exists(conn, schema, "contracts"):
        await conn.execute(text(f"""
            CREATE TABLE {schema}.contracts (
                id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                number          VARCHAR(30) NOT NULL UNIQUE,
                title           VARCHAR(300) NOT NULL,
                body            TEXT NOT NULL,
                status          VARCHAR(20) NOT NULL DEFAULT 'draft',
                proposal_id     UUID,
                attendance_id   UUID,
                client_id       UUID,
                company_id      UUID,
                client_name     VARCHAR(200),
                client_document VARCHAR(20),
                client_email    VARCHAR(255),
                client_phone    VARCHAR(30),
                total_value     NUMERIC(12, 2) NOT NULL DEFAULT 0,
                start_date      TIMESTAMP,
                end_date        TIMESTAMP,
                signed_at       TIMESTAMP,
                signer_name     VARCHAR(200),
                signer_document VARCHAR(20),
                signer_email    VARCHAR(255),
                signer_ip       VARCHAR(45),
                signature_hash  VARCHAR(128),
                public_token    VARCHAR(64) UNIQUE,
                created_by      UUID,
                custom_data     JSONB,
                created_at      TIMESTAMP DEFAULT now(),
                updated_at      TIMESTAMP DEFAULT now()
            )
        """))
        await conn.execute(text(
            f"CREATE INDEX ix_{schema}_contracts_status ON {schema}.contracts(status)"
        ))


async def _step_011_message_attachments(conn: AsyncConnection, schema: str) -> None:
    """Cria tabela message_attachments para armazenar anexos de mensagens no MinIO."""
    if not await _table_exists(conn, schema, "message_attachments"):
        await conn.execute(text(f"""
            CREATE TABLE {schema}.message_attachments (
                id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                message_id    UUID NOT NULL REFERENCES {schema}.attendance_messages(id) ON DELETE CASCADE,
                attendance_id UUID NOT NULL,
                file_name     VARCHAR(255) NOT NULL,
                content_type  VARCHAR(100) NOT NULL,
                object_name   VARCHAR(500) NOT NULL,
                file_size     INTEGER,
                created_at    TIMESTAMP DEFAULT now()
            )
        """))
        await conn.execute(text(
            f"CREATE INDEX ix_{schema}_msgatt_message ON {schema}.message_attachments(message_id)"
        ))
        await conn.execute(text(
            f"CREATE INDEX ix_{schema}_msgatt_attendance ON {schema}.message_attachments(attendance_id)"
        ))


async def _step_012_notifications(conn: AsyncConnection, schema: str) -> None:
    """Cria tabela notifications para o bell de notificações in-app."""
    if not await _table_exists(conn, schema, "notifications"):
        await conn.execute(text(f"""
            CREATE TABLE {schema}.notifications (
                id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id     UUID NOT NULL,
                title       VARCHAR(300) NOT NULL,
                body        TEXT,
                entity_type VARCHAR(50),
                entity_id   UUID,
                is_read     BOOLEAN NOT NULL DEFAULT FALSE,
                created_at  TIMESTAMP DEFAULT now()
            )
        """))
        await conn.execute(text(
            f"CREATE INDEX ix_{schema}_notif_user ON {schema}.notifications(user_id, is_read, created_at DESC)"
        ))


async def _step_013_tags(conn: AsyncConnection, schema: str) -> None:
    """Cria tabelas tags, client_tags e attendance_tags."""
    if not await _table_exists(conn, schema, "tags"):
        await conn.execute(text(f"""
            CREATE TABLE {schema}.tags (
                id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name        VARCHAR(50) NOT NULL,
                color       VARCHAR(7) NOT NULL DEFAULT '#3B82F6',
                entity_type VARCHAR(20) NOT NULL,
                slug        VARCHAR(50),
                created_at  TIMESTAMP DEFAULT now()
            )
        """))
        await conn.execute(text(
            f"CREATE INDEX ix_{schema}_tags_entity ON {schema}.tags(entity_type)"
        ))

    if not await _table_exists(conn, schema, "client_tags"):
        await conn.execute(text(f"""
            CREATE TABLE {schema}.client_tags (
                id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                client_id UUID NOT NULL REFERENCES {schema}.clients(id) ON DELETE CASCADE,
                tag_id    UUID NOT NULL REFERENCES {schema}.tags(id) ON DELETE CASCADE,
                UNIQUE(client_id, tag_id)
            )
        """))
        await conn.execute(text(
            f"CREATE INDEX ix_{schema}_client_tags_client ON {schema}.client_tags(client_id)"
        ))

    if not await _table_exists(conn, schema, "attendance_tags"):
        await conn.execute(text(f"""
            CREATE TABLE {schema}.attendance_tags (
                id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                attendance_id UUID NOT NULL REFERENCES {schema}.attendances(id) ON DELETE CASCADE,
                tag_id        UUID NOT NULL REFERENCES {schema}.tags(id) ON DELETE CASCADE,
                UNIQUE(attendance_id, tag_id)
            )
        """))
        await conn.execute(text(
            f"CREATE INDEX ix_{schema}_attendance_tags_att ON {schema}.attendance_tags(attendance_id)"
        ))


async def _step_014_tag_slug_classification(conn: AsyncConnection, schema: str) -> None:
    """Coluna slug em tags + tags de classificação PF/PJ em atendimentos (idempotente)."""
    if not await _table_exists(conn, schema, "tags"):
        return
    if not await _column_exists(conn, schema, "tags", "slug"):
        await conn.execute(text(f"ALTER TABLE {schema}.tags ADD COLUMN slug VARCHAR(50)"))
    await conn.execute(text(
        f"CREATE UNIQUE INDEX IF NOT EXISTS ix_{schema}_tags_entity_slug "
        f"ON {schema}.tags (entity_type, slug) WHERE slug IS NOT NULL"
    ))
    await conn.execute(text(f"""
        INSERT INTO {schema}.tags (id, name, color, entity_type, slug)
        SELECT gen_random_uuid(), 'PF', '#1D4ED8', 'attendance', 'classificacao_pf'
        WHERE NOT EXISTS (
            SELECT 1 FROM {schema}.tags t
            WHERE t.entity_type = 'attendance' AND t.slug = 'classificacao_pf'
        )
    """))
    await conn.execute(text(f"""
        INSERT INTO {schema}.tags (id, name, color, entity_type, slug)
        SELECT gen_random_uuid(), 'PJ', '#7C3AED', 'attendance', 'classificacao_pj'
        WHERE NOT EXISTS (
            SELECT 1 FROM {schema}.tags t
            WHERE t.entity_type = 'attendance' AND t.slug = 'classificacao_pj'
        )
    """))


async def _step_015_close_reason(conn: AsyncConnection, schema: str) -> None:
    """Adiciona campos de fechamento com motivo em attendances (K-004)."""
    if not await _table_exists(conn, schema, "attendances"):
        return
    if not await _column_exists(conn, schema, "attendances", "close_reason"):
        await conn.execute(text(f"ALTER TABLE {schema}.attendances ADD COLUMN close_reason VARCHAR(500)"))
    if not await _column_exists(conn, schema, "attendances", "closed_by"):
        await conn.execute(text(f"ALTER TABLE {schema}.attendances ADD COLUMN closed_by UUID"))
    if not await _column_exists(conn, schema, "attendances", "outcome"):
        await conn.execute(text(f"ALTER TABLE {schema}.attendances ADD COLUMN outcome VARCHAR(20) NOT NULL DEFAULT 'open'"))


async def _step_016_forecast(conn: AsyncConnection, schema: str) -> None:
    """Adiciona probability em stages e cria tabela sales_targets (K-006)."""
    if not await _table_exists(conn, schema, "attendance_status_configs"):
        return
    if not await _column_exists(conn, schema, "attendance_status_configs", "probability"):
        await conn.execute(text(f"ALTER TABLE {schema}.attendance_status_configs ADD COLUMN probability SMALLINT NOT NULL DEFAULT 50"))
    if not await _table_exists(conn, schema, "sales_targets"):
        await conn.execute(text(f"""
            CREATE TABLE {schema}.sales_targets (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID,
                funnel_id UUID,
                period VARCHAR(7) NOT NULL,
                target_value NUMERIC(14,2) NOT NULL DEFAULT 0,
                created_at TIMESTAMP DEFAULT now(),
                UNIQUE(user_id, funnel_id, period)
            )
        """))


async def _step_017_stage_required_fields(conn: AsyncConnection, schema: str) -> None:
    """Cria tabela stage_required_fields (K-003)."""
    if not await _table_exists(conn, schema, "attendance_status_configs"):
        return
    if not await _table_exists(conn, schema, "stage_required_fields"):
        await conn.execute(text(f"""
            CREATE TABLE {schema}.stage_required_fields (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                status_id UUID NOT NULL REFERENCES {schema}.attendance_status_configs(id) ON DELETE CASCADE,
                field_name VARCHAR(100) NOT NULL,
                field_label VARCHAR(100) NOT NULL,
                field_type VARCHAR(20) NOT NULL DEFAULT 'native',
                created_at TIMESTAMP DEFAULT now(),
                UNIQUE(status_id, field_name)
            )
        """))


async def _step_018_playbook(conn: AsyncConnection, schema: str) -> None:
    """Adiciona coluna source em tasks e cria tabela playbook_steps (K-013)."""
    if await _table_exists(conn, schema, "tasks"):
        if not await _column_exists(conn, schema, "tasks", "source"):
            await conn.execute(text(f"ALTER TABLE {schema}.tasks ADD COLUMN source VARCHAR(50) NOT NULL DEFAULT 'manual'"))
    if not await _table_exists(conn, schema, "attendance_status_configs"):
        return
    if not await _table_exists(conn, schema, "playbook_steps"):
        await conn.execute(text(f"""
            CREATE TABLE {schema}.playbook_steps (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                status_id UUID NOT NULL REFERENCES {schema}.attendance_status_configs(id) ON DELETE CASCADE,
                title VARCHAR(200) NOT NULL,
                description TEXT,
                due_days SMALLINT NOT NULL DEFAULT 1,
                "order" SMALLINT NOT NULL DEFAULT 0,
                created_at TIMESTAMP DEFAULT now()
            )
        """))


# Lista ordenada de steps. Adicionar novos no final.
STEPS: list[tuple[str, Callable[[AsyncConnection, str], Awaitable[None]]]] = [
    ("001_funnels", _step_001_funnels),
    ("002_attendance_commercial", _step_002_attendance_commercial_fields),
    ("003_companies_and_tasks", _step_003_companies_and_tasks),
    ("004_normalize_enum_values", _step_004_normalize_enum_values),
    ("005_timeline_and_automations", _step_005_timeline_and_automations),
    ("006_follow_up_templates", _step_006_follow_up_templates),
    ("007_propostas_contratos", _step_007_propostas_contratos),
    ("008_proposal_templates", _step_008_proposal_templates),
    ("009_proposal_public_token", _step_009_proposal_public_token),
    ("010_contracts", _step_010_contracts),
    ("011_message_attachments", _step_011_message_attachments),
    ("012_notifications", _step_012_notifications),
    ("013_tags", _step_013_tags),
    ("014_tag_slug_classification", _step_014_tag_slug_classification),
    ("015_close_reason", _step_015_close_reason),
    ("016_forecast", _step_016_forecast),
    ("017_stage_required_fields", _step_017_stage_required_fields),
    ("018_playbook", _step_018_playbook),
]


# ─────────────────────────────────────────────
# Runner
# ─────────────────────────────────────────────

async def upgrade_tenant_schema(schema: str) -> None:
    """Aplica todos os steps no schema do tenant. Idempotente."""
    async with engine.begin() as conn:
        # Garante extensão pgcrypto para gen_random_uuid()
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS pgcrypto"))
        for name, step in STEPS:
            try:
                await step(conn, schema)
            except Exception as e:  # noqa: BLE001
                print(f"[tenant_migrations] {schema}/{name} failed: {e}")
                raise


async def upgrade_all_tenants() -> None:
    """Roda os steps para todos os tenants existentes (chamado no startup)."""
    from app.core.database import AsyncSessionLocal
    from app.modules.super_admin.models import Tenant
    from sqlalchemy import select as _select

    async with AsyncSessionLocal() as db:
        await db.execute(text("SET search_path TO public"))
        result = await db.execute(_select(Tenant.schema_name))
        schemas = [row[0] for row in result.all()]

    for schema in schemas:
        try:
            await upgrade_tenant_schema(schema)
        except Exception as e:  # noqa: BLE001
            print(f"[tenant_migrations] failed to upgrade {schema}: {e}")
