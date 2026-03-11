"""convert_to_emirates_lms_branding

Revision ID: 551c1536e275
Revises: 4c5dda372d9b
Create Date: 2026-03-11 22:33:37.352073

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '551c1536e275'
down_revision: Union[str, None] = '4c5dda372d9b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """
    Convert all Waffle/BWC branding to Emirates LMS branding.

    This migration updates:
    1. Progression level names and descriptions
    2. Course bucket names and paths
    3. Content bucket references
    4. Any other waffle/BWC references in the database
    """

    # ========================================
    # 1. UPDATE PROGRESSION LEVELS
    # ========================================

    # Update progression level names
    op.execute("""
        UPDATE progression_levels
        SET name = 'Crew Member',
            description = 'Entry level - new team members joining Emirates'
        WHERE name = 'Waffler'
    """)

    op.execute("""
        UPDATE progression_levels
        SET name = 'Senior Crew',
            description = 'Basic training completed - experienced crew members'
        WHERE name = 'Silver Waffler'
    """)

    op.execute("""
        UPDATE progression_levels
        SET name = 'Lead Crew',
            description = 'Advanced training completed - senior crew members'
        WHERE name = 'Gold Waffler'
    """)

    # ========================================
    # 2. UPDATE ACCESS RULES
    # ========================================

    # Update level_name references in access_rules
    op.execute("""
        UPDATE access_rules
        SET level_name = 'Crew Member'
        WHERE level_name = 'Waffler'
    """)

    op.execute("""
        UPDATE access_rules
        SET level_name = 'Senior Crew'
        WHERE level_name = 'Silver Waffler'
    """)

    op.execute("""
        UPDATE access_rules
        SET level_name = 'Lead Crew'
        WHERE level_name = 'Gold Waffler'
    """)

    # ========================================
    # 3. UPDATE COURSE BUCKETS
    # ========================================

    # Update bucket names
    op.execute("""
        UPDATE course_buckets
        SET name = 'Crew Member'
        WHERE name = 'Waffler'
    """)

    op.execute("""
        UPDATE course_buckets
        SET name = 'Senior Crew'
        WHERE name = 'Silver Waffler'
    """)

    op.execute("""
        UPDATE course_buckets
        SET name = 'Lead Crew'
        WHERE name = 'Gold Waffler'
    """)

    # Update folder_path for Waffler -> Crew Member
    op.execute("""
        UPDATE course_buckets
        SET folder_path = REPLACE(folder_path, 'Waffler/', 'Crew Member/')
        WHERE folder_path LIKE '%Waffler/%'
    """)

    op.execute("""
        UPDATE course_buckets
        SET folder_path = REPLACE(folder_path, 'Silver Waffler/', 'Senior Crew/')
        WHERE folder_path LIKE '%Silver Waffler/%'
    """)

    op.execute("""
        UPDATE course_buckets
        SET folder_path = REPLACE(folder_path, 'Gold Waffler/', 'Lead Crew/')
        WHERE folder_path LIKE '%Gold Waffler/%'
    """)

    # Update standalone folder paths (exact matches)
    op.execute("""
        UPDATE course_buckets
        SET folder_path = 'Crew Member'
        WHERE folder_path = 'Waffler'
    """)

    op.execute("""
        UPDATE course_buckets
        SET folder_path = 'Senior Crew'
        WHERE folder_path = 'Silver Waffler'
    """)

    op.execute("""
        UPDATE course_buckets
        SET folder_path = 'Lead Crew'
        WHERE folder_path = 'Gold Waffler'
    """)

    # ========================================
    # 4. UPDATE CONTENT BUCKET REFERENCES
    # ========================================

    # Update bucket field in content table
    op.execute("""
        UPDATE content
        SET bucket = 'Crew Member'
        WHERE bucket = 'Waffler'
    """)

    op.execute("""
        UPDATE content
        SET bucket = 'Senior Crew'
        WHERE bucket = 'Silver Waffler'
    """)

    op.execute("""
        UPDATE content
        SET bucket = 'Lead Crew'
        WHERE bucket = 'Gold Waffler'
    """)

    # ========================================
    # 5. UPDATE USER LEVEL REFERENCES
    # ========================================

    # Update users.joined_at_level field
    op.execute("""
        UPDATE users
        SET joined_at_level = 'Crew Member'
        WHERE joined_at_level = 'Waffler'
    """)

    op.execute("""
        UPDATE users
        SET joined_at_level = 'Senior Crew'
        WHERE joined_at_level = 'Silver Waffler'
    """)

    op.execute("""
        UPDATE users
        SET joined_at_level = 'Lead Crew'
        WHERE joined_at_level = 'Gold Waffler'
    """)

    # ========================================
    # 6. UPDATE ANY BWC REFERENCES
    # ========================================

    # Update folder paths that contain BWC
    op.execute("""
        UPDATE course_buckets
        SET folder_path = REPLACE(folder_path, 'BWC/', 'Emirates/')
        WHERE folder_path LIKE '%BWC/%'
    """)

    op.execute("""
        UPDATE course_buckets
        SET folder_path = 'Emirates'
        WHERE folder_path = 'BWC'
    """)

    print("Successfully converted all Waffle/BWC branding to Emirates LMS branding")


def downgrade() -> None:
    """
    Revert Emirates LMS branding back to Waffle/BWC branding.
    """

    # Revert progression levels
    op.execute("""
        UPDATE progression_levels
        SET name = 'Waffler',
            description = 'Entry level - new team members'
        WHERE name = 'Crew Member'
    """)

    op.execute("""
        UPDATE progression_levels
        SET name = 'Silver Waffler',
            description = 'Basic training completed'
        WHERE name = 'Senior Crew'
    """)

    op.execute("""
        UPDATE progression_levels
        SET name = 'Gold Waffler',
            description = 'Advanced training completed'
        WHERE name = 'Lead Crew'
    """)

    # Revert access rules
    op.execute("""
        UPDATE access_rules
        SET level_name = 'Waffler'
        WHERE level_name = 'Crew Member'
    """)

    op.execute("""
        UPDATE access_rules
        SET level_name = 'Silver Waffler'
        WHERE level_name = 'Senior Crew'
    """)

    op.execute("""
        UPDATE access_rules
        SET level_name = 'Gold Waffler'
        WHERE level_name = 'Lead Crew'
    """)

    # Revert course buckets
    op.execute("""
        UPDATE course_buckets
        SET name = 'Waffler'
        WHERE name = 'Crew Member'
    """)

    op.execute("""
        UPDATE course_buckets
        SET name = 'Silver Waffler'
        WHERE name = 'Senior Crew'
    """)

    op.execute("""
        UPDATE course_buckets
        SET name = 'Gold Waffler'
        WHERE name = 'Lead Crew'
    """)

    # Revert folder paths
    op.execute("""
        UPDATE course_buckets
        SET folder_path = REPLACE(folder_path, 'Crew Member/', 'Waffler/')
        WHERE folder_path LIKE '%Crew Member/%'
    """)

    op.execute("""
        UPDATE course_buckets
        SET folder_path = REPLACE(folder_path, 'Senior Crew/', 'Silver Waffler/')
        WHERE folder_path LIKE '%Senior Crew/%'
    """)

    op.execute("""
        UPDATE course_buckets
        SET folder_path = REPLACE(folder_path, 'Lead Crew/', 'Gold Waffler/')
        WHERE folder_path LIKE '%Lead Crew/%'
    """)

    op.execute("""
        UPDATE course_buckets
        SET folder_path = 'Waffler'
        WHERE folder_path = 'Crew Member'
    """)

    op.execute("""
        UPDATE course_buckets
        SET folder_path = 'Silver Waffler'
        WHERE folder_path = 'Senior Crew'
    """)

    op.execute("""
        UPDATE course_buckets
        SET folder_path = 'Gold Waffler'
        WHERE folder_path = 'Lead Crew'
    """)

    # Revert content buckets
    op.execute("""
        UPDATE content
        SET bucket = 'Waffler'
        WHERE bucket = 'Crew Member'
    """)

    op.execute("""
        UPDATE content
        SET bucket = 'Silver Waffler'
        WHERE bucket = 'Senior Crew'
    """)

    op.execute("""
        UPDATE content
        SET bucket = 'Gold Waffler'
        WHERE bucket = 'Lead Crew'
    """)

    # Revert user levels
    op.execute("""
        UPDATE users
        SET joined_at_level = 'Waffler'
        WHERE joined_at_level = 'Crew Member'
    """)

    op.execute("""
        UPDATE users
        SET joined_at_level = 'Silver Waffler'
        WHERE joined_at_level = 'Senior Crew'
    """)

    op.execute("""
        UPDATE users
        SET joined_at_level = 'Gold Waffler'
        WHERE joined_at_level = 'Lead Crew'
    """)

    # Revert BWC references
    op.execute("""
        UPDATE course_buckets
        SET folder_path = REPLACE(folder_path, 'Emirates/', 'BWC/')
        WHERE folder_path LIKE '%Emirates/%'
    """)

    op.execute("""
        UPDATE course_buckets
        SET folder_path = 'BWC'
        WHERE folder_path = 'Emirates'
    """)

    print("Successfully reverted Emirates LMS branding back to Waffle/BWC branding")
