"""add learning_path_type to course_buckets

Revision ID: 20260207_170000
Revises: 20260202_030000
Create Date: 2026-02-07

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '20260207_170000'
down_revision = '20260202_030000'
branch_labels = None
depends_on = None


def upgrade():
    # Add learning_path_type column to course_buckets table
    op.add_column('course_buckets', sa.Column('learning_path_type', sa.String(100), nullable=True, server_default='career_progression'))
    
    # Create index for the new column
    op.create_index('idx_bucket_learning_path', 'course_buckets', ['learning_path_type'])


def downgrade():
    # Remove the index
    op.drop_index('idx_bucket_learning_path', table_name='course_buckets')
    
    # Remove the column
    op.drop_column('course_buckets', 'learning_path_type')
