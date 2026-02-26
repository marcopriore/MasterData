"""add workflow_header and link workflow_config + material_requests

Revision ID: add_workflow_header
Revises: add_workflow_status_key
Create Date: 2026-02-26

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "add_workflow_header"
down_revision: Union[str, Sequence[str], None] = "add_workflow_status_key"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "workflow_header",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), default=True, nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.add_column(
        "workflow_config",
        sa.Column("workflow_id", sa.Integer(), nullable=True),
    )
    op.add_column(
        "material_requests",
        sa.Column("workflow_id", sa.Integer(), nullable=True),
    )

    op.execute(
        sa.text(
            """
            INSERT INTO workflow_header (name, description, is_active) VALUES
            ('Fluxo Principal', 'Fluxo padrão de aprovação', true)
            """
        )
    )

    default_wf_id = 1
    op.execute(
        sa.text("UPDATE workflow_config SET workflow_id = :id").bindparams(id=default_wf_id)
    )
    op.execute(
        sa.text("UPDATE material_requests SET workflow_id = :id").bindparams(id=default_wf_id)
    )

    op.alter_column(
        "workflow_config",
        "workflow_id",
        existing_type=sa.Integer(),
        nullable=False,
    )
    op.alter_column(
        "material_requests",
        "workflow_id",
        existing_type=sa.Integer(),
        nullable=False,
    )
    op.create_foreign_key(
        "fk_workflow_config_workflow_id",
        "workflow_config",
        "workflow_header",
        ["workflow_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_material_requests_workflow_id",
        "material_requests",
        "workflow_header",
        ["workflow_id"],
        ["id"],
        ondelete="RESTRICT",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_material_requests_workflow_id", "material_requests", type_="foreignkey"
    )
    op.drop_constraint(
        "fk_workflow_config_workflow_id", "workflow_config", type_="foreignkey"
    )
    op.drop_column("material_requests", "workflow_id")
    op.drop_column("workflow_config", "workflow_id")
    op.drop_table("workflow_header")
