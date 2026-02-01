"""Merge heads: add_passed_column and 008

Revision ID: 009_merge_heads
Revises: add_passed_column, 008
Create Date: 2026-02-01 13:30:00

This is an Alembic merge migration to resolve multiple heads.
"""

from typing import Sequence, Union, Tuple

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "009_merge_heads"
down_revision: Union[str, Tuple[str, str], None] = ("add_passed_column", "008")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
