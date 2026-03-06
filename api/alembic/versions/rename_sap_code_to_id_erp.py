"""rename sap_code to id_erp in material_database

Revision ID: rename_sap_code_id_erp
Revises: add_id_sistema
Create Date: 2026-03-03

Renames material_database.sap_code to id_erp.
Drops old unique constraint and recreates with new column/name.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "rename_sap_code_id_erp"
down_revision: Union[str, Sequence[str], None] = "add_id_sistema"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint("uq_material_db_tenant_sap", "material_database", type_="unique")
    op.alter_column(
        "material_database",
        "sap_code",
        new_column_name="id_erp",
    )
    op.create_unique_constraint(
        "uq_material_db_tenant_id_erp",
        "material_database",
        ["tenant_id", "id_erp"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_material_db_tenant_id_erp", "material_database", type_="unique")
    op.alter_column(
        "material_database",
        "id_erp",
        new_column_name="sap_code",
    )
    op.create_unique_constraint(
        "uq_material_db_tenant_sap",
        "material_database",
        ["tenant_id", "sap_code"],
    )
