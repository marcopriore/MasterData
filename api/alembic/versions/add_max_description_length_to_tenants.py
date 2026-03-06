"""add max_description_length to tenants

Revision ID: add_max_desc_len
Revises: add_technical_attrs
Create Date: 2026-03-03

Adds max_description_length column to tenants for per-tenant
description character limit (default 40).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "add_max_desc_len"
down_revision: Union[str, Sequence[str], None] = "add_technical_attrs"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "tenants",
        sa.Column("max_description_length", sa.Integer(), nullable=True, server_default="40"),
    )


def downgrade() -> None:
    op.drop_column("tenants", "max_description_length")
