import express from 'express';
import request from 'supertest';

jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
jest.mock('../services/ropa.service', () => ({ listPublicRopa: jest.fn() }));

import { listPublicRopa } from '../services/ropa.service';
import ropaPublicRoutes from './ropa.public.routes';

const mockListPublicRopa = listPublicRopa as jest.Mock;

function makeApp() {
  const app = express();
  app.use('/v1/ropa-public', ropaPublicRoutes);
  return app;
}

beforeEach(() => {
  mockListPublicRopa.mockReset();
});

describe('GET /v1/ropa-public', () => {
  test('returns the public ROPA list', async () => {
    mockListPublicRopa.mockResolvedValue([{ id: 'r1', title: 'Zorgtoeslag' }]);

    const res = await request(makeApp()).get('/v1/ropa-public');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: [{ id: 'r1', title: 'Zorgtoeslag' }] });
  });

  test('forwards the organisation query param', async () => {
    mockListPublicRopa.mockResolvedValue([]);

    await request(makeApp()).get('/v1/ropa-public').query({ organisation: 'Flevoland' });

    expect(mockListPublicRopa).toHaveBeenCalledWith('Flevoland');
  });

  test('returns 500 with the error message when the service throws', async () => {
    mockListPublicRopa.mockRejectedValue(new Error('db unavailable'));

    const res = await request(makeApp()).get('/v1/ropa-public');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      success: false,
      error: { code: 'LIST_FAILED', message: 'db unavailable' },
    });
  });
});
