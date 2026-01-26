"""
Base Repository Pattern
Generic CRUD operations for all models
"""

from typing import Any, Dict, Generic, List, Optional, Type, TypeVar
from sqlalchemy import and_, or_, desc, asc, func
from sqlalchemy.orm import Session

from app.models.base import Base

# Generic type for model
ModelType = TypeVar("ModelType", bound=Base)


class BaseRepository(Generic[ModelType]):
    """
    Base repository with generic CRUD operations.
    All domain repositories should inherit from this.
    """

    def __init__(self, db: Session, model: Type[ModelType]):
        """
        Initialize repository with database session and model class.

        Args:
            db: SQLAlchemy database session
            model: SQLAlchemy model class
        """
        self.db = db
        self.model = model

    def get_by_id(self, id: Any) -> Optional[ModelType]:
        """
        Get a record by its primary key.

        Args:
            id: Primary key value

        Returns:
            Model instance or None
        """
        return self.db.query(self.model).filter(self.model.id == id).first()

    def get_all(
        self,
        skip: int = 0,
        limit: int = 100,
        order_by: Optional[str] = None,
        order_desc: bool = True,
    ) -> List[ModelType]:
        """
        Get all records with pagination.

        Args:
            skip: Number of records to skip
            limit: Maximum number of records to return
            order_by: Column name to order by
            order_desc: Whether to order descending

        Returns:
            List of model instances
        """
        query = self.db.query(self.model)

        if order_by and hasattr(self.model, order_by):
            column = getattr(self.model, order_by)
            query = query.order_by(desc(column) if order_desc else asc(column))

        return query.offset(skip).limit(limit).all()

    def get_count(self, filters: Optional[Dict[str, Any]] = None) -> int:
        """
        Get count of records with optional filters.

        Args:
            filters: Dictionary of column=value filters

        Returns:
            Count of matching records
        """
        query = self.db.query(func.count(self.model.id))

        if filters:
            for key, value in filters.items():
                if hasattr(self.model, key):
                    query = query.filter(getattr(self.model, key) == value)

        return query.scalar() or 0

    def create(self, data: Dict[str, Any]) -> ModelType:
        """
        Create a new record.

        Args:
            data: Dictionary of column values

        Returns:
            Created model instance
        """
        instance = self.model(**data)
        self.db.add(instance)
        self.db.commit()
        self.db.refresh(instance)
        return instance

    def update(self, id: Any, data: Dict[str, Any]) -> Optional[ModelType]:
        """
        Update a record by ID.

        Args:
            id: Primary key value
            data: Dictionary of column values to update

        Returns:
            Updated model instance or None
        """
        instance = self.get_by_id(id)
        if instance:
            for key, value in data.items():
                if hasattr(instance, key) and value is not None:
                    setattr(instance, key, value)
            self.db.commit()
            self.db.refresh(instance)
        return instance

    def delete(self, id: Any) -> bool:
        """
        Delete a record by ID.

        Args:
            id: Primary key value

        Returns:
            True if deleted, False if not found
        """
        instance = self.get_by_id(id)
        if instance:
            self.db.delete(instance)
            self.db.commit()
            return True
        return False

    def exists(self, id: Any) -> bool:
        """
        Check if a record exists.

        Args:
            id: Primary key value

        Returns:
            True if exists, False otherwise
        """
        return self.db.query(
            self.db.query(self.model).filter(self.model.id == id).exists()
        ).scalar()

    def get_by_filter(
        self,
        filters: Dict[str, Any],
        skip: int = 0,
        limit: int = 100,
        order_by: Optional[str] = None,
        order_desc: bool = True,
    ) -> List[ModelType]:
        """
        Get records matching filter criteria.

        Args:
            filters: Dictionary of column=value filters
            skip: Number of records to skip
            limit: Maximum records to return
            order_by: Column name to order by
            order_desc: Whether to order descending

        Returns:
            List of matching model instances
        """
        query = self.db.query(self.model)

        for key, value in filters.items():
            if hasattr(self.model, key):
                if value is None:
                    query = query.filter(getattr(self.model, key).is_(None))
                elif isinstance(value, list):
                    query = query.filter(getattr(self.model, key).in_(value))
                else:
                    query = query.filter(getattr(self.model, key) == value)

        if order_by and hasattr(self.model, order_by):
            column = getattr(self.model, order_by)
            query = query.order_by(desc(column) if order_desc else asc(column))

        return query.offset(skip).limit(limit).all()

    def get_first_by_filter(self, filters: Dict[str, Any]) -> Optional[ModelType]:
        """
        Get first record matching filter criteria.

        Args:
            filters: Dictionary of column=value filters

        Returns:
            First matching model instance or None
        """
        results = self.get_by_filter(filters, limit=1)
        return results[0] if results else None

    def bulk_create(self, items: List[Dict[str, Any]]) -> List[ModelType]:
        """
        Create multiple records at once.

        Args:
            items: List of dictionaries with column values

        Returns:
            List of created model instances
        """
        instances = [self.model(**item) for item in items]
        self.db.add_all(instances)
        self.db.commit()
        for instance in instances:
            self.db.refresh(instance)
        return instances

    def bulk_update(self, updates: List[Dict[str, Any]]) -> int:
        """
        Update multiple records at once.
        Each update dict must include 'id' key.

        Args:
            updates: List of dictionaries with 'id' and update values

        Returns:
            Count of updated records
        """
        count = 0
        for update_data in updates:
            id_value = update_data.pop('id', None)
            if id_value and self.update(id_value, update_data):
                count += 1
        return count

    def search(
        self,
        search_term: str,
        search_columns: List[str],
        skip: int = 0,
        limit: int = 100,
    ) -> List[ModelType]:
        """
        Search records by term across multiple columns.

        Args:
            search_term: Search string
            search_columns: List of column names to search
            skip: Number of records to skip
            limit: Maximum records to return

        Returns:
            List of matching model instances
        """
        query = self.db.query(self.model)

        conditions = []
        for column_name in search_columns:
            if hasattr(self.model, column_name):
                column = getattr(self.model, column_name)
                conditions.append(column.ilike(f"%{search_term}%"))

        if conditions:
            query = query.filter(or_(*conditions))

        return query.offset(skip).limit(limit).all()
