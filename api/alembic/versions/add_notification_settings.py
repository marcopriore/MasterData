"""add notification_settings table

Revision ID: add_notification_settings
Revises: add_rejection_reason
Create Date: 2026-03-02

Adds:
  - notification_settings (step_id FK workflow_config, user_ids JSONB, role_ids JSONB)
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "add_notification_settings"
down_revision: Union[str, None] = "add_rejection_reason"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "notification_settings",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column(
            "step_id",
            sa.Integer(),
            sa.ForeignKey("workflow_config.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("user_ids", sa.dialects.postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("role_ids", sa.dialects.postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("step_id", name="uq_notification_settings_step_id"),
    )
    op.create_index(
        "ix_notification_settings_step_id",
        "notification_settings",
        ["step_id"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_table("notification_settings")
