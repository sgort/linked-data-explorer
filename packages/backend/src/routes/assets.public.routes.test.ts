import express from 'express';
import request from 'supertest';

jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
jest.mock('../services/assets.service', () => ({ listPublicBundles: jest.fn() }));

import { versionMiddleware } from '../middleware/version.middleware';
import { expectToMatchOperation } from '../openapi/testing/conformance';
import { listPublicBundles } from '../services/assets.service';
import assetsPublicRoutes from './assets.public.routes';

const mockListPublicBundles = listPublicBundles as jest.Mock;

// Shaped like listPublicBundles' output after JSON serialisation: optional
// columns that are NULL are omitted, and Dates become ISO strings.
const BUNDLE = {
  id: 'zorgtoeslag-shell',
  bpmnProcessId: 'ZorgtoeslagProcess',
  name: 'Zorgtoeslag',
  processRole: 'shell',
  linkedDmnTemplates: ['zorgtoeslag-berekening'],
  status: 'wip',
  deployedAt: '2026-09-10T08:00:00.000Z',
  operatonDeploymentId: 'a1b2c3',
  deployedForms: [{ id: 'aanvraag', name: 'Aanvraagformulier' }],
  deployedDocuments: [],
  subprocesses: [
    { id: 'zorgtoeslag-toets', name: 'Toets', bpmnProcessId: 'ZorgtoeslagToets', status: 'wip' },
  ],
  organization: 'flevoland',
  updatedAt: '2026-09-10T08:00:00.000Z',
};

function makeApp() {
  const app = express();
  app.use(versionMiddleware); // app-wide in index.ts
  app.use('/v1/assets-public', assetsPublicRoutes);
  return app;
}

beforeEach(() => {
  mockListPublicBundles.mockReset();
});

describe('GET /v1/assets-public', () => {
  test('returns the public bundle list, as documented', async () => {
    mockListPublicBundles.mockResolvedValue([BUNDLE]);

    const res = await request(makeApp()).get('/v1/assets-public');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: [BUNDLE] });
    expectToMatchOperation(res, 'get', '/bundles/public');
  });

  test('returns 500 with the error message when the service throws, as documented', async () => {
    mockListPublicBundles.mockRejectedValue(new Error('db unavailable'));

    const res = await request(makeApp()).get('/v1/assets-public');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      success: false,
      error: { code: 'LIST_FAILED', message: 'db unavailable' },
    });
    expectToMatchOperation(res, 'get', '/bundles/public');
  });
});
