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
import { logger } from '../utils/logger';
import healthRoutes from './health.routes';
import packageJson from '../../package.json';

const mockHealthCheck = sparqlService.healthCheck as jest.Mock;
const mockAxiosGet = axios.get as jest.Mock;
const mockWarn = logger.warn as jest.Mock;

function makeApp() {
  const app = express();
  app.use('/v1/health', healthRoutes);
  return app;
}

beforeEach(() => {
  mockHealthCheck.mockReset();
  mockAxiosGet.mockReset();
  mockWarn.mockReset();
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

describe('health payload', () => {
  beforeEach(() => {
    mockHealthCheck.mockResolvedValue({ status: 'up', latency: 42 });
    mockAxiosGet.mockResolvedValue({ status: 200 });
  });

  test('reports the application metadata and documentation pointer', async () => {
    const res = await request(makeApp()).get('/v1/health');

    expect(res.body).toMatchObject({
      name: 'Linked Data Explorer Backend',
      version: packageJson.version,
      documentation: '/v1/openapi.json',
    });
    expect(typeof res.body.uptime).toBe('number');
    expect(res.body.timestamp).toEqual(expect.any(String));
  });

  test('stamps the API-Version and an explicit JSON content type', async () => {
    const res = await request(makeApp()).get('/v1/health');

    expect(res.headers['api-version']).toBe(packageJson.version);
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });

  test('records a fresh lastCheck timestamp per dependency', async () => {
    const res = await request(makeApp()).get('/v1/health');

    expect(Date.parse(res.body.services.triplydb.lastCheck)).not.toBeNaN();
    expect(Date.parse(res.body.services.operaton.lastCheck)).not.toBeNaN();
  });

  test('measures the Operaton round trip', async () => {
    const res = await request(makeApp()).get('/v1/health');

    expect(res.body.services.operaton.latency).toBeGreaterThanOrEqual(0);
  });

  test('falls back to zero latency when TriplyDB reports none', async () => {
    mockHealthCheck.mockResolvedValue({ status: 'up' });

    const res = await request(makeApp()).get('/v1/health');

    expect(res.body.services.triplydb.latency).toBe(0);
  });
});

describe('non-Error failures', () => {
  test('a non-Error rejection from TriplyDB is still reported as down', async () => {
    mockHealthCheck.mockRejectedValue('socket hang up');
    mockAxiosGet.mockResolvedValue({ status: 200 });

    const res = await request(makeApp()).get('/v1/health');

    expect(res.status).toBe(503);
    expect(res.body.services.triplydb.status).toBe('down');
    expect(mockWarn).toHaveBeenCalledWith('TriplyDB health check failed', {
      error: 'Unknown error',
    });
  });

  test('a non-Error rejection from Operaton is still reported as down', async () => {
    mockHealthCheck.mockResolvedValue({ status: 'up', latency: 1 });
    mockAxiosGet.mockRejectedValue('socket hang up');

    const res = await request(makeApp()).get('/v1/health');

    expect(res.status).toBe(503);
    expect(res.body.services.operaton.status).toBe('down');
    expect(mockWarn).toHaveBeenCalledWith('Operaton health check failed', {
      error: 'Unknown error',
    });
  });
});

describe('outer safety net', () => {
  // The per-dependency checks swallow their own failures, so the outer catch
  // only fires if the health handler itself breaks. Making the degraded-path
  // logging throw is the way to reach it, and proves the endpoint still answers
  // with a well-formed 503 envelope rather than an unhandled rejection.
  test('an unexpected failure yields a 503 unhealthy envelope', async () => {
    mockHealthCheck.mockResolvedValue({ status: 'down', error: 'connection refused' });
    mockAxiosGet.mockResolvedValue({ status: 200 });
    mockWarn.mockImplementation(() => {
      throw new Error('logging subsystem failed');
    });

    const res = await request(makeApp()).get('/v1/health');

    expect(res.status).toBe(503);
    expect(res.body.status).toBe('unhealthy');
    expect(res.body.error).toBe('logging subsystem failed');
    expect(res.body.name).toBe('Linked Data Explorer Backend');
    expect(res.headers['api-version']).toBe(packageJson.version);
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });

  test('a non-Error failure falls back to a generic message', async () => {
    mockHealthCheck.mockResolvedValue({ status: 'down' });
    mockAxiosGet.mockResolvedValue({ status: 200 });
    mockWarn.mockImplementation(() => {
      throw 'not an Error';
    });

    const res = await request(makeApp()).get('/v1/health');

    expect(res.status).toBe(503);
    expect(res.body.error).toBe('Health check failed');
  });
});
