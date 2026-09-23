"""Create user_sso_identities (vínculo usuário ↔ conta IDigital)

Revision ID: 007
Revises: 006
Create Date: 2026-09-23
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "007"
down_revision = "006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_sso_identities",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("provider", sa.String(30), nullable=False),
        sa.Column("subject", sa.String(255), nullable=False),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("linked_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("last_login_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint("provider", "subject", name="uq_user_sso_identities_provider_subject"),
        sa.UniqueConstraint("user_id", "provider", name="uq_user_sso_identities_user_provider"),
    )
    op.create_index("ix_user_sso_identities_user_id", "user_sso_identities", ["user_id"])


def downgrade() -> None:
    op.drop_table("user_sso_identities")
