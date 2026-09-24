"""Create user_payroll_profiles (dados funcionais da folha Genus, sem CPF)

Revision ID: 008
Revises: 007
Create Date: 2026-09-24
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "008"
down_revision = "007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_payroll_profiles",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("source", sa.String(30), nullable=False, server_default="genus"),
        sa.Column("employee_number", sa.String(30), nullable=True),
        sa.Column("organization", sa.String(50), nullable=True),
        sa.Column("department", sa.String(200), nullable=True),
        sa.Column("job_title", sa.String(200), nullable=True),
        sa.Column("trust_role", sa.String(200), nullable=True),
        sa.Column("source_updated_at", sa.String(40), nullable=True),
        sa.Column("fetched_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("user_id", name="uq_user_payroll_profiles_user"),
    )


def downgrade() -> None:
    op.drop_table("user_payroll_profiles")
