"""add workflow_config table and seed data

Revision ID: add_workflow_config
Revises: f29cadf80750
Create Date: 2026-02-26

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "add_workflow_config"
down_revision: Union[str, Sequence[str], None] = "f29cadf80750"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "workflow_config",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("step_name", sa.String(length=100), nullable=False),
        sa.Column("order", sa.Integer(), nullable=False),
        sa.Column("is_active", sa.Boolean(), default=True, nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    # Seed initial records
    op.execute(
        sa.text(
            """
            INSERT INTO workflow_config (step_name, "order", is_active) VALUES
            ('Revisão Técnica', 1, true),
            ('Enriquecimento Fiscal', 2, true),
            ('Dados MRP', 3, true),
            ('Concluído', 4, true)
            """
        )
    )


def downgrade() -> None:
    op.drop_table("workflow_config")
