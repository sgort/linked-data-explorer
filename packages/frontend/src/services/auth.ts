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
 * The login runs in a popup, so the page never reloads and whatever the user
 * has open (a process on the canvas, a query, unsaved edits) stays. The popup
 * returns to /auth-callback.html, which announces itself on the BroadcastChannel
 * `lde-auth` and closes; this page then picks up the new Keycloak session with
 * a silent check-sso in a hidden frame (/silent-check-sso.html). Keycloak and
 * the app are same-site in every environment, so the frame sees the session
 * cookie. If the browser blocks the popup, the full-page redirect is the
 * fallback. Signing out works the same way.
 *
 * A visitor who never signed in is never sent to Keycloak on load. After a
 * sign-in, a flag in localStorage makes the next load do the silent check-sso,
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
const CHANNEL = 'lde-auth';
const POPUP_NAME = 'lde-sign-in';
const POPUP_WIDTH = 520;
const POPUP_HEIGHT = 720;
/** How often to look whether the popup was closed without reporting back. */
const POPUP_POLL_MS = 500;

function createKeycloak(): Keycloak {
  return new Keycloak({
    url: import.meta.env.VITE_KEYCLOAK_URL,
    realm: 'ronl',
    clientId: 'linked-data-explorer',
  });
}

// Replaced by a fresh instance after a popup sign-in: keycloak-js initialises
// an instance only once, and the session check needs a new init.
let keycloak = createKeycloak();
let channel: BroadcastChannel | null = null;
// Set while this tab waits for its own popup, so its report finishes that wait
// instead of starting a second session check.
let popupReported: (() => void) | null = null;

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

/**
 * Centred on the browser window, not the screen: on a second monitor the
 * window's own position counts, and screenX is negative left of the main one.
 */
function popupFeatures(): string {
  const left = Math.round(window.screenX + (window.outerWidth - POPUP_WIDTH) / 2);
  const top = Math.round(window.screenY + (window.outerHeight - POPUP_HEIGHT) / 2);
  return `popup,width=${POPUP_WIDTH},height=${POPUP_HEIGHT},left=${left},top=${top}`;
}

const appUrl = (path: string) => `${window.location.origin}${path}`;

/** init() for `instance`; with `checkSso`, a silent check in a hidden frame. */
async function initInstance(instance: Keycloak, checkSso: boolean): Promise<void> {
  try {
    await instance.init({
      pkceMethod: 'S256',
      checkLoginIframe: false,
      ...(checkSso
        ? { onLoad: 'check-sso', silentCheckSsoRedirectUri: appUrl('/silent-check-sso.html') }
        : {}),
    });
  } catch {
    // Keycloak unreachable: carry on signed out.
  }
  keycloak = instance;
  writeFlag(Boolean(instance.authenticated));
  setState(stateFromToken());
}

/** Picks up the session Keycloak now has (or no longer has), without a reload. */
function checkSession(): Promise<void> {
  return initInstance(createKeycloak(), true);
}

/** A popup in this or another tab finished signing in or out. */
function listen(): void {
  if (channel || typeof BroadcastChannel === 'undefined') return;
  channel = new BroadcastChannel(CHANNEL);
  channel.onmessage = () => {
    if (popupReported) popupReported();
    else void checkSession();
  };
}

/** Resolves when the popup reports back, or is closed. */
function waitForPopup(popup: Window): Promise<void> {
  return new Promise((resolve) => {
    const finish = () => {
      clearInterval(timer);
      popupReported = null;
      resolve();
    };
    popupReported = finish;
    const timer = setInterval(() => {
      if (popup.closed) finish();
    }, POPUP_POLL_MS);
  });
}

/** Runs once per page load; later calls share the first one's promise. */
export function initAuth(): Promise<void> {
  if (!initPromise) {
    listen();
    initPromise = initInstance(keycloak, readFlag());
  }
  return initPromise;
}

/**
 * Opens the login in a popup and, once it reports back, picks up the session.
 * The popup is opened before the first await, while the click still counts as
 * the user's, so the browser does not block it.
 */
export async function signIn(route: SignInRoute): Promise<void> {
  const hint = route === 'flevoland' ? { idpHint: FLEVOLAND_IDP } : { loginHint: MEDEWERKER_HINT };
  const popup = window.open(
    keycloak.createLoginUrl({ redirectUri: appUrl('/auth-callback.html'), ...hint }),
    POPUP_NAME,
    popupFeatures()
  );
  if (!popup) {
    writeFlag(true);
    await keycloak.login({ redirectUri: window.location.href, ...hint });
    return;
  }
  await waitForPopup(popup);
  await checkSession();
}

/** Ends the Keycloak session in a popup; this page is signed out at once. */
export async function signOut(): Promise<void> {
  writeFlag(false);
  const popup = window.open(
    keycloak.createLogoutUrl({ redirectUri: appUrl('/auth-callback.html') }),
    POPUP_NAME,
    popupFeatures()
  );
  if (!popup) {
    await keycloak.logout({ redirectUri: window.location.origin });
    return;
  }
  keycloak.clearToken();
  setState({ ready: true, signedIn: false, isAuthor: false });
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
