/**
 * useOptimisticState.js
 * Optimistic UI hook — updates state immediately, then syncs with the server.
 * On server error, automatically rolls back to the previous value.
 *
 * USAGE — mark a course as complete instantly:
 *
 *   import useOptimisticState from '../hooks/useOptimisticState';
 *
 *   const [completedIds, markComplete, isSubmitting] = useOptimisticState(
 *     new Set(initialCompletedIds),   // initial state
 *     async (newSet, courseId) => {   // async action to sync with server
 *       await api.markCourseComplete(courseId);
 *     }
 *   );
 *
 *   // In your UI:
 *   <TouchableOpacity onPress={() => markComplete(prev => {
 *     const next = new Set(prev);
 *     next.add(courseId);
 *     return next;
 *   }, courseId)}>
 *     <Text>{completedIds.has(courseId) ? '✓ Done' : 'Mark Complete'}</Text>
 *   </TouchableOpacity>
 */

import { useState, useRef, useCallback } from 'react';

/**
 * @param {any}      initialState  - The initial state value.
 * @param {Function} action        - Async function that syncs the change with the server.
 *                                   Receives (newState, ...args) as arguments.
 * @returns {[state, optimisticUpdate, isPending]}
 */
export default function useOptimisticState(initialState, action) {
  const [state, setState] = useState(initialState);
  const [isPending, setIsPending] = useState(false);
  const previousState = useRef(state);

  const optimisticUpdate = useCallback(
    async (updater, ...actionArgs) => {
      // Capture current state for potential rollback
      previousState.current = state;

      // Apply optimistic update immediately — UI responds instantly
      const nextState = typeof updater === 'function' ? updater(state) : updater;
      setState(nextState);
      setIsPending(true);

      try {
        // Sync with server in the background
        await action(nextState, ...actionArgs);
      } catch (err) {
        // Server failed — roll back to previous state
        setState(previousState.current);
        console.warn('[useOptimisticState] Rollback due to error:', err?.message);
      } finally {
        setIsPending(false);
      }
    },
    [state, action]
  );

  return [state, optimisticUpdate, isPending];
}
