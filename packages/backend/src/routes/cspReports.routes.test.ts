import express from 'express';
import request from 'supertest';

jest.mock('../utils/logger', () => ({
  __esModule: true,
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

import { logger } from '../utils/logger';
import cspReportsRoutes from './cspReports.routes';
import { versionMiddleware } from '../middleware/version.middleware';
import { errorHandler } from '../middleware/error.middleware';
import { expectToMatchOperation } from '../openapi/testing/conformance';

const mockWarn = logger.warn as jest.Mock;

function makeApp() {
  const app = express();
  app.use(versionMiddleware); // app-wide in index.ts
  app.use('/v1/csp-reports', cspReportsRoutes);
  app.use(errorHandler); // app-wide in index.ts; answers malformed/oversize bodies
  return app;
}

beforeEach(() => {
  mockWarn.mockReset();
});

const LEGACY_REPORT = {
  'csp-report': {
    'document-uri': 'https://acc.linkeddata.open-regels.nl/',
    referrer: '',
    'violated-directive': 'style-src',
    'effective-directive': 'style-src',
    'original-policy': "default-src 'self'; style-src 'self'",
    disposition: 'report',
    'blocked-uri': 'https://fonts.googleapis.com/css2',
    'line-number': 12,
    'column-number': 4,
    'source-file': 'https://acc.linkeddata.open-regels.nl/assets/index.js',
    'status-code': 200,
    'script-sample': '',
  },
};

const REPORTING_API_BODY = [
  {
    age: 53531,
    type: 'csp-violation',
    url: 'https://acc.linkeddata.open-regels.nl/',
    body: {
      blockedURL: 'https://fonts.googleapis.com/css2',
      disposition: 'report',
      documentURL: 'https://acc.linkeddata.open-regels.nl/',
      effectiveDirective: 'style-src',
      originalPolicy: "default-src 'self'; style-src 'self'",
      referrer: '',
      sample: '',
      sourceFile: 'https://acc.linkeddata.open-regels.nl/assets/index.js',
      statusCode: 200,
      lineNumber: 12,
      columnNumber: 4,
    },
  },
];

describe('POST /v1/csp-reports — legacy report-uri body', () => {
  test('204 and logs one warning with the useful fields', async () => {
    const res = await request(makeApp())
      .post('/v1/csp-reports')
      .set('Content-Type', 'application/csp-report')
      // supertest/superagent only auto-serializes types it recognises
      // (json, +json, form); application/csp-report needs an explicit
      // JSON.stringify.
      .send(JSON.stringify(LEGACY_REPORT));

    expect(res.status).toBe(204);
    expect(res.headers['api-version']).toBeDefined();
    expect(res.body).toEqual({});

    expect(mockWarn).toHaveBeenCalledTimes(1);
    const [message, fields] = mockWarn.mock.calls[0];
    expect(message).toBe('[CSP] violation');
    expect(fields).toMatchObject({
      violatedDirective: 'style-src',
      effectiveDirective: 'style-src',
      blockedUri: 'https://fonts.googleapis.com/css2',
      documentUri: 'https://acc.linkeddata.open-regels.nl/',
      sourceFile: 'https://acc.linkeddata.open-regels.nl/assets/index.js',
      disposition: 'report',
      lineNumber: 12,
      columnNumber: 4,
    });

    expectToMatchOperation(res, 'post', '/csp-reports');
  });

  test('400 INVALID_INPUT when the body is not a legacy report shape', async () => {
    const res = await request(makeApp())
      .post('/v1/csp-reports')
      .set('Content-Type', 'application/csp-report')
      .send(JSON.stringify({ notAReport: true }));

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_INPUT');
    expect(mockWarn).not.toHaveBeenCalled();
    expectToMatchOperation(res, 'post', '/csp-reports');
  });

  test('a malformed JSON body is 400 MALFORMED_BODY (#143 pattern)', async () => {
    const res = await request(makeApp())
      .post('/v1/csp-reports')
      .set('Content-Type', 'application/csp-report')
      .send('{"csp-report":');

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MALFORMED_BODY');
    expect(mockWarn).not.toHaveBeenCalled();
  });

  test('truncates a long field to a sane length', async () => {
    const longUri = `https://example.com/${'a'.repeat(1000)}`;
    const res = await request(makeApp())
      .post('/v1/csp-reports')
      .set('Content-Type', 'application/csp-report')
      .send(
        JSON.stringify({ 'csp-report': { ...LEGACY_REPORT['csp-report'], 'blocked-uri': longUri } })
      );

    expect(res.status).toBe(204);
    const [, fields] = mockWarn.mock.calls[0];
    expect((fields.blockedUri as string).length).toBeLessThanOrEqual(301);
    expect(longUri.length).toBeGreaterThan(301);
  });
});

describe('POST /v1/csp-reports — Reporting API body', () => {
  test('204 and logs one warning per report', async () => {
    const res = await request(makeApp())
      .post('/v1/csp-reports')
      .set('Content-Type', 'application/reports+json')
      .send(REPORTING_API_BODY);

    expect(res.status).toBe(204);
    expect(res.headers['api-version']).toBeDefined();
    expect(mockWarn).toHaveBeenCalledTimes(1);
    const [message, fields] = mockWarn.mock.calls[0];
    expect(message).toBe('[CSP] violation');
    expect(fields).toMatchObject({
      violatedDirective: undefined,
      effectiveDirective: 'style-src',
      blockedUri: 'https://fonts.googleapis.com/css2',
      documentUri: 'https://acc.linkeddata.open-regels.nl/',
      sourceFile: 'https://acc.linkeddata.open-regels.nl/assets/index.js',
      disposition: 'report',
      lineNumber: 12,
      columnNumber: 4,
    });

    expectToMatchOperation(res, 'post', '/csp-reports');
  });

  test('204 and logs nothing for an empty array (zero reports)', async () => {
    const res = await request(makeApp())
      .post('/v1/csp-reports')
      .set('Content-Type', 'application/reports+json')
      .send([]);

    expect(res.status).toBe(204);
    expect(mockWarn).not.toHaveBeenCalled();
  });

  test('ignores report entries that are not csp-violation', async () => {
    const res = await request(makeApp())
      .post('/v1/csp-reports')
      .set('Content-Type', 'application/reports+json')
      .send([{ type: 'deprecation', body: { id: 'something' } }]);

    expect(res.status).toBe(204);
    expect(mockWarn).not.toHaveBeenCalled();
  });

  test('logs at most 20 reports from a larger, size-realistic batch', async () => {
    // 35 realistic (~1.1 KB) entries -- ~39 KB total, comfortably under the
    // route's 64 KB limit (#161), the way a real Chrome batch of queued
    // reports would be; a batch this size at the old 16 KB limit would have
    // 413'd and been lost entirely rather than logging the 20 it can.
    const many = Array.from({ length: 35 }, () => REALISTIC_REPORTING_ENTRY);
    const res = await request(makeApp())
      .post('/v1/csp-reports')
      .set('Content-Type', 'application/reports+json')
      .send(many);

    expect(res.status).toBe(204);
    expect(mockWarn).toHaveBeenCalledTimes(20);
  });

  test('400 INVALID_INPUT when the body is not an array', async () => {
    const res = await request(makeApp())
      .post('/v1/csp-reports')
      .set('Content-Type', 'application/reports+json')
      .send({ type: 'csp-violation' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_INPUT');
    expect(mockWarn).not.toHaveBeenCalled();
    expectToMatchOperation(res, 'post', '/csp-reports');
  });

  test('ignores an array entry that is not an object', async () => {
    const res = await request(makeApp())
      .post('/v1/csp-reports')
      .set('Content-Type', 'application/reports+json')
      .send(['not an object', null]);

    expect(res.status).toBe(204);
    expect(mockWarn).not.toHaveBeenCalled();
  });

  test('ignores a csp-violation entry whose body is missing or not an object', async () => {
    const res = await request(makeApp())
      .post('/v1/csp-reports')
      .set('Content-Type', 'application/reports+json')
      .send([{ type: 'csp-violation' }, { type: 'csp-violation', body: 'not-an-object' }]);

    expect(res.status).toBe(204);
    expect(mockWarn).not.toHaveBeenCalled();
  });

  test('omits line/column numbers that are missing rather than coercing them', async () => {
    const res = await request(makeApp())
      .post('/v1/csp-reports')
      .set('Content-Type', 'application/reports+json')
      .send([
        {
          type: 'csp-violation',
          body: { blockedURL: 'https://fonts.googleapis.com/css2' },
        },
      ]);

    expect(res.status).toBe(204);
    const [, fields] = mockWarn.mock.calls[0];
    expect(fields.lineNumber).toBeUndefined();
    expect(fields.columnNumber).toBeUndefined();
  });
});

// A size-realistic Reporting API entry (~1.1 KB) -- real ones carry the
// *entire* policy string in `body.originalPolicy` plus a full user_agent, not
// the handful of short fields REPORTING_API_BODY above uses to keep its
// field-mapping assertions readable. Used only where the entry's size is the
// point of the test (#161: Chrome batches several queued reports into one
// delivery, so the route's limit has to tolerate more than a token-sized
// payload).
const REALISTIC_REPORTING_ENTRY = {
  age: 53531,
  type: 'csp-violation',
  url: 'https://acc.linkeddata.open-regels.nl/orchestration?tab=chain-builder',
  user_agent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  body: {
    blockedURL:
      'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap',
    disposition: 'report',
    documentURL: 'https://acc.linkeddata.open-regels.nl/orchestration?tab=chain-builder',
    effectiveDirective: 'style-src',
    originalPolicy:
      "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; " +
      "font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: " +
      'https://open-regels.triply.cc https://api.open-regels.triply.cc; ' +
      "connect-src 'self' https://acc.backend.linkeddata.open-regels.nl; frame-ancestors 'none'; " +
      "base-uri 'self'; form-action 'self'; object-src 'none'; report-uri " +
      'https://acc.backend.linkeddata.open-regels.nl/v1/csp-reports; report-to csp',
    referrer: 'https://acc.linkeddata.open-regels.nl/',
    sample: '',
    sourceFile: 'https://acc.linkeddata.open-regels.nl/assets/index-abc123.js',
    statusCode: 200,
    lineNumber: 12,
    columnNumber: 4,
  },
};

describe('POST /v1/csp-reports — content type and size', () => {
  test('415 for an unsupported content type', async () => {
    const res = await request(makeApp())
      .post('/v1/csp-reports')
      .set('Content-Type', 'application/json')
      .send({ 'csp-report': {} });

    expect(res.status).toBe(415);
    expect(mockWarn).not.toHaveBeenCalled();
    expectToMatchOperation(res, 'post', '/csp-reports');
  });

  test('413 for a body over the route-scoped limit', async () => {
    const oversized = {
      'csp-report': { 'blocked-uri': 'x'.repeat(70 * 1024) },
    };
    const res = await request(makeApp())
      .post('/v1/csp-reports')
      .set('Content-Type', 'application/csp-report')
      .send(JSON.stringify(oversized));

    expect(res.status).toBe(413);
    expect(mockWarn).not.toHaveBeenCalled();
    // This route's own 64 kb limit (not the app-wide 10 MB BODY_SIZE_LIMIT,
    // which the shared error handler used to name regardless of which
    // route's parser actually rejected the body -- #161).
    expect(res.body.detail).toBe('The request body exceeds the 64 kB limit.');
    expectToMatchOperation(res, 'post', '/csp-reports');
  });
});
