import express from 'express';
import request from 'supertest';

jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
jest.mock('../services/vendor.service', () => ({
  __esModule: true,
  vendorService: { getAllVendorServices: jest.fn(), getVendorServicesForDmn: jest.fn() },
}));

import { vendorService } from '../services/vendor.service';
import vendorRoutes from './vendor.routes';
import packageJson from '../../package.json';

const mockGetAll = vendorService.getAllVendorServices as jest.Mock;
const mockGetForDmn = vendorService.getVendorServicesForDmn as jest.Mock;

function makeApp() {
  const app = express();
  app.use('/v1/vendors', vendorRoutes);
  return app;
}

const VENDOR = { id: 'svb-1', name: 'SVB', endpoint: 'https://svb.example/api' };

beforeEach(() => {
  mockGetAll.mockReset();
  mockGetForDmn.mockReset();
});

describe('GET /v1/vendors', () => {
  test('returns the vendor services with a count', async () => {
    mockGetAll.mockResolvedValue([VENDOR]);

    const res = await request(makeApp()).get('/v1/vendors');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { vendorServices: [VENDOR], count: 1 } });
  });

  test('stamps the API-Version header from package.json', async () => {
    mockGetAll.mockResolvedValue([]);

    const res = await request(makeApp()).get('/v1/vendors');

    expect(res.headers['api-version']).toBe(packageJson.version);
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });

  test('forwards an explicit SPARQL endpoint to the service', async () => {
    mockGetAll.mockResolvedValue([]);

    await request(makeApp()).get('/v1/vendors').query({ endpoint: 'https://other.example/sparql' });

    expect(mockGetAll).toHaveBeenCalledWith('https://other.example/sparql');
  });

  test('omits the endpoint so the service falls back to its default', async () => {
    mockGetAll.mockResolvedValue([]);

    await request(makeApp()).get('/v1/vendors');

    expect(mockGetAll).toHaveBeenCalledWith(undefined);
  });

  test('reports an empty result as a zero count rather than an error', async () => {
    mockGetAll.mockResolvedValue([]);

    const res = await request(makeApp()).get('/v1/vendors');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ vendorServices: [], count: 0 });
  });

  test('returns 500 with the error message when the service throws', async () => {
    mockGetAll.mockRejectedValue(new Error('SPARQL endpoint timed out'));

    const res = await request(makeApp()).get('/v1/vendors');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, error: 'SPARQL endpoint timed out' });
    expect(res.headers['api-version']).toBe(packageJson.version);
  });
});

describe('GET /v1/vendors/dmn/:identifier', () => {
  test('returns the vendor services implementing a DMN, echoing the identifier', async () => {
    mockGetForDmn.mockResolvedValue([VENDOR]);

    const res = await request(makeApp()).get('/v1/vendors/dmn/SVB_LeeftijdsInformatie');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: { vendorServices: [VENDOR], count: 1, dmnIdentifier: 'SVB_LeeftijdsInformatie' },
    });
    expect(mockGetForDmn).toHaveBeenCalledWith('SVB_LeeftijdsInformatie', undefined);
  });

  test('forwards an explicit endpoint alongside the identifier', async () => {
    mockGetForDmn.mockResolvedValue([]);

    await request(makeApp())
      .get('/v1/vendors/dmn/SVB_LeeftijdsInformatie')
      .query({ endpoint: 'https://other.example/sparql' });

    expect(mockGetForDmn).toHaveBeenCalledWith(
      'SVB_LeeftijdsInformatie',
      'https://other.example/sparql'
    );
  });

  test('URL-decodes the identifier before handing it to the service', async () => {
    mockGetForDmn.mockResolvedValue([]);

    await request(makeApp()).get('/v1/vendors/dmn/SVB%20Leeftijd');

    expect(mockGetForDmn).toHaveBeenCalledWith('SVB Leeftijd', undefined);
  });

  test('returns 500 with the error message when the lookup throws', async () => {
    mockGetForDmn.mockRejectedValue(new Error('unknown DMN'));

    const res = await request(makeApp()).get('/v1/vendors/dmn/Nope');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, error: 'unknown DMN' });
  });
});
