"""add video progress tables

Revision ID: 016_add_video_progress
Revises: 015_add_updated_at
Create Date: 2026-02-01 16:07:16

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSON


# revision identifiers, used by Alembic.
revision = '016_add_video_progress'
down_revision = '015_add_updated_at'
branch_labels = None
depends_on = None


def upgrade():
    """Create video_progress, mid_video_quizzes, and mid_video_quiz_attempts tables."""

    # Create video_progress table
    op.create_table(
        'video_progress',
        sa.Column('id', sa.String(255), primary_key=True),
        sa.Column('user_email', sa.String(255), sa.ForeignKey('users.email'), nullable=False),
        sa.Column('node_id', sa.String(255), nullable=False),
        sa.Column('video_watched_percent', sa.Float(), default=0.0),
        sa.Column('video_duration_seconds', sa.Float(), default=0.0),
        sa.Column('video_position_seconds', sa.Float(), default=0.0),
        sa.Column('max_position_reached', sa.Float(), default=0.0),
        sa.Column('mid_quizzes_passed', sa.Integer(), default=0),
        sa.Column('mid_quizzes_total', sa.Integer(), default=0),
        sa.Column('mid_quizzes_completed', JSON, default=list),
        sa.Column('end_quiz_score', sa.Float(), default=0.0),
        sa.Column('end_quiz_passed', sa.Boolean(), default=False),
        sa.Column('end_quiz_attempts', sa.Integer(), default=0),
        sa.Column('completed', sa.Boolean(), default=False),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False)
    )

    # Create indexes for video_progress
    op.create_index('idx_video_progress_user_node', 'video_progress', ['user_email', 'node_id'], unique=True)
    op.create_index('idx_video_progress_user', 'video_progress', ['user_email'])
    op.create_index('idx_video_progress_node', 'video_progress', ['node_id'])
    op.create_index('idx_video_progress_completed', 'video_progress', ['completed'])

    # Create mid_video_quizzes table
    op.create_table(
        'mid_video_quizzes',
        sa.Column('id', sa.String(255), primary_key=True),
        sa.Column('node_id', sa.String(255), nullable=False),
        sa.Column('trigger_time_seconds', sa.Float(), nullable=False),
        sa.Column('questions', JSON, nullable=False),
        sa.Column('generated_from_transcript', sa.String(5000), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False)
    )

    # Create indexes for mid_video_quizzes
    op.create_index('idx_mid_quiz_node', 'mid_video_quizzes', ['node_id'])
    op.create_index('idx_mid_quiz_trigger', 'mid_video_quizzes', ['node_id', 'trigger_time_seconds'])

    # Create mid_video_quiz_attempts table
    op.create_table(
        'mid_video_quiz_attempts',
        sa.Column('id', sa.String(255), primary_key=True),
        sa.Column('user_email', sa.String(255), sa.ForeignKey('users.email'), nullable=False),
        sa.Column('node_id', sa.String(255), nullable=False),
        sa.Column('quiz_id', sa.String(255), sa.ForeignKey('mid_video_quizzes.id'), nullable=False),
        sa.Column('trigger_time_seconds', sa.Float(), nullable=False),
        sa.Column('score', sa.Integer(), nullable=False),
        sa.Column('total', sa.Integer(), nullable=False),
        sa.Column('score_percent', sa.Float(), nullable=False),
        sa.Column('passed', sa.Boolean(), nullable=False),
        sa.Column('answers', JSON, nullable=True),
        sa.Column('attempted_at', sa.DateTime(), nullable=False)
    )

    # Create indexes for mid_video_quiz_attempts
    op.create_index('idx_mid_attempt_user', 'mid_video_quiz_attempts', ['user_email'])
    op.create_index('idx_mid_attempt_quiz', 'mid_video_quiz_attempts', ['quiz_id'])
    op.create_index('idx_mid_attempt_user_node', 'mid_video_quiz_attempts', ['user_email', 'node_id'])


def downgrade():
    """Drop video progress tables."""
    op.drop_table('mid_video_quiz_attempts')
    op.drop_table('mid_video_quizzes')
    op.drop_table('video_progress')
