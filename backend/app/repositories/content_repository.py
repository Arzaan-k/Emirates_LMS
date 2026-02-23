"""
Content Repository
Data access layer for content-related operations
"""

from typing import Any, Dict, List, Optional
from datetime import datetime
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.repositories.base import BaseRepository
from app.models.content import Content, CourseBucket, Resource, ProgressionLevel, AccessRule


class ContentRepository(BaseRepository[Content]):
    """Repository for Content operations."""

    def __init__(self, db: Session):
        super().__init__(db, Content)

    def get_by_bucket(self, bucket: str) -> List[Content]:
        """Get all content in a specific bucket."""
        return self.db.query(Content).filter(Content.bucket == bucket).all()

    def get_path_nodes(self, learning_path_type: Optional[str] = None) -> List[Content]:
        query = self.db.query(Content).filter(Content.is_path_node == True, Content.is_published == True)
        if learning_path_type:
            query = query.filter(Content.learning_path_type == learning_path_type)
        return query.order_by(Content.timestamp).all()

    def get_self_learning_content(self) -> List[Content]:
        """Get all self-learning content."""
        return self.db.query(Content).filter(
            Content.is_path_node == True,
            Content.is_published == True,
            Content.learning_path_type == "self_learning"
        ).order_by(Content.timestamp).all()

    def get_career_progression_content(self) -> List[Content]:
        """Get all career progression content that are path nodes."""
        return self.db.query(Content).filter(
            Content.is_path_node == True,
            Content.is_published == True,
            or_(
                Content.learning_path_type == "career_progression",
                Content.learning_path_type == None,
                Content.learning_path_type == ""
            )
        ).order_by(Content.timestamp).all()

    def get_content_by_ids(self, content_ids: List[str]) -> List[Content]:
        """Get content by list of IDs."""
        if not content_ids:
            return []
        return self.db.query(Content).filter(Content.id.in_(content_ids)).all()

    def count_by_learning_path(self, learning_path_type: str) -> int:
        """Count content by learning path type."""
        return self.db.query(func.count(Content.id)).filter(
            Content.is_path_node == True,
            Content.learning_path_type == learning_path_type
        ).scalar() or 0

    def search_content(
        self,
        search_term: str,
        bucket: Optional[str] = None,
        skip: int = 0,
        limit: int = 100
    ) -> List[Content]:
        """Search content by title and description."""
        query = self.db.query(Content)

        search_term = f"%{search_term}%"
        query = query.filter(
            or_(
                Content.title.ilike(search_term),
                Content.description.ilike(search_term)
            )
        )

        if bucket:
            query = query.filter(Content.bucket == bucket)

        return query.offset(skip).limit(limit).all()


class CourseBucketRepository(BaseRepository[CourseBucket]):
    """Repository for CourseBucket operations."""

    def __init__(self, db: Session):
        super().__init__(db, CourseBucket)

    def get_by_name(self, name: str) -> Optional[CourseBucket]:
        """Get bucket by name."""
        return self.db.query(CourseBucket).filter(CourseBucket.name == name).first()

    def get_active_buckets(self) -> List[CourseBucket]:
        """Get all active buckets."""
        return self.db.query(CourseBucket).filter(
            CourseBucket.is_active == True
        ).order_by(CourseBucket.order_index).all()

    def get_all_ordered(self) -> List[CourseBucket]:
        """Get all buckets ordered by index."""
        return self.db.query(CourseBucket).order_by(CourseBucket.order_index).all()


class ResourceRepository(BaseRepository[Resource]):
    """Repository for Resource operations."""

    def __init__(self, db: Session):
        super().__init__(db, Resource)

    def get_by_category(self, category: str) -> List[Resource]:
        """Get resources by category."""
        return self.db.query(Resource).filter(Resource.category == category).all()

    def get_active_resources(self, category: Optional[str] = None) -> List[Resource]:
        """Get all active resources."""
        query = self.db.query(Resource).filter(Resource.is_active == True)
        if category:
            query = query.filter(Resource.category == category)
        return query.order_by(Resource.created_at.desc()).all()

    def get_distinct_categories(self) -> List[str]:
        """Get list of distinct categories."""
        results = self.db.query(Resource.category).distinct().all()
        return [r[0] for r in results if r[0]]

    def increment_download_count(self, resource_id: str) -> Optional[Resource]:
        """Increment download count for a resource."""
        resource = self.get_by_id(resource_id)
        if resource:
            resource.download_count = (resource.download_count or 0) + 1
            self.db.commit()
            self.db.refresh(resource)
        return resource


class ProgressionLevelRepository(BaseRepository[ProgressionLevel]):
    """Repository for ProgressionLevel operations."""

    def __init__(self, db: Session):
        super().__init__(db, ProgressionLevel)

    def get_by_name(self, name: str) -> Optional[ProgressionLevel]:
        """Get level by name."""
        return self.db.query(ProgressionLevel).filter(ProgressionLevel.name == name).first()

    def get_all_ordered(self) -> List[ProgressionLevel]:
        """Get all levels ordered by order field."""
        return self.db.query(ProgressionLevel).order_by(ProgressionLevel.order).all()

    def get_next_level(self, current_level_name: str) -> Optional[ProgressionLevel]:
        """Get the next level after current."""
        current = self.get_by_name(current_level_name)
        if not current:
            return None

        return self.db.query(ProgressionLevel).filter(
            ProgressionLevel.order > current.order
        ).order_by(ProgressionLevel.order).first()

    def get_level_hierarchy(self) -> List[str]:
        """Get level names in order."""
        levels = self.get_all_ordered()
        return [level.name for level in levels]

    def get_all_levels(self) -> List[ProgressionLevel]:
        """Get all levels ordered by order field."""
        return self.get_all_ordered()

    def create_level(self, level_data: Dict[str, Any]) -> ProgressionLevel:
        """Create a new progression level."""
        return self.create(level_data)

    def update_level(self, level_id: str, updates: Dict[str, Any]) -> Optional[ProgressionLevel]:
        """Update a progression level."""
        return self.update(level_id, updates)

    def delete_level(self, level_id: str) -> bool:
        """Delete a progression level."""
        return self.delete(level_id)


class AccessRuleRepository(BaseRepository[AccessRule]):
    """Repository for AccessRule operations."""

    def __init__(self, db: Session):
        super().__init__(db, AccessRule)

    def get_by_level(self, level_name: str) -> Optional[AccessRule]:
        """Get access rule for a specific level."""
        return self.db.query(AccessRule).filter(AccessRule.level_name == level_name).first()

    def get_rule_by_level(self, level_name: str) -> Optional[AccessRule]:
        """Alias for get_by_level."""
        return self.get_by_level(level_name)

    def get_all_rules(self) -> List[AccessRule]:
        """Get all access rules."""
        return self.db.query(AccessRule).all()

    def get_all_rules_dict(self) -> Dict[str, Dict[str, Any]]:
        """Get all access rules as dictionary keyed by level name."""
        rules = self.db.query(AccessRule).all()
        return {
            rule.level_name: {
                "accessible_courses": rule.accessible_courses or [],
                "accessible_buckets": rule.accessible_buckets or [],
                "max_courses_visible": rule.max_courses_visible
            }
            for rule in rules
        }

    def update_rule(self, level_name: str, rule_data: Dict[str, Any]) -> AccessRule:
        """Update access rule (wrapper for upsert)."""
        return self.upsert_rule(
            level_name, 
            rule_data.get('accessible_courses', []), 
            rule_data.get('accessible_buckets', []),
            rule_data.get('max_courses_visible', -1),
            rule_data.get('prerequisites', [])
        )

    def upsert_rule(
        self,
        level_name: str,
        courses: List[str],
        buckets: List[str],
        max_visible: int = -1,
        prerequisites: List[str] = None
    ) -> AccessRule:
        """Create or update access rule."""
        rule = self.get_by_level(level_name)
        if prerequisites is None:
            prerequisites = []

        if rule:
            rule.accessible_courses = courses
            rule.accessible_buckets = buckets
            rule.max_courses_visible = max_visible
            rule.prerequisites = prerequisites
            rule.updated_at = datetime.utcnow()
            self.db.commit()
            self.db.refresh(rule)
            return rule
        else:
            return self.create({
                "level_name": level_name,
                "accessible_courses": courses,
                "accessible_buckets": buckets,
                "max_courses_visible": max_visible,
                "prerequisites": prerequisites
            })

    def add_course_to_level(self, level_name: str, course_id: str) -> bool:
        """Add a course to a level's accessible courses."""
        rule = self.get_by_level(level_name)
        
        if rule:
            courses = rule.accessible_courses or []
            if course_id not in courses:
                courses.append(course_id)
                rule.accessible_courses = courses
                self.db.commit()
        
        return True

    def remove_course_from_level(self, level_name: str, course_id: str) -> bool:
        """Remove a course from a level's accessible courses."""
        rule = self.get_by_level(level_name)
        
        if rule:
            courses = rule.accessible_courses or []
            if course_id in courses:
                courses.remove(course_id)
                rule.accessible_courses = courses
                self.db.commit()
        
        return True

    def update_course_order(self, level_name: str, course_order: List[str]) -> bool:
        """Update the order of courses for a level."""
        rule = self.get_by_level(level_name)
        
        if rule:
            rule.accessible_courses = course_order
            self.db.commit()
        
        return True

