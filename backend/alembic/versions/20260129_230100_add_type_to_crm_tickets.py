"""add type column to crm_tickets

Revision ID: 013_add_type_to_crm
Revises: 012_add_attempt_number
Create Date: 2026-01-29 23:01:00

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '013_add_type_to_crm'
down_revision = '012_add_attempt_number'
branch_labels = None
depends_on = None


def upgrade():
    """Add type column to crm_tickets table for support ticket categorization."""
    # Add type column with default value
    op.add_column(
        'crm_tickets',
        sa.Column('type', sa.String(100), nullable=True)
    )

    # Update existing records to have a default type
    op.execute("UPDATE crm_tickets SET type = 'Query' WHERE type IS NULL")


def downgrade():
    """Remove type column from crm_tickets table."""
    op.drop_column('crm_tickets', 'type')
