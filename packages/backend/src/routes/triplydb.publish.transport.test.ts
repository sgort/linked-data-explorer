import { AxiosError, AxiosHeaders, InternalAxiosRequestConfig } from 'axios';
import express from 'express';
import request from 'supertest';

/**
 * A transport failure during a publish never shows the server's TriplyDB
 * token (#336).
 *
 * triplydb.routes.test.ts mocks the whole service, so it cannot see what a
 * real axios failure carries: an AxiosError keeps the request's config and
 * headers, Authorization included. Only `.message` reaches the answer and the
 * log today; this runs the real service and route, with only the outbound HTTP
 * client replaced, so that stays pinned down.
 */

const TOKEN = 'server-secret-token-336';

jest.mock('../middleware/auth.middleware', () => ({
  requireAuthor: (_req: unknown, res: { locals: Record<string, unknown> }, next: () => void) => {
    res.locals.user = { sub: 'sub-1', username: 'author-1', roles: ['lde-author'] };
    next();
  },
  optionalAuthor: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
jest.mock('../utils/logger', () => {
  const log = { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() };
  return { __esModule: true, logger: log, default: log };
});
const mockRequest = jest.fn();
jest.mock('../utils/outboundHttp', () => ({
  createOutboundClient: () => ({ request: (...args: unknown[]) => mockRequest(...args) }),
}));

import { logger } from '../utils/logger';
import { config } from '../utils/config';
import triplydbRoutes from './triplydb.routes';

const log = logger as unknown as Record<string, jest.Mock>;

/** What axios rejects with when the connection fails: config and headers kept. */
function transportFailure(): AxiosError {
  const headers = new AxiosHeaders({ Authorization: `Bearer ${TOKEN}` });
  const requestConfig = {
    url: 'https://api.open-regels.triply.cc/datasets/stevengort/PublishTest/jobs',
    method: 'post',
    headers,
  } as InternalAxiosRequestConfig;
  return new AxiosError('connect ECONNREFUSED 203.0.113.9:443', 'ECONNREFUSED', requestConfig, {
    _header: `POST /jobs HTTP/1.1\r\nAuthorization: Bearer ${TOKEN}\r\n`,
  });
}

const BODY = {
  dataset: 'PublishTest',
  graph: 'https://regels.overheid.nl/graphs/svb/aow',
  filename: 'aow',
  ttl: '@prefix x: <http://x/> .',
  logos: [{ fileName: 'svb_logo.png', dataUrl: 'data:image/png;base64,cG5n' }],
};

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/v1/triplydb', triplydbRoutes);
  return app;
}

const saved = { ...config.triplydb.publish };
beforeEach(() => {
  mockRequest.mockReset();
  for (const fn of Object.values(log)) fn.mockClear();
  Object.assign(config.triplydb.publish, {
    baseUrl: 'https://api.open-regels.triply.cc',
    account: 'stevengort',
    apiToken: TOKEN,
  });
});
afterAll(() => {
  Object.assign(config.triplydb.publish, saved);
});

describe('a real AxiosError through the service and the route', () => {
  test('a failed TTL upload answers 502 without the token, and logs none', async () => {
    mockRequest.mockRejectedValue(transportFailure());

    const res = await request(makeApp()).post('/v1/triplydb/publish').send(BODY);

    expect(res.status).toBe(502);
    expect(res.body.detail).toContain('ECONNREFUSED');
    expect(JSON.stringify(res.body)).not.toContain(TOKEN);
    for (const fn of Object.values(log)) {
      expect(JSON.stringify(fn.mock.calls)).not.toContain(TOKEN);
    }
  });

  test('a failed logo and a failed service sync answer 200 without the token, and log none', async () => {
    // The TTL upload succeeds; every later call (logo, graph list, sync) fails.
    mockRequest
      .mockResolvedValueOnce({ status: 200, statusText: 'OK', data: '{}' })
      .mockRejectedValue(transportFailure());

    const res = await request(makeApp()).post('/v1/triplydb/publish').send(BODY);

    expect(res.status).toBe(200);
    expect(res.body.logos).toEqual([{ fileName: 'svb_logo.png', ok: false }]);
    expect(res.body.serviceUpdated).toBe(false);
    expect(JSON.stringify(res.body)).not.toContain(TOKEN);
    for (const fn of Object.values(log)) {
      expect(JSON.stringify(fn.mock.calls)).not.toContain(TOKEN);
    }
  });
});
