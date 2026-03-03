"""Add access control tables

Revision ID: 20260224_000000
Revises: 20260215_120000
Create Date: 2026-02-24 00:00:00

Creates tables for granular access control:
- organization_hierarchy: Tree structure for States > Regions > Cities > Stores
- user_access_grants: Maps users to what data they can access
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers
revision = '20260224_000000'
down_revision = '20260215_120000'
branch_labels = None
depends_on = None


def table_exists(table_name: str) -> bool:
    """Check if table exists in database."""
    from sqlalchemy import inspect
    bind = op.get_bind()
    inspector = inspect(bind)
    return table_name in inspector.get_table_names()


def upgrade() -> None:
    # ===========================================
    # CREATE organization_hierarchy TABLE
    # ===========================================
    if not table_exists('organization_hierarchy'):
        op.create_table(
            'organization_hierarchy',
            sa.Column('id', sa.String(100), primary_key=True),
            sa.Column('name', sa.String(255), nullable=False),
            sa.Column('type', sa.String(50), nullable=False),
            sa.Column('parent_id', sa.String(100), sa.ForeignKey('organization_hierarchy.id'), nullable=True),
            sa.Column('path', sa.String(1000), nullable=True),
            sa.Column('code', sa.String(50), nullable=True),
            sa.Column('is_active', sa.Boolean(), server_default='true', nullable=True),
            sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=True),
            sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), nullable=True),
            sa.Column('extra_data', sa.JSON(), server_default='{}', nullable=True),
        )

        # Create indexes
        op.create_index('idx_org_type', 'organization_hierarchy', ['type'])
        op.create_index('idx_org_parent', 'organization_hierarchy', ['parent_id'])
        op.create_index('idx_org_path', 'organization_hierarchy', ['path'])
        op.create_index('idx_org_active', 'organization_hierarchy', ['is_active'])
        op.create_index('idx_org_name', 'organization_hierarchy', ['name'])

        print("Created organization_hierarchy table with indexes")
    else:
        print("Table organization_hierarchy already exists, skipping")

    # ===========================================
    # CREATE user_access_grants TABLE
    # ===========================================
    if not table_exists('user_access_grants'):
        op.create_table(
            'user_access_grants',
            sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column('grantee_email', sa.String(255), sa.ForeignKey('users.email'), nullable=False),
            sa.Column('grant_type', sa.String(50), nullable=False),
            sa.Column('target_value', sa.String(255), nullable=False),
            sa.Column('org_hierarchy_id', sa.String(100), sa.ForeignKey('organization_hierarchy.id'), nullable=True),
            sa.Column('is_cascaded', sa.Boolean(), server_default='false', nullable=True),
            sa.Column('cascaded_from_id', sa.Integer(), sa.ForeignKey('user_access_grants.id'), nullable=True),
            sa.Column('granted_by', sa.String(255), nullable=True),
            sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=True),
            sa.Column('expires_at', sa.DateTime(), nullable=True),
            sa.Column('is_active', sa.Boolean(), server_default='true', nullable=True),
            sa.Column('notes', sa.Text(), nullable=True),
        )

        # Create indexes
        op.create_index('idx_grant_grantee', 'user_access_grants', ['grantee_email'])
        op.create_index('idx_grant_type', 'user_access_grants', ['grant_type'])
        op.create_index('idx_grant_target', 'user_access_grants', ['target_value'])
        op.create_index('idx_grant_active', 'user_access_grants', ['is_active'])
        op.create_index('idx_grant_combo', 'user_access_grants', ['grantee_email', 'grant_type', 'target_value'])
        op.create_index('idx_grant_cascaded', 'user_access_grants', ['cascaded_from_id'])

        print("Created user_access_grants table with indexes")
    else:
        print("Table user_access_grants already exists, skipping")


def downgrade() -> None:
    # Drop tables in reverse order (due to foreign key constraints)
    if table_exists('user_access_grants'):
        op.drop_table('user_access_grants')
        print("Dropped user_access_grants table")

    if table_exists('organization_hierarchy'):
        op.drop_table('organization_hierarchy')
        print("Dropped organization_hierarchy table")
