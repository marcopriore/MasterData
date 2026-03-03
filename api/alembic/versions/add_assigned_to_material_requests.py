"""add assigned_to_id and assigned_at to material_requests

Revision ID: add_assigned_to
Revises: add_role_type
Create Date: 2026-03-03

Adds columns for "Iniciar Atendimento" concurrency lock:
  - assigned_to_id: FK users.id ON DELETE SET NULL, nullable
  - assigned_at: DateTime, nullable
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "add_assigned_to"
down_revision: Union[str, None] = "add_role_type"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "material_requests",
        sa.Column("assigned_to_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
    )
    op.add_column(
        "material_requests",
        sa.Column("assigned_at", sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("material_requests", "assigned_at")
    op.drop_column("material_requests", "assigned_to_id")
