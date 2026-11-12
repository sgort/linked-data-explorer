import { HardDrive } from 'lucide-react';

import { useAuth } from '../../hooks/useAuth';

/** Marks an item saved while signed out: kept in this browser only (#163). */
export function LocalOnlyBadge() {
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-medium whitespace-nowrap">
      only in this browser
    </span>
  );
}

/**
 * Shown above a library list when this user's saves cannot reach the shared
 * library (#163): signed out, or signed in without lde-author.
 */
export function LocalSaveNotice() {
  const { signedIn, isAuthor } = useAuth();
  if (isAuthor) return null;
  return (
    <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
      <HardDrive size={12} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
      <span>
        {signedIn
          ? 'Saved in this browser. You need permission to save it to the shared library.'
          : 'Saved in this browser. Sign in to save it to the shared library.'}
      </span>
    </p>
  );
}
