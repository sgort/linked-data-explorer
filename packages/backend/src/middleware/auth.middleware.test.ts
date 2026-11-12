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
