"""add role_type to roles

Revision ID: add_role_type
Revises: add_request_attachments
Create Date: 2026-03-03

Adds role_type column to roles table:
  - role_type: String(20), nullable=False, default='sistema'
  - values: 'sistema' | 'etapa'
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "add_role_type"
down_revision: Union[str, None] = "add_request_attachments"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "roles",
        sa.Column("role_type", sa.String(length=20), nullable=False, server_default="sistema"),
    )


def downgrade() -> None:
    op.drop_column("roles", "role_type")
