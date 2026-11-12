import express from 'express';
import request from 'supertest';

// #163: sign-in is covered by write-auth.test.ts; these suites test behaviour.
jest.mock('../middleware/auth.middleware', () => ({
  requireAuthor: (_req: unknown, res: { locals: Record<string, unknown> }, next: () => void) => {
    res.locals.user = { sub: 'sub-1', username: 'author-1', roles: ['lde-author'] };
    next();
  },
  optionalAuthor: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
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
  publishTarget: jest.fn(),
  serverConfig: jest.fn(),
  uploadTtl: jest.fn(),
  uploadAsset: jest.fn(),
}));
import { logger } from '../utils/logger';

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

const TARGET = { baseUrl: 'https://api.open-regels.triply.cc', account: 'stevengort' };
const SERVER_CONFIG = { ...TARGET, dataset: 'PublishTest', apiToken: 'server-secret' };

// /assets calls global fetch directly rather than going through the service.
const mockFetch = jest.fn();
const realFetch = global.fetch;

beforeEach(() => {
  for (const fn of Object.values(svc)) {
    if (typeof fn === 'function') fn.mockReset();
  }
  mockFetch.mockReset();
  global.fetch = mockFetch as unknown as typeof fetch;
  // ttl-editor#234: publishing is configured unless a test says otherwise.
  svc.publishTarget.mockReturnValue(TARGET);
  svc.serverConfig.mockImplementation((dataset: string) => ({ ...SERVER_CONFIG, dataset }));
});

afterAll(() => {
  global.fetch = realFetch;
});

describe('GET /v1/triplydb/publish-target (ttl-editor#234)', () => {
  test('answers the base URL and account, never the token', async () => {
    svc.publishTarget.mockReturnValue(TARGET);

    const res = await request(makeApp()).get('/v1/triplydb/publish-target');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(TARGET);
    expect(JSON.stringify(res.body)).not.toMatch(/token/i);
  });

  test('answers 503 when publishing is not configured', async () => {
    svc.publishTarget.mockReturnValue(null);

    const res = await request(makeApp()).get('/v1/triplydb/publish-target');

    expect(res.status).toBe(503);
    expect(res.body.title).toBe('Publishing not configured');
    expect(res.body.detail).toBe('Publishing is not configured on this backend');
  });
});

describe('POST /v1/triplydb/publish (ttl-editor#234)', () => {
  const SERVER = { ...TARGET, dataset: 'PublishTest', apiToken: 'server-secret' };
  const GRAPH = 'https://regels.overheid.nl/graphs/svb/aow';
  const PNG = 'data:image/png;base64,cG5n';
  const BODY = {
    dataset: 'PublishTest',
    graph: GRAPH,
    filename: 'aow',
    ttl: '@prefix x: <http://x/> .',
    organization: 'https://identifier.overheid.nl/tooi/id/oorg/oorg10103',
    service: 'aow',
    logos: [{ fileName: 'svb_logo.png', dataUrl: PNG }],
  };
  const log = logger as unknown as Record<string, jest.Mock>;

  beforeEach(() => {
    svc.publishTarget.mockReturnValue(TARGET);
    svc.serverConfig.mockImplementation((dataset: string) => ({ ...SERVER, dataset }));
    svc.uploadTtl.mockResolvedValue(undefined);
    svc.uploadAsset.mockResolvedValue(undefined);
    svc.updateService.mockResolvedValue({ success: true, message: 'ok', graphCount: 3 });
    for (const fn of Object.values(log)) fn.mockClear();
  });

  function publishLog(): Record<string, unknown> | undefined {
    const calls = [...log.info.mock.calls, ...log.warn.mock.calls];
    return calls.find((c) => c[0] === '[TriplyDB] publish')?.[1] as Record<string, unknown>;
  }

  test('uploads the TTL, then the logos, then syncs the service, and logs who published', async () => {
    const res = await request(makeApp()).post('/v1/triplydb/publish').send(BODY);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      url: 'https://open-regels.triply.cc/datasets/stevengort/PublishTest',
      graph: GRAPH,
      serviceUpdated: true,
      logos: [{ fileName: 'svb_logo.png', ok: true }],
    });
    expect(svc.uploadTtl).toHaveBeenCalledWith(SERVER, BODY.ttl, 'aow', GRAPH);
    expect(svc.uploadAsset).toHaveBeenCalledWith(SERVER, 'svb_logo.png', PNG);
    expect(svc.updateService).toHaveBeenCalledWith(SERVER, 'PublishTest', undefined, GRAPH);
    expect(svc.uploadTtl.mock.invocationCallOrder[0]).toBeLessThan(
      svc.uploadAsset.mock.invocationCallOrder[0]
    );
    expect(svc.uploadAsset.mock.invocationCallOrder[0]).toBeLessThan(
      svc.updateService.mock.invocationCallOrder[0]
    );
    expect(publishLog()).toEqual({
      event: 'triplydb.publish',
      user: 'author-1',
      organization: BODY.organization,
      service: 'aow',
      graph: GRAPH,
      dataset: 'PublishTest',
      outcome: 'published',
    });
  });

  test('publishes without logos', async () => {
    const res = await request(makeApp())
      .post('/v1/triplydb/publish')
      .send({ ...BODY, logos: undefined });

    expect(res.status).toBe(200);
    expect(res.body.logos).toEqual([]);
    expect(svc.uploadAsset).not.toHaveBeenCalled();
  });

  test.each([
    ['a dataset with ..', { dataset: '../x' }],
    ['a dataset with a slash', { dataset: 'a/b' }],
    ['an encoded slash', { dataset: 'a%2Fb' }],
    ['an empty dataset', { dataset: '' }],
    ['a dataset of 41 characters', { dataset: 'a'.repeat(41) }],
    ['a graph outside regels.overheid.nl', { graph: 'https://evil.example/graphs/x' }],
    ['a graph that is not a URL', { graph: 'https://regels.overheid.nl/graphs/ x' }],
    ['an empty ttl', { ttl: '' }],
    ['a missing filename', { filename: undefined }],
    ['a logo name with a slash', { logos: [{ fileName: 'a/b.png', dataUrl: PNG }] }],
    ['a logo name with ..', { logos: [{ fileName: '..png', dataUrl: PNG }] }],
    [
      'a logo that is not an image',
      { logos: [{ fileName: 'x.png', dataUrl: 'data:text/html;base64,eA==' }] },
    ],
    ['logos that are not a list', { logos: 'x' }],
  ])('refuses %s with 400 and writes nothing', async (_label, patch) => {
    const res = await request(makeApp())
      .post('/v1/triplydb/publish')
      .send({ ...BODY, ...patch });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_INPUT');
    expect(svc.uploadTtl).not.toHaveBeenCalled();
    expect(svc.serverConfig).not.toHaveBeenCalled();
  });

  test('answers 502 and logs a failure when the TTL upload fails', async () => {
    svc.uploadTtl.mockRejectedValue(new Error('TriplyDB upload failed: 500 boom'));

    const res = await request(makeApp()).post('/v1/triplydb/publish').send(BODY);

    expect(res.status).toBe(502);
    expect(res.body.detail).toBe('TriplyDB upload failed: 500 boom');
    expect(svc.updateService).not.toHaveBeenCalled();
    expect(publishLog()).toMatchObject({
      outcome: 'failed',
      error: 'TriplyDB upload failed: 500 boom',
    });
    expect(log.warn).toHaveBeenCalledWith('[TriplyDB] publish', expect.anything());
  });

  test('answers 200 with a warning when only the service sync fails', async () => {
    svc.updateService.mockRejectedValue(new Error('sync failed'));

    const res = await request(makeApp()).post('/v1/triplydb/publish').send(BODY);

    expect(res.status).toBe(200);
    expect(res.body.serviceUpdated).toBe(false);
    expect(res.body.serviceError).toBe('sync failed');
    expect(publishLog()).toMatchObject({ outcome: 'published-with-warning', error: 'sync failed' });
  });

  test('a failing logo only shows in its own entry', async () => {
    svc.uploadAsset.mockRejectedValue(new Error('asset failed'));

    const res = await request(makeApp()).post('/v1/triplydb/publish').send(BODY);

    expect(res.status).toBe(200);
    expect(res.body.logos).toEqual([{ fileName: 'svb_logo.png', ok: false }]);
    expect(res.body.serviceUpdated).toBe(true);
  });

  test('answers 503 when publishing is not configured', async () => {
    svc.publishTarget.mockReturnValue(null);

    const res = await request(makeApp()).post('/v1/triplydb/publish').send(BODY);

    expect(res.status).toBe(503);
    expect(svc.uploadTtl).not.toHaveBeenCalled();
  });

  test('never shows the server token in a response or a log line', async () => {
    const answers = [await request(makeApp()).post('/v1/triplydb/publish').send(BODY)];
    svc.uploadTtl.mockRejectedValueOnce(new Error('boom'));
    answers.push(await request(makeApp()).post('/v1/triplydb/publish').send(BODY));
    svc.updateService.mockRejectedValueOnce(new Error('sync'));
    answers.push(await request(makeApp()).post('/v1/triplydb/publish').send(BODY));

    for (const res of answers) expect(JSON.stringify(res.body)).not.toContain('server-secret');
    for (const fn of Object.values(log)) {
      expect(JSON.stringify(fn.mock.calls)).not.toContain('server-secret');
    }
  });
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
  test('syncs the service with the server credential and returns the result verbatim', async () => {
    svc.updateService.mockResolvedValue({
      success: true,
      message: 'Service PublishTest updated to include 3 graphs',
      graphCount: 3,
    });

    const res = await request(makeApp())
      .post('/v1/triplydb/update-service')
      .send({ dataset: 'PublishTest', serviceName: 'PublishTest', graphName: 'graph:a' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      message: 'Service PublishTest updated to include 3 graphs',
      graphCount: 3,
    });
    expect(svc.updateService).toHaveBeenCalledWith(
      SERVER_CONFIG,
      'PublishTest',
      undefined,
      'graph:a'
    );
  });

  test('ignores the instance and token a caller sends, and takes the dataset from config', async () => {
    svc.updateService.mockResolvedValue({ success: true, graphCount: 1 });

    await request(makeApp())
      .post('/v1/triplydb/update-service')
      .send({
        config: {
          baseUrl: 'https://example.org',
          account: 'someone',
          dataset: 'Other',
          apiToken: 'caller-token',
        },
        serviceName: 'Other',
      });

    expect(svc.serverConfig).toHaveBeenCalledWith('Other');
    expect(svc.updateService).toHaveBeenCalledWith(
      { ...SERVER_CONFIG, dataset: 'Other' },
      'Other',
      undefined,
      undefined
    );
  });

  test.each([
    ['a missing dataset', { serviceName: 'PublishTest' }],
    ['a dataset with a slash', { dataset: 'a/b', serviceName: 'PublishTest' }],
    ['a missing serviceName', { dataset: 'PublishTest' }],
    ['a serviceName with ..', { dataset: 'PublishTest', serviceName: '../x' }],
  ])('rejects %s with 400', async (_label, body) => {
    const res = await request(makeApp()).post('/v1/triplydb/update-service').send(body);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_INPUT');
    expect(svc.updateService).not.toHaveBeenCalled();
  });

  test('answers 503 when publishing is not configured', async () => {
    svc.publishTarget.mockReturnValue(null);

    const res = await request(makeApp())
      .post('/v1/triplydb/update-service')
      .send({ dataset: 'PublishTest', serviceName: 'PublishTest' });

    expect(res.status).toBe(503);
    expect(svc.updateService).not.toHaveBeenCalled();
  });

  test('returns 500 when the update fails', async () => {
    svc.updateService.mockRejectedValue(new Error('403 Forbidden'));

    const res = await request(makeApp())
      .post('/v1/triplydb/update-service')
      .send({ dataset: 'PublishTest', serviceName: 'PublishTest' });

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
      .send({ dataset: 'PublishTest', serviceName: 'PublishTest' });

    expect(res.body.detail).toBe('Service update failed');
  });
});

describe('POST /v1/triplydb/list-graphs', () => {
  test('lists the graphs of the dataset with the server credential', async () => {
    svc.listGraphs.mockResolvedValue(['graph:default', 'graph:default-1']);

    const res = await request(makeApp())
      .post('/v1/triplydb/list-graphs')
      .send({ dataset: 'PublishTest' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      graphs: ['graph:default', 'graph:default-1'],
      count: 2,
    });
    expect(svc.listGraphs).toHaveBeenCalledWith(SERVER_CONFIG);
  });

  test('takes the dataset from config and ignores the token a caller sends', async () => {
    svc.listGraphs.mockResolvedValue([]);

    await request(makeApp())
      .post('/v1/triplydb/list-graphs')
      .send({ config: { ...CONFIG, apiToken: 'caller-token' } });

    expect(svc.listGraphs).toHaveBeenCalledWith(SERVER_CONFIG);
  });

  test.each([
    ['a missing dataset', {}],
    ['a dataset with ..', { dataset: '..' }],
  ])('rejects %s with 400', async (_label, body) => {
    const res = await request(makeApp()).post('/v1/triplydb/list-graphs').send(body);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_INPUT');
    expect(svc.listGraphs).not.toHaveBeenCalled();
  });

  test('returns 500 when listing fails', async () => {
    svc.listGraphs.mockRejectedValue(new Error('dataset not found'));

    const res = await request(makeApp())
      .post('/v1/triplydb/list-graphs')
      .send({ dataset: 'PublishTest' });

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      status: 500,
      title: 'TriplyDB request failed',
      detail: 'dataset not found',
    });
  });

  test('falls back to a generic message for a non-Error rejection', async () => {
    svc.listGraphs.mockRejectedValue('boom');

    const res = await request(makeApp())
      .post('/v1/triplydb/list-graphs')
      .send({ dataset: 'PublishTest' });

    expect(res.body.detail).toBe('Failed to list graphs');
  });
});

describe('POST /v1/triplydb/test-connection', () => {
  test('answers 200 when the dataset exists', async () => {
    svc.testConnection.mockResolvedValue(200);

    const res = await request(makeApp())
      .post('/v1/triplydb/test-connection')
      .send({ dataset: 'PublishTest' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, message: 'Connection successful', status: 200 });
    expect(svc.testConnection).toHaveBeenCalledWith(SERVER_CONFIG);
  });

  test('answers 404 when TriplyDB does not know the dataset', async () => {
    svc.testConnection.mockResolvedValue(404);

    const res = await request(makeApp())
      .post('/v1/triplydb/test-connection')
      .send({ dataset: 'Missing' });

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ status: 404, title: 'Dataset not found' });
  });

  test.each([401, 403, 500, 503])(
    'answers 502 when TriplyDB answers %i, not "Dataset not found" (#234)',
    async (status) => {
      svc.testConnection.mockResolvedValue(status);

      const res = await request(makeApp())
        .post('/v1/triplydb/test-connection')
        .send({ dataset: 'PublishTest' });

      expect(res.status).toBe(502);
      expect(res.body).toMatchObject({
        title: 'TriplyDB request failed',
        detail: `TriplyDB answered HTTP ${status}`,
      });
    }
  );

  test('rejects a missing dataset with 400', async () => {
    const res = await request(makeApp()).post('/v1/triplydb/test-connection').send({});

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_INPUT');
    expect(svc.testConnection).not.toHaveBeenCalled();
  });

  test('returns 500 when the test itself throws', async () => {
    svc.testConnection.mockRejectedValue(new Error('DNS failure'));

    const res = await request(makeApp())
      .post('/v1/triplydb/test-connection')
      .send({ dataset: 'PublishTest' });

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
      .send({ dataset: 'PublishTest' });

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

describe('#142 / ttl-editor#234 TriplyDB host', () => {
  test.each(['/update-service', '/list-graphs', '/test-connection'])(
    '%s never goes to a host the caller names, only to the server target',
    async (path) => {
      svc.updateService.mockResolvedValue({ success: true, graphCount: 0 });
      svc.listGraphs.mockResolvedValue([]);
      svc.testConnection.mockResolvedValue(200);

      await request(makeApp())
        .post(`/v1/triplydb${path}`)
        .send({ config: { ...CONFIG, baseUrl: 'https://example.org' }, serviceName: 'svc' });

      for (const fn of [svc.updateService, svc.listGraphs, svc.testConnection]) {
        for (const call of fn.mock.calls) {
          expect(call[0].baseUrl).toBe('https://api.open-regels.triply.cc');
          expect(call[0].apiToken).toBe('server-secret');
        }
      }
    }
  );
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
      dataset: 'PublishTest',
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
      dataset: 'PublishTest',
      serviceName: 'PublishTest',
    });
    expect(failed.status).toBe(500);
    expectToMatchOperation(failed, 'post', '/triplydb/update-service');

    svc.publishTarget.mockReturnValue(null);
    const off = await post('/update-service').send({
      dataset: 'PublishTest',
      serviceName: 'PublishTest',
    });
    expect(off.status).toBe(503);
    expectToMatchOperation(off, 'post', '/triplydb/update-service');
  });

  test('POST /list-graphs 200, 400 and 500, as documented', async () => {
    svc.listGraphs.mockResolvedValue(['graph:default', 'graph:default-1']);
    const ok = await post('/list-graphs').send({ dataset: 'PublishTest' });
    expect(ok.status).toBe(200);
    expectToMatchOperation(ok, 'post', '/triplydb/list-graphs');

    const bad = await post('/list-graphs').send({});
    expect(bad.status).toBe(400);
    expectToMatchOperation(bad, 'post', '/triplydb/list-graphs');

    svc.listGraphs.mockRejectedValue(new Error('Failed to list graphs: 404'));
    const failed = await post('/list-graphs').send({ dataset: 'PublishTest' });
    expect(failed.status).toBe(500);
    expectToMatchOperation(failed, 'post', '/triplydb/list-graphs');
  });

  test('POST /test-connection 200, 404, 502, 400 and 500, as documented', async () => {
    svc.testConnection.mockResolvedValue(200);
    const ok = await post('/test-connection').send({ dataset: 'PublishTest' });
    expect(ok.status).toBe(200);
    expectToMatchOperation(ok, 'post', '/triplydb/test-connection');

    svc.testConnection.mockResolvedValue(404);
    const missing = await post('/test-connection').send({ dataset: 'Missing' });
    expect(missing.status).toBe(404);
    expectToMatchOperation(missing, 'post', '/triplydb/test-connection');

    svc.testConnection.mockResolvedValue(401);
    const refused = await post('/test-connection').send({ dataset: 'PublishTest' });
    expect(refused.status).toBe(502);
    expectToMatchOperation(refused, 'post', '/triplydb/test-connection');

    const bad = await post('/test-connection').send({});
    expect(bad.status).toBe(400);
    expectToMatchOperation(bad, 'post', '/triplydb/test-connection');

    svc.testConnection.mockRejectedValue(new Error('DNS failure'));
    const failed = await post('/test-connection').send({ dataset: 'PublishTest' });
    expect(failed.status).toBe(500);
    expectToMatchOperation(failed, 'post', '/triplydb/test-connection');
  });

  test('POST /publish and GET /publish-target, as documented (ttl-editor#234)', async () => {
    svc.uploadTtl.mockResolvedValue(undefined);
    svc.updateService.mockResolvedValue({ success: true, graphCount: 1 });
    const body = {
      dataset: 'PublishTest',
      graph: 'https://regels.overheid.nl/graphs/svb/aow',
      filename: 'aow',
      ttl: '@prefix x: <http://x/> .',
    };
    const ok = await post('/publish').send(body);
    expect(ok.status).toBe(200);
    expectToMatchOperation(ok, 'post', '/triplydb/publish');

    const bad = await post('/publish').send({ ...body, dataset: 'a/b' });
    expect(bad.status).toBe(400);
    expectToMatchOperation(bad, 'post', '/triplydb/publish');

    svc.uploadTtl.mockRejectedValue(new Error('TriplyDB upload failed: 500'));
    const failed = await post('/publish').send(body);
    expect(failed.status).toBe(502);
    expectToMatchOperation(failed, 'post', '/triplydb/publish');

    const target = await request(makeDocumentedApp()).get('/v1/triplydb/publish-target');
    expect(target.status).toBe(200);
    expectToMatchOperation(target, 'get', '/triplydb/publish-target');

    svc.publishTarget.mockReturnValue(null);
    const off = await post('/publish').send(body);
    expect(off.status).toBe(503);
    expectToMatchOperation(off, 'post', '/triplydb/publish');
    const targetOff = await request(makeDocumentedApp()).get('/v1/triplydb/publish-target');
    expect(targetOff.status).toBe(503);
    expectToMatchOperation(targetOff, 'get', '/triplydb/publish-target');
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
