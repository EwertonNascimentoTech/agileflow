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
