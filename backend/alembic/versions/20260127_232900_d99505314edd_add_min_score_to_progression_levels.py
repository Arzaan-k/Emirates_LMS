"""add_min_score_to_progression_levels

Revision ID: d99505314edd
Revises: 007
Create Date: 2026-01-27 23:29:00.523359

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd99505314edd'
down_revision: Union[str, None] = '007'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add min_score column to progression_levels table
    op.add_column('progression_levels', sa.Column('min_score', sa.Float(), nullable=True, server_default='0.0'))


def downgrade() -> None:
    # Remove min_score column from progression_levels table
    op.drop_column('progression_levels', 'min_score')
