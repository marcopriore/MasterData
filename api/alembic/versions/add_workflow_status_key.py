"""add status_key to workflow_config

Revision ID: add_workflow_status_key
Revises: add_workflow_config
Create Date: 2026-02-26

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "add_workflow_status_key"
down_revision: Union[str, Sequence[str], None] = "add_workflow_config"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "workflow_config",
        sa.Column("status_key", sa.String(length=50), nullable=True),
    )
    # Backfill existing rows
    op.execute(
        sa.text(
            """
            UPDATE workflow_config SET status_key = 'pending_technical' WHERE step_name = 'Revisão Técnica';
            UPDATE workflow_config SET status_key = 'pending_fiscal' WHERE step_name = 'Enriquecimento Fiscal';
            UPDATE workflow_config SET status_key = 'pending_mrp' WHERE step_name = 'Dados MRP';
            UPDATE workflow_config SET status_key = 'completed' WHERE step_name = 'Concluído';
            """
        )
    )
    op.alter_column(
        "workflow_config",
        "status_key",
        existing_type=sa.String(50),
        nullable=False,
    )


def downgrade() -> None:
    op.drop_column("workflow_config", "status_key")
