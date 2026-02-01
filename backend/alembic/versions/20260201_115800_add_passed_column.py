"""Add passed column to simulation_progress table

Revision ID: add_passed_column
Revises: simulation_progress_cols
Create Date: 2026-02-01 11:58:00

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'add_passed_column'
down_revision = 'simulation_progress_cols'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add passed column to simulation_progress table."""
    # Get connection for checking existing columns
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    
    # Check if table exists
    tables = inspector.get_table_names()
    if 'simulation_progress' not in tables:
        print("Table simulation_progress does not exist, skipping migration")
        return
    
    # Get existing columns
    existing_columns = [col['name'] for col in inspector.get_columns('simulation_progress')]
    
    # Add passed if missing
    if 'passed' not in existing_columns:
        op.add_column('simulation_progress', 
            sa.Column('passed', sa.Boolean(), nullable=True))
        print("Added passed column")


def downgrade() -> None:
    """Remove the passed column."""
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    
    if 'simulation_progress' not in inspector.get_table_names():
        return
    
    existing_columns = [col['name'] for col in inspector.get_columns('simulation_progress')]
    
    if 'passed' in existing_columns:
        op.drop_column('simulation_progress', 'passed')
