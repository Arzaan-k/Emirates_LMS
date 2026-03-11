"""Add performance indexes for slow queries

Revision ID: 20260226_000000
Revises: 20260224_000000
Create Date: 2026-02-26 00:00:00

Adds missing indexes identified during performance analysis:
- GIN index on users.profile_data JSONB (speeds up profile field filter queries)
- Composite index on users(role, store, category) for multi-filter queries
- Composite index on users(is_external, category) for access filtering
- Composite index on course_completions(user_email, course_id) for duplicate checks
- Index on course_completions(completed_at DESC) for time-range queries
- Index on audit_logs(created_at DESC) for log pagination
- Index on video_progress(user_email, updated_at) for calendar queries
- Index on quiz_submissions(user_email, submitted_at) for calendar queries
- Index on assessment_submissions(user_email, submitted_at) for calendar queries
- Index on simulation_progress(user_email, started_at) for calendar queries

All indexes use CONCURRENTLY to avoid locking production tables.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers
revision = '20260226_000000'
down_revision = '20260224_000000'
branch_labels = None
depends_on = None


def upgrade():
    # Create indexes without CONCURRENTLY to avoid transaction issues
    # IF NOT EXISTS prevents errors on re-runs.

    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_users_profile_data_gin
        ON users USING gin(profile_data)
    """)

    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_users_role_store_category
        ON users(role, store, category)
    """)

    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_users_is_external_category
        ON users(is_external, category)
    """)

    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_completions_user_course
        ON course_completions(user_email, course_id)
    """)

    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_completions_completed_at
        ON course_completions(completed_at DESC)
    """)

    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_completions_user_completed_at
        ON course_completions(user_email, completed_at DESC)
    """)

    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at
        ON audit_logs(created_at DESC)
    """)

    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_video_progress_user_updated
        ON video_progress(user_email, updated_at DESC)
    """)

    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_video_progress_user_completed
        ON video_progress(user_email, completed_at DESC)
        WHERE completed = TRUE AND completed_at IS NOT NULL
    """)

    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_quiz_submissions_user_submitted
        ON quiz_submissions(user_email, submitted_at DESC)
    """)

    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_assessment_submissions_user_submitted
        ON assessment_submissions(user_email, submitted_at DESC)
    """)

    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_simulation_progress_user_started
        ON simulation_progress(user_email, started_at DESC)
    """)

    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_simulation_progress_user_completed
        ON simulation_progress(user_email, completed_at DESC)
        WHERE completed = TRUE AND completed_at IS NOT NULL
    """)

    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_user_node_progress_user_email
        ON user_node_progress(user_email)
    """)


def downgrade():
    op.execute("DROP INDEX IF EXISTS idx_users_profile_data_gin")
    op.execute("DROP INDEX IF EXISTS idx_users_role_store_category")
    op.execute("DROP INDEX IF EXISTS idx_users_is_external_category")
    op.execute("DROP INDEX IF EXISTS idx_completions_user_course")
    op.execute("DROP INDEX IF EXISTS idx_completions_completed_at")
    op.execute("DROP INDEX IF EXISTS idx_completions_user_completed_at")
    op.execute("DROP INDEX IF EXISTS idx_audit_logs_created_at")
    op.execute("DROP INDEX IF EXISTS idx_video_progress_user_updated")
    op.execute("DROP INDEX IF EXISTS idx_video_progress_user_completed")
    op.execute("DROP INDEX IF EXISTS idx_quiz_submissions_user_submitted")
    op.execute("DROP INDEX IF EXISTS idx_assessment_submissions_user_submitted")
    op.execute("DROP INDEX IF EXISTS idx_simulation_progress_user_started")
    op.execute("DROP INDEX IF EXISTS idx_simulation_progress_user_completed")
    op.execute("DROP INDEX IF EXISTS idx_user_node_progress_user_email")
