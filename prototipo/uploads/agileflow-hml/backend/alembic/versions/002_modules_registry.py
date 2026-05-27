"""modules_registry

Revision ID: 002
Revises: 001
Create Date: 2026-05-09

- Cria tabela `modules` (registro de módulos desenvolvidos).
- Converte `plan_modules.module_slug` e `tenant_modules.module_slug`
  do enum `moduleslug` para varchar(50).
- Remove o tipo enum `moduleslug`.
- Faz seed do módulo Atendimento (único pronto até aqui).
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── MODULES (registro global) ────────────────
    op.create_table(
        "modules",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("slug", sa.String(50), nullable=False, unique=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("icon", sa.String(50), nullable=True),
        sa.Column("backend_path", sa.String(255), nullable=False),
        sa.Column("frontend_path", sa.String(255), nullable=False),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
    )
    op.create_index("ix_modules_slug", "modules", ["slug"])

    # ── plan_modules.module_slug: enum → varchar ─
    op.execute(
        "ALTER TABLE plan_modules "
        "ALTER COLUMN module_slug TYPE varchar(50) USING module_slug::text"
    )

    # ── tenant_modules.module_slug: enum → varchar ─
    op.execute(
        "ALTER TABLE tenant_modules "
        "ALTER COLUMN module_slug TYPE varchar(50) USING module_slug::text"
    )

    # ── Drop enum type ───────────────────────────
    op.execute("DROP TYPE IF EXISTS moduleslug")

    # ── Seed Atendimento ─────────────────────────
    op.execute("""
        INSERT INTO modules
            (id, slug, name, description, icon, backend_path, frontend_path, is_active)
        VALUES (
            gen_random_uuid(),
            'atendimento',
            'Atendimento',
            'CRM e omnichannel: kanban configurável, clientes, atendimentos e canais.',
            'MessageSquare',
            'backend/app/modules/atendimento',
            'frontend/src/modules/atendimento',
            true
        )
    """)


def downgrade() -> None:
    # Recria enum
    postgresql.ENUM(
        "atendimento", "pdv", "suprimentos", "financeiro", "rh",
        name="moduleslug",
    ).create(op.get_bind(), checkfirst=True)

    # Reverte colunas para enum (assume valores existentes ainda válidos)
    op.execute(
        "ALTER TABLE plan_modules "
        "ALTER COLUMN module_slug TYPE moduleslug USING module_slug::moduleslug"
    )
    op.execute(
        "ALTER TABLE tenant_modules "
        "ALTER COLUMN module_slug TYPE moduleslug USING module_slug::moduleslug"
    )

    op.drop_index("ix_modules_slug", table_name="modules")
    op.drop_table("modules")
