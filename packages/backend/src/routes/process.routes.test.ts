import express from 'express';
import request from 'supertest';

jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
jest.mock('../services/operaton.service', () => ({
  operatonService: { getVariableHints: jest.fn() },
}));

import { operatonService } from '../services/operaton.service';
import processRoutes from './process.routes';

const mockGetVariableHints = operatonService.getVariableHints as jest.Mock;

function makeApp() {
  const app = express();
  app.use('/v1/process', processRoutes);
  return app;
}

beforeEach(() => {
  mockGetVariableHints.mockReset();
});

describe('GET /v1/process/:key/variable-hints', () => {
  test('returns the variable hints for the given process key', async () => {
    mockGetVariableHints.mockResolvedValue([{ name: 'leeftijd', type: 'Integer' }]);

    const res = await request(makeApp()).get('/v1/process/ZorgtoeslagProcess/variable-hints');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      variables: [{ name: 'leeftijd', type: 'Integer' }],
    });
    expect(mockGetVariableHints).toHaveBeenCalledWith('ZorgtoeslagProcess');
  });

  test('returns 500 with a generic message when the service throws', async () => {
    mockGetVariableHints.mockRejectedValue(new Error('Operaton unreachable'));

    const res = await request(makeApp()).get('/v1/process/ZorgtoeslagProcess/variable-hints');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      success: false,
      error: { code: 'VARIABLE_HINTS_FAILED', message: 'Failed to retrieve variable hints' },
    });
  });
});
