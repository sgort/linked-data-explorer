import express, { Express } from 'express';
import request from 'supertest';

jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

jest.mock('../utils/config', () => ({
  config: {
    // The trailing space mirrors a real CORS_ORIGIN app setting, which is a
    // hand-maintained comma-separated list; the middleware trims each entry.
    corsOrigin: ['https://allowed.example', ' https://spaced.example '],
  },
}));

import { corsMiddleware } from './cors.middleware';
import { errorHandler, notFoundHandler } from './error.middleware';

const ALLOWED = 'https://allowed.example';
const UNLISTED = 'https://iou-architectuur.open-regels.nl';

/**
 * Mirrors the middleware order of src/index.ts: CORS, then routes, then the
 * 404 and error handlers. The error handler matters — before #145 a disallowed
 * origin reached it and answered with the 500 INTERNAL_ERROR envelope.
 */
const buildApp = (): Express => {
  const app = express();
  app.use(corsMiddleware);
  app.options('*', corsMiddleware);
  app.get('/v1/health', (_req, res) => {
    res.json({ success: true });
  });
  app.get('/v1/openapi.json', (_req, res) => {
    res.json({ openapi: '3.1.0' });
  });
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
};

describe('corsMiddleware — disallowed origins', () => {
  test('a simple request from an unlisted origin is not a server error', async () => {
    const res = await request(buildApp()).get('/v1/health').set('Origin', UNLISTED);

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  test('a preflight request from an unlisted origin is not a server error', async () => {
    const res = await request(buildApp())
      .options('/v1/health')
      .set('Origin', UNLISTED)
      .set('Access-Control-Request-Method', 'GET');

    expect(res.status).toBeLessThan(500);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  test('no INTERNAL_ERROR envelope is produced for an unlisted origin', async () => {
    const res = await request(buildApp()).get('/v1/health').set('Origin', UNLISTED);

    expect(res.body).not.toMatchObject({ error: { code: 'INTERNAL_ERROR' } });
  });
});

describe('corsMiddleware — allowed origins', () => {
  test('an allowlisted origin is echoed back with credentials enabled', async () => {
    const res = await request(buildApp()).get('/v1/health').set('Origin', ALLOWED);

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe(ALLOWED);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  test('a preflight from an allowlisted origin is answered with the allowed methods', async () => {
    const res = await request(buildApp())
      .options('/v1/health')
      .set('Origin', ALLOWED)
      .set('Access-Control-Request-Method', 'GET');

    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe(ALLOWED);
    expect(res.headers['access-control-allow-methods']).toBe('GET,POST,PUT,PATCH,DELETE,OPTIONS');
  });

  test('surrounding whitespace in a CORS_ORIGIN entry is trimmed', async () => {
    const res = await request(buildApp()).get('/v1/health').set('Origin', 'https://spaced.example');

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('https://spaced.example');
  });

  test('a request with no Origin header is served, as curl and server-to-server callers send none', async () => {
    const res = await request(buildApp()).get('/v1/health');

    expect(res.status).toBe(200);
  });
});

describe('corsMiddleware — public mounts', () => {
  test('a public mount answers any origin with a wildcard', async () => {
    const res = await request(buildApp()).get('/v1/openapi.json').set('Origin', UNLISTED);

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('*');
  });
});
