/* eslint-disable @typescript-eslint/no-require-imports */
// Covers the mounting layer: registry entries get mounted at their declared
// path, and the legacy /api/* aliases still work but announce their
// deprecation per RFC 8594.
//
// Both the registry and the legacy route modules are replaced with trivial echo
// routers, so a failure here means the mounting logic broke — not that some
// downstream handler changed. The routers are built inside the jest.mock
// factories because those are hoisted above any module-scope declaration.

import express from 'express';
import request from 'supertest';

function mockEchoModule(name: string) {
  return () => {
    const expressLib = require('express');
    const router = expressLib.Router();
    router.get('/ping', (_req: unknown, res: { json: (b: unknown) => void }) => {
      res.json({ handledBy: name });
    });
    return { __esModule: true, default: router };
  };
}

jest.mock('./health.routes', mockEchoModule('health'));
jest.mock('./dmn.routes', mockEchoModule('dmns'));
jest.mock('./cache.routes', mockEchoModule('cache'));
jest.mock('./template.routes', mockEchoModule('templates'));
jest.mock('./chain.routes', mockEchoModule('chains'));
jest.mock('./triplydb.routes', mockEchoModule('triplydb'));
jest.mock('./vendor.routes', mockEchoModule('vendors'));

jest.mock('./registry', () => ({
  __esModule: true,
  routeRegistry: [
    {
      mount: '/v1/health',
      router: require('./health.routes').default,
      summary: 'h',
      category: 'Health & monitoring',
    },
    {
      mount: '/v1/chains/templates',
      router: require('./template.routes').default,
      summary: 't',
      category: 'Execution',
    },
    {
      mount: '/v1/chains',
      router: require('./chain.routes').default,
      summary: 'c',
      category: 'Execution',
    },
  ],
}));

import apiRouter from './index';

function makeApp() {
  const app = express();
  app.use(apiRouter);
  return app;
}

describe('v1 mounting from the registry', () => {
  test('mounts each registry entry at its declared path', async () => {
    const res = await request(makeApp()).get('/v1/health/ping');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ handledBy: 'health' });
  });

  test('preserves registry order, so a nested mount is not swallowed by its parent', async () => {
    const res = await request(makeApp()).get('/v1/chains/templates/ping');

    expect(res.body).toEqual({ handledBy: 'templates' });
  });

  test('the parent mount still serves its own paths', async () => {
    const res = await request(makeApp()).get('/v1/chains/ping');

    expect(res.body).toEqual({ handledBy: 'chains' });
  });

  test('does not invent v1 mounts that are absent from the registry', async () => {
    const res = await request(makeApp()).get('/v1/vendors/ping');

    expect(res.status).toBe(404);
  });

  test('v1 routes carry no deprecation headers', async () => {
    const res = await request(makeApp()).get('/v1/health/ping');

    expect(res.headers.deprecation).toBeUndefined();
    expect(res.headers.link).toBeUndefined();
  });
});

describe('legacy /api/* aliases', () => {
  const aliases: Array<[string, string, string]> = [
    ['/api/health/ping', '/v1/health', 'health'],
    ['/api/dmns/ping', '/v1/dmns', 'dmns'],
    ['/api/cache/ping', '/v1/cache', 'cache'],
    ['/api/chains/templates/ping', '/v1/chains/templates', 'templates'],
    ['/api/chains/ping', '/v1/chains', 'chains'],
    ['/api/triplydb/ping', '/v1/triplydb', 'triplydb'],
    ['/api/vendors/ping', '/v1/vendors', 'vendors'],
  ];

  test.each(aliases)(
    '%s still works and advertises %s as its successor',
    async (path, successor, handledBy) => {
      const res = await request(makeApp()).get(path);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ handledBy });
      expect(res.headers.deprecation).toBe('true');
      expect(res.headers.link).toBe(`<${successor}>; rel="successor-version"`);
    }
  );

  test('/api/chains/templates resolves to the template router, not the chain router', async () => {
    const res = await request(makeApp()).get('/api/chains/templates/ping');

    expect(res.body).toEqual({ handledBy: 'templates' });
    expect(res.headers.link).toBe('</v1/chains/templates>; rel="successor-version"');
  });

  test('an unknown /api/* path is not silently aliased', async () => {
    const res = await request(makeApp()).get('/api/unknown/ping');

    expect(res.status).toBe(404);
  });
});
