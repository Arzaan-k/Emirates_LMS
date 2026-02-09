"""add certificate_template and assigned_users to content table

Revision ID: 20260210_000100
Revises: 20260207_170000
Create Date: 2026-02-10

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '20260210_000100'
down_revision = '20260207_170000'
branch_labels = None
depends_on = None


def upgrade():
    # Add certificate_template column to content table
    op.add_column('content', sa.Column('certificate_template', sa.String(100), nullable=True, server_default='classic'))

    # Add assigned_users JSON column to content table (per-course user assignment)
    op.add_column('content', sa.Column('assigned_users', sa.JSON(), nullable=True))


def downgrade():
    op.drop_column('content', 'assigned_users')
    op.drop_column('content', 'certificate_template')
