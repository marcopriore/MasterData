"""add request_attachments table

Revision ID: add_request_attachments
Revises: add_users_and_roles
Create Date: 2026-03-02

Creates:
  - request_attachments (id, request_id FK, file_name, file_path,
                         mime_type, file_size, uploaded_at)
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "add_request_attachments"
down_revision: Union[str, None] = "add_users_and_roles"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "request_attachments",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "request_id",
            sa.Integer(),
            sa.ForeignKey("material_requests.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("file_name", sa.String(255), nullable=False),
        sa.Column("file_path", sa.String(500), nullable=False),
        sa.Column("mime_type", sa.String(100), nullable=True),
        sa.Column("file_size", sa.Integer(), nullable=True),
        sa.Column(
            "uploaded_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index(
        "ix_request_attachments_request_id",
        "request_attachments",
        ["request_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_request_attachments_request_id", table_name="request_attachments")
    op.drop_table("request_attachments")
