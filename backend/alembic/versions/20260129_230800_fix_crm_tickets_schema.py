"""fix crm tickets schema

Revision ID: 20260129_230800
Revises: 20260129_230100
Create Date: 2026-01-29 23:08:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '20260129_230800'
down_revision = '013_add_type_to_crm'
branch_labels = None
depends_on = None


def upgrade():
    # Robust upgrade: Check existence first
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_columns = {c['name'] for c in inspector.get_columns('crm_tickets')}
    
    with op.batch_alter_table('crm_tickets', schema=None) as batch_op:
        if 'category_id' not in existing_columns:
            batch_op.add_column(sa.Column('category_id', sa.String(length=255), nullable=True))
        if 'category_name' not in existing_columns:
            batch_op.add_column(sa.Column('category_name', sa.String(length=255), nullable=True))
        if 'customer_name' not in existing_columns:
            batch_op.add_column(sa.Column('customer_name', sa.String(length=255), nullable=True))
        if 'customer_email' not in existing_columns:
            batch_op.add_column(sa.Column('customer_email', sa.String(length=255), nullable=True))
        if 'customer_phone' not in existing_columns:
            batch_op.add_column(sa.Column('customer_phone', sa.String(length=100), nullable=True))
        if 'priority' not in existing_columns:
            batch_op.add_column(sa.Column('priority', sa.String(length=50), server_default='medium', nullable=True))
        if 'status' not in existing_columns:
            batch_op.add_column(sa.Column('status', sa.String(length=100), server_default='open', nullable=True))
        if 'created_at' not in existing_columns:
            batch_op.add_column(sa.Column('created_at', sa.DateTime(), nullable=True))
        if 'updated_at' not in existing_columns:
            batch_op.add_column(sa.Column('updated_at', sa.DateTime(), nullable=True))
        if 'assigned_to' not in existing_columns:
            batch_op.add_column(sa.Column('assigned_to', sa.String(length=255), nullable=True))
        if 'assigned_name' not in existing_columns:
            batch_op.add_column(sa.Column('assigned_name', sa.String(length=255), nullable=True))
        if 'resolution' not in existing_columns:
            batch_op.add_column(sa.Column('resolution', sa.Text(), nullable=True))
        if 'resolved_at' not in existing_columns:
            batch_op.add_column(sa.Column('resolved_at', sa.DateTime(), nullable=True))
        if 'resolution_time_hours' not in existing_columns:
            batch_op.add_column(sa.Column('resolution_time_hours', sa.Integer(), nullable=True))
        if 'tags' not in existing_columns:
            batch_op.add_column(sa.Column('tags', sa.JSON(), nullable=True))
        if 'attachments' not in existing_columns:
            batch_op.add_column(sa.Column('attachments', sa.JSON(), nullable=True))
        
        # Add indices (Create index checks existence usually? No. We wrap it or use IF NOT EXISTS logic in postgres manually,
        # but pure sqlalchemy index creation should handle it if using create_index?)
        # op.create_index typically fails if exists.
        # We'll skip index creation in this patch for safety or stick to manual checks if needed.
        # But indices are less critical for immediate crash fix.
        # Let's try to create them, if it fails, the migration fails.
        # Given urgency, let's commenting out indices or use a safer approach?
        # Alembic doesn't expose get_indexes easily on batch_op?
        # inspector.get_indexes('crm_tickets') works.
    
    existing_indexes = {i['name'] for i in inspector.get_indexes('crm_tickets')}
    
    if 'idx_ticket_category' not in existing_indexes:
        op.create_index('idx_ticket_category', 'crm_tickets', ['category_id'], unique=False)
    if 'idx_ticket_priority' not in existing_indexes:
        op.create_index('idx_ticket_priority', 'crm_tickets', ['priority'], unique=False)
    if 'idx_ticket_assigned' not in existing_indexes:
        op.create_index('idx_ticket_assigned', 'crm_tickets', ['assigned_to'], unique=False)
    if 'idx_ticket_created' not in existing_indexes:
        op.create_index('idx_ticket_created', 'crm_tickets', ['created_at'], unique=False)
    if 'idx_ticket_status' not in existing_indexes:
        op.create_index('idx_ticket_status', 'crm_tickets', ['status'], unique=False)


def downgrade():
    with op.batch_alter_table('crm_tickets', schema=None) as batch_op:
        batch_op.drop_index('idx_ticket_status')
        batch_op.drop_index('idx_ticket_created')
        batch_op.drop_index('idx_ticket_assigned')
        batch_op.drop_index('idx_ticket_priority')
        batch_op.drop_index('idx_ticket_category')
        
        batch_op.drop_column('attachments')
        batch_op.drop_column('tags')
        batch_op.drop_column('resolution_time_hours')
        batch_op.drop_column('resolved_at')
        batch_op.drop_column('resolution')
        batch_op.drop_column('assigned_name')
        batch_op.drop_column('assigned_to')
        batch_op.drop_column('updated_at')
        batch_op.drop_column('created_at')
        batch_op.drop_column('status')
        batch_op.drop_column('priority')
        batch_op.drop_column('customer_phone')
        batch_op.drop_column('customer_email')
        batch_op.drop_column('customer_name')
        batch_op.drop_column('category_name')
        batch_op.drop_column('category_id')
