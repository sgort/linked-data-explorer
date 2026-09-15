import express from 'express';
import request from 'supertest';

jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

import logger from '../utils/logger';
import { versionMiddleware } from '../middleware/version.middleware';
import { OpenApiDocument, readOpenApiDocument } from '../openapi/document';
import { expectToMatchOperation } from '../openapi/testing/conformance';
import { createOpenApiRouter } from './openapi.routes';

const mockLoggerError = logger.error as jest.Mock;

function makeApp(load?: () => OpenApiDocument) {
  const app = express();
  // Mounted app-wide in index.ts; added here so the header rule is checked too.
  app.use(versionMiddleware);
  app.use('/v1/openapi.json', createOpenApiRouter(load));
  return app;
}

beforeEach(() => {
  mockLoggerError.mockReset();
});

describe('GET /v1/openapi.json', () => {
  test('serves the built document, as the document describes', async () => {
    const res = await request(makeApp()).get('/v1/openapi.json');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(readOpenApiDocument());
    expectToMatchOperation(res, 'get', '/openapi.json');
  });

  test('lets any origin read it, as /core/publish-openapi requires', async () => {
    const res = await request(makeApp())
      .get('/v1/openapi.json')
      .set('Origin', 'https://viewer.example');

    expect(res.headers['access-control-allow-origin']).toBe('*');
  });

  test('reads the document once', async () => {
    const load = jest.fn(() => readOpenApiDocument());
    const app = makeApp(load);

    await request(app).get('/v1/openapi.json');
    await request(app).get('/v1/openapi.json');

    expect(load).toHaveBeenCalledTimes(1);
  });

  test('answers 500, as documented, when the document cannot be read', async () => {
    const res = await request(
      makeApp(() => {
        throw new Error('ENOENT: no such file');
      })
    ).get('/v1/openapi.json');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      success: false,
      error: {
        code: 'OPENAPI_UNAVAILABLE',
        message: 'The OpenAPI description is not available',
      },
    });
    expectToMatchOperation(res, 'get', '/openapi.json');
    expect(mockLoggerError).toHaveBeenCalledWith('[openapi] document unavailable', {
      error: 'ENOENT: no such file',
    });
  });

  test('does not cache a failed read', async () => {
    const load = jest
      .fn<OpenApiDocument, []>()
      .mockImplementationOnce(() => {
        throw new Error('not yet built');
      })
      .mockImplementation(() => readOpenApiDocument());
    const app = makeApp(load);

    expect((await request(app).get('/v1/openapi.json')).status).toBe(500);
    expect((await request(app).get('/v1/openapi.json')).status).toBe(200);
  });
});
