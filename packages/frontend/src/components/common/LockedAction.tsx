import { Lock } from 'lucide-react';
import type { ReactNode } from 'react';

import { useLockedAction } from '../../hooks/useAuth';

interface LockedActionProps {
  /** What the button does, as in "Sign in to <verb>". */
  verb: string;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  title?: string;
  children: ReactNode;
}

/**
 * A button for an action that changes shared state (#163). Signed out, or
 * signed in without lde-author, it is disabled with a lock icon and a hint
 * beside it; otherwise it is the normal button.
 */
export default function LockedAction({
  verb,
  onClick,
  disabled,
  className,
  title,
  children,
}: LockedActionProps) {
  const { locked, hint } = useLockedAction(verb);

  if (!locked) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={className}
        title={title}
      >
        {children}
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled
        aria-disabled="true"
        className={`${className ?? ''} opacity-50 cursor-not-allowed`.trim()}
        title={hint ?? undefined}
      >
        <Lock size={14} aria-hidden="true" />
        {children}
      </button>
      <span className="text-xs text-slate-500">{hint}</span>
    </span>
  );
}
