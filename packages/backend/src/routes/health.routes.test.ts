import axios from 'axios';
import express from 'express';
import request from 'supertest';

jest.mock('../utils/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
jest.mock('axios');
jest.mock('../services/sparql.service', () => ({
  sparqlService: { healthCheck: jest.fn() },
}));

import { sparqlService } from '../services/sparql.service';
import healthRoutes from './health.routes';

const mockHealthCheck = sparqlService.healthCheck as jest.Mock;
const mockAxiosGet = axios.get as jest.Mock;

function makeApp() {
  const app = express();
  app.use('/v1/health', healthRoutes);
  return app;
}

beforeEach(() => {
  mockHealthCheck.mockReset();
  mockAxiosGet.mockReset();
});

describe('GET /v1/health', () => {
  test('returns 200 healthy when both TriplyDB and Operaton are up', async () => {
    mockHealthCheck.mockResolvedValue({ status: 'up', latency: 42 });
    mockAxiosGet.mockResolvedValue({ status: 200 });

    const res = await request(makeApp()).get('/v1/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('healthy');
    expect(res.body.services.triplydb.status).toBe('up');
    expect(res.body.services.operaton.status).toBe('up');
    expect(res.headers['api-version']).toBeDefined();
  });

  test('returns 503 degraded when TriplyDB reports down', async () => {
    mockHealthCheck.mockResolvedValue({ status: 'down', error: 'connection refused' });
    mockAxiosGet.mockResolvedValue({ status: 200 });

    const res = await request(makeApp()).get('/v1/health');

    expect(res.status).toBe(503);
    expect(res.body.status).toBe('degraded');
    expect(res.body.services.triplydb.status).toBe('down');
  });

  test('returns 503 degraded when the TriplyDB check itself throws', async () => {
    mockHealthCheck.mockRejectedValue(new Error('network error'));
    mockAxiosGet.mockResolvedValue({ status: 200 });

    const res = await request(makeApp()).get('/v1/health');

    expect(res.status).toBe(503);
    expect(res.body.services.triplydb.status).toBe('down');
  });

  test('returns 503 degraded when Operaton is unreachable', async () => {
    mockHealthCheck.mockResolvedValue({ status: 'up', latency: 10 });
    mockAxiosGet.mockRejectedValue(new Error('ECONNREFUSED'));

    const res = await request(makeApp()).get('/v1/health');

    expect(res.status).toBe(503);
    expect(res.body.services.operaton.status).toBe('down');
  });

  test('degrades when both dependencies are down', async () => {
    mockHealthCheck.mockResolvedValue({ status: 'down' });
    mockAxiosGet.mockRejectedValue(new Error('ECONNREFUSED'));

    const res = await request(makeApp()).get('/v1/health');

    expect(res.status).toBe(503);
    expect(res.body.status).toBe('degraded');
    expect(res.body.services.triplydb.status).toBe('down');
    expect(res.body.services.operaton.status).toBe('down');
  });
});
