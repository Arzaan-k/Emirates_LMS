"""Add simulation_analytics_snapshots table

Revision ID: 20260215_120000
Revises: 20260210_000100
Create Date: 2026-02-15 12:00:00

Creates a pre-computed analytics snapshot table for simulations.
One row per simulation, refreshed after every completion.
Read-only from the admin analytics endpoint.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers
revision = '20260215_120000'
down_revision = '20260210_000100'
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()

    if 'simulation_analytics_snapshots' in tables:
        print("Table simulation_analytics_snapshots already exists, skipping")
        return

    op.create_table(
        'simulation_analytics_snapshots',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('simulation_id', sa.String(255), sa.ForeignKey('simulations.id'),
                  unique=True, nullable=False, index=True),

        # Attempt counts
        sa.Column('total_attempts', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('total_completed', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('total_passed', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('total_failed', sa.Integer(), nullable=False, server_default='0'),

        # Score aggregates
        sa.Column('avg_score', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('highest_score', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('lowest_score', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('pass_rate', sa.Float(), nullable=False, server_default='0.0'),

        # Time
        sa.Column('avg_time_seconds', sa.Float(), nullable=False, server_default='0.0'),

        # Metadata
        sa.Column('last_attempt_at', sa.DateTime(), nullable=True),
        sa.Column('last_updated', sa.DateTime(), nullable=True),
    )
    print("Created simulation_analytics_snapshots table")


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    if 'simulation_analytics_snapshots' in inspector.get_table_names():
        op.drop_table('simulation_analytics_snapshots')
        print("Dropped simulation_analytics_snapshots table")
