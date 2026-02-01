"""Fix crm_task_assignments schema to match ORM model

Revision ID: 008
Revises: 007
Create Date: 2026-02-01 13:15:00

Adds missing columns used by CRMTaskAssignment model (e.g., user_email).
Keeps existing legacy columns (title, description, assigned_to, etc.) intact.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "008"
down_revision: Union[str, None] = "007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def column_exists(table_name: str, column_name: str) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    cols = [c["name"] for c in inspector.get_columns(table_name)]
    return column_name in cols


def upgrade() -> None:
    # Add missing columns expected by app.models.crm.CRMTaskAssignment
    # NOTE: Using nullable=True for safety with existing rows.
    if not column_exists("crm_task_assignments", "user_email"):
        op.add_column("crm_task_assignments", sa.Column("user_email", sa.String(length=255), nullable=True))

    if not column_exists("crm_task_assignments", "user_name"):
        op.add_column("crm_task_assignments", sa.Column("user_name", sa.String(length=255), nullable=True))

    if not column_exists("crm_task_assignments", "course_category_id"):
        op.add_column("crm_task_assignments", sa.Column("course_category_id", sa.String(length=255), nullable=True))

    if not column_exists("crm_task_assignments", "course_id"):
        op.add_column("crm_task_assignments", sa.Column("course_id", sa.String(length=255), nullable=True))

    if not column_exists("crm_task_assignments", "assigned_at"):
        op.add_column("crm_task_assignments", sa.Column("assigned_at", sa.DateTime(), nullable=True))

    if not column_exists("crm_task_assignments", "resolution"):
        op.add_column("crm_task_assignments", sa.Column("resolution", sa.Text(), nullable=True))

    if not column_exists("crm_task_assignments", "xp_earned"):
        op.add_column("crm_task_assignments", sa.Column("xp_earned", sa.Integer(), nullable=True))

    if not column_exists("crm_task_assignments", "notes"):
        op.add_column("crm_task_assignments", sa.Column("notes", sa.Text(), nullable=True))

    # Best-effort backfill if legacy column assigned_to exists
    if column_exists("crm_task_assignments", "assigned_to") and column_exists("crm_task_assignments", "user_email"):
        op.execute(
            "UPDATE crm_task_assignments SET user_email = assigned_to WHERE user_email IS NULL AND assigned_to IS NOT NULL"
        )


def downgrade() -> None:
    # Reverse order
    if column_exists("crm_task_assignments", "notes"):
        op.drop_column("crm_task_assignments", "notes")
    if column_exists("crm_task_assignments", "xp_earned"):
        op.drop_column("crm_task_assignments", "xp_earned")
    if column_exists("crm_task_assignments", "resolution"):
        op.drop_column("crm_task_assignments", "resolution")
    if column_exists("crm_task_assignments", "assigned_at"):
        op.drop_column("crm_task_assignments", "assigned_at")
    if column_exists("crm_task_assignments", "course_id"):
        op.drop_column("crm_task_assignments", "course_id")
    if column_exists("crm_task_assignments", "course_category_id"):
        op.drop_column("crm_task_assignments", "course_category_id")
    if column_exists("crm_task_assignments", "user_name"):
        op.drop_column("crm_task_assignments", "user_name")
    if column_exists("crm_task_assignments", "user_email"):
        op.drop_column("crm_task_assignments", "user_email")
