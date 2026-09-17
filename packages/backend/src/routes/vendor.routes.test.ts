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
import { versionMiddleware } from '../middleware/version.middleware';
import { errorHandler } from '../middleware/error.middleware';
import { expectToMatchOperation } from '../openapi/testing/conformance';
import type { VendorService } from '../types/vendor.types';

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

describe('/v1/vendors operations match their OpenAPI description', () => {
  // vendor.routes.ts sets API-Version itself (unlike edocs.routes.ts), but the
  // route test app above still has no global middleware stack, so a
  // documented app adds versionMiddleware for consistency and errorHandler
  // in case a future body-taking route needs it — matching how
  // dso.routes.test.ts and edocs.routes.test.ts build their own.
  function makeDocumentedApp() {
    const app = express();
    app.use(express.json());
    app.use(versionMiddleware); // app-wide in index.ts
    app.use('/v1/vendors', vendorRoutes);
    app.use(errorHandler); // app-wide in index.ts
    return app;
  }

  // Built from src/types/vendor.types.ts, not from the VENDOR fixture above
  // (which is missing the required `basedOn` field and carries stray
  // `name`/`endpoint` fields the real type doesn't have — see the phase 5
  // inventory). Every optional field on VendorService and VendorOrganization
  // is filled here; VendorContact's three fields are all optional and all
  // filled too.
  const FULL_VENDOR: VendorService = {
    id: 'https://data.example.org/vendor-services/svb-1',
    basedOn: 'https://identifier.overheid.nl/dmn/SVB_LeeftijdsInformatie',
    basedOnIdentifier: 'SVB_LeeftijdsInformatie',
    implementedBy: 'https://data.example.org/platforms/blueriq',
    implementedByName: 'Blueriq',
    provider: {
      name: 'SVB',
      logoUrl: 'https://api.open-regels.triply.cc/datasets/acc/dataset/assets/logo/v1',
      homepage: 'https://www.svb.nl',
      contactPoint: {
        name: 'SVB Support',
        email: 'support@svb.nl',
        telephone: '+31201234567',
      },
    },
    serviceUrl: 'https://svb.example/api/leeftijd',
    license: 'Commercial',
    accessType: 'iam-required',
    description: 'Leeftijdsinformatie service',
  };

  // The minimal fixture: every optional field on VendorService and
  // VendorOrganization omitted. `provider.contactPoint` is still an object —
  // the service always constructs one, even with every inner field
  // undefined (which JSON serialization then drops) — so it is present here
  // as `{}`, not omitted.
  const MINIMAL_VENDOR: VendorService = {
    id: 'https://data.example.org/vendor-services/gemeente-1',
    basedOn: 'https://identifier.overheid.nl/dmn/Kapvergunning',
    provider: {
      name: 'Unknown Vendor',
      contactPoint: {},
    },
  };

  test('GET / 200, as documented', async () => {
    mockGetAll.mockResolvedValue([FULL_VENDOR, MINIMAL_VENDOR]);

    const res = await request(makeDocumentedApp()).get('/v1/vendors');

    expect(res.status).toBe(200);
    expect(res.body.data.count).toBe(2);
    expectToMatchOperation(res, 'get', '/vendors');
  });

  test('GET / 500, as documented', async () => {
    mockGetAll.mockRejectedValue(new Error('SPARQL endpoint timed out'));

    const res = await request(makeDocumentedApp()).get('/v1/vendors');

    expect(res.status).toBe(500);
    expectToMatchOperation(res, 'get', '/vendors');
  });

  test('GET /dmn/:identifier 200, as documented', async () => {
    mockGetForDmn.mockResolvedValue([FULL_VENDOR]);

    const res = await request(makeDocumentedApp()).get('/v1/vendors/dmn/SVB_LeeftijdsInformatie');

    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'get', '/vendors/dmn/{identifier}');
  });

  test('GET /dmn/:identifier 200, as documented — an identifier matching nothing answers an empty list, not 404', async () => {
    mockGetForDmn.mockResolvedValue([]);

    const res = await request(makeDocumentedApp()).get('/v1/vendors/dmn/Nope');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ vendorServices: [], count: 0, dmnIdentifier: 'Nope' });
    expectToMatchOperation(res, 'get', '/vendors/dmn/{identifier}');
  });

  test('GET /dmn/:identifier 500, as documented', async () => {
    mockGetForDmn.mockRejectedValue(new Error('unknown DMN'));

    const res = await request(makeDocumentedApp()).get('/v1/vendors/dmn/Nope');

    expect(res.status).toBe(500);
    expectToMatchOperation(res, 'get', '/vendors/dmn/{identifier}');
  });
});
