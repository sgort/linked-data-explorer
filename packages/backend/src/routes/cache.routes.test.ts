import express from 'express';
import request from 'supertest';

jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
jest.mock('../services/sparql.service', () => ({
  __esModule: true,
  sparqlService: { getCacheStats: jest.fn(), clearCache: jest.fn() },
}));
jest.mock('../utils/ttl-cache', () => ({
  __esModule: true,
  allCacheStats: jest.fn(),
  clearNamedCaches: jest.fn(),
}));

import { sparqlService } from '../services/sparql.service';
import { allCacheStats, clearNamedCaches } from '../utils/ttl-cache';
import cacheRoutes from './cache.routes';
import { versionMiddleware } from '../middleware/version.middleware';
import { expectToMatchOperation } from '../openapi/testing/conformance';

const mockGetCacheStats = sparqlService.getCacheStats as jest.Mock;
const mockClearCache = sparqlService.clearCache as jest.Mock;
const mockAllCacheStats = allCacheStats as jest.Mock;
const mockClearNamedCaches = clearNamedCaches as jest.Mock;

function makeApp() {
  const app = express();
  app.use('/v1/cache', cacheRoutes);
  return app;
}

beforeEach(() => {
  mockGetCacheStats.mockReset();
  mockClearCache.mockReset();
  mockAllCacheStats.mockReset();
  mockClearNamedCaches.mockReset();
});

describe('GET /v1/cache/stats', () => {
  test('returns the cache statistics the SPARQL service reports', async () => {
    const stats = { 'https://triplydb.example/sparql': { age: 42, count: 7 } };
    mockGetCacheStats.mockReturnValue(stats);

    const res = await request(makeApp()).get('/v1/cache/stats');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual(stats);
    expect(res.body.timestamp).toEqual(expect.any(String));
  });

  test('merges shared-cache stats with SPARQL DMN stats', async () => {
    const sparqlStats = { 'https://triplydb.example/sparql': { age: 42, count: 7 } };
    const sharedStats = { 'dso-activiteit': { size: 2, ttlSeconds: 300, oldestAgeSeconds: 10 } };
    mockGetCacheStats.mockReturnValue(sparqlStats);
    mockAllCacheStats.mockReturnValue(sharedStats);

    const res = await request(makeApp()).get('/v1/cache/stats');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual({ ...sparqlStats, ...sharedStats });
    expect(res.body.data['https://triplydb.example/sparql']).toEqual(
      sparqlStats['https://triplydb.example/sparql']
    );
    expect(res.body.data['dso-activiteit']).toEqual(sharedStats['dso-activiteit']);
  });

  test('returns 500 with a CACHE_ERROR code when the service throws', async () => {
    mockGetCacheStats.mockImplementation(() => {
      throw new Error('cache backend unavailable');
    });

    const res = await request(makeApp()).get('/v1/cache/stats');

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      status: 500,
      title: 'Cache operation failed',
      detail: 'cache backend unavailable',
      code: 'CACHE_ERROR',
    });
  });
});

describe('DELETE /v1/cache/clear', () => {
  test('clears every cache when no endpoint is given', async () => {
    const res = await request(makeApp()).delete('/v1/cache/clear');

    expect(res.status).toBe(200);
    expect(mockClearCache).toHaveBeenCalledWith();
    expect(mockClearNamedCaches).toHaveBeenCalledWith();
    expect(res.body.data).toEqual({ message: 'All caches cleared', endpoint: 'all' });
  });

  test('clears only the named endpoint when one is given', async () => {
    const endpoint = 'https://triplydb.example/sparql';

    const res = await request(makeApp()).delete('/v1/cache/clear').query({ endpoint });

    expect(res.status).toBe(200);
    expect(mockClearCache).toHaveBeenCalledWith(endpoint);
    expect(mockClearNamedCaches).toHaveBeenCalledWith(endpoint);
    expect(res.body.data).toEqual({
      message: `Cache cleared for endpoint: ${endpoint}`,
      endpoint,
    });
  });

  test('clearNamedCaches and clearCache receive the same endpoint parameter', async () => {
    // The endpoint parameter doubles as a key in two namespaces:
    // - in sparqlService, a SPARQL URL selects a DMN cache;
    // - in ttl-cache registry, a name like 'dso-activiteit' selects a shared cache.
    // Both are cleared together on DELETE /v1/cache/clear?endpoint=X.
    const endpoint = 'dso-activiteit';

    const res = await request(makeApp()).delete('/v1/cache/clear').query({ endpoint });

    expect(res.status).toBe(200);
    expect(mockClearCache).toHaveBeenCalledWith(endpoint);
    expect(mockClearNamedCaches).toHaveBeenCalledWith(endpoint);
  });

  test('an empty endpoint param is treated as "clear everything"', async () => {
    const res = await request(makeApp()).delete('/v1/cache/clear').query({ endpoint: '' });

    expect(mockClearCache).toHaveBeenCalledWith();
    expect(res.body.data.endpoint).toBe('all');
  });

  test('returns 500 with a CACHE_ERROR code when clearing throws', async () => {
    mockClearCache.mockImplementation(() => {
      throw new Error('cache is locked');
    });

    const res = await request(makeApp()).delete('/v1/cache/clear');

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      status: 500,
      title: 'Cache operation failed',
      detail: 'cache is locked',
      code: 'CACHE_ERROR',
    });
  });
});

describe('/v1/cache matches its OpenAPI description', () => {
  function makeDocumentedApp() {
    const app = express();
    app.use(versionMiddleware); // app-wide in index.ts
    app.use('/v1/cache', cacheRoutes);
    return app;
  }

  test('GET /cache/stats reports entries keyed by endpoint URL', async () => {
    mockGetCacheStats.mockReturnValue({
      'https://triplydb.example/sparql': { age: 42, count: 7 },
      'https://other.example/sparql': { age: 0, count: 0 },
    });

    const res = await request(makeDocumentedApp()).get('/v1/cache/stats');

    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'get', '/cache/stats');
  });

  test('GET /cache/stats with nothing cached', async () => {
    mockGetCacheStats.mockReturnValue({});

    const res = await request(makeDocumentedApp()).get('/v1/cache/stats');

    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'get', '/cache/stats');
  });

  test('a stats entry in another shape does not match the description', async () => {
    mockGetCacheStats.mockReturnValue({
      'https://triplydb.example/sparql': { ageSeconds: 42, entries: 7 },
    });

    const res = await request(makeDocumentedApp()).get('/v1/cache/stats');

    expect(() => expectToMatchOperation(res, 'get', '/cache/stats')).toThrow(
      /must have required property 'age'/
    );
  });

  test('GET /cache/stats 500, as documented', async () => {
    mockGetCacheStats.mockImplementation(() => {
      throw new Error('cache backend unavailable');
    });

    const res = await request(makeDocumentedApp()).get('/v1/cache/stats');

    expect(res.status).toBe(500);
    expectToMatchOperation(res, 'get', '/cache/stats');
  });

  test.each([
    ['for every endpoint', '/v1/cache/clear'],
    ['for one endpoint', '/v1/cache/clear?endpoint=https%3A%2F%2Ftriplydb.example%2Fsparql'],
  ])('DELETE /cache/clear %s, as documented', async (_label, url) => {
    const res = await request(makeDocumentedApp()).delete(url);

    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'delete', '/cache/clear');
  });

  test('DELETE /cache/clear 500, as documented', async () => {
    mockClearCache.mockImplementation(() => {
      throw new Error('cache is locked');
    });

    const res = await request(makeDocumentedApp()).delete('/v1/cache/clear');

    expect(res.status).toBe(500);
    expectToMatchOperation(res, 'delete', '/cache/clear');
  });
});
