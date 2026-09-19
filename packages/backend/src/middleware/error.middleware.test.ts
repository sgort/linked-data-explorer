import express, { Request, Response } from 'express';
import request from 'supertest';

// logger.ts self-executes real winston transports (Console + File) and a
// mkdirSync('logs') side effect on import — mock it so this test never
// touches the filesystem or a real logging pipeline.
jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: { error: jest.fn(), warn: jest.fn() },
}));

import logger from '../utils/logger';
import { errorHandler, notFoundHandler, BODY_SIZE_LIMIT } from './error.middleware';

function mockReqRes(overrides: Partial<Request> = {}) {
  const req = {
    path: '/v1/norms',
    originalUrl: '/v1/norms',
    method: 'GET',
    ...overrides,
  } as Request;
  const res = {
    status: jest.fn().mockReturnThis(),
    type: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as Response;
  return { req, res };
}

describe('errorHandler', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    jest.clearAllMocks();
  });

  test('logs the error with path/method and responds 500 with a generic message in production', () => {
    process.env.NODE_ENV = 'production';
    const { req, res } = mockReqRes();

    errorHandler(new Error('sensitive internal detail'), req, res, jest.fn());

    expect(logger.error).toHaveBeenCalledWith(
      'Unhandled error',
      expect.objectContaining({ path: '/v1/norms', method: 'GET' })
    );
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.type).toHaveBeenCalledWith('application/problem+json');
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 500,
        title: 'Internal server error',
        code: 'INTERNAL_ERROR',
        detail: 'Internal server error',
        instance: '/v1/norms',
      })
    );
  });

  test('surfaces the real error message outside production', () => {
    process.env.NODE_ENV = 'test';
    const { req, res } = mockReqRes();

    errorHandler(new Error('a specific failure'), req, res, jest.fn());

    const response = (res.json as jest.Mock).mock.calls[0][0];
    expect(response.detail).toBe('a specific failure');
  });

  test('includes the stack trace only in development', () => {
    process.env.NODE_ENV = 'development';
    const { req, res } = mockReqRes();

    errorHandler(new Error('boom'), req, res, jest.fn());

    const response = (res.json as jest.Mock).mock.calls[0][0];
    expect(response.details).toBeDefined();
  });

  test('omits error details outside development', () => {
    process.env.NODE_ENV = 'test';
    const { req, res } = mockReqRes();

    errorHandler(new Error('boom'), req, res, jest.fn());

    const response = (res.json as jest.Mock).mock.calls[0][0];
    expect(response.details).toBeUndefined();
  });

  test('handles a non-Error thrown value (e.g. a rejected string)', () => {
    process.env.NODE_ENV = 'test';
    const { req, res } = mockReqRes();

    errorHandler('a plain string rejection', req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    const response = (res.json as jest.Mock).mock.calls[0][0];
    expect(response.detail).toBe('a plain string rejection');
  });

  test('still answers 500 for a thrown error that merely happens to carry a status (#143)', () => {
    // A body-parser error is recognised by its `type`, not by the presence
    // of `status` -- otherwise any thrown error with a `status` property
    // could pick its own response status.
    process.env.NODE_ENV = 'test';
    const { req, res } = mockReqRes();
    const err = Object.assign(new Error('looks like a client error'), { status: 400 });

    errorHandler(err, req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    const response = (res.json as jest.Mock).mock.calls[0][0];
    expect(response.code).toBe('INTERNAL_ERROR');
  });

  test('entity.parse.failed (malformed JSON/urlencoded body) is 400 MALFORMED_BODY (#143)', () => {
    process.env.NODE_ENV = 'test';
    const { req, res } = mockReqRes();
    const err = Object.assign(new SyntaxError('Unexpected token'), {
      status: 400,
      statusCode: 400,
      type: 'entity.parse.failed',
    });

    errorHandler(err, req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.type).toHaveBeenCalledWith('application/problem+json');
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 400,
        code: 'MALFORMED_BODY',
        title: 'Malformed request body',
      })
    );
  });

  test('entity.too.large falls back to BODY_SIZE_LIMIT when the error carries no limit (#143)', () => {
    process.env.NODE_ENV = 'test';
    const { req, res } = mockReqRes();
    const err = Object.assign(new Error('request entity too large'), {
      status: 413,
      statusCode: 413,
      type: 'entity.too.large',
    });

    errorHandler(err, req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(413);
    const response = (res.json as jest.Mock).mock.calls[0][0];
    expect(response.code).toBe('PAYLOAD_TOO_LARGE');
    expect(response.detail).toContain(BODY_SIZE_LIMIT);
  });

  test.each([
    [16384, '16 kB'], // the CSP report collector's route-scoped limit (#161)
    [10 * 1024 * 1024, '10 MB'], // the app-wide default (BODY_SIZE_LIMIT)
    [500, '500 B'], // below 1 kB
    [1536, '1.5 kB'], // not a whole number of kB
  ])(
    'entity.too.large names the error\'s own %i-byte limit as "%s" when present (#161)',
    (limit, formatted) => {
      process.env.NODE_ENV = 'test';
      const { req, res } = mockReqRes();
      const err = Object.assign(new Error('request entity too large'), {
        status: 413,
        statusCode: 413,
        type: 'entity.too.large',
        limit,
      });

      errorHandler(err, req, res, jest.fn());

      expect(res.status).toHaveBeenCalledWith(413);
      const response = (res.json as jest.Mock).mock.calls[0][0];
      expect(response.code).toBe('PAYLOAD_TOO_LARGE');
      expect(response.detail).toBe(`The request body exceeds the ${formatted} limit.`);
    }
  );

  test.each([
    ['charset.unsupported', 415, 'unsupported charset "X-MADE-UP"'],
    ['encoding.unsupported', 415, 'unsupported content encoding "brotli"'],
    ['request.aborted', 400, 'request aborted'],
    ['request.size.invalid', 400, 'request size did not match content length'],
    ['parameters.too.many', 413, 'too many parameters'],
    ['querystring.parse.rangeError', 400, 'The input exceeded the depth'],
  ])("%s honours body-parser's own %i status as INVALID_BODY (#143)", (type, status, message) => {
    process.env.NODE_ENV = 'test';
    const { req, res } = mockReqRes();
    const err = Object.assign(new Error(message), { status, statusCode: status, type });

    errorHandler(err, req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(status);
    const response = (res.json as jest.Mock).mock.calls[0][0];
    expect(response.code).toBe('INVALID_BODY');
    expect(response.detail).toBe(message);
  });
});

describe('errorHandler mounted in a real app (#143)', () => {
  test('a body over the configured limit answers 413 PAYLOAD_TOO_LARGE through the real handler', async () => {
    // The real 10 MB limit (BODY_SIZE_LIMIT, index.ts) is too heavy to send
    // in a test; this app mounts express.json with a tiny limit of its own
    // instead, so a payload just over it exercises the same body-parser
    // error path cheaply. That proves the handler, not the parser.
    const app = express();
    app.use(express.json({ limit: '100b' }));
    app.post('/echo', (_req, res) => res.json({ success: true }));
    app.use(errorHandler);

    const res = await request(app)
      .post('/echo')
      .set('Content-Type', 'application/json')
      .send({ padding: 'x'.repeat(200) });

    expect(res.status).toBe(413);
    expect(res.type).toBe('application/problem+json');
    expect(res.body).toMatchObject({
      status: 413,
      code: 'PAYLOAD_TOO_LARGE',
      title: 'Request body too large',
    });
    // body-parser/raw-body sets `limit` to whatever this parser was actually
    // configured with (100 bytes here, from express.json({ limit: '100b' })
    // above), so the handler names that, not the app-wide BODY_SIZE_LIMIT
    // (#161) -- this app's parser has its own limit, not the production one.
    expect(res.body.detail).toBe('The request body exceeds the 100 B limit.');
  });

  test('a malformed body answers 400 MALFORMED_BODY through the real handler', async () => {
    const app = express();
    app.use(express.json());
    app.post('/echo', (_req, res) => res.json({ success: true }));
    app.use(errorHandler);

    const res = await request(app)
      .post('/echo')
      .set('Content-Type', 'application/json')
      .send('{"broken":');

    expect(res.status).toBe(400);
    expect(res.type).toBe('application/problem+json');
    expect(res.body).toMatchObject({ status: 400, code: 'MALFORMED_BODY' });
  });

  // Found by the Phase 2 review against the running server: the app mounts
  // express.urlencoded({ extended: true }), whose qs parser rejects bracket
  // nesting past its depth limit with its own 400. Before this type was
  // recognised, that 400 was flattened into a 500 INTERNAL_ERROR.
  test('a urlencoded body nested too deep answers 400, not 500, through the real handler', async () => {
    const app = express();
    app.use(express.urlencoded({ extended: true }));
    app.post('/echo', (_req, res) => res.json({ success: true }));
    app.use(errorHandler);

    const tooDeep = 'a' + '[b]'.repeat(40) + '=1';
    const res = await request(app)
      .post('/echo')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send(tooDeep);

    expect(res.status).toBe(400);
    expect(res.type).toBe('application/problem+json');
    expect(res.body).toMatchObject({ status: 400, code: 'INVALID_BODY' });
  });
});

describe('notFoundHandler', () => {
  test('responds 404 with the method and path in the detail', () => {
    const { req, res } = mockReqRes({
      path: '/v1/unknown',
      originalUrl: '/v1/unknown',
      method: 'POST',
    });

    notFoundHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 404,
        title: 'Not found',
        code: 'NOT_FOUND',
        detail: 'Endpoint not found: POST /v1/unknown',
        instance: '/v1/unknown',
      })
    );
  });
});
