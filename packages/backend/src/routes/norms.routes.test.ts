import express from 'express';
import request from 'supertest';

jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
jest.mock('../services/norms.service', () => ({
  __esModule: true,
  getAllNorms: jest.fn(),
  getDatasetVersionsByRulesetid: jest.fn(),
  SUPPORTED_CPRMV_VERSIONS: ['0.3.0', '0.3.2', '0.4.1'],
  DEFAULT_CPRMV_VERSION: '0.3.0',
}));
// Stubbed to fixed values so the assertions describe the route's cache-header
// policy rather than re-deriving the hash; utils/etag has its own unit tests.
jest.mock('../utils/etag', () => ({
  __esModule: true,
  computeNormsEtag: jest.fn(),
  computeLastModified: jest.fn(),
}));

import { getAllNorms, getDatasetVersionsByRulesetid } from '../services/norms.service';
import { computeLastModified, computeNormsEtag } from '../utils/etag';
import normsRoutes from './norms.routes';
import packageJson from '../../package.json';

const mockGetAllNorms = getAllNorms as jest.Mock;
const mockGetDatasetVersions = getDatasetVersionsByRulesetid as jest.Mock;
const mockEtag = computeNormsEtag as jest.Mock;
const mockLastModified = computeLastModified as jest.Mock;

const ETAG = '"a1b2c3d4"';
const LAST_MODIFIED = 'Wed, 01 Jan 2026 00:00:00 GMT';

function makeApp() {
  const app = express();
  app.use('/v1/norms', normsRoutes);
  return app;
}

function normsResult(
  overrides: {
    rules?: unknown[];
    datasetVersions?: Record<
      string,
      Array<{ version: string | null; publishedAt: string; title: string | null }>
    >;
    normsPerRulesetid?: Record<string, number>;
    cprmvVersion?: string;
  } = {}
) {
  return {
    rules: overrides.rules ?? [{ id: 'rule-1', rulesetid: 'awb' }],
    metadata: {
      datasetVersions: overrides.datasetVersions ?? {
        awb: [{ version: '1.0', publishedAt: '2026-01-01T00:00:00.000Z', title: 'Awb' }],
      },
      cprmvVersion: overrides.cprmvVersion ?? '0.3.0',
    },
    aggregations: { normsPerRulesetid: overrides.normsPerRulesetid ?? { awb: 1 } },
  };
}

beforeEach(() => {
  mockGetAllNorms.mockReset().mockResolvedValue(normsResult());
  mockGetDatasetVersions.mockReset().mockResolvedValue({});
  mockEtag.mockReset().mockReturnValue(ETAG);
  mockLastModified.mockReset().mockReturnValue(LAST_MODIFIED);
});

describe('GET /v1/norms response envelope', () => {
  test('returns the rules with a total and snake_cased metadata', async () => {
    const res = await request(makeApp()).get('/v1/norms');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual({
      total: 1,
      dataset_versions: {
        awb: [{ version: '1.0', published_at: '2026-01-01T00:00:00.000Z', title: 'Awb' }],
      },
      cprmv_version: '0.3.0',
      aggregations: { norms_per_rulesetid: { awb: 1 } },
      rules: [{ id: 'rule-1', rulesetid: 'awb' }],
    });
  });

  test('keeps every applicable-period record per rulesetid, in service order', async () => {
    mockGetAllNorms.mockResolvedValue(
      normsResult({
        datasetVersions: {
          awb: [
            { version: '2.0', publishedAt: '2026-02-01T00:00:00.000Z', title: 'Awb 2' },
            { version: null, publishedAt: '2026-01-01T00:00:00.000Z', title: null },
          ],
        },
      })
    );

    const res = await request(makeApp()).get('/v1/norms');

    expect(res.body.data.dataset_versions.awb).toEqual([
      { version: '2.0', published_at: '2026-02-01T00:00:00.000Z', title: 'Awb 2' },
      { version: null, published_at: '2026-01-01T00:00:00.000Z', title: null },
    ]);
  });

  test('sets the API-Version header (API-57)', async () => {
    const res = await request(makeApp()).get('/v1/norms');

    expect(res.headers['api-version']).toBe(packageJson.version);
  });
});

describe('GET /v1/norms parameter validation', () => {
  test('rejects a rulesetid outside the safe character class', async () => {
    const res = await request(makeApp()).get('/v1/norms').query({ rulesetid: 'awb"; DROP' });

    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({
      code: 'INVALID_PARAM',
      message: 'Invalid rulesetid: must match /^[A-Za-z0-9_-]+$/',
    });
    expect(mockGetAllNorms).not.toHaveBeenCalled();
  });

  test('accepts a rulesetid of letters, digits, underscore and hyphen', async () => {
    const res = await request(makeApp()).get('/v1/norms').query({ rulesetid: 'awb_2-1' });

    expect(res.status).toBe(200);
  });

  test('rejects an empty rulesetid, since the pattern requires at least one character', async () => {
    const res = await request(makeApp()).get('/v1/norms').query({ rulesetid: '' });

    expect(res.status).toBe(400);
  });

  test('rejects an applicable_date that is not YYYY-MM-DD', async () => {
    const res = await request(makeApp()).get('/v1/norms').query({ applicable_date: '01-01-2026' });

    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({
      code: 'INVALID_PARAM',
      message: 'Invalid applicable_date: must be YYYY-MM-DD',
    });
    expect(mockGetAllNorms).not.toHaveBeenCalled();
  });

  test('accepts a well-formed applicable_date and forwards it', async () => {
    await request(makeApp()).get('/v1/norms').query({ applicable_date: '2026-01-01' });

    expect(mockGetAllNorms).toHaveBeenCalledWith(
      undefined,
      { rulesetid: undefined, applicableDate: '2026-01-01' },
      '0.3.0'
    );
  });

  test('rejects an unsupported cprmv_version and names the supported set', async () => {
    const res = await request(makeApp()).get('/v1/norms').query({ cprmv_version: '9.9.9' });

    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({
      code: 'INVALID_PARAM',
      message: 'Invalid cprmv_version: must be one of 0.3.0, 0.3.2, 0.4.1',
    });
    expect(mockGetAllNorms).not.toHaveBeenCalled();
  });

  test('forwards a supported cprmv_version', async () => {
    await request(makeApp()).get('/v1/norms').query({ cprmv_version: '0.4.1' });

    expect(mockGetAllNorms).toHaveBeenCalledWith(undefined, expect.anything(), '0.4.1');
  });

  test('falls back to the default cprmv version when omitted', async () => {
    await request(makeApp()).get('/v1/norms');

    expect(mockGetAllNorms).toHaveBeenCalledWith(undefined, expect.anything(), '0.3.0');
  });

  test('forwards an endpoint override', async () => {
    await request(makeApp())
      .get('/v1/norms')
      .query({ endpoint: 'https://triplydb.example/sparql' });

    expect(mockGetAllNorms).toHaveBeenCalledWith(
      'https://triplydb.example/sparql',
      expect.anything(),
      '0.3.0'
    );
  });
});

describe('single-rulesetid ETag short circuit', () => {
  const withMetadata = {
    awb: [{ version: '1.0', publishedAt: '2026-01-01T00:00:00.000Z', title: 'Awb' }],
  };

  test('answers 304 without running the expensive rules query', async () => {
    mockGetDatasetVersions.mockResolvedValue(withMetadata);

    const res = await request(makeApp())
      .get('/v1/norms')
      .query({ rulesetid: 'awb' })
      .set('If-None-Match', ETAG);

    expect(res.status).toBe(304);
    expect(mockGetAllNorms).not.toHaveBeenCalled();
  });

  test('includes the filter parameters in the ETag signature', async () => {
    mockGetDatasetVersions.mockResolvedValue(withMetadata);

    await request(makeApp())
      .get('/v1/norms')
      .query({
        rulesetid: 'awb',
        applicable_date: '2026-01-01',
        cprmv_version: '0.4.1',
        endpoint: 'https://triplydb.example/sparql',
      })
      .set('If-None-Match', ETAG);

    expect(mockEtag).toHaveBeenCalledWith({
      datasetVersions: withMetadata,
      filterSignature: {
        endpoint: 'https://triplydb.example/sparql',
        rulesetid: 'awb',
        applicable_date: '2026-01-01',
        cprmv_version: '0.4.1',
      },
    });
  });

  test('runs the full query when the consumer has no matching validator', async () => {
    mockGetDatasetVersions.mockResolvedValue(withMetadata);

    const res = await request(makeApp()).get('/v1/norms').query({ rulesetid: 'awb' });

    expect(res.status).toBe(200);
    expect(mockGetAllNorms).toHaveBeenCalled();
    expect(res.headers.etag).toBe(ETAG);
    expect(res.headers['cache-control']).toBe('public, max-age=3600');
  });

  test('falls through uncached when the rulesetid has no dataset metadata yet', async () => {
    mockGetDatasetVersions.mockResolvedValue({});
    mockGetAllNorms.mockResolvedValue(
      normsResult({ datasetVersions: {}, normsPerRulesetid: { awb: 1 } })
    );

    const res = await request(makeApp())
      .get('/v1/norms')
      .query({ rulesetid: 'awb' })
      .set('If-None-Match', ETAG);

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-cache');
    expect(mockGetAllNorms).toHaveBeenCalled();
  });

  test('falls through uncached when the metadata list is empty', async () => {
    mockGetDatasetVersions.mockResolvedValue({ awb: [] });

    const res = await request(makeApp()).get('/v1/norms').query({ rulesetid: 'awb' });

    expect(res.status).toBe(200);
    expect(mockGetAllNorms).toHaveBeenCalled();
  });

  test('is skipped entirely for unfiltered requests', async () => {
    const res = await request(makeApp()).get('/v1/norms');

    expect(res.status).toBe(200);
    expect(mockGetDatasetVersions).not.toHaveBeenCalled();
  });
});

describe('post-query cache headers', () => {
  test('caches when every rulesetid in the response has dataset metadata', async () => {
    const res = await request(makeApp()).get('/v1/norms');

    expect(res.headers.etag).toBe(ETAG);
    expect(res.headers['last-modified']).toBe(LAST_MODIFIED);
    expect(res.headers['cache-control']).toBe('public, max-age=3600');
  });

  test('honours a conditional request on the multi-rulesetid path', async () => {
    mockGetAllNorms.mockResolvedValue(
      normsResult({
        datasetVersions: {
          awb: [{ version: '1.0', publishedAt: '2026-01-01T00:00:00.000Z', title: 'Awb' }],
          wro: [{ version: '2.0', publishedAt: '2026-01-02T00:00:00.000Z', title: 'Wro' }],
        },
        normsPerRulesetid: { awb: 1, wro: 3 },
      })
    );

    const res = await request(makeApp()).get('/v1/norms').set('If-None-Match', ETAG);

    expect(res.status).toBe(304);
  });

  test('falls back to no-cache when only some rulesetids have metadata', async () => {
    mockGetAllNorms.mockResolvedValue(
      normsResult({
        datasetVersions: {
          awb: [{ version: '1.0', publishedAt: '2026-01-01T00:00:00.000Z', title: 'Awb' }],
        },
        normsPerRulesetid: { awb: 1, wro: 2 },
      })
    );

    const res = await request(makeApp()).get('/v1/norms');

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-cache');
    expect(res.headers['last-modified']).toBeUndefined();
    // Express still stamps its own weak ETag on the JSON body; what matters is
    // that the route did not publish a norms validator of its own.
    expect(mockEtag).not.toHaveBeenCalled();
    expect(res.headers.etag).not.toBe(ETAG);
  });

  test('falls back to no-cache on an empty result set', async () => {
    mockGetAllNorms.mockResolvedValue(
      normsResult({ rules: [], datasetVersions: {}, normsPerRulesetid: {} })
    );

    const res = await request(makeApp()).get('/v1/norms');

    expect(res.body.data.total).toBe(0);
    expect(res.headers['cache-control']).toBe('no-cache');
  });

  test('omits Last-Modified when no publication date can be derived', async () => {
    mockLastModified.mockReturnValue(null);

    const res = await request(makeApp()).get('/v1/norms');

    expect(res.headers.etag).toBe(ETAG);
    expect(res.headers['last-modified']).toBeUndefined();
  });
});

describe('GET /v1/norms failures', () => {
  test('returns 500 with a QUERY_ERROR code when the rules query throws', async () => {
    mockGetAllNorms.mockRejectedValue(new Error('SPARQL endpoint unreachable'));

    const res = await request(makeApp()).get('/v1/norms');

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      success: false,
      error: { code: 'QUERY_ERROR', message: 'SPARQL endpoint unreachable' },
    });
  });

  test('returns 500 when the short-circuit metadata lookup throws', async () => {
    mockGetDatasetVersions.mockRejectedValue(new Error('metadata query failed'));

    const res = await request(makeApp()).get('/v1/norms').query({ rulesetid: 'awb' });

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('QUERY_ERROR');
  });
});
