import express from 'express';
import request from 'supertest';

jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
jest.mock('../db/pool', () => ({ __esModule: true, default: { query: jest.fn() } }));
jest.mock('../services/ropa.service', () => ({
  __esModule: true,
  listRopa: jest.fn(),
  getRopaByBpmnProcessId: jest.fn(),
  upsertRopa: jest.fn(),
  deleteRopa: jest.fn(),
  listPublicRopa: jest.fn(),
}));

import { deleteRopa, getRopaByBpmnProcessId, listRopa, upsertRopa } from '../services/ropa.service';
import ropaRoutes from './ropa.routes';
import { versionMiddleware } from '../middleware/version.middleware';
import { errorHandler } from '../middleware/error.middleware';
import { expectToMatchOperation } from '../openapi/testing/conformance';

const mockList = listRopa as jest.Mock;
const mockGetByBpmnId = getRopaByBpmnProcessId as jest.Mock;
const mockUpsert = upsertRopa as jest.Mock;
const mockDelete = deleteRopa as jest.Mock;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/v1/assets/ropa', ropaRoutes);
  return app;
}

const RECORD = { id: 'r1', bpmnProcessId: 'ZorgtoeslagProcess', title: 'Zorgtoeslag' };

beforeEach(() => {
  mockList.mockReset();
  mockGetByBpmnId.mockReset();
  mockUpsert.mockReset();
  mockDelete.mockReset();
});

describe('GET /v1/assets/ropa', () => {
  test('returns every RoPA record', async () => {
    mockList.mockResolvedValue([RECORD]);

    const res = await request(makeApp()).get('/v1/assets/ropa');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: [RECORD] });
  });

  test('returns 500 with a LIST_FAILED code when the service throws', async () => {
    mockList.mockRejectedValue(new Error('db unavailable'));

    const res = await request(makeApp()).get('/v1/assets/ropa');

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      status: 500,
      title: 'List failed',
      detail: 'db unavailable',
      code: 'LIST_FAILED',
    });
  });
});

describe('GET /v1/assets/ropa/by-bpmn-id/:bpmnProcessId', () => {
  test('returns the record for a known BPMN process id', async () => {
    mockGetByBpmnId.mockResolvedValue(RECORD);

    const res = await request(makeApp()).get('/v1/assets/ropa/by-bpmn-id/ZorgtoeslagProcess');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: RECORD });
    expect(mockGetByBpmnId).toHaveBeenCalledWith('ZorgtoeslagProcess');
  });

  test('returns 404 naming the process id when no record exists', async () => {
    mockGetByBpmnId.mockResolvedValue(null);

    const res = await request(makeApp()).get('/v1/assets/ropa/by-bpmn-id/UnknownProcess');

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({
      status: 404,
      title: 'Not found',
      detail: 'No RoPA record for bpmnProcessId: UnknownProcess',
      code: 'NOT_FOUND',
    });
  });

  test('returns 500 with a LOOKUP_FAILED code when the lookup throws', async () => {
    mockGetByBpmnId.mockRejectedValue(new Error('query failed'));

    const res = await request(makeApp()).get('/v1/assets/ropa/by-bpmn-id/ZorgtoeslagProcess');

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      status: 500,
      title: 'Lookup failed',
      detail: 'query failed',
      code: 'LOOKUP_FAILED',
    });
  });
});

describe('POST /v1/assets/ropa', () => {
  test('upserts the posted record and returns its id', async () => {
    mockUpsert.mockResolvedValue('r1');

    const res = await request(makeApp()).post('/v1/assets/ropa').send(RECORD);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { id: 'r1' } });
    expect(mockUpsert).toHaveBeenCalledWith(RECORD);
  });

  test('returns 500 with an UPSERT_FAILED code when the write throws', async () => {
    mockUpsert.mockRejectedValue(new Error('constraint violation'));

    const res = await request(makeApp()).post('/v1/assets/ropa').send(RECORD);

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      status: 500,
      title: 'Save failed',
      detail: 'constraint violation',
      code: 'UPSERT_FAILED',
    });
  });
});

describe('DELETE /v1/assets/ropa/:id', () => {
  test('deletes the record and reports success without a body payload', async () => {
    mockDelete.mockResolvedValue(undefined);

    const res = await request(makeApp()).delete('/v1/assets/ropa/r1');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(mockDelete).toHaveBeenCalledWith('r1');
  });

  test('returns 500 with a DELETE_FAILED code when the delete throws', async () => {
    mockDelete.mockRejectedValue(new Error('row is referenced'));

    const res = await request(makeApp()).delete('/v1/assets/ropa/r1');

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      status: 500,
      title: 'Delete failed',
      detail: 'row is referenced',
      code: 'DELETE_FAILED',
    });
  });
});

describe('/v1/assets/ropa matches its OpenAPI description', () => {
  function makeDocumentedApp() {
    const app = express();
    app.use(express.json());
    app.use(versionMiddleware); // app-wide in index.ts
    app.use('/v1/assets/ropa', ropaRoutes);
    app.use(errorHandler); // app-wide in index.ts; answers malformed JSON bodies
    return app;
  }

  // Every optional field populated (dpoContact, thirdCountryDetails) and
  // personalDataFields given two entries — one with specialCategory true —
  // so the RopaRecord schema and the reused RopaPersonalDataField schema are
  // both actually exercised, not only nominally referenced.
  const FULL_RECORD = {
    id: '11111111-1111-4111-8111-111111111111',
    bpmnProcessId: 'ZorgtoeslagProcess',
    processLevel: 'shell',
    title: 'Zorgtoeslag verwerking',
    controllerName: 'Gemeente Utrecht',
    controllerContact: 'privacy@utrecht.nl',
    dpoContact: 'dpo@utrecht.nl',
    purpose: 'Assessing eligibility for housing benefit',
    legalBasisUri: 'https://wetten.overheid.nl/BWBR0008659',
    legalBasisLabel: 'Algemene wet inkomensafhankelijke regelingen',
    gdprArticle: '6(1)(c)',
    dataSubjects: 'Applicants for housing benefit',
    recipients: 'Belastingdienst Toeslagen',
    thirdCountryTransfers: true,
    thirdCountryDetails: 'Backup storage in a certified US data center under an adequacy decision',
    retentionPeriod: '7 years after case closure',
    securityMeasures: 'Encryption at rest and in transit; role-based access control',
    status: 'active',
    schemaVersion: 2,
    personalDataFields: [
      {
        id: '22222222-2222-4222-8222-222222222222',
        ropaRecordId: '11111111-1111-4111-8111-111111111111',
        formId: 'form-1',
        fieldKey: 'income',
        fieldLabel: 'Household income',
        dataCategory: 'financial',
        specialCategory: false,
        sortOrder: 0,
      },
      {
        id: '33333333-3333-4333-8333-333333333333',
        ropaRecordId: '11111111-1111-4111-8111-111111111111',
        formId: 'form-1',
        fieldKey: 'healthCondition',
        fieldLabel: 'Health condition',
        dataCategory: 'health',
        specialCategory: true,
        sortOrder: 1,
      },
    ],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
  };

  // Request-body shape: distinct from FULL_RECORD — no id/createdAt/updatedAt,
  // and each personal-data field lacks id/ropaRecordId (both are
  // database-generated). Every optional field and both array entries
  // populated, same as FULL_RECORD.
  const FULL_POST_BODY = {
    bpmnProcessId: 'ZorgtoeslagProcess',
    processLevel: 'shell',
    title: 'Zorgtoeslag verwerking',
    controllerName: 'Gemeente Utrecht',
    controllerContact: 'privacy@utrecht.nl',
    dpoContact: 'dpo@utrecht.nl',
    purpose: 'Assessing eligibility for housing benefit',
    legalBasisUri: 'https://wetten.overheid.nl/BWBR0008659',
    legalBasisLabel: 'Algemene wet inkomensafhankelijke regelingen',
    gdprArticle: '6(1)(c)',
    dataSubjects: 'Applicants for housing benefit',
    recipients: 'Belastingdienst Toeslagen',
    thirdCountryTransfers: true,
    thirdCountryDetails: 'Backup storage in a certified US data center under an adequacy decision',
    retentionPeriod: '7 years after case closure',
    securityMeasures: 'Encryption at rest and in transit; role-based access control',
    status: 'active',
    schemaVersion: 2,
    personalDataFields: [
      {
        formId: 'form-1',
        fieldKey: 'income',
        fieldLabel: 'Household income',
        dataCategory: 'financial',
        specialCategory: false,
        sortOrder: 0,
      },
      {
        formId: 'form-1',
        fieldKey: 'healthCondition',
        fieldLabel: 'Health condition',
        dataCategory: 'health',
        specialCategory: true,
        sortOrder: 1,
      },
    ],
  };

  // Every field mapRopaRecord's `?? undefined` can drop (dpoContact,
  // thirdCountryDetails) is missing, and personalDataFields is empty, so a
  // wrongly-required optional field would fail this instead of passing
  // unnoticed against a maximal fixture.
  const MINIMAL_RECORD = {
    id: '44444444-4444-4444-8444-444444444444',
    bpmnProcessId: 'MinimalProcess',
    processLevel: 'subprocess',
    title: 'Minimal record',
    controllerName: 'Gemeente Utrecht',
    controllerContact: 'privacy@utrecht.nl',
    purpose: 'Minimal purpose',
    legalBasisUri: 'https://wetten.overheid.nl/BWBR0008659',
    legalBasisLabel: 'Algemene wet inkomensafhankelijke regelingen',
    gdprArticle: '6(1)(c)',
    dataSubjects: 'Applicants',
    recipients: 'None',
    thirdCountryTransfers: false,
    retentionPeriod: '7 years after case closure',
    securityMeasures: 'Encryption at rest and in transit',
    status: 'draft',
    schemaVersion: 2,
    personalDataFields: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
  };

  test('GET /assets/ropa 200, as documented', async () => {
    mockList.mockResolvedValue([FULL_RECORD]);

    const res = await request(makeDocumentedApp()).get('/v1/assets/ropa');

    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'get', '/assets/ropa');
  });

  test('GET /assets/ropa 200 with a minimal record, as documented', async () => {
    mockList.mockResolvedValue([MINIMAL_RECORD]);

    const res = await request(makeDocumentedApp()).get('/v1/assets/ropa');

    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'get', '/assets/ropa');
  });

  test('GET /assets/ropa 500, as documented', async () => {
    mockList.mockRejectedValue(new Error('db unavailable'));

    const res = await request(makeDocumentedApp()).get('/v1/assets/ropa');

    expect(res.status).toBe(500);
    expectToMatchOperation(res, 'get', '/assets/ropa');
  });

  test('GET /assets/ropa/by-bpmn-id/{bpmnProcessId} 200, as documented', async () => {
    mockGetByBpmnId.mockResolvedValue(FULL_RECORD);

    const res = await request(makeDocumentedApp()).get(
      '/v1/assets/ropa/by-bpmn-id/ZorgtoeslagProcess'
    );

    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'get', '/assets/ropa/by-bpmn-id/{bpmnProcessId}');
  });

  test('GET /assets/ropa/by-bpmn-id/{bpmnProcessId} 404, as documented', async () => {
    mockGetByBpmnId.mockResolvedValue(null);

    const res = await request(makeDocumentedApp()).get('/v1/assets/ropa/by-bpmn-id/UnknownProcess');

    expect(res.status).toBe(404);
    expectToMatchOperation(res, 'get', '/assets/ropa/by-bpmn-id/{bpmnProcessId}');
  });

  test('GET /assets/ropa/by-bpmn-id/{bpmnProcessId} 500, as documented', async () => {
    mockGetByBpmnId.mockRejectedValue(new Error('query failed'));

    const res = await request(makeDocumentedApp()).get(
      '/v1/assets/ropa/by-bpmn-id/ZorgtoeslagProcess'
    );

    expect(res.status).toBe(500);
    expectToMatchOperation(res, 'get', '/assets/ropa/by-bpmn-id/{bpmnProcessId}');
  });

  test('POST /assets/ropa 200, as documented', async () => {
    mockUpsert.mockResolvedValue('11111111-1111-4111-8111-111111111111');

    const res = await request(makeDocumentedApp()).post('/v1/assets/ropa').send(FULL_POST_BODY);

    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'post', '/assets/ropa');
  });

  test('POST /assets/ropa 500, as documented', async () => {
    mockUpsert.mockRejectedValue(new Error('constraint violation'));

    const res = await request(makeDocumentedApp()).post('/v1/assets/ropa').send(FULL_POST_BODY);

    expect(res.status).toBe(500);
    expectToMatchOperation(res, 'post', '/assets/ropa');
  });

  test('POST /assets/ropa malformed body is a 500 problem, as documented (#143)', async () => {
    const res = await request(makeDocumentedApp())
      .post('/v1/assets/ropa')
      .set('Content-Type', 'application/json')
      .send('{"bpmnProcessId":');

    expect(res.status).toBe(500);
    expect(res.body.code).toBe('INTERNAL_ERROR');
    expectToMatchOperation(res, 'post', '/assets/ropa');
  });

  test('DELETE /assets/ropa/{id} 200, as documented', async () => {
    mockDelete.mockResolvedValue(undefined);

    const res = await request(makeDocumentedApp()).delete('/v1/assets/ropa/r1');

    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'delete', '/assets/ropa/{id}');
  });

  test('DELETE /assets/ropa/{id} 500, as documented', async () => {
    mockDelete.mockRejectedValue(new Error('row is referenced'));

    const res = await request(makeDocumentedApp()).delete('/v1/assets/ropa/r1');

    expect(res.status).toBe(500);
    expectToMatchOperation(res, 'delete', '/assets/ropa/{id}');
  });
});
