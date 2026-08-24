import express from 'express';
import request from 'supertest';

jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
jest.mock('../db/pool', () => ({ __esModule: true, default: { query: jest.fn() } }));
jest.mock('../services/assets.service', () => ({
  __esModule: true,
  listBpmn: jest.fn(),
  upsertBpmn: jest.fn(),
  deleteBpmn: jest.fn(),
  markDeployed: jest.fn(),
  getBpmnByBpmnProcessId: jest.fn(),
  listForms: jest.fn(),
  upsertForm: jest.fn(),
  deleteForm: jest.fn(),
  listDocuments: jest.fn(),
  upsertDocument: jest.fn(),
  deleteDocument: jest.fn(),
}));

import * as assetsService from '../services/assets.service';
import assetsRoutes from './assets.routes';

const svc = assetsService as unknown as Record<string, jest.Mock>;
// Object.values would also yield the __esModule flag, which is not a mock.
const svcMocks = Object.values(svc).filter((v): v is jest.Mock => typeof v === 'function');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/v1/assets', assetsRoutes);
  return app;
}

beforeEach(() => {
  for (const fn of svcMocks) fn.mockReset();
});

describe('BPMN collection', () => {
  test('GET /bpmn returns the stored processes', async () => {
    svc.listBpmn.mockResolvedValue([{ id: 'p1', name: 'Zorgtoeslag' }]);

    const res = await request(makeApp()).get('/v1/assets/bpmn');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: [{ id: 'p1', name: 'Zorgtoeslag' }] });
  });

  test('GET /bpmn returns 500 with a LIST_FAILED code when the service throws', async () => {
    svc.listBpmn.mockRejectedValue(new Error('db unavailable'));

    const res = await request(makeApp()).get('/v1/assets/bpmn');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      success: false,
      error: { code: 'LIST_FAILED', message: 'db unavailable' },
    });
  });

  test('POST /bpmn upserts the posted body', async () => {
    svc.upsertBpmn.mockResolvedValue(undefined);
    const body = { id: 'p1', bpmnProcessId: 'ZorgtoeslagProcess', xml: '<bpmn/>' };

    const res = await request(makeApp()).post('/v1/assets/bpmn').send(body);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(svc.upsertBpmn).toHaveBeenCalledWith(body);
  });

  test('POST /bpmn returns 500 with an UPSERT_FAILED code when the write throws', async () => {
    svc.upsertBpmn.mockRejectedValue(new Error('readonly record'));

    const res = await request(makeApp()).post('/v1/assets/bpmn').send({ id: 'p1' });

    expect(res.status).toBe(500);
    expect(res.body.error).toEqual({ code: 'UPSERT_FAILED', message: 'readonly record' });
  });

  test('DELETE /bpmn/:id deletes by id', async () => {
    svc.deleteBpmn.mockResolvedValue(undefined);

    const res = await request(makeApp()).delete('/v1/assets/bpmn/p1');

    expect(res.status).toBe(200);
    expect(svc.deleteBpmn).toHaveBeenCalledWith('p1');
  });

  test('DELETE /bpmn/:id returns 500 with a DELETE_FAILED code when the delete throws', async () => {
    svc.deleteBpmn.mockRejectedValue(new Error('still referenced'));

    const res = await request(makeApp()).delete('/v1/assets/bpmn/p1');

    expect(res.status).toBe(500);
    expect(res.body.error).toEqual({ code: 'DELETE_FAILED', message: 'still referenced' });
  });
});

describe('PATCH /bpmn/:id/deploy', () => {
  test('records the deployment with the supplied artefact ids', async () => {
    svc.markDeployed.mockResolvedValue(undefined);

    const res = await request(makeApp())
      .patch('/v1/assets/bpmn/p1/deploy')
      .send({
        deploymentId: 'dep-1',
        operatonUrl: 'http://localhost:8081/engine-rest',
        formIds: ['f1'],
        documentIds: ['d1'],
        boardOwner: 'flevoland',
      });

    expect(res.status).toBe(200);
    expect(svc.markDeployed).toHaveBeenCalledWith(
      'p1',
      'dep-1',
      'http://localhost:8081/engine-rest',
      ['f1'],
      ['d1'],
      'flevoland'
    );
  });

  test('defaults the artefact id lists to empty when omitted', async () => {
    svc.markDeployed.mockResolvedValue(undefined);

    await request(makeApp()).patch('/v1/assets/bpmn/p1/deploy').send({ deploymentId: 'dep-1' });

    expect(svc.markDeployed).toHaveBeenCalledWith('p1', 'dep-1', undefined, [], [], undefined);
  });

  test('returns 500 with a DEPLOY_MARK_FAILED code when the update throws', async () => {
    svc.markDeployed.mockRejectedValue(new Error('no such process'));

    const res = await request(makeApp())
      .patch('/v1/assets/bpmn/p1/deploy')
      .send({ deploymentId: 'dep-1' });

    expect(res.status).toBe(500);
    expect(res.body.error).toEqual({ code: 'DEPLOY_MARK_FAILED', message: 'no such process' });
  });
});

describe('GET /bpmn/by-bpmn-id/:bpmnProcessId', () => {
  test('resolves a process by its BPMN process id', async () => {
    svc.getBpmnByBpmnProcessId.mockResolvedValue({ id: 'p1', xml: '<bpmn/>' });

    const res = await request(makeApp()).get('/v1/assets/bpmn/by-bpmn-id/ZorgtoeslagProcess');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { id: 'p1', xml: '<bpmn/>' } });
    expect(svc.getBpmnByBpmnProcessId).toHaveBeenCalledWith('ZorgtoeslagProcess');
  });

  test('returns 404 naming the process id when the subprocess is missing', async () => {
    svc.getBpmnByBpmnProcessId.mockResolvedValue(null);

    const res = await request(makeApp()).get('/v1/assets/bpmn/by-bpmn-id/MissingSub');

    expect(res.status).toBe(404);
    expect(res.body.error).toEqual({
      code: 'NOT_FOUND',
      message: 'No process found for bpmnProcessId: MissingSub',
    });
  });

  test('returns 500 with a LOOKUP_FAILED code when the lookup throws', async () => {
    svc.getBpmnByBpmnProcessId.mockRejectedValue(new Error('query failed'));

    const res = await request(makeApp()).get('/v1/assets/bpmn/by-bpmn-id/ZorgtoeslagProcess');

    expect(res.status).toBe(500);
    expect(res.body.error).toEqual({ code: 'LOOKUP_FAILED', message: 'query failed' });
  });

  test('is not shadowed by the DELETE /bpmn/:id route', async () => {
    svc.getBpmnByBpmnProcessId.mockResolvedValue({ id: 'p1' });

    await request(makeApp()).get('/v1/assets/bpmn/by-bpmn-id/ZorgtoeslagProcess');

    expect(svc.deleteBpmn).not.toHaveBeenCalled();
  });
});

describe('forms', () => {
  test('GET /forms returns the stored forms', async () => {
    svc.listForms.mockResolvedValue([{ id: 'f1' }]);

    const res = await request(makeApp()).get('/v1/assets/forms');

    expect(res.body).toEqual({ success: true, data: [{ id: 'f1' }] });
  });

  test('POST /forms upserts the posted body', async () => {
    svc.upsertForm.mockResolvedValue(undefined);

    const res = await request(makeApp()).post('/v1/assets/forms').send({ id: 'f1' });

    expect(res.body).toEqual({ success: true });
    expect(svc.upsertForm).toHaveBeenCalledWith({ id: 'f1' });
  });

  test('DELETE /forms/:id deletes by id', async () => {
    svc.deleteForm.mockResolvedValue(undefined);

    await request(makeApp()).delete('/v1/assets/forms/f1');

    expect(svc.deleteForm).toHaveBeenCalledWith('f1');
  });

  test.each([
    ['get', '/v1/assets/forms', 'listForms', 'LIST_FAILED'],
    ['post', '/v1/assets/forms', 'upsertForm', 'UPSERT_FAILED'],
    ['delete', '/v1/assets/forms/f1', 'deleteForm', 'DELETE_FAILED'],
  ] as const)('%s %s maps a service failure to %s', async (method, path, fn, code) => {
    svc[fn].mockRejectedValue(new Error('boom'));

    const res = await request(makeApp())[method](path).send({});

    expect(res.status).toBe(500);
    expect(res.body.error).toEqual({ code, message: 'boom' });
  });
});

describe('documents', () => {
  test('GET /documents returns the stored templates', async () => {
    svc.listDocuments.mockResolvedValue([{ id: 'd1' }]);

    const res = await request(makeApp()).get('/v1/assets/documents');

    expect(res.body).toEqual({ success: true, data: [{ id: 'd1' }] });
  });

  test('POST /documents upserts the posted body', async () => {
    svc.upsertDocument.mockResolvedValue(undefined);

    const res = await request(makeApp()).post('/v1/assets/documents').send({ id: 'd1' });

    expect(res.body).toEqual({ success: true });
    expect(svc.upsertDocument).toHaveBeenCalledWith({ id: 'd1' });
  });

  test('DELETE /documents/:id deletes by id', async () => {
    svc.deleteDocument.mockResolvedValue(undefined);

    await request(makeApp()).delete('/v1/assets/documents/d1');

    expect(svc.deleteDocument).toHaveBeenCalledWith('d1');
  });

  test.each([
    ['get', '/v1/assets/documents', 'listDocuments', 'LIST_FAILED'],
    ['post', '/v1/assets/documents', 'upsertDocument', 'UPSERT_FAILED'],
    ['delete', '/v1/assets/documents/d1', 'deleteDocument', 'DELETE_FAILED'],
  ] as const)('%s %s maps a service failure to %s', async (method, path, fn, code) => {
    svc[fn].mockRejectedValue(new Error('boom'));

    const res = await request(makeApp())[method](path).send({});

    expect(res.status).toBe(500);
    expect(res.body.error).toEqual({ code, message: 'boom' });
  });
});
