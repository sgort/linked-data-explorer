import express from 'express';
import request from 'supertest';

jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
jest.mock('../services/assets.service', () => ({ listPublicBundles: jest.fn() }));

import { listPublicBundles } from '../services/assets.service';
import assetsPublicRoutes from './assets.public.routes';

const mockListPublicBundles = listPublicBundles as jest.Mock;

function makeApp() {
  const app = express();
  app.use('/v1/assets-public', assetsPublicRoutes);
  return app;
}

beforeEach(() => {
  mockListPublicBundles.mockReset();
});

describe('GET /v1/assets-public', () => {
  test('returns the public bundle list', async () => {
    mockListPublicBundles.mockResolvedValue([{ id: 'p1', name: 'Zorgtoeslag' }]);

    const res = await request(makeApp()).get('/v1/assets-public');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: [{ id: 'p1', name: 'Zorgtoeslag' }] });
  });

  test('returns 500 with the error message when the service throws', async () => {
    mockListPublicBundles.mockRejectedValue(new Error('db unavailable'));

    const res = await request(makeApp()).get('/v1/assets-public');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      success: false,
      error: { code: 'LIST_FAILED', message: 'db unavailable' },
    });
  });
});
