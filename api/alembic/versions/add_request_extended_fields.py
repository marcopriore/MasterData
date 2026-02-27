"""add extended fields to material_requests

Revision ID: add_request_extended_fields
Revises: add_workflow_header
Create Date: 2026-02-27

Adds:
  - cost_center      VARCHAR(100)
  - urgency          VARCHAR(20)  default 'low'
  - justification    TEXT
  - generated_description TEXT
  - technical_attributes  JSONB
  - attachments           JSONB
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "add_request_extended_fields"
down_revision: Union[str, Sequence[str], None] = "add_workflow_header"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "material_requests",
        sa.Column("cost_center", sa.String(length=100), nullable=True),
    )
    op.add_column(
        "material_requests",
        sa.Column("urgency", sa.String(length=20), nullable=False, server_default="low"),
    )
    op.add_column(
        "material_requests",
        sa.Column("justification", sa.Text(), nullable=True),
    )
    op.add_column(
        "material_requests",
        sa.Column("generated_description", sa.Text(), nullable=True),
    )
    op.add_column(
        "material_requests",
        sa.Column(
            "technical_attributes",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
    )
    op.add_column(
        "material_requests",
        sa.Column(
            "attachments",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("material_requests", "attachments")
    op.drop_column("material_requests", "technical_attributes")
    op.drop_column("material_requests", "generated_description")
    op.drop_column("material_requests", "justification")
    op.drop_column("material_requests", "urgency")
    op.drop_column("material_requests", "cost_center")
