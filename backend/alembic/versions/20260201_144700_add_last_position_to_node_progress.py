"""add last_position to user_node_progress

Revision ID: 014_add_last_position
Revises: 013_add_type_to_crm
Create Date: 2026-02-01 14:47:00

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '014_add_last_position'
down_revision = '009_merge_heads'
branch_labels = None
depends_on = None


def upgrade():
    """Add last_position column to user_node_progress table for video progress tracking."""
    op.add_column(
        'user_node_progress',
        sa.Column('last_position', sa.Float(), nullable=True, server_default='0')
    )


def downgrade():
    """Remove last_position column from user_node_progress table."""
    op.drop_column('user_node_progress', 'last_position')
