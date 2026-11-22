import { generateKeyPairSync } from 'crypto';
import express, { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';

import { createAuth } from './auth.middleware';

jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

const ISSUER = 'http://kc/realms/ronl';
const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const otherKeys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const publicPem = keys.publicKey.export({ type: 'spki', format: 'pem' }).toString();
const privatePem = keys.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const otherPrivatePem = otherKeys.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

const { requireAuthor, optionalAuthor } = createAuth({
  getKey: (_header, callback) => callback(null, publicPem),
  issuer: ISSUER,
  clients: ['linked-data-explorer', 'ttl-editor', 'lde-e2e'],
  role: 'lde-author',
});

function token(
  claims: Record<string, unknown> = {},
  opts: { key?: string; expiresIn?: number } = {}
): string {
  return jwt.sign(
    {
      iss: ISSUER,
      sub: 'user-1',
      // Keycloak access tokens carry typ Bearer; ID tokens carry typ ID (#332 M-4).
      typ: 'Bearer',
      azp: 'ttl-editor',
      realm_access: { roles: ['lde-author'] },
      ...claims,
    },
    opts.key ?? privatePem,
    { algorithm: 'RS256', expiresIn: opts.expiresIn ?? 300 }
  );
}

function appWith(mw: RequestHandler) {
  const app = express();
  app.post('/x', mw, (_req, res) => {
    res.json({ user: res.locals.user ?? null });
  });
  return app;
}

describe('requireAuthor', () => {
  const app = appWith(requireAuthor);

  test('no Authorization header answers 401 UNAUTHENTICATED', async () => {
    const res = await request(app).post('/x');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHENTICATED');
    expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
  });

  test('a non-Bearer scheme answers 401', async () => {
    const res = await request(app).post('/x').set('Authorization', 'Basic abc');
    expect(res.status).toBe(401);
  });

  test('a token signed with another key answers 401', async () => {
    const res = await request(app)
      .post('/x')
      .set('Authorization', `Bearer ${token({}, { key: otherPrivatePem })}`);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHENTICATED');
  });

  test('a token from another realm answers 401', async () => {
    const res = await request(app)
      .post('/x')
      .set('Authorization', `Bearer ${token({ iss: 'http://kc/realms/other' })}`);
    expect(res.status).toBe(401);
  });

  test('an expired token answers 401', async () => {
    const res = await request(app)
      .post('/x')
      .set('Authorization', `Bearer ${token({}, { expiresIn: -10 })}`);
    expect(res.status).toBe(401);
  });

  test("a token issued to another client (RBA's) answers 401", async () => {
    const res = await request(app)
      .post('/x')
      .set('Authorization', `Bearer ${token({ azp: 'ronl-business-api' })}`);
    expect(res.status).toBe(401);
  });

  test('an ID token is refused as a Bearer token (#332 M-4)', async () => {
    // Its mappers carry realm_access.roles too, so without the typ check it
    // would pass as an author's access token.
    const res = await request(app)
      .post('/x')
      .set('Authorization', `Bearer ${token({ typ: 'ID' })}`);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHENTICATED');
  });

  test('a token without a typ is refused', async () => {
    const res = await request(app)
      .post('/x')
      .set('Authorization', `Bearer ${token({ typ: undefined })}`);
    expect(res.status).toBe(401);
  });

  test('a valid token without lde-author answers 403 FORBIDDEN', async () => {
    const res = await request(app)
      .post('/x')
      .set('Authorization', `Bearer ${token({ realm_access: { roles: ['pa-author'] } })}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  test('a valid token with lde-author passes and exposes the user', async () => {
    const res = await request(app)
      .post('/x')
      .set('Authorization', `Bearer ${token({ preferred_username: 'x', name: 'X Y' })}`);
    expect(res.status).toBe(200);
    expect(res.body.user).toEqual({
      sub: 'user-1',
      username: 'x',
      name: 'X Y',
      roles: ['lde-author'],
    });
  });
});

describe('when the signing keys cannot be fetched (#332 M-4)', () => {
  // "Sign in again" cannot help when Keycloak itself is down, so a failed key
  // fetch answers 503, while a token naming a key the realm does not have is
  // still the caller's problem: 401.
  const withKeyError = (err: Error) =>
    createAuth({
      getKey: (_header, callback) => callback(err),
      issuer: ISSUER,
      clients: ['ttl-editor'],
      role: 'lde-author',
    });

  test('a Keycloak outage answers 503 AUTH_UNAVAILABLE, for required and optional sign-in', async () => {
    const outage = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:8080'), {
      name: 'JwksError',
    });
    const { requireAuthor: req, optionalAuthor: opt } = withKeyError(outage);

    for (const mw of [req, opt]) {
      const res = await request(appWith(mw)).post('/x').set('Authorization', `Bearer ${token()}`);
      expect(res.status).toBe(503);
      expect(res.body.code).toBe('AUTH_UNAVAILABLE');
    }
  });

  test('a token whose key the realm does not have still answers 401', async () => {
    const unknownKey = Object.assign(new Error('Unable to find a signing key that matches'), {
      name: 'SigningKeyNotFoundError',
    });
    const res = await request(appWith(withKeyError(unknownKey).requireAuthor))
      .post('/x')
      .set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHENTICATED');
  });
});

describe('optionalAuthor', () => {
  const app = appWith(optionalAuthor);

  test('without an Authorization header the request continues anonymously', async () => {
    const res = await request(app).post('/x');
    expect(res.status).toBe(200);
    expect(res.body.user).toBeNull();
  });

  test('a bad token is refused, never treated as anonymous', async () => {
    const res = await request(app)
      .post('/x')
      .set('Authorization', `Bearer ${token({}, { key: otherPrivatePem })}`);
    expect(res.status).toBe(401);
  });

  test('a valid author token sets the user', async () => {
    const res = await request(app).post('/x').set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(200);
    expect(res.body.user.sub).toBe('user-1');
  });
});
