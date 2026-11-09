import { useSyncExternalStore } from 'react';

import { type AuthState, getAuthState, subscribe } from '../services/auth';

/** The current sign-in state; re-renders when it changes (#163). */
export function useAuth(): AuthState {
  return useSyncExternalStore(subscribe, getAuthState);
}

/**
 * Whether an action that changes shared state is locked for this user, and the
 * hint to show beside it (#163). `hint` is null when the action is allowed.
 */
export function useLockedAction(verb: string): { locked: boolean; hint: string | null } {
  const { signedIn, isAuthor } = useAuth();
  if (isAuthor) return { locked: false, hint: null };
  return {
    locked: true,
    hint: signedIn ? `You need permission to ${verb}` : `Sign in to ${verb}`,
  };
}

/**
 * For a list item's Delete (#163): a shared item needs lde-author, an item kept
 * in this browser can always go. Returns the lock and the hint for that item.
 */
export function useDeleteLock(): (item: { localOnly?: boolean }) => {
  locked: boolean;
  hint: string | null;
} {
  const lock = useLockedAction('delete');
  return (item) => (item.localOnly ? { locked: false, hint: null } : lock);
}
