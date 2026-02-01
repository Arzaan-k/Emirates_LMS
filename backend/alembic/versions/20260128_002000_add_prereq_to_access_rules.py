"""add prerequisites to access rules

Revision ID: 009
Revises: 008_fix_levels_timestamps
Create Date: 2026-01-28 00:20:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '009_add_prereq_to_access_rules'
down_revision = '008_fix_levels_timestamps'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add prerequisites column to access_rules table
    op.add_column('access_rules', sa.Column('prerequisites', sa.JSON(), server_default='[]', nullable=True))


def downgrade() -> None:
    # Remove column
    op.drop_column('access_rules', 'prerequisites')
