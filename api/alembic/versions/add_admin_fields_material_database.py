"""add admin fields to material_database

Revision ID: add_admin_fields_mat
Revises: widen_mat_db_admin
Create Date: 2026-03-03

Adds sales_org, distribution_channel, sales_unit, order_unit, delivery_tolerance,
preferred_supplier, mrp_controller, lot_size, forecast_profile, cst_ipi,
cst_pis_cofins, stock_account, price_control, valuation_group to material_database.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "add_admin_fields_mat"
down_revision: Union[str, Sequence[str], None] = "widen_mat_db_admin"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("material_database", sa.Column("valuation_group", sa.String(100), nullable=True))
    op.add_column("material_database", sa.Column("sales_org", sa.String(100), nullable=True))
    op.add_column("material_database", sa.Column("distribution_channel", sa.String(100), nullable=True))
    op.add_column("material_database", sa.Column("sales_unit", sa.String(20), nullable=True))
    op.add_column("material_database", sa.Column("order_unit", sa.String(20), nullable=True))
    op.add_column("material_database", sa.Column("delivery_tolerance", sa.Integer(), nullable=True))
    op.add_column("material_database", sa.Column("preferred_supplier", sa.String(100), nullable=True))
    op.add_column("material_database", sa.Column("mrp_controller", sa.String(100), nullable=True))
    op.add_column("material_database", sa.Column("lot_size", sa.Float(), nullable=True))
    op.add_column("material_database", sa.Column("forecast_profile", sa.String(100), nullable=True))
    op.add_column("material_database", sa.Column("cst_ipi", sa.String(20), nullable=True))
    op.add_column("material_database", sa.Column("cst_pis_cofins", sa.String(100), nullable=True))
    op.add_column("material_database", sa.Column("stock_account", sa.String(100), nullable=True))
    op.add_column("material_database", sa.Column("price_control", sa.String(100), nullable=True))


def downgrade() -> None:
    op.drop_column("material_database", "price_control")
    op.drop_column("material_database", "stock_account")
    op.drop_column("material_database", "cst_pis_cofins")
    op.drop_column("material_database", "cst_ipi")
    op.drop_column("material_database", "forecast_profile")
    op.drop_column("material_database", "lot_size")
    op.drop_column("material_database", "mrp_controller")
    op.drop_column("material_database", "preferred_supplier")
    op.drop_column("material_database", "delivery_tolerance")
    op.drop_column("material_database", "order_unit")
    op.drop_column("material_database", "sales_unit")
    op.drop_column("material_database", "distribution_channel")
    op.drop_column("material_database", "sales_org")
    op.drop_column("material_database", "valuation_group")
