"""Add missing columns to location_tracking table

Revision ID: 007
Revises: 006
Create Date: 2026-01-27 00:15:00

This migration adds missing columns to the location_tracking table.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '007'
down_revision: Union[str, None] = '006'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def column_exists(table_name: str, column_name: str) -> bool:
    """Check if a column exists in a table."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = [col['name'] for col in inspector.get_columns(table_name)]
    return column_name in columns


def upgrade() -> None:
    """Add missing columns to location_tracking table."""
    
    # location_tracking table
    if not column_exists('location_tracking', 'altitude'):
        op.add_column('location_tracking', sa.Column('altitude', sa.Float, nullable=True))
    
    if not column_exists('location_tracking', 'speed'):
        op.add_column('location_tracking', sa.Column('speed', sa.Float, nullable=True))
    
    if not column_exists('location_tracking', 'heading'):
        op.add_column('location_tracking', sa.Column('heading', sa.Float, nullable=True))
    
    if not column_exists('location_tracking', 'battery_level'):
        op.add_column('location_tracking', sa.Column('battery_level', sa.Integer, nullable=True))
    
    if not column_exists('location_tracking', 'store'):
        op.add_column('location_tracking', sa.Column('store', sa.String(255), nullable=True))


def downgrade() -> None:
    """Remove the added columns."""
    op.drop_column('location_tracking', 'store')
    op.drop_column('location_tracking', 'battery_level')
    op.drop_column('location_tracking', 'heading')
    op.drop_column('location_tracking', 'speed')
    op.drop_column('location_tracking', 'altitude')
