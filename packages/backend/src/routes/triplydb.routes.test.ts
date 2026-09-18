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
import { errorHandler } from '../middleware/error.middleware';
import { versionMiddleware } from '../middleware/version.middleware';
import { expectToMatchOperation } from '../openapi/testing/conformance';

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
      .send({ endpoint: 'https://triplydb.example/sparql', query: 'q' });

    expect(res.headers['api-version']).toBe(packageJson.version);
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });

  test('tolerates a result with no bindings when logging the count', async () => {
    svc.executeQuery.mockResolvedValue({ boolean: true });

    const res = await request(makeApp())
      .post('/v1/triplydb/query')
      .send({ endpoint: 'https://triplydb.example/sparql', query: 'ASK {?s ?p ?o}' });

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
    expect(res.body).toMatchObject({
      status: 400,
      title: 'Invalid request',
      detail: 'Missing required fields: endpoint and query',
    });
    expect(svc.executeQuery).not.toHaveBeenCalled();
  });

  test('returns 500 with the error message when the query fails', async () => {
    svc.executeQuery.mockRejectedValue(new Error('malformed SPARQL'));

    const res = await request(makeApp())
      .post('/v1/triplydb/query')
      .send({ endpoint: 'https://triplydb.example/sparql', query: 'q' });

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      status: 500,
      title: 'TriplyDB request failed',
      detail: 'malformed SPARQL',
    });
  });

  test('falls back to a generic message for a non-Error rejection', async () => {
    svc.executeQuery.mockRejectedValue('socket hang up');

    const res = await request(makeApp())
      .post('/v1/triplydb/query')
      .send({ endpoint: 'https://triplydb.example/sparql', query: 'q' });

    expect(res.body.detail).toBe('Query execution failed');
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
    expect(res.body.detail).toBe('Missing required fields: config and serviceName');
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
      expect(res.body.detail).toBe(
        'Invalid config: missing baseUrl, account, dataset, or apiToken'
      );
      expect(svc.updateService).not.toHaveBeenCalled();
    }
  );

  test('returns 500 when the update fails', async () => {
    svc.updateService.mockRejectedValue(new Error('403 Forbidden'));

    const res = await request(makeApp())
      .post('/v1/triplydb/update-service')
      .send({ config: CONFIG, serviceName: 'PublishTest' });

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      status: 500,
      title: 'TriplyDB request failed',
      detail: '403 Forbidden',
    });
  });

  test('falls back to a generic message for a non-Error rejection', async () => {
    svc.updateService.mockRejectedValue(null);

    const res = await request(makeApp())
      .post('/v1/triplydb/update-service')
      .send({ config: CONFIG, serviceName: 'PublishTest' });

    expect(res.body.detail).toBe('Service update failed');
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
    expect(res.body.detail).toBe('Invalid or missing config');
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
    expect(res.body).toMatchObject({
      status: 500,
      title: 'TriplyDB request failed',
      detail: 'dataset not found',
    });
  });

  test('falls back to a generic message for a non-Error rejection', async () => {
    svc.listGraphs.mockRejectedValue('boom');

    const res = await request(makeApp()).post('/v1/triplydb/list-graphs').send({ config: CONFIG });

    expect(res.body.detail).toBe('Failed to list graphs');
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
    expect(res.body).toMatchObject({
      status: 503,
      title: 'Service unavailable',
      detail: 'Connection failed',
    });
  });

  test('rejects a missing config with 400', async () => {
    const res = await request(makeApp()).post('/v1/triplydb/test-connection').send({});

    expect(res.status).toBe(400);
    expect(res.body.detail).toBe('Missing config');
    expect(svc.testConnection).not.toHaveBeenCalled();
  });

  test('returns 500 when the test itself throws', async () => {
    svc.testConnection.mockRejectedValue(new Error('DNS failure'));

    const res = await request(makeApp())
      .post('/v1/triplydb/test-connection')
      .send({ config: CONFIG });

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      status: 500,
      title: 'TriplyDB request failed',
      detail: 'DNS failure',
    });
  });

  test('falls back to a generic message for a non-Error rejection', async () => {
    svc.testConnection.mockRejectedValue(undefined);

    const res = await request(makeApp())
      .post('/v1/triplydb/test-connection')
      .send({ config: CONFIG });

    expect(res.body.detail).toBe('Connection test failed');
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

  test('sends a bearer token from the Authorization header for a private dataset', async () => {
    mockFetch.mockResolvedValue(assetResponse([]));

    await request(makeApp())
      .get('/v1/triplydb/assets')
      .query({ account: 'stevengort', dataset: 'facts' })
      .set('Authorization', 'Bearer tok-1');

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
    expect(res.body.detail).toBe('Missing required parameters: account and dataset');
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
    expect(res.body).toMatchObject({
      status: 403,
      title: 'TriplyDB request failed',
      detail: 'Failed to list assets: Forbidden',
    });
  });

  test('returns 500 when the fetch itself throws', async () => {
    mockFetch.mockRejectedValue(new Error('ENOTFOUND'));

    const res = await request(makeApp())
      .get('/v1/triplydb/assets')
      .query({ account: 'stevengort', dataset: 'facts' });

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      status: 500,
      title: 'TriplyDB request failed',
      detail: 'ENOTFOUND',
    });
  });

  test('falls back to a generic message for a non-Error rejection', async () => {
    mockFetch.mockRejectedValue('boom');

    const res = await request(makeApp())
      .get('/v1/triplydb/assets')
      .query({ account: 'stevengort', dataset: 'facts' });

    expect(res.body.detail).toBe('Failed to list assets');
  });
});

describe('#142 TriplyDB host allowlist', () => {
  test.each(['/update-service', '/list-graphs', '/test-connection'])(
    '%s refuses a host that is not allowed, without calling TriplyDB',
    async (path) => {
      const res = await request(makeApp())
        .post(`/v1/triplydb${path}`)
        .send({ config: { ...CONFIG, baseUrl: 'https://example.org' }, serviceName: 'svc' });
      expect(res.status).toBe(400);
      expect(res.body.detail).toBe(
        '`config.baseUrl` host example.org is not an allowed TriplyDB host'
      );
      for (const fn of Object.values(svc)) {
        if (typeof fn === 'function') expect(fn).not.toHaveBeenCalled();
      }
    }
  );

  test('test-connection refuses a config with missing fields', async () => {
    const res = await request(makeApp()).post('/v1/triplydb/test-connection').send({ config: {} });
    expect(res.status).toBe(400);
    expect(svc.testConnection).not.toHaveBeenCalled();
  });
});

describe('#142 GET /v1/triplydb/assets token', () => {
  test('forwards a bearer token from the Authorization header', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => [] });
    await request(makeApp())
      .get('/v1/triplydb/assets?account=a&dataset=b')
      .set('Authorization', 'Bearer tok-9');
    expect(mockFetch.mock.calls[0][1].headers.Authorization).toBe('Bearer tok-9');
  });

  test('ignores an apiToken query parameter', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => [] });
    await request(makeApp()).get('/v1/triplydb/assets?account=a&dataset=b&apiToken=leak');
    expect(mockFetch.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  test('encodes account and dataset into the upstream path', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => [] });
    await request(makeApp()).get('/v1/triplydb/assets?account=a%2F..&dataset=b%3Fx%3D1');
    expect(mockFetch.mock.calls[0][0]).toBe(
      'https://api.open-regels.triply.cc/datasets/a%2F../b%3Fx%3D1/assets'
    );
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

describe('#142 endpoint check', () => {
  test('POST /v1/triplydb/query refuses an internal endpoint without querying it', async () => {
    const res = await request(makeApp())
      .post('/v1/triplydb/query')
      .send({ endpoint: 'https://169.254.169.254/latest', query: 'SELECT * WHERE {?s ?p ?o}' });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      code: 'INVALID_INPUT',
      detail: '`endpoint` points to an internal address',
    });
    expect(svc.executeQuery).not.toHaveBeenCalled();
  });

  test('POST /v1/triplydb/query refuses a non-https endpoint without querying it', async () => {
    const res = await request(makeApp())
      .post('/v1/triplydb/query')
      .send({ endpoint: 'http://example.org/sparql', query: 'SELECT * WHERE {?s ?p ?o}' });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      code: 'INVALID_INPUT',
      detail: '`endpoint` must use https',
    });
    expect(svc.executeQuery).not.toHaveBeenCalled();
  });

  test('POST /v1/triplydb/query refuses an internal endpoint, as documented', async () => {
    const app = express();
    app.use(express.json());
    app.use(versionMiddleware); // app-wide in index.ts
    app.use('/v1/triplydb', triplydbRoutes);
    app.use(errorHandler); // app-wide in index.ts

    const res = await request(app)
      .post('/v1/triplydb/query')
      .send({ endpoint: 'https://169.254.169.254/latest', query: 'SELECT * WHERE {?s ?p ?o}' });

    expect(res.status).toBe(400);
    expectToMatchOperation(res, 'post', '/triplydb/query');
  });
});

describe('/v1/triplydb matches its OpenAPI description', () => {
  function makeDocumentedApp() {
    const app = express();
    app.use(express.json());
    app.use(versionMiddleware); // app-wide in index.ts
    app.use('/v1/triplydb', triplydbRoutes);
    app.use(errorHandler); // app-wide in index.ts; answers malformed JSON bodies
    return app;
  }

  const post = (path: string) => request(makeDocumentedApp()).post(`/v1/triplydb${path}`);

  test('POST /query SELECT results, as documented', async () => {
    svc.executeQuery.mockResolvedValue({
      head: { vars: ['s', 'label'] },
      results: {
        bindings: [
          {
            s: { type: 'uri', value: 'https://regels.example/id/regel/1' },
            label: { type: 'literal', value: 'Regel', 'xml:lang': 'nl' },
          },
        ],
      },
    });

    const res = await post('/query').send({
      endpoint: 'https://triplydb.example/sparql',
      query: 'SELECT * WHERE { ?s ?p ?o }',
    });

    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'post', '/triplydb/query');
  });

  test('POST /query ASK result, as documented', async () => {
    svc.executeQuery.mockResolvedValue({ head: {}, boolean: true });

    const res = await post('/query').send({
      endpoint: 'https://triplydb.example/sparql',
      query: 'ASK { ?s ?p ?o }',
    });

    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'post', '/triplydb/query');
  });

  test('POST /query 400 and 500, as documented', async () => {
    const bad = await post('/query').send({});
    expect(bad.status).toBe(400);
    expectToMatchOperation(bad, 'post', '/triplydb/query');

    svc.executeQuery.mockRejectedValue(new Error('Failed to execute query: Query failed: 502'));
    const failed = await post('/query').send({
      endpoint: 'https://triplydb.example/sparql',
      query: 'ASK {}',
    });
    expect(failed.status).toBe(500);
    expectToMatchOperation(failed, 'post', '/triplydb/query');
  });

  test('a malformed JSON body is a 400 problem, as documented (#143)', async () => {
    const res = await post('/query').set('Content-Type', 'application/json').send('{"endpoint":');

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MALFORMED_BODY');
    expectToMatchOperation(res, 'post', '/triplydb/query');
  });

  test('POST /update-service 200, 400 and 500, as documented', async () => {
    svc.updateService.mockResolvedValue({
      success: true,
      message: 'Service PublishTest updated to include 2 graphs',
      graphCount: 2,
      graphName: 'graph:a',
    });
    const ok = await post('/update-service').send({
      config: CONFIG,
      serviceName: 'PublishTest',
      graphName: 'graph:a',
    });
    expect(ok.status).toBe(200);
    expectToMatchOperation(ok, 'post', '/triplydb/update-service');

    const bad = await post('/update-service').send({ serviceName: 'PublishTest' });
    expect(bad.status).toBe(400);
    expectToMatchOperation(bad, 'post', '/triplydb/update-service');

    svc.updateService.mockRejectedValue(new Error('Failed to update service: 403'));
    const failed = await post('/update-service').send({
      config: CONFIG,
      serviceName: 'PublishTest',
    });
    expect(failed.status).toBe(500);
    expectToMatchOperation(failed, 'post', '/triplydb/update-service');
  });

  test('POST /list-graphs 200, 400 and 500, as documented', async () => {
    svc.listGraphs.mockResolvedValue(['graph:default', 'graph:default-1']);
    const ok = await post('/list-graphs').send({ config: CONFIG });
    expect(ok.status).toBe(200);
    expectToMatchOperation(ok, 'post', '/triplydb/list-graphs');

    const bad = await post('/list-graphs').send({});
    expect(bad.status).toBe(400);
    expectToMatchOperation(bad, 'post', '/triplydb/list-graphs');

    svc.listGraphs.mockRejectedValue(new Error('Failed to list graphs: 404'));
    const failed = await post('/list-graphs').send({ config: CONFIG });
    expect(failed.status).toBe(500);
    expectToMatchOperation(failed, 'post', '/triplydb/list-graphs');
  });

  test('POST /test-connection 200, 503, 400 and 500, as documented', async () => {
    svc.testConnection.mockResolvedValue(true);
    const ok = await post('/test-connection').send({ config: CONFIG });
    expect(ok.status).toBe(200);
    expectToMatchOperation(ok, 'post', '/triplydb/test-connection');

    svc.testConnection.mockResolvedValue(false);
    const refused = await post('/test-connection').send({ config: CONFIG });
    expect(refused.status).toBe(503);
    expectToMatchOperation(refused, 'post', '/triplydb/test-connection');

    const bad = await post('/test-connection').send({});
    expect(bad.status).toBe(400);
    expectToMatchOperation(bad, 'post', '/triplydb/test-connection');

    svc.testConnection.mockRejectedValue(new Error('DNS failure'));
    const failed = await post('/test-connection').send({ config: CONFIG });
    expect(failed.status).toBe(500);
    expectToMatchOperation(failed, 'post', '/triplydb/test-connection');
  });

  test('GET /assets 200, 400, upstream status and 500, as documented', async () => {
    const app = makeDocumentedApp();

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [
        {
          identifier: 'a1',
          assetName: 'logo.png',
          createdAt: '2026-01-01T00:00:00Z',
          versions: [{ id: 'v1', fileSize: 2048, url: 'https://triplydb.example/assets/logo.png' }],
        },
        {
          identifier: 'a2',
          assetName: 'empty.svg',
          createdAt: '2026-01-02T00:00:00Z',
          versions: [],
        },
      ],
    });
    const ok = await request(app).get('/v1/triplydb/assets?account=regels&dataset=dmn');
    expect(ok.status).toBe(200);
    expectToMatchOperation(ok, 'get', '/triplydb/assets');

    const bad = await request(app).get('/v1/triplydb/assets?account=regels');
    expect(bad.status).toBe(400);
    expectToMatchOperation(bad, 'get', '/triplydb/assets');

    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      text: async () => 'no access',
    });
    const forbidden = await request(app).get('/v1/triplydb/assets?account=regels&dataset=dmn');
    expect(forbidden.status).toBe(403);
    expectToMatchOperation(forbidden, 'get', '/triplydb/assets');

    mockFetch.mockRejectedValue(new Error('ENOTFOUND'));
    const failed = await request(app).get('/v1/triplydb/assets?account=regels&dataset=dmn');
    expect(failed.status).toBe(500);
    expectToMatchOperation(failed, 'get', '/triplydb/assets');
  });

  test('GET /health 200, as documented', async () => {
    const res = await request(makeDocumentedApp()).get('/v1/triplydb/health');

    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'get', '/triplydb/health');
  });
});
