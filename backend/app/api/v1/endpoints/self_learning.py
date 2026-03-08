"""
Self-Learning Module Endpoints
Bucket/course settings, analytics, feedback, notifications, certificates, scheduling
"""

import uuid
import logging
import time
from typing import Dict, Any, Optional, List
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session
from sqlalchemy import func, and_

from app.config.database import get_db
from app.core.dependencies import get_current_user, require_admin
from app.models.content import Content, CourseBucket
from app.models.notification import Notification, CourseFeedback
from app.models.video_progress import VideoProgress
from app.models.tracking import CourseCompletion
from app.models.user import User

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/self-learning", tags=["Self Learning"])

# ===========================================
# IN-MEMORY CACHE FOR FAST RESPONSES
# ===========================================
# Cache buckets/courses structure (user-independent) for 5 minutes
# Longer TTL to reduce DB queries and handle Neon cold-starts
_buckets_cache = {"data": None, "expires": 0}
_courses_cache = {"data": None, "expires": 0}
CACHE_TTL = 300  # 5 minutes - longer to minimize slow DB queries


def invalidate_self_learning_cache():
    """Call this when buckets or courses are modified to clear the cache."""
    global _buckets_cache, _courses_cache
    _buckets_cache = {"data": None, "expires": 0}
    _courses_cache = {"data": None, "expires": 0}
    logger.info("Self-learning cache invalidated")


# ==========================================
# SELF-LEARNING CONTENT FOR USERS
# ==========================================

# Default estimated durations per resource type (seconds)
_DEFAULT_DURATION = {
    'Video': 300,    # 5 minutes
    'Audio': 240,    # 4 minutes
    'PDF': 180,      # 3 minutes
    'Document': 180,
    'Image': 60,
    'PPT': 300,
    'Presentation': 300,
}

def _estimate_duration(course):
    """Get duration_seconds for a course, with fallback estimation."""
    if course.duration_seconds:
        return course.duration_seconds
    # Try parsing the duration string (formats: '5:30', '1:02:30', '5m', '300')
    if course.duration:
        d = course.duration.strip()
        try:
            parts = d.split(':')
            if len(parts) == 2:
                return int(parts[0]) * 60 + int(parts[1])
            elif len(parts) == 3:
                return int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
            elif d.endswith('m'):
                return int(d[:-1]) * 60
            elif d.isdigit():
                return int(d)
        except (ValueError, IndexError):
            pass
    # Fallback: estimate by resource type
    return _DEFAULT_DURATION.get(course.resource_type, 180)

@router.get("/buckets")
def get_self_learning_buckets(
    user_email: str = "user",
    db: Session = Depends(get_db)
):
    """
    Get all self-learning buckets (folders) visible to a user.
    Returns buckets with course counts and user progress.
    """
    # Get all active self-learning buckets + career_progression buckets with show_in_both_paths
    buckets = db.query(CourseBucket).filter(
        CourseBucket.is_active == True,
        (
            (CourseBucket.learning_path_type == "self_learning") |
            (
                (CourseBucket.learning_path_type == "career_progression") &
                (CourseBucket.show_in_both_paths == True)
            )
        )
    ).order_by(CourseBucket.order_index).all()

    # Get user info for access filtering
    user = db.query(User).filter(User.email == user_email).first()

    # Get all self-learning courses + career courses from cross-displayed buckets
    cross_bucket_ids = [b.id for b in buckets if b.learning_path_type == 'career_progression']
    course_filter = Content.learning_path_type == "self_learning"
    if cross_bucket_ids:
        from sqlalchemy import or_
        course_filter = or_(Content.learning_path_type == "self_learning", Content.bucket_id.in_(cross_bucket_ids))
    all_courses = db.query(Content).filter(
        Content.is_published == True,
        course_filter
    ).all()

    # Check scheduled courses - hide if not yet launched
    now = datetime.utcnow()
    visible_courses = [
        c for c in all_courses
        if not c.scheduled_at or c.scheduled_at <= now
    ]

    # Get user completions
    completed_ids = set()
    if user_email != "user":
        completions = db.query(CourseCompletion.course_id).filter(
            CourseCompletion.user_email == user_email
        ).all()
        completed_ids = {r[0] for r in completions}

    # Get user watch progress
    progress_map = {}
    if user_email != "user":
        progress_rows = db.query(
            VideoProgress.node_id,
            VideoProgress.video_watched_percent,
            VideoProgress.completed
        ).filter(
            VideoProgress.user_email == user_email
        ).all()
        for row in progress_rows:
            progress_map[row[0]] = {
                "watched_percent": row[1] or 0,
                "completed": row[2] or False
            }

    # --- N+1 FIX: batch last_attended lookup BEFORE the loop ---
    # Fetch max(completed_at) per course and max(updated_at) per node in ONE query each.
    # Replaces 2 DB queries per bucket with 2 total queries for ALL buckets.
    last_completion_by_course: dict = {}
    last_progress_by_node: dict = {}
    if user_email != "user":
        all_visible_ids = [c.id for c in visible_courses]
        if all_visible_ids:
            completion_rows = db.query(
                CourseCompletion.course_id,
                func.max(CourseCompletion.completed_at).label("max_completed_at")
            ).filter(
                CourseCompletion.user_email == user_email,
                CourseCompletion.course_id.in_(all_visible_ids)
            ).group_by(CourseCompletion.course_id).all()
            last_completion_by_course = {r.course_id: r.max_completed_at for r in completion_rows}

            progress_rows_dates = db.query(
                VideoProgress.node_id,
                func.max(VideoProgress.updated_at).label("max_updated_at")
            ).filter(
                VideoProgress.user_email == user_email,
                VideoProgress.node_id.in_(all_visible_ids)
            ).group_by(VideoProgress.node_id).all()
            last_progress_by_node = {r.node_id: r.max_updated_at for r in progress_rows_dates}

    result = []
    for bucket in buckets:
        # Access control: check if user is assigned
        if not _user_has_bucket_access(user, bucket):
            continue

        # Match courses to bucket: prefer bucket_id over name to avoid double-counting
        bucket_courses = [c for c in visible_courses if c.bucket_id == bucket.id or (not c.bucket_id and c.bucket == bucket.name)]

        # Separate mandatory vs optional courses for THIS USER
        # A course is mandatory if:
        # 1. impacts_existing_progress is True AND
        # 2. impacted_users is empty (affects all) OR user_email is in impacted_users
        def is_mandatory_for_user(course):
            impacts = getattr(course, 'impacts_existing_progress', True)
            if impacts is False:
                return False
            impacted_list = getattr(course, 'impacted_users', None) or []
            # Empty list = affects all users; Non-empty = only listed users
            return len(impacted_list) == 0 or user_email in impacted_list

        mandatory_courses = [c for c in bucket_courses if is_mandatory_for_user(c)]

        # Check if user has completed all mandatory courses
        mandatory_completed = sum(1 for c in mandatory_courses if c.id in completed_ids)
        all_mandatory_done = len(mandatory_courses) > 0 and mandatory_completed == len(mandatory_courses)

        # If all mandatory done, progress = 100% (optional courses don't affect)
        if all_mandatory_done and len(mandatory_courses) > 0:
            courses_for_progress = mandatory_courses
            total_progress = 100 * len(mandatory_courses)
            avg_progress = 100
            
            # Calculate duration based on all courses for display purposes
            total_duration = 0
            remaining_duration = 0
            for c in bucket_courses:
                total_duration += _estimate_duration(c)
            
        else:
            courses_for_progress = bucket_courses
            
            # Calculate total duration for all courses (for display)
            total_duration = 0
            for c in bucket_courses:
                total_duration += _estimate_duration(c)

            # Calculate average watch progress and remaining time using courses_for_progress
            total_progress = 0
            remaining_duration = 0
            for c in courses_for_progress:
                course_dur = _estimate_duration(c)
                p = progress_map.get(c.id, {})
                if p.get("completed"):
                    total_progress += 100
                else:
                    watched = p.get("watched_percent", 0)
                    total_progress += watched
                    remaining_duration += int(course_dur * (1 - watched / 100))
            # Empty folders (0 courses) are considered 100% complete
            progress_count = len(courses_for_progress)
            avg_progress = round(total_progress / progress_count, 1) if progress_count > 0 else 100

        # Last attended date — O(1) dict lookup, no DB query per bucket
        last_attended = None
        if user_email != "user":
            bucket_course_ids = [c.id for c in bucket_courses]
            # Find the most recent completion timestamp across this bucket's courses
            last_completion = max(
                (last_completion_by_course[cid] for cid in bucket_course_ids if cid in last_completion_by_course),
                default=None
            )
            if last_completion:
                last_attended = last_completion.isoformat()
            else:
                # Fall back to most recent watch progress
                last_progress = max(
                    (last_progress_by_node[cid] for cid in bucket_course_ids if cid in last_progress_by_node),
                    default=None
                )
                if last_progress:
                    last_attended = last_progress.isoformat()

        result.append({
            **bucket.to_dict(),
            "total_courses": len(bucket_courses),
            "completed_courses": sum(1 for c in bucket_courses if c.id in completed_ids),
            "progress_percent": avg_progress,
            "total_duration_seconds": total_duration,
            "remaining_duration_seconds": remaining_duration,
            "last_attended": last_attended,
        })

    return {"buckets": result}


def _get_cached_buckets_and_courses(db: Session):
    """
    Get buckets and courses with in-memory caching.
    Caches for CACHE_TTL seconds to avoid repeated DB queries.
    """
    global _buckets_cache, _courses_cache
    from sqlalchemy import or_

    now = time.time()

    # Check if buckets cache is valid
    if _buckets_cache["data"] is None or now > _buckets_cache["expires"]:
        all_buckets = db.query(CourseBucket).filter(
            CourseBucket.is_active == True,
            (
                (CourseBucket.learning_path_type == "self_learning") |
                (
                    (CourseBucket.learning_path_type == "career_progression") &
                    (CourseBucket.show_in_both_paths == True)
                )
            )
        ).order_by(CourseBucket.order_index).all()
        _buckets_cache["data"] = all_buckets
        _buckets_cache["expires"] = now + CACHE_TTL
    else:
        all_buckets = _buckets_cache["data"]

    # Check if courses cache is valid
    if _courses_cache["data"] is None or now > _courses_cache["expires"]:
        cross_bucket_ids = [b.id for b in all_buckets if b.learning_path_type == 'career_progression']
        course_filter = Content.learning_path_type == "self_learning"
        if cross_bucket_ids:
            course_filter = or_(Content.learning_path_type == "self_learning", Content.bucket_id.in_(cross_bucket_ids))

        all_courses = db.query(Content).filter(
            Content.is_published == True,
            course_filter
        ).all()
        _courses_cache["data"] = all_courses
        _courses_cache["expires"] = now + CACHE_TTL
    else:
        all_courses = _courses_cache["data"]

    return all_buckets, all_courses


@router.get("/buckets/hierarchy")
def get_self_learning_hierarchy(
    user_email: str = "user",
    db: Session = Depends(get_db)
):
    """
    Get self-learning buckets in hierarchical tree structure.
    Returns nested folders with progress at each level.

    OPTIMIZED: In-memory caching for buckets/courses, reduced DB round trips.
    """
    try:
        # Check if user_email looks like a real email (contains @) or is the test user
        is_real_user = user_email and (user_email == "user" or "@" in user_email or len(user_email) > 3)

        # OPTIMIZATION: Use cached buckets and courses (user-independent data)
        all_buckets, all_courses = _get_cached_buckets_and_courses(db)

        # Get user info (only if real user)
        user = db.query(User).filter(User.email == user_email).first() if is_real_user else None

        now = datetime.utcnow()
        visible_courses = [c for c in all_courses if not c.scheduled_at or c.scheduled_at <= now]

        # Filter per-course access control (if course has assigned_users set)
        if user_email != "user" and user:
            visible_courses = [c for c in visible_courses if _user_has_course_access(user, c)]

        # Query user-specific data: completions and progress
        completed_ids = set()
        progress_map = {}

        if is_real_user:
            # Batch: completions + progress in single transaction window
            completions = db.query(CourseCompletion.course_id).filter(
                CourseCompletion.user_email == user_email
            ).all()
            completed_ids = {r[0] for r in completions}

            progress_rows = db.query(
                VideoProgress.node_id,
                VideoProgress.video_watched_percent,
                VideoProgress.completed
            ).filter(
                VideoProgress.user_email == user_email
            ).all()

            progress_map = {
                row[0]: {"watched_percent": row[1] or 0, "completed": row[2] or False}
                for row in progress_rows
            }

        def get_bucket_progress(bucket):
            """Calculate progress for a bucket and its content.

            Handles impacts_existing_progress flag AND impacted_users list:
            - Courses with impacts_existing_progress=False don't affect any user
            - Courses with non-empty impacted_users only affect those specific users
            - This allows admins to add new courses without affecting existing users' 100%
            """
            # Match courses to bucket: prefer bucket_id over name to avoid double-counting
            bucket_courses = [c for c in visible_courses if c.bucket_id == bucket.id or (not c.bucket_id and c.bucket == bucket.name)]

            # Check if course is mandatory for THIS specific user
            def is_mandatory_for_user(course):
                impacts = getattr(course, 'impacts_existing_progress', True)
                if impacts is False:
                    return False
                impacted_list = getattr(course, 'impacted_users', None) or []
                # Empty list = affects all users; Non-empty = only listed users
                return len(impacted_list) == 0 or user_email in impacted_list

            # Separate mandatory vs optional courses FOR THIS USER
            mandatory_courses = [c for c in bucket_courses if is_mandatory_for_user(c)]

            # Check if user has completed all mandatory courses
            mandatory_completed = sum(1 for c in mandatory_courses if c.id in completed_ids)
            all_mandatory_done = len(mandatory_courses) > 0 and mandatory_completed == len(mandatory_courses)

            # If all mandatory courses are done, use only mandatory for progress (stays 100%)
            # Otherwise, include optional courses that were added before user started
            if all_mandatory_done and len(mandatory_courses) > 0:
                courses_for_progress = mandatory_courses
                total_progress = 100 * len(mandatory_courses)
                avg_progress = 100
                
                # Calculate duration based on all courses for display purposes
                total_duration = 0
                remaining_duration = 0
                for c in bucket_courses:
                    total_duration += _estimate_duration(c)
                
            else:
                courses_for_progress = bucket_courses
                # Calculate total duration for all courses
                total_duration = 0
                for c in bucket_courses:
                    total_duration += _estimate_duration(c)

                # Calculate progress and remaining time using courses_for_progress
                total_progress = 0
                remaining_duration = 0
                for c in courses_for_progress:
                    course_dur = _estimate_duration(c)
                    p = progress_map.get(c.id, {})
                    if p.get("completed") or c.id in completed_ids:
                        total_progress += 100
                    else:
                        watched = p.get("watched_percent", 0)
                        total_progress += watched
                        remaining_duration += int(course_dur * (1 - watched / 100))

                # Empty folders (0 courses) are considered 100% complete
                progress_count = len(courses_for_progress)
                avg_progress = round(total_progress / progress_count, 1) if progress_count > 0 else 100

            return {
                "total_courses": len(bucket_courses),  # Show total including optional
                "completed_courses": sum(1 for c in bucket_courses if c.id in completed_ids),
                "progress_percent": avg_progress,
                "total_duration_seconds": total_duration,
                "remaining_duration_seconds": remaining_duration,
            }

        def build_hierarchy(parent_id=None, visited=None, depth=0):
            """Recursively build bucket hierarchy with cycle detection."""
            # Initialize visited set for cycle detection
            if visited is None:
                visited = set()

            # Prevent infinite recursion - max depth of 10 levels
            if depth > 10:
                logger.warning(f"Max hierarchy depth reached at parent_id={parent_id}")
                return []

            children = []
            for bucket in all_buckets:
                bucket_parent = getattr(bucket, 'parent_bucket_id', None)
                if bucket_parent == parent_id:
                    # Prevent self-referencing buckets
                    if bucket.id == parent_id:
                        logger.warning(f"Self-referencing bucket detected: {bucket.id}")
                        continue

                    # Cycle detection - skip if we've already processed this bucket in current path
                    if bucket.id in visited:
                        logger.warning(f"Cycle detected: bucket {bucket.id} already in path")
                        continue

                    # Check access (skip for test user "user")
                    if user_email != "user" and not _user_has_bucket_access(user, bucket):
                        continue

                    progress = get_bucket_progress(bucket)

                    # Get child buckets recursively with updated visited set
                    new_visited = visited | {bucket.id}
                    child_buckets = build_hierarchy(bucket.id, new_visited, depth + 1)

                    # If there are child buckets, aggregate their progress
                    if child_buckets:
                        child_total = sum(cb.get("total_courses", 0) for cb in child_buckets)
                        child_completed = sum(cb.get("completed_courses", 0) for cb in child_buckets)
                        child_progress_sum = sum(cb.get("progress_percent", 0) * cb.get("total_courses", 0) for cb in child_buckets if cb.get("total_courses", 0) > 0)

                        progress["total_courses"] += child_total
                        progress["completed_courses"] += child_completed

                        # Aggregate duration from child buckets
                        progress["total_duration_seconds"] += sum(cb.get("total_duration_seconds", 0) for cb in child_buckets)
                        progress["remaining_duration_seconds"] += sum(cb.get("remaining_duration_seconds", 0) for cb in child_buckets)

                        if progress["total_courses"] > 0:
                            total_weight = sum(cb.get("total_courses", 0) for cb in child_buckets if cb.get("total_courses", 0) > 0)
                            if total_weight > 0:
                                child_avg = child_progress_sum / total_weight
                                own_count = progress["total_courses"] - child_total
                                if own_count > 0:
                                    progress["progress_percent"] = round(
                                        ((progress["progress_percent"] * own_count) + (child_avg * child_total)) / progress["total_courses"], 1
                                    )
                                else:
                                    progress["progress_percent"] = round(child_avg, 1)

                    bucket_data = {
                        **bucket.to_dict(),
                        **progress,
                        "children": child_buckets,
                        "has_children": len(child_buckets) > 0
                    }
                    children.append(bucket_data)

            return children

        # Build tree from root (parent_id = None)
        hierarchy = build_hierarchy(None)

        return {"hierarchy": hierarchy}

    except Exception as e:
        logger.error(f"Error in get_self_learning_hierarchy: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to load hierarchy: {str(e)}")

@router.get("/buckets/{bucket_id}/courses")
def get_bucket_courses(
    bucket_id: str,
    user_email: str = "user",
    db: Session = Depends(get_db)
):
    """
    Get all courses in a self-learning bucket with user progress.
    Respects linear/non-linear ordering.
    """
    bucket = db.query(CourseBucket).filter(CourseBucket.id == bucket_id).first()
    if not bucket:
        raise HTTPException(status_code=404, detail="Bucket not found")

    now = datetime.utcnow()
    # If bucket is cross-displayed, don't filter by learning_path_type
    # (career courses should appear when cross-displayed into self learning)
    bucket_is_cross = getattr(bucket, 'show_in_both_paths', False) or False
    base_query = db.query(Content).filter(
        Content.is_published == True,
        Content.bucket_id == bucket.id
    )
    if not bucket_is_cross:
        base_query = base_query.filter(
            Content.learning_path_type == (bucket.learning_path_type or "self_learning")
        )
    courses = base_query.order_by(Content.order_index, Content.timestamp).all()
    # Also include courses matched by name that don't have a bucket_id assigned
    if not courses:
        base_query = db.query(Content).filter(
            Content.is_published == True,
            Content.bucket == bucket.name,
            Content.bucket_id.is_(None)
        )
        if not bucket_is_cross:
            base_query = base_query.filter(
                Content.learning_path_type == (bucket.learning_path_type or "self_learning")
            )
        courses = base_query.order_by(Content.order_index, Content.timestamp).all()

    # Filter scheduled
    courses = [c for c in courses if not c.scheduled_at or c.scheduled_at <= now]

    # Filter per-course access control (if course has assigned_users set)
    # Skip access check for test user "user"
    if user_email != "user":
        user = db.query(User).filter(User.email == user_email).first()
        courses = [c for c in courses if _user_has_course_access(user, c)]

    # Get user progress - accept "user" as valid for testing
    completed_ids = set()
    progress_map = {}
    is_real_user = user_email and (user_email == "user" or "@" in user_email or len(user_email) > 3)
    if is_real_user and courses:
        course_ids = [c.id for c in courses]
        completions = db.query(CourseCompletion.course_id).filter(
            CourseCompletion.user_email == user_email,
            CourseCompletion.course_id.in_(course_ids)
        ).all()
        completed_ids = {r[0] for r in completions}

        progress_rows = db.query(VideoProgress).filter(
            VideoProgress.user_email == user_email,
            VideoProgress.node_id.in_(course_ids)
        ).all()
        for p in progress_rows:
            progress_map[p.node_id] = p.to_dict()

    is_linear = getattr(bucket, 'is_linear', False) or False
    found_first_incomplete = False

    result_courses = []
    for i, course in enumerate(courses):
        is_completed = course.id in completed_ids
        watch_progress = progress_map.get(course.id, {})
        watched_pct = watch_progress.get("video_watched_percent", 0) or 0

        # Determine lock status for linear buckets
        if is_linear:
            if is_completed:
                status = "completed"
            elif not found_first_incomplete:
                status = "active"
                found_first_incomplete = True
            else:
                status = "locked"
        else:
            # Non-linear: all unlocked
            if is_completed:
                status = "completed"
            else:
                status = "active"

        result_courses.append({
            "id": course.id,
            "title": course.title,
            "description": course.description,
            "thumbnail": course.thumbnail,
            "video_url": course.video_url,
            "audio_url": getattr(course, 'audio_url', None),
            "file_url": course.file_url,
            "resource_type": course.resource_type,
            "duration": course.duration,
            "duration_seconds": course.duration_seconds,
            "xp": course.xp or 50,
            "status": status,
            "watched_percent": watched_pct if not is_completed else 100,
            "allow_fast_forward": getattr(course, 'allow_fast_forward', True) if getattr(course, 'allow_fast_forward', None) is not None else True,
            "enable_feedback": getattr(course, 'enable_feedback', False) or False,
            "enable_certificate": getattr(course, 'enable_certificate', False) or False,
            "certificate_template": getattr(course, 'certificate_template', 'classic') or 'classic',
            "has_quiz": bool(course.quiz and isinstance(course.quiz, list) and len(course.quiz) > 0),
            "order_index": course.order_index,
            "created_at": course.created_at.isoformat() if course.created_at else None,
        })

    return {
        "bucket": bucket.to_dict(),
        "courses": result_courses,
        "is_linear": is_linear,
        "total": len(result_courses),
        "completed": len(completed_ids),
    }


# ==========================================
# ADMIN: USERS FOR ASSIGNMENT PICKER
# ==========================================

@router.get("/admin/users-for-assignment")
def get_users_for_assignment(
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Get all users with their details for the assignment picker.
    Returns users list and distinct filter values for roles, stores, categories,
    regions, cities, states, designations, departments.
    """
    all_users = db.query(User).order_by(User.name).all()

    users_list = []
    roles_set = set()
    stores_set = set()
    categories_set = set()
    regions_set = set()
    cities_set = set()
    states_set = set()
    designations_set = set()
    departments_set = set()

    for u in all_users:
        role = u.role or "Unassigned"
        store = u.store or "Unassigned"
        category = u.category or "Employee"
        pd = u.profile_data if isinstance(u.profile_data, dict) else {}

        region = pd.get("Region") or pd.get("region") or ""
        city = pd.get("City") or pd.get("city") or ""
        state = pd.get("State") or pd.get("state") or ""
        designation = pd.get("Designation") or pd.get("designation") or ""
        department = pd.get("Department") or pd.get("department") or ""

        roles_set.add(role)
        stores_set.add(store)
        categories_set.add(category)
        if region: regions_set.add(region)
        if city: cities_set.add(city)
        if state: states_set.add(state)
        if designation: designations_set.add(designation)
        if department: departments_set.add(department)

        users_list.append({
            "email": u.email,
            "name": u.name,
            "role": role,
            "store": store,
            "category": category,
            "region": region,
            "city": city,
            "state": state,
            "designation": designation,
            "department": department,
            "is_external": u.is_external or False,
        })

    return {
        "users": users_list,
        "filters": {
            "roles": sorted(roles_set),
            "stores": sorted(stores_set),
            "categories": sorted(categories_set),
            "regions": sorted(regions_set),
            "cities": sorted(cities_set),
            "states": sorted(states_set),
            "designations": sorted(designations_set),
            "departments": sorted(departments_set),
        },
        "total": len(users_list),
    }


# ==========================================
# ADMIN: BUCKET SETTINGS
# ==========================================

@router.put("/admin/buckets/{bucket_id}/settings")
def update_bucket_settings(
    bucket_id: str,
    settings: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_admin)
):
    """
    Update self-learning bucket settings.
    Settings: is_linear, assigned_users, thumbnail, description
    """
    bucket = db.query(CourseBucket).filter(CourseBucket.id == bucket_id).first()
    if not bucket:
        raise HTTPException(status_code=404, detail="Bucket not found")

    allowed_fields = ['is_linear', 'assigned_users', 'thumbnail', 'description', 'name', 'color', 'icon', 'show_in_both_paths']
    for key in allowed_fields:
        if key in settings:
            setattr(bucket, key, settings[key])

    bucket.updated_at = datetime.utcnow()
    db.commit()
    
    invalidate_self_learning_cache()

    return {"status": "success", "bucket": bucket.to_dict()}


@router.put("/admin/courses/{course_id}/settings")
def update_course_settings(
    course_id: str,
    settings: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_admin)
):
    """
    Update per-course self-learning settings.
    Settings: allow_fast_forward, enable_feedback, enable_certificate, xp, is_published, scheduled_at
    """
    course = db.query(Content).filter(Content.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    allowed_fields = ['allow_fast_forward', 'enable_feedback', 'enable_certificate', 'certificate_template', 'assigned_users', 'xp', 'is_published', 'scheduled_at']
    for key in allowed_fields:
        if key in settings:
            val = settings[key]
            if key == 'scheduled_at' and val:
                val = datetime.fromisoformat(val) if isinstance(val, str) else val
            setattr(course, key, val)

    course.updated_at = datetime.utcnow()
    db.commit()
    
    invalidate_self_learning_cache()

    return {"status": "success", "course": course.to_dict()}


@router.post("/admin/buckets/{bucket_id}/reorder-courses")
def reorder_bucket_courses(
    bucket_id: str,
    body: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_admin)
):
    """
    Reorder courses within a self-learning bucket.
    body: { "course_ids": ["id1", "id2", "id3", ...] }
    Updates the order_index of each course to match the given order.
    """
    bucket = db.query(CourseBucket).filter(CourseBucket.id == bucket_id).first()
    if not bucket:
        raise HTTPException(status_code=404, detail="Bucket not found")

    course_ids = body.get("course_ids", [])
    if not course_ids:
        raise HTTPException(status_code=400, detail="course_ids list is required")

    # Update order_index for each course
    for index, course_id in enumerate(course_ids):
        course = db.query(Content).filter(Content.id == course_id).first()
        if course:
            course.order_index = index
            course.updated_at = datetime.utcnow()

    db.commit()
    logger.info(f"Reordered {len(course_ids)} courses in bucket {bucket_id}")

    return {
        "status": "success",
        "message": f"Reordered {len(course_ids)} courses",
        "bucket_id": bucket_id,
    }


# ==========================================
# ADMIN: COURSE SCHEDULING
# ==========================================

@router.post("/admin/courses/{course_id}/schedule")
def schedule_course(
    course_id: str,
    body: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_admin)
):
    """
    Schedule a course for future launch or launch instantly.
    body: { "scheduled_at": "2025-03-01T09:00:00" } or { "launch_now": true }
    """
    course = db.query(Content).filter(Content.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    if body.get("launch_now"):
        course.is_published = True
        course.scheduled_at = None
        msg = "Course launched immediately"
    else:
        scheduled_at = body.get("scheduled_at")
        if scheduled_at:
            course.scheduled_at = datetime.fromisoformat(scheduled_at) if isinstance(scheduled_at, str) else scheduled_at
            course.is_published = True
            msg = f"Course scheduled for {course.scheduled_at.isoformat()}"
        else:
            raise HTTPException(status_code=400, detail="Provide scheduled_at or launch_now")

    course.updated_at = datetime.utcnow()
    db.commit()

    return {"status": "success", "message": msg, "course_id": course_id}


# ==========================================
# NOTIFICATIONS (PUSH)
# ==========================================

@router.post("/admin/notifications/send")
def send_notification(
    body: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_admin)
):
    """
    Send a push notification to targeted users.
    body: {
        title, message, notification_type,
        target_users: [], target_roles: [], target_stores: [], target_categories: [],
        source_bucket_id, source_course_id,
        priority, is_crucial
    }
    """
    notif = Notification(
        id=str(uuid.uuid4()),
        title=body.get("title", "New Notification"),
        message=body.get("message", ""),
        notification_type=body.get("notification_type", "info"),
        target_users=body.get("target_users", []),
        target_roles=body.get("target_roles", []),
        target_stores=body.get("target_stores", []),
        target_categories=body.get("target_categories", []),
        source_bucket_id=body.get("source_bucket_id"),
        source_course_id=body.get("source_course_id"),
        priority=body.get("priority", "normal"),
        is_crucial=body.get("is_crucial", False),
        created_by=current_user.get("email", "admin"),
        created_at=datetime.utcnow(),
    )
    db.add(notif)
    db.commit()

    logger.info(f"Notification sent: {notif.title} by {notif.created_by}")
    return {"status": "success", "notification": notif.to_dict()}


@router.get("/notifications")
def get_user_notifications(
    user_email: str,
    limit: int = 50,
    db: Session = Depends(get_db)
):
    """
    Get notifications visible to a specific user.
    Filters by target_users, target_roles, target_stores, target_categories.
    """
    user = db.query(User).filter(User.email == user_email).first()

    all_notifs = db.query(Notification).order_by(
        Notification.created_at.desc()
    ).limit(200).all()

    # Filter notifications relevant to this user
    visible = []
    for n in all_notifs:
        targets_users = n.target_users or []
        targets_roles = n.target_roles or []
        targets_stores = n.target_stores or []
        targets_cats = getattr(n, 'target_categories', None) or []

        # If all target lists are empty, it's a broadcast to everyone
        is_broadcast = not targets_users and not targets_roles and not targets_stores and not targets_cats

        if is_broadcast:
            visible.append(n)
            continue

        # Check if user matches any target
        if user:
            if user_email in targets_users:
                visible.append(n)
            elif user.role and user.role in targets_roles:
                visible.append(n)
            elif user.store and user.store in targets_stores:
                visible.append(n)
            elif user.category and user.category in targets_cats:
                visible.append(n)

    # Mark read status per user
    result = []
    for n in visible[:limit]:
        d = n.to_dict()
        d["is_read"] = user_email in (n.read_by or [])
        result.append(d)

    unread_count = sum(1 for r in result if not r["is_read"])

    return {
        "notifications": result,
        "total": len(result),
        "unread_count": unread_count,
    }


@router.post("/notifications/{notification_id}/read")
def mark_notification_read(
    notification_id: str,
    user_email: str = Body(..., embed=True),
    db: Session = Depends(get_db)
):
    """Mark a notification as read for a user."""
    notif = db.query(Notification).filter(Notification.id == notification_id).first()
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")

    read_by = list(notif.read_by or [])
    if user_email not in read_by:
        read_by.append(user_email)
        notif.read_by = read_by
        from sqlalchemy.orm.attributes import flag_modified
        flag_modified(notif, "read_by")
        db.commit()

    return {"status": "success"}


@router.post("/notifications/mark-all-read")
def mark_all_notifications_read(
    user_email: str = Body(..., embed=True),
    db: Session = Depends(get_db)
):
    """Mark all notifications as read for a user."""
    notifs = db.query(Notification).all()
    from sqlalchemy.orm.attributes import flag_modified

    for n in notifs:
        read_by = list(n.read_by or [])
        if user_email not in read_by:
            read_by.append(user_email)
            n.read_by = read_by
            flag_modified(n, "read_by")

    db.commit()
    return {"status": "success"}


# ==========================================
# FEEDBACK
# ==========================================

@router.post("/feedback")
def submit_feedback(
    body: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db)
):
    """
    Submit course feedback (star rating + comment).
    body: { user_email, course_id, course_title, bucket, rating (1-5), comment }
    """
    rating = body.get("rating", 0)
    if not 1 <= rating <= 5:
        raise HTTPException(status_code=400, detail="Rating must be 1-5")

    feedback = CourseFeedback(
        id=str(uuid.uuid4()),
        user_email=body.get("user_email"),
        course_id=body.get("course_id"),
        course_title=body.get("course_title", ""),
        bucket=body.get("bucket", ""),
        rating=rating,
        comment=body.get("comment", ""),
        created_at=datetime.utcnow(),
    )
    db.add(feedback)
    db.commit()

    return {"status": "success", "feedback": feedback.to_dict()}


@router.get("/admin/feedback/{course_id}")
def get_course_feedback(
    course_id: str,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_admin)
):
    """Get all feedback for a course (admin)."""
    feedbacks = db.query(CourseFeedback).filter(
        CourseFeedback.course_id == course_id
    ).order_by(CourseFeedback.created_at.desc()).all()

    avg_rating = db.query(func.avg(CourseFeedback.rating)).filter(
        CourseFeedback.course_id == course_id
    ).scalar()

    return {
        "course_id": course_id,
        "feedbacks": [f.to_dict() for f in feedbacks],
        "total": len(feedbacks),
        "average_rating": round(float(avg_rating), 1) if avg_rating else 0,
    }



# ==========================================
# CUSTOMIZABLE SURVEY (ADMIN BUILDER)
# ==========================================

@router.get("/admin/survey/{course_id}")
def get_course_survey(
    course_id: str,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_admin)
):
    """Get the survey template for a course (admin). Returns null if none exists."""
    from app.models.notification import CourseSurvey
    survey = db.query(CourseSurvey).filter(CourseSurvey.course_id == course_id).first()
    return {"survey": survey.to_dict() if survey else None}


@router.post("/admin/survey/{course_id}")
def create_or_update_survey(
    course_id: str,
    body: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_admin)
):
    """
    Create or update the survey template for a course.
    body: {
        title: str,
        description: str,
        is_active: bool,
        questions: [
            { id: str, type: 'rating'|'mcq'|'text'|'name', label: str, options: [str], mandatory: bool }
        ]
    }
    """
    from app.models.notification import CourseSurvey
    from sqlalchemy.orm.attributes import flag_modified

    survey = db.query(CourseSurvey).filter(CourseSurvey.course_id == course_id).first()
    if survey:
        # Update existing
        survey.title = body.get("title", survey.title)
        survey.description = body.get("description", survey.description)
        survey.is_active = body.get("is_active", survey.is_active)
        survey.questions = body.get("questions", survey.questions)
        survey.updated_at = datetime.utcnow()
        flag_modified(survey, "questions")
    else:
        # Create new
        survey = CourseSurvey(
            id=str(uuid.uuid4()),
            course_id=course_id,
            title=body.get("title", "Course Feedback Survey"),
            description=body.get("description", ""),
            is_active=body.get("is_active", True),
            questions=body.get("questions", []),
            created_by=current_user.get("email", "admin"),
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        db.add(survey)

    db.commit()
    db.refresh(survey)
    logger.info(f"Survey saved for course {course_id} by {current_user.get('email')}")
    return {"status": "success", "survey": survey.to_dict()}


@router.delete("/admin/survey/{course_id}")
def delete_course_survey(
    course_id: str,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_admin)
):
    """Delete the survey template for a course."""
    from app.models.notification import CourseSurvey
    survey = db.query(CourseSurvey).filter(CourseSurvey.course_id == course_id).first()
    if not survey:
        raise HTTPException(status_code=404, detail="Survey not found")
    db.delete(survey)
    db.commit()
    return {"status": "success", "message": "Survey deleted"}


@router.get("/survey/{course_id}")
def get_survey_for_user(
    course_id: str,
    user_email: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Get the active survey for a course (user-facing).
    Returns null if none or inactive.
    If user_email is provided, also returns has_submitted = True/False
    so the frontend can decide whether to show the form at all.
    """
    from app.models.notification import CourseSurvey, SurveyResponse
    survey = db.query(CourseSurvey).filter(
        CourseSurvey.course_id == course_id,
        CourseSurvey.is_active == True
    ).first()

    has_submitted = False
    if survey and user_email:
        existing = db.query(SurveyResponse).filter(
            SurveyResponse.survey_id == survey.id,
            SurveyResponse.user_email == user_email
        ).first()
        has_submitted = existing is not None

    return {
        "survey": survey.to_dict() if survey else None,
        "has_submitted": has_submitted,
    }


@router.post("/survey/{course_id}/submit")
def submit_survey_response(
    course_id: str,
    body: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db)
):
    """
    Submit a user's survey response.
    body: { survey_id, user_email, user_name, answers: {question_id: answer} }
    """
    from app.models.notification import CourseSurvey, SurveyResponse

    survey_id = body.get("survey_id")
    user_email = body.get("user_email", "")
    if not survey_id or not user_email:
        raise HTTPException(status_code=400, detail="survey_id and user_email are required")

    # Check if user already responded
    existing = db.query(SurveyResponse).filter(
        SurveyResponse.survey_id == survey_id,
        SurveyResponse.user_email == user_email
    ).first()
    if existing:
        # Update existing response
        existing.answers = body.get("answers", {})
        existing.user_name = body.get("user_name", existing.user_name)
        from sqlalchemy.orm.attributes import flag_modified
        flag_modified(existing, "answers")
        db.commit()
        return {"status": "success", "response": existing.to_dict()}

    response = SurveyResponse(
        id=str(uuid.uuid4()),
        survey_id=survey_id,
        course_id=course_id,
        user_email=user_email,
        user_name=body.get("user_name", ""),
        answers=body.get("answers", {}),
        created_at=datetime.utcnow(),
    )
    db.add(response)
    db.commit()
    logger.info(f"Survey response submitted by {user_email} for course {course_id}")
    return {"status": "success", "response": response.to_dict()}


@router.get("/admin/survey/{course_id}/responses")
def get_survey_responses(
    course_id: str,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_admin)
):
    """Get all survey responses for a course with aggregated stats."""
    from app.models.notification import CourseSurvey, SurveyResponse

    survey = db.query(CourseSurvey).filter(CourseSurvey.course_id == course_id).first()
    if not survey:
        return {"survey": None, "responses": [], "total": 0, "stats": {}}

    responses = db.query(SurveyResponse).filter(
        SurveyResponse.survey_id == survey.id
    ).order_by(SurveyResponse.created_at.desc()).all()

    # Aggregate stats per question
    stats = {}
    for q in (survey.questions or []):
        qid = q.get("id")
        qtype = q.get("type")
        if qtype == "mcq":
            counts = {}
            for opt in (q.get("options") or []):
                counts[opt] = 0
            for r in responses:
                ans = (r.answers or {}).get(qid)
                if ans and ans in counts:
                    counts[ans] += 1
            stats[qid] = {"type": "mcq", "counts": counts}
        elif qtype == "rating":
            vals = [(r.answers or {}).get(qid) for r in responses if (r.answers or {}).get(qid)]
            avg = round(sum(float(v) for v in vals) / len(vals), 1) if vals else 0
            stats[qid] = {"type": "rating", "average": avg, "count": len(vals)}
        else:
            stats[qid] = {"type": qtype, "count": len([r for r in responses if (r.answers or {}).get(qid)])}

    return {
        "survey": survey.to_dict(),
        "responses": [r.to_dict() for r in responses],
        "total": len(responses),
        "stats": stats,
    }


# ==========================================
# ANALYTICS
# ==========================================

@router.get("/admin/analytics/bucket/{bucket_id}")
def get_bucket_analytics(
    bucket_id: str,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_admin)
):
    """
    Per-bucket per-employee analytics.
    Shows each user's progress across all courses in the bucket.
    """
    bucket = db.query(CourseBucket).filter(CourseBucket.id == bucket_id).first()
    if not bucket:
        raise HTTPException(status_code=404, detail="Bucket not found")

    courses = db.query(Content).filter(
        Content.is_path_node == True,
        Content.learning_path_type == "self_learning",
        (Content.bucket == bucket.name) | (Content.bucket_id == bucket.id)
    ).all()

    course_ids = [c.id for c in courses]
    if not course_ids:
        return {"bucket": bucket.to_dict(), "analytics": [], "courses": []}

    # Get all progress for these courses
    all_progress = db.query(VideoProgress).filter(
        VideoProgress.node_id.in_(course_ids)
    ).all()

    # Get all completions
    all_completions = db.query(CourseCompletion).filter(
        CourseCompletion.course_id.in_(course_ids)
    ).all()

    # Group by user
    user_data = {}
    for p in all_progress:
        if p.user_email not in user_data:
            user_data[p.user_email] = {"courses": {}, "total_watched": 0}
        user_data[p.user_email]["courses"][p.node_id] = {
            "watched_percent": p.video_watched_percent or 0,
            "completed": p.completed or False,
        }
        user_data[p.user_email]["total_watched"] += (p.video_watched_percent or 0)

    for c in all_completions:
        if c.user_email not in user_data:
            user_data[c.user_email] = {"courses": {}, "total_watched": 0}
        user_data[c.user_email]["courses"][c.course_id] = {
            "watched_percent": 100,
            "completed": True,
            "score": c.score_percent,
            "completed_at": c.completed_at.isoformat() if c.completed_at else None,
        }

    # Get user names
    user_emails = list(user_data.keys())
    users = db.query(User.email, User.name, User.role, User.store).filter(
        User.email.in_(user_emails)
    ).all() if user_emails else []
    user_name_map = {u.email: {"name": u.name, "role": u.role, "store": u.store} for u in users}

    analytics = []
    for email, data in user_data.items():
        user_info = user_name_map.get(email, {})
        courses_completed = sum(1 for v in data["courses"].values() if v.get("completed"))
        avg_progress = round(data["total_watched"] / len(course_ids), 1) if course_ids else 0

        analytics.append({
            "user_email": email,
            "user_name": user_info.get("name", email),
            "role": user_info.get("role", ""),
            "store": user_info.get("store", ""),
            "courses_completed": courses_completed,
            "total_courses": len(course_ids),
            "progress_percent": min(avg_progress, 100),
            "course_details": data["courses"],
        })

    # Sort by progress descending
    analytics.sort(key=lambda x: x["progress_percent"], reverse=True)

    return {
        "bucket": bucket.to_dict(),
        "courses": [{"id": c.id, "title": c.title} for c in courses],
        "analytics": analytics,
        "total_users": len(analytics),
    }


@router.get("/admin/analytics/course/{course_id}")
def get_course_analytics(
    course_id: str,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_admin)
):
    """
    Per-course per-employee analytics.
    Shows each user's watch progress, completion, score for a specific course.
    """
    course = db.query(Content).filter(Content.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    # Get all progress
    progress_rows = db.query(VideoProgress).filter(
        VideoProgress.node_id == course_id
    ).all()

    # Get completions
    completions = db.query(CourseCompletion).filter(
        CourseCompletion.course_id == course_id
    ).all()
    completion_map = {c.user_email: c for c in completions}

    # Get feedback
    feedbacks = db.query(CourseFeedback).filter(
        CourseFeedback.course_id == course_id
    ).all()
    feedback_map = {f.user_email: f for f in feedbacks}

    # Get user info
    all_emails = list(set([p.user_email for p in progress_rows] + list(completion_map.keys())))
    users = db.query(User.email, User.name, User.role, User.store).filter(
        User.email.in_(all_emails)
    ).all() if all_emails else []
    user_map = {u.email: {"name": u.name, "role": u.role, "store": u.store} for u in users}

    analytics = []
    seen = set()
    for p in progress_rows:
        seen.add(p.user_email)
        comp = completion_map.get(p.user_email)
        fb = feedback_map.get(p.user_email)
        ui = user_map.get(p.user_email, {})

        analytics.append({
            "user_email": p.user_email,
            "user_name": ui.get("name", p.user_email),
            "role": ui.get("role", ""),
            "store": ui.get("store", ""),
            "watched_percent": p.video_watched_percent or 0,
            "completed": p.completed or bool(comp),
            "completed_at": comp.completed_at.isoformat() if comp and comp.completed_at else None,
            "score": comp.score_percent if comp else None,
            "xp_earned": comp.xp_earned if comp else 0,
            "feedback_rating": fb.rating if fb else None,
            "feedback_comment": fb.comment if fb else None,
        })

    # Add users who have completions but no video progress
    for email, comp in completion_map.items():
        if email not in seen:
            ui = user_map.get(email, {})
            fb = feedback_map.get(email)
            analytics.append({
                "user_email": email,
                "user_name": ui.get("name", email),
                "role": ui.get("role", ""),
                "store": ui.get("store", ""),
                "watched_percent": 100,
                "completed": True,
                "completed_at": comp.completed_at.isoformat() if comp.completed_at else None,
                "score": comp.score_percent,
                "xp_earned": comp.xp_earned or 0,
                "feedback_rating": fb.rating if fb else None,
                "feedback_comment": fb.comment if fb else None,
            })

    analytics.sort(key=lambda x: x["watched_percent"], reverse=True)

    avg_feedback = db.query(func.avg(CourseFeedback.rating)).filter(
        CourseFeedback.course_id == course_id
    ).scalar()

    return {
        "course": {"id": course.id, "title": course.title, "bucket": course.bucket, "xp": course.xp},
        "analytics": analytics,
        "total_users": len(analytics),
        "total_completed": sum(1 for a in analytics if a["completed"]),
        "average_watched": round(sum(a["watched_percent"] for a in analytics) / len(analytics), 1) if analytics else 0,
        "average_feedback": round(float(avg_feedback), 1) if avg_feedback else None,
    }


@router.get("/admin/analytics/user/{user_email}")
def get_user_self_learning_analytics(
    user_email: str,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_admin)
):
    """
    Per-user analytics across all self-learning content.
    """
    user = db.query(User).filter(User.email == user_email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # All self-learning courses
    all_courses = db.query(Content).filter(
        Content.learning_path_type == "self_learning",
        Content.is_path_node == True
    ).all()

    progress_rows = db.query(VideoProgress).filter(
        VideoProgress.user_email == user_email
    ).all()
    progress_map = {p.node_id: p for p in progress_rows}

    completions = db.query(CourseCompletion).filter(
        CourseCompletion.user_email == user_email
    ).all()
    completion_map = {c.course_id: c for c in completions}

    course_details = []
    for c in all_courses:
        p = progress_map.get(c.id)
        comp = completion_map.get(c.id)
        course_details.append({
            "course_id": c.id,
            "title": c.title,
            "bucket": c.bucket,
            "watched_percent": (p.video_watched_percent if p else 0) or 0,
            "completed": bool(comp) or (p.completed if p else False),
            "completed_at": comp.completed_at.isoformat() if comp and comp.completed_at else None,
            "xp_earned": comp.xp_earned if comp else 0,
        })

    total_xp = sum(d["xp_earned"] for d in course_details)
    total_completed = sum(1 for d in course_details if d["completed"])

    return {
        "user": {"email": user.email, "name": user.name, "role": user.role, "store": user.store},
        "courses": course_details,
        "total_courses": len(course_details),
        "total_completed": total_completed,
        "total_xp": total_xp,
        "overall_progress": round(sum(d["watched_percent"] for d in course_details) / len(course_details), 1) if course_details else 0,
    }


# ==========================================
# ADMIN: USER MANAGEMENT PER COURSE/BUCKET
# ==========================================

@router.get("/admin/courses/{course_id}/history")
def get_course_user_history(
    course_id: str,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_admin)
):
    """
    Get per-user action history for a course.
    Admin can see who accessed, completed, and their progress.
    """
    progress_rows = db.query(VideoProgress).filter(
        VideoProgress.node_id == course_id
    ).order_by(VideoProgress.updated_at.desc()).all()

    completions = db.query(CourseCompletion).filter(
        CourseCompletion.course_id == course_id
    ).all()
    completion_map = {c.user_email: c for c in completions}

    all_emails = list(set([p.user_email for p in progress_rows] + list(completion_map.keys())))
    users = db.query(User.email, User.name, User.role, User.store).filter(
        User.email.in_(all_emails)
    ).all() if all_emails else []
    user_map = {u.email: {"name": u.name, "role": u.role, "store": u.store} for u in users}

    history = []
    seen = set()
    for p in progress_rows:
        seen.add(p.user_email)
        comp = completion_map.get(p.user_email)
        ui = user_map.get(p.user_email, {})
        history.append({
            "user_email": p.user_email,
            "user_name": ui.get("name", p.user_email),
            "role": ui.get("role"),
            "store": ui.get("store"),
            "watched_percent": p.video_watched_percent or 0,
            "completed": p.completed or bool(comp),
            "last_activity": (p.updated_at or p.created_at).isoformat() if (p.updated_at or p.created_at) else None,
            "completed_at": comp.completed_at.isoformat() if comp and comp.completed_at else None,
        })

    for email, comp in completion_map.items():
        if email not in seen:
            ui = user_map.get(email, {})
            history.append({
                "user_email": email,
                "user_name": ui.get("name", email),
                "role": ui.get("role"),
                "store": ui.get("store"),
                "watched_percent": 100,
                "completed": True,
                "last_activity": comp.completed_at.isoformat() if comp.completed_at else None,
                "completed_at": comp.completed_at.isoformat() if comp.completed_at else None,
            })

    return {"course_id": course_id, "history": history, "total_users": len(history)}


@router.get("/admin/buckets/{bucket_id}/affected-users")
async def get_affected_users_preview(
    bucket_id: str,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_admin)
):
    """
    Preview which users will be affected when adding new content to a bucket.
    Returns:
    - completed_users: Users who have 100% completion (won't be affected if "No Impact" is selected)
    - in_progress_users: Users who have started but not completed (will be affected either way)
    - not_started_users: Users who haven't started (will be affected either way)
    """
    bucket = db.query(CourseBucket).filter(CourseBucket.id == bucket_id).first()
    if not bucket:
        raise HTTPException(status_code=404, detail="Bucket not found")

    # Get all courses in this bucket
    courses = db.query(Content).filter(
        Content.is_published == True,
        (Content.bucket == bucket.name) | (Content.bucket_id == bucket.id)
    ).all()

    course_ids = [c.id for c in courses]
    total_courses = len(courses)

    if total_courses == 0:
        # No courses yet - all users are "not started"
        all_users = db.query(User.email, User.name, User.role, User.store).filter(User.is_active == True).all()
        return {
            "bucket_id": bucket_id,
            "bucket_name": bucket.name,
            "total_courses": 0,
            "completed_users": [],
            "in_progress_users": [],
            "not_started_users": [{"email": u.email, "name": u.name, "role": u.role, "store": u.store} for u in all_users],
            "summary": {
                "completed_count": 0,
                "in_progress_count": 0,
                "not_started_count": len(all_users),
                "total_users": len(all_users)
            }
        }

    # Get all completions for courses in this bucket
    completions = db.query(CourseCompletion.user_email, CourseCompletion.course_id).filter(
        CourseCompletion.course_id.in_(course_ids)
    ).all()

    # Build user completion map
    user_completions = {}
    for comp in completions:
        if comp.user_email not in user_completions:
            user_completions[comp.user_email] = set()
        user_completions[comp.user_email].add(comp.course_id)

    # Get all progress for courses in this bucket
    progress_rows = db.query(VideoProgress.user_email, VideoProgress.node_id, VideoProgress.video_watched_percent).filter(
        VideoProgress.node_id.in_(course_ids)
    ).all()

    # Build user progress map
    user_progress = {}
    for p in progress_rows:
        if p.user_email not in user_progress:
            user_progress[p.user_email] = {}
        user_progress[p.user_email][p.node_id] = p.video_watched_percent or 0

    # Get all active users
    all_users = db.query(User.email, User.name, User.role, User.store).filter(User.is_active == True).all()
    user_map = {u.email: {"email": u.email, "name": u.name, "role": u.role, "store": u.store} for u in all_users}

    # Categorize users
    completed_users = []
    in_progress_users = []
    not_started_users = []

    all_emails = set(user_map.keys()) | set(user_completions.keys()) | set(user_progress.keys())

    for email in all_emails:
        user_info = user_map.get(email, {"email": email, "name": email, "role": None, "store": None})
        completed_courses = user_completions.get(email, set())
        progress = user_progress.get(email, {})

        completed_count = len(completed_courses)
        has_progress = len(progress) > 0 or completed_count > 0

        if completed_count == total_courses:
            # User has completed all courses - 100%
            completed_users.append({
                **user_info,
                "completed_courses": completed_count,
                "total_courses": total_courses,
                "progress_percent": 100
            })
        elif has_progress:
            # User has started but not completed all
            avg_progress = 0
            for cid in course_ids:
                if cid in completed_courses:
                    avg_progress += 100
                else:
                    avg_progress += progress.get(cid, 0)
            avg_progress = round(avg_progress / total_courses, 1)

            in_progress_users.append({
                **user_info,
                "completed_courses": completed_count,
                "total_courses": total_courses,
                "progress_percent": avg_progress
            })
        else:
            # User hasn't started
            not_started_users.append({
                **user_info,
                "completed_courses": 0,
                "total_courses": total_courses,
                "progress_percent": 0
            })

    return {
        "bucket_id": bucket_id,
        "bucket_name": bucket.name,
        "total_courses": total_courses,
        "completed_users": completed_users,
        "in_progress_users": in_progress_users,
        "not_started_users": not_started_users,
        "summary": {
            "completed_count": len(completed_users),
            "in_progress_count": len(in_progress_users),
            "not_started_count": len(not_started_users),
            "total_users": len(completed_users) + len(in_progress_users) + len(not_started_users)
        }
    }


@router.get("/admin/learning-path/{learning_path_type}/affected-users")
async def get_learning_path_affected_users(
    learning_path_type: str,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_admin)
):
    """
    Get users who would be affected when adding new content to a learning path.
    Returns users categorized by their completion status across ALL buckets in the path.
    """
    # Get all buckets for this learning path
    buckets = db.query(CourseBucket).filter(
        CourseBucket.is_active == True,
        CourseBucket.learning_path_type == learning_path_type
    ).all()

    # Get all courses in these buckets
    bucket_ids = [b.id for b in buckets]
    bucket_names = [b.name for b in buckets]

    courses = db.query(Content).filter(
        Content.is_published == True,
        Content.learning_path_type == learning_path_type
    ).all()

    course_ids = [c.id for c in courses]
    total_courses = len(courses)

    if total_courses == 0:
        all_users = db.query(User.email, User.name, User.role, User.store).filter(User.is_active == True).limit(100).all()
        return {
            "learning_path_type": learning_path_type,
            "total_courses": 0,
            "total_buckets": len(buckets),
            "completed_users": [],
            "in_progress_users": [],
            "summary": {
                "completed_count": 0,
                "in_progress_count": 0,
                "total_users": len(all_users)
            }
        }

    # Get completions
    completions = db.query(CourseCompletion.user_email, CourseCompletion.course_id).filter(
        CourseCompletion.course_id.in_(course_ids)
    ).all()

    user_completions = {}
    for comp in completions:
        if comp.user_email not in user_completions:
            user_completions[comp.user_email] = set()
        user_completions[comp.user_email].add(comp.course_id)

    # Get user info
    all_emails = list(user_completions.keys())
    users = db.query(
        User.email, User.name, User.role, User.store, User.category, User.profile_data
    ).filter(User.email.in_(all_emails)).all() if all_emails else []
    
    user_map = {
        u.email: {
            "email": u.email,
            "name": u.name,
            "role": u.role,
            "store": u.store,
            "category": u.category,
            "region": (u.profile_data or {}).get('Region') if u.profile_data else None,
            "city": (u.profile_data or {}).get('City') if u.profile_data else None,
            "state": (u.profile_data or {}).get('State') if u.profile_data else None,
            "designation": (u.profile_data or {}).get('Designation') if u.profile_data else None,
            "department": (u.profile_data or {}).get('Department') if u.profile_data else None
        } 
        for u in users
    }

    completed_users = []
    in_progress_users = []

    for email, completed_set in user_completions.items():
        user_info = user_map.get(email, {"email": email, "name": email, "role": None, "store": None})
        completed_count = len(completed_set)
        progress_percent = round((completed_count / total_courses) * 100, 1) if total_courses > 0 else 0

        if completed_count == total_courses:
            completed_users.append({
                **user_info,
                "completed_courses": completed_count,
                "total_courses": total_courses,
                "progress_percent": 100
            })
        else:
            in_progress_users.append({
                **user_info,
                "completed_courses": completed_count,
                "total_courses": total_courses,
                "progress_percent": progress_percent
            })

    # Sort by progress
    completed_users.sort(key=lambda x: x["name"] or "")
    in_progress_users.sort(key=lambda x: -x["progress_percent"])

    return {
        "learning_path_type": learning_path_type,
        "total_courses": total_courses,
        "total_buckets": len(buckets),
        "completed_users": completed_users[:50],  # Limit to 50 for performance
        "in_progress_users": in_progress_users[:50],
        "summary": {
            "completed_count": len(completed_users),
            "in_progress_count": len(in_progress_users),
            "total_users": len(completed_users) + len(in_progress_users)
        }
    }


@router.get("/admin/buckets/check-integrity")
def check_bucket_integrity(
    fix: bool = False,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_admin)
):
    """
    Check bucket hierarchy for circular references and self-referencing buckets.
    Set fix=true to automatically fix issues by clearing invalid parent_bucket_ids.
    """
    all_buckets = db.query(CourseBucket).all()
    issues = []

    # Build bucket map
    bucket_map = {b.id: b for b in all_buckets}

    for bucket in all_buckets:
        # Check 1: Self-referencing
        if bucket.parent_bucket_id == bucket.id:
            issues.append({
                "bucket_id": bucket.id,
                "bucket_name": bucket.name,
                "issue": "self_reference",
                "description": f"Bucket '{bucket.name}' references itself as parent"
            })
            if fix:
                bucket.parent_bucket_id = None
                logger.info(f"Fixed self-reference for bucket {bucket.id}")

        # Check 2: Circular reference - follow parent chain
        if bucket.parent_bucket_id:
            visited = {bucket.id}
            current_id = bucket.parent_bucket_id
            depth = 0
            while current_id and depth < 20:
                if current_id in visited:
                    issues.append({
                        "bucket_id": bucket.id,
                        "bucket_name": bucket.name,
                        "issue": "circular_reference",
                        "description": f"Bucket '{bucket.name}' is part of a circular parent chain"
                    })
                    if fix:
                        bucket.parent_bucket_id = None
                        logger.info(f"Fixed circular reference for bucket {bucket.id}")
                    break
                visited.add(current_id)
                parent = bucket_map.get(current_id)
                current_id = parent.parent_bucket_id if parent else None
                depth += 1

            if depth >= 20:
                issues.append({
                    "bucket_id": bucket.id,
                    "bucket_name": bucket.name,
                    "issue": "excessive_depth",
                    "description": f"Bucket '{bucket.name}' has parent chain deeper than 20 levels"
                })
                if fix:
                    bucket.parent_bucket_id = None
                    logger.info(f"Fixed excessive depth for bucket {bucket.id}")

        # Check 3: Parent doesn't exist
        if bucket.parent_bucket_id and bucket.parent_bucket_id not in bucket_map:
            issues.append({
                "bucket_id": bucket.id,
                "bucket_name": bucket.name,
                "issue": "orphan_parent",
                "description": f"Bucket '{bucket.name}' references non-existent parent {bucket.parent_bucket_id}"
            })
            if fix:
                bucket.parent_bucket_id = None
                logger.info(f"Fixed orphan parent for bucket {bucket.id}")

    if fix and issues:
        db.commit()
        logger.info(f"Fixed {len(issues)} bucket hierarchy issues")

    return {
        "status": "success",
        "issues_found": len(issues),
        "issues": issues,
        "fixed": fix and len(issues) > 0,
        "total_buckets": len(all_buckets)
    }


@router.post("/admin/courses/{course_id}/remove-user")
def remove_user_from_course(
    course_id: str,
    body: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_admin)
):
    """
    Remove a user's progress from a course (recycle/reset).
    """
    user_email = body.get("user_email")
    if not user_email:
        raise HTTPException(status_code=400, detail="user_email required")

    # Delete video progress
    db.query(VideoProgress).filter(
        VideoProgress.user_email == user_email,
        VideoProgress.node_id == course_id
    ).delete()

    # Delete completion
    db.query(CourseCompletion).filter(
        CourseCompletion.user_email == user_email,
        CourseCompletion.course_id == course_id
    ).delete()

    db.commit()
    logger.info(f"Removed user {user_email} from course {course_id}")

    return {"status": "success", "message": f"User {user_email} removed from course"}


# ==========================================
# CERTIFICATE GENERATION
# ==========================================

@router.get("/certificate/{course_id}/{user_email}")
def generate_certificate(
    course_id: str,
    user_email: str,
    db: Session = Depends(get_db)
):
    """
    Generate a certificate of completion for a course.
    Returns certificate data (HTML-based for PDF generation on frontend).
    """
    # Verify completion
    completion = db.query(CourseCompletion).filter(
        CourseCompletion.user_email == user_email,
        CourseCompletion.course_id == course_id
    ).first()

    if not completion:
        raise HTTPException(status_code=400, detail="Course not completed yet")

    course = db.query(Content).filter(Content.id == course_id).first()
    user = db.query(User).filter(User.email == user_email).first()

    if not course or not user:
        raise HTTPException(status_code=404, detail="Course or user not found")

    # Check if certificate is enabled for this course
    if not getattr(course, 'enable_certificate', False):
        raise HTTPException(status_code=400, detail="Certificate not enabled for this course")

    cert_id = f"CERT-{uuid.uuid4().hex[:8].upper()}"
    completed_date = completion.completed_at.strftime("%B %d, %Y") if completion.completed_at else datetime.utcnow().strftime("%B %d, %Y")

    certificate_data = {
        "certificate_id": cert_id,
        "template": getattr(course, 'certificate_template', 'classic') or 'classic',
        "user_name": user.name,
        "user_email": user.email,
        "course_title": course.title,
        "course_bucket": course.bucket,
        "completed_date": completed_date,
        "score": completion.score_percent,
        "xp_earned": completion.xp_earned or course.xp or 50,
        "company_name": "Emirates Airlines",
        "issued_at": datetime.utcnow().isoformat(),
    }

    # Store certificate URL in completion record
    completion.certificate_issued = True
    completion.certificate_url = f"/certificates/{cert_id}"
    db.commit()

    return {"status": "success", "certificate": certificate_data}


# ==========================================
# HELPERS
# ==========================================

def _user_has_bucket_access(user, bucket) -> bool:
    """Check if a user has access to a bucket based on assignment rules."""
    assigned = getattr(bucket, 'assigned_users', None)
    if not assigned:
        return True  # No restrictions = everyone can access

    # assigned can be a dict with keys: emails, roles, stores, categories, regions, cities, states, designations, departments
    if isinstance(assigned, dict):
        emails = assigned.get("emails", [])
        roles = assigned.get("roles", [])
        stores = assigned.get("stores", [])
        categories = assigned.get("categories", [])
        regions = assigned.get("regions", [])
        cities = assigned.get("cities", [])
        states = assigned.get("states", [])
        designations = assigned.get("designations", [])
        departments = assigned.get("departments", [])

        # If all lists are empty, it's open to all
        if not any([emails, roles, stores, categories, regions, cities, states, designations, departments]):
            return True

        if not user:
            return False

        # Direct email match
        if user.email in emails:
            return True
        # Role match
        if user.role and user.role in roles:
            return True
        # Store match
        if user.store and user.store in stores:
            return True
        # Category match
        if user.category and user.category in categories:
            return True

        # Profile data based matches (region, city, state, designation, department)
        pd = user.profile_data if isinstance(getattr(user, 'profile_data', None), dict) else {}
        user_region = pd.get("Region") or pd.get("region") or ""
        user_city = pd.get("City") or pd.get("city") or ""
        user_state = pd.get("State") or pd.get("state") or ""
        user_designation = pd.get("Designation") or pd.get("designation") or ""
        user_department = pd.get("Department") or pd.get("department") or ""

        if user_region and user_region in regions:
            return True
        if user_city and user_city in cities:
            return True
        if user_state and user_state in states:
            return True
        if user_designation and user_designation in designations:
            return True
        if user_department and user_department in departments:
            return True

        return False

    # Legacy: assigned is a list of emails
    if isinstance(assigned, list):
        if len(assigned) == 0:
            return True
        if not user:
            return False
        return user.email in assigned

    return True


def _user_has_course_access(user, course) -> bool:
    """Check if a user has access to a specific course based on per-course assignment rules."""
    assigned = getattr(course, 'assigned_users', None)
    if not assigned or not isinstance(assigned, dict):
        return True  # No per-course restrictions

    # Reuse same logic as bucket access
    class _FakeBucket:
        pass
    fb = _FakeBucket()
    fb.assigned_users = assigned
    return _user_has_bucket_access(user, fb)