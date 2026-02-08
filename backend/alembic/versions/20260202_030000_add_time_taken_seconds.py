"""Add time_taken_seconds column to quiz_submissions

Revision ID: 20260202_030000
Revises: 
Create Date: 2026-02-02 03:00:00

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '20260202_030000'
down_revision = '016_add_video_progress'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add time_taken_seconds to quiz_submissions if it doesn't exist
    connection = op.get_bind()
    inspector = sa.inspect(connection)
    
    # Check quiz_submissions table
    if 'quiz_submissions' in inspector.get_table_names():
        columns = [col['name'] for col in inspector.get_columns('quiz_submissions')]
        if 'time_taken_seconds' not in columns:
            op.add_column('quiz_submissions', sa.Column('time_taken_seconds', sa.Integer(), nullable=True))
    
    # Check assessment_submissions table as well
    if 'assessment_submissions' in inspector.get_table_names():
        columns = [col['name'] for col in inspector.get_columns('assessment_submissions')]
        if 'time_taken_seconds' not in columns:
            op.add_column('assessment_submissions', sa.Column('time_taken_seconds', sa.Integer(), nullable=True))


def downgrade() -> None:
    # Remove the columns if needed
    op.drop_column('quiz_submissions', 'time_taken_seconds')
    op.drop_column('assessment_submissions', 'time_taken_seconds')
