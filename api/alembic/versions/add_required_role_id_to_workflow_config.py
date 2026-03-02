"""add required_role_id to workflow_config

Revision ID: add_required_role_id
Revises: add_notification_settings
Create Date: 2026-03-02

Adds:
  - workflow_config.required_role_id (Integer, nullable, FK roles.id ON DELETE SET NULL)
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "add_required_role_id"
down_revision: Union[str, None] = "add_notification_settings"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "workflow_config",
        sa.Column(
            "required_role_id",
            sa.Integer(),
            sa.ForeignKey("roles.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("workflow_config", "required_role_id")
