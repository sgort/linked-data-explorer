import express from 'express';
import request from 'supertest';

jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
jest.mock('../services/operaton.service', () => ({
  operatonService: { fetchDmnXml: jest.fn() },
}));

import { operatonService } from '../services/operaton.service';
import dmnXmlRoutes from './dmn-xml.routes';

const mockFetchDmnXml = operatonService.fetchDmnXml as jest.Mock;

function makeApp() {
  const app = express();
  app.use('/api/dmns', dmnXmlRoutes);
  return app;
}

beforeEach(() => {
  mockFetchDmnXml.mockReset();
});

describe('GET /api/dmns/:definitionKey/xml', () => {
  test('returns the DMN XML with the correct content type and disposition', async () => {
    mockFetchDmnXml.mockResolvedValue('<definitions/>');

    const res = await request(makeApp()).get('/api/dmns/aow-key/xml');

    expect(res.status).toBe(200);
    expect(res.text).toBe('<definitions/>');
    expect(res.headers['content-type']).toContain('application/xml');
    expect(res.headers['content-disposition']).toBe('attachment; filename="aow-key.dmn"');
  });

  test('returns 404 when the DMN is not found', async () => {
    mockFetchDmnXml.mockResolvedValue(null);

    const res = await request(makeApp()).get('/api/dmns/missing-key/xml');

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({
      status: 404,
      title: 'DMN not found',
      detail: 'DMN definition not found: missing-key',
      code: 'DMN_NOT_FOUND',
    });
  });

  test('returns 500 with the error message when the service throws', async () => {
    mockFetchDmnXml.mockRejectedValue(new Error('Operaton unreachable'));

    const res = await request(makeApp()).get('/api/dmns/aow-key/xml');

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      status: 500,
      title: 'DMN fetch failed',
      detail: 'Failed to fetch DMN: Operaton unreachable',
      code: 'DMN_FETCH_FAILED',
    });
  });

  test('handles a non-Error rejection with the "Unknown error" fallback', async () => {
    mockFetchDmnXml.mockRejectedValue('a plain string rejection');

    const res = await request(makeApp()).get('/api/dmns/aow-key/xml');

    expect(res.status).toBe(500);
    expect(res.body.detail).toBe('Failed to fetch DMN: Unknown error');
  });
});
