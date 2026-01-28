"""create audit submissions table

Revision ID: 010
Revises: 009_add_prereq_to_access_rules
Create Date: 2026-01-28 21:05:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '010_create_audit_submissions'
down_revision = '009_add_prereq_to_access_rules'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create audit_submissions table
    op.create_table(
        'audit_submissions',
        sa.Column('id', sa.String(length=255), nullable=False),
        sa.Column('user_email', sa.String(length=255), nullable=False),
        sa.Column('user_name', sa.String(length=255), nullable=True),
        sa.Column('store', sa.String(length=255), nullable=True),
        sa.Column('category', sa.String(length=100), nullable=True),
        sa.Column('checklist_items', sa.JSON(), nullable=True),
        sa.Column('checked_items', sa.JSON(), nullable=True),
        sa.Column('completion_rate', sa.Integer(), nullable=True),
        sa.Column('submitted_at', sa.DateTime(), nullable=True),
        sa.Column('status', sa.String(length=50), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Create indexes
    op.create_index('idx_audit_sub_user', 'audit_submissions', ['user_email'], unique=False)
    op.create_index('idx_audit_sub_store', 'audit_submissions', ['store'], unique=False)
    op.create_index('idx_audit_sub_category', 'audit_submissions', ['category'], unique=False)
    op.create_index('idx_audit_sub_submitted', 'audit_submissions', ['submitted_at'], unique=False)


def downgrade() -> None:
    # Drop table
    op.drop_index('idx_audit_sub_submitted', table_name='audit_submissions')
    op.drop_index('idx_audit_sub_category', table_name='audit_submissions')
    op.drop_index('idx_audit_sub_store', table_name='audit_submissions')
    op.drop_index('idx_audit_sub_user', table_name='audit_submissions')
    op.drop_table('audit_submissions')
