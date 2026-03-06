"""create measurement_units table

Revision ID: create_measurement_units
Revises: add_max_desc_len
Create Date: 2026-03-03

Creates measurement_units table for units of measure (MM, KG, etc.)
used in numeric PDM attributes.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "create_measurement_units"
down_revision: Union[str, Sequence[str], None] = "add_max_desc_len"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "measurement_units",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(50), nullable=False),
        sa.Column("abbreviation", sa.String(10), nullable=False),
        sa.Column("category", sa.String(30), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
    )
    op.execute("""
        INSERT INTO measurement_units (name, abbreviation, category) VALUES
        ('Milímetro', 'MM', 'Comprimento'),
        ('Centímetro', 'CM', 'Comprimento'),
        ('Metro', 'M', 'Comprimento'),
        ('Quilômetro', 'KM', 'Comprimento'),
        ('Polegada', 'POL', 'Comprimento'),
        ('Grama', 'G', 'Massa'),
        ('Quilograma', 'KG', 'Massa'),
        ('Tonelada', 'T', 'Massa'),
        ('Mililitro', 'ML', 'Volume'),
        ('Litro', 'L', 'Volume'),
        ('Metro Cúbico', 'M3', 'Volume'),
        ('Pascal', 'PA', 'Pressão'),
        ('Bar', 'BAR', 'Pressão'),
        ('PSI', 'PSI', 'Pressão'),
        ('Grau Celsius', 'C', 'Temperatura'),
        ('Ampere', 'A', 'Elétrico'),
        ('Volt', 'V', 'Elétrico'),
        ('Watt', 'W', 'Elétrico'),
        ('RPM', 'RPM', 'Rotação'),
        ('Hertz', 'HZ', 'Frequência'),
        ('Newton', 'N', 'Força'),
        ('Newton Metro', 'NM', 'Torque'),
        ('Percentual', '%', 'Geral'),
        ('Unidade', 'UN', 'Geral')
    """)


def downgrade() -> None:
    op.drop_table("measurement_units")
