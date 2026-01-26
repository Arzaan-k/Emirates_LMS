"""
Notification Repository
Data access layer for notification and news feed operations
"""

from typing import List, Optional
from datetime import datetime
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.repositories.base import BaseRepository
from app.models.notification import Notification, NewsFeed


class NotificationRepository(BaseRepository[Notification]):
    """Repository for Notification operations."""

    def __init__(self, db: Session):
        super().__init__(db, Notification)

    def get_for_user(
        self,
        user_email: str,
        user_store: Optional[str] = None,
        user_role: Optional[str] = None,
        skip: int = 0,
        limit: int = 50
    ) -> List[Notification]:
        """Get notifications targeted at a specific user."""
        query = self.db.query(Notification)

        # Filter by target criteria
        # A notification is for a user if:
        # - target_users is empty (all users) OR user_email is in target_users
        # - AND target_stores is empty OR user_store is in target_stores
        # - AND target_roles is empty OR user_role is in target_roles

        # This is complex with JSON fields, so we'll filter in Python
        all_notifications = query.order_by(
            Notification.is_crucial.desc(),
            Notification.created_at.desc()
        ).all()

        filtered = []
        for notif in all_notifications:
            # Check if expired
            if notif.expires_at and notif.expires_at < datetime.utcnow():
                continue

            target_users = notif.target_users or []
            target_stores = notif.target_stores or []
            target_roles = notif.target_roles or []

            # Check if notification is for this user
            user_match = len(target_users) == 0 or user_email in target_users
            store_match = len(target_stores) == 0 or (user_store and user_store in target_stores)
            role_match = len(target_roles) == 0 or (user_role and user_role in target_roles)

            if user_match and store_match and role_match:
                filtered.append(notif)

        return filtered[skip:skip + limit]

    def get_unread_count(self, user_email: str) -> int:
        """Get count of unread notifications for a user."""
        notifications = self.get_for_user(user_email)
        count = 0
        for notif in notifications:
            read_by = notif.read_by or []
            if user_email not in read_by:
                count += 1
        return count

    def mark_as_read(self, notification_id: str, user_email: str) -> Optional[Notification]:
        """Mark notification as read by a user."""
        notif = self.get_by_id(notification_id)
        if notif:
            read_by = notif.read_by or []
            if user_email not in read_by:
                read_by.append(user_email)
                notif.read_by = read_by
                self.db.commit()
                self.db.refresh(notif)
        return notif

    def mark_all_as_read(self, user_email: str) -> int:
        """Mark all notifications as read for a user."""
        notifications = self.get_for_user(user_email)
        count = 0
        for notif in notifications:
            read_by = notif.read_by or []
            if user_email not in read_by:
                read_by.append(user_email)
                notif.read_by = read_by
                count += 1
        self.db.commit()
        return count

    def get_crucial_notifications(self) -> List[Notification]:
        """Get all crucial/important notifications."""
        return self.db.query(Notification).filter(
            Notification.is_crucial == True
        ).order_by(Notification.created_at.desc()).all()

    def get_all_notifications(self) -> List[Notification]:
        """Get all notifications."""
        return self.db.query(Notification).order_by(Notification.created_at.desc()).all()

    def create_notification(self, notification_data: dict) -> Notification:
        """Create a new notification."""
        notification = Notification(**notification_data)
        self.db.add(notification)
        self.db.commit()
        self.db.refresh(notification)
        return notification

    def delete_notification(self, notification_id: str) -> bool:
        """Delete a notification."""
        notification = self.get_by_id(notification_id)
        if notification:
            self.db.delete(notification)
            self.db.commit()
            return True
        return False

    def get_crucial_unread_for_user(self, user_email: str) -> Optional[Notification]:
        """Get first unread crucial notification for a user."""
        crucial_notifications = self.db.query(Notification).filter(
            Notification.is_crucial == True
        ).order_by(Notification.created_at.desc()).all()

        for notif in crucial_notifications:
            # Check if expired
            if notif.expires_at and notif.expires_at < datetime.utcnow():
                continue

            read_by = notif.read_by or []
            if user_email not in read_by:
                return notif

        return None

    def get_all_news(self):
        """Get all news (helper for endpoint)."""
        from app.models.notification import NewsFeed
        return self.db.query(NewsFeed).filter(
            NewsFeed.is_published == True
        ).order_by(NewsFeed.created_at.desc()).all()


class NewsFeedRepository(BaseRepository[NewsFeed]):
    """Repository for NewsFeed operations."""

    def __init__(self, db: Session):
        super().__init__(db, NewsFeed)

    def get_published(self, skip: int = 0, limit: int = 20) -> List[NewsFeed]:
        """Get all published news posts."""
        return self.db.query(NewsFeed).filter(
            NewsFeed.is_published == True
        ).order_by(
            NewsFeed.is_pinned.desc(),
            NewsFeed.created_at.desc()
        ).offset(skip).limit(limit).all()

    def get_by_category(self, category: str) -> List[NewsFeed]:
        """Get news posts by category."""
        return self.db.query(NewsFeed).filter(
            NewsFeed.category == category,
            NewsFeed.is_published == True
        ).order_by(NewsFeed.created_at.desc()).all()

    def get_pinned(self) -> List[NewsFeed]:
        """Get pinned news posts."""
        return self.db.query(NewsFeed).filter(
            NewsFeed.is_pinned == True,
            NewsFeed.is_published == True
        ).order_by(NewsFeed.created_at.desc()).all()

    def toggle_like(self, news_id: str, user_email: str) -> Optional[NewsFeed]:
        """Toggle like on a news post."""
        news = self.get_by_id(news_id)
        if news:
            likes = news.likes or []
            if user_email in likes:
                likes.remove(user_email)
            else:
                likes.append(user_email)
            news.likes = likes
            self.db.commit()
            self.db.refresh(news)
        return news

    def add_comment(
        self,
        news_id: str,
        user_email: str,
        user_name: str,
        content: str
    ) -> Optional[NewsFeed]:
        """Add comment to a news post."""
        import uuid
        news = self.get_by_id(news_id)
        if news:
            comments = news.comments or []
            comments.append({
                "id": str(uuid.uuid4()),
                "author_email": user_email,
                "author_name": user_name,
                "content": content,
                "created_at": datetime.utcnow().isoformat(),
            })
            news.comments = comments
            self.db.commit()
            self.db.refresh(news)
        return news

    def increment_view_count(self, news_id: str) -> Optional[NewsFeed]:
        """Increment view count for a news post."""
        news = self.get_by_id(news_id)
        if news:
            news.view_count = (news.view_count or 0) + 1
            self.db.commit()
            self.db.refresh(news)
        return news

    def toggle_pin(self, news_id: str) -> Optional[NewsFeed]:
        """Toggle pinned status of a news post."""
        news = self.get_by_id(news_id)
        if news:
            news.is_pinned = not news.is_pinned
            self.db.commit()
            self.db.refresh(news)
        return news

    def search_news(self, search_term: str, limit: int = 20) -> List[NewsFeed]:
        """Search news posts by title and content."""
        return self.db.query(NewsFeed).filter(
            NewsFeed.is_published == True,
            or_(
                NewsFeed.title.ilike(f"%{search_term}%"),
                NewsFeed.content.ilike(f"%{search_term}%")
            )
        ).order_by(NewsFeed.created_at.desc()).limit(limit).all()

    def create_news(self, news_data: dict) -> NewsFeed:
        """Create a new news post."""
        news = NewsFeed(**news_data)
        self.db.add(news)
        self.db.commit()
        self.db.refresh(news)
        return news

    def delete_news(self, news_id: str) -> bool:
        """Delete a news post."""
        news = self.get_by_id(news_id)
        if news:
            self.db.delete(news)
            self.db.commit()
            return True
        return False
