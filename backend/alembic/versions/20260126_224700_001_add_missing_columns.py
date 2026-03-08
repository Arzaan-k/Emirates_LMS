"""Add missing columns to existing tables

Revision ID: 001
Revises: 
Create Date: 2026-01-26 22:47:00

This migration adds columns that exist in SQLAlchemy models but are missing
from the database tables. These columns were added to models after the initial
table creation.

Missing columns identified from error logs:
- news_feed.summary
- quizzes.category
- proctored_assessments.instructions
- meetings.end_time
- notifications.expires_at
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '001'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def column_exists(table_name: str, column_name: str) -> bool:
    """Check if a column exists in a table."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    try:
        columns = [col['name'] for col in inspector.get_columns(table_name)]
        return column_name in columns
    except sa.exc.NoSuchTableError:
        return False


def upgrade() -> None:
    """Add missing columns to existing tables."""
    
    # ==========================================
    # news_feed table
    # ==========================================
    if not column_exists('news_feed', 'summary'):
        op.add_column('news_feed', sa.Column('summary', sa.String(500), nullable=True))
    
    if not column_exists('news_feed', 'author_email'):
        op.add_column('news_feed', sa.Column('author_email', sa.String(255), nullable=True))
    
    if not column_exists('news_feed', 'images'):
        op.add_column('news_feed', sa.Column('images', sa.JSON, nullable=True))
    
    if not column_exists('news_feed', 'category'):
        op.add_column('news_feed', sa.Column('category', sa.String(100), nullable=True))
    
    if not column_exists('news_feed', 'tags'):
        op.add_column('news_feed', sa.Column('tags', sa.JSON, nullable=True))
    
    if not column_exists('news_feed', 'view_count'):
        op.add_column('news_feed', sa.Column('view_count', sa.Integer, nullable=True, server_default='0'))
    
    # ==========================================
    # quizzes table
    # ==========================================
    if not column_exists('quizzes', 'category'):
        op.add_column('quizzes', sa.Column('category', sa.String(255), nullable=True))
    
    if not column_exists('quizzes', 'time_limit_minutes'):
        op.add_column('quizzes', sa.Column('time_limit_minutes', sa.Integer, nullable=True))
    
    if not column_exists('quizzes', 'source'):
        op.add_column('quizzes', sa.Column('source', sa.String(100), nullable=True))
    
    if not column_exists('quizzes', 'tags'):
        op.add_column('quizzes', sa.Column('tags', sa.JSON, nullable=True))
    
    if not column_exists('quizzes', 'passing_score'):
        op.add_column('quizzes', sa.Column('passing_score', sa.Integer, nullable=True, server_default='70'))
    
    # ==========================================
    # proctored_assessments table
    # ==========================================
    if not column_exists('proctored_assessments', 'instructions'):
        op.add_column('proctored_assessments', sa.Column('instructions', sa.Text, nullable=True))
    
    if not column_exists('proctored_assessments', 'total_questions'):
        op.add_column('proctored_assessments', sa.Column('total_questions', sa.Integer, nullable=True))
    
    if not column_exists('proctored_assessments', 'allow_retake'):
        op.add_column('proctored_assessments', sa.Column('allow_retake', sa.Boolean, nullable=True, server_default='true'))
    
    if not column_exists('proctored_assessments', 'max_attempts'):
        op.add_column('proctored_assessments', sa.Column('max_attempts', sa.Integer, nullable=True, server_default='3'))
    
    if not column_exists('proctored_assessments', 'shuffle_questions'):
        op.add_column('proctored_assessments', sa.Column('shuffle_questions', sa.Boolean, nullable=True, server_default='false'))
    
    if not column_exists('proctored_assessments', 'show_results'):
        op.add_column('proctored_assessments', sa.Column('show_results', sa.Boolean, nullable=True, server_default='true'))
    
    # ==========================================
    # meetings table
    # ==========================================
    if not column_exists('meetings', 'end_time'):
        op.add_column('meetings', sa.Column('end_time', sa.DateTime, nullable=True))
    
    if not column_exists('meetings', 'max_participants'):
        op.add_column('meetings', sa.Column('max_participants', sa.Integer, nullable=True, server_default='100'))
    
    if not column_exists('meetings', 'is_recurring'):
        op.add_column('meetings', sa.Column('is_recurring', sa.Boolean, nullable=True, server_default='false'))
    
    if not column_exists('meetings', 'recurrence_pattern'):
        op.add_column('meetings', sa.Column('recurrence_pattern', sa.String(100), nullable=True))
    
    if not column_exists('meetings', 'recording_url'):
        op.add_column('meetings', sa.Column('recording_url', sa.String(1000), nullable=True))
    
    if not column_exists('meetings', 'agenda'):
        op.add_column('meetings', sa.Column('agenda', sa.JSON, nullable=True))
    
    if not column_exists('meetings', 'notes'):
        op.add_column('meetings', sa.Column('notes', sa.Text, nullable=True))
    
    if not column_exists('meetings', 'attachments'):
        op.add_column('meetings', sa.Column('attachments', sa.JSON, nullable=True))
    
    # ==========================================
    # notifications table
    # ==========================================
    if not column_exists('notifications', 'expires_at'):
        op.add_column('notifications', sa.Column('expires_at', sa.DateTime, nullable=True))
    
    if not column_exists('notifications', 'priority'):
        op.add_column('notifications', sa.Column('priority', sa.String(50), nullable=True, server_default="'normal'"))
    
    if not column_exists('notifications', 'action_url'):
        op.add_column('notifications', sa.Column('action_url', sa.String(1000), nullable=True))
    
    if not column_exists('notifications', 'action_type'):
        op.add_column('notifications', sa.Column('action_type', sa.String(100), nullable=True))
    
    if not column_exists('notifications', 'extra_data'):
        op.add_column('notifications', sa.Column('extra_data', sa.JSON, nullable=True))


def downgrade() -> None:
    """Remove the added columns."""
    
    # notifications
    op.drop_column('notifications', 'extra_data')
    op.drop_column('notifications', 'action_type')
    op.drop_column('notifications', 'action_url')
    op.drop_column('notifications', 'priority')
    op.drop_column('notifications', 'expires_at')
    
    # meetings
    op.drop_column('meetings', 'attachments')
    op.drop_column('meetings', 'notes')
    op.drop_column('meetings', 'agenda')
    op.drop_column('meetings', 'recording_url')
    op.drop_column('meetings', 'recurrence_pattern')
    op.drop_column('meetings', 'is_recurring')
    op.drop_column('meetings', 'max_participants')
    op.drop_column('meetings', 'end_time')
    
    # proctored_assessments
    op.drop_column('proctored_assessments', 'show_results')
    op.drop_column('proctored_assessments', 'shuffle_questions')
    op.drop_column('proctored_assessments', 'max_attempts')
    op.drop_column('proctored_assessments', 'allow_retake')
    op.drop_column('proctored_assessments', 'total_questions')
    op.drop_column('proctored_assessments', 'instructions')
    
    # quizzes
    op.drop_column('quizzes', 'passing_score')
    op.drop_column('quizzes', 'tags')
    op.drop_column('quizzes', 'source')
    op.drop_column('quizzes', 'time_limit_minutes')
    op.drop_column('quizzes', 'category')
    
    # news_feed
    op.drop_column('news_feed', 'view_count')
    op.drop_column('news_feed', 'tags')
    op.drop_column('news_feed', 'category')
    op.drop_column('news_feed', 'images')
    op.drop_column('news_feed', 'author_email')
    op.drop_column('news_feed', 'summary')
