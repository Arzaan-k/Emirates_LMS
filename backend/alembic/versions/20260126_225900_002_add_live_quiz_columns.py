"""Add missing columns to live_quizzes table

Revision ID: 002
Revises: 001
Create Date: 2026-01-26 22:59:00

This migration adds columns that exist in the LiveQuiz model but are missing
from the live_quizzes database table.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '002'
down_revision: Union[str, None] = '001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def column_exists(table_name: str, column_name: str) -> bool:
    """Check if a column exists in a table."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = [col['name'] for col in inspector.get_columns(table_name)]
    return column_name in columns


def upgrade() -> None:
    """Add missing columns to live_quizzes table."""
    
    # live_quizzes table
    if not column_exists('live_quizzes', 'description'):
        op.add_column('live_quizzes', sa.Column('description', sa.Text, nullable=True))
    
    if not column_exists('live_quizzes', 'time_limit_minutes'):
        op.add_column('live_quizzes', sa.Column('time_limit_minutes', sa.Integer, nullable=True))
    
    if not column_exists('live_quizzes', 'updated_at'):
        op.add_column('live_quizzes', sa.Column('updated_at', sa.DateTime, nullable=True))
    
    if not column_exists('live_quizzes', 'start_time'):
        op.add_column('live_quizzes', sa.Column('start_time', sa.DateTime, nullable=True))
    
    if not column_exists('live_quizzes', 'end_time'):
        op.add_column('live_quizzes', sa.Column('end_time', sa.DateTime, nullable=True))
    
    if not column_exists('live_quizzes', 'participants'):
        op.add_column('live_quizzes', sa.Column('participants', sa.JSON, nullable=True))
    
    if not column_exists('live_quizzes', 'leaderboard'):
        op.add_column('live_quizzes', sa.Column('leaderboard', sa.JSON, nullable=True))
    
    if not column_exists('live_quizzes', 'status'):
        op.add_column('live_quizzes', sa.Column('status', sa.String(50), nullable=True, server_default="'draft'"))


def downgrade() -> None:
    """Remove the added columns."""
    op.drop_column('live_quizzes', 'status')
    op.drop_column('live_quizzes', 'leaderboard')
    op.drop_column('live_quizzes', 'participants')
    op.drop_column('live_quizzes', 'end_time')
    op.drop_column('live_quizzes', 'start_time')
    op.drop_column('live_quizzes', 'updated_at')
    op.drop_column('live_quizzes', 'time_limit_minutes')
    op.drop_column('live_quizzes', 'description')
