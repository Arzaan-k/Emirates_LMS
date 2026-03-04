"""
_user_cache.py
Shared process-level cache for the full user list.

Imported by access_control_service, user_service, and the /users endpoints.
A single module-level object is shared across all threads in one process,
so the first request pays the DB cost; all others within the TTL are free.

Usage:
    from app.services._user_cache import user_cache

    users = user_cache.get()
    if users is None:
        users = db.query(User).all()
        user_cache.set(users)

    user_cache.invalidate()  # call after any user write
"""

import time
import threading
import logging

logger = logging.getLogger(__name__)

_TTL = 90.0  # seconds


class CachedUser:
    """Thread-safe representation of a User object."""
    def __init__(self, **kwargs):
        self.__dict__.update(kwargs)

    def to_dict(self):
        """Convert to dictionary for API responses."""
        # Ensure privileges is always a list, never null
        privileges = getattr(self, "privileges", [])
        if not isinstance(privileges, list):
            privileges = []

        is_super = getattr(self, "is_superadmin", False)
        # If user is superadmin, automatically grant all privileges for frontend compatibility
        if is_super:
            from app.services.user_service import ALL_PRIVILEGES
            privileges = ALL_PRIVILEGES

        created_at = getattr(self, "created_at", None)
        
        return {
            "id": getattr(self, "id", None),
            "email": getattr(self, "email", None),
            "name": getattr(self, "name", None),
            "role": getattr(self, "role", None),
            "category": getattr(self, "category", None),
            "privileges": privileges,
            "is_superadmin": is_super or False,
            "has_admin_access": getattr(self, "has_admin_access", False) or False,
            "store": getattr(self, "store", None),
            "self_learning_completed": getattr(self, "self_learning_completed", False) or False,
            "is_external": getattr(self, "is_external", False) or False,
            "joined_at_level": getattr(self, "joined_at_level", None),
            "profile_data": getattr(self, "profile_data", {}) or {},
            "created_at": created_at.isoformat() if created_at and hasattr(created_at, "isoformat") else str(created_at) if created_at else None,
        }

class _UserCache:
    def __init__(self):
        self._lock = threading.Lock()
        self._data = None
        self._expires = 0.0

    def get(self):
        """Return cached list, or None if empty/expired."""
        # Fast path: no lock needed for read if data is valid
        if self._data is not None and time.monotonic() < self._expires:
            return self._data
        return None

    def set(self, users: list) -> None:
        """Store the full user list and reset TTL."""
        with self._lock:
            if users and hasattr(users[0], '__table__'):
                # Convert ORM instances to detached CachedUser objects to prevent cross-thread Session issues
                safe_users = []
                for u in users:
                    d = {c.name: getattr(u, c.name) for c in u.__table__.columns}
                    safe_users.append(CachedUser(**d))
                self._data = safe_users
            else:
                self._data = users
            self._expires = time.monotonic() + _TTL
        logger.debug(f"[UserCache] Populated with {len(users)} users, TTL={_TTL}s")

    def invalidate(self) -> None:
        """Flush the cache (call after any user create/update/delete)."""
        with self._lock:
            self._data = None
            self._expires = 0.0
        logger.debug("[UserCache] Invalidated")


user_cache = _UserCache()
