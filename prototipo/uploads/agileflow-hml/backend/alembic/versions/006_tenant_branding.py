"""Add branding fields to tenants

Revision ID: 006
Revises: 005
Create Date: 2026-05-11
"""
from alembic import op
import sqlalchemy as sa

revision = "006"
down_revision = "005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tenants", sa.Column("logo_url", sa.String(500), nullable=True))
    op.add_column("tenants", sa.Column("primary_color", sa.String(7), nullable=True))


def downgrade() -> None:
    op.drop_column("tenants", "primary_color")
    op.drop_column("tenants", "logo_url")
