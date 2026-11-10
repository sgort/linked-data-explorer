// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

type Fake = {
  authenticated: boolean;
  token?: string;
  idToken?: string;
  tokenParsed?: Record<string, unknown>;
  init: ReturnType<typeof vi.fn>;
  login: ReturnType<typeof vi.fn>;
  logout: ReturnType<typeof vi.fn>;
  updateToken: ReturnType<typeof vi.fn>;
  createLoginUrl: ReturnType<typeof vi.fn>;
  createLogoutUrl: ReturnType<typeof vi.fn>;
  clearToken: ReturnType<typeof vi.fn>;
};

// Every Keycloak instance the module creates, in order. `prepare` runs on each
// new instance, so a test can decide what the next session check finds.
const kc = vi.hoisted(() => ({
  instances: [] as unknown[],
  config: null as unknown,
  prepare: null as null | ((fake: unknown) => void),
}));

vi.mock('keycloak-js', () => ({
  default: class {
    authenticated = false;
    token: string | undefined = undefined;
    idToken: string | undefined = undefined;
    tokenParsed: Record<string, unknown> | undefined = undefined;
    init = vi.fn(async () => this.authenticated);
    login = vi.fn(async () => undefined);
    logout = vi.fn(async () => undefined);
    updateToken = vi.fn(async () => true);
    createLoginUrl = vi.fn(() => 'https://kc.example/login');
    createLogoutUrl = vi.fn(() => 'https://kc.example/logout');
    clearToken = vi.fn(() => {
      this.authenticated = false;
      this.token = undefined;
    });
    constructor(config: unknown) {
      kc.config = config;
      kc.instances.push(this);
      kc.prepare?.(this);
    }
  },
}));

// A same-origin BroadcastChannel stand-in: post() delivers to every open channel
// of that name, as the callback page's message reaches every tab.
const bus = vi.hoisted(() => ({
  channels: [] as Array<{ name: string; onmessage: ((e: { data: unknown }) => void) | null }>,
  post(name: string, data: unknown) {
    bus.channels.filter((c) => c.name === name).forEach((c) => c.onmessage?.({ data }));
  },
}));
class FakeChannel {
  onmessage: ((e: { data: unknown }) => void) | null = null;
  constructor(public name: string) {
    bus.channels.push(this);
  }
  postMessage(data: unknown) {
    bus.post(this.name, data);
  }
  close() {
    bus.channels = bus.channels.filter((c) => c !== this);
  }
}

const SILENT = `${window.location.origin}/silent-check-sso.html`;
const CALLBACK = `${window.location.origin}/auth-callback.html`;

async function load() {
  vi.resetModules();
  kc.instances = [];
  const mod = await import('./auth');
  return { auth: mod, fake: kc.instances[0] as Fake };
}

const latest = () => kc.instances[kc.instances.length - 1] as Fake;

function signInFake(fake: Fake, roles: string[] = ['lde-author']) {
  fake.authenticated = true;
  fake.token = 'tok';
  fake.tokenParsed = { name: 'Steven G', realm_access: { roles } };
  fake.init.mockResolvedValue(true);
}

function openPopup(closed = false) {
  const popup = { closed };
  const open = vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window);
  return { popup, open };
}

/** Lets the module's awaits and the popup poll run. */
async function settle(ms = 0) {
  await vi.advanceTimersByTimeAsync(ms);
}

beforeEach(() => {
  localStorage.clear();
  kc.prepare = null;
  bus.channels = [];
  vi.stubGlobal('BroadcastChannel', FakeChannel);
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('auth service', () => {
  test('uses realm ronl and the linked-data-explorer client', async () => {
    await load();
    expect(kc.config).toMatchObject({ realm: 'ronl', clientId: 'linked-data-explorer' });
  });

  test('a visitor who never signed in is not sent to Keycloak on load', async () => {
    const { auth, fake } = await load();
    await auth.initAuth();
    const options = fake.init.mock.calls[0][0];
    expect(options).toMatchObject({ pkceMethod: 'S256', checkLoginIframe: false });
    expect(options.onLoad).toBeUndefined();
    expect(auth.getAuthState()).toMatchObject({ ready: true, signedIn: false, isAuthor: false });
  });

  test('someone who signed in before gets a silent check-sso in a hidden frame on load', async () => {
    localStorage.setItem('lde.auth.wasSignedIn', '1');
    const { auth, fake } = await load();
    signInFake(fake);
    await auth.initAuth();
    expect(fake.init).toHaveBeenCalledWith(
      expect.objectContaining({ onLoad: 'check-sso', silentCheckSsoRedirectUri: SILENT })
    );
    expect(auth.getAuthState()).toEqual({
      ready: true,
      signedIn: true,
      isAuthor: true,
      name: 'Steven G',
    });
  });

  test('isAuthor follows the realm role lde-author', async () => {
    localStorage.setItem('lde.auth.wasSignedIn', '1');
    const { auth, fake } = await load();
    signInFake(fake, ['pa-author']);
    await auth.initAuth();
    expect(auth.getAuthState()).toMatchObject({ signedIn: true, isAuthor: false });
  });

  test('"Medewerker" opens the employee password page in a popup; the page stays', async () => {
    const { auth, fake } = await load();
    await auth.initAuth();
    const { open } = openPopup();
    void auth.signIn('medewerker');
    expect(fake.createLoginUrl).toHaveBeenCalledWith({
      redirectUri: CALLBACK,
      loginHint: '__medewerker__',
    });
    expect(open).toHaveBeenCalledWith(
      'https://kc.example/login',
      'lde-sign-in',
      expect.any(String)
    );
    expect(fake.login).not.toHaveBeenCalled();
  });

  test('the popup opens in the middle of the browser window', async () => {
    const { auth } = await load();
    await auth.initAuth();
    vi.stubGlobal('screenX', -1920);
    vi.stubGlobal('screenY', 100);
    vi.stubGlobal('outerWidth', 1600);
    vi.stubGlobal('outerHeight', 1000);
    const { open } = openPopup();
    void auth.signIn('medewerker');
    // 520x720 centred on a window at (-1920, 100), 1600x1000 — on a monitor
    // left of the main one, so negative coordinates must survive.
    expect(open.mock.calls[0][2]).toBe('popup,width=520,height=720,left=-1380,top=240');
  });

  test('"Flevoland-account" goes straight to Entra, in the popup', async () => {
    const { auth, fake } = await load();
    await auth.initAuth();
    openPopup();
    void auth.signIn('flevoland');
    expect(fake.createLoginUrl).toHaveBeenCalledWith({
      redirectUri: CALLBACK,
      idpHint: 'entra-flevoland',
    });
  });

  test('when the popup reports back, the session is picked up without a reload', async () => {
    const { auth } = await load();
    await auth.initAuth();
    openPopup();
    const listener = vi.fn();
    auth.subscribe(listener);
    kc.prepare = (f) => signInFake(f as Fake);

    const done = auth.signIn('medewerker');
    bus.post('lde-auth', 'done');
    await done;

    expect(latest().init).toHaveBeenCalledWith(
      expect.objectContaining({ onLoad: 'check-sso', silentCheckSsoRedirectUri: SILENT })
    );
    expect(auth.getAuthState()).toMatchObject({ signedIn: true, isAuthor: true, name: 'Steven G' });
    expect(listener).toHaveBeenCalled();
    expect(localStorage.getItem('lde.auth.wasSignedIn')).toBe('1');
  });

  test('the session is also checked when the popup closes without reporting', async () => {
    const { auth } = await load();
    await auth.initAuth();
    const { popup } = openPopup();
    kc.prepare = (f) => signInFake(f as Fake);

    const done = auth.signIn('medewerker');
    popup.closed = true;
    await settle(1000);
    await done;

    expect(auth.getAuthState()).toMatchObject({ signedIn: true });
  });

  test('a popup closed without signing in leaves the user signed out', async () => {
    const { auth } = await load();
    await auth.initAuth();
    const { popup } = openPopup();

    const done = auth.signIn('medewerker');
    popup.closed = true;
    await settle(1000);
    await done;

    expect(auth.getAuthState()).toMatchObject({ signedIn: false });
    expect(localStorage.getItem('lde.auth.wasSignedIn')).toBeNull();
  });

  test('a blocked popup falls back to the full-page sign-in', async () => {
    const { auth, fake } = await load();
    await auth.initAuth();
    vi.spyOn(window, 'open').mockReturnValue(null);
    await auth.signIn('medewerker');
    expect(fake.login).toHaveBeenCalledWith(
      expect.objectContaining({ loginHint: '__medewerker__', redirectUri: window.location.href })
    );
    expect(localStorage.getItem('lde.auth.wasSignedIn')).toBe('1');
  });

  test('a sign-in in another tab reaches this one', async () => {
    const { auth } = await load();
    await auth.initAuth();
    kc.prepare = (f) => signInFake(f as Fake);
    bus.post('lde-auth', 'done');
    await settle();
    expect(auth.getAuthState()).toMatchObject({ signedIn: true });
  });

  test('signing out ends the session in a popup and stays on the page', async () => {
    localStorage.setItem('lde.auth.wasSignedIn', '1');
    const { auth, fake } = await load();
    signInFake(fake);
    await auth.initAuth();
    const { open } = openPopup();

    await auth.signOut();

    expect(fake.createLogoutUrl).toHaveBeenCalledWith({ redirectUri: CALLBACK });
    expect(open).toHaveBeenCalledWith(
      'https://kc.example/logout',
      'lde-sign-in',
      expect.any(String)
    );
    expect(fake.logout).not.toHaveBeenCalled();
    expect(auth.getAuthState()).toMatchObject({ signedIn: false, isAuthor: false });
    expect(localStorage.getItem('lde.auth.wasSignedIn')).toBeNull();
  });

  test('a blocked popup on sign-out falls back to the full-page sign-out', async () => {
    localStorage.setItem('lde.auth.wasSignedIn', '1');
    const { auth, fake } = await load();
    signInFake(fake);
    await auth.initAuth();
    vi.spyOn(window, 'open').mockReturnValue(null);
    await auth.signOut();
    expect(fake.logout).toHaveBeenCalledWith({ redirectUri: window.location.origin });
    expect(localStorage.getItem('lde.auth.wasSignedIn')).toBeNull();
  });

  test('authHeaders is empty when signed out', async () => {
    const { auth } = await load();
    await auth.initAuth();
    await expect(auth.authHeaders()).resolves.toEqual({});
  });

  test('authHeaders refreshes the token and sends it as Bearer', async () => {
    localStorage.setItem('lde.auth.wasSignedIn', '1');
    const { auth, fake } = await load();
    signInFake(fake);
    await auth.initAuth();
    await expect(auth.authHeaders()).resolves.toEqual({ Authorization: 'Bearer tok' });
    expect(fake.updateToken).toHaveBeenCalledWith(30);
  });

  test('authHeaders uses the session picked up after a popup sign-in', async () => {
    const { auth } = await load();
    await auth.initAuth();
    openPopup();
    kc.prepare = (f) => {
      signInFake(f as Fake);
      (f as Fake).token = 'fresh';
    };
    const done = auth.signIn('medewerker');
    bus.post('lde-auth', 'done');
    await done;
    await expect(auth.authHeaders()).resolves.toEqual({ Authorization: 'Bearer fresh' });
  });

  test('a failed refresh signs the user out and sends no header', async () => {
    localStorage.setItem('lde.auth.wasSignedIn', '1');
    const { auth, fake } = await load();
    signInFake(fake);
    await auth.initAuth();
    const listener = vi.fn();
    auth.subscribe(listener);
    fake.updateToken.mockRejectedValue(new Error('expired'));

    await expect(auth.authHeaders()).resolves.toEqual({});
    expect(auth.getAuthState()).toMatchObject({ signedIn: false, isAuthor: false });
    expect(listener).toHaveBeenCalled();
  });

  test('a failing Keycloak on load leaves the app usable, signed out', async () => {
    localStorage.setItem('lde.auth.wasSignedIn', '1');
    const { auth, fake } = await load();
    fake.init.mockRejectedValue(new Error('unreachable'));
    await auth.initAuth();
    expect(auth.getAuthState()).toMatchObject({ ready: true, signedIn: false });
  });
});
