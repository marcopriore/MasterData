"""add indexes and CASCADE on request_values

Revision ID: add_indexes_and_cascade
Revises: add_request_attachments
Create Date: 2026-03-02

Adds:
  - index on material_requests.status
  - index on material_requests.pdm_id
  - index on request_values.attribute_id
  - ondelete='CASCADE' on request_values.request_id FK
"""
from typing import Sequence, Union

from alembic import op

revision: str = "add_indexes_and_cascade"
down_revision: Union[str, None] = "add_request_attachments"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        "ix_material_requests_status",
        "material_requests",
        ["status"],
    )
    op.create_index(
        "ix_material_requests_pdm_id",
        "material_requests",
        ["pdm_id"],
    )
    op.create_index(
        "ix_request_values_attribute_id",
        "request_values",
        ["attribute_id"],
    )
    # Add ondelete='CASCADE' to request_values.request_id FK.
    # Drop existing constraint and recreate with CASCADE.
    op.drop_constraint(
        "request_values_request_id_fkey",
        "request_values",
        type_="foreignkey",
    )
    op.create_foreign_key(
        "request_values_request_id_fkey",
        "request_values",
        "material_requests",
        ["request_id"],
        ["id"],
        ondelete="CASCADE",
    )


def downgrade() -> None:
    op.drop_constraint(
        "request_values_request_id_fkey",
        "request_values",
        type_="foreignkey",
    )
    op.create_foreign_key(
        "request_values_request_id_fkey",
        "request_values",
        "material_requests",
        ["request_id"],
        ["id"],
    )
    op.drop_index("ix_request_values_attribute_id", table_name="request_values")
    op.drop_index("ix_material_requests_pdm_id", table_name="material_requests")
    op.drop_index("ix_material_requests_status", table_name="material_requests")
