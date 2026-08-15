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
    expect(res.body).toEqual({
      success: false,
      error: { code: 'LIST_FAILED', message: 'db unavailable' },
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
    expect(res.body).toEqual({
      success: false,
      error: { code: 'NOT_FOUND', message: 'No RoPA record for bpmnProcessId: UnknownProcess' },
    });
  });

  test('returns 500 with a LOOKUP_FAILED code when the lookup throws', async () => {
    mockGetByBpmnId.mockRejectedValue(new Error('query failed'));

    const res = await request(makeApp()).get('/v1/assets/ropa/by-bpmn-id/ZorgtoeslagProcess');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      success: false,
      error: { code: 'LOOKUP_FAILED', message: 'query failed' },
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
    expect(res.body).toEqual({
      success: false,
      error: { code: 'UPSERT_FAILED', message: 'constraint violation' },
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
    expect(res.body).toEqual({
      success: false,
      error: { code: 'DELETE_FAILED', message: 'row is referenced' },
    });
  });
});
