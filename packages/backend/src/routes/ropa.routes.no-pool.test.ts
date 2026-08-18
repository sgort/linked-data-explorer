// Covers the "DB not configured" (pool === null) guard on every /v1/assets/ropa
// route. Kept in its own file with a single static mock, matching the split used
// by ropa.service.no-pool.test.ts.
import express from 'express';
import request from 'supertest';

jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
jest.mock('../db/pool', () => ({ __esModule: true, default: null }));
jest.mock('../services/ropa.service', () => ({
  __esModule: true,
  listRopa: jest.fn(),
  getRopaByBpmnProcessId: jest.fn(),
  upsertRopa: jest.fn(),
  deleteRopa: jest.fn(),
  listPublicRopa: jest.fn(),
}));

import * as ropaService from '../services/ropa.service';
import ropaRoutes from './ropa.routes';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/v1/assets/ropa', ropaRoutes);
  return app;
}

const EXPECTED = {
  success: false,
  error: { code: 'DB_NOT_CONFIGURED', message: 'Asset storage not configured' },
};

describe('/v1/assets/ropa with no database configured', () => {
  test.each([
    ['get', '/v1/assets/ropa'],
    ['get', '/v1/assets/ropa/by-bpmn-id/ZorgtoeslagProcess'],
    ['post', '/v1/assets/ropa'],
    ['delete', '/v1/assets/ropa/r1'],
  ] as const)('%s %s answers 503 instead of touching the service', async (method, path) => {
    const res = await request(makeApp())[method](path).send({});

    expect(res.status).toBe(503);
    expect(res.body).toEqual(EXPECTED);
  });

  test('no service function is called when storage is unavailable', async () => {
    const app = makeApp();
    await request(app).get('/v1/assets/ropa');
    await request(app).get('/v1/assets/ropa/by-bpmn-id/X');
    await request(app).post('/v1/assets/ropa').send({});
    await request(app).delete('/v1/assets/ropa/r1');

    expect(ropaService.listRopa).not.toHaveBeenCalled();
    expect(ropaService.getRopaByBpmnProcessId).not.toHaveBeenCalled();
    expect(ropaService.upsertRopa).not.toHaveBeenCalled();
    expect(ropaService.deleteRopa).not.toHaveBeenCalled();
  });
});
