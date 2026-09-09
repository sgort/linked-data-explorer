import { Request, Response } from 'express';

// logger.ts self-executes real winston transports (Console + File) and a
// mkdirSync('logs') side effect on import — mock it so this test never
// touches the filesystem or a real logging pipeline.
jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: { error: jest.fn(), warn: jest.fn() },
}));

import logger from '../utils/logger';
import { errorHandler, notFoundHandler } from './error.middleware';

function mockReqRes(overrides: Partial<Request> = {}) {
  const req = { path: '/v1/norms', method: 'GET', ...overrides } as Request;
  const res = {
    status: jest.fn().mockReturnThis(),
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
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: 'INTERNAL_ERROR',
          message: 'Internal server error',
        }),
      })
    );
  });

  test('surfaces the real error message outside production', () => {
    process.env.NODE_ENV = 'test';
    const { req, res } = mockReqRes();

    errorHandler(new Error('a specific failure'), req, res, jest.fn());

    const response = (res.json as jest.Mock).mock.calls[0][0];
    expect(response.error.message).toBe('a specific failure');
  });

  test('includes the stack trace only in development', () => {
    process.env.NODE_ENV = 'development';
    const { req, res } = mockReqRes();

    errorHandler(new Error('boom'), req, res, jest.fn());

    const response = (res.json as jest.Mock).mock.calls[0][0];
    expect(response.error.details).toBeDefined();
  });

  test('omits error details outside development', () => {
    process.env.NODE_ENV = 'test';
    const { req, res } = mockReqRes();

    errorHandler(new Error('boom'), req, res, jest.fn());

    const response = (res.json as jest.Mock).mock.calls[0][0];
    expect(response.error.details).toBeUndefined();
  });

  test('handles a non-Error thrown value (e.g. a rejected string)', () => {
    process.env.NODE_ENV = 'test';
    const { req, res } = mockReqRes();

    errorHandler('a plain string rejection', req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    const response = (res.json as jest.Mock).mock.calls[0][0];
    expect(response.error.message).toBe('a plain string rejection');
  });
});

describe('notFoundHandler', () => {
  test('responds 404 with the method and path in the message', () => {
    const { req, res } = mockReqRes({ path: '/v1/unknown', method: 'POST' });

    notFoundHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: 'NOT_FOUND',
          message: 'Endpoint not found: POST /v1/unknown',
        }),
      })
    );
  });
});
