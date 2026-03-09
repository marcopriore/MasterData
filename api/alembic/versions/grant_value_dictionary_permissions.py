"""grant value_dictionary permissions to mdm_app

Revision ID: grant_val_dict_perm
Revises: add_value_dict
Create Date: 2026-03-03

Grants SELECT, INSERT, UPDATE, DELETE on value_dictionary to mdm_app.
"""
from typing import Sequence, Union

from alembic import op

revision: str = "grant_val_dict_perm"
down_revision: Union[str, Sequence[str], None] = "add_value_dict"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE value_dictionary TO mdm_app")
    op.execute("GRANT USAGE, SELECT ON SEQUENCE value_dictionary_id_seq TO mdm_app")


def downgrade() -> None:
    op.execute("REVOKE ALL ON TABLE value_dictionary FROM mdm_app")
    op.execute("REVOKE ALL ON SEQUENCE value_dictionary_id_seq FROM mdm_app")
