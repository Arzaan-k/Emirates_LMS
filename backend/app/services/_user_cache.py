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
