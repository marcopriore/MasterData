"""widen material_database admin fields to VARCHAR(100)

Revision ID: widen_mat_db_admin
Revises: create_measurement_units
Create Date: 2026-03-03

Increases material_type, mrp_type, valuation_class, purchase_group, origin,
profit_center to VARCHAR(100) to avoid StringDataRightTruncation when values
like "HALB - Semimanufaturado" exceed the previous limits.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "widen_mat_db_admin"
down_revision: Union[str, Sequence[str], None] = "create_measurement_units"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "material_database",
        "material_type",
        type_=sa.String(100),
        existing_type=sa.String(50),
    )
    op.alter_column(
        "material_database",
        "mrp_type",
        type_=sa.String(100),
        existing_type=sa.String(20),
    )
    op.alter_column(
        "material_database",
        "valuation_class",
        type_=sa.String(100),
        existing_type=sa.String(20),
    )
    op.alter_column(
        "material_database",
        "purchase_group",
        type_=sa.String(100),
        existing_type=sa.String(50),
    )
    op.alter_column(
        "material_database",
        "origin",
        type_=sa.String(100),
        existing_type=sa.String(50),
    )
    op.alter_column(
        "material_database",
        "profit_center",
        type_=sa.String(100),
        existing_type=sa.String(50),
    )


def downgrade() -> None:
    op.alter_column(
        "material_database",
        "material_type",
        type_=sa.String(50),
        existing_type=sa.String(100),
    )
    op.alter_column(
        "material_database",
        "mrp_type",
        type_=sa.String(20),
        existing_type=sa.String(100),
    )
    op.alter_column(
        "material_database",
        "valuation_class",
        type_=sa.String(20),
        existing_type=sa.String(100),
    )
    op.alter_column(
        "material_database",
        "purchase_group",
        type_=sa.String(50),
        existing_type=sa.String(100),
    )
    op.alter_column(
        "material_database",
        "origin",
        type_=sa.String(50),
        existing_type=sa.String(100),
    )
    op.alter_column(
        "material_database",
        "profit_center",
        type_=sa.String(50),
        existing_type=sa.String(100),
    )
