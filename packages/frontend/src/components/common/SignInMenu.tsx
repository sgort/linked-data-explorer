import { LogIn, LogOut, User } from 'lucide-react';
import { useState } from 'react';

import { useAuth } from '../../hooks/useAuth';
import { signIn, type SignInRoute, signOut } from '../../services/auth';

const ROUTES: Array<{ route: SignInRoute; label: string }> = [
  { route: 'flevoland', label: 'Flevoland-account' },
  { route: 'medewerker', label: 'Medewerker' },
];

/**
 * Header sign-in (#163): two routes, as on RBA's landing pages. Signed in, it
 * shows the user's name and "Sign out".
 */
export default function SignInMenu() {
  const { signedIn, name } = useAuth();
  const [open, setOpen] = useState(false);

  if (signedIn) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-700">
        <User size={16} aria-hidden="true" />
        <span>{name}</span>
        <button
          type="button"
          onClick={() => void signOut()}
          className="ml-2 inline-flex items-center gap-1 text-slate-500 hover:text-slate-800"
        >
          <LogOut size={14} aria-hidden="true" />
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50"
      >
        <LogIn size={14} aria-hidden="true" />
        Sign in
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-1 w-48 rounded-md border border-slate-200 bg-white shadow-lg z-50"
        >
          {ROUTES.map(({ route, label }) => (
            <button
              key={route}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                void signIn(route);
              }}
              className="block w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
