// packages/backend/src/routes/norms.v2.routes.test.ts
import express from 'express';
import request from 'supertest';

jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
jest.mock('../services/norms.service', () => ({
  __esModule: true,
  getNormsInForce: jest.fn(),
  SUPPORTED_CPRMV_VERSIONS: ['0.3.0', '0.3.2', '0.4.1'],
  DEFAULT_CPRMV_VERSION_V2: '0.4.1',
}));
jest.mock('../utils/etag', () => ({
  __esModule: true,
  computeNormsEtag: jest.fn(),
  computeLastModified: jest.fn(),
  digestRules: jest.fn(),
}));
// A fixed "today" and a fixed distance to midnight; isCalendarDate stays real.
jest.mock('../utils/amsterdamDate', () => ({
  __esModule: true,
  ...jest.requireActual('../utils/amsterdamDate'),
  todayInAmsterdam: jest.fn(() => '2026-08-15'),
  secondsUntilAmsterdamMidnight: jest.fn(() => 86400),
}));

import { getNormsInForce } from '../services/norms.service';
import { computeLastModified, computeNormsEtag, digestRules } from '../utils/etag';
import { secondsUntilAmsterdamMidnight } from '../utils/amsterdamDate';
import normsV2Routes from './norms.v2.routes';
import packageJson from '../../package.json';
import { versionMiddleware } from '../middleware/version.middleware';
import { expectToMatchOperation } from '../openapi/testing/conformance';
import { readOpenApiV2Document } from '../openapi/document';

const mockGetNormsInForce = getNormsInForce as jest.Mock;
const mockEtag = computeNormsEtag as jest.Mock;
const mockLastModified = computeLastModified as jest.Mock;
const mockDigest = digestRules as jest.Mock;
const mockSecondsUntilMidnight = secondsUntilAmsterdamMidnight as jest.Mock;

const ETAG = '"a1b2c3d4"';
const LAST_MODIFIED = 'Wed, 01 Jul 2026 00:00:00 GMT';

function makeApp() {
  const app = express();
  app.use(versionMiddleware);
  app.use('/v2/norms', normsV2Routes);
  return app;
}

function inForce(overrides: { complete?: boolean } = {}) {
  return {
    rules: [{ rulesetid: 'BWBR0015703', applicable_date: '2026-07-01' }],
    aggregations: { normsPerRulesetid: { BWBR0015703: 1 } },
    metadata: {
      datasetVersions:
        overrides.complete === false
          ? {}
          : {
              BWBR0015703: [
                {
                  version: '2026-07-01',
                  publishedAt: '2026-07-01',
                  title: 'Participatiewet',
                },
              ],
            },
      cprmvVersion: '0.4.1',
    },
  };
}

beforeEach(() => {
  mockGetNormsInForce.mockReset().mockResolvedValue(inForce());
  mockEtag.mockReset().mockReturnValue(ETAG);
  mockLastModified.mockReset().mockReturnValue(LAST_MODIFIED);
  mockDigest.mockReset().mockReturnValue('d1g3st');
  mockSecondsUntilMidnight.mockReset().mockReturnValue(86400);
});

describe('GET /v2/norms defaults', () => {
  test('answers for today in Amsterdam, in CPRMV 0.4.1', async () => {
    const res = await request(makeApp()).get('/v2/norms');

    expect(res.status).toBe(200);
    expect(mockGetNormsInForce).toHaveBeenCalledWith(
      undefined,
      { rulesetid: undefined, validOn: '2026-08-15' },
      '0.4.1'
    );
    expect(res.body.data.valid_on).toBe('2026-08-15');
  });

  test('returns the v1 envelope plus valid_on', async () => {
    const res = await request(makeApp()).get('/v2/norms');

    expect(res.body.data).toEqual({
      total: 1,
      valid_on: '2026-08-15',
      dataset_versions: {
        BWBR0015703: [
          {
            version: '2026-07-01',
            published_at: '2026-07-01',
            title: 'Participatiewet',
          },
        ],
      },
      cprmv_version: '0.4.1',
      aggregations: { norms_per_rulesetid: { BWBR0015703: 1 } },
      rules: [{ rulesetid: 'BWBR0015703', applicable_date: '2026-07-01' }],
    });
    expect(res.headers['api-version']).toBe(packageJson.version);
  });

  test('carries no deprecation headers', async () => {
    const res = await request(makeApp()).get('/v2/norms');

    expect(res.headers['deprecation']).toBeUndefined();
    expect(res.headers['sunset']).toBeUndefined();
  });
});

describe('GET /v2/norms parameters', () => {
  test('forwards valid_on, rulesetid and cprmv_version', async () => {
    await request(makeApp()).get('/v2/norms').query({
      valid_on: '2026-01-15',
      rulesetid: 'BWBR0015703',
      cprmv_version: '0.3.0',
    });

    expect(mockGetNormsInForce).toHaveBeenCalledWith(
      undefined,
      { rulesetid: 'BWBR0015703', validOn: '2026-01-15' },
      '0.3.0'
    );
  });

  test.each(['2026-02-30', '2026-8-15', '15-08-2026', 'today'])(
    'rejects valid_on=%s',
    async (value) => {
      const res = await request(makeApp()).get('/v2/norms').query({ valid_on: value });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_PARAM');
      expect(res.body.detail).toMatch(/valid_on/);
      expect(mockGetNormsInForce).not.toHaveBeenCalled();
    }
  );

  test('rejects a repeated valid_on', async () => {
    const res = await request(makeApp()).get('/v2/norms?valid_on=2026-01-01&valid_on=2026-02-01');

    expect(res.status).toBe(400);
    expect(mockGetNormsInForce).not.toHaveBeenCalled();
  });

  test('rejects applicable_date and points to valid_on', async () => {
    const res = await request(makeApp()).get('/v2/norms').query({ applicable_date: '2026-07-01' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_PARAM');
    expect(res.body.detail).toMatch(/valid_on/);
  });

  test.each([
    ['rulesetid[]=BWBR0015703'],
    ['cprmv_version=0.3.0&cprmv_version=0.4.1'],
    ['valid_on[a]=b'],
  ])('rejects the non-string parameter %s', async (qs) => {
    const res = await request(makeApp()).get('/v2/norms?' + qs);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_PARAM');
    expect(mockGetNormsInForce).not.toHaveBeenCalled();
  });

  test('rejects an invalid rulesetid', async () => {
    const res = await request(makeApp()).get('/v2/norms').query({ rulesetid: 'x"; DROP' });

    expect(res.status).toBe(400);
  });

  test('rejects an unsupported cprmv_version', async () => {
    const res = await request(makeApp()).get('/v2/norms').query({ cprmv_version: '9.9.9' });

    expect(res.status).toBe(400);
    expect(res.body.detail).toContain('0.4.1');
  });
});

describe('GET /v2/norms caching', () => {
  test('signs the ETag with the dataset metadata, the resolved date, the rules and the API generation (api: v2)', async () => {
    await request(makeApp()).get('/v2/norms');

    expect(mockDigest).toHaveBeenCalledWith(inForce().rules);
    expect(mockEtag).toHaveBeenCalledWith({
      datasetVersions: inForce().metadata.datasetVersions,
      filterSignature: {
        api: 'v2',
        endpoint: undefined,
        rulesetid: undefined,
        valid_on: '2026-08-15',
        cprmv_version: '0.4.1',
        rules_digest: 'd1g3st',
      },
    });
  });

  test('signs a different rules digest when the rules differ but the metadata does not', async () => {
    const corrected = inForce();
    corrected.rules = [
      ...corrected.rules,
      { rulesetid: 'BWBR0015703', applicable_date: '2026-07-01' },
    ];
    mockGetNormsInForce.mockResolvedValueOnce(inForce()).mockResolvedValueOnce(corrected);
    mockDigest.mockReturnValueOnce('first').mockReturnValueOnce('second');

    await request(makeApp()).get('/v2/norms');
    await request(makeApp()).get('/v2/norms');

    expect(mockDigest).toHaveBeenNthCalledWith(1, inForce().rules);
    expect(mockDigest).toHaveBeenNthCalledWith(2, corrected.rules);
    const signatures = mockEtag.mock.calls.map((c) => c[0].filterSignature.rules_digest);
    expect(signatures).toEqual(['first', 'second']);
  });

  test('omits a Last-Modified that would be later than the response', async () => {
    mockLastModified.mockReturnValue(new Date(Date.now() + 30 * 86400_000).toUTCString());

    const res = await request(makeApp()).get('/v2/norms');

    expect(res.status).toBe(200);
    expect(res.headers['last-modified']).toBeUndefined();
    expect(res.headers['etag']).toBe(ETAG);
  });

  test('answers 304 to If-None-Match plus If-Modified-Since when Last-Modified is in the future', async () => {
    mockLastModified.mockReturnValue(new Date(Date.now() + 30 * 86400_000).toUTCString());

    const res = await request(makeApp())
      .get('/v2/norms')
      .set('If-None-Match', ETAG)
      .set('If-Modified-Since', new Date(Date.now() - 60_000).toUTCString());

    expect(res.status).toBe(304);
  });

  test('lets a matching If-None-Match win over an older If-Modified-Since', async () => {
    const res = await request(makeApp())
      .get('/v2/norms')
      .set('If-None-Match', ETAG)
      .set('If-Modified-Since', 'Wed, 01 Jan 2020 00:00:00 GMT');

    expect(res.status).toBe(304);
  });

  test('answers 304 to If-Modified-Since alone when Last-Modified is not newer', async () => {
    const res = await request(makeApp())
      .get('/v2/norms')
      .set('If-Modified-Since', 'Thu, 02 Jul 2026 00:00:00 GMT');

    expect(res.status).toBe(304);
  });

  test('answers 200 to an If-Modified-Since older than Last-Modified, without If-None-Match', async () => {
    const res = await request(makeApp())
      .get('/v2/norms')
      .set('If-Modified-Since', 'Wed, 01 Jan 2020 00:00:00 GMT');

    expect(res.status).toBe(200);
  });

  test('passes a past Last-Modified through unchanged', async () => {
    const res = await request(makeApp()).get('/v2/norms');

    expect(res.headers['last-modified']).toBe(LAST_MODIFIED);
  });

  test('caps max-age at the next Amsterdam midnight when valid_on is omitted', async () => {
    mockSecondsUntilMidnight.mockReturnValue(1200);

    const res = await request(makeApp()).get('/v2/norms');

    expect(res.headers['cache-control']).toBe('public, max-age=1200');
  });

  test('keeps max-age at 3600 when midnight is further away', async () => {
    const res = await request(makeApp()).get('/v2/norms');

    expect(res.headers['cache-control']).toBe('public, max-age=3600');
  });

  test('does not cap max-age for an explicit valid_on', async () => {
    mockSecondsUntilMidnight.mockReturnValue(1200);

    const res = await request(makeApp()).get('/v2/norms').query({ valid_on: '2026-08-15' });

    expect(res.headers['cache-control']).toBe('public, max-age=3600');
  });

  test('answers 304 to a matching If-None-Match', async () => {
    const res = await request(makeApp()).get('/v2/norms').set('If-None-Match', ETAG);

    expect(res.status).toBe(304);
  });

  test('falls back to no-cache when a ruleset has no metadata', async () => {
    mockGetNormsInForce.mockResolvedValue(inForce({ complete: false }));

    const res = await request(makeApp()).get('/v2/norms');

    expect(res.headers['cache-control']).toBe('no-cache');
    expect(mockEtag).not.toHaveBeenCalled();
    // Express adds its own weak ETag to any res.json body; ours is never signed.
    if (res.headers['etag'] !== undefined) expect(res.headers['etag']).toMatch(/^W\//);
  });
});

describe('GET /v2/norms failures', () => {
  test('answers 500 QUERY_ERROR when the query fails', async () => {
    mockGetNormsInForce.mockRejectedValue(new Error('SPARQL endpoint unreachable'));

    const res = await request(makeApp()).get('/v2/norms');

    expect(res.status).toBe(500);
    expect(res.body.code).toBe('QUERY_ERROR');
  });

  test('refuses an internal endpoint without querying it', async () => {
    const res = await request(makeApp())
      .get('/v2/norms')
      .query({ endpoint: 'http://127.0.0.1/sparql' });

    expect(res.status).toBe(400);
    expect(mockGetNormsInForce).not.toHaveBeenCalled();
  });
});

describe('/v2/norms matches its OpenAPI description', () => {
  const document = readOpenApiV2Document();

  test('200, as documented', async () => {
    const res = await request(makeApp()).get('/v2/norms');
    expectToMatchOperation(res, 'get', '/norms', document);
  });

  test('200 with every parameter, as documented', async () => {
    const res = await request(makeApp()).get('/v2/norms').query({
      valid_on: '2026-01-15',
      rulesetid: 'BWBR0015703',
      cprmv_version: '0.3.2',
    });
    expectToMatchOperation(res, 'get', '/norms', document);
  });

  test('304, as documented', async () => {
    const res = await request(makeApp()).get('/v2/norms').set('If-None-Match', ETAG);
    expectToMatchOperation(res, 'get', '/norms', document);
  });

  test('400, as documented', async () => {
    const res = await request(makeApp()).get('/v2/norms').query({ valid_on: '2026-02-30' });
    expectToMatchOperation(res, 'get', '/norms', document);
  });

  test('500, as documented', async () => {
    mockGetNormsInForce.mockRejectedValue(new Error('down'));
    const res = await request(makeApp()).get('/v2/norms');
    expectToMatchOperation(res, 'get', '/norms', document);
  });
});
