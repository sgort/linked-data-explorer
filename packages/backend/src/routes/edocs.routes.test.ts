import express from 'express';
import request from 'supertest';

jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
jest.mock('../services/edocs.service', () => ({
  __esModule: true,
  edocsService: {
    healthCheck: jest.fn(),
    ensureWorkspace: jest.fn(),
    uploadDocument: jest.fn(),
    getWorkspaceDocuments: jest.fn(),
  },
}));

const configMock = { edocs: { stubMode: true } };
jest.mock('../utils/config', () => ({
  __esModule: true,
  config: configMock,
  default: configMock,
}));

import { edocsService } from '../services/edocs.service';
import edocsRoutes from './edocs.routes';
import { versionMiddleware } from '../middleware/version.middleware';
import { errorHandler } from '../middleware/error.middleware';
import { expectToMatchOperation } from '../openapi/testing/conformance';

const svc = edocsService as unknown as Record<string, jest.Mock>;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/v1/edocs', edocsRoutes);
  return app;
}

beforeEach(() => {
  for (const fn of Object.values(svc)) fn.mockReset();
  configMock.edocs.stubMode = true;
});

describe('GET /v1/edocs/status', () => {
  test('reports health, stub mode and latency', async () => {
    svc.healthCheck.mockResolvedValue({ status: 'up', latency: 25 });

    const res = await request(makeApp()).get('/v1/edocs/status');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: { status: 'up', stubMode: true, latencyMs: 25 },
    });
  });

  test('reflects the configured stub mode', async () => {
    configMock.edocs.stubMode = false;
    svc.healthCheck.mockResolvedValue({ status: 'up' });

    const res = await request(makeApp()).get('/v1/edocs/status');

    expect(res.body.data.stubMode).toBe(false);
  });

  test('omits latency when the health check does not report one', async () => {
    svc.healthCheck.mockResolvedValue({ status: 'stub' });

    const res = await request(makeApp()).get('/v1/edocs/status');

    expect(res.body.data).not.toHaveProperty('latencyMs');
  });

  test('keeps a zero latency, rather than dropping it as falsy', async () => {
    svc.healthCheck.mockResolvedValue({ status: 'up', latency: 0 });

    const res = await request(makeApp()).get('/v1/edocs/status');

    expect(res.body.data.latencyMs).toBe(0);
  });

  test('surfaces a reported error alongside the status', async () => {
    svc.healthCheck.mockResolvedValue({ status: 'down', error: 'connection refused' });

    const res = await request(makeApp()).get('/v1/edocs/status');

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: 'down', error: 'connection refused' });
  });

  test('returns 500 with an EDOCS_STATUS_FAILED code when the check throws', async () => {
    svc.healthCheck.mockRejectedValue(new Error('eDOCS unreachable'));

    const res = await request(makeApp()).get('/v1/edocs/status');

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      status: 500,
      title: 'eDOCS status check failed',
      detail: 'eDOCS unreachable',
      code: 'EDOCS_STATUS_FAILED',
    });
  });
});

// #163: the write routes and the workspace listing were removed. No client
// called them: the external-task worker uses edocsService directly.
describe('removed eDOCS routes', () => {
  test.each([
    ['post', '/v1/edocs/workspaces/ensure'],
    ['post', '/v1/edocs/documents'],
    ['get', '/v1/edocs/workspaces/w1/documents'],
  ])('%s %s answers 404', async (method, path) => {
    const res = await request(makeApp())[method as 'get' | 'post'](path).send({});
    expect(res.status).toBe(404);
  });
});

describe('/v1/edocs operations match their OpenAPI description', () => {
  // The route test app above has no version middleware and no error handler
  // (see edocs.routes.test.ts's own makeApp()), so a documented app needs
  // both added, matching how dso.routes.test.ts builds its own.
  function makeDocumentedApp() {
    const app = express();
    app.use(express.json());
    app.use(versionMiddleware); // app-wide in index.ts
    app.use('/v1/edocs', edocsRoutes);
    app.use(errorHandler); // app-wide in index.ts; answers malformed JSON bodies
    return app;
  }

  test('GET /status 200, as documented — up, with latencyMs', async () => {
    svc.healthCheck.mockResolvedValue({ status: 'up', latency: 42 });

    const res = await request(makeDocumentedApp()).get('/v1/edocs/status');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ status: 'up', stubMode: true, latencyMs: 42 });
    expectToMatchOperation(res, 'get', '/edocs/status');
  });

  test('GET /status 200, as documented — down, with an error, is not a failure response', async () => {
    svc.healthCheck.mockResolvedValue({ status: 'down', error: 'connect ECONNREFUSED' });

    const res = await request(makeDocumentedApp()).get('/v1/edocs/status');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      status: 'down',
      stubMode: true,
      error: 'connect ECONNREFUSED',
    });
    expectToMatchOperation(res, 'get', '/edocs/status');
  });

  test('GET /status 200, as documented — stub, omitting every optional field', async () => {
    svc.healthCheck.mockResolvedValue({ status: 'stub' });

    const res = await request(makeDocumentedApp()).get('/v1/edocs/status');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ status: 'stub', stubMode: true });
    expectToMatchOperation(res, 'get', '/edocs/status');
  });

  test('GET /status 500, as documented', async () => {
    svc.healthCheck.mockRejectedValue(new Error('eDOCS unreachable'));

    const res = await request(makeDocumentedApp()).get('/v1/edocs/status');

    expect(res.status).toBe(500);
    expectToMatchOperation(res, 'get', '/edocs/status');
  });
});
