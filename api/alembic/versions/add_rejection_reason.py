"""add rejection_reason to material_requests

Revision ID: add_rejection_reason
Revises: add_governance_atendimento
Create Date: 2026-03-02

Adds:
  - material_requests.rejection_reason (TEXT, nullable)
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "add_rejection_reason"
down_revision: Union[str, None] = "add_governance_atendimento"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "material_requests",
        sa.Column("rejection_reason", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("material_requests", "rejection_reason")
