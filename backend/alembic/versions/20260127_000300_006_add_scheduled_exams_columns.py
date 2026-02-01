"""Add missing columns to scheduled_exams table

Revision ID: 006
Revises: 005
Create Date: 2026-01-27 00:03:00

This migration adds missing columns to the scheduled_exams table.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '006'
down_revision: Union[str, None] = '005'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def column_exists(table_name: str, column_name: str) -> bool:
    """Check if a column exists in a table."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = [col['name'] for col in inspector.get_columns(table_name)]
    return column_name in columns


def upgrade() -> None:
    """Add missing columns to scheduled_exams table."""
    
    # scheduled_exams table
    if not column_exists('scheduled_exams', 'exam_datetime'):
        op.add_column('scheduled_exams', sa.Column('exam_datetime', sa.DateTime, nullable=True))
    
    if not column_exists('scheduled_exams', 'updated_at'):
        op.add_column('scheduled_exams', sa.Column('updated_at', sa.DateTime, nullable=True))


def downgrade() -> None:
    """Remove the added columns."""
    op.drop_column('scheduled_exams', 'updated_at')
    op.drop_column('scheduled_exams', 'exam_datetime')
