"""module_color

Revision ID: 003
Revises: 002
Create Date: 2026-05-09

Adiciona coluna `color` (hex) em `modules`.
Default: #3B82F6 (azul). Atendimento recebe #10B981 (verde) por padrão.
"""
from alembic import op
import sqlalchemy as sa


revision = "003"
down_revision = "002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "modules",
        sa.Column("color", sa.String(7), nullable=False, server_default="#3B82F6"),
    )
    # Cor diferenciada para Atendimento (verde, combina com WhatsApp).
    op.execute("UPDATE modules SET color = '#10B981' WHERE slug = 'atendimento'")


def downgrade() -> None:
    op.drop_column("modules", "color")
