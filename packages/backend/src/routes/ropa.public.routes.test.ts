import express from 'express';
import request from 'supertest';

jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
jest.mock('../services/ropa.service', () => ({ listPublicRopa: jest.fn() }));

import { versionMiddleware } from '../middleware/version.middleware';
import { expectToMatchOperation } from '../openapi/testing/conformance';
import { listPublicRopa } from '../services/ropa.service';
import ropaPublicRoutes from './ropa.public.routes';

const mockListPublicRopa = listPublicRopa as jest.Mock;

// Shaped like listPublicRopa's output: mapRopaRecord without schemaVersion,
// controllerContact and dpoContact, with dates as ISO strings.
const RECORD = {
  id: '6f1c2d3e-4a5b-4c6d-8e7f-000000000001',
  bpmnProcessId: 'ZorgtoeslagProcess',
  processLevel: 'shell',
  title: 'Zorgtoeslag',
  controllerName: 'Provincie Flevoland',
  purpose: 'Beoordelen van aanvragen',
  legalBasisUri: 'https://wetten.overheid.nl/BWBR0018451',
  legalBasisLabel: 'Wet op de zorgtoeslag',
  gdprArticle: '6(1)(e)',
  dataSubjects: 'Aanvragers',
  recipients: 'Belastingdienst',
  thirdCountryTransfers: false,
  retentionPeriod: '7 jaar',
  securityMeasures: 'Versleuteling in rust en tijdens transport',
  status: 'active',
  personalDataFields: [
    {
      id: '6f1c2d3e-4a5b-4c6d-8e7f-000000000002',
      ropaRecordId: '6f1c2d3e-4a5b-4c6d-8e7f-000000000001',
      formId: 'aanvraag',
      fieldKey: 'bsn',
      fieldLabel: 'BSN',
      dataCategory: 'identificatie',
      specialCategory: false,
      sortOrder: 0,
    },
  ],
  createdAt: '2026-09-01T08:00:00.000Z',
  updatedAt: '2026-09-10T08:00:00.000Z',
};

function makeApp() {
  const app = express();
  app.use(versionMiddleware); // app-wide in index.ts
  app.use('/v1/ropa-public', ropaPublicRoutes);
  return app;
}

beforeEach(() => {
  mockListPublicRopa.mockReset();
});

describe('GET /v1/ropa-public', () => {
  test('returns the public ROPA list, as documented', async () => {
    mockListPublicRopa.mockResolvedValue([RECORD]);

    const res = await request(makeApp()).get('/v1/ropa-public');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: [RECORD] });
    expectToMatchOperation(res, 'get', '/ropa/public');
  });

  test('forwards the organisation query param', async () => {
    mockListPublicRopa.mockResolvedValue([]);

    await request(makeApp()).get('/v1/ropa-public').query({ organisation: 'Flevoland' });

    expect(mockListPublicRopa).toHaveBeenCalledWith('Flevoland');
  });

  // The document closes the record schema, so it states that internal contacts
  // are never published. A record that leaked one would break the contract.
  test('a record carrying an internal contact does not match the document', async () => {
    mockListPublicRopa.mockResolvedValue([{ ...RECORD, controllerContact: 'privacy@example.nl' }]);

    const res = await request(makeApp()).get('/v1/ropa-public');

    expect(() => expectToMatchOperation(res, 'get', '/ropa/public')).toThrow(
      /must NOT have additional properties/
    );
  });

  test('returns 500 with the error message when the service throws, as documented', async () => {
    mockListPublicRopa.mockRejectedValue(new Error('db unavailable'));

    const res = await request(makeApp()).get('/v1/ropa-public');

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      status: 500,
      title: 'List failed',
      detail: 'db unavailable',
      code: 'LIST_FAILED',
    });
    expectToMatchOperation(res, 'get', '/ropa/public');
  });
});
