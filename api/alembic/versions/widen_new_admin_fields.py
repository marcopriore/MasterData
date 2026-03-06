"""widen new admin fields to VARCHAR(100)

Revision ID: widen_new_admin
Revises: add_admin_fields_mat
Create Date: 2026-03-03

Increases sales_unit, order_unit, cst_ipi (and any other String(20) admin fields)
to VARCHAR(100) to avoid StringDataRightTruncation.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "widen_new_admin"
down_revision: Union[str, Sequence[str], None] = "add_admin_fields_mat"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Colunas criadas com String(20) na migration add_admin_fields_mat
    for col in ["sales_unit", "order_unit", "cst_ipi"]:
        op.alter_column(
            "material_database",
            col,
            type_=sa.String(100),
            existing_type=sa.String(20),
        )


def downgrade() -> None:
    for col in ["sales_unit", "order_unit", "cst_ipi"]:
        op.alter_column(
            "material_database",
            col,
            type_=sa.String(20),
            existing_type=sa.String(100),
        )
