"""Add updated_at column to meetings and other tables

Revision ID: 003
Revises: 002
Create Date: 2026-01-26 23:00:00

This migration adds the updated_at column to tables that are missing it.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '003'
down_revision: Union[str, None] = '002'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def column_exists(table_name: str, column_name: str) -> bool:
    """Check if a column exists in a table."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = [col['name'] for col in inspector.get_columns(table_name)]
    return column_name in columns


def upgrade() -> None:
    """Add missing updated_at columns."""
    
    # meetings table
    if not column_exists('meetings', 'updated_at'):
        op.add_column('meetings', sa.Column('updated_at', sa.DateTime, nullable=True))


def downgrade() -> None:
    """Remove the added columns."""
    op.drop_column('meetings', 'updated_at')
