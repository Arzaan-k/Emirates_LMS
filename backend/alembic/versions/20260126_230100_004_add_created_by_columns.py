"""Add created_by column to notifications table

Revision ID: 004
Revises: 003
Create Date: 2026-01-26 23:01:00

This migration adds the created_by column to notifications table.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '004'
down_revision: Union[str, None] = '003'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def column_exists(table_name: str, column_name: str) -> bool:
    """Check if a column exists in a table."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = [col['name'] for col in inspector.get_columns(table_name)]
    return column_name in columns


def upgrade() -> None:
    """Add missing created_by column."""
    
    # notifications table
    if not column_exists('notifications', 'created_by'):
        op.add_column('notifications', sa.Column('created_by', sa.String(255), nullable=True))


def downgrade() -> None:
    """Remove the added columns."""
    op.drop_column('notifications', 'created_by')
