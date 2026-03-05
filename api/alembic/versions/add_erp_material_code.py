"""add erp_material_code to material_requests

Revision ID: add_erp_material_code
Revises: add_notifications
Create Date: 2026-03-03

Adds material_requests.erp_material_code (VARCHAR 50, nullable) for receiving
ERP material code via webhook when request reaches Finalizado.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "add_erp_material_code"
down_revision: Union[str, Sequence[str], None] = "add_notifications"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "material_requests",
        sa.Column("erp_material_code", sa.String(length=50), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("material_requests", "erp_material_code")
