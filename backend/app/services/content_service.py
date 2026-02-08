"""
Content Service
Business logic for content management and learning paths
"""

import uuid
import logging
from typing import Any, Dict, List, Optional, Set
from datetime import datetime

from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundError, ValidationError, ConflictError
from app.repositories.content_repository import (
    ContentRepository,
    CourseBucketRepository,
    ResourceRepository,
    ProgressionLevelRepository,
    AccessRuleRepository,
)
from app.repositories.user_repository import (
    CourseCompletionRepository,
    UserNodeProgressRepository,
    UserRepository,
)
from app.models.content import Content, CourseBucket, Resource
from app.services.cache_service import cache, invalidate_content_cache
from app.repositories.analytics_repository import invalidate_skill_categories_cache

logger = logging.getLogger(__name__)


class ContentService:
    """Service for content management."""

    def __init__(self, db: Session):
        self.db = db
        self.content_repo = ContentRepository(db)
        self.bucket_repo = CourseBucketRepository(db)
        self.resource_repo = ResourceRepository(db)
        self.level_repo = ProgressionLevelRepository(db)
        self.completion_repo = CourseCompletionRepository(db)
        self.progress_repo = UserNodeProgressRepository(db)
        self.access_rule_repo = AccessRuleRepository(db)
        self.user_repo = UserRepository(db)

    # ===========================================
    # CONTENT CRUD
    # ===========================================

    def create_content(self, content_data: Dict[str, Any]) -> Content:
        """Create new content."""
        # Generate ID if not provided
        if not content_data.get("id"):
            content_data["id"] = str(uuid.uuid4())

        # Set defaults
        content_data.setdefault("is_path_node", False)
        content_data.setdefault("learning_path_type", "career_progression")
        content_data.setdefault("xp", 50)
        content_data.setdefault("timestamp", datetime.utcnow())

        content = self.content_repo.create(content_data)
        logger.info(f"Created content: {content.id} - {content.title}")
        
        # Invalidate cache
        invalidate_content_cache()

        return content

    def get_content_by_id(self, content_id: str) -> Content:
        """Get content by ID."""
        content = self.content_repo.get_by_id(content_id)
        if not content:
            raise NotFoundError(resource="Content", resource_id=content_id)
        return content

    def update_content(self, content_id: str, updates: Dict[str, Any]) -> Content:
        """Update content."""
        content = self.get_content_by_id(content_id)

        for key, value in updates.items():
            if hasattr(content, key) and value is not None:
                setattr(content, key, value)

        content.updated_at = datetime.utcnow()
        self.db.commit()
        self.db.refresh(content)

        logger.info(f"Updated content: {content_id}")
        return content

    def delete_content(self, content_id: str) -> bool:
        """Delete content."""
        content = self.get_content_by_id(content_id)
        self.db.delete(content)
        self.db.commit()

        logger.info(f"Deleted content: {content_id}")
        return True

    def get_all_content(
        self,
        skip: int = 0,
        limit: int = 100,
        bucket: Optional[str] = None,
        learning_path_type: Optional[str] = None,
    ) -> List[Content]:
        """Get all content with filters."""
        filters = {}
        if bucket:
            filters["bucket"] = bucket
        if learning_path_type:
            filters["learning_path_type"] = learning_path_type

        if filters:
            return self.content_repo.get_by_filter(
                filters, skip=skip, limit=limit, order_by="timestamp"
            )
        return self.content_repo.get_all(skip=skip, limit=limit, order_by="timestamp")

    def duplicate_content(self, content_id: str) -> Content:
        """Duplicate content with new ID."""
        original = self.get_content_by_id(content_id)

        new_data = {
            "id": str(uuid.uuid4()),
            "title": f"{original.title} (Copy)",
            "description": original.description,
            "bucket": original.bucket,
            "resource_type": original.resource_type,
            "video_url": original.video_url,
            "audio_url": original.audio_url,
            "file_url": original.file_url,
            "thumbnail": original.thumbnail,
            "duration": original.duration,
            "is_path_node": original.is_path_node,
            "learning_path_type": original.learning_path_type,
            "transcript": original.transcript,
            "quiz": original.quiz,
            "xp": original.xp,
        }

        return self.create_content(new_data)

    # ===========================================
    # LEARNING PATHS
    # ===========================================

    def get_learning_path_content(
        self,
        path_type: str,
        user_email: str
    ) -> Dict[str, Any]:
        """
        Get content for a learning path with user progress.
        Replicates exact logic from old monolithic backend.

        path_type: 'self_learning' or 'career_progression'
        """
        # Get user info - use optional to avoid exceptions on non-existent users
        user = self.user_repo.get_by_email(user_email)
        self_learning_completed = user.self_learning_completed if user else False

        # Optimized: Get all completion data in a single combined query using UNION
        # This reduces 3 DB round trips to 1
        try:
            from app.models.video_progress import VideoProgress
            from app.models.tracking import CourseCompletion
            from app.models.user import UserNodeProgress
            from sqlalchemy import union_all, select

            # Build union query for all completion sources
            q1 = select(CourseCompletion.course_id.label('node_id')).where(
                CourseCompletion.user_email == user_email
            )
            q2 = select(UserNodeProgress.node_id.label('node_id')).where(
                UserNodeProgress.user_email == user_email,
                UserNodeProgress.completed == True
            )
            q3 = select(VideoProgress.node_id.label('node_id')).where(
                VideoProgress.user_email == user_email,
                VideoProgress.completed == True
            )

            # Execute combined query
            combined_query = union_all(q1, q2, q3)
            results = self.db.execute(combined_query).fetchall()
            all_completed = {r[0] for r in results if r[0]}

        except Exception as e:
            # Fallback to original sequential queries if union fails
            logger.warning(f"Optimized completion query failed, using fallback: {e}")
            user_completed_courses = self.completion_repo.get_user_completed_course_ids(user_email)
            user_completed_nodes = self.progress_repo.get_user_completed_nodes(user_email)

            from app.models.video_progress import VideoProgress
            video_completed = self.db.query(VideoProgress.node_id).filter(
                VideoProgress.user_email == user_email,
                VideoProgress.completed == True
            ).all()
            video_completed_ids = {r[0] for r in video_completed}
            all_completed = user_completed_courses.union(user_completed_nodes).union(video_completed_ids)

        filtered_courses = []

        if path_type == "self_learning":
            # Self learning: MUST have learning_path_type == "self_learning"
            filtered_courses = self.content_repo.get_self_learning_content()
        else:
            # Career progression must always return the full ordered path so the UI can render
            # every node and simply mark future nodes as locked.
            filtered_courses = self.content_repo.get_career_progression_content()

        # Sort nodes in a stable linear order. Prefer explicit order_index if present.
        filtered_courses.sort(
            key=lambda x: (
                getattr(x, "order_index", 0) or 0,
                x.timestamp or datetime.min,
            )
        )

        # Build response with status
        response_nodes = []
        found_active = False

        for course in filtered_courses:
            # Build full node response with both snake_case and camelCase
            node_resp = {
                # Core identifiers
                "id": course.id,
                "title": course.title,
                "description": course.description,
                "bucket": course.bucket,
                
                # Snake_case (backend standard)
                "video_url": course.video_url,
                "audio_url": getattr(course, 'audio_url', None),
                "file_url": course.file_url,
                "thumbnail": course.thumbnail,
                "thumbnail_url": course.thumbnail,
                "learning_path_type": course.learning_path_type,
                "is_path_node": course.is_path_node,
                "resource_type": course.resource_type,
                "transcript": course.transcript,
                "quiz": course.quiz,
                "skippable": course.skippable,
                
                # CamelCase (frontend compatibility - matches old backend format)
                "videoUrl": course.video_url,
                "audioUrl": getattr(course, 'audio_url', None),
                "fileUrl": course.file_url,
                "thumbnailUrl": course.thumbnail,
                "learningPathType": course.learning_path_type,
                "isPathNode": course.is_path_node,
                "resourceType": course.resource_type,
                
                # Other fields
                "duration": course.duration,
                "xp": course.xp or 50,
                "timestamp": course.timestamp.isoformat() if course.timestamp else None,
                "authorRole": "Store Manager",  # Default from old backend
            }

            # Determine status: completed, active, or locked
            if course.id in all_completed:
                node_resp["status"] = "completed"
            elif not found_active:
                node_resp["status"] = "active"
                found_active = True
            else:
                node_resp["status"] = "locked"

            response_nodes.append(node_resp)

        # Calculate path completion
        completed_count = sum(1 for n in response_nodes if n.get("status") == "completed")
        total_count = len(response_nodes)

        # Determine if path is locked (career path locked until self-learning complete)
        is_locked = path_type == "career_progression" and not self_learning_completed

        return {
            "path_type": path_type,
            "courses": response_nodes,
            "total_courses": total_count,
            "completed_courses": completed_count,
            "progress_percent": round((completed_count / total_count * 100) if total_count > 0 else 0, 1),
            "is_locked": is_locked,
            "lock_message": "Complete Self-Learning to unlock Career Progression" if is_locked else None,
        }

    def filter_courses_by_level(
        self,
        courses: List[Content],
        user_role: str,
        user_completed_ids: Set[str]
    ) -> List[Content]:
        """Filter courses based on user's level and access rules."""
        access_rule = self.access_rule_repo.get_by_level(user_role)

        if not access_rule:
            # No restriction - return all
            return courses

        accessible_courses = set(access_rule.accessible_courses or [])
        accessible_buckets = set(access_rule.accessible_buckets or [])
        max_visible = access_rule.max_courses_visible

        filtered = []
        for course in courses:
            # Check if course is explicitly accessible
            if course.id in accessible_courses:
                filtered.append(course)
                continue

            # Check if course bucket is accessible
            if course.bucket and course.bucket in accessible_buckets:
                filtered.append(course)
                continue

            # Check if course is already completed (always show)
            if course.id in user_completed_ids:
                filtered.append(course)

        # Apply max visible limit if set
        if max_visible > 0 and len(filtered) > max_visible:
            filtered = filtered[:max_visible]

        return filtered

    # ===========================================
    # COURSE COMPLETION
    # ===========================================

    def record_course_completion(
        self,
        user_email: str,
        course_id: str,
        score: Optional[float] = None,
        time_spent_seconds: int = 0,
        quiz_data: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """Record a course completion."""
        # Check if already completed
        existing = self.completion_repo.get_by_user_and_course(user_email, course_id)
        if existing:
            return existing.to_dict()

        # Get course details
        course = self.get_content_by_id(course_id)

        completion_data = {
            "id": str(uuid.uuid4()),
            "user_email": user_email,
            "course_id": course_id,
            "course_title": course.title,
            "bucket": course.bucket,
            "learning_path_type": course.learning_path_type,
            "score": score,
            "time_spent_seconds": time_spent_seconds,
            "completed_at": datetime.utcnow(),
        }

        if quiz_data:
            completion_data["quiz_answers"] = quiz_data.get("answers")
            completion_data["quiz_correct"] = quiz_data.get("correct")
            completion_data["quiz_total"] = quiz_data.get("total")

        completion = self.completion_repo.create(completion_data)

        # Also update node progress
        self.progress_repo.upsert_progress(user_email, course_id, {
            "completed": True,
            "progress_percent": 100.0,
            "quiz_best_score": score,
        })

        logger.info(f"Recorded completion for {user_email} - {course_id}")

        return completion.to_dict()

    def get_user_completions(self, user_email: str) -> List[Dict[str, Any]]:
        """Get all completions for a user."""
        completions = self.completion_repo.get_by_user(user_email)
        return [c.to_dict() for c in completions]

    def update_node_progress(
        self,
        user_email: str,
        node_id: str,
        progress_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Update node progress (partial)."""
        progress = self.progress_repo.upsert_progress(user_email, node_id, progress_data)
        
        # Check if 100% complete, if so record formal completion
        if progress_data.get("progress_percent", 0) >= 100 or progress_data.get("completed"):
            self.record_course_completion(
                user_email, 
                node_id, 
                time_spent_seconds=progress_data.get("time_spent_seconds", 0)
            )
            
        return progress.to_dict() if hasattr(progress, 'to_dict') else dict(progress)

    # ===========================================
    # COURSE BUCKETS
    # ===========================================

    def create_bucket(self, bucket_data: Dict[str, Any]) -> CourseBucket:
        """Create a new course bucket."""
        if not bucket_data.get("id"):
            bucket_data["id"] = str(uuid.uuid4())

        bucket = self.bucket_repo.create(bucket_data)
        logger.info(f"Created bucket: {bucket.id}")
        
        # Invalidate skill categories cache since buckets are used as skill categories
        invalidate_skill_categories_cache()
        
        return bucket

    def get_bucket_by_id(self, bucket_id: str) -> CourseBucket:
        """Get bucket by ID."""
        bucket = self.bucket_repo.get_by_id(bucket_id)
        if not bucket:
            raise NotFoundError(resource="CourseBucket", resource_id=bucket_id)
        return bucket

    def update_bucket(self, bucket_id: str, updates: Dict[str, Any]) -> CourseBucket:
        """Update a bucket."""
        bucket = self.get_bucket_by_id(bucket_id)
        old_name = bucket.name  # Capture OLD name before update

        for key, value in updates.items():
            if hasattr(bucket, key) and value is not None:
                setattr(bucket, key, value)

        bucket.updated_at = datetime.utcnow()
        
        # Check if name changed to update associated content
        new_name = updates.get("name")
        
        if new_name and new_name != old_name:
            from app.models.content import Content
            # Update all content associated with this bucket
            self.db.query(Content).filter(Content.bucket_id == bucket_id).update({Content.bucket: new_name})
            # Also catch content that might check by name (legacy)
            self.db.query(Content).filter(Content.bucket == old_name).update({Content.bucket: new_name})
        
        self.db.commit()
        self.db.refresh(bucket)
        
        # Invalidate skill categories cache since buckets are used as skill categories
        invalidate_skill_categories_cache()

        return bucket

    def delete_bucket(self, bucket_id: str) -> bool:
        """
        Delete a bucket and reassign all its content to 'Uncategorized'.
        This ensures content doesn't become orphaned when buckets are deleted.
        """
        from app.models.content import Content

        # Get the bucket being deleted
        bucket = self.get_bucket_by_id(bucket_id)
        bucket_name = bucket.name

        # Find or create "Uncategorized" bucket
        uncategorized_bucket = self.bucket_repo.get_first_by_filter({"name": "Uncategorized"})
        if not uncategorized_bucket:
            # Create Uncategorized bucket if it doesn't exist
            uncategorized_data = {
                "id": "uncategorized",
                "name": "Uncategorized",
                "description": "Content without a specific category",
                "color": "#808080",
                "icon": "folder",
                "order_index": 9999
            }
            uncategorized_bucket = self.bucket_repo.create(uncategorized_data)
            logger.info("Created 'Uncategorized' bucket for orphaned content")

        # Reassign all content from the deleted bucket to "Uncategorized"
        # Update by bucket name (for backward compatibility)
        content_by_name = self.db.query(Content).filter(Content.bucket == bucket_name).all()
        for content in content_by_name:
            content.bucket = uncategorized_bucket.name
            content.bucket_id = uncategorized_bucket.id
            logger.info(f"Reassigned content '{content.title}' to Uncategorized (matched by name)")

        # Update by bucket_id (for proper foreign key relationship)
        content_by_id = self.db.query(Content).filter(Content.bucket_id == bucket_id).all()
        for content in content_by_id:
            content.bucket = uncategorized_bucket.name
            content.bucket_id = uncategorized_bucket.id
            logger.info(f"Reassigned content '{content.title}' to Uncategorized (matched by ID)")

        # Now delete the bucket
        self.db.delete(bucket)
        self.db.commit()
        
        # Invalidate skill categories cache since buckets are used as skill categories
        invalidate_skill_categories_cache()

        logger.info(f"Deleted bucket '{bucket_name}' and reassigned {len(content_by_name) + len(content_by_id)} content items to Uncategorized")
        return True

    def get_all_buckets(self) -> List[CourseBucket]:
        """Get all buckets."""
        return self.bucket_repo.get_all_ordered()

    def get_bucket_by_name(self, bucket_name: str) -> CourseBucket:
        """Get bucket by name."""
        bucket = self.bucket_repo.get_first_by_filter({"name": bucket_name})
        if not bucket:
            raise NotFoundError(resource="CourseBucket", resource_id=bucket_name)
        return bucket

    def get_bucket_by_path(self, folder_path: str) -> CourseBucket:
        """Get bucket by folder path."""
        bucket = self.bucket_repo.get_first_by_filter({"folder_path": folder_path})
        if not bucket:
            raise NotFoundError(resource="CourseBucket", resource_id=folder_path)
        return bucket

    # ===========================================
    # RESOURCES
    # ===========================================

    def create_resource(self, resource_data: Dict[str, Any]) -> Resource:
        """Create a new resource."""
        if not resource_data.get("id"):
            resource_data["id"] = str(uuid.uuid4())

        resource = self.resource_repo.create(resource_data)
        logger.info(f"Created resource: {resource.id}")
        return resource

    def get_resource_by_id(self, resource_id: str) -> Resource:
        """Get resource by ID."""
        resource = self.resource_repo.get_by_id(resource_id)
        if not resource:
            raise NotFoundError(resource="Resource", resource_id=resource_id)
        return resource

    def update_resource(self, resource_id: str, updates: Dict[str, Any]) -> Resource:
        """Update a resource."""
        resource = self.get_resource_by_id(resource_id)

        for key, value in updates.items():
            if hasattr(resource, key) and value is not None:
                setattr(resource, key, value)

        resource.updated_at = datetime.utcnow()
        self.db.commit()
        self.db.refresh(resource)

        return resource

    def delete_resource(self, resource_id: str) -> bool:
        """Delete a resource."""
        resource = self.get_resource_by_id(resource_id)
        self.db.delete(resource)
        self.db.commit()
        return True

    def get_all_resources(self, category: Optional[str] = None) -> List[Resource]:
        """Get all resources."""
        return self.resource_repo.get_active_resources(category=category)

    # ===========================================
    # ACCESS RULES
    # ===========================================

    def get_access_rules(self) -> Dict[str, Dict]:
        """Get all access rules."""
        return self.access_rule_repo.get_all_rules_dict()

    def update_access_rule(
        self,
        level_name: str,
        courses: List[str],
        buckets: List[str],
        max_visible: int = -1
    ) -> Dict[str, Any]:
        """Update access rule for a level."""
        rule = self.access_rule_repo.upsert_rule(level_name, courses, buckets, max_visible)
        return rule.to_dict()

    # ===========================================
    # PROGRESSION LEVELS
    # ===========================================

    def get_all_levels(self) -> List[Dict[str, Any]]:
        """Get all progression levels."""
        levels = self.level_repo.get_all_ordered()
        return [level.to_dict() for level in levels]

    def get_level_hierarchy(self) -> List[str]:
        """Get level names in order."""
        return self.level_repo.get_level_hierarchy()
