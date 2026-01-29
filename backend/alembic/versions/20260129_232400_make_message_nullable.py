"""make message nullable in crm_tickets

Revision ID: 20260129_232400
Revises: 20260129_231400
Create Date: 2026-01-29 23:24:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '20260129_232400'
down_revision = '20260129_231400'
branch_labels = None
depends_on = None


def upgrade():
    # Make 'message' column nullable
    # Using execute since alter_column syntax varies and raw SQL is explicit for Postgres
    # But alter_column is standard alembic
    with op.batch_alter_table('crm_tickets', schema=None) as batch_op:
        batch_op.alter_column('message', nullable=True, existing_type=sa.Text())


def downgrade():
    with op.batch_alter_table('crm_tickets', schema=None) as batch_op:
        batch_op.alter_column('message', nullable=False, existing_type=sa.Text())
