"""add attempt_number to assessment_submissions

Revision ID: 012
Revises: 011_add_started_at
Create Date: 2026-01-29 02:06:00

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '012_add_attempt_number'
down_revision = '011_add_started_at'
branch_labels = None
depends_on = None


def upgrade():
    """Add attempt_number column to assessment_submissions table."""
    # Add attempt_number column with default value of 1
    op.add_column(
        'assessment_submissions',
        sa.Column('attempt_number', sa.Integer(), nullable=True, server_default='1')
    )


def downgrade():
    """Remove attempt_number column from assessment_submissions table."""
    op.drop_column('assessment_submissions', 'attempt_number')
