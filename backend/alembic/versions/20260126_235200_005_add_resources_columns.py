"""Add missing columns to resources table

Revision ID: 005
Revises: 004
Create Date: 2026-01-26 23:52:00

This migration adds missing columns to the resources table.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '005'
down_revision: Union[str, None] = '004'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def column_exists(table_name: str, column_name: str) -> bool:
    """Check if a column exists in a table."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = [col['name'] for col in inspector.get_columns(table_name)]
    return column_name in columns


def upgrade() -> None:
    """Add missing columns to resources table."""
    
    # resources table
    if not column_exists('resources', 'updated_at'):
        op.add_column('resources', sa.Column('updated_at', sa.DateTime, nullable=True))
    
    if not column_exists('resources', 'download_count'):
        op.add_column('resources', sa.Column('download_count', sa.Integer, nullable=True, server_default='0'))
    
    if not column_exists('resources', 'is_active'):
        op.add_column('resources', sa.Column('is_active', sa.Boolean, nullable=True, server_default='true'))


def downgrade() -> None:
    """Remove the added columns."""
    op.drop_column('resources', 'is_active')
    op.drop_column('resources', 'download_count')
    op.drop_column('resources', 'updated_at')
