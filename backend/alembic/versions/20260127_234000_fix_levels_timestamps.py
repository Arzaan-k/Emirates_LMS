"""fix levels timestamps

Revision ID: 008
Revises: d99505314edd
Create Date: 2026-01-27 23:40:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '008_fix_levels_timestamps'
down_revision = 'd99505314edd'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add updated_at column to progression_levels table
    # We use server_default=sa.func.now() to populate existing rows with current time
    op.add_column('progression_levels', sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), nullable=True))


def downgrade() -> None:
    # Remove columns
    op.drop_column('progression_levels', 'updated_at')
