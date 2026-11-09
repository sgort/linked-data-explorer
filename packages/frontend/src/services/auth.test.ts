// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

// One fake Keycloak instance per test module load, reachable from the tests.
const kc = vi.hoisted(() => ({
  instance: null as null | Record<string, unknown>,
  config: null as unknown,
}));

vi.mock('keycloak-js', () => ({
  default: class {
    authenticated = false;
    token: string | undefined = undefined;
    tokenParsed: Record<string, unknown> | undefined = undefined;
    init = vi.fn(async () => this.authenticated);
    login = vi.fn(async () => undefined);
    logout = vi.fn(async () => undefined);
    updateToken = vi.fn(async () => true);
    constructor(config: unknown) {
      kc.config = config;
      kc.instance = this as unknown as Record<string, unknown>;
    }
  },
}));

type Fake = {
  authenticated: boolean;
  token?: string;
  tokenParsed?: Record<string, unknown>;
  init: ReturnType<typeof vi.fn>;
  login: ReturnType<typeof vi.fn>;
  logout: ReturnType<typeof vi.fn>;
  updateToken: ReturnType<typeof vi.fn>;
};

async function load() {
  vi.resetModules();
  const mod = await import('./auth');
  return { auth: mod, fake: kc.instance as unknown as Fake };
}

function signInFake(fake: Fake, roles: string[] = ['lde-author']) {
  fake.authenticated = true;
  fake.token = 'tok';
  fake.tokenParsed = { name: 'Steven G', realm_access: { roles } };
  fake.init.mockResolvedValue(true);
}

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
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
    expect(fake.init).toHaveBeenCalledWith(
      expect.objectContaining({ pkceMethod: 'S256', checkLoginIframe: false, onLoad: undefined })
    );
    expect(auth.getAuthState()).toMatchObject({ ready: true, signedIn: false, isAuthor: false });
  });

  test('someone who signed in before gets a silent check-sso on load', async () => {
    localStorage.setItem('lde.auth.wasSignedIn', '1');
    const { auth, fake } = await load();
    signInFake(fake);
    await auth.initAuth();
    expect(fake.init).toHaveBeenCalledWith(expect.objectContaining({ onLoad: 'check-sso' }));
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

  test('"Flevoland-account" goes straight to Entra', async () => {
    const { auth, fake } = await load();
    await auth.signIn('flevoland');
    expect(fake.login).toHaveBeenCalledWith(
      expect.objectContaining({ idpHint: 'entra-flevoland', redirectUri: window.location.href })
    );
    expect(localStorage.getItem('lde.auth.wasSignedIn')).toBe('1');
  });

  test('"Medewerker" asks for the employee password page', async () => {
    const { auth, fake } = await load();
    await auth.signIn('medewerker');
    expect(fake.login).toHaveBeenCalledWith(
      expect.objectContaining({ loginHint: '__medewerker__' })
    );
    expect(fake.login.mock.calls[0][0]).not.toHaveProperty('idpHint');
  });

  test('signing out forgets the flag and returns to the app', async () => {
    localStorage.setItem('lde.auth.wasSignedIn', '1');
    const { auth, fake } = await load();
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
