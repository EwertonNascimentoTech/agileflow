"""initial_tables

Revision ID: 001
Revises:
Create Date: 2026-05-09
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "001"
down_revision = None
branch_labels = None
depends_on = None

# Referências aos tipos já criados — create_type=False impede dupla criação
moduleslug = postgresql.ENUM(name="moduleslug", create_type=False)
userrole   = postgresql.ENUM(name="userrole",   create_type=False)


def upgrade() -> None:
    # ── ENUM TYPES ───────────────────────────────
    postgresql.ENUM(
        "atendimento", "pdv", "suprimentos", "financeiro", "rh",
        name="moduleslug",
    ).create(op.get_bind(), checkfirst=True)

    postgresql.ENUM(
        "super_admin", "company_admin", "company_user",
        name="userrole",
    ).create(op.get_bind(), checkfirst=True)

    # ── PLANS ────────────────────────────────────
    op.create_table(
        "plans",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(100), nullable=False, unique=True),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("price", sa.Numeric(10, 2), nullable=False, default=0),
        sa.Column("max_users", sa.Integer, nullable=False, default=5),
        sa.Column("is_active", sa.Boolean, default=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
    )

    # ── PLAN MODULES ─────────────────────────────
    op.create_table(
        "plan_modules",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("plan_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("plans.id", ondelete="CASCADE"), nullable=False),
        sa.Column("module_slug", moduleslug, nullable=False),
        sa.UniqueConstraint("plan_id", "module_slug", name="uq_plan_module"),
    )

    # ── TENANTS ──────────────────────────────────
    op.create_table(
        "tenants",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("slug", sa.String(100), nullable=False, unique=True),
        sa.Column("schema_name", sa.String(100), nullable=False, unique=True),
        sa.Column("plan_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("plans.id", ondelete="SET NULL"), nullable=True),
        sa.Column("is_active", sa.Boolean, default=True),
        sa.Column("plan_expires_at", sa.DateTime, nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
    )
    op.create_index("ix_tenants_slug", "tenants", ["slug"])

    # ── TENANT MODULES ───────────────────────────
    op.create_table(
        "tenant_modules",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("module_slug", moduleslug, nullable=False),
        sa.Column("is_active", sa.Boolean, default=True),
        sa.Column("activated_at", sa.DateTime, server_default=sa.func.now()),
        sa.UniqueConstraint("tenant_id", "module_slug", name="uq_tenant_module"),
    )

    # ── USERS ────────────────────────────────────
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True),
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("full_name", sa.String(200), nullable=False),
        sa.Column("role", userrole, nullable=False),
        sa.Column("is_active", sa.Boolean, default=True),
        sa.Column("last_login", sa.DateTime, nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
    )
    op.create_index("ix_users_email", "users", ["email"])
    op.create_index("ix_users_tenant_id", "users", ["tenant_id"])


def downgrade() -> None:
    op.drop_table("users")
    op.drop_table("tenant_modules")
    op.drop_table("tenants")
    op.drop_table("plan_modules")
    op.drop_table("plans")

    op.execute("DROP TYPE IF EXISTS moduleslug")
    op.execute("DROP TYPE IF EXISTS userrole")
