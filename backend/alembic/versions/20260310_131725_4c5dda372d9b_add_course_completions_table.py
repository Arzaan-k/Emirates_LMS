"""add_course_completions_table

Revision ID: 4c5dda372d9b
Revises: 20260226_000000
Create Date: 2026-03-10 13:17:25.499839

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4c5dda372d9b'
down_revision: Union[str, None] = '20260226_000000'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def table_exists(table_name: str) -> bool:
    """Check if a table exists in the database."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return table_name in inspector.get_table_names()


def upgrade() -> None:
    """Create course_completions table if it doesn't exist."""

    # Only create table if it doesn't exist
    if not table_exists('course_completions'):
        op.create_table(
            'course_completions',
            sa.Column('id', sa.String(255), primary_key=True),
            sa.Column('user_email', sa.String(255), sa.ForeignKey('users.email'), nullable=False),
            sa.Column('course_id', sa.String(255), nullable=False),
            sa.Column('course_title', sa.String(500), nullable=True),
            sa.Column('bucket', sa.String(255), nullable=True),
            sa.Column('learning_path_type', sa.String(100), nullable=True),
            sa.Column('score', sa.Float, nullable=True),
            sa.Column('score_percent', sa.Float, nullable=True),
            sa.Column('time_spent_seconds', sa.Integer, nullable=True),
            sa.Column('completed_at', sa.DateTime, server_default=sa.func.now()),
            sa.Column('quiz_answers', sa.JSON, nullable=True),
            sa.Column('quiz_correct', sa.Integer, nullable=True),
            sa.Column('quiz_total', sa.Integer, nullable=True),
            sa.Column('xp_earned', sa.Integer, server_default='0'),
            sa.Column('certificate_url', sa.String(1000), nullable=True),
            sa.Column('certificate_issued', sa.Boolean, server_default='false'),
        )

        # Create indexes for course_completions
        op.create_index('idx_course_completion_user', 'course_completions', ['user_email'])
        op.create_index('idx_course_completion_course', 'course_completions', ['course_id'])
        op.create_index('idx_course_completion_date', 'course_completions', ['completed_at'])
        op.create_index('idx_course_completion_bucket', 'course_completions', ['bucket'])
        op.create_index('idx_course_completion_path', 'course_completions', ['learning_path_type'])


def downgrade() -> None:
    """Drop course_completions table."""

    if table_exists('course_completions'):
        # Drop indexes first
        op.drop_index('idx_course_completion_path', table_name='course_completions')
        op.drop_index('idx_course_completion_bucket', table_name='course_completions')
        op.drop_index('idx_course_completion_date', table_name='course_completions')
        op.drop_index('idx_course_completion_course', table_name='course_completions')
        op.drop_index('idx_course_completion_user', table_name='course_completions')

        # Drop table
        op.drop_table('course_completions')
