"""add id_sistema to material_requests and material_database

Revision ID: add_id_sistema
Revises: add_erp_material_code
Create Date: 2026-03-03

Adds id_sistema (MDM-000001) as internal identifier:
  - material_requests.id_sistema: VARCHAR(20), nullable, unique
  - material_database.id_sistema: VARCHAR(20), nullable, unique
  - material_database.sap_code: alter to nullable (until ERP returns)
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "add_id_sistema"
down_revision: Union[str, Sequence[str], None] = "add_erp_material_code"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("material_requests", sa.Column("id_sistema", sa.String(20), nullable=True))
    op.create_index("ix_material_requests_id_sistema", "material_requests", ["id_sistema"], unique=True)

    op.add_column("material_database", sa.Column("id_sistema", sa.String(20), nullable=True))
    op.create_index("ix_material_database_id_sistema", "material_database", ["id_sistema"], unique=True)

    op.alter_column(
        "material_database",
        "sap_code",
        existing_type=sa.String(50),
        nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "material_database",
        "sap_code",
        existing_type=sa.String(50),
        nullable=False,
    )
    op.drop_index("ix_material_database_id_sistema", "material_database")
    op.drop_column("material_database", "id_sistema")
    op.drop_index("ix_material_requests_id_sistema", "material_requests")
    op.drop_column("material_requests", "id_sistema")
