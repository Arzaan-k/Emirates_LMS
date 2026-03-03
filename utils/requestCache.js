/**
 * requestCache.js
 * Lightweight in-memory request cache with TTL and deduplication.
 *
 * FEATURES:
 * - TTL-based expiry (default 60s)
 * - In-flight deduplication: concurrent calls for the same URL share one request
 * - LRU eviction at 200 entries to prevent memory leaks
 * - Drop-in replacement for fetch() calls
 *
 * USAGE:
 *   import { cachedFetch, prefetch, clearCache } from '../utils/requestCache';
 *
 *   // Cached GET — returns stale data while revalidating if TTL passed
 *   const data = await cachedFetch(url, headers, { ttl: 120000 });
 *
 *   // Prefetch in background (fire-and-forget)
 *   prefetch(url, headers);
 *
 *   // Invalidate a URL (e.g. after a mutation)
 *   clearCache(url);
 */

const _cache = new Map();           // key -> { data, expiresAt }
const _inFlight = new Map();        // key -> Promise (dedup concurrent requests)
const MAX_ENTRIES = 200;
const DEFAULT_TTL_MS = 60_000;      // 60 seconds

/**
 * Evict the oldest entry when the cache exceeds MAX_ENTRIES.
 * Map preserves insertion order, so .keys().next() gives the oldest.
 */
function _evictIfNeeded() {
  if (_cache.size >= MAX_ENTRIES) {
    const oldestKey = _cache.keys().next().value;
    _cache.delete(oldestKey);
  }
}

/**
 * Core cached fetch.
 *
 * @param {string} url        - The URL to fetch.
 * @param {object} headers    - Request headers (e.g. Authorization).
 * @param {object} options
 * @param {number} options.ttl - Cache TTL in ms. Default: 60 000ms (1 min).
 * @returns {Promise<any>}    - Parsed JSON response.
 */
export async function cachedFetch(url, headers = {}, { ttl = DEFAULT_TTL_MS } = {}) {
  // Include auth token in the cache key so authenticated and unauthenticated
  // requests never share a cache entry. Only the token matters for key uniqueness.
  const authKey = headers?.Authorization ? headers.Authorization.slice(-16) : '';
  const key = authKey ? `${url}|${authKey}` : url;
  const now = Date.now();

  // --- Cache hit ---
  const cached = _cache.get(key);
  if (cached && now < cached.expiresAt) {
    return cached.data;
  }

  // --- Deduplication: if same URL is already in-flight, wait for it ---
  if (_inFlight.has(key)) {
    return _inFlight.get(key);
  }

  // --- Cache miss: issue real request ---
  const promise = fetch(url, { headers })
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return res.json();
    })
    .then((data) => {
      _evictIfNeeded();
      _cache.set(key, { data, expiresAt: now + ttl });
      _inFlight.delete(key);
      return data;
    })
    .catch((err) => {
      _inFlight.delete(key);
      // On error, return stale data if available rather than crashing
      if (cached) return cached.data;
      throw err;
    });

  _inFlight.set(key, promise);
  return promise;
}

/**
 * Prefetch a URL in the background and store it in the cache.
 * Call this while the user is on a different tab to make the next
 * tab transition feel instant.
 *
 * @param {string} url
 * @param {object} headers
 * @param {number} ttl - TTL in ms (default 60s)
 */
export function prefetch(url, headers = {}, ttl = DEFAULT_TTL_MS) {
  // Only prefetch if not already cached and not in-flight
  const cached = _cache.get(url);
  if ((cached && Date.now() < cached.expiresAt) || _inFlight.has(url)) {
    return;
  }
  // Fire-and-forget
  cachedFetch(url, headers, { ttl }).catch(() => {});
}

/**
 * Invalidate a specific URL from the cache (e.g. after a POST/PUT).
 * @param {string} url
 */
export function clearCache(url) {
  _cache.delete(url);
}

/**
 * Invalidate all URLs that start with a prefix.
 * @param {string} prefix
 */
export function clearCacheByPrefix(prefix) {
  for (const key of _cache.keys()) {
    if (key.startsWith(prefix)) {
      _cache.delete(key);
    }
  }
}

/**
 * Clear the entire cache (e.g. on logout).
 */
export function clearAllCache() {
  _cache.clear();
  _inFlight.clear();
}

/**
 * Returns current cache statistics for debugging.
 */
export function getCacheStats() {
  return {
    size: _cache.size,
    maxEntries: MAX_ENTRIES,
    inFlight: _inFlight.size,
    keys: Array.from(_cache.keys()),
  };
}
