/**
 * Sign-in with Keycloak realm `ronl`, the same login as ronl-business-api (#163).
 *
 * Signing in is optional: the app works signed out, except for the actions
 * that change shared state, which the backend only accepts from a user with
 * the realm role `lde-author`.
 *
 * Two routes, as on RBA's landing pages: "Flevoland-account" goes straight to
 * Entra (idpHint), "Medewerker" shows the realm's employee password page (the
 * login theme recognises the `__medewerker__` login hint). The realm's page
 * without a hint, meant for citizens, is never used.
 *
 * A visitor who never signed in is never redirected to Keycloak on load. After
 * a sign-in, a flag in localStorage makes the next load do a silent check-sso,
 * so the session survives a reload.
 */
import Keycloak from 'keycloak-js';

export type SignInRoute = 'flevoland' | 'medewerker';

export type AuthState = {
  ready: boolean;
  signedIn: boolean;
  isAuthor: boolean;
  name?: string;
};

export const AUTHOR_ROLE = 'lde-author';
const FLEVOLAND_IDP = 'entra-flevoland';
const MEDEWERKER_HINT = '__medewerker__';
const FLAG = 'lde.auth.wasSignedIn';

const keycloak = new Keycloak({
  url: import.meta.env.VITE_KEYCLOAK_URL,
  realm: 'ronl',
  clientId: 'linked-data-explorer',
});

let state: AuthState = { ready: false, signedIn: false, isAuthor: false };
const listeners = new Set<() => void>();
let initPromise: Promise<void> | null = null;

function setState(next: AuthState): void {
  state = next;
  listeners.forEach((fn) => fn());
}

function readFlag(): boolean {
  try {
    return localStorage.getItem(FLAG) === '1';
  } catch {
    return false;
  }
}

function writeFlag(on: boolean): void {
  try {
    if (on) localStorage.setItem(FLAG, '1');
    else localStorage.removeItem(FLAG);
  } catch {
    // Storage unavailable: the session then just does not survive a reload.
  }
}

function stateFromToken(): AuthState {
  if (!keycloak.authenticated) return { ready: true, signedIn: false, isAuthor: false };
  const token = (keycloak.tokenParsed ?? {}) as {
    name?: string;
    preferred_username?: string;
    realm_access?: { roles?: string[] };
  };
  const name = token.name ?? token.preferred_username;
  return {
    ready: true,
    signedIn: true,
    isAuthor: (token.realm_access?.roles ?? []).includes(AUTHOR_ROLE),
    ...(name ? { name } : {}),
  };
}

/** Runs once per page load; later calls share the first one's promise. */
export function initAuth(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      try {
        await keycloak.init({
          pkceMethod: 'S256',
          checkLoginIframe: false,
          onLoad: readFlag() ? 'check-sso' : undefined,
        });
      } catch {
        // Keycloak unreachable: carry on signed out.
      }
      writeFlag(Boolean(keycloak.authenticated));
      setState(stateFromToken());
    })();
  }
  return initPromise;
}

export async function signIn(route: SignInRoute): Promise<void> {
  writeFlag(true);
  await keycloak.login({
    redirectUri: window.location.href,
    ...(route === 'flevoland' ? { idpHint: FLEVOLAND_IDP } : { loginHint: MEDEWERKER_HINT }),
  });
}

export async function signOut(): Promise<void> {
  writeFlag(false);
  await keycloak.logout({ redirectUri: window.location.origin });
}

export function getAuthState(): AuthState {
  return state;
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/**
 * The Authorization header for a call to a closed route: `{}` when signed out.
 * Refreshes a token that expires within 30 seconds; when that fails, the user
 * is shown as signed out and the call goes without a token (the backend then
 * answers 401, shown as "Sign in to …").
 */
export async function authHeaders(): Promise<Record<string, string>> {
  if (!keycloak.authenticated) return {};
  try {
    await keycloak.updateToken(30);
  } catch {
    writeFlag(false);
    setState({ ready: true, signedIn: false, isAuthor: false });
    return {};
  }
  return keycloak.token ? { Authorization: `Bearer ${keycloak.token}` } : {};
}
