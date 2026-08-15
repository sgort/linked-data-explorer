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

import { sparqlService } from '../services/sparql.service';
import cacheRoutes from './cache.routes';

const mockGetCacheStats = sparqlService.getCacheStats as jest.Mock;
const mockClearCache = sparqlService.clearCache as jest.Mock;

function makeApp() {
  const app = express();
  app.use('/v1/cache', cacheRoutes);
  return app;
}

beforeEach(() => {
  mockGetCacheStats.mockReset();
  mockClearCache.mockReset();
});

describe('GET /v1/cache/stats', () => {
  test('returns the cache statistics the SPARQL service reports', async () => {
    const stats = [{ endpoint: 'https://triplydb.example/sparql', ageSeconds: 42, entries: 7 }];
    mockGetCacheStats.mockReturnValue(stats);

    const res = await request(makeApp()).get('/v1/cache/stats');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual(stats);
    expect(res.body.timestamp).toEqual(expect.any(String));
  });

  test('returns 500 with a CACHE_ERROR code when the service throws', async () => {
    mockGetCacheStats.mockImplementation(() => {
      throw new Error('cache backend unavailable');
    });

    const res = await request(makeApp()).get('/v1/cache/stats');

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      success: false,
      error: { code: 'CACHE_ERROR', message: 'cache backend unavailable' },
    });
  });
});

describe('DELETE /v1/cache/clear', () => {
  test('clears every cache when no endpoint is given', async () => {
    const res = await request(makeApp()).delete('/v1/cache/clear');

    expect(res.status).toBe(200);
    expect(mockClearCache).toHaveBeenCalledWith();
    expect(res.body.data).toEqual({ message: 'All caches cleared', endpoint: 'all' });
  });

  test('clears only the named endpoint when one is given', async () => {
    const endpoint = 'https://triplydb.example/sparql';

    const res = await request(makeApp()).delete('/v1/cache/clear').query({ endpoint });

    expect(res.status).toBe(200);
    expect(mockClearCache).toHaveBeenCalledWith(endpoint);
    expect(res.body.data).toEqual({
      message: `Cache cleared for endpoint: ${endpoint}`,
      endpoint,
    });
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
      success: false,
      error: { code: 'CACHE_ERROR', message: 'cache is locked' },
    });
  });
});
