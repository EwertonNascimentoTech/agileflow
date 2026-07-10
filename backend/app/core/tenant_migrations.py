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
        # Valores explícitos porque tabela pode ter sido criada via
        # TenantBase.metadata.create_all() (sem DB-level defaults).
        result = await conn.execute(text(f"""
            INSERT INTO {schema}.funnels (
                id, name, description, color, "order",
                is_default, is_active, created_at, updated_at
            )
            VALUES (
                gen_random_uuid(), 'Padrão',
                'Funil padrão criado automaticamente.',
                '#3B82F6', 0, TRUE, TRUE, now(), now()
            )
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

    # A tabela `tasks` (módulo atendimento) referencia `attendances`. Se o tenant
    # não tem o módulo atendimento, pula — senão o CREATE com FK quebra a cadeia
    # de migrations (mesmo padrão defensivo dos demais steps).
    if not await _table_exists(conn, schema, "tasks") and await _table_exists(conn, schema, "attendances"):
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


async def _step_020_estoque(conn: AsyncConnection, schema: str) -> None:
    """Cria tabelas do módulo Estoque (9 tabelas)."""
    if not await _table_exists(conn, schema, "estoque_product_types"):
        await conn.execute(text(f"""
            CREATE TABLE {schema}.estoque_product_types (
                id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                slug           VARCHAR(50) NOT NULL UNIQUE,
                name           VARCHAR(120) NOT NULL,
                description    TEXT,
                icon           VARCHAR(50),
                field_schema   JSONB,
                tracks_stock   BOOLEAN NOT NULL DEFAULT TRUE,
                tracks_batch   BOOLEAN NOT NULL DEFAULT FALSE,
                tracks_expiry  BOOLEAN NOT NULL DEFAULT FALSE,
                tracks_serial  BOOLEAN NOT NULL DEFAULT FALSE,
                is_active      BOOLEAN NOT NULL DEFAULT TRUE,
                created_at     TIMESTAMP DEFAULT now(),
                updated_at     TIMESTAMP DEFAULT now()
            )
        """))

    if not await _table_exists(conn, schema, "estoque_product_categories"):
        await conn.execute(text(f"""
            CREATE TABLE {schema}.estoque_product_categories (
                id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name            VARCHAR(120) NOT NULL,
                description     TEXT,
                parent_id       UUID REFERENCES {schema}.estoque_product_categories(id) ON DELETE SET NULL,
                product_type_id UUID REFERENCES {schema}.estoque_product_types(id) ON DELETE SET NULL,
                is_active       BOOLEAN NOT NULL DEFAULT TRUE,
                created_at      TIMESTAMP DEFAULT now(),
                updated_at      TIMESTAMP DEFAULT now()
            )
        """))

    if not await _table_exists(conn, schema, "estoque_products"):
        await conn.execute(text(f"""
            CREATE TABLE {schema}.estoque_products (
                id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                type_id       UUID NOT NULL REFERENCES {schema}.estoque_product_types(id) ON DELETE RESTRICT,
                category_id   UUID REFERENCES {schema}.estoque_product_categories(id) ON DELETE SET NULL,
                sku           VARCHAR(80) NOT NULL,
                name          VARCHAR(200) NOT NULL,
                description   TEXT,
                barcode       VARCHAR(80),
                unit          VARCHAR(20) NOT NULL DEFAULT 'un',
                cost_price    NUMERIC(12,4) NOT NULL DEFAULT 0,
                sale_price    NUMERIC(12,4) NOT NULL DEFAULT 0,
                min_stock     NUMERIC(14,4) NOT NULL DEFAULT 0,
                max_stock     NUMERIC(14,4),
                custom_fields JSONB,
                is_active     BOOLEAN NOT NULL DEFAULT TRUE,
                created_at    TIMESTAMP DEFAULT now(),
                updated_at    TIMESTAMP DEFAULT now(),
                CONSTRAINT uq_estoque_products_sku UNIQUE (sku)
            )
        """))
        await conn.execute(text(
            f"CREATE INDEX ix_{schema}_estoque_products_type ON {schema}.estoque_products(type_id)"
        ))
        await conn.execute(text(
            f"CREATE INDEX ix_{schema}_estoque_products_category ON {schema}.estoque_products(category_id)"
        ))

    if not await _table_exists(conn, schema, "estoque_warehouses"):
        await conn.execute(text(f"""
            CREATE TABLE {schema}.estoque_warehouses (
                id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                code        VARCHAR(30) NOT NULL,
                name        VARCHAR(120) NOT NULL,
                description TEXT,
                address     JSONB,
                is_default  BOOLEAN NOT NULL DEFAULT FALSE,
                is_active   BOOLEAN NOT NULL DEFAULT TRUE,
                created_at  TIMESTAMP DEFAULT now(),
                updated_at  TIMESTAMP DEFAULT now(),
                CONSTRAINT uq_estoque_warehouses_code UNIQUE (code)
            )
        """))

    if not await _table_exists(conn, schema, "estoque_suppliers"):
        await conn.execute(text(f"""
            CREATE TABLE {schema}.estoque_suppliers (
                id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name       VARCHAR(200) NOT NULL,
                trade_name VARCHAR(200),
                document   VARCHAR(30),
                email      VARCHAR(255),
                phone      VARCHAR(30),
                address    JSONB,
                notes      TEXT,
                is_active  BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT now(),
                updated_at TIMESTAMP DEFAULT now()
            )
        """))

    if not await _table_exists(conn, schema, "estoque_product_suppliers"):
        await conn.execute(text(f"""
            CREATE TABLE {schema}.estoque_product_suppliers (
                id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                product_id     UUID NOT NULL REFERENCES {schema}.estoque_products(id) ON DELETE CASCADE,
                supplier_id    UUID NOT NULL REFERENCES {schema}.estoque_suppliers(id) ON DELETE CASCADE,
                supplier_sku   VARCHAR(80),
                cost_unit      NUMERIC(12,4) NOT NULL DEFAULT 0,
                lead_time_days INTEGER,
                is_preferred   BOOLEAN NOT NULL DEFAULT FALSE,
                created_at     TIMESTAMP DEFAULT now(),
                CONSTRAINT uq_estoque_product_supplier UNIQUE (product_id, supplier_id)
            )
        """))

    if not await _table_exists(conn, schema, "estoque_stock_levels"):
        await conn.execute(text(f"""
            CREATE TABLE {schema}.estoque_stock_levels (
                id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                product_id   UUID NOT NULL REFERENCES {schema}.estoque_products(id) ON DELETE CASCADE,
                warehouse_id UUID NOT NULL REFERENCES {schema}.estoque_warehouses(id) ON DELETE CASCADE,
                quantity     NUMERIC(14,4) NOT NULL DEFAULT 0,
                reserved     NUMERIC(14,4) NOT NULL DEFAULT 0,
                updated_at   TIMESTAMP DEFAULT now(),
                CONSTRAINT uq_estoque_stock_level UNIQUE (product_id, warehouse_id)
            )
        """))
        await conn.execute(text(
            f"CREATE INDEX ix_{schema}_estoque_stock_levels_product "
            f"ON {schema}.estoque_stock_levels(product_id)"
        ))

    if not await _table_exists(conn, schema, "estoque_stock_batches"):
        await conn.execute(text(f"""
            CREATE TABLE {schema}.estoque_stock_batches (
                id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                product_id       UUID NOT NULL REFERENCES {schema}.estoque_products(id) ON DELETE CASCADE,
                warehouse_id     UUID NOT NULL REFERENCES {schema}.estoque_warehouses(id) ON DELETE CASCADE,
                batch_code       VARCHAR(80) NOT NULL,
                quantity         NUMERIC(14,4) NOT NULL DEFAULT 0,
                cost_unit        NUMERIC(12,4) NOT NULL DEFAULT 0,
                manufacture_date DATE,
                expiry_date      DATE,
                created_at       TIMESTAMP DEFAULT now(),
                updated_at       TIMESTAMP DEFAULT now(),
                CONSTRAINT uq_estoque_batch UNIQUE (product_id, warehouse_id, batch_code)
            )
        """))
        await conn.execute(text(
            f"CREATE INDEX ix_{schema}_estoque_batches_expiry "
            f"ON {schema}.estoque_stock_batches(expiry_date)"
        ))

    if not await _table_exists(conn, schema, "estoque_stock_serials"):
        await conn.execute(text(f"""
            CREATE TABLE {schema}.estoque_stock_serials (
                id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                product_id   UUID NOT NULL REFERENCES {schema}.estoque_products(id) ON DELETE CASCADE,
                warehouse_id UUID REFERENCES {schema}.estoque_warehouses(id) ON DELETE SET NULL,
                serial       VARCHAR(120) NOT NULL,
                status       VARCHAR(20) NOT NULL DEFAULT 'in_stock',
                batch_id     UUID REFERENCES {schema}.estoque_stock_batches(id) ON DELETE SET NULL,
                metadata     JSONB,
                cost_unit    NUMERIC(12,4) NOT NULL DEFAULT 0,
                created_at   TIMESTAMP DEFAULT now(),
                updated_at   TIMESTAMP DEFAULT now(),
                CONSTRAINT uq_estoque_serial UNIQUE (product_id, serial)
            )
        """))
        await conn.execute(text(
            f"CREATE INDEX ix_{schema}_estoque_serials_status "
            f"ON {schema}.estoque_stock_serials(status)"
        ))

    if not await _table_exists(conn, schema, "estoque_stock_movements"):
        await conn.execute(text(f"""
            CREATE TABLE {schema}.estoque_stock_movements (
                id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                product_id        UUID NOT NULL REFERENCES {schema}.estoque_products(id) ON DELETE RESTRICT,
                warehouse_id      UUID NOT NULL REFERENCES {schema}.estoque_warehouses(id) ON DELETE RESTRICT,
                batch_id          UUID REFERENCES {schema}.estoque_stock_batches(id) ON DELETE SET NULL,
                serial_id         UUID REFERENCES {schema}.estoque_stock_serials(id) ON DELETE SET NULL,
                type              VARCHAR(20) NOT NULL,
                quantity          NUMERIC(14,4) NOT NULL,
                cost_unit         NUMERIC(12,4) NOT NULL DEFAULT 0,
                reason            VARCHAR(200),
                reference_type    VARCHAR(50),
                reference_id      UUID,
                transfer_group_id UUID,
                supplier_id       UUID REFERENCES {schema}.estoque_suppliers(id) ON DELETE SET NULL,
                user_id           UUID,
                notes             TEXT,
                created_at        TIMESTAMP DEFAULT now()
            )
        """))
        await conn.execute(text(
            f"CREATE INDEX ix_{schema}_estoque_movements_created "
            f"ON {schema}.estoque_stock_movements(created_at DESC)"
        ))
        await conn.execute(text(
            f"CREATE INDEX ix_{schema}_estoque_movements_product "
            f"ON {schema}.estoque_stock_movements(product_id, created_at DESC)"
        ))
        await conn.execute(text(
            f"CREATE INDEX ix_{schema}_estoque_movements_warehouse "
            f"ON {schema}.estoque_stock_movements(warehouse_id, created_at DESC)"
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
        INSERT INTO {schema}.tags (id, name, color, entity_type, slug, created_at)
        SELECT gen_random_uuid(), 'PF', '#1D4ED8', 'attendance', 'classificacao_pf', now()
        WHERE NOT EXISTS (
            SELECT 1 FROM {schema}.tags t
            WHERE t.entity_type = 'attendance' AND t.slug = 'classificacao_pf'
        )
    """))
    await conn.execute(text(f"""
        INSERT INTO {schema}.tags (id, name, color, entity_type, slug, created_at)
        SELECT gen_random_uuid(), 'PJ', '#7C3AED', 'attendance', 'classificacao_pj', now()
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


async def _step_019_reactivation(conn: AsyncConnection, schema: str) -> None:
    """Cria tabela reactivation_configs e adiciona parent_attendance_id em attendances (K-016)."""
    if not await _table_exists(conn, schema, "attendances"):
        return
    if not await _column_exists(conn, schema, "attendances", "parent_attendance_id"):
        await conn.execute(text(
            f"ALTER TABLE {schema}.attendances ADD COLUMN parent_attendance_id UUID"
        ))
    if not await _table_exists(conn, schema, "reactivation_configs"):
        await conn.execute(text(f"""
            CREATE TABLE {schema}.reactivation_configs (
                id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                funnel_id   UUID,
                loss_reason VARCHAR(500),
                delay_days  SMALLINT NOT NULL DEFAULT 30,
                is_active   BOOLEAN NOT NULL DEFAULT TRUE,
                created_at  TIMESTAMP DEFAULT now(),
                updated_at  TIMESTAMP DEFAULT now()
            )
        """))


async def _step_021_pdv(conn: AsyncConnection, schema: str) -> None:
    """Cria tabelas do módulo PDV (6 tabelas) + seed de formas de pagamento."""
    if not await _table_exists(conn, schema, "pdv_payment_methods"):
        await conn.execute(text(f"""
            CREATE TABLE {schema}.pdv_payment_methods (
                id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name                VARCHAR(80) NOT NULL,
                kind                VARCHAR(20) NOT NULL,
                affects_cash_drawer BOOLEAN NOT NULL DEFAULT FALSE,
                change_enabled      BOOLEAN NOT NULL DEFAULT FALSE,
                "order"             INTEGER NOT NULL DEFAULT 0,
                is_active           BOOLEAN NOT NULL DEFAULT TRUE,
                created_at          TIMESTAMP DEFAULT now(),
                updated_at          TIMESTAMP DEFAULT now(),
                CONSTRAINT uq_pdv_payment_methods_name UNIQUE (name)
            )
        """))

    if not await _table_exists(conn, schema, "pdv_cash_sessions"):
        await conn.execute(text(f"""
            CREATE TABLE {schema}.pdv_cash_sessions (
                id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                status          VARCHAR(20) NOT NULL DEFAULT 'open',
                warehouse_id    UUID NOT NULL,
                opening_amount  NUMERIC(12,2) NOT NULL DEFAULT 0,
                opened_by       UUID NOT NULL,
                opened_at       TIMESTAMP NOT NULL DEFAULT now(),
                closed_by       UUID,
                closed_at       TIMESTAMP,
                counted_amount  NUMERIC(12,2),
                expected_amount NUMERIC(12,2),
                difference      NUMERIC(12,2),
                notes           TEXT,
                created_at      TIMESTAMP DEFAULT now(),
                updated_at      TIMESTAMP DEFAULT now()
            )
        """))
        await conn.execute(text(
            f"CREATE INDEX ix_{schema}_pdv_cash_sessions_status "
            f"ON {schema}.pdv_cash_sessions(status)"
        ))
        # No máximo um caixa aberto por depósito.
        await conn.execute(text(
            f"CREATE UNIQUE INDEX uq_{schema}_pdv_cash_session_open "
            f"ON {schema}.pdv_cash_sessions(warehouse_id) WHERE status = 'open'"
        ))

    if not await _table_exists(conn, schema, "pdv_cash_movements"):
        await conn.execute(text(f"""
            CREATE TABLE {schema}.pdv_cash_movements (
                id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                session_id UUID NOT NULL REFERENCES {schema}.pdv_cash_sessions(id) ON DELETE CASCADE,
                type       VARCHAR(20) NOT NULL,
                amount     NUMERIC(12,2) NOT NULL,
                reason     VARCHAR(200) NOT NULL,
                notes      TEXT,
                user_id    UUID NOT NULL,
                created_at TIMESTAMP DEFAULT now()
            )
        """))
        await conn.execute(text(
            f"CREATE INDEX ix_{schema}_pdv_cash_movements_created "
            f"ON {schema}.pdv_cash_movements(created_at)"
        ))

    if not await _table_exists(conn, schema, "pdv_sales"):
        await conn.execute(text(f"""
            CREATE TABLE {schema}.pdv_sales (
                id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                number          VARCHAR(30) NOT NULL,
                status          VARCHAR(20) NOT NULL DEFAULT 'completed',
                session_id      UUID NOT NULL REFERENCES {schema}.pdv_cash_sessions(id) ON DELETE RESTRICT,
                warehouse_id    UUID NOT NULL,
                subtotal        NUMERIC(12,2) NOT NULL DEFAULT 0,
                discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
                total           NUMERIC(12,2) NOT NULL DEFAULT 0,
                paid_amount     NUMERIC(12,2) NOT NULL DEFAULT 0,
                change_amount   NUMERIC(12,2) NOT NULL DEFAULT 0,
                operator_id     UUID NOT NULL,
                notes           TEXT,
                cancelled_at    TIMESTAMP,
                cancelled_by    UUID,
                cancel_reason   VARCHAR(200),
                created_at      TIMESTAMP DEFAULT now(),
                updated_at      TIMESTAMP DEFAULT now(),
                CONSTRAINT uq_pdv_sales_number UNIQUE (number)
            )
        """))
        await conn.execute(text(
            f"CREATE INDEX ix_{schema}_pdv_sales_created ON {schema}.pdv_sales(created_at)"
        ))
        await conn.execute(text(
            f"CREATE INDEX ix_{schema}_pdv_sales_session ON {schema}.pdv_sales(session_id)"
        ))
        await conn.execute(text(
            f"CREATE INDEX ix_{schema}_pdv_sales_operator "
            f"ON {schema}.pdv_sales(operator_id, created_at)"
        ))

    if not await _table_exists(conn, schema, "pdv_sale_items"):
        await conn.execute(text(f"""
            CREATE TABLE {schema}.pdv_sale_items (
                id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                sale_id         UUID NOT NULL REFERENCES {schema}.pdv_sales(id) ON DELETE CASCADE,
                product_id      UUID NOT NULL,
                product_sku     VARCHAR(80) NOT NULL,
                product_name    VARCHAR(200) NOT NULL,
                unit            VARCHAR(20) NOT NULL DEFAULT 'un',
                quantity        NUMERIC(14,4) NOT NULL,
                unit_price      NUMERIC(12,2) NOT NULL,
                discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
                line_total      NUMERIC(12,2) NOT NULL,
                created_at      TIMESTAMP DEFAULT now()
            )
        """))
        await conn.execute(text(
            f"CREATE INDEX ix_{schema}_pdv_sale_items_sale ON {schema}.pdv_sale_items(sale_id)"
        ))

    if not await _table_exists(conn, schema, "pdv_sale_payments"):
        await conn.execute(text(f"""
            CREATE TABLE {schema}.pdv_sale_payments (
                id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                sale_id           UUID NOT NULL REFERENCES {schema}.pdv_sales(id) ON DELETE CASCADE,
                payment_method_id UUID NOT NULL REFERENCES {schema}.pdv_payment_methods(id) ON DELETE RESTRICT,
                method_name       VARCHAR(80) NOT NULL,
                method_kind       VARCHAR(20) NOT NULL,
                amount            NUMERIC(12,2) NOT NULL,
                created_at        TIMESTAMP DEFAULT now()
            )
        """))
        await conn.execute(text(
            f"CREATE INDEX ix_{schema}_pdv_sale_payments_sale "
            f"ON {schema}.pdv_sale_payments(sale_id)"
        ))

    # Seed de formas de pagamento iniciais (idempotente).
    await conn.execute(text(f"""
        INSERT INTO {schema}.pdv_payment_methods
            (id, name, kind, affects_cash_drawer, change_enabled, "order", is_active, created_at, updated_at)
        SELECT gen_random_uuid(), 'Dinheiro', 'cash', TRUE, TRUE, 0, TRUE, now(), now()
        WHERE NOT EXISTS (
            SELECT 1 FROM {schema}.pdv_payment_methods WHERE name = 'Dinheiro'
        )
    """))
    await conn.execute(text(f"""
        INSERT INTO {schema}.pdv_payment_methods
            (id, name, kind, affects_cash_drawer, change_enabled, "order", is_active, created_at, updated_at)
        SELECT gen_random_uuid(), 'Cartão', 'card', FALSE, FALSE, 1, TRUE, now(), now()
        WHERE NOT EXISTS (
            SELECT 1 FROM {schema}.pdv_payment_methods WHERE name = 'Cartão'
        )
    """))


async def _step_022_pdv_sale_item_batch_serial(conn: AsyncConnection, schema: str) -> None:
    """Adiciona batch_id/serial_id em pdv_sale_items (venda de lote/série no PDV)."""
    if not await _table_exists(conn, schema, "pdv_sale_items"):
        return
    if not await _column_exists(conn, schema, "pdv_sale_items", "batch_id"):
        await conn.execute(text(
            f"ALTER TABLE {schema}.pdv_sale_items ADD COLUMN batch_id UUID"
        ))
    if not await _column_exists(conn, schema, "pdv_sale_items", "serial_id"):
        await conn.execute(text(
            f"ALTER TABLE {schema}.pdv_sale_items ADD COLUMN serial_id UUID"
        ))


async def _step_023_projetos(conn: AsyncConnection, schema: str) -> None:
    """Cria tabelas do módulo Projetos (MVP kanban)."""
    if not await _table_exists(conn, schema, "project_projects"):
        await conn.execute(text(f"""
            CREATE TABLE {schema}.project_projects (
                id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name        VARCHAR(200) NOT NULL,
                description TEXT,
                owner_id    UUID,
                start_date  TIMESTAMP,
                due_date    TIMESTAMP,
                is_active   BOOLEAN NOT NULL DEFAULT TRUE,
                created_at  TIMESTAMP DEFAULT now(),
                updated_at  TIMESTAMP DEFAULT now()
            )
        """))

    if not await _table_exists(conn, schema, "project_status_configs"):
        await conn.execute(text(f"""
            CREATE TABLE {schema}.project_status_configs (
                id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                project_id UUID NOT NULL REFERENCES {schema}.project_projects(id) ON DELETE CASCADE,
                name       VARCHAR(100) NOT NULL,
                color      VARCHAR(7) NOT NULL DEFAULT '#6B7280',
                "order"    INTEGER NOT NULL DEFAULT 0,
                is_initial BOOLEAN NOT NULL DEFAULT FALSE,
                is_final   BOOLEAN NOT NULL DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT now(),
                updated_at TIMESTAMP DEFAULT now(),
                UNIQUE(project_id, name)
            )
        """))

    if not await _table_exists(conn, schema, "project_tasks"):
        await conn.execute(text(f"""
            CREATE TABLE {schema}.project_tasks (
                id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                project_id  UUID NOT NULL REFERENCES {schema}.project_projects(id) ON DELETE CASCADE,
                status_id   UUID NOT NULL REFERENCES {schema}.project_status_configs(id) ON DELETE RESTRICT,
                title       VARCHAR(200) NOT NULL,
                description TEXT,
                assigned_to UUID,
                due_date    TIMESTAMP,
                priority    VARCHAR(20) NOT NULL DEFAULT 'medium',
                "order"     INTEGER NOT NULL DEFAULT 0,
                created_by  UUID,
                completed_at TIMESTAMP,
                created_at  TIMESTAMP DEFAULT now(),
                updated_at  TIMESTAMP DEFAULT now()
            )
        """))
        await conn.execute(text(
            f"CREATE INDEX ix_{schema}_project_tasks_project ON {schema}.project_tasks(project_id, status_id)"
        ))
        await conn.execute(text(
            f"CREATE INDEX ix_{schema}_project_tasks_assigned ON {schema}.project_tasks(assigned_to)"
        ))

    if not await _table_exists(conn, schema, "project_task_comments"):
        await conn.execute(text(f"""
            CREATE TABLE {schema}.project_task_comments (
                id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                task_id    UUID NOT NULL REFERENCES {schema}.project_tasks(id) ON DELETE CASCADE,
                author_id  UUID,
                content    TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT now()
            )
        """))
        await conn.execute(text(
            f"CREATE INDEX ix_{schema}_project_task_comments_task ON {schema}.project_task_comments(task_id, created_at)"
        ))

    if not await _table_exists(conn, schema, "project_members"):
        await conn.execute(text(f"""
            CREATE TABLE {schema}.project_members (
                id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                project_id UUID NOT NULL REFERENCES {schema}.project_projects(id) ON DELETE CASCADE,
                user_id    UUID NOT NULL,
                role       VARCHAR(30) NOT NULL DEFAULT 'member',
                created_at TIMESTAMP DEFAULT now(),
                UNIQUE(project_id, user_id)
            )
        """))


async def _step_024_projetos_funnels(conn: AsyncConnection, schema: str) -> None:
    """Adiciona suporte a múltiplos funis no módulo de Projetos."""
    if not await _table_exists(conn, schema, "project_projects"):
        return

    if not await _table_exists(conn, schema, "project_funnels"):
        await conn.execute(text(f"""
            CREATE TABLE {schema}.project_funnels (
                id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                project_id  UUID NOT NULL REFERENCES {schema}.project_projects(id) ON DELETE CASCADE,
                name        VARCHAR(120) NOT NULL,
                description TEXT,
                color       VARCHAR(7) NOT NULL DEFAULT '#7C3AED',
                "order"     INTEGER NOT NULL DEFAULT 0,
                is_default  BOOLEAN NOT NULL DEFAULT FALSE,
                is_active   BOOLEAN NOT NULL DEFAULT TRUE,
                created_at  TIMESTAMP DEFAULT now(),
                updated_at  TIMESTAMP DEFAULT now(),
                UNIQUE(project_id, name)
            )
        """))

    if await _table_exists(conn, schema, "project_status_configs") and not await _column_exists(conn, schema, "project_status_configs", "funnel_id"):
        await conn.execute(text(f"ALTER TABLE {schema}.project_status_configs ADD COLUMN funnel_id UUID"))

    if await _table_exists(conn, schema, "project_status_configs"):
        await conn.execute(text(f"""
            INSERT INTO {schema}.project_funnels (project_id, name, description, color, "order", is_default, is_active)
            SELECT p.id, 'Padrão', 'Funil padrão do projeto.', '#7C3AED', 0, TRUE, TRUE
            FROM {schema}.project_projects p
            WHERE NOT EXISTS (
                SELECT 1 FROM {schema}.project_funnels f WHERE f.project_id = p.id
            )
        """))
        await conn.execute(text(f"""
            UPDATE {schema}.project_status_configs s
               SET funnel_id = f.id
              FROM {schema}.project_funnels f
             WHERE s.project_id = f.project_id
               AND f.is_default = TRUE
               AND s.funnel_id IS NULL
        """))
        await conn.execute(text(f"""
            ALTER TABLE {schema}.project_status_configs
            ALTER COLUMN funnel_id SET NOT NULL
        """))
        fk_exists = await conn.execute(text("""
            SELECT 1 FROM information_schema.table_constraints
            WHERE table_schema = :schema
              AND table_name = 'project_status_configs'
              AND constraint_name = 'project_status_configs_funnel_id_fkey'
        """), {"schema": schema})
        if fk_exists.scalar() is None:
            await conn.execute(text(f"""
                ALTER TABLE {schema}.project_status_configs
                ADD CONSTRAINT project_status_configs_funnel_id_fkey
                FOREIGN KEY (funnel_id) REFERENCES {schema}.project_funnels(id) ON DELETE CASCADE
            """))
        await conn.execute(text(f"""
            ALTER TABLE {schema}.project_status_configs
            DROP CONSTRAINT IF EXISTS project_status_configs_project_id_name_key
        """))
        uq_exists = await conn.execute(text("""
            SELECT 1 FROM information_schema.table_constraints
            WHERE table_schema = :schema
              AND table_name = 'project_status_configs'
              AND constraint_name = 'uq_project_status_funnel_name'
        """), {"schema": schema})
        if uq_exists.scalar() is None:
            await conn.execute(text(f"""
                ALTER TABLE {schema}.project_status_configs
                ADD CONSTRAINT uq_project_status_funnel_name UNIQUE (funnel_id, name)
            """))


async def _step_025_projetos_status_active(conn: AsyncConnection, schema: str) -> None:
    """Adiciona is_active nas colunas de status do módulo Projetos."""
    if not await _table_exists(conn, schema, "project_status_configs"):
        return
    if not await _column_exists(conn, schema, "project_status_configs", "is_active"):
        await conn.execute(text(
            f"ALTER TABLE {schema}.project_status_configs "
            f"ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE"
        ))


async def _step_026_projetos_demand_types(conn: AsyncConnection, schema: str) -> None:
    """Cria estruturas de tipos de demanda e formulários por sessão no Projetos."""
    if not await _table_exists(conn, schema, "project_tasks"):
        return

    if not await _table_exists(conn, schema, "project_demand_types"):
        await conn.execute(text(f"""
            CREATE TABLE {schema}.project_demand_types (
                id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                slug        VARCHAR(80) NOT NULL UNIQUE,
                name        VARCHAR(140) NOT NULL UNIQUE,
                description TEXT,
                "order"     INTEGER NOT NULL DEFAULT 0,
                is_active   BOOLEAN NOT NULL DEFAULT TRUE,
                created_at  TIMESTAMP DEFAULT now(),
                updated_at  TIMESTAMP DEFAULT now()
            )
        """))
        await conn.execute(text(f"""
            INSERT INTO {schema}.project_demand_types (slug, name, description, "order", is_active)
            SELECT 'demanda_geral', 'Demanda geral', 'Tipo padrão para demandas do kanban.', 0, TRUE
            WHERE NOT EXISTS (SELECT 1 FROM {schema}.project_demand_types)
        """))

    if not await _column_exists(conn, schema, "project_tasks", "demand_type_id"):
        await conn.execute(text(f"ALTER TABLE {schema}.project_tasks ADD COLUMN demand_type_id UUID"))
        await conn.execute(text(f"""
            UPDATE {schema}.project_tasks t
               SET demand_type_id = dt.id
              FROM {schema}.project_demand_types dt
             WHERE dt.slug = 'demanda_geral'
               AND t.demand_type_id IS NULL
        """))
        await conn.execute(text(f"""
            ALTER TABLE {schema}.project_tasks
            ADD CONSTRAINT fk_project_tasks_demand_type
            FOREIGN KEY (demand_type_id) REFERENCES {schema}.project_demand_types(id) ON DELETE SET NULL
        """))
        await conn.execute(text(
            f"CREATE INDEX IF NOT EXISTS ix_{schema}_project_tasks_demand_type ON {schema}.project_tasks(demand_type_id)"
        ))

    if not await _table_exists(conn, schema, "project_demand_form_sections"):
        await conn.execute(text(f"""
            CREATE TABLE {schema}.project_demand_form_sections (
                id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                demand_type_id UUID NOT NULL REFERENCES {schema}.project_demand_types(id) ON DELETE CASCADE,
                key            VARCHAR(80) NOT NULL,
                title          VARCHAR(140) NOT NULL,
                description    TEXT,
                "order"        INTEGER NOT NULL DEFAULT 0,
                is_active      BOOLEAN NOT NULL DEFAULT TRUE,
                created_at     TIMESTAMP DEFAULT now(),
                updated_at     TIMESTAMP DEFAULT now(),
                UNIQUE(demand_type_id, key)
            )
        """))

    if not await _table_exists(conn, schema, "project_demand_form_fields"):
        await conn.execute(text(f"""
            CREATE TABLE {schema}.project_demand_form_fields (
                id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                section_id  UUID NOT NULL REFERENCES {schema}.project_demand_form_sections(id) ON DELETE CASCADE,
                field_key   VARCHAR(80) NOT NULL,
                label       VARCHAR(140) NOT NULL,
                field_type  VARCHAR(30) NOT NULL DEFAULT 'text',
                placeholder VARCHAR(200),
                options     JSONB,
                validation  JSONB,
                is_required BOOLEAN NOT NULL DEFAULT FALSE,
                is_active   BOOLEAN NOT NULL DEFAULT TRUE,
                "order"     INTEGER NOT NULL DEFAULT 0,
                created_at  TIMESTAMP DEFAULT now(),
                updated_at  TIMESTAMP DEFAULT now(),
                UNIQUE(section_id, field_key)
            )
        """))

    if not await _table_exists(conn, schema, "project_status_section_links"):
        await conn.execute(text(f"""
            CREATE TABLE {schema}.project_status_section_links (
                id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                status_id  UUID NOT NULL REFERENCES {schema}.project_status_configs(id) ON DELETE CASCADE,
                section_id UUID NOT NULL REFERENCES {schema}.project_demand_form_sections(id) ON DELETE CASCADE,
                mode       VARCHAR(20) NOT NULL DEFAULT 'visible',
                created_at TIMESTAMP DEFAULT now(),
                UNIQUE(status_id, section_id)
            )
        """))

    if not await _table_exists(conn, schema, "project_demand_form_submissions"):
        await conn.execute(text(f"""
            CREATE TABLE {schema}.project_demand_form_submissions (
                id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                task_id    UUID NOT NULL REFERENCES {schema}.project_tasks(id) ON DELETE CASCADE UNIQUE,
                values     JSONB NOT NULL DEFAULT '{{}}'::jsonb,
                updated_by UUID,
                created_at TIMESTAMP DEFAULT now(),
                updated_at TIMESTAMP DEFAULT now()
            )
        """))


async def _step_029_default_project(conn: AsyncConnection, schema: str) -> None:
    """Garante que cada tenant tenha pelo menos um projeto + funil + status iniciais."""
    if not await _table_exists(conn, schema, "project_projects"):
        return

    result = await conn.execute(text(f"SELECT id FROM {schema}.project_projects LIMIT 1"))
    if result.scalar() is not None:
        return

    project = await conn.execute(text(f"""
        INSERT INTO {schema}.project_projects (id, name, description, is_active, created_at, updated_at)
        VALUES (gen_random_uuid(), 'Padrão', 'Projeto padrão criado automaticamente.', TRUE, now(), now())
        RETURNING id
    """))
    project_id = project.scalar()

    funnel = await conn.execute(text(f"""
        INSERT INTO {schema}.project_funnels
            (id, project_id, name, description, color, "order", is_default, is_active, created_at, updated_at)
        VALUES
            (gen_random_uuid(), :pid, 'Padrão', 'Funil padrão.', '#7C3AED', 0, TRUE, TRUE, now(), now())
        RETURNING id
    """), {"pid": project_id})
    funnel_id = funnel.scalar()

    await conn.execute(text(f"""
        INSERT INTO {schema}.project_status_configs
            (id, project_id, funnel_id, name, color, "order", is_initial, is_final, is_active, created_at, updated_at)
        VALUES
            (gen_random_uuid(), :pid, :fid, 'Backlog',     '#64748B', 0, TRUE,  FALSE, TRUE, now(), now()),
            (gen_random_uuid(), :pid, :fid, 'Em andamento','#3B82F6', 1, FALSE, FALSE, TRUE, now(), now()),
            (gen_random_uuid(), :pid, :fid, 'Concluído',   '#22C55E', 2, FALSE, TRUE,  TRUE, now(), now())
    """), {"pid": project_id, "fid": funnel_id})


async def _step_028_drop_project_task_priority(conn: AsyncConnection, schema: str) -> None:
    """Remove a coluna priority de project_tasks (descomissionada)."""
    if not await _table_exists(conn, schema, "project_tasks"):
        return
    if await _column_exists(conn, schema, "project_tasks", "priority"):
        await conn.execute(text(f"ALTER TABLE {schema}.project_tasks DROP COLUMN priority"))


async def _step_027_demand_type_funnel(conn: AsyncConnection, schema: str) -> None:
    """Adiciona funnel_id em project_demand_types (vincula tipo de demanda a um kanban)."""
    if not await _table_exists(conn, schema, "project_demand_types"):
        return
    if not await _column_exists(conn, schema, "project_demand_types", "funnel_id"):
        await conn.execute(text(
            f"ALTER TABLE {schema}.project_demand_types ADD COLUMN funnel_id UUID"
        ))
    fk_exists = await conn.execute(text("""
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_schema = :schema
          AND table_name = 'project_demand_types'
          AND constraint_name = 'fk_project_demand_types_funnel'
    """), {"schema": schema})
    if fk_exists.scalar() is None:
        await conn.execute(text(f"""
            ALTER TABLE {schema}.project_demand_types
            ADD CONSTRAINT fk_project_demand_types_funnel
            FOREIGN KEY (funnel_id) REFERENCES {schema}.project_funnels(id) ON DELETE SET NULL
        """))
    await conn.execute(text(
        f"CREATE INDEX IF NOT EXISTS ix_{schema}_project_demand_types_funnel "
        f"ON {schema}.project_demand_types(funnel_id)"
    ))


async def _step_030_teamops(conn: AsyncConnection, schema: str) -> None:
    """Cria tabelas do módulo TeamOps (Gestão de Times e Capacidade)."""
    if not await _table_exists(conn, schema, "team_stack_categories"):
        await conn.execute(text(f"""
            CREATE TABLE {schema}.team_stack_categories (
                id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name       VARCHAR(120) NOT NULL,
                "order"    INTEGER NOT NULL DEFAULT 0,
                is_active  BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT now(),
                updated_at TIMESTAMP DEFAULT now(),
                CONSTRAINT uq_team_stack_categories_name UNIQUE (name)
            )
        """))

    if not await _table_exists(conn, schema, "team_stacks"):
        await conn.execute(text(f"""
            CREATE TABLE {schema}.team_stacks (
                id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                category_id UUID NOT NULL REFERENCES {schema}.team_stack_categories(id) ON DELETE CASCADE,
                name        VARCHAR(140) NOT NULL,
                slug        VARCHAR(140) NOT NULL,
                is_critical BOOLEAN NOT NULL DEFAULT FALSE,
                is_active   BOOLEAN NOT NULL DEFAULT TRUE,
                created_at  TIMESTAMP DEFAULT now(),
                updated_at  TIMESTAMP DEFAULT now(),
                CONSTRAINT uq_team_stacks_slug UNIQUE (slug)
            )
        """))
        await conn.execute(text(
            f"CREATE INDEX ix_{schema}_team_stacks_category ON {schema}.team_stacks(category_id)"
        ))

    if not await _table_exists(conn, schema, "team_absence_types"):
        await conn.execute(text(f"""
            CREATE TABLE {schema}.team_absence_types (
                id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name              VARCHAR(120) NOT NULL,
                slug              VARCHAR(80) NOT NULL,
                requires_approval BOOLEAN NOT NULL DEFAULT TRUE,
                affects_capacity  BOOLEAN NOT NULL DEFAULT TRUE,
                color             VARCHAR(7) NOT NULL DEFAULT '#8B5CF6',
                is_active         BOOLEAN NOT NULL DEFAULT TRUE,
                created_at        TIMESTAMP DEFAULT now(),
                updated_at        TIMESTAMP DEFAULT now(),
                CONSTRAINT uq_team_absence_types_slug UNIQUE (slug)
            )
        """))

    if not await _table_exists(conn, schema, "team_areas"):
        await conn.execute(text(f"""
            CREATE TABLE {schema}.team_areas (
                id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name                      VARCHAR(140) NOT NULL UNIQUE,
                description               TEXT,
                parent_area_id            UUID,
                area_type                 VARCHAR(20) NOT NULL DEFAULT 'negocio',
                po_person_id              UUID,
                tech_reference_person_id  UUID,
                coordinator_person_id     UUID,
                manager_person_id         UUID,
                status                    VARCHAR(20) NOT NULL DEFAULT 'ativa',
                is_active                 BOOLEAN NOT NULL DEFAULT TRUE,
                created_at                TIMESTAMP DEFAULT now(),
                updated_at                TIMESTAMP DEFAULT now()
            )
        """))
        await conn.execute(text(f"""
            ALTER TABLE {schema}.team_areas
            ADD CONSTRAINT fk_team_areas_parent
            FOREIGN KEY (parent_area_id) REFERENCES {schema}.team_areas(id) ON DELETE SET NULL
        """))

    if not await _table_exists(conn, schema, "team_persons"):
        # Nota: position_id é adicionado/populado depois pelo step 033 (team_positions).
        await conn.execute(text(f"""
            CREATE TABLE {schema}.team_persons (
                id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id                   UUID,
                full_name                 VARCHAR(200) NOT NULL,
                email                     VARCHAR(255) NOT NULL,
                phone                     VARCHAR(30),
                team_role                 VARCHAR(30) DEFAULT 'dev_fullstack',
                area_id                   UUID REFERENCES {schema}.team_areas(id) ON DELETE SET NULL,
                po_person_id              UUID,
                tech_reference_person_id  UUID,
                manager_person_id         UUID,
                employment_type           VARCHAR(20) NOT NULL DEFAULT 'clt',
                daily_hours               NUMERIC(4,2) NOT NULL DEFAULT 8.0,
                weekly_hours              NUMERIC(5,2) NOT NULL DEFAULT 40.0,
                start_date                DATE,
                status                    VARCHAR(20) NOT NULL DEFAULT 'ativo',
                notes                     TEXT,
                created_at                TIMESTAMP DEFAULT now(),
                updated_at                TIMESTAMP DEFAULT now(),
                CONSTRAINT uq_team_persons_email UNIQUE (email)
            )
        """))
        # FKs auto-referenciais (após criar a tabela)
        await conn.execute(text(f"""
            ALTER TABLE {schema}.team_persons
            ADD CONSTRAINT fk_team_persons_po
            FOREIGN KEY (po_person_id) REFERENCES {schema}.team_persons(id) ON DELETE SET NULL
        """))
        await conn.execute(text(f"""
            ALTER TABLE {schema}.team_persons
            ADD CONSTRAINT fk_team_persons_tech_ref
            FOREIGN KEY (tech_reference_person_id) REFERENCES {schema}.team_persons(id) ON DELETE SET NULL
        """))
        await conn.execute(text(f"""
            ALTER TABLE {schema}.team_persons
            ADD CONSTRAINT fk_team_persons_manager
            FOREIGN KEY (manager_person_id) REFERENCES {schema}.team_persons(id) ON DELETE SET NULL
        """))
        # FKs em team_areas pra team_persons (agora que ambas existem)
        await conn.execute(text(f"""
            ALTER TABLE {schema}.team_areas
            ADD CONSTRAINT fk_team_areas_po
            FOREIGN KEY (po_person_id) REFERENCES {schema}.team_persons(id) ON DELETE SET NULL
        """))
        await conn.execute(text(f"""
            ALTER TABLE {schema}.team_areas
            ADD CONSTRAINT fk_team_areas_tech_ref
            FOREIGN KEY (tech_reference_person_id) REFERENCES {schema}.team_persons(id) ON DELETE SET NULL
        """))
        await conn.execute(text(f"""
            ALTER TABLE {schema}.team_areas
            ADD CONSTRAINT fk_team_areas_coordinator
            FOREIGN KEY (coordinator_person_id) REFERENCES {schema}.team_persons(id) ON DELETE SET NULL
        """))
        await conn.execute(text(f"""
            ALTER TABLE {schema}.team_areas
            ADD CONSTRAINT fk_team_areas_manager
            FOREIGN KEY (manager_person_id) REFERENCES {schema}.team_persons(id) ON DELETE SET NULL
        """))
        await conn.execute(text(
            f"CREATE INDEX ix_{schema}_team_persons_area ON {schema}.team_persons(area_id)"
        ))
        await conn.execute(text(
            f"CREATE INDEX ix_{schema}_team_persons_role ON {schema}.team_persons(team_role)"
        ))

    if not await _table_exists(conn, schema, "team_person_stacks"):
        await conn.execute(text(f"""
            CREATE TABLE {schema}.team_person_stacks (
                id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                person_id       UUID NOT NULL REFERENCES {schema}.team_persons(id) ON DELETE CASCADE,
                stack_id        UUID NOT NULL REFERENCES {schema}.team_stacks(id) ON DELETE CASCADE,
                level           VARCHAR(20) NOT NULL DEFAULT 'pleno',
                years_experience INTEGER NOT NULL DEFAULT 0,
                is_reference    BOOLEAN NOT NULL DEFAULT FALSE,
                notes           TEXT,
                created_at      TIMESTAMP DEFAULT now(),
                updated_at      TIMESTAMP DEFAULT now(),
                CONSTRAINT uq_team_person_stack UNIQUE (person_id, stack_id)
            )
        """))

    if not await _table_exists(conn, schema, "team_absences"):
        await conn.execute(text(f"""
            CREATE TABLE {schema}.team_absences (
                id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                person_id           UUID NOT NULL REFERENCES {schema}.team_persons(id) ON DELETE CASCADE,
                absence_type_id     UUID NOT NULL REFERENCES {schema}.team_absence_types(id) ON DELETE RESTRICT,
                start_date          DATE NOT NULL,
                end_date            DATE NOT NULL,
                partial_hours       NUMERIC(5,2),
                status              VARCHAR(20) NOT NULL DEFAULT 'pendente',
                requested_by        UUID,
                approver_person_id  UUID REFERENCES {schema}.team_persons(id) ON DELETE SET NULL,
                approved_at         TIMESTAMP,
                decision_notes      TEXT,
                notes               TEXT,
                created_at          TIMESTAMP DEFAULT now(),
                updated_at          TIMESTAMP DEFAULT now()
            )
        """))
        await conn.execute(text(
            f"CREATE INDEX ix_{schema}_team_absences_person ON {schema}.team_absences(person_id, start_date)"
        ))
        await conn.execute(text(
            f"CREATE INDEX ix_{schema}_team_absences_status ON {schema}.team_absences(status)"
        ))

    # Seed básico: categorias de stack + tipos de ausência (idempotente via ON CONFLICT)
    for order, cat_name in enumerate(("Desenvolvimento", "Dados", "Infra/DevOps", "Produto e Gestão")):
        await conn.execute(text(f"""
            INSERT INTO {schema}.team_stack_categories (id, name, "order", is_active, created_at, updated_at)
            VALUES (gen_random_uuid(), :n, :o, TRUE, now(), now())
            ON CONFLICT (name) DO NOTHING
        """), {"n": cat_name, "o": order})

    for slug, name in (
        ("ferias", "Férias"),
        ("afastamento_medico", "Afastamento médico"),
        ("folga", "Folga"),
        ("banco_horas", "Banco de horas"),
        ("treinamento", "Treinamento"),
    ):
        await conn.execute(text(f"""
            INSERT INTO {schema}.team_absence_types (id, name, slug, requires_approval, affects_capacity, color, is_active, created_at, updated_at)
            VALUES (gen_random_uuid(), :n, :s, TRUE, TRUE, '#8B5CF6', TRUE, now(), now())
            ON CONFLICT (slug) DO NOTHING
        """), {"n": name, "s": slug})


async def _step_031_teamops_drop_positions(conn: AsyncConnection, schema: str) -> None:
    """
    OBSOLETO / NO-OP.

    Originalmente este step removia a tabela team_positions e a coluna position_id
    (quando 'cargo' e 'papel no time' foram unificados num enum). Essa decisão foi
    revertida no step 033, que recria team_positions como catálogo editável e migra
    os cargos. Como os dois steps rodam no MESMO boot, mantê-lo ativo zerava o
    position_id de todas as pessoas a cada rebuild (caíam no fallback 'dev_fullstack').

    Mantido como no-op apenas para preservar a ordem histórica dos steps.
    """
    return


SYSTEM_POSITIONS: list[tuple[str, str, int]] = [
    ("gerente", "Gerente", 0),
    ("coordenador", "Coordenador", 10),
    ("po", "Product Owner", 20),
    ("scrum_master", "Scrum Master", 30),
    ("tech_reference", "Referência Técnica", 40),
    ("architect", "Arquiteto", 50),
    ("dev_backend", "Dev Backend", 60),
    ("dev_frontend", "Dev Frontend", 70),
    ("dev_fullstack", "Dev Fullstack", 80),
    ("qa", "QA", 90),
    ("ux_ui", "UX/UI Designer", 100),
    ("data_analyst", "Analista de Dados", 110),
    ("data_scientist", "Cientista de Dados", 120),
    ("devops", "DevOps", 130),
    ("support", "Suporte", 140),
    ("requirements", "Analista de Requisitos", 150),
    ("intern", "Estagiário", 160),
]


async def _step_033_teamops_positions(conn: AsyncConnection, schema: str) -> None:
    """Substitui o enum team_role por uma tabela editável team_positions."""
    if not await _table_exists(conn, schema, "team_persons"):
        return

    # 1) Cria a tabela team_positions (catálogo editável)
    if not await _table_exists(conn, schema, "team_positions"):
        await conn.execute(text(f"""
            CREATE TABLE {schema}.team_positions (
                id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                slug        VARCHAR(80) NOT NULL,
                name        VARCHAR(140) NOT NULL,
                description TEXT,
                is_system   BOOLEAN NOT NULL DEFAULT FALSE,
                sort_order  INTEGER NOT NULL DEFAULT 0,
                is_active   BOOLEAN NOT NULL DEFAULT TRUE,
                created_at  TIMESTAMP DEFAULT now(),
                updated_at  TIMESTAMP DEFAULT now(),
                CONSTRAINT uq_team_positions_slug UNIQUE (slug)
            )
        """))

    # 2) Popula cargos do sistema (idempotente via ON CONFLICT)
    for slug, name, order in SYSTEM_POSITIONS:
        await conn.execute(text(f"""
            INSERT INTO {schema}.team_positions (id, slug, name, description, is_system, sort_order, is_active, created_at, updated_at)
            VALUES (gen_random_uuid(), :s, :n, NULL, TRUE, :o, TRUE, now(), now())
            ON CONFLICT (slug) DO NOTHING
        """), {"s": slug, "n": name, "o": order})

    # 3) Adiciona coluna position_id (nullable inicialmente)
    if not await _column_exists(conn, schema, "team_persons", "position_id"):
        await conn.execute(text(
            f"ALTER TABLE {schema}.team_persons ADD COLUMN position_id UUID"
        ))

    # 4) Migra: para cada pessoa com team_role definido, vincula ao cargo correspondente
    if await _column_exists(conn, schema, "team_persons", "team_role"):
        await conn.execute(text(f"""
            UPDATE {schema}.team_persons p
               SET position_id = pos.id
              FROM {schema}.team_positions pos
             WHERE pos.slug = p.team_role
               AND p.position_id IS NULL
        """))

    # 5) Garante que toda pessoa tenha algum cargo — fallback para 'dev_fullstack' se faltar
    await conn.execute(text(f"""
        UPDATE {schema}.team_persons p
           SET position_id = (SELECT id FROM {schema}.team_positions WHERE slug = 'dev_fullstack' LIMIT 1)
         WHERE p.position_id IS NULL
    """))

    # 6) Adiciona FK + NOT NULL
    fk_exists = await conn.execute(text("""
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_schema = :schema
          AND table_name = 'team_persons'
          AND constraint_name = 'fk_team_persons_position'
    """), {"schema": schema})
    if fk_exists.scalar() is None:
        await conn.execute(text(f"""
            ALTER TABLE {schema}.team_persons
            ADD CONSTRAINT fk_team_persons_position
            FOREIGN KEY (position_id) REFERENCES {schema}.team_positions(id) ON DELETE RESTRICT
        """))
    await conn.execute(text(
        f"ALTER TABLE {schema}.team_persons ALTER COLUMN position_id SET NOT NULL"
    ))

    # 7) Drop coluna team_role (substituída por position_id)
    if await _column_exists(conn, schema, "team_persons", "team_role"):
        await conn.execute(text(
            f"DROP INDEX IF EXISTS {schema}.ix_{schema}_team_persons_role"
        ))
        await conn.execute(text(
            f"ALTER TABLE {schema}.team_persons DROP COLUMN team_role"
        ))

    # 8) Índice para o novo cargo
    await conn.execute(text(
        f"CREATE INDEX IF NOT EXISTS ix_{schema}_team_persons_position "
        f"ON {schema}.team_persons(position_id)"
    ))


async def _step_032_teamops_area_parent(conn: AsyncConnection, schema: str) -> None:
    """Adiciona parent_area_id em team_areas para suportar sub-áreas."""
    if not await _table_exists(conn, schema, "team_areas"):
        return
    if not await _column_exists(conn, schema, "team_areas", "parent_area_id"):
        await conn.execute(text(
            f"ALTER TABLE {schema}.team_areas ADD COLUMN parent_area_id UUID"
        ))
    fk_exists = await conn.execute(text("""
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_schema = :schema
          AND table_name = 'team_areas'
          AND constraint_name = 'fk_team_areas_parent'
    """), {"schema": schema})
    if fk_exists.scalar() is None:
        await conn.execute(text(f"""
            ALTER TABLE {schema}.team_areas
            ADD CONSTRAINT fk_team_areas_parent
            FOREIGN KEY (parent_area_id) REFERENCES {schema}.team_areas(id) ON DELETE SET NULL
        """))


async def _step_034_projetos_hierarchy(conn: AsyncConnection, schema: str) -> None:
    """Hierarquia de cards (parent/origin) + regras de tipos-filho + fase que converte."""
    if await _table_exists(conn, schema, "project_tasks"):
        if not await _column_exists(conn, schema, "project_tasks", "parent_task_id"):
            await conn.execute(text(
                f"ALTER TABLE {schema}.project_tasks ADD COLUMN parent_task_id UUID"
            ))
            await conn.execute(text(f"""
                ALTER TABLE {schema}.project_tasks
                ADD CONSTRAINT fk_project_tasks_parent
                FOREIGN KEY (parent_task_id) REFERENCES {schema}.project_tasks(id) ON DELETE SET NULL
            """))
            await conn.execute(text(
                f"CREATE INDEX IF NOT EXISTS ix_{schema}_project_tasks_parent "
                f"ON {schema}.project_tasks(parent_task_id)"
            ))
        if not await _column_exists(conn, schema, "project_tasks", "origin_task_id"):
            await conn.execute(text(
                f"ALTER TABLE {schema}.project_tasks ADD COLUMN origin_task_id UUID"
            ))
            await conn.execute(text(f"""
                ALTER TABLE {schema}.project_tasks
                ADD CONSTRAINT fk_project_tasks_origin
                FOREIGN KEY (origin_task_id) REFERENCES {schema}.project_tasks(id) ON DELETE SET NULL
            """))
            await conn.execute(text(
                f"CREATE INDEX IF NOT EXISTS ix_{schema}_project_tasks_origin "
                f"ON {schema}.project_tasks(origin_task_id)"
            ))

    if await _table_exists(conn, schema, "project_demand_types"):
        if not await _column_exists(conn, schema, "project_demand_types", "allowed_child_type_ids"):
            await conn.execute(text(
                f"ALTER TABLE {schema}.project_demand_types ADD COLUMN allowed_child_type_ids JSONB"
            ))

    if await _table_exists(conn, schema, "project_status_configs"):
        if not await _column_exists(conn, schema, "project_status_configs", "creates_demand_type_id"):
            await conn.execute(text(
                f"ALTER TABLE {schema}.project_status_configs ADD COLUMN creates_demand_type_id UUID"
            ))
            await conn.execute(text(f"""
                ALTER TABLE {schema}.project_status_configs
                ADD CONSTRAINT fk_project_status_creates_type
                FOREIGN KEY (creates_demand_type_id) REFERENCES {schema}.project_demand_types(id) ON DELETE SET NULL
            """))


async def _step_035_projetos_kanbans(conn: AsyncConnection, schema: str) -> None:
    """Kanbans-base reutilizáveis: tipos permitidos por funil, transição entre funis
    (moves_to_funnel_id) e seed dos 4 kanbans padrão (Triagem PMO, Planejamento PO,
    Desenvolvimento, DevOps) no projeto Padrão."""
    if not await _table_exists(conn, schema, "project_funnels"):
        return

    # 1) Colunas novas
    if not await _column_exists(conn, schema, "project_funnels", "allowed_demand_type_ids"):
        await conn.execute(text(
            f"ALTER TABLE {schema}.project_funnels ADD COLUMN allowed_demand_type_ids JSONB"
        ))
    if not await _column_exists(conn, schema, "project_status_configs", "moves_to_funnel_id"):
        await conn.execute(text(
            f"ALTER TABLE {schema}.project_status_configs ADD COLUMN moves_to_funnel_id UUID"
        ))
        await conn.execute(text(f"""
            ALTER TABLE {schema}.project_status_configs
            ADD CONSTRAINT fk_project_status_moves_to_funnel
            FOREIGN KEY (moves_to_funnel_id) REFERENCES {schema}.project_funnels(id) ON DELETE SET NULL
        """))

    # 2) Seed dos kanbans-base no projeto "Padrão" (idempotente por nome)
    proj = await conn.execute(text(
        f"SELECT id FROM {schema}.project_projects ORDER BY created_at ASC LIMIT 1"
    ))
    project_id = proj.scalar()
    if project_id is None:
        return

    KANBANS = [
        ("Triagem PMO",     "#014898", [("Recebida", True, False), ("Em triagem", False, False), ("Aprovada", False, True)]),
        ("Planejamento PO", "#164194", [("Backlog", True, False), ("Requisitos", False, False), ("Cronograma", False, False), ("Validado", False, True)]),
        ("Desenvolvimento", "#008BD2", [("A fazer", True, False), ("Em desenvolvimento", False, False), ("Testes internos", False, False), ("Homologação", False, True)]),
        ("DevOps",          "#6AB42F", [("Fila", True, False), ("Segurança/Ambiente", False, False), ("Deploy", False, False), ("Concluído", False, True)]),
    ]
    for order, (fname, color, cols) in enumerate(KANBANS, start=1):
        existing = await conn.execute(text(
            f"SELECT id FROM {schema}.project_funnels WHERE project_id = :pid AND name = :n"
        ), {"pid": project_id, "n": fname})
        fid = existing.scalar()
        if fid is None:
            created = await conn.execute(text(f"""
                INSERT INTO {schema}.project_funnels
                    (id, project_id, name, description, color, "order", is_default, is_active, created_at, updated_at)
                VALUES (gen_random_uuid(), :pid, :n, :d, :c, :o, FALSE, TRUE, now(), now())
                RETURNING id
            """), {"pid": project_id, "n": fname, "d": f"Kanban padrão: {fname}.", "c": color, "o": 10 + order})
            fid = created.scalar()
            for col_order, (cname, is_init, is_final) in enumerate(cols):
                await conn.execute(text(f"""
                    INSERT INTO {schema}.project_status_configs
                        (id, project_id, funnel_id, name, color, "order", is_initial, is_final, is_active, created_at, updated_at)
                    VALUES (gen_random_uuid(), :pid, :fid, :n, :c, :o, :ini, :fin, TRUE, now(), now())
                """), {"pid": project_id, "fid": fid, "n": cname, "c": color, "o": col_order, "ini": is_init, "fin": is_final})


async def _step_036_projetos_automations(conn: AsyncConnection, schema: str) -> None:
    """Cria tabela de automações por etapa do kanban (projetos)."""
    if not await _table_exists(conn, schema, "project_status_configs"):
        return
    if not await _table_exists(conn, schema, "project_automation_rules"):
        await conn.execute(text(f"""
            CREATE TABLE {schema}.project_automation_rules (
                id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                project_id    UUID NOT NULL REFERENCES {schema}.project_projects(id) ON DELETE CASCADE,
                status_id     UUID NOT NULL REFERENCES {schema}.project_status_configs(id) ON DELETE CASCADE,
                name          VARCHAR(140) NOT NULL,
                trigger       VARCHAR(30) NOT NULL DEFAULT 'enter_status',
                action        VARCHAR(30) NOT NULL,
                action_config JSONB,
                "order"       INTEGER NOT NULL DEFAULT 0,
                is_active     BOOLEAN NOT NULL DEFAULT TRUE,
                created_at    TIMESTAMP DEFAULT now(),
                updated_at    TIMESTAMP DEFAULT now()
            )
        """))
        await conn.execute(text(
            f"CREATE INDEX ix_{schema}_project_automation_status "
            f"ON {schema}.project_automation_rules(status_id, is_active)"
        ))


async def _step_037_projetos_move_permissions(conn: AsyncConnection, schema: str) -> None:
    """Permissão de movimentação por função: move_in_role_ids em project_status_configs."""
    if not await _table_exists(conn, schema, "project_status_configs"):
        return
    if not await _column_exists(conn, schema, "project_status_configs", "move_in_role_ids"):
        await conn.execute(text(
            f"ALTER TABLE {schema}.project_status_configs ADD COLUMN move_in_role_ids JSONB"
        ))


async def _step_038_projetos_sla(conn: AsyncConnection, schema: str) -> None:
    """SLA por etapa: sla_hours/sla_warning_pct em status; status_entered_at/sla_state em task."""
    if await _table_exists(conn, schema, "project_status_configs"):
        if not await _column_exists(conn, schema, "project_status_configs", "sla_hours"):
            await conn.execute(text(f"ALTER TABLE {schema}.project_status_configs ADD COLUMN sla_hours INTEGER"))
        if not await _column_exists(conn, schema, "project_status_configs", "sla_warning_pct"):
            await conn.execute(text(
                f"ALTER TABLE {schema}.project_status_configs ADD COLUMN sla_warning_pct INTEGER NOT NULL DEFAULT 80"
            ))
    if await _table_exists(conn, schema, "project_tasks"):
        if not await _column_exists(conn, schema, "project_tasks", "status_entered_at"):
            await conn.execute(text(
                f"ALTER TABLE {schema}.project_tasks ADD COLUMN status_entered_at TIMESTAMP"
            ))
            # inicializa com created_at para cards já existentes
            await conn.execute(text(
                f"UPDATE {schema}.project_tasks SET status_entered_at = created_at WHERE status_entered_at IS NULL"
            ))
        if not await _column_exists(conn, schema, "project_tasks", "sla_state"):
            await conn.execute(text(
                f"ALTER TABLE {schema}.project_tasks ADD COLUMN sla_state VARCHAR(12) NOT NULL DEFAULT 'none'"
            ))


async def _step_039_projetos_task_start_date(conn: AsyncConnection, schema: str) -> None:
    """Adiciona start_date em project_tasks (para o cronograma/Gantt)."""
    if not await _table_exists(conn, schema, "project_tasks"):
        return
    if not await _column_exists(conn, schema, "project_tasks", "start_date"):
        await conn.execute(text(f"ALTER TABLE {schema}.project_tasks ADD COLUMN start_date TIMESTAMP"))


async def _step_040_projetos_demand_type_basic(conn: AsyncConnection, schema: str) -> None:
    """Adiciona available_for_basic em project_demand_types: se False, usuários basic
    não podem solicitar nem visualizar demandas deste tipo."""
    if not await _table_exists(conn, schema, "project_demand_types"):
        return
    if not await _column_exists(conn, schema, "project_demand_types", "available_for_basic"):
        await conn.execute(text(
            f"ALTER TABLE {schema}.project_demand_types "
            "ADD COLUMN available_for_basic BOOLEAN NOT NULL DEFAULT TRUE"
        ))


async def _step_041_projetos_demand_type_schedule(conn: AsyncConnection, schema: str) -> None:
    """Adiciona show_in_schedule em project_demand_types: se False, itens deste tipo
    não aparecem no Cronograma."""
    if not await _table_exists(conn, schema, "project_demand_types"):
        return
    if not await _column_exists(conn, schema, "project_demand_types", "show_in_schedule"):
        await conn.execute(text(
            f"ALTER TABLE {schema}.project_demand_types "
            "ADD COLUMN show_in_schedule BOOLEAN NOT NULL DEFAULT TRUE"
        ))


async def _step_042_teamops_position_role(conn: AsyncConnection, schema: str) -> None:
    """Adiciona role_id em team_positions: cada cargo aponta para uma role (public.roles)
    que guarda sua matriz de permissões."""
    if not await _table_exists(conn, schema, "team_positions"):
        return
    if not await _column_exists(conn, schema, "team_positions", "role_id"):
        await conn.execute(text(
            f"ALTER TABLE {schema}.team_positions ADD COLUMN role_id UUID"
        ))


async def _step_043_projetos_schedule_bindings(conn: AsyncConnection, schema: str) -> None:
    """Cria a tabela de vínculos do Cronograma (fluxo+etapa onde o cronograma é
    preenchido), parte do módulo Projetos."""
    if not await _table_exists(conn, schema, "project_status_configs"):
        return
    if not await _table_exists(conn, schema, "project_schedule_bindings"):
        await conn.execute(text(f"""
            CREATE TABLE {schema}.project_schedule_bindings (
                id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                funnel_id    UUID NOT NULL REFERENCES {schema}.project_funnels(id) ON DELETE CASCADE,
                status_id    UUID NOT NULL REFERENCES {schema}.project_status_configs(id) ON DELETE CASCADE,
                require_fill BOOLEAN NOT NULL DEFAULT TRUE,
                is_active    BOOLEAN NOT NULL DEFAULT TRUE,
                created_at   TIMESTAMP DEFAULT now(),
                updated_at   TIMESTAMP DEFAULT now(),
                UNIQUE(status_id)
            )
        """))
        await conn.execute(text(
            f"CREATE INDEX ix_{schema}_project_schedule_bindings_funnel "
            f"ON {schema}.project_schedule_bindings(funnel_id)"
        ))


async def _step_044_projetos_priority(conn: AsyncConnection, schema: str) -> None:
    """Cria as tabelas da Matriz de Priorização (Impacto × Esforço), parte do
    módulo Projetos. Config 100% customizável por tenant + score 1:1 por demanda."""
    if not await _table_exists(conn, schema, "project_tasks"):
        return

    if not await _table_exists(conn, schema, "project_priority_criteria"):
        await conn.execute(text(f"""
            CREATE TABLE {schema}.project_priority_criteria (
                id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                axis        VARCHAR(10) NOT NULL,
                code        VARCHAR(40) NOT NULL,
                label       VARCHAR(140) NOT NULL,
                weight      NUMERIC(5,4) NOT NULL DEFAULT 0,
                scale       JSONB NOT NULL DEFAULT '[]'::jsonb,
                "order"     INTEGER NOT NULL DEFAULT 0,
                is_active   BOOLEAN NOT NULL DEFAULT TRUE,
                created_at  TIMESTAMP DEFAULT now(),
                updated_at  TIMESTAMP DEFAULT now(),
                UNIQUE(axis, code)
            )
        """))
    else:
        # Tenants onde o step 044 já criou a tabela com rubric_1/3/5: migra para `scale`.
        if not await _column_exists(conn, schema, "project_priority_criteria", "scale"):
            await conn.execute(text(
                f"ALTER TABLE {schema}.project_priority_criteria ADD COLUMN scale JSONB NOT NULL DEFAULT '[]'::jsonb"
            ))
        for col in ("rubric_1", "rubric_3", "rubric_5"):
            if await _column_exists(conn, schema, "project_priority_criteria", col):
                await conn.execute(text(
                    f"ALTER TABLE {schema}.project_priority_criteria DROP COLUMN {col}"
                ))

    if not await _table_exists(conn, schema, "project_priority_pillars"):
        await conn.execute(text(f"""
            CREATE TABLE {schema}.project_priority_pillars (
                id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                code        VARCHAR(8) NOT NULL,
                label       VARCHAR(200) NOT NULL,
                perspective VARCHAR(60) NOT NULL,
                modifier    NUMERIC(4,2) NOT NULL DEFAULT 1,
                color       VARCHAR(7) NOT NULL DEFAULT '#6B7280',
                "order"     INTEGER NOT NULL DEFAULT 0,
                is_active   BOOLEAN NOT NULL DEFAULT TRUE,
                created_at  TIMESTAMP DEFAULT now(),
                updated_at  TIMESTAMP DEFAULT now(),
                UNIQUE(code)
            )
        """))

    if not await _table_exists(conn, schema, "project_priority_confidence_levels"):
        await conn.execute(text(f"""
            CREATE TABLE {schema}.project_priority_confidence_levels (
                id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                code        VARCHAR(20) NOT NULL,
                label       VARCHAR(60) NOT NULL,
                divisor     NUMERIC(4,2) NOT NULL DEFAULT 1,
                "order"     INTEGER NOT NULL DEFAULT 0,
                is_active   BOOLEAN NOT NULL DEFAULT TRUE,
                created_at  TIMESTAMP DEFAULT now(),
                updated_at  TIMESTAMP DEFAULT now(),
                UNIQUE(code)
            )
        """))

    if not await _table_exists(conn, schema, "project_priority_quadrants"):
        await conn.execute(text(f"""
            CREATE TABLE {schema}.project_priority_quadrants (
                id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                code        VARCHAR(20) NOT NULL,
                label       VARCHAR(80) NOT NULL,
                color       VARCHAR(7) NOT NULL DEFAULT '#6B7280',
                action_hint TEXT,
                "order"     INTEGER NOT NULL DEFAULT 0,
                created_at  TIMESTAMP DEFAULT now(),
                updated_at  TIMESTAMP DEFAULT now(),
                UNIQUE(code)
            )
        """))

    if not await _table_exists(conn, schema, "project_priority_settings"):
        await conn.execute(text(f"""
            CREATE TABLE {schema}.project_priority_settings (
                id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                impact_cut    NUMERIC(4,2) NOT NULL DEFAULT 3,
                effort_cut    NUMERIC(4,2) NOT NULL DEFAULT 3,
                confidence_id UUID REFERENCES {schema}.project_priority_confidence_levels(id) ON DELETE SET NULL,
                is_enabled    BOOLEAN NOT NULL DEFAULT TRUE,
                created_at    TIMESTAMP DEFAULT now(),
                updated_at    TIMESTAMP DEFAULT now()
            )
        """))
    elif not await _column_exists(conn, schema, "project_priority_settings", "confidence_id"):
        # tenants onde o step 044 já rodou sem a coluna (confiança global)
        await conn.execute(text(
            f"ALTER TABLE {schema}.project_priority_settings ADD COLUMN confidence_id UUID "
            f"REFERENCES {schema}.project_priority_confidence_levels(id) ON DELETE SET NULL"
        ))

    if not await _table_exists(conn, schema, "project_priority_scores"):
        await conn.execute(text(f"""
            CREATE TABLE {schema}.project_priority_scores (
                id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                task_id         UUID NOT NULL REFERENCES {schema}.project_tasks(id) ON DELETE CASCADE,
                pillar_id       UUID REFERENCES {schema}.project_priority_pillars(id) ON DELETE RESTRICT,
                confidence_id   UUID REFERENCES {schema}.project_priority_confidence_levels(id) ON DELETE RESTRICT,
                impact_scores   JSONB NOT NULL DEFAULT '{{}}'::jsonb,
                effort_scores   JSONB NOT NULL DEFAULT '{{}}'::jsonb,
                impacto_bruto   NUMERIC(6,3) NOT NULL DEFAULT 0,
                modulador       NUMERIC(4,2) NOT NULL DEFAULT 1,
                divisor         NUMERIC(4,2) NOT NULL DEFAULT 1,
                impacto_efetivo NUMERIC(6,3) NOT NULL DEFAULT 0,
                esforco         NUMERIC(6,3) NOT NULL DEFAULT 0,
                quadrant_code   VARCHAR(20) NOT NULL DEFAULT 'fill_in',
                scored_by       UUID,
                scored_at       TIMESTAMP DEFAULT now(),
                created_at      TIMESTAMP DEFAULT now(),
                updated_at      TIMESTAMP DEFAULT now(),
                UNIQUE(task_id)
            )
        """))
        await conn.execute(text(
            f"CREATE INDEX ix_{schema}_project_priority_scores_efetivo "
            f"ON {schema}.project_priority_scores(impacto_efetivo)"
        ))
        await conn.execute(text(
            f"CREATE INDEX ix_{schema}_project_priority_scores_esforco "
            f"ON {schema}.project_priority_scores(esforco)"
        ))
        await conn.execute(text(
            f"CREATE INDEX ix_{schema}_project_priority_scores_quadrant "
            f"ON {schema}.project_priority_scores(quadrant_code)"
        ))


async def _step_045_projetos_priority_stage_mode(conn: AsyncConnection, schema: str) -> None:
    """Adiciona priority_mode (edit|view|hidden) em project_status_configs — controla
    como a priorização aparece nos cards de cada etapa do kanban."""
    if not await _table_exists(conn, schema, "project_status_configs"):
        return
    if not await _column_exists(conn, schema, "project_status_configs", "priority_mode"):
        await conn.execute(text(
            f"ALTER TABLE {schema}.project_status_configs "
            f"ADD COLUMN priority_mode VARCHAR(10) NOT NULL DEFAULT 'edit'"
        ))
    if not await _column_exists(conn, schema, "project_status_configs", "priority_required"):
        await conn.execute(text(
            f"ALTER TABLE {schema}.project_status_configs "
            f"ADD COLUMN priority_required BOOLEAN NOT NULL DEFAULT FALSE"
        ))


async def _step_046_projetos_card_fields(conn: AsyncConnection, schema: str) -> None:
    """Cria a tabela de layout do card (quais atributos aparecem no quadro), por funil."""
    if not await _table_exists(conn, schema, "project_tasks"):
        return
    if not await _table_exists(conn, schema, "project_card_fields"):
        await conn.execute(text(f"""
            CREATE TABLE {schema}.project_card_fields (
                id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                funnel_id   UUID NOT NULL REFERENCES {schema}.project_funnels(id) ON DELETE CASCADE,
                field_key   VARCHAR(40) NOT NULL,
                label       VARCHAR(120) NOT NULL,
                is_visible  BOOLEAN NOT NULL DEFAULT TRUE,
                "order"     INTEGER NOT NULL DEFAULT 0,
                created_at  TIMESTAMP DEFAULT now(),
                updated_at  TIMESTAMP DEFAULT now(),
                UNIQUE(funnel_id, field_key)
            )
        """))


async def _step_047_projetos_card_fields_per_funnel(conn: AsyncConnection, schema: str) -> None:
    """Migra o layout do card de GLOBAL para POR FUNIL. Copia a config global existente
    para cada funil do tenant e remove as linhas globais (funnel_id NULL)."""
    if not await _table_exists(conn, schema, "project_card_fields"):
        return
    if await _column_exists(conn, schema, "project_card_fields", "funnel_id"):
        return  # já migrado
    # 1) coluna funnel_id (nullable durante a migração)
    await conn.execute(text(f"ALTER TABLE {schema}.project_card_fields ADD COLUMN funnel_id UUID"))
    # 2) remove a unicidade antiga (field_key) ANTES de copiar — senão a cópia para
    #    vários funis viola o UNIQUE(field_key).
    await conn.execute(text(
        f"ALTER TABLE {schema}.project_card_fields DROP CONSTRAINT IF EXISTS project_card_fields_field_key_key"
    ))
    # 3) copia a config global (funnel_id NULL) para cada funil existente
    await conn.execute(text(f"""
        INSERT INTO {schema}.project_card_fields (id, funnel_id, field_key, label, is_visible, "order", created_at, updated_at)
        SELECT gen_random_uuid(), f.id, c.field_key, c.label, c.is_visible, c."order", now(), now()
        FROM {schema}.project_funnels f
        CROSS JOIN {schema}.project_card_fields c
        WHERE c.funnel_id IS NULL
    """))
    # 4) remove as linhas globais
    await conn.execute(text(f"DELETE FROM {schema}.project_card_fields WHERE funnel_id IS NULL"))
    # 5) nova unicidade (funnel_id, field_key) e FK
    await conn.execute(text(
        f"ALTER TABLE {schema}.project_card_fields "
        f"ADD CONSTRAINT project_card_fields_funnel_field_key UNIQUE (funnel_id, field_key)"
    ))
    await conn.execute(text(
        f"ALTER TABLE {schema}.project_card_fields "
        f"ADD CONSTRAINT fk_project_card_fields_funnel FOREIGN KEY (funnel_id) "
        f"REFERENCES {schema}.project_funnels(id) ON DELETE CASCADE"
    ))
    await conn.execute(text(f"ALTER TABLE {schema}.project_card_fields ALTER COLUMN funnel_id SET NOT NULL"))


async def _step_048_projetos_planning_kind(conn: AsyncConnection, schema: str) -> None:
    """Adiciona planning_kind (projeto|programa) em project_tasks — classifica o item de
    planejamento criado por conversão."""
    if not await _table_exists(conn, schema, "project_tasks"):
        return
    if not await _column_exists(conn, schema, "project_tasks", "planning_kind"):
        await conn.execute(text(
            f"ALTER TABLE {schema}.project_tasks ADD COLUMN planning_kind VARCHAR(10)"
        ))


async def _step_049_projetos_cascade_children(conn: AsyncConnection, schema: str) -> None:
    """Adiciona cascade_children_on_move em project_status_configs — leva os filhos
    (etapas) junto quando o card transita de kanban."""
    if not await _table_exists(conn, schema, "project_status_configs"):
        return
    if not await _column_exists(conn, schema, "project_status_configs", "cascade_children_on_move"):
        await conn.execute(text(
            f"ALTER TABLE {schema}.project_status_configs "
            f"ADD COLUMN cascade_children_on_move BOOLEAN NOT NULL DEFAULT FALSE"
        ))


async def _step_050_projetos_children_to_funnel(conn: AsyncConnection, schema: str) -> None:
    """Adiciona children_to_funnel_id em project_status_configs — ao entrar na etapa,
    envia os FILHOS (tarefas) para o kanban indicado (o card atual permanece)."""
    if not await _table_exists(conn, schema, "project_status_configs"):
        return
    if not await _column_exists(conn, schema, "project_status_configs", "children_to_funnel_id"):
        await conn.execute(text(
            f"ALTER TABLE {schema}.project_status_configs ADD COLUMN children_to_funnel_id UUID"
        ))


async def _step_052_projetos_grandchildren_to_funnel(conn: AsyncConnection, schema: str) -> None:
    """Adiciona grandchildren_to_funnel_id em project_status_configs — ao entrar na etapa,
    envia os NETOS (descendentes além do 1º nível) para um kanban diferente dos filhos."""
    if not await _table_exists(conn, schema, "project_status_configs"):
        return
    if not await _column_exists(conn, schema, "project_status_configs", "grandchildren_to_funnel_id"):
        await conn.execute(text(
            f"ALTER TABLE {schema}.project_status_configs ADD COLUMN grandchildren_to_funnel_id UUID"
        ))


async def _step_051_projetos_funnel_access(conn: AsyncConnection, schema: str) -> None:
    """Adiciona access_control (JSONB) em project_funnels — controle de acesso por
    função (cargo) ao kanban: gerenciar / somente visualizar / sem acesso."""
    if not await _table_exists(conn, schema, "project_funnels"):
        return
    if not await _column_exists(conn, schema, "project_funnels", "access_control"):
        await conn.execute(text(
            f"ALTER TABLE {schema}.project_funnels ADD COLUMN access_control JSONB"
        ))


async def _step_053_projetos_task_hours_and_deps(conn: AsyncConnection, schema: str) -> None:
    """Cronograma avançado: horas estimadas em project_tasks + tabela de dependências
    entre tarefas (predecessora→sucessora, FS por ora)."""
    if not await _table_exists(conn, schema, "project_tasks"):
        return
    if not await _column_exists(conn, schema, "project_tasks", "estimated_hours"):
        await conn.execute(text(
            f"ALTER TABLE {schema}.project_tasks ADD COLUMN estimated_hours NUMERIC(8,2)"
        ))
    if not await _table_exists(conn, schema, "project_task_dependencies"):
        await conn.execute(text(f"""
            CREATE TABLE {schema}.project_task_dependencies (
                id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                project_id     UUID NOT NULL REFERENCES {schema}.project_projects(id) ON DELETE CASCADE,
                predecessor_id UUID NOT NULL REFERENCES {schema}.project_tasks(id) ON DELETE CASCADE,
                successor_id   UUID NOT NULL REFERENCES {schema}.project_tasks(id) ON DELETE CASCADE,
                dep_type       VARCHAR(2) NOT NULL DEFAULT 'FS',
                lag_days       INTEGER NOT NULL DEFAULT 0,
                created_at     TIMESTAMP DEFAULT now(),
                CONSTRAINT uq_task_dep_pred_succ UNIQUE (predecessor_id, successor_id)
            )
        """))
        await conn.execute(text(
            f"CREATE INDEX ix_{schema}_project_task_dependencies_predecessor "
            f"ON {schema}.project_task_dependencies(predecessor_id)"
        ))
        await conn.execute(text(
            f"CREATE INDEX ix_{schema}_project_task_dependencies_successor "
            f"ON {schema}.project_task_dependencies(successor_id)"
        ))


async def _step_054_schedule_engine_calendar(conn: AsyncConnection, schema: str) -> None:
    """Motor de cronograma em horas (Fase 1): calendário de trabalho + feriados (módulo Pessoa),
    marcos em project_tasks e lag em HORAS nas dependências (FS/SS/FF/SF)."""
    # Calendário corporativo (linha única por tenant).
    if not await _table_exists(conn, schema, "team_work_calendar"):
        await conn.execute(text(f"""
            CREATE TABLE {schema}.team_work_calendar (
                id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                day_start   TIME NOT NULL DEFAULT '08:00',
                day_end     TIME NOT NULL DEFAULT '17:00',
                lunch_start TIME DEFAULT '12:00',
                lunch_end   TIME DEFAULT '13:00',
                work_days   JSONB NOT NULL DEFAULT '[0,1,2,3,4]',
                timezone    VARCHAR(64) NOT NULL DEFAULT 'America/Maceio',
                created_at  TIMESTAMP DEFAULT now(),
                updated_at  TIMESTAMP DEFAULT now()
            )
        """))
    # Feriados corporativos.
    if not await _table_exists(conn, schema, "team_holidays"):
        await conn.execute(text(f"""
            CREATE TABLE {schema}.team_holidays (
                id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                day          DATE NOT NULL,
                name         VARCHAR(140) NOT NULL,
                is_recurring BOOLEAN NOT NULL DEFAULT FALSE,
                created_at   TIMESTAMP DEFAULT now(),
                CONSTRAINT uq_team_holiday_day UNIQUE (day, is_recurring)
            )
        """))
    # Lag em HORAS nas dependências (migra lag_days * 8 → lag_hours).
    if await _table_exists(conn, schema, "project_task_dependencies"):
        if not await _column_exists(conn, schema, "project_task_dependencies", "lag_hours"):
            await conn.execute(text(
                f"ALTER TABLE {schema}.project_task_dependencies ADD COLUMN lag_hours NUMERIC(8,2) NOT NULL DEFAULT 0"
            ))
            await conn.execute(text(
                f"UPDATE {schema}.project_task_dependencies "
                f"SET lag_hours = lag_days * 8 WHERE lag_days <> 0 AND lag_hours = 0"
            ))


async def _step_055_baseline_and_progress(conn: AsyncConnection, schema: str) -> None:
    """Fase 3 do cronograma: horas realizadas e percentual de conclusão em project_tasks."""
    if not await _table_exists(conn, schema, "project_tasks"):
        return
    cols = {
        "actual_hours": "NUMERIC(8,2)",
        "percent_complete": "INTEGER NOT NULL DEFAULT 0",
    }
    for col, ddl in cols.items():
        if not await _column_exists(conn, schema, "project_tasks", col):
            await conn.execute(text(f"ALTER TABLE {schema}.project_tasks ADD COLUMN {col} {ddl}"))


async def _step_056_drop_milestone_and_baseline(conn: AsyncConnection, schema: str) -> None:
    """Remove as funções de marco (is_milestone) e linha de base (baseline_*) do cronograma."""
    if not await _table_exists(conn, schema, "project_tasks"):
        return
    for col in ("is_milestone", "baseline_start", "baseline_due", "baseline_hours"):
        if await _column_exists(conn, schema, "project_tasks", col):
            await conn.execute(text(f"ALTER TABLE {schema}.project_tasks DROP COLUMN {col}"))


async def _step_057_projetos_priority_pillars(conn: AsyncConnection, schema: str) -> None:
    """Permite múltiplos pilares estratégicos por demanda: adiciona `pillar_ids` (JSONB)
    em project_priority_scores e faz backfill a partir do pillar_id legado."""
    if not await _table_exists(conn, schema, "project_priority_scores"):
        return
    if not await _column_exists(conn, schema, "project_priority_scores", "pillar_ids"):
        await conn.execute(text(
            f"ALTER TABLE {schema}.project_priority_scores "
            f"ADD COLUMN pillar_ids JSONB NOT NULL DEFAULT '[]'::jsonb"
        ))
        # Backfill: scores que já tinham 1 pilar viram lista com esse pilar.
        await conn.execute(text(
            f"UPDATE {schema}.project_priority_scores "
            f"SET pillar_ids = jsonb_build_array(pillar_id::text) "
            f"WHERE pillar_id IS NOT NULL "
            f"AND (pillar_ids IS NULL OR pillar_ids = '[]'::jsonb)"
        ))


async def _step_058_produtos(conn: AsyncConnection, schema: str) -> None:
    """Cria as tabelas do módulo Produtos (portfólio de produtos). A FK de área para
    team_areas só é criada se o teamops já existe no schema."""
    if not await _table_exists(conn, schema, "products"):
        await conn.execute(text(f"""
            CREATE TABLE {schema}.products (
                id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name            VARCHAR(200) NOT NULL,
                description     TEXT,
                status          VARCHAR(20) NOT NULL DEFAULT 'ativo',
                is_active       BOOLEAN NOT NULL DEFAULT TRUE,
                origin_task_id  UUID,
                created_by      UUID,
                created_at      TIMESTAMP DEFAULT now(),
                updated_at      TIMESTAMP DEFAULT now()
            )
        """))
        await conn.execute(text(f"CREATE INDEX ix_{schema}_products_origin ON {schema}.products(origin_task_id)"))
        await conn.execute(text(f"CREATE INDEX ix_{schema}_products_status ON {schema}.products(status)"))

    if not await _table_exists(conn, schema, "product_servicos"):
        await conn.execute(text(f"""
            CREATE TABLE {schema}.product_servicos (
                id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                product_id   UUID NOT NULL REFERENCES {schema}.products(id) ON DELETE CASCADE,
                name         VARCHAR(160) NOT NULL,
                description  TEXT,
                is_active    BOOLEAN NOT NULL DEFAULT TRUE,
                "order"      INTEGER NOT NULL DEFAULT 0,
                created_at   TIMESTAMP DEFAULT now(),
                updated_at   TIMESTAMP DEFAULT now()
            )
        """))
        await conn.execute(text(f"CREATE INDEX ix_{schema}_product_servicos_product ON {schema}.product_servicos(product_id)"))

    if not await _table_exists(conn, schema, "product_documentos"):
        await conn.execute(text(f"""
            CREATE TABLE {schema}.product_documentos (
                id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                product_id     UUID NOT NULL REFERENCES {schema}.products(id) ON DELETE CASCADE,
                name           VARCHAR(200) NOT NULL,
                object_name    VARCHAR(500),
                filename       VARCHAR(255),
                content_type   VARCHAR(120),
                size           INTEGER,
                category       VARCHAR(80),
                external_link  TEXT,
                uploaded_by    UUID,
                "order"        INTEGER NOT NULL DEFAULT 0,
                created_at     TIMESTAMP DEFAULT now()
            )
        """))
        await conn.execute(text(f"CREATE INDEX ix_{schema}_product_documentos_product ON {schema}.product_documentos(product_id)"))

    if not await _table_exists(conn, schema, "product_processos"):
        await conn.execute(text(f"""
            CREATE TABLE {schema}.product_processos (
                id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                product_id   UUID NOT NULL REFERENCES {schema}.products(id) ON DELETE CASCADE,
                parent_id    UUID REFERENCES {schema}.product_processos(id) ON DELETE CASCADE,
                level        VARCHAR(20) NOT NULL,
                name         VARCHAR(160) NOT NULL,
                description  TEXT,
                "order"      INTEGER NOT NULL DEFAULT 0,
                created_at   TIMESTAMP DEFAULT now(),
                updated_at   TIMESTAMP DEFAULT now()
            )
        """))
        await conn.execute(text(f"CREATE INDEX ix_{schema}_product_processos_product ON {schema}.product_processos(product_id)"))
        await conn.execute(text(f"CREATE INDEX ix_{schema}_product_processos_parent ON {schema}.product_processos(parent_id)"))

    if not await _table_exists(conn, schema, "product_areas"):
        area_fk = ""
        if await _table_exists(conn, schema, "team_areas"):
            area_fk = f" REFERENCES {schema}.team_areas(id) ON DELETE CASCADE"
        await conn.execute(text(f"""
            CREATE TABLE {schema}.product_areas (
                product_id  UUID NOT NULL REFERENCES {schema}.products(id) ON DELETE CASCADE,
                area_id     UUID NOT NULL{area_fk},
                PRIMARY KEY (product_id, area_id)
            )
        """))


async def _step_059_produtos_portfolio(conn: AsyncConnection, schema: str) -> None:
    """Evolui Produtos para Portfólio completo: org (área/responsável reusando teamops),
    fornecedor+contrato, catálogo global de processos + vínculo anual, ano_referencia e
    auditoria. Idempotente. Tabelas vazias → pode dropar product_areas/product_processos."""
    if not await _table_exists(conn, schema, "products"):
        return

    async def add_col(table: str, col: str, ddl: str) -> None:
        if not await _column_exists(conn, schema, table, col):
            await conn.execute(text(f'ALTER TABLE {schema}.{table} ADD COLUMN {col} {ddl}'))

    async def add_fk(table: str, name: str, col: str, ref_table: str, on_delete: str = "SET NULL") -> None:
        if not await _table_exists(conn, schema, ref_table):
            return
        exists = await conn.execute(text(
            "SELECT 1 FROM information_schema.table_constraints "
            "WHERE table_schema=:s AND table_name=:t AND constraint_name=:c"
        ), {"s": schema, "t": table, "c": name})
        if exists.scalar() is None:
            await conn.execute(text(
                f"ALTER TABLE {schema}.{table} ADD CONSTRAINT {name} "
                f"FOREIGN KEY ({col}) REFERENCES {schema}.{ref_table}(id) ON DELETE {on_delete}"
            ))

    # ── Fornecedor (criar antes da FK em products) ──
    if not await _table_exists(conn, schema, "produto_fornecedores"):
        await conn.execute(text(f"""
            CREATE TABLE {schema}.produto_fornecedores (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                nome VARCHAR(200) NOT NULL,
                cnpj VARCHAR(20), contato VARCHAR(200), email VARCHAR(255), telefone VARCHAR(30),
                notes TEXT,
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                created_by UUID, created_at TIMESTAMP DEFAULT now(),
                updated_by UUID, updated_at TIMESTAMP DEFAULT now(),
                inactivated_by UUID, inactivated_at TIMESTAMP
            )
        """))

    # ── products: novos atributos + org + auditoria ──
    await add_col("products", "simbolo", "VARCHAR(80)")
    await add_col("products", "dominio_funcional", "VARCHAR(160)")
    await add_col("products", "origem", "VARCHAR(20) NOT NULL DEFAULT 'interno'")
    await add_col("products", "lifecycle", "VARCHAR(30) NOT NULL DEFAULT 'desenvolvimento'")
    await add_col("products", "criticidade", "VARCHAR(20) NOT NULL DEFAULT 'media'")
    await add_col("products", "data_entrada_producao", "DATE")
    await add_col("products", "area_id", "UUID")
    await add_col("products", "responsavel_person_id", "UUID")
    await add_col("products", "fornecedor_id", "UUID")
    await add_col("products", "updated_by", "UUID")
    await add_col("products", "inactivated_by", "UUID")
    await add_col("products", "inactivated_at", "TIMESTAMP")
    await add_fk("products", "products_area_id_fkey", "area_id", "team_areas")
    await add_fk("products", "products_responsavel_fkey", "responsavel_person_id", "team_persons")
    await add_fk("products", "products_fornecedor_fkey", "fornecedor_id", "produto_fornecedores")

    # ── dropar N:N de áreas e árvore por produto (vazias) ──
    await conn.execute(text(f"DROP TABLE IF EXISTS {schema}.product_areas"))
    await conn.execute(text(f"DROP TABLE IF EXISTS {schema}.product_processos"))

    # ── serviços/documentos: ano_referencia + audit ──
    for tbl in ("product_servicos", "product_documentos"):
        await add_col(tbl, "ano_referencia", "INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM now())::int")
        await add_col(tbl, "created_by", "UUID")
        await add_col(tbl, "updated_by", "UUID")
        await add_col(tbl, "inactivated_by", "UUID")
        await add_col(tbl, "inactivated_at", "TIMESTAMP")
        if not await _column_exists(conn, schema, tbl, "is_active"):
            await add_col(tbl, "is_active", "BOOLEAN NOT NULL DEFAULT TRUE")
        if not await _column_exists(conn, schema, tbl, "updated_at"):
            await add_col(tbl, "updated_at", "TIMESTAMP DEFAULT now()")
        await conn.execute(text(f"CREATE INDEX IF NOT EXISTS ix_{schema}_{tbl}_ano ON {schema}.{tbl}(product_id, ano_referencia)"))

    # ── catálogo global de processos ──
    if not await _table_exists(conn, schema, "processos"):
        await conn.execute(text(f"""
            CREATE TABLE {schema}.processos (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                parent_id UUID REFERENCES {schema}.processos(id) ON DELETE CASCADE,
                nivel VARCHAR(20) NOT NULL,
                name VARCHAR(160) NOT NULL,
                description TEXT,
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                "order" INTEGER NOT NULL DEFAULT 0,
                created_by UUID, created_at TIMESTAMP DEFAULT now(),
                updated_by UUID, updated_at TIMESTAMP DEFAULT now(),
                inactivated_by UUID, inactivated_at TIMESTAMP
            )
        """))
        await conn.execute(text(f"CREATE INDEX ix_{schema}_processos_parent ON {schema}.processos(parent_id)"))
        await conn.execute(text(f"CREATE INDEX ix_{schema}_processos_nivel ON {schema}.processos(nivel)"))

    # ── vínculo produto–processo (anual, automatizado) ──
    if not await _table_exists(conn, schema, "produto_processo"):
        await conn.execute(text(f"""
            CREATE TABLE {schema}.produto_processo (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                product_id UUID NOT NULL REFERENCES {schema}.products(id) ON DELETE CASCADE,
                processo_id UUID NOT NULL REFERENCES {schema}.processos(id) ON DELETE CASCADE,
                ano_referencia INTEGER NOT NULL,
                automatizado BOOLEAN NOT NULL DEFAULT FALSE,
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                created_by UUID, created_at TIMESTAMP DEFAULT now(),
                updated_by UUID, updated_at TIMESTAMP DEFAULT now(),
                inactivated_by UUID, inactivated_at TIMESTAMP
            )
        """))
        await conn.execute(text(f"CREATE INDEX ix_{schema}_produto_processo_product ON {schema}.produto_processo(product_id, ano_referencia)"))
        await conn.execute(text(f"CREATE INDEX ix_{schema}_produto_processo_processo ON {schema}.produto_processo(processo_id)"))
        await conn.execute(text(f"CREATE UNIQUE INDEX uq_{schema}_produto_processo_ativo ON {schema}.produto_processo(product_id, processo_id, ano_referencia) WHERE is_active"))

    # ── contratos ──
    if not await _table_exists(conn, schema, "produto_contratos"):
        gestor_fk = ""
        if await _table_exists(conn, schema, "team_persons"):
            gestor_fk = f" REFERENCES {schema}.team_persons(id) ON DELETE SET NULL"
        await conn.execute(text(f"""
            CREATE TABLE {schema}.produto_contratos (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                product_id UUID NOT NULL REFERENCES {schema}.products(id) ON DELETE CASCADE,
                fornecedor_id UUID NOT NULL REFERENCES {schema}.produto_fornecedores(id) ON DELETE RESTRICT,
                identificador VARCHAR(120),
                vigencia_inicio DATE NOT NULL,
                vigencia_fim DATE NOT NULL,
                renovacao_automatica BOOLEAN NOT NULL DEFAULT FALSE,
                modelo_licenciamento VARCHAR(120),
                gestor_person_id UUID{gestor_fk},
                sustentacao_n1 VARCHAR(20) NOT NULL DEFAULT 'interna',
                sustentacao_n2 VARCHAR(20) NOT NULL DEFAULT 'interna',
                sustentacao_n3 VARCHAR(20) NOT NULL DEFAULT 'interna',
                alerta_dias JSONB NOT NULL DEFAULT '[90,60,30]'::jsonb,
                object_name VARCHAR(500), filename VARCHAR(255), content_type VARCHAR(120), size INTEGER, external_link TEXT,
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                created_by UUID, created_at TIMESTAMP DEFAULT now(),
                updated_by UUID, updated_at TIMESTAMP DEFAULT now(),
                inactivated_by UUID, inactivated_at TIMESTAMP,
                CONSTRAINT ck_{schema}_contrato_vigencia CHECK (vigencia_fim > vigencia_inicio)
            )
        """))
        await conn.execute(text(f"CREATE INDEX ix_{schema}_contratos_product ON {schema}.produto_contratos(product_id)"))
        await conn.execute(text(f"CREATE INDEX ix_{schema}_contratos_vigencia_fim ON {schema}.produto_contratos(vigencia_fim)"))

    # ── status legado vira lifecycle (módulo novo, dados vazios) ──
    if await _column_exists(conn, schema, "products", "status"):
        await conn.execute(text(f"ALTER TABLE {schema}.products DROP COLUMN status"))


async def _step_060_assigned_to_person(conn: AsyncConnection, schema: str) -> None:
    """Responsável da tarefa passa a ser Pessoa (teamops): converte project_tasks.assigned_to
    de user_id → person_id. Idempotente: após converter, os valores são person_ids que não
    casam com team_persons.user_id, então rodar de novo não altera nada."""
    if not await _table_exists(conn, schema, "project_tasks") or not await _table_exists(conn, schema, "team_persons"):
        return
    await conn.execute(text(f"""
        UPDATE {schema}.project_tasks pt
        SET assigned_to = tp.id
        FROM {schema}.team_persons tp
        WHERE pt.assigned_to IS NOT NULL
          AND tp.user_id = pt.assigned_to
    """))


async def _step_061_projetos_card_field_key_len(conn: AsyncConnection, schema: str) -> None:
    """Amplia project_card_fields.field_key (40 → 120) para acomodar chaves de campos
    personalizados do formulário no layout do card, no formato "form:<field_key>"."""
    if not await _table_exists(conn, schema, "project_card_fields"):
        return
    await conn.execute(text(
        f"ALTER TABLE {schema}.project_card_fields ALTER COLUMN field_key TYPE VARCHAR(120)"
    ))


async def _step_062_projetos_priority_history(conn: AsyncConnection, schema: str) -> None:
    """Cria project_priority_score_history (auditoria de repriorização)."""
    if not await _table_exists(conn, schema, "project_tasks"):
        return
    if not await _table_exists(conn, schema, "project_priority_score_history"):
        await conn.execute(text(f"""
            CREATE TABLE {schema}.project_priority_score_history (
                id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                task_id         UUID NOT NULL REFERENCES {schema}.project_tasks(id) ON DELETE CASCADE,
                pillar_ids      JSONB NOT NULL DEFAULT '[]',
                impact_scores   JSONB NOT NULL DEFAULT '{{}}',
                effort_scores   JSONB NOT NULL DEFAULT '{{}}',
                impacto_efetivo NUMERIC(6,3) NOT NULL DEFAULT 0,
                esforco         NUMERIC(6,3) NOT NULL DEFAULT 0,
                quadrant_code   VARCHAR(20) NOT NULL DEFAULT 'fill_in',
                scored_by       UUID,
                scored_at       TIMESTAMP DEFAULT now()
            )
        """))
        await conn.execute(text(
            f"CREATE INDEX ix_{schema}_priority_history_task "
            f"ON {schema}.project_priority_score_history(task_id, scored_at DESC)"
        ))


async def _step_063_projetos_status_reports(conn: AsyncConnection, schema: str) -> None:
    """Cria project_status_reports (snapshots imutáveis de Status Report por recorte)."""
    if not await _table_exists(conn, schema, "project_status_reports"):
        await conn.execute(text(f"""
            CREATE TABLE {schema}.project_status_reports (
                id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                diretoria       VARCHAR(120),
                area            VARCHAR(120),
                diretoria_label VARCHAR(200),
                area_label      VARCHAR(200),
                title           VARCHAR(200) NOT NULL DEFAULT 'Status Report',
                snapshot        JSONB NOT NULL DEFAULT '{{}}',
                kpis            JSONB NOT NULL DEFAULT '{{}}',
                generated_by    UUID,
                generated_at    TIMESTAMP DEFAULT now(),
                created_at      TIMESTAMP DEFAULT now()
            )
        """))
        await conn.execute(text(
            f"CREATE INDEX ix_{schema}_status_reports_generated "
            f"ON {schema}.project_status_reports(generated_at DESC)"
        ))
        await conn.execute(text(
            f"CREATE INDEX ix_{schema}_status_reports_recorte "
            f"ON {schema}.project_status_reports(diretoria, area, generated_at DESC)"
        ))


async def _step_064_projetos_task_anexos(conn: AsyncConnection, schema: str) -> None:
    """Adiciona o campo padrão 'anexos' (JSONB: lista de metadados de arquivos) em project_tasks."""
    if not await _table_exists(conn, schema, "project_tasks"):
        return
    if not await _column_exists(conn, schema, "project_tasks", "anexos"):
        await conn.execute(text(f"ALTER TABLE {schema}.project_tasks ADD COLUMN anexos JSONB"))


async def _step_065_projetos_move_out_permissions(conn: AsyncConnection, schema: str) -> None:
    """Permissão de saída por função: move_out_role_ids em project_status_configs."""
    if not await _table_exists(conn, schema, "project_status_configs"):
        return
    if not await _column_exists(conn, schema, "project_status_configs", "move_out_role_ids"):
        await conn.execute(text(
            f"ALTER TABLE {schema}.project_status_configs ADD COLUMN move_out_role_ids JSONB"
        ))


async def _step_066_projetos_stage_agents(conn: AsyncConnection, schema: str) -> None:
    """Agentes IDCortex vinculados a etapas do kanban + log de execuções."""
    if not await _table_exists(conn, schema, "project_status_configs"):
        return
    if not await _table_exists(conn, schema, "project_stage_agent_bindings"):
        await conn.execute(text(f"""
            CREATE TABLE {schema}.project_stage_agent_bindings (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                project_id UUID NOT NULL REFERENCES {schema}.project_projects(id) ON DELETE CASCADE,
                funnel_id UUID NOT NULL REFERENCES {schema}.project_funnels(id) ON DELETE CASCADE,
                status_id UUID NOT NULL REFERENCES {schema}.project_status_configs(id) ON DELETE CASCADE,
                name VARCHAR(140) NOT NULL,
                agent_id VARCHAR(120) NOT NULL,
                usuario VARCHAR(255) NOT NULL,
                prompt_template TEXT NOT NULL,
                gateway_url VARCHAR(500),
                gateway_client_id VARCHAR(255),
                gateway_client_secret VARCHAR(255),
                continue_thread BOOLEAN NOT NULL DEFAULT FALSE,
                add_comment_on_success BOOLEAN NOT NULL DEFAULT TRUE,
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TIMESTAMP NOT NULL DEFAULT now(),
                updated_at TIMESTAMP NOT NULL DEFAULT now(),
                UNIQUE(status_id)
            )
        """))
    if not await _table_exists(conn, schema, "project_agent_executions"):
        await conn.execute(text(f"""
            CREATE TABLE {schema}.project_agent_executions (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                task_id UUID NOT NULL REFERENCES {schema}.project_tasks(id) ON DELETE CASCADE,
                binding_id UUID NOT NULL REFERENCES {schema}.project_stage_agent_bindings(id) ON DELETE CASCADE,
                status VARCHAR(20) NOT NULL DEFAULT 'pending',
                thread_id VARCHAR(120),
                request_payload JSONB,
                response_payload JSONB,
                answer_message TEXT,
                error_message TEXT,
                created_at TIMESTAMP NOT NULL DEFAULT now()
            )
        """))


async def _step_067_projetos_stage_agent_kind(conn: AsyncConnection, schema: str) -> None:
    """Tipo de agente: ask | classify_and_advance."""
    if not await _table_exists(conn, schema, "project_stage_agent_bindings"):
        return
    if not await _column_exists(conn, schema, "project_stage_agent_bindings", "agent_kind"):
        await conn.execute(text(
            f"ALTER TABLE {schema}.project_stage_agent_bindings "
            f"ADD COLUMN agent_kind VARCHAR(40) NOT NULL DEFAULT 'ask'"
        ))


async def _step_068_projetos_schedule_baselines(conn: AsyncConnection, schema: str) -> None:
    """Controle de baseline/travamento do cronograma:
      - project_status_configs.locks_schedule (etapa que congela o cronograma ao entrar).
      - project_tasks.schedule_committed_at / schedule_revision_open (estado no card-raiz).
      - tabela project_schedule_baselines (snapshots versionados + justificativa).
      - default: marca etapas de desenvolvimento/homologação/prod como locks_schedule.
      - backfill: trava projetos-raiz que já estão numa etapa locks_schedule."""
    if not await _table_exists(conn, schema, "project_status_configs"):
        return

    if not await _column_exists(conn, schema, "project_status_configs", "locks_schedule"):
        await conn.execute(text(
            f"ALTER TABLE {schema}.project_status_configs "
            f"ADD COLUMN locks_schedule BOOLEAN NOT NULL DEFAULT FALSE"
        ))
    if not await _column_exists(conn, schema, "project_tasks", "schedule_committed_at"):
        await conn.execute(text(
            f"ALTER TABLE {schema}.project_tasks ADD COLUMN schedule_committed_at TIMESTAMP"
        ))
    if not await _column_exists(conn, schema, "project_tasks", "schedule_revision_open"):
        await conn.execute(text(
            f"ALTER TABLE {schema}.project_tasks "
            f"ADD COLUMN schedule_revision_open BOOLEAN NOT NULL DEFAULT FALSE"
        ))

    if not await _table_exists(conn, schema, "project_schedule_baselines"):
        await conn.execute(text(f"""
            CREATE TABLE {schema}.project_schedule_baselines (
                id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                project_id    UUID NOT NULL REFERENCES {schema}.project_projects(id) ON DELETE CASCADE,
                root_task_id  UUID NOT NULL REFERENCES {schema}.project_tasks(id) ON DELETE CASCADE,
                version       INTEGER NOT NULL DEFAULT 1,
                justification TEXT NOT NULL,
                snapshot      JSONB NOT NULL DEFAULT '{{}}',
                created_by    UUID,
                created_at    TIMESTAMP DEFAULT now(),
                CONSTRAINT uq_schedule_baseline_root_version UNIQUE (root_task_id, version)
            )
        """))
        await conn.execute(text(
            f"CREATE INDEX ix_{schema}_schedule_baselines_root "
            f"ON {schema}.project_schedule_baselines(root_task_id)"
        ))

    # Default: etapas de execução congelam o cronograma (entrada = desenvolvimento em diante).
    # Só aplica uma vez (enquanto nenhuma etapa estiver marcada), para não sobrescrever ajustes
    # manuais do admin em execuções futuras do step.
    already = await conn.execute(text(
        f"SELECT 1 FROM {schema}.project_status_configs WHERE locks_schedule = TRUE LIMIT 1"
    ))
    if already.scalar() is None:
        await conn.execute(text(f"""
            UPDATE {schema}.project_status_configs
               SET locks_schedule = TRUE
             WHERE is_initial = FALSE
               AND (
                    name ILIKE '%desenvolv%' OR name ILIKE '%devops%' OR name ILIKE '%devsecops%'
                 OR name ILIKE '%homolog%'   OR name ILIKE '%executar%'
                 OR name ILIKE '%prod%'      OR name ILIKE '%hml%'
               )
        """))

    # Backfill: projetos-raiz cujo status atual já trava → comprometer o cronograma agora.
    if not await _table_exists(conn, schema, "project_tasks"):
        return
    await conn.execute(text(f"""
        UPDATE {schema}.project_tasks t
           SET schedule_committed_at = COALESCE(t.status_entered_at, now())
          FROM {schema}.project_status_configs sc
         WHERE t.status_id = sc.id
           AND sc.locks_schedule = TRUE
           AND t.planning_kind IN ('projeto', 'programa')
           AND t.schedule_committed_at IS NULL
    """))


async def _step_069_produtos_process_portfolio(conn: AsyncConnection, schema: str) -> None:
    """Portfólio de Processos versionado (Diretoria→Macro→Processo→Sub):
      - process_portfolios (container + ponteiro p/ versão consolidada vigente)
      - process_portfolio_versions (série histórica + justificativa + status)
      - process_portfolio_items (árvore por versão, lineage_id estável, governança/anexos)
      - process_portfolio_service_links (vínculo serviço↔sub-processo por lineage)
    Idempotente. Só roda em tenants que já têm o módulo produtos (tabela products)."""
    if not await _table_exists(conn, schema, "products"):
        return

    if not await _table_exists(conn, schema, "process_portfolios"):
        await conn.execute(text(f"""
            CREATE TABLE {schema}.process_portfolios (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name VARCHAR(200) NOT NULL,
                description TEXT,
                current_version_id UUID,
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                created_by UUID, created_at TIMESTAMP DEFAULT now(),
                updated_by UUID, updated_at TIMESTAMP DEFAULT now(),
                inactivated_by UUID, inactivated_at TIMESTAMP
            )
        """))

    if not await _table_exists(conn, schema, "process_portfolio_versions"):
        await conn.execute(text(f"""
            CREATE TABLE {schema}.process_portfolio_versions (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                portfolio_id UUID NOT NULL REFERENCES {schema}.process_portfolios(id) ON DELETE CASCADE,
                version INTEGER NOT NULL DEFAULT 1,
                status VARCHAR(20) NOT NULL DEFAULT 'rascunho',
                justification TEXT,
                consolidated_by UUID, consolidated_at TIMESTAMP,
                created_by UUID, created_at TIMESTAMP DEFAULT now(),
                updated_by UUID, updated_at TIMESTAMP DEFAULT now(),
                CONSTRAINT uq_process_portfolio_version UNIQUE (portfolio_id, version)
            )
        """))
        await conn.execute(text(
            f"CREATE INDEX ix_{schema}_pp_versions_portfolio ON {schema}.process_portfolio_versions(portfolio_id)"
        ))

    # FK tardia: current_version_id → versions (após a tabela de versões existir)
    fk_exists = await conn.execute(text(
        "SELECT 1 FROM information_schema.table_constraints "
        "WHERE table_schema=:s AND table_name='process_portfolios' AND constraint_name='fk_portfolio_current_version'"
    ), {"s": schema})
    if fk_exists.scalar() is None:
        await conn.execute(text(
            f"ALTER TABLE {schema}.process_portfolios ADD CONSTRAINT fk_portfolio_current_version "
            f"FOREIGN KEY (current_version_id) REFERENCES {schema}.process_portfolio_versions(id) ON DELETE SET NULL"
        ))

    if not await _table_exists(conn, schema, "process_portfolio_items"):
        await conn.execute(text(f"""
            CREATE TABLE {schema}.process_portfolio_items (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                version_id UUID NOT NULL REFERENCES {schema}.process_portfolio_versions(id) ON DELETE CASCADE,
                lineage_id UUID NOT NULL DEFAULT gen_random_uuid(),
                parent_id UUID REFERENCES {schema}.process_portfolio_items(id) ON DELETE CASCADE,
                nivel VARCHAR(20) NOT NULL,
                codigo VARCHAR(40),
                name VARCHAR(200) NOT NULL,
                description TEXT,
                "order" INTEGER NOT NULL DEFAULT 0,
                analista_person_id UUID REFERENCES {schema}.team_persons(id) ON DELETE SET NULL,
                dono_person_id UUID REFERENCES {schema}.team_persons(id) ON DELETE SET NULL,
                area_id UUID REFERENCES {schema}.team_areas(id) ON DELETE SET NULL,
                vigencia_inicio DATE, vigencia_fim DATE,
                documentado BOOLEAN NOT NULL DEFAULT FALSE,
                data_documentacao DATE,
                doc_previsao_inicio DATE, doc_previsao_fim DATE,
                anexos JSONB,
                status_item VARCHAR(20) NOT NULL DEFAULT 'ativo',
                criticidade VARCHAR(20),
                objetivo TEXT,
                nivel_maturidade VARCHAR(20),
                tipo_documento VARCHAR(80),
                versao_documento VARCHAR(40),
                proxima_revisao DATE,
                link_externo TEXT,
                frequencia VARCHAR(120),
                entradas TEXT, saidas TEXT,
                created_by UUID, created_at TIMESTAMP DEFAULT now(),
                updated_by UUID, updated_at TIMESTAMP DEFAULT now()
            )
        """))
        await conn.execute(text(
            f"CREATE INDEX ix_{schema}_pp_items_version ON {schema}.process_portfolio_items(version_id)"
        ))
        await conn.execute(text(
            f"CREATE INDEX ix_{schema}_pp_items_lineage ON {schema}.process_portfolio_items(lineage_id)"
        ))
        await conn.execute(text(
            f"CREATE INDEX ix_{schema}_pp_items_parent ON {schema}.process_portfolio_items(parent_id)"
        ))

    # Diretoria demandante como atributo do item (tipicamente do macroprocesso). Idempotente.
    if not await _column_exists(conn, schema, "process_portfolio_items", "diretoria"):
        await conn.execute(text(
            f"ALTER TABLE {schema}.process_portfolio_items ADD COLUMN diretoria VARCHAR(200)"
        ))

    if not await _column_exists(conn, schema, "process_portfolio_items", "area"):
        await conn.execute(text(
            f"ALTER TABLE {schema}.process_portfolio_items ADD COLUMN area VARCHAR(120)"
        ))

    if not await _column_exists(conn, schema, "process_portfolio_items", "analista"):
        await conn.execute(text(
            f"ALTER TABLE {schema}.process_portfolio_items ADD COLUMN analista VARCHAR(200)"
        ))

    if not await _column_exists(conn, schema, "process_portfolio_items", "dono"):
        await conn.execute(text(
            f"ALTER TABLE {schema}.process_portfolio_items ADD COLUMN dono VARCHAR(200)"
        ))

    if not await _table_exists(conn, schema, "process_portfolio_service_links"):
        await conn.execute(text(f"""
            CREATE TABLE {schema}.process_portfolio_service_links (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                servico_id UUID NOT NULL REFERENCES {schema}.product_servicos(id) ON DELETE CASCADE,
                portfolio_id UUID NOT NULL REFERENCES {schema}.process_portfolios(id) ON DELETE CASCADE,
                item_lineage_id UUID NOT NULL,
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                created_by UUID, created_at TIMESTAMP DEFAULT now(),
                CONSTRAINT uq_process_service_link UNIQUE (servico_id, item_lineage_id)
            )
        """))
        await conn.execute(text(
            f"CREATE INDEX ix_{schema}_pp_links_servico ON {schema}.process_portfolio_service_links(servico_id)"
        ))


async def _add_columns(conn: AsyncConnection, schema: str, table: str, cols: dict[str, str]) -> None:
    """Adiciona colunas faltantes (idempotente). cols: {nome: 'TIPO [DEFAULT ...]'}."""
    if not await _table_exists(conn, schema, table):
        return
    for name, ddl in cols.items():
        if not await _column_exists(conn, schema, table, name):
            await conn.execute(text(f'ALTER TABLE {schema}.{table} ADD COLUMN "{name}" {ddl}'))


async def _step_070_produtos_product_extend(conn: AsyncConnection, schema: str) -> None:
    """Campos 'Produtos Digitais' no products (todos opcionais). Idempotente."""
    await _add_columns(conn, schema, "products", {
        "sigla": "VARCHAR(40)",
        "link_descricao": "TEXT",
        "categoria": "VARCHAR(30)",
        "unidade": "VARCHAR(20)",
        "dono_negocio_person_id": f"UUID REFERENCES {schema}.team_persons(id) ON DELETE SET NULL",
        "publico_alvo": "TEXT",
        "url_acesso": "TEXT",
        "observacoes": "TEXT",
        "status_produto": "VARCHAR(20)",
        "tipo_desenvolvimento": "VARCHAR(20)",
        "desenvolvido_por": "VARCHAR(200)",
        "fornecedor_cnpj": "VARCHAR(20)",
        "modelo_contratacao": "VARCHAR(30)",
        "ambiente_tecnologico": "TEXT",
        "tecnologias": "TEXT",
        "link_repositorio": "TEXT",
        "link_dev": "TEXT",
        "link_hml": "TEXT",
        "link_prd": "TEXT",
    })


async def _step_071_produtos_servico_extend(conn: AsyncConnection, schema: str) -> None:
    await _add_columns(conn, schema, "product_servicos", {
        "area_usuaria": "VARCHAR(200)",
        "processo_relacionado": "VARCHAR(200)",
        "disponibilidade": "VARCHAR(120)",
        "sla_atendimento": "VARCHAR(200)",
        "tipo_suporte": "VARCHAR(30)",
        "status_servico": "VARCHAR(20)",
    })


async def _step_072_produtos_documento_extend(conn: AsyncConnection, schema: str) -> None:
    await _add_columns(conn, schema, "product_documentos", {
        "tipo_documento": "VARCHAR(20)",
        "is_nato_digital": "BOOLEAN NOT NULL DEFAULT TRUE",
        "assinatura_digital": "BOOLEAN NOT NULL DEFAULT FALSE",
        "trilha_auditoria": "BOOLEAN NOT NULL DEFAULT FALSE",
        "local_armazenamento": "VARCHAR(200)",
        "prazo_retencao": "VARCHAR(120)",
        "classificacao": "VARCHAR(20)",
        "dados_pessoais": "BOOLEAN NOT NULL DEFAULT FALSE",
        "dados_sensiveis": "BOOLEAN NOT NULL DEFAULT FALSE",
        "observacoes": "TEXT",
    })


async def _step_073_produtos_contrato_extend(conn: AsyncConnection, schema: str) -> None:
    await _add_columns(conn, schema, "produto_contratos", {
        "numero": "VARCHAR(120)",
        "objeto_contratual": "TEXT",
        "status_contrato": "VARCHAR(20)",
        "valor": "NUMERIC(18,2)",
        "tipo_valor": "VARCHAR(20)",
        "centro_custo": "VARCHAR(120)",
        "fiscal_person_id": f"UUID REFERENCES {schema}.team_persons(id) ON DELETE SET NULL",
        "sla_contratual": "TEXT",
        "aditivos": "JSONB",
        "observacoes": "TEXT",
    })


async def _step_074_produtos_release(conn: AsyncConnection, schema: str) -> None:
    if not await _table_exists(conn, schema, "products"):
        return
    if not await _table_exists(conn, schema, "product_releases"):
        await conn.execute(text(f"""
            CREATE TABLE {schema}.product_releases (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                product_id UUID NOT NULL REFERENCES {schema}.products(id) ON DELETE CASCADE,
                versao VARCHAR(60) NOT NULL,
                nome VARCHAR(200),
                data_release DATE,
                ambiente VARCHAR(10),
                tipo VARCHAR(30),
                descricao_mudanca TEXT,
                impacto VARCHAR(10),
                responsavel_person_id UUID REFERENCES {schema}.team_persons(id) ON DELETE SET NULL,
                evidencia_link TEXT,
                evidencia_anexos JSONB,
                changelog TEXT,
                tem_rollback BOOLEAN NOT NULL DEFAULT FALSE,
                descricao_rollback TEXT,
                doc_atualizada BOOLEAN NOT NULL DEFAULT FALSE,
                status VARCHAR(20) NOT NULL DEFAULT 'planejada',
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                created_by UUID, created_at TIMESTAMP DEFAULT now(),
                updated_by UUID, updated_at TIMESTAMP DEFAULT now()
            )
        """))
        await conn.execute(text(
            f"CREATE INDEX ix_{schema}_prod_releases_product ON {schema}.product_releases(product_id)"
        ))


async def _step_075_produtos_documentation(conn: AsyncConnection, schema: str) -> None:
    if not await _table_exists(conn, schema, "products"):
        return
    if not await _table_exists(conn, schema, "product_documentations"):
        await conn.execute(text(f"""
            CREATE TABLE {schema}.product_documentations (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                product_id UUID NOT NULL REFERENCES {schema}.products(id) ON DELETE CASCADE,
                tipo VARCHAR(20) NOT NULL DEFAULT 'usuario',
                titulo VARCHAR(200) NOT NULL,
                conteudo_md TEXT,
                versao_relacionada VARCHAR(60),
                autor_person_id UUID REFERENCES {schema}.team_persons(id) ON DELETE SET NULL,
                status VARCHAR(30) NOT NULL DEFAULT 'nao_iniciada',
                link_interno TEXT,
                anexos JSONB,
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                created_by UUID, created_at TIMESTAMP DEFAULT now(),
                updated_by UUID, updated_at TIMESTAMP DEFAULT now()
            )
        """))
        await conn.execute(text(
            f"CREATE INDEX ix_{schema}_prod_docs_product ON {schema}.product_documentations(product_id)"
        ))


async def _step_076_produtos_support(conn: AsyncConnection, schema: str) -> None:
    if not await _table_exists(conn, schema, "products"):
        return
    if not await _table_exists(conn, schema, "product_supports"):
        await conn.execute(text(f"""
            CREATE TABLE {schema}.product_supports (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                product_id UUID NOT NULL REFERENCES {schema}.products(id) ON DELETE CASCADE,
                tipo VARCHAR(20),
                canal_atendimento VARCHAR(200),
                sla_critico VARCHAR(120),
                sla_medio VARCHAR(120),
                sla_solicitacao VARCHAR(120),
                equipe_responsavel VARCHAR(200),
                horario_suporte VARCHAR(120),
                escalonamento TEXT,
                link_base_conhecimento TEXT,
                observacoes TEXT,
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                created_by UUID, created_at TIMESTAMP DEFAULT now(),
                updated_by UUID, updated_at TIMESTAMP DEFAULT now()
            )
        """))
        await conn.execute(text(
            f"CREATE INDEX ix_{schema}_prod_supports_product ON {schema}.product_supports(product_id)"
        ))


async def _step_077_produtos_security(conn: AsyncConnection, schema: str) -> None:
    if not await _table_exists(conn, schema, "products"):
        return
    if not await _table_exists(conn, schema, "product_security_integrations"):
        await conn.execute(text(f"""
            CREATE TABLE {schema}.product_security_integrations (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                product_id UUID NOT NULL REFERENCES {schema}.products(id) ON DELETE CASCADE,
                possui_integracao BOOLEAN NOT NULL DEFAULT FALSE,
                sistemas_integrados TEXT,
                tipo_integracao VARCHAR(20),
                dados_tratados TEXT,
                dados_pessoais BOOLEAN NOT NULL DEFAULT FALSE,
                dados_sensiveis BOOLEAN NOT NULL DEFAULT FALSE,
                classificacao VARCHAR(20),
                tipo_autenticacao VARCHAR(30),
                perfis_acesso TEXT,
                logs_auditoria BOOLEAN NOT NULL DEFAULT FALSE,
                backup BOOLEAN NOT NULL DEFAULT FALSE,
                plano_contingencia BOOLEAN NOT NULL DEFAULT FALSE,
                risco_indisponibilidade VARCHAR(20),
                observacoes TEXT,
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                created_by UUID, created_at TIMESTAMP DEFAULT now(),
                updated_by UUID, updated_at TIMESTAMP DEFAULT now()
            )
        """))
        await conn.execute(text(
            f"CREATE INDEX ix_{schema}_prod_secint_product ON {schema}.product_security_integrations(product_id)"
        ))


async def _step_078_produtos_responsavel_tecnico(conn: AsyncConnection, schema: str) -> None:
    """Adiciona o responsável técnico ao produto. Idempotente."""
    if not await _table_exists(conn, schema, "products"):
        return
    await _add_columns(conn, schema, "products", {
        "responsavel_tecnico_person_id": f"UUID REFERENCES {schema}.team_persons(id) ON DELETE SET NULL",
    })


async def _step_079_produtos_stacks(conn: AsyncConnection, schema: str) -> None:
    """Stacks do produto (multi-valorado): lista de ids do catálogo. Idempotente."""
    if not await _table_exists(conn, schema, "products"):
        return
    await _add_columns(conn, schema, "products", {
        "stacks": "JSONB NOT NULL DEFAULT '[]'::jsonb",
    })


async def _step_080_process_portfolio_passagem_ti(conn: AsyncConnection, schema: str) -> None:
    """Sub processo do portfólio: flag passagem para TI. Idempotente."""
    if not await _table_exists(conn, schema, "process_portfolio_items"):
        return
    if not await _column_exists(conn, schema, "process_portfolio_items", "passagem_para_ti"):
        await conn.execute(text(
            f"ALTER TABLE {schema}.process_portfolio_items "
            f"ADD COLUMN passagem_para_ti BOOLEAN NOT NULL DEFAULT FALSE"
        ))


async def _step_081_process_portfolio_status_values(conn: AsyncConnection, schema: str) -> None:
    """Portfólio de processos: novos valores de status_item. Idempotente."""
    if not await _table_exists(conn, schema, "process_portfolio_items"):
        return
    await conn.execute(text(f"""
        UPDATE {schema}.process_portfolio_items SET status_item = CASE status_item
            WHEN 'proposto' THEN 'planejado'
            WHEN 'ativo' THEN 'em_andamento'
            WHEN 'em_revisao' THEN 'em_andamento'
            WHEN 'descontinuado' THEN 'concluido'
            ELSE status_item
        END
        WHERE status_item IN ('proposto', 'ativo', 'em_revisao', 'descontinuado')
    """))
    await conn.execute(text(
        f"ALTER TABLE {schema}.process_portfolio_items "
        f"ALTER COLUMN status_item SET DEFAULT 'planejado'"
    ))


async def _step_082_process_portfolio_drop_documentado(conn: AsyncConnection, schema: str) -> None:
    """Remove a flag `documentado` do sub processo — agora deriva de status_item == concluido. Idempotente."""
    if not await _table_exists(conn, schema, "process_portfolio_items"):
        return
    if await _column_exists(conn, schema, "process_portfolio_items", "documentado"):
        await conn.execute(text(
            f"ALTER TABLE {schema}.process_portfolio_items DROP COLUMN documentado"
        ))


def _pp_aggregate_status(values: list[str]) -> str | None:
    if not values:
        return None
    if all(v == "concluido" for v in values):
        return "concluido"
    if any(v == "em_andamento" for v in values):
        return "em_andamento"
    if all(v == "planejado" for v in values):
        return "planejado"
    return "em_andamento"


async def _step_083_process_portfolio_status_rollup(conn: AsyncConnection, schema: str) -> None:
    """Recalcula status de processo/macro a partir dos sub processos. Idempotente."""
    if not await _table_exists(conn, schema, "process_portfolio_items"):
        return

    version_ids = (await conn.execute(text(
        f"SELECT DISTINCT version_id FROM {schema}.process_portfolio_items"
    ))).scalars().all()

    for version_id in version_ids:
        rows = (await conn.execute(text(
            f"SELECT id, parent_id, nivel, status_item FROM {schema}.process_portfolio_items "
            f"WHERE version_id = :v"
        ), {"v": version_id})).mappings().all()
        if not rows:
            continue

        by_id = {r["id"]: dict(r) for r in rows}
        children: dict = {}
        for r in rows:
            children.setdefault(r["parent_id"], []).append(r["id"])

        def collect_subs(root_id):
            out = []
            stack = list(children.get(root_id, []))
            while stack:
                cid = stack.pop()
                node = by_id[cid]
                if node["nivel"] == "subprocesso":
                    out.append(node)
                else:
                    stack.extend(children.get(cid, []))
            return out

        def status_for_processo(pid):
            subs = collect_subs(pid)
            if not subs:
                return None
            return _pp_aggregate_status([s["status_item"] for s in subs])

        updates: dict = {}
        for r in rows:
            if r["nivel"] not in ("processo", "macroprocesso"):
                continue
            if r["nivel"] == "processo":
                agg = status_for_processo(r["id"])
            else:
                proc_ids = [cid for cid in children.get(r["id"], []) if by_id[cid]["nivel"] == "processo"]
                proc_statuses = [status_for_processo(pid) for pid in proc_ids]
                proc_statuses = [s for s in proc_statuses if s]
                agg = _pp_aggregate_status(proc_statuses) if proc_statuses else None
            if agg:
                updates[r["id"]] = agg

        for item_id, status in updates.items():
            await conn.execute(text(
                f"UPDATE {schema}.process_portfolio_items SET status_item = :s WHERE id = :id"
            ), {"s": status, "id": item_id})


async def _step_086_produtos_categoria_unify(conn: AsyncConnection, schema: str) -> None:
    """Unifica Categoria + Tipo de desenvolvimento: remapeia categorias antigas para os 5
    novos valores (auto-map pelo tipo) e sincroniza tipo_desenvolvimento. Idempotente."""
    if not await _column_exists(conn, schema, "products", "categoria"):
        return
    novos = "('sistema_interno_dev','sistema_interno_ia','sistema_externo_ia','sistema_externo_implantacao','sistema_externo_dn')"
    await conn.execute(text(f"""
        UPDATE {schema}.products SET categoria = CASE
            WHEN tipo_desenvolvimento = 'interno' THEN 'sistema_interno_dev'
            WHEN tipo_desenvolvimento IN ('externo','hibrido') THEN 'sistema_externo_implantacao'
            WHEN categoria LIKE 'sistema_interno%' THEN 'sistema_interno_dev'
            WHEN categoria LIKE 'sistema_externo%' THEN 'sistema_externo_implantacao'
            ELSE 'sistema_interno_dev' END
        WHERE categoria IS NOT NULL AND categoria NOT IN {novos}
    """))
    # sincroniza interno/externo a partir da categoria nova
    await conn.execute(text(f"""
        UPDATE {schema}.products SET tipo_desenvolvimento =
            CASE WHEN categoria LIKE 'sistema_interno%' THEN 'interno' ELSE 'externo' END
        WHERE categoria IN {novos}
    """))


async def _step_087_produtos_servico_data_publicacao(conn: AsyncConnection, schema: str) -> None:
    """Data de publicação do serviço digital. Idempotente."""
    if not await _table_exists(conn, schema, "product_servicos"):
        return
    await _add_columns(conn, schema, "product_servicos", {
        "data_publicacao": "DATE",
    })
    if await _column_exists(conn, schema, "product_servicos", "ano_referencia"):
        await conn.execute(text(f"""
            UPDATE {schema}.product_servicos
            SET data_publicacao = make_date(ano_referencia, 1, 1)
            WHERE data_publicacao IS NULL AND ano_referencia IS NOT NULL
        """))


async def _step_088_produtos_documento_cadastro(conn: AsyncConnection, schema: str) -> None:
    """Campos do cadastro documental (data, formato, origem, nível LGPD) + migração de espécies. Idempotente."""
    if not await _table_exists(conn, schema, "product_documentos"):
        return
    await _add_columns(conn, schema, "product_documentos", {
        "data_documento": "DATE",
        "formato": "VARCHAR(40)",
        "origem_sistema": "VARCHAR(200)",
        "nivel_dados_pessoais": "VARCHAR(40)",
    })
    if await _column_exists(conn, schema, "product_documentos", "ano_referencia"):
        await conn.execute(text(f"""
            UPDATE {schema}.product_documentos
            SET data_documento = make_date(ano_referencia, 1, 1)
            WHERE data_documento IS NULL AND ano_referencia IS NOT NULL
        """))
    await conn.execute(text(f"""
        UPDATE {schema}.product_documentos SET tipo_documento = CASE tipo_documento
            WHEN 'pdf' THEN 'outro'
            WHEN 'planilha' THEN 'outro'
            WHEN 'formulario' THEN 'formulario_eletronico'
            WHEN 'workflow' THEN 'outro'
            WHEN 'registro' THEN 'registro_sistemico'
            ELSE tipo_documento
        END
        WHERE tipo_documento IN ('pdf', 'planilha', 'formulario', 'workflow', 'registro')
    """))
    await conn.execute(text(f"""
        UPDATE {schema}.product_documentos SET nivel_dados_pessoais = CASE
            WHEN dados_sensiveis THEN 'dados_pessoais_sensiveis'
            WHEN dados_pessoais THEN 'dados_pessoais'
            ELSE 'sem_dados_pessoais'
        END
        WHERE nivel_dados_pessoais IS NULL
    """))


async def _step_085_produtos_login_idigital(conn: AsyncConnection, schema: str) -> None:
    """Flag de autenticação via Idigital no products. Idempotente."""
    await _add_columns(conn, schema, "products", {
        "login_idigital": "BOOLEAN NOT NULL DEFAULT FALSE",
    })


async def _step_089_produtos_corporativo(conn: AsyncConnection, schema: str) -> None:
    """Produto corporativo (PO por serviço). Idempotente."""
    if not await _table_exists(conn, schema, "products"):
        return
    await _add_columns(conn, schema, "products", {
        "corporativo": "BOOLEAN NOT NULL DEFAULT FALSE",
    })
    await _add_columns(conn, schema, "product_servicos", {
        "responsavel_person_id": f"UUID REFERENCES {schema}.team_persons(id) ON DELETE SET NULL",
    })


async def _step_098_produtos_servico_subprocesso_dispensa(conn: AsyncConnection, schema: str) -> None:
    """Flag + justificativa quando não há sub-processo disponível para vincular ao serviço."""
    if not await _table_exists(conn, schema, "product_servicos"):
        return
    await _add_columns(conn, schema, "product_servicos", {
        "sem_subprocesso_disponivel": "BOOLEAN NOT NULL DEFAULT FALSE",
        "justificativa_sem_subprocesso": "TEXT",
    })


async def _step_099_produtos_support_niveis(conn: AsyncConnection, schema: str) -> None:
    """Sustentação por níveis (N1/N2/N3) com responsáveis e SLA em horas."""
    if not await _table_exists(conn, schema, "product_supports"):
        return
    await _add_columns(conn, schema, "product_supports", {
        "niveis_atendimento": "JSONB",
    })


async def _step_100_produtos_support_entries(conn: AsyncConnection, schema: str) -> None:
    """Um registro de sustentação por nível (n1/n2/n3), com config flat em niveis_atendimento."""
    import json

    if not await _table_exists(conn, schema, "product_supports"):
        return
    await _add_columns(conn, schema, "product_supports", {"nivel": "VARCHAR(2)"})

    rows = (await conn.execute(text(f"""
        SELECT id, product_id, canal_atendimento, niveis_atendimento, observacoes,
               is_active, created_by, created_at, updated_by, updated_at
        FROM {schema}.product_supports
        WHERE niveis_atendimento IS NOT NULL AND nivel IS NULL
    """))).mappings().all()

    for row in rows:
        na = row["niveis_atendimento"]
        if not isinstance(na, dict):
            continue
        if any(k in na for k in ("n1", "n2", "n3")):
            keys = [k for k in ("n1", "n2", "n3") if na.get(k)]
            if not keys:
                continue
            first = keys[0]
            await conn.execute(
                text(f"""
                    UPDATE {schema}.product_supports
                    SET nivel = :nivel, niveis_atendimento = CAST(:config AS jsonb)
                    WHERE id = :id
                """),
                {"nivel": first, "config": json.dumps(na[first]), "id": row["id"]},
            )
            for key in keys[1:]:
                await conn.execute(
                    text(f"""
                        INSERT INTO {schema}.product_supports
                        (id, product_id, canal_atendimento, nivel, niveis_atendimento, observacoes,
                         is_active, created_by, created_at, updated_by, updated_at)
                        VALUES (gen_random_uuid(), :product_id, :canal, :nivel, CAST(:config AS jsonb),
                                :obs, :active, :cb, :ca, :ub, :ua)
                    """),
                    {
                        "product_id": row["product_id"],
                        "canal": row["canal_atendimento"],
                        "nivel": key,
                        "config": json.dumps(na[key]),
                        "obs": row["observacoes"],
                        "active": row["is_active"],
                        "cb": row["created_by"],
                        "ca": row["created_at"],
                        "ub": row["updated_by"],
                        "ua": row["updated_at"],
                    },
                )
        else:
            await conn.execute(
                text(f"UPDATE {schema}.product_supports SET nivel = 'n1' WHERE id = :id"),
                {"id": row["id"]},
            )

async def _step_084_produtos_health_config(conn: AsyncConnection, schema: str) -> None:
    """Tabela singleton de configuração do Índice de Saúde do portfólio (pesos + limiares)."""
    if not await _table_exists(conn, schema, "produto_health_config"):
        await conn.execute(text(f"""
            CREATE TABLE {schema}.produto_health_config (
                id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                weights          JSONB NOT NULL DEFAULT '{{}}'::jsonb,
                limiar_saudavel  INTEGER NOT NULL DEFAULT 75,
                limiar_atencao   INTEGER NOT NULL DEFAULT 40,
                updated_by       UUID,
                created_at       TIMESTAMP DEFAULT now(),
                updated_at       TIMESTAMP DEFAULT now()
            )
        """))


async def _step_090_indicadores(conn: AsyncConnection, schema: str) -> None:
    """Tabelas do módulo Indicadores (KPIs institucionais). Idempotente.
    Só cria se o tenant já tiver teamops (FKs para team_areas/team_persons)."""
    if not await _table_exists(conn, schema, "team_persons"):
        return
    if not await _table_exists(conn, schema, "indicadores"):
        await conn.execute(text(f"""
            CREATE TABLE {schema}.indicadores (
                id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                codigo                    VARCHAR(40) NOT NULL,
                nome                      VARCHAR(200) NOT NULL,
                categoria                 VARCHAR(20) NOT NULL,
                descricao                 TEXT,
                objetivo_estrategico      TEXT,
                area_id                   UUID REFERENCES {schema}.team_areas(id) ON DELETE SET NULL,
                responsavel_person_id     UUID REFERENCES {schema}.team_persons(id) ON DELETE SET NULL,
                unidade_medida            VARCHAR(60),
                formula_calculo           TEXT,
                fonte_dados               TEXT,
                granularidade             VARCHAR(20) NOT NULL,
                periodicidade_atualizacao VARCHAR(60),
                sentido                   VARCHAR(20) NOT NULL,
                meta_min                  NUMERIC(18,4),
                meta_max                  NUMERIC(18,4),
                tolerancia_pct            NUMERIC(6,2) NOT NULL DEFAULT 20,
                fonte                     VARCHAR(20) NOT NULL DEFAULT 'manual',
                fonte_metrica             VARCHAR(40),
                fonte_corte               DATE,
                status                    VARCHAR(20) NOT NULL DEFAULT 'ativo',
                is_active                 BOOLEAN NOT NULL DEFAULT TRUE,
                created_by                UUID, created_at TIMESTAMP DEFAULT now(),
                updated_by                UUID, updated_at TIMESTAMP DEFAULT now(),
                inactivated_by            UUID, inactivated_at TIMESTAMP,
                CONSTRAINT uq_indicadores_codigo UNIQUE (codigo)
            )
        """))
        await conn.execute(text(
            f"CREATE INDEX ix_{schema}_indicadores_area ON {schema}.indicadores(area_id)"
        ))
    if not await _table_exists(conn, schema, "indicador_acompanhamentos"):
        await conn.execute(text(f"""
            CREATE TABLE {schema}.indicador_acompanhamentos (
                id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                indicador_id            UUID NOT NULL REFERENCES {schema}.indicadores(id) ON DELETE CASCADE,
                ano_referencia          INTEGER NOT NULL,
                ordem                   INTEGER NOT NULL,
                competencia             VARCHAR(40) NOT NULL,
                periodo_inicio          DATE NOT NULL,
                periodo_fim             DATE NOT NULL,
                meta                    NUMERIC(18,4),
                realizado               NUMERIC(18,4),
                percentual_atingimento  NUMERIC(7,2),
                status                  VARCHAR(20) NOT NULL DEFAULT 'pendente',
                fonte                   VARCHAR(20) NOT NULL DEFAULT 'manual',
                observacao              TEXT,
                evidencias              JSONB,
                created_by              UUID, created_at TIMESTAMP DEFAULT now(),
                updated_by              UUID, updated_at TIMESTAMP DEFAULT now(),
                CONSTRAINT uq_indicador_acomp_periodo UNIQUE (indicador_id, ano_referencia, ordem)
            )
        """))
        await conn.execute(text(
            f"CREATE INDEX ix_{schema}_ind_acomp_indicador ON {schema}.indicador_acompanhamentos(indicador_id)"
        ))


async def _step_091_indicadores_drop_datas(conn: AsyncConnection, schema: str) -> None:
    """Remove data_inicio/data_fim de indicadores (campos descontinuados). Idempotente."""
    if not await _table_exists(conn, schema, "indicadores"):
        return
    await conn.execute(text(f"ALTER TABLE {schema}.indicadores DROP COLUMN IF EXISTS data_inicio"))
    await conn.execute(text(f"ALTER TABLE {schema}.indicadores DROP COLUMN IF EXISTS data_fim"))


async def _step_092_indicadores_fonte(conn: AsyncConnection, schema: str) -> None:
    """Origem de dados do acompanhamento (manual × portfólio de Produtos). Idempotente."""
    if not await _table_exists(conn, schema, "indicadores"):
        return
    await _add_columns(conn, schema, "indicadores", {
        "fonte": "VARCHAR(20) NOT NULL DEFAULT 'manual'",
        "fonte_metrica": "VARCHAR(40)",
        "fonte_corte": "DATE",
    })
    await _add_columns(conn, schema, "indicador_acompanhamentos", {
        "fonte": "VARCHAR(20) NOT NULL DEFAULT 'manual'",
    })


async def _step_093_projetos_card_classification(conn: AsyncConnection, schema: str) -> None:
    """Gate de classificação no backlog (flag por etapa) + vínculo cross-módulo do card
    com o portfólio de PRODUTOS (produto/release, UUID sem FK). Idempotente."""
    await _add_columns(conn, schema, "project_status_configs", {
        "classification_required": "BOOLEAN NOT NULL DEFAULT FALSE",
    })
    await _add_columns(conn, schema, "project_tasks", {
        "card_classification": "VARCHAR(20)",
        "linked_product_id": "UUID",
        "linked_release_id": "UUID",
    })


async def _step_094_indicadores_acomp_bloqueado(conn: AsyncConnection, schema: str) -> None:
    """Trava de fechamento da competência: congela o acompanhamento do mês contra edição."""
    await _add_columns(conn, schema, "indicador_acompanhamentos", {
        "bloqueado": "BOOLEAN NOT NULL DEFAULT FALSE",
    })


async def _step_095_projetos_agent_advance_to(conn: AsyncConnection, schema: str) -> None:
    """Raia de destino configurável quando o agente (classify_and_advance) conclui."""
    await _add_columns(conn, schema, "project_stage_agent_bindings", {
        "advance_to_status_id": "UUID",
    })


async def _step_096_projetos_linked_program(conn: AsyncConnection, schema: str) -> None:
    """Referência a um Programa existente, escolhida na conversão (só etiqueta, UUID sem FK)."""
    await _add_columns(conn, schema, "project_tasks", {
        "linked_program_id": "UUID",
    })


async def _step_097_projetos_programas(conn: AsyncConnection, schema: str) -> None:
    """Cadastro próprio de Programas (catálogo do tenant). Idempotente."""
    if not await _table_exists(conn, schema, "project_programs"):
        await conn.execute(text(f"""
            CREATE TABLE {schema}.project_programs (
                id          UUID PRIMARY KEY,
                name        VARCHAR(200) NOT NULL,
                description TEXT,
                responsavel_person_id UUID REFERENCES {schema}.team_persons(id) ON DELETE SET NULL,
                is_active   BOOLEAN NOT NULL DEFAULT TRUE,
                created_by  UUID, created_at TIMESTAMP DEFAULT now(),
                updated_by  UUID, updated_at TIMESTAMP DEFAULT now()
            )
        """))


async def _step_101_projetos_classification_enforcement(conn: AsyncConnection, schema: str) -> None:
    """Bloqueio configurável na saída do backlog (desligado por padrão)."""
    await _add_columns(conn, schema, "project_funnels", {
        "classification_enforcement_enabled": "BOOLEAN NOT NULL DEFAULT FALSE",
    })


async def _step_102_projetos_us_checklist(conn: AsyncConnection, schema: str) -> None:
    """Checklist de execução em cards User Story (JSONB + percentual derivado)."""
    await _add_columns(conn, schema, "project_tasks", {
        "us_checklist": "JSONB",
    })


async def _step_103_indicadores_responsavel_index(conn: AsyncConnection, schema: str) -> None:
    """Índice para filtro de indicadores por responsável (evita seq scan)."""
    if await _table_exists(conn, schema, "indicadores"):
        await conn.execute(text(
            f"CREATE INDEX IF NOT EXISTS ix_{schema}_indicadores_responsavel "
            f"ON {schema}.indicadores(responsavel_person_id)"
        ))


async def _step_104_projetos_us_impediment(conn: AsyncConnection, schema: str) -> None:
    """Selo de impedimento na Feature: rollup de US filhas em etapa de Impedimento.
    Mantido pela automação de reconcile Feature ← User Stories."""
    await _add_columns(conn, schema, "project_tasks", {
        "us_impediment_active": "BOOLEAN NOT NULL DEFAULT FALSE",
    })


async def _step_105_projetos_us_codereview(conn: AsyncConnection, schema: str) -> None:
    """Selo de Code Review na Feature: rollup de US filhas em etapa de Code Review.
    Mantido pela automação de reconcile Feature ← User Stories."""
    await _add_columns(conn, schema, "project_tasks", {
        "us_codereview_active": "BOOLEAN NOT NULL DEFAULT FALSE",
    })


async def _step_106_team_person_project_allocation_pct(conn: AsyncConnection, schema: str) -> None:
    """Percentual da jornada diária reservado para projetos (por pessoa)."""
    if not await _table_exists(conn, schema, "team_persons"):
        return
    await _add_columns(conn, schema, "team_persons", {
        "project_allocation_pct": "NUMERIC(5,2) NOT NULL DEFAULT 100.0",
    })


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
    ("019_reactivation", _step_019_reactivation),
    ("020_estoque", _step_020_estoque),
    ("021_pdv", _step_021_pdv),
    ("022_pdv_sale_item_batch_serial", _step_022_pdv_sale_item_batch_serial),
    ("023_projetos", _step_023_projetos),
    ("024_projetos_funnels", _step_024_projetos_funnels),
    ("025_projetos_status_active", _step_025_projetos_status_active),
    ("026_projetos_demand_types", _step_026_projetos_demand_types),
    ("027_demand_type_funnel", _step_027_demand_type_funnel),
    ("028_drop_project_task_priority", _step_028_drop_project_task_priority),
    ("029_default_project", _step_029_default_project),
    ("030_teamops", _step_030_teamops),
    ("031_teamops_drop_positions", _step_031_teamops_drop_positions),
    ("032_teamops_area_parent", _step_032_teamops_area_parent),
    ("033_teamops_positions", _step_033_teamops_positions),
    ("034_projetos_hierarchy", _step_034_projetos_hierarchy),
    ("035_projetos_kanbans", _step_035_projetos_kanbans),
    ("036_projetos_automations", _step_036_projetos_automations),
    ("037_projetos_move_permissions", _step_037_projetos_move_permissions),
    ("038_projetos_sla", _step_038_projetos_sla),
    ("039_projetos_task_start_date", _step_039_projetos_task_start_date),
    ("040_projetos_demand_type_basic", _step_040_projetos_demand_type_basic),
    ("041_projetos_demand_type_schedule", _step_041_projetos_demand_type_schedule),
    ("042_teamops_position_role", _step_042_teamops_position_role),
    ("043_projetos_schedule_bindings", _step_043_projetos_schedule_bindings),
    ("044_projetos_priority", _step_044_projetos_priority),
    ("045_projetos_priority_stage_mode", _step_045_projetos_priority_stage_mode),
    ("046_projetos_card_fields", _step_046_projetos_card_fields),
    ("047_projetos_card_fields_per_funnel", _step_047_projetos_card_fields_per_funnel),
    ("048_projetos_planning_kind", _step_048_projetos_planning_kind),
    ("049_projetos_cascade_children", _step_049_projetos_cascade_children),
    ("050_projetos_children_to_funnel", _step_050_projetos_children_to_funnel),
    ("051_projetos_funnel_access", _step_051_projetos_funnel_access),
    ("052_projetos_grandchildren_to_funnel", _step_052_projetos_grandchildren_to_funnel),
    ("053_projetos_task_hours_and_deps", _step_053_projetos_task_hours_and_deps),
    ("054_schedule_engine_calendar", _step_054_schedule_engine_calendar),
    ("055_baseline_and_progress", _step_055_baseline_and_progress),
    ("056_drop_milestone_and_baseline", _step_056_drop_milestone_and_baseline),
    ("057_projetos_priority_pillars", _step_057_projetos_priority_pillars),
    ("058_produtos", _step_058_produtos),
    ("059_produtos_portfolio", _step_059_produtos_portfolio),
    ("060_assigned_to_person", _step_060_assigned_to_person),
    ("061_projetos_card_field_key_len", _step_061_projetos_card_field_key_len),
    ("062_projetos_priority_history", _step_062_projetos_priority_history),
    ("063_projetos_status_reports", _step_063_projetos_status_reports),
    ("064_projetos_task_anexos", _step_064_projetos_task_anexos),
    ("065_projetos_move_out_permissions", _step_065_projetos_move_out_permissions),
    ("066_projetos_stage_agents", _step_066_projetos_stage_agents),
    ("067_projetos_stage_agent_kind", _step_067_projetos_stage_agent_kind),
    ("068_projetos_schedule_baselines", _step_068_projetos_schedule_baselines),
    ("069_produtos_process_portfolio", _step_069_produtos_process_portfolio),
    ("070_produtos_product_extend", _step_070_produtos_product_extend),
    ("071_produtos_servico_extend", _step_071_produtos_servico_extend),
    ("072_produtos_documento_extend", _step_072_produtos_documento_extend),
    ("073_produtos_contrato_extend", _step_073_produtos_contrato_extend),
    ("074_produtos_release", _step_074_produtos_release),
    ("075_produtos_documentation", _step_075_produtos_documentation),
    ("076_produtos_support", _step_076_produtos_support),
    ("077_produtos_security", _step_077_produtos_security),
    ("078_produtos_responsavel_tecnico", _step_078_produtos_responsavel_tecnico),
    ("079_produtos_stacks", _step_079_produtos_stacks),
    ("080_process_portfolio_passagem_ti", _step_080_process_portfolio_passagem_ti),
    ("081_process_portfolio_status_values", _step_081_process_portfolio_status_values),
    ("082_process_portfolio_drop_documentado", _step_082_process_portfolio_drop_documentado),
    ("083_process_portfolio_status_rollup", _step_083_process_portfolio_status_rollup),
    ("084_produtos_health_config", _step_084_produtos_health_config),
    ("085_produtos_login_idigital", _step_085_produtos_login_idigital),
    ("086_produtos_categoria_unify", _step_086_produtos_categoria_unify),
    ("087_produtos_servico_data_publicacao", _step_087_produtos_servico_data_publicacao),
    ("088_produtos_documento_cadastro", _step_088_produtos_documento_cadastro),
    ("089_produtos_corporativo", _step_089_produtos_corporativo),
    ("090_indicadores", _step_090_indicadores),
    ("091_indicadores_drop_datas", _step_091_indicadores_drop_datas),
    ("092_indicadores_fonte", _step_092_indicadores_fonte),
    ("093_projetos_card_classification", _step_093_projetos_card_classification),
    ("094_indicadores_acomp_bloqueado", _step_094_indicadores_acomp_bloqueado),
    ("095_projetos_agent_advance_to", _step_095_projetos_agent_advance_to),
    ("096_projetos_linked_program", _step_096_projetos_linked_program),
    ("097_projetos_programas", _step_097_projetos_programas),
    ("098_produtos_servico_subprocesso_dispensa", _step_098_produtos_servico_subprocesso_dispensa),
    ("099_produtos_support_niveis", _step_099_produtos_support_niveis),
    ("100_produtos_support_entries", _step_100_produtos_support_entries),
    ("101_projetos_classification_enforcement", _step_101_projetos_classification_enforcement),
    ("102_projetos_us_checklist", _step_102_projetos_us_checklist),
    ("103_indicadores_responsavel_index", _step_103_indicadores_responsavel_index),
    ("104_projetos_us_impediment", _step_104_projetos_us_impediment),
    ("105_projetos_us_codereview", _step_105_projetos_us_codereview),
    ("106_team_person_project_allocation_pct", _step_106_team_person_project_allocation_pct),
]


# ─────────────────────────────────────────────
# Runner
# ─────────────────────────────────────────────

async def upgrade_tenant_schema(schema: str) -> None:
    """Aplica todos os steps no schema do tenant. Idempotente.

    Cada step roda em sua PRÓPRIA transação: uma falha (ex.: step de um módulo
    que foi removido do tenant e cujas tabelas não existem mais) é logada e NÃO
    impede os steps seguintes. Como os steps são idempotentes e cada um valida
    seus pré-requisitos (`_table_exists`), num tenant saudável o comportamento é
    idêntico ao anterior; num tenant degradado, novos módulos ainda conseguem
    aplicar suas tabelas.
    """
    # Garante extensão pgcrypto para gen_random_uuid()
    async with engine.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS pgcrypto"))
    for name, step in STEPS:
        try:
            async with engine.begin() as conn:
                await step(conn, schema)
        except Exception as e:  # noqa: BLE001
            print(f"[tenant_migrations] {schema}/{name} failed (pulando): {e}")


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
