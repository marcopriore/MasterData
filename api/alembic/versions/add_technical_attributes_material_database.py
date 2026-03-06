"""add technical_attributes to material_database

Revision ID: add_technical_attrs
Revises: rename_sap_code_id_erp
Create Date: 2026-03-03

Adds technical_attributes JSON column to material_database for storing
attribute values from material requests.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "add_technical_attrs"
down_revision: Union[str, Sequence[str], None] = "rename_sap_code_id_erp"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "material_database",
        sa.Column("technical_attributes", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("material_database", "technical_attributes")
