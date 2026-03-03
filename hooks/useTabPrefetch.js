/**
 * useTabPrefetch.js
 * Prefetches data for adjacent tabs while the user is on the current tab.
 * This makes tab switches feel instant because data is already in cache.
 *
 * USAGE:
 *   import useTabPrefetch from '../hooks/useTabPrefetch';
 *
 *   // In your HomeScreen component:
 *   useTabPrefetch([
 *     { url: `${API_URL}/api/v1/self-learning/buckets?user_email=${email}`, ttl: 120000 },
 *     { url: `${API_URL}/api/v1/analytics/dashboard`, ttl: 60000 },
 *   ], headers);
 *
 * HOW IT WORKS:
 *   After a 2-second delay (so it doesn't compete with the current tab's load),
 *   it silently prefetches each URL and stores the result in requestCache.
 *   When the user navigates to the next tab, cachedFetch returns data instantly.
 */

import { useEffect } from 'react';
import { prefetch } from '../utils/requestCache';

/**
 * @param {Array<{url: string, ttl?: number}>} urls - URLs to prefetch.
 * @param {object} headers - Auth headers to include in prefetch requests.
 * @param {number} delayMs - Delay before prefetching starts (default 2000ms).
 */
export default function useTabPrefetch(urls = [], headers = {}, delayMs = 2000) {
  useEffect(() => {
    if (!urls.length) return;

    // Delay prefetching so it doesn't compete with the active tab's initial load
    const timer = setTimeout(() => {
      urls.forEach(({ url, ttl }) => {
        if (url) prefetch(url, headers, ttl);
      });
    }, delayMs);

    return () => clearTimeout(timer);
  }, [delayMs, urls, headers?.Authorization]);
}
