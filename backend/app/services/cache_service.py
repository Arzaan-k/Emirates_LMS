"""
Cache Service
In-memory caching for frequently accessed data to reduce database round trips
"""

import time
import logging
from typing import Any, Dict, Optional, Callable
from functools import wraps
from threading import Lock

logger = logging.getLogger(__name__)


class CacheService:
    """
    Simple in-memory cache with TTL (Time To Live).
    Thread-safe implementation for concurrent access.
    """
    
    def __init__(self, default_ttl: int = 300):
        """
        Initialize cache with default TTL in seconds.
        Default: 5 minutes (300 seconds)
        """
        self._cache: Dict[str, Dict[str, Any]] = {}
        self._lock = Lock()
        self.default_ttl = default_ttl
        self.hits = 0
        self.misses = 0
    
    def get(self, key: str) -> Optional[Any]:
        """Get value from cache if exists and not expired."""
        with self._lock:
            if key in self._cache:
                entry = self._cache[key]
                if time.time() < entry["expires_at"]:
                    self.hits += 1
                    return entry["value"]
                else:
                    # Expired, remove it
                    del self._cache[key]
            self.misses += 1
            return None
    
    def set(self, key: str, value: Any, ttl: Optional[int] = None) -> None:
        """Set value in cache with optional custom TTL."""
        ttl = ttl or self.default_ttl
        with self._lock:
            self._cache[key] = {
                "value": value,
                "expires_at": time.time() + ttl,
                "created_at": time.time()
            }
    
    def delete(self, key: str) -> bool:
        """Delete a specific key from cache."""
        with self._lock:
            if key in self._cache:
                del self._cache[key]
                return True
            return False
    
    def clear(self) -> None:
        """Clear all cached data."""
        with self._lock:
            self._cache.clear()
            self.hits = 0
            self.misses = 0
    
    def invalidate_pattern(self, pattern: str) -> int:
        """Invalidate all keys matching a pattern (simple prefix match)."""
        count = 0
        with self._lock:
            keys_to_delete = [k for k in self._cache.keys() if k.startswith(pattern)]
            for key in keys_to_delete:
                del self._cache[key]
                count += 1
        return count
    
    def get_stats(self) -> Dict[str, Any]:
        """Get cache statistics."""
        with self._lock:
            total = self.hits + self.misses
            hit_rate = (self.hits / total * 100) if total > 0 else 0
            return {
                "size": len(self._cache),
                "hits": self.hits,
                "misses": self.misses,
                "hit_rate": f"{hit_rate:.1f}%"
            }


# Global cache instance
cache = CacheService(default_ttl=300)  # 5 minute default TTL


def cached(key_prefix: str, ttl: int = 300):
    """
    Decorator for caching function results.
    
    Usage:
        @cached("content_list", ttl=60)
        def get_all_content():
            return db.query(Content).all()
    """
    def decorator(func: Callable):
        @wraps(func)
        def wrapper(*args, **kwargs):
            # Build cache key from prefix and args
            cache_key = f"{key_prefix}:{hash(str(args) + str(kwargs))}"
            
            # Try cache first
            cached_value = cache.get(cache_key)
            if cached_value is not None:
                logger.debug(f"Cache HIT: {cache_key}")
                return cached_value
            
            # Cache miss, call function
            logger.debug(f"Cache MISS: {cache_key}")
            result = func(*args, **kwargs)
            
            # Store in cache
            cache.set(cache_key, result, ttl)
            return result
        
        return wrapper
    return decorator


def invalidate_content_cache():
    """Invalidate all content-related caches."""
    cache.invalidate_pattern("content_")
    cache.invalidate_pattern("learning_path_")
    cache.invalidate_pattern("buckets_")
    logger.info("Content cache invalidated")


def invalidate_user_cache(user_email: str = None):
    """Invalidate user-related caches."""
    if user_email:
        cache.invalidate_pattern(f"user_{user_email}")
    else:
        cache.invalidate_pattern("user_")
    logger.info(f"User cache invalidated: {user_email or 'all'}")
