"""add governança v2.0 columns: assigned_to, atendimento_status, last_action_at

Revision ID: add_governance_atendimento
Revises: add_indexes_and_cascade
Create Date: 2026-03-02

Adds:
  - material_requests.assigned_to (FK users.id, ON DELETE SET NULL)
  - material_requests.atendimento_status (VARCHAR 20, default 'aberto')
  - material_requests.last_action_at (TIMESTAMP, nullable)
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "add_governance_atendimento"
down_revision: Union[str, None] = "add_indexes_and_cascade"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "material_requests",
        sa.Column("assigned_to", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
    )
    op.add_column(
        "material_requests",
        sa.Column("atendimento_status", sa.String(20), nullable=False, server_default="aberto"),
    )
    op.add_column(
        "material_requests",
        sa.Column("last_action_at", sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("material_requests", "last_action_at")
    op.drop_column("material_requests", "atendimento_status")
    op.drop_column("material_requests", "assigned_to")
