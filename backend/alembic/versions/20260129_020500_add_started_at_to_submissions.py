"""add started_at to assessment_submissions

Revision ID: 011
Revises: 010_create_audit_submissions
Create Date: 2026-01-29 02:05:00

"""
from alembic import op
import sqlalchemy as sa
from datetime import datetime


# revision identifiers, used by Alembic.
revision = '011_add_started_at'
down_revision = '010_create_audit_submissions'
branch_labels = None
depends_on = None


def upgrade():
    """Add started_at column to assessment_submissions table."""
    # Add started_at column (nullable, as existing records won't have this value)
    op.add_column(
        'assessment_submissions',
        sa.Column('started_at', sa.DateTime(), nullable=True)
    )


def downgrade():
    """Remove started_at column from assessment_submissions table."""
    op.drop_column('assessment_submissions', 'started_at')
