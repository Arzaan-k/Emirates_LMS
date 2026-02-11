"""
Self-Learning Module Endpoints
Bucket/course settings, analytics, feedback, notifications, certificates, scheduling
"""

import uuid
import logging
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


# ==========================================
# SELF-LEARNING CONTENT FOR USERS
# ==========================================

@router.get("/buckets")
async def get_self_learning_buckets(
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
        Content.is_path_node == True,
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

    result = []
    for bucket in buckets:
        # Access control: check if user is assigned
        if not _user_has_bucket_access(user, bucket):
            continue

        # Get courses in this bucket
        bucket_courses = [c for c in visible_courses if c.bucket == bucket.name or c.bucket_id == bucket.id]
        total = len(bucket_courses)
        completed = sum(1 for c in bucket_courses if c.id in completed_ids)

        # Calculate average watch progress
        total_progress = 0
        for c in bucket_courses:
            p = progress_map.get(c.id, {})
            if p.get("completed"):
                total_progress += 100
            else:
                total_progress += p.get("watched_percent", 0)
        # Empty folders (0 courses) are considered 100% complete
        avg_progress = round(total_progress / total, 1) if total > 0 else 100

        # Last attended date
        last_attended = None
        if user_email != "user":
            last_completion = db.query(func.max(CourseCompletion.completed_at)).filter(
                CourseCompletion.user_email == user_email,
                CourseCompletion.course_id.in_([c.id for c in bucket_courses])
            ).scalar()
            if last_completion:
                last_attended = last_completion.isoformat()
            else:
                last_progress = db.query(func.max(VideoProgress.updated_at)).filter(
                    VideoProgress.user_email == user_email,
                    VideoProgress.node_id.in_([c.id for c in bucket_courses])
                ).scalar()
                if last_progress:
                    last_attended = last_progress.isoformat()

        result.append({
            **bucket.to_dict(),
            "total_courses": total,
            "completed_courses": completed,
            "progress_percent": avg_progress,
            "last_attended": last_attended,
        })

    return {"buckets": result}


@router.get("/buckets/hierarchy")
async def get_self_learning_hierarchy(
    user_email: str = "user",
    db: Session = Depends(get_db)
):
    """
    Get self-learning buckets in hierarchical tree structure.
    Returns nested folders with progress at each level.
    """
    # Get all active self-learning buckets + career_progression buckets with show_in_both_paths
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

    # Get user info
    user = db.query(User).filter(User.email == user_email).first()

    # Get all self-learning courses + career courses from cross-displayed buckets
    cross_bucket_ids = [b.id for b in all_buckets if b.learning_path_type == 'career_progression']
    course_filter = Content.learning_path_type == "self_learning"
    if cross_bucket_ids:
        from sqlalchemy import or_
        course_filter = or_(Content.learning_path_type == "self_learning", Content.bucket_id.in_(cross_bucket_ids))
    all_courses = db.query(Content).filter(
        Content.is_path_node == True,
        Content.is_published == True,
        course_filter
    ).all()

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

    def get_bucket_progress(bucket):
        """Calculate progress for a bucket and its content."""
        bucket_courses = [c for c in visible_courses if c.bucket == bucket.name or c.bucket_id == bucket.id]
        total = len(bucket_courses)
        completed = sum(1 for c in bucket_courses if c.id in completed_ids)
        
        total_progress = 0
        for c in bucket_courses:
            p = progress_map.get(c.id, {})
            if p.get("completed") or c.id in completed_ids:
                total_progress += 100
            else:
                total_progress += p.get("watched_percent", 0)
        # Empty folders (0 courses) are considered 100% complete
        avg_progress = round(total_progress / total, 1) if total > 0 else 100

        return {
            "total_courses": total,
            "completed_courses": completed,
            "progress_percent": avg_progress
        }

    def build_hierarchy(parent_id=None):
        """Recursively build bucket hierarchy."""
        children = []
        for bucket in all_buckets:
            bucket_parent = getattr(bucket, 'parent_bucket_id', None)
            if bucket_parent == parent_id:
                # Check access
                if not _user_has_bucket_access(user, bucket):
                    continue

                progress = get_bucket_progress(bucket)
                
                # Get child buckets recursively
                child_buckets = build_hierarchy(bucket.id)
                
                # If there are child buckets, aggregate their progress
                if child_buckets:
                    child_total = sum(cb.get("total_courses", 0) for cb in child_buckets)
                    child_completed = sum(cb.get("completed_courses", 0) for cb in child_buckets)
                    child_progress_sum = sum(cb.get("progress_percent", 0) * cb.get("total_courses", 0) for cb in child_buckets if cb.get("total_courses", 0) > 0)
                    
                    progress["total_courses"] += child_total
                    progress["completed_courses"] += child_completed
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

@router.get("/buckets/{bucket_id}/courses")
async def get_bucket_courses(
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
        Content.is_path_node == True,
        Content.is_published == True,
        (Content.bucket == bucket.name) | (Content.bucket_id == bucket.id)
    )
    if not bucket_is_cross:
        base_query = base_query.filter(
            Content.learning_path_type == (bucket.learning_path_type or "self_learning")
        )
    courses = base_query.order_by(Content.order_index, Content.timestamp).all()

    # Filter scheduled
    courses = [c for c in courses if not c.scheduled_at or c.scheduled_at <= now]

    # Filter per-course access control (if course has assigned_users set)
    user = db.query(User).filter(User.email == user_email).first() if user_email != "user" else None
    courses = [c for c in courses if _user_has_course_access(user, c)]

    # Get user progress
    completed_ids = set()
    progress_map = {}
    if user_email != "user":
        completions = db.query(CourseCompletion.course_id).filter(
            CourseCompletion.user_email == user_email,
            CourseCompletion.course_id.in_([c.id for c in courses])
        ).all()
        completed_ids = {r[0] for r in completions}

        progress_rows = db.query(VideoProgress).filter(
            VideoProgress.user_email == user_email,
            VideoProgress.node_id.in_([c.id for c in courses])
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
async def get_users_for_assignment(
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_admin)
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
async def update_bucket_settings(
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

    return {"status": "success", "bucket": bucket.to_dict()}


@router.put("/admin/courses/{course_id}/settings")
async def update_course_settings(
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

    return {"status": "success", "course": course.to_dict()}


@router.post("/admin/buckets/{bucket_id}/reorder-courses")
async def reorder_bucket_courses(
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
async def schedule_course(
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
async def send_notification(
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
async def get_user_notifications(
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
async def mark_notification_read(
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
async def mark_all_notifications_read(
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
async def submit_feedback(
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
async def get_course_feedback(
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
# ANALYTICS
# ==========================================

@router.get("/admin/analytics/bucket/{bucket_id}")
async def get_bucket_analytics(
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
async def get_course_analytics(
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
async def get_user_self_learning_analytics(
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
async def get_course_user_history(
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


@router.post("/admin/courses/{course_id}/remove-user")
async def remove_user_from_course(
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
async def generate_certificate(
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
        "company_name": "Belgian Waffle Co.",
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