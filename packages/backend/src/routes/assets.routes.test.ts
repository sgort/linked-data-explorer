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
import { versionMiddleware } from '../middleware/version.middleware';
import { errorHandler } from '../middleware/error.middleware';
import { expectToMatchOperation } from '../openapi/testing/conformance';

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
    expect(res.body).toMatchObject({
      status: 500,
      title: 'List failed',
      detail: 'db unavailable',
      code: 'LIST_FAILED',
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
    expect(res.body).toMatchObject({
      status: 500,
      title: 'Save failed',
      detail: 'readonly record',
      code: 'UPSERT_FAILED',
    });
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
    expect(res.body).toMatchObject({
      status: 500,
      title: 'Delete failed',
      detail: 'still referenced',
      code: 'DELETE_FAILED',
    });
  });
});

describe('PATCH /bpmn/:id/deploy', () => {
  test('records the deployment with the supplied artefact ids', async () => {
    svc.markDeployed.mockResolvedValue(true);

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
    svc.markDeployed.mockResolvedValue(true);

    await request(makeApp()).patch('/v1/assets/bpmn/p1/deploy').send({ deploymentId: 'dep-1' });

    expect(svc.markDeployed).toHaveBeenCalledWith('p1', 'dep-1', undefined, [], [], undefined);
  });

  test('returns 404 with a NOT_FOUND code when nothing matches the given id (zero-row update)', async () => {
    svc.markDeployed.mockResolvedValue(false);

    const res = await request(makeApp())
      .patch('/v1/assets/bpmn/missing-id/deploy')
      .send({ deploymentId: 'dep-1' });

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({
      status: 404,
      title: 'Not found',
      detail: 'No process found for id: missing-id',
      code: 'NOT_FOUND',
    });
  });

  test('returns 500 with a DEPLOY_MARK_FAILED code when the update throws', async () => {
    svc.markDeployed.mockRejectedValue(new Error('no such process'));

    const res = await request(makeApp())
      .patch('/v1/assets/bpmn/p1/deploy')
      .send({ deploymentId: 'dep-1' });

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      status: 500,
      title: 'Deploy record failed',
      detail: 'no such process',
      code: 'DEPLOY_MARK_FAILED',
    });
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
    expect(res.body).toMatchObject({
      status: 404,
      title: 'Not found',
      detail: 'No process found for bpmnProcessId: MissingSub',
      code: 'NOT_FOUND',
    });
  });

  test('returns 500 with a LOOKUP_FAILED code when the lookup throws', async () => {
    svc.getBpmnByBpmnProcessId.mockRejectedValue(new Error('query failed'));

    const res = await request(makeApp()).get('/v1/assets/bpmn/by-bpmn-id/ZorgtoeslagProcess');

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      status: 500,
      title: 'Lookup failed',
      detail: 'query failed',
      code: 'LOOKUP_FAILED',
    });
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
    ['get', '/v1/assets/forms', 'listForms', 'LIST_FAILED', 'List failed'],
    ['post', '/v1/assets/forms', 'upsertForm', 'UPSERT_FAILED', 'Save failed'],
    ['delete', '/v1/assets/forms/f1', 'deleteForm', 'DELETE_FAILED', 'Delete failed'],
  ] as const)('%s %s maps a service failure to %s', async (method, path, fn, code, title) => {
    svc[fn].mockRejectedValue(new Error('boom'));

    const res = await request(makeApp())[method](path).send({});

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ status: 500, title, detail: 'boom', code });
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
    ['get', '/v1/assets/documents', 'listDocuments', 'LIST_FAILED', 'List failed'],
    ['post', '/v1/assets/documents', 'upsertDocument', 'UPSERT_FAILED', 'Save failed'],
    ['delete', '/v1/assets/documents/d1', 'deleteDocument', 'DELETE_FAILED', 'Delete failed'],
  ] as const)('%s %s maps a service failure to %s', async (method, path, fn, code, title) => {
    svc[fn].mockRejectedValue(new Error('boom'));

    const res = await request(makeApp())[method](path).send({});

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ status: 500, title, detail: 'boom', code });
  });
});

describe('/v1/assets/bpmn matches its OpenAPI description', () => {
  function makeDocumentedApp() {
    const app = express();
    app.use(express.json());
    app.use(versionMiddleware); // app-wide in index.ts
    app.use('/v1/assets', assetsRoutes);
    app.use(errorHandler); // app-wide in index.ts; answers malformed JSON bodies
    return app;
  }

  // Every optional field and the linkedDmnTemplates array populated, so the
  // Bpmn schema is actually exercised rather than only nominally referenced
  // (description, calledElement, shellId, language, organization all set;
  // linkedDmnTemplates has two entries).
  const FULL_BPMN = {
    id: 'p1',
    bpmnProcessId: 'ZorgtoeslagProcess',
    name: 'Zorgtoeslag aanvragen',
    description: 'Process for requesting housing benefit',
    xml: '<bpmn:definitions/>',
    processRole: 'shell',
    calledElement: 'ZorgtoeslagSubProcess',
    shellId: 'shell-1',
    linkedDmnTemplates: ['dmn-1', 'dmn-2'],
    status: 'wip',
    readonly: false,
    schemaVersion: 1,
    language: 'nl',
    organization: 'Gemeente Utrecht',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
  };

  // bpmnProcessId included, unlike the bare-bones fixtures used above — the
  // existing {id, xml}-only fixture would silently pass a schema that
  // doesn't actually require it.
  const LOOKUP_RESULT = {
    id: 'p1',
    bpmnProcessId: 'ZorgtoeslagProcess',
    xml: '<bpmn:definitions/>',
  };

  // Every field mapBpmn's `?? undefined` can drop (description, calledElement,
  // shellId, language, organization) is missing, so a wrongly-required
  // optional field would fail this instead of passing unnoticed against a
  // maximal fixture.
  const MINIMAL_BPMN = {
    id: 'p2',
    bpmnProcessId: 'MinimalProcess',
    name: 'Minimal process',
    xml: '<bpmn:definitions/>',
    processRole: 'standalone',
    linkedDmnTemplates: [],
    status: 'wip',
    readonly: false,
    schemaVersion: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
  };

  test('GET /assets/bpmn 200, as documented', async () => {
    svc.listBpmn.mockResolvedValue([FULL_BPMN]);

    const res = await request(makeDocumentedApp()).get('/v1/assets/bpmn');

    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'get', '/assets/bpmn');
  });

  test('GET /assets/bpmn 200 with a minimal record, as documented', async () => {
    svc.listBpmn.mockResolvedValue([MINIMAL_BPMN]);

    const res = await request(makeDocumentedApp()).get('/v1/assets/bpmn');

    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'get', '/assets/bpmn');
  });

  test('GET /assets/bpmn 500, as documented', async () => {
    svc.listBpmn.mockRejectedValue(new Error('db unavailable'));

    const res = await request(makeDocumentedApp()).get('/v1/assets/bpmn');

    expect(res.status).toBe(500);
    expectToMatchOperation(res, 'get', '/assets/bpmn');
  });

  test('POST /assets/bpmn 200, as documented', async () => {
    svc.upsertBpmn.mockResolvedValue(undefined);

    const res = await request(makeDocumentedApp()).post('/v1/assets/bpmn').send(FULL_BPMN);

    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'post', '/assets/bpmn');
  });

  test('POST /assets/bpmn 500, as documented', async () => {
    svc.upsertBpmn.mockRejectedValue(new Error('readonly record'));

    const res = await request(makeDocumentedApp()).post('/v1/assets/bpmn').send({ id: 'p1' });

    expect(res.status).toBe(500);
    expectToMatchOperation(res, 'post', '/assets/bpmn');
  });

  test('POST /assets/bpmn malformed body is a 400 problem, as documented (#143)', async () => {
    const res = await request(makeDocumentedApp())
      .post('/v1/assets/bpmn')
      .set('Content-Type', 'application/json')
      .send('{"id":');

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MALFORMED_BODY');
    expectToMatchOperation(res, 'post', '/assets/bpmn');
  });

  test('DELETE /assets/bpmn/{id} 200, as documented', async () => {
    svc.deleteBpmn.mockResolvedValue(undefined);

    const res = await request(makeDocumentedApp()).delete('/v1/assets/bpmn/p1');

    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'delete', '/assets/bpmn/{id}');
  });

  test('DELETE /assets/bpmn/{id} 500, as documented', async () => {
    svc.deleteBpmn.mockRejectedValue(new Error('still referenced'));

    const res = await request(makeDocumentedApp()).delete('/v1/assets/bpmn/p1');

    expect(res.status).toBe(500);
    expectToMatchOperation(res, 'delete', '/assets/bpmn/{id}');
  });

  test('PATCH /assets/bpmn/{id}/deploy 200 with a full body, as documented', async () => {
    svc.markDeployed.mockResolvedValue(true);

    const res = await request(makeDocumentedApp())
      .patch('/v1/assets/bpmn/p1/deploy')
      .send({
        deploymentId: 'dep-1',
        operatonUrl: 'http://localhost:8081/engine-rest',
        formIds: ['f1'],
        documentIds: ['d1'],
        boardOwner: 'flevoland',
      });

    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'patch', '/assets/bpmn/{id}/deploy');
  });

  test('PATCH /assets/bpmn/{id}/deploy 200 with an empty body, as documented', async () => {
    svc.markDeployed.mockResolvedValue(true);

    const res = await request(makeDocumentedApp()).patch('/v1/assets/bpmn/p1/deploy').send({});

    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'patch', '/assets/bpmn/{id}/deploy');
  });

  test('PATCH /assets/bpmn/{id}/deploy 200 with no body at all, as documented', async () => {
    svc.markDeployed.mockResolvedValue(true);

    const res = await request(makeDocumentedApp()).patch('/v1/assets/bpmn/p1/deploy');

    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'patch', '/assets/bpmn/{id}/deploy');
  });

  test('PATCH /assets/bpmn/{id}/deploy 404 when nothing matches the id, as documented', async () => {
    svc.markDeployed.mockResolvedValue(false);

    const res = await request(makeDocumentedApp())
      .patch('/v1/assets/bpmn/missing-id/deploy')
      .send({ deploymentId: 'dep-1' });

    expect(res.status).toBe(404);
    expectToMatchOperation(res, 'patch', '/assets/bpmn/{id}/deploy');
  });

  test('PATCH /assets/bpmn/{id}/deploy 500, as documented', async () => {
    svc.markDeployed.mockRejectedValue(new Error('no such process'));

    const res = await request(makeDocumentedApp())
      .patch('/v1/assets/bpmn/p1/deploy')
      .send({ deploymentId: 'dep-1' });

    expect(res.status).toBe(500);
    expectToMatchOperation(res, 'patch', '/assets/bpmn/{id}/deploy');
  });

  test('PATCH /assets/bpmn/{id}/deploy malformed body is a 400 problem, as documented (#143)', async () => {
    const res = await request(makeDocumentedApp())
      .patch('/v1/assets/bpmn/p1/deploy')
      .set('Content-Type', 'application/json')
      .send('{"deploymentId":');

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MALFORMED_BODY');
    expectToMatchOperation(res, 'patch', '/assets/bpmn/{id}/deploy');
  });

  test('GET /assets/bpmn/by-bpmn-id/{bpmnProcessId} 200, as documented', async () => {
    svc.getBpmnByBpmnProcessId.mockResolvedValue(LOOKUP_RESULT);

    const res = await request(makeDocumentedApp()).get(
      '/v1/assets/bpmn/by-bpmn-id/ZorgtoeslagProcess'
    );

    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'get', '/assets/bpmn/by-bpmn-id/{bpmnProcessId}');
  });

  test('GET /assets/bpmn/by-bpmn-id/{bpmnProcessId} 404, as documented', async () => {
    svc.getBpmnByBpmnProcessId.mockResolvedValue(null);

    const res = await request(makeDocumentedApp()).get('/v1/assets/bpmn/by-bpmn-id/MissingSub');

    expect(res.status).toBe(404);
    expectToMatchOperation(res, 'get', '/assets/bpmn/by-bpmn-id/{bpmnProcessId}');
  });

  test('GET /assets/bpmn/by-bpmn-id/{bpmnProcessId} 500, as documented', async () => {
    svc.getBpmnByBpmnProcessId.mockRejectedValue(new Error('query failed'));

    const res = await request(makeDocumentedApp()).get(
      '/v1/assets/bpmn/by-bpmn-id/ZorgtoeslagProcess'
    );

    expect(res.status).toBe(500);
    expectToMatchOperation(res, 'get', '/assets/bpmn/by-bpmn-id/{bpmnProcessId}');
  });
});

describe('/v1/assets/forms matches its OpenAPI description', () => {
  function makeDocumentedApp() {
    const app = express();
    app.use(express.json());
    app.use(versionMiddleware); // app-wide in index.ts
    app.use('/v1/assets', assetsRoutes);
    app.use(errorHandler); // app-wide in index.ts; answers malformed JSON bodies
    return app;
  }

  // Every optional field populated, and `schema` given more than one key
  // with mixed value types (string, array, boolean, number), so the Form
  // schema's free-form JSONB field is actually exercised.
  const FULL_FORM = {
    id: 'f1',
    name: 'Aanvraagformulier zorgtoeslag',
    description: 'Intake form for the housing benefit application',
    schema: { title: 'Zorgtoeslag', fields: ['naam', 'inkomen'], required: true, maxAmount: 500 },
    status: 'wip',
    language: 'nl',
    organization: 'Gemeente Utrecht',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    readonly: false,
  };

  // Every field mapForm's `?? undefined` can drop (description, language,
  // organization) is missing, so a wrongly-required optional field would
  // fail this instead of passing unnoticed against a maximal fixture.
  const MINIMAL_FORM = {
    id: 'f2',
    name: 'Minimal form',
    schema: {},
    status: 'wip',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    readonly: false,
  };

  test('GET /assets/forms 200, as documented', async () => {
    svc.listForms.mockResolvedValue([FULL_FORM]);

    const res = await request(makeDocumentedApp()).get('/v1/assets/forms');

    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'get', '/assets/forms');
  });

  test('GET /assets/forms 200 with a minimal record, as documented', async () => {
    svc.listForms.mockResolvedValue([MINIMAL_FORM]);

    const res = await request(makeDocumentedApp()).get('/v1/assets/forms');

    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'get', '/assets/forms');
  });

  test('GET /assets/forms 500, as documented', async () => {
    svc.listForms.mockRejectedValue(new Error('db unavailable'));

    const res = await request(makeDocumentedApp()).get('/v1/assets/forms');

    expect(res.status).toBe(500);
    expectToMatchOperation(res, 'get', '/assets/forms');
  });

  test('POST /assets/forms 200, as documented', async () => {
    svc.upsertForm.mockResolvedValue(undefined);

    const res = await request(makeDocumentedApp()).post('/v1/assets/forms').send(FULL_FORM);

    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'post', '/assets/forms');
  });

  test('POST /assets/forms 500, as documented', async () => {
    svc.upsertForm.mockRejectedValue(
      new Error('null value in column "name" violates not-null constraint')
    );

    const res = await request(makeDocumentedApp()).post('/v1/assets/forms').send({ id: 'f1' });

    expect(res.status).toBe(500);
    expectToMatchOperation(res, 'post', '/assets/forms');
  });

  test('POST /assets/forms malformed body is a 400 problem, as documented (#143)', async () => {
    const res = await request(makeDocumentedApp())
      .post('/v1/assets/forms')
      .set('Content-Type', 'application/json')
      .send('{"id":');

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MALFORMED_BODY');
    expectToMatchOperation(res, 'post', '/assets/forms');
  });

  test('DELETE /assets/forms/{id} 200, as documented', async () => {
    svc.deleteForm.mockResolvedValue(undefined);

    const res = await request(makeDocumentedApp()).delete('/v1/assets/forms/f1');

    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'delete', '/assets/forms/{id}');
  });

  test('DELETE /assets/forms/{id} 500, as documented', async () => {
    svc.deleteForm.mockRejectedValue(new Error('still referenced'));

    const res = await request(makeDocumentedApp()).delete('/v1/assets/forms/f1');

    expect(res.status).toBe(500);
    expectToMatchOperation(res, 'delete', '/assets/forms/{id}');
  });
});

describe('/v1/assets/documents matches its OpenAPI description', () => {
  function makeDocumentedApp() {
    const app = express();
    app.use(express.json());
    app.use(versionMiddleware); // app-wide in index.ts
    app.use('/v1/assets', assetsRoutes);
    app.use(errorHandler); // app-wide in index.ts; answers malformed JSON bodies
    return app;
  }

  // Every optional field populated. `zones` is given more than one key with
  // mixed value types (string, array, boolean, number, null) to exercise the
  // Document schema's free-form JSONB field; `bindings` and `assets` are the
  // real shapes (VariableBinding[] and string[] — see
  // packages/frontend/src/types/document.types.ts), taken from a shipped
  // template (packages/frontend/src/components/DocumentComposer/defaultTemplates.ts).
  const FULL_DOCUMENT = {
    id: 'd1',
    name: 'Beschikkingsbrief',
    description: 'Decision letter template',
    processKey: 'ZorgtoeslagProcess',
    serviceId: 'svc-1',
    schemaVersion: 2,
    zones: {
      header: 'Gemeente Utrecht',
      paragraphs: ['intro', 'besluit'],
      includeLogo: true,
      margin: 20,
    },
    bindings: [
      {
        id: 'b1',
        placeholder: '{{dossierReference}}',
        variableKey: 'dossierReference',
        source: 'process',
        label: 'Dossiernummer',
      },
      {
        id: 'b2',
        placeholder: '{{permitDecision}}',
        variableKey: 'permitDecision',
        source: 'dmn_output',
        label: 'Vergunningsbesluit',
      },
    ],
    assets: [
      'https://triplydb.example/assets/logo.png',
      'https://triplydb.example/assets/watermark.png',
    ],
    status: 'wip',
    language: 'nl',
    organization: 'Gemeente Utrecht',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    readonly: false,
  };

  // Every field mapDocument's `?? undefined` can drop (description,
  // processKey, serviceId, language, organization) is missing, so a
  // wrongly-required optional field would fail this instead of passing
  // unnoticed against a maximal fixture.
  const MINIMAL_DOCUMENT = {
    id: 'd2',
    name: 'Minimal document',
    schemaVersion: 1,
    zones: {},
    bindings: [],
    assets: [],
    status: 'wip',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    readonly: false,
  };

  test('GET /assets/documents 200, as documented', async () => {
    svc.listDocuments.mockResolvedValue([FULL_DOCUMENT]);

    const res = await request(makeDocumentedApp()).get('/v1/assets/documents');

    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'get', '/assets/documents');
  });

  test('GET /assets/documents 200 with a minimal record, as documented', async () => {
    svc.listDocuments.mockResolvedValue([MINIMAL_DOCUMENT]);

    const res = await request(makeDocumentedApp()).get('/v1/assets/documents');

    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'get', '/assets/documents');
  });

  test('GET /assets/documents 500, as documented', async () => {
    svc.listDocuments.mockRejectedValue(new Error('db unavailable'));

    const res = await request(makeDocumentedApp()).get('/v1/assets/documents');

    expect(res.status).toBe(500);
    expectToMatchOperation(res, 'get', '/assets/documents');
  });

  test('POST /assets/documents 200, as documented', async () => {
    svc.upsertDocument.mockResolvedValue(undefined);

    const res = await request(makeDocumentedApp()).post('/v1/assets/documents').send(FULL_DOCUMENT);

    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'post', '/assets/documents');
  });

  test('POST /assets/documents 500, as documented', async () => {
    svc.upsertDocument.mockRejectedValue(
      new Error('null value in column "zones" violates not-null constraint')
    );

    const res = await request(makeDocumentedApp()).post('/v1/assets/documents').send({ id: 'd1' });

    expect(res.status).toBe(500);
    expectToMatchOperation(res, 'post', '/assets/documents');
  });

  test('POST /assets/documents malformed body is a 400 problem, as documented (#143)', async () => {
    const res = await request(makeDocumentedApp())
      .post('/v1/assets/documents')
      .set('Content-Type', 'application/json')
      .send('{"id":');

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MALFORMED_BODY');
    expectToMatchOperation(res, 'post', '/assets/documents');
  });

  test('DELETE /assets/documents/{id} 200, as documented', async () => {
    svc.deleteDocument.mockResolvedValue(undefined);

    const res = await request(makeDocumentedApp()).delete('/v1/assets/documents/d1');

    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'delete', '/assets/documents/{id}');
  });

  test('DELETE /assets/documents/{id} 500, as documented', async () => {
    svc.deleteDocument.mockRejectedValue(new Error('still referenced'));

    const res = await request(makeDocumentedApp()).delete('/v1/assets/documents/d1');

    expect(res.status).toBe(500);
    expectToMatchOperation(res, 'delete', '/assets/documents/{id}');
  });
});
