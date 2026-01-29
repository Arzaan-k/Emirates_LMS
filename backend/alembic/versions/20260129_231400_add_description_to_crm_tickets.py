"""add description to crm_tickets

Revision ID: 20260129_231400
Revises: 20260129_230800
Create Date: 2026-01-29 23:14:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text

# revision identifiers, used by Alembic.
revision = '20260129_231400'
down_revision = '20260129_230800'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_columns = {c['name'] for c in inspector.get_columns('crm_tickets')}

    with op.batch_alter_table('crm_tickets', schema=None) as batch_op:
        if 'description' not in existing_columns:
            batch_op.add_column(sa.Column('description', sa.Text(), nullable=True))
    
    # Copy data from 'message' to 'description' if 'message' exists
    if 'message' in existing_columns:
        op.execute(text("UPDATE crm_tickets SET description = message WHERE description IS NULL"))
        # Optionally make description non-nullable now if data migration succeeded?
        # Model says nullable=False.
        # But for migration safety on existing bad data, we keep nullable=True or set default.
        # We'll leave it nullable=True in DB to avoid crash, but Model enforces constraints.


def downgrade():
    with op.batch_alter_table('crm_tickets', schema=None) as batch_op:
        batch_op.drop_column('description')
