import express from 'express';
import request from 'supertest';

jest.mock('../utils/logger', () => ({
  __esModule: true,
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));
jest.mock('../services/triplydb.service', () => ({
  __esModule: true,
  executeQuery: jest.fn(),
  updateService: jest.fn(),
  listGraphs: jest.fn(),
  testConnection: jest.fn(),
}));

import * as triplydbService from '../services/triplydb.service';
import triplydbRoutes from './triplydb.routes';
import packageJson from '../../package.json';

const svc = triplydbService as unknown as Record<string, jest.Mock>;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/v1/triplydb', triplydbRoutes);
  return app;
}

const CONFIG = {
  baseUrl: 'https://api.open-regels.triply.cc',
  account: 'stevengort',
  dataset: 'PublishTest',
  apiToken: 'tok-1',
};

// /assets calls global fetch directly rather than going through the service.
const mockFetch = jest.fn();
const realFetch = global.fetch;

beforeEach(() => {
  for (const fn of Object.values(svc)) {
    if (typeof fn === 'function') fn.mockReset();
  }
  mockFetch.mockReset();
  global.fetch = mockFetch as unknown as typeof fetch;
});

afterAll(() => {
  global.fetch = realFetch;
});

describe('POST /v1/triplydb/query', () => {
  test('executes the query and spreads the service result into the envelope', async () => {
    svc.executeQuery.mockResolvedValue({ results: { bindings: [{ s: { value: 'x' } }] } });

    const res = await request(makeApp())
      .post('/v1/triplydb/query')
      .send({ endpoint: 'https://triplydb.example/sparql', query: 'SELECT * WHERE {?s ?p ?o}' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      results: { bindings: [{ s: { value: 'x' } }] },
    });
    expect(svc.executeQuery).toHaveBeenCalledWith(
      'https://triplydb.example/sparql',
      'SELECT * WHERE {?s ?p ?o}'
    );
  });

  test('sets the API-Version header and a JSON content type', async () => {
    svc.executeQuery.mockResolvedValue({ results: { bindings: [] } });

    const res = await request(makeApp())
      .post('/v1/triplydb/query')
      .send({ endpoint: 'e', query: 'q' });

    expect(res.headers['api-version']).toBe(packageJson.version);
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });

  test('tolerates a result with no bindings when logging the count', async () => {
    svc.executeQuery.mockResolvedValue({ boolean: true });

    const res = await request(makeApp())
      .post('/v1/triplydb/query')
      .send({ endpoint: 'e', query: 'ASK {?s ?p ?o}' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, boolean: true });
  });

  test.each([
    ['a missing endpoint', { query: 'SELECT *' }],
    ['a missing query', { endpoint: 'https://triplydb.example/sparql' }],
    ['an empty body', {}],
  ])('rejects %s with 400', async (_label, body) => {
    const res = await request(makeApp()).post('/v1/triplydb/query').send(body);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      success: false,
      error: 'Missing required fields: endpoint and query',
      status: 400,
    });
    expect(svc.executeQuery).not.toHaveBeenCalled();
  });

  test('returns 500 with the error message when the query fails', async () => {
    svc.executeQuery.mockRejectedValue(new Error('malformed SPARQL'));

    const res = await request(makeApp())
      .post('/v1/triplydb/query')
      .send({ endpoint: 'e', query: 'q' });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, error: 'malformed SPARQL', status: 500 });
  });

  test('falls back to a generic message for a non-Error rejection', async () => {
    svc.executeQuery.mockRejectedValue('socket hang up');

    const res = await request(makeApp())
      .post('/v1/triplydb/query')
      .send({ endpoint: 'e', query: 'q' });

    expect(res.body.error).toBe('Query execution failed');
  });
});

describe('POST /v1/triplydb/update-service', () => {
  test('updates the service and returns the service result verbatim', async () => {
    svc.updateService.mockResolvedValue({
      success: true,
      message: 'Service PublishTest updated to include 3 graphs',
      graphCount: 3,
    });

    const res = await request(makeApp())
      .post('/v1/triplydb/update-service')
      .send({ config: CONFIG, serviceName: 'PublishTest', graphName: 'graph:a' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      message: 'Service PublishTest updated to include 3 graphs',
      graphCount: 3,
    });
    expect(svc.updateService).toHaveBeenCalledWith(CONFIG, 'PublishTest', undefined, 'graph:a');
  });

  test('the graph name is optional', async () => {
    svc.updateService.mockResolvedValue({ success: true, graphCount: 1 });

    await request(makeApp())
      .post('/v1/triplydb/update-service')
      .send({ config: CONFIG, serviceName: 'PublishTest' });

    expect(svc.updateService).toHaveBeenCalledWith(CONFIG, 'PublishTest', undefined, undefined);
  });

  test.each([
    ['a missing config', { serviceName: 'PublishTest' }],
    ['a missing serviceName', { config: CONFIG }],
  ])('rejects %s with 400', async (_label, body) => {
    const res = await request(makeApp()).post('/v1/triplydb/update-service').send(body);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Missing required fields: config and serviceName');
    expect(svc.updateService).not.toHaveBeenCalled();
  });

  test.each(['baseUrl', 'account', 'dataset', 'apiToken'])(
    'rejects a config missing %s with 400',
    async (field) => {
      const partial = { ...CONFIG, [field]: undefined };

      const res = await request(makeApp())
        .post('/v1/triplydb/update-service')
        .send({ config: partial, serviceName: 'PublishTest' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid config: missing baseUrl, account, dataset, or apiToken');
      expect(svc.updateService).not.toHaveBeenCalled();
    }
  );

  test('returns 500 when the update fails', async () => {
    svc.updateService.mockRejectedValue(new Error('403 Forbidden'));

    const res = await request(makeApp())
      .post('/v1/triplydb/update-service')
      .send({ config: CONFIG, serviceName: 'PublishTest' });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, error: '403 Forbidden', status: 500 });
  });

  test('falls back to a generic message for a non-Error rejection', async () => {
    svc.updateService.mockRejectedValue(null);

    const res = await request(makeApp())
      .post('/v1/triplydb/update-service')
      .send({ config: CONFIG, serviceName: 'PublishTest' });

    expect(res.body.error).toBe('Service update failed');
  });
});

describe('POST /v1/triplydb/list-graphs', () => {
  test('lists the graphs with a count', async () => {
    svc.listGraphs.mockResolvedValue(['graph:default', 'graph:default-1']);

    const res = await request(makeApp()).post('/v1/triplydb/list-graphs').send({ config: CONFIG });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      graphs: ['graph:default', 'graph:default-1'],
      count: 2,
    });
    expect(svc.listGraphs).toHaveBeenCalledWith(CONFIG);
  });

  test('rejects a missing config with 400', async () => {
    const res = await request(makeApp()).post('/v1/triplydb/list-graphs').send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid or missing config');
    expect(svc.listGraphs).not.toHaveBeenCalled();
  });

  test.each(['baseUrl', 'account', 'dataset', 'apiToken'])(
    'rejects a config missing %s with 400',
    async (field) => {
      const res = await request(makeApp())
        .post('/v1/triplydb/list-graphs')
        .send({ config: { ...CONFIG, [field]: undefined } });

      expect(res.status).toBe(400);
      expect(svc.listGraphs).not.toHaveBeenCalled();
    }
  );

  test('returns 500 when listing fails', async () => {
    svc.listGraphs.mockRejectedValue(new Error('dataset not found'));

    const res = await request(makeApp()).post('/v1/triplydb/list-graphs').send({ config: CONFIG });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, error: 'dataset not found', status: 500 });
  });

  test('falls back to a generic message for a non-Error rejection', async () => {
    svc.listGraphs.mockRejectedValue('boom');

    const res = await request(makeApp()).post('/v1/triplydb/list-graphs').send({ config: CONFIG });

    expect(res.body.error).toBe('Failed to list graphs');
  });
});

describe('POST /v1/triplydb/test-connection', () => {
  test('answers 200 when the credentials work', async () => {
    svc.testConnection.mockResolvedValue(true);

    const res = await request(makeApp())
      .post('/v1/triplydb/test-connection')
      .send({ config: CONFIG });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, message: 'Connection successful', status: 200 });
  });

  test('answers 503 when the connection is refused, rather than treating it as a server error', async () => {
    svc.testConnection.mockResolvedValue(false);

    const res = await request(makeApp())
      .post('/v1/triplydb/test-connection')
      .send({ config: CONFIG });

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ success: false, message: 'Connection failed', status: 503 });
  });

  test('rejects a missing config with 400', async () => {
    const res = await request(makeApp()).post('/v1/triplydb/test-connection').send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Missing config');
    expect(svc.testConnection).not.toHaveBeenCalled();
  });

  test('returns 500 when the test itself throws', async () => {
    svc.testConnection.mockRejectedValue(new Error('DNS failure'));

    const res = await request(makeApp())
      .post('/v1/triplydb/test-connection')
      .send({ config: CONFIG });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, error: 'DNS failure', status: 500 });
  });

  test('falls back to a generic message for a non-Error rejection', async () => {
    svc.testConnection.mockRejectedValue(undefined);

    const res = await request(makeApp())
      .post('/v1/triplydb/test-connection')
      .send({ config: CONFIG });

    expect(res.body.error).toBe('Connection test failed');
  });
});

describe('GET /v1/triplydb/assets', () => {
  function assetResponse(body: unknown, init: { ok?: boolean; status?: number } = {}) {
    return {
      ok: init.ok ?? true,
      status: init.status ?? 200,
      statusText: 'OK',
      json: async () => body,
      text: async () => JSON.stringify(body),
    };
  }

  test('normalises TriplyDB asset records into the LDE shape', async () => {
    mockFetch.mockResolvedValue(
      assetResponse([
        {
          identifier: 'a1',
          assetName: 'svb-logo.png',
          createdAt: '2026-01-01',
          versions: [{ id: 'v1', fileSize: 65536, url: 'https://cdn.example/a1.png' }],
        },
      ])
    );

    const res = await request(makeApp())
      .get('/v1/triplydb/assets')
      .query({ account: 'stevengort', dataset: 'facts' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      assets: [
        {
          id: 'a1',
          name: 'svb-logo.png',
          url: 'https://cdn.example/a1.png',
          size: 65536,
          contentType: 'image/png',
        },
      ],
      count: 1,
    });
  });

  test('falls back to a constructed URL and zero size when no version is present', async () => {
    mockFetch.mockResolvedValue(
      assetResponse([
        { identifier: 'a1', assetName: 'logo.png', createdAt: '2026-01-01', versions: [] },
      ])
    );

    const res = await request(makeApp())
      .get('/v1/triplydb/assets')
      .query({ account: 'stevengort', dataset: 'facts' });

    expect(res.body.assets[0]).toEqual({
      id: 'a1',
      name: 'logo.png',
      url: 'https://open-regels.triply.cc/stevengort/facts/assets/a1',
      size: 0,
      contentType: 'image/png',
    });
  });

  test('requests the dataset assets endpoint without auth for a public dataset', async () => {
    mockFetch.mockResolvedValue(assetResponse([]));

    await request(makeApp())
      .get('/v1/triplydb/assets')
      .query({ account: 'stevengort', dataset: 'facts' });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.open-regels.triply.cc/datasets/stevengort/facts/assets',
      { headers: { Accept: 'application/json' } }
    );
  });

  test('sends a bearer token when one is supplied for a private dataset', async () => {
    mockFetch.mockResolvedValue(assetResponse([]));

    await request(makeApp())
      .get('/v1/triplydb/assets')
      .query({ account: 'stevengort', dataset: 'facts', apiToken: 'tok-1' });

    expect(mockFetch).toHaveBeenCalledWith(expect.any(String), {
      headers: { Accept: 'application/json', Authorization: 'Bearer tok-1' },
    });
  });

  test.each([
    ['a missing account', { dataset: 'facts' }],
    ['a missing dataset', { account: 'stevengort' }],
    ['neither parameter', {}],
  ])('rejects %s with 400', async (_label, query) => {
    const res = await request(makeApp()).get('/v1/triplydb/assets').query(query);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Missing required parameters: account and dataset');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test('propagates the upstream status when TriplyDB rejects the request', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      text: async () => 'no access',
      json: async () => ({}),
    });

    const res = await request(makeApp())
      .get('/v1/triplydb/assets')
      .query({ account: 'stevengort', dataset: 'private' });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      success: false,
      error: 'Failed to list assets: Forbidden',
      status: 403,
    });
  });

  test('returns 500 when the fetch itself throws', async () => {
    mockFetch.mockRejectedValue(new Error('ENOTFOUND'));

    const res = await request(makeApp())
      .get('/v1/triplydb/assets')
      .query({ account: 'stevengort', dataset: 'facts' });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, error: 'ENOTFOUND', status: 500 });
  });

  test('falls back to a generic message for a non-Error rejection', async () => {
    mockFetch.mockRejectedValue('boom');

    const res = await request(makeApp())
      .get('/v1/triplydb/assets')
      .query({ account: 'stevengort', dataset: 'facts' });

    expect(res.body.error).toBe('Failed to list assets');
  });
});

describe('GET /v1/triplydb/health', () => {
  test('reports the proxy as ok with version and uptime', async () => {
    const res = await request(makeApp()).get('/v1/triplydb/health');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'ok',
      service: 'triplydb-proxy',
      version: packageJson.version,
    });
    expect(typeof res.body.uptime).toBe('number');
    expect(Date.parse(res.body.timestamp)).not.toBeNaN();
    expect(res.headers['api-version']).toBe(packageJson.version);
  });

  test('does not touch the TriplyDB service', async () => {
    await request(makeApp()).get('/v1/triplydb/health');

    expect(svc.testConnection).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
