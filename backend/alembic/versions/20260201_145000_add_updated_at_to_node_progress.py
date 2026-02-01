"""add updated_at to user_node_progress

Revision ID: 015_add_updated_at
Revises: 014_add_last_position
Create Date: 2026-02-01 14:50:00

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '015_add_updated_at'
down_revision = '014_add_last_position'
branch_labels = None
depends_on = None


def upgrade():
    """Add updated_at column to user_node_progress table."""
    op.add_column(
        'user_node_progress',
        sa.Column('updated_at', sa.DateTime(), nullable=True)
    )


def downgrade():
    """Remove updated_at column from user_node_progress table."""
    op.drop_column('user_node_progress', 'updated_at')
