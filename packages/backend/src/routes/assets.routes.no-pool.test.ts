// Covers the "DB not configured" (pool === null) guard on every /v1/assets
// route. Kept in its own file with a single static mock, matching the split used
// by assets.service.no-pool.test.ts.
import express from 'express';
import request from 'supertest';

jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
jest.mock('../db/pool', () => ({ __esModule: true, default: null }));
jest.mock('../services/assets.service', () => ({
  __esModule: true,
  listBpmn: jest.fn(),
  upsertBpmn: jest.fn(),
  deleteBpmn: jest.fn(),
  markDeployed: jest.fn(),
  getBpmnByBpmnProcessId: jest.fn(),
  listForms: jest.fn(),
  upsertForm: jest.fn(),
  deleteForm: jest.fn(),
  listDocuments: jest.fn(),
  upsertDocument: jest.fn(),
  deleteDocument: jest.fn(),
}));

import * as assetsService from '../services/assets.service';
import assetsRoutes from './assets.routes';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/v1/assets', assetsRoutes);
  return app;
}

const EXPECTED = {
  success: false,
  error: { code: 'DB_NOT_CONFIGURED', message: 'Asset storage not configured' },
};

const ROUTES = [
  ['get', '/v1/assets/bpmn'],
  ['post', '/v1/assets/bpmn'],
  ['delete', '/v1/assets/bpmn/p1'],
  ['patch', '/v1/assets/bpmn/p1/deploy'],
  ['get', '/v1/assets/bpmn/by-bpmn-id/ZorgtoeslagProcess'],
  ['get', '/v1/assets/forms'],
  ['post', '/v1/assets/forms'],
  ['delete', '/v1/assets/forms/f1'],
  ['get', '/v1/assets/documents'],
  ['post', '/v1/assets/documents'],
  ['delete', '/v1/assets/documents/d1'],
] as const;

describe('/v1/assets with no database configured', () => {
  test.each(ROUTES)('%s %s answers 503 instead of touching the service', async (method, path) => {
    const res = await request(makeApp())[method](path).send({});

    expect(res.status).toBe(503);
    expect(res.body).toEqual(EXPECTED);
  });

  test('no service function is called when storage is unavailable', async () => {
    const app = makeApp();
    for (const [method, path] of ROUTES) {
      await request(app)[method](path).send({});
    }

    // Object.values would also yield the __esModule flag, which is not a mock.
    const mocks = Object.values(assetsService as unknown as Record<string, unknown>).filter(
      (v): v is jest.Mock => typeof v === 'function'
    );
    expect(mocks).toHaveLength(11);
    for (const fn of mocks) {
      expect(fn).not.toHaveBeenCalled();
    }
  });
});
