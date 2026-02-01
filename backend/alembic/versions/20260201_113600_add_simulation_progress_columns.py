"""Add missing columns to simulation_progress table

Revision ID: simulation_progress_cols
Revises: 
Create Date: 2026-02-01 11:36:00

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'simulation_progress_cols'
down_revision = '20260129_232400'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add missing columns to simulation_progress table."""
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
    
    # Add max_possible_score if missing
    if 'max_possible_score' not in existing_columns:
        op.add_column('simulation_progress', 
            sa.Column('max_possible_score', sa.Float(), nullable=True, server_default='100.0'))
        print("Added max_possible_score column")
    
    # Add time_spent_seconds if missing
    if 'time_spent_seconds' not in existing_columns:
        op.add_column('simulation_progress',
            sa.Column('time_spent_seconds', sa.Integer(), nullable=True, server_default='0'))
        print("Added time_spent_seconds column")
    
    # Add path_taken if missing
    if 'path_taken' not in existing_columns:
        op.add_column('simulation_progress',
            sa.Column('path_taken', sa.JSON(), nullable=True))
        print("Added path_taken column")
    
    # Add last_accessed if missing
    if 'last_accessed' not in existing_columns:
        op.add_column('simulation_progress',
            sa.Column('last_accessed', sa.DateTime(), nullable=True))
        print("Added last_accessed column")
    
    # Add attempt_number if missing
    if 'attempt_number' not in existing_columns:
        op.add_column('simulation_progress',
            sa.Column('attempt_number', sa.Integer(), nullable=True, server_default='1'))
        print("Added attempt_number column")
    
    # Add feedback if missing
    if 'feedback' not in existing_columns:
        op.add_column('simulation_progress',
            sa.Column('feedback', sa.JSON(), nullable=True))
        print("Added feedback column")


def downgrade() -> None:
    """Remove the added columns."""
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    
    if 'simulation_progress' not in inspector.get_table_names():
        return
    
    existing_columns = [col['name'] for col in inspector.get_columns('simulation_progress')]
    
    columns_to_drop = ['max_possible_score', 'time_spent_seconds', 'path_taken', 
                       'last_accessed', 'attempt_number', 'feedback']
    
    for col in columns_to_drop:
        if col in existing_columns:
            op.drop_column('simulation_progress', col)
