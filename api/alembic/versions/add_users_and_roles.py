"""add roles, users tables and user_id on material_requests

Revision ID: add_users_and_roles
Revises: add_request_extended_fields
Create Date: 2026-02-27

Creates:
  - roles    (id, name, permissions JSONB)
  - users    (id, name, email, hashed_password, is_active, role_id FK, preferences JSONB, created_at)
  - material_requests.user_id  (nullable FK → users.id  ON DELETE SET NULL)
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "add_users_and_roles"
down_revision: Union[str, Sequence[str], None] = "add_request_extended_fields"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── roles ──────────────────────────────────────────────────────────────────
    op.create_table(
        "roles",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(length=50), nullable=False),
        sa.Column(
            "permissions",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="{}",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name", name="uq_roles_name"),
    )

    # ── users ──────────────────────────────────────────────────────────────────
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("email", sa.String(length=254), nullable=False),
        sa.Column("hashed_password", sa.String(length=255), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("role_id", sa.Integer(), nullable=False),
        sa.Column(
            "preferences",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default='{"theme": "light", "language": "pt"}',
        ),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["role_id"], ["roles.id"], name="fk_users_role_id", ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email", name="uq_users_email"),
    )

    # ── material_requests.user_id ──────────────────────────────────────────────
    op.add_column(
        "material_requests",
        sa.Column("user_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_material_requests_user_id",
        "material_requests",
        "users",
        ["user_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_material_requests_user_id", "material_requests", type_="foreignkey"
    )
    op.drop_column("material_requests", "user_id")
    op.drop_table("users")
    op.drop_table("roles")
