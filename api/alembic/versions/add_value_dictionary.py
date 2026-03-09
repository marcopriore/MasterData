"""add value_dictionary table

Revision ID: add_value_dict
Revises: widen_new_admin
Create Date: 2026-03-03

Creates value_dictionary for centralizing LOV values with RLS.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "add_value_dict"
down_revision: Union[str, Sequence[str], None] = "widen_new_admin"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "value_dictionary",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("value", sa.String(200), nullable=False),
        sa.Column("abbreviation", sa.String(50), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_value_dictionary_tenant_value",
        "value_dictionary",
        ["tenant_id", "value"],
        unique=True,
    )
    op.execute("ALTER TABLE value_dictionary ENABLE ROW LEVEL SECURITY")
    op.execute("""
        CREATE POLICY tenant_isolation ON value_dictionary
        FOR ALL
        USING (tenant_id = current_setting('app.tenant_id', true)::integer)
    """)
    op.execute("""
        CREATE POLICY master_bypass ON value_dictionary
        FOR ALL
        USING (current_setting('app.is_master', true) = 'true')
    """)


def downgrade() -> None:
    op.drop_table("value_dictionary")
