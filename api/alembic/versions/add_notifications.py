"""add notifications and user_notification_prefs

Revision ID: add_notifications
Revises: add_assigned_to
Create Date: 2026-03-03

Adds tables for in-app notifications and user notification preferences.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "add_notifications"
down_revision: Union[str, None] = "add_assigned_to"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "notifications",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("request_id", sa.Integer(), nullable=True),
        sa.Column("event_type", sa.String(50), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("message", sa.String(500), nullable=False),
        sa.Column("is_read", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["request_id"], ["material_requests.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_notifications_user_id", "notifications", ["user_id"], unique=False)

    op.create_table(
        "user_notification_prefs",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("notify_request_created", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("notify_request_assigned", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("notify_request_approved", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("notify_request_rejected", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("notify_request_completed", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("email_request_created", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("email_request_assigned", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("email_request_approved", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("email_request_rejected", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("email_request_completed", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id"),
    )


def downgrade() -> None:
    op.drop_table("user_notification_prefs")
    op.drop_table("notifications")
