import express from 'express';
import request from 'supertest';

jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
jest.mock('../services/edocs.service', () => ({
  __esModule: true,
  edocsService: {
    healthCheck: jest.fn(),
    ensureWorkspace: jest.fn(),
    uploadDocument: jest.fn(),
    getWorkspaceDocuments: jest.fn(),
  },
}));

const configMock = { edocs: { stubMode: true } };
jest.mock('../utils/config', () => ({
  __esModule: true,
  config: configMock,
  default: configMock,
}));

import { edocsService } from '../services/edocs.service';
import edocsRoutes from './edocs.routes';
import { versionMiddleware } from '../middleware/version.middleware';
import { errorHandler } from '../middleware/error.middleware';
import { expectToMatchOperation } from '../openapi/testing/conformance';

const svc = edocsService as unknown as Record<string, jest.Mock>;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/v1/edocs', edocsRoutes);
  return app;
}

beforeEach(() => {
  for (const fn of Object.values(svc)) fn.mockReset();
  configMock.edocs.stubMode = true;
});

describe('GET /v1/edocs/status', () => {
  test('reports health, stub mode and latency', async () => {
    svc.healthCheck.mockResolvedValue({ status: 'up', latency: 25 });

    const res = await request(makeApp()).get('/v1/edocs/status');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: { status: 'up', stubMode: true, latencyMs: 25 },
    });
  });

  test('reflects the configured stub mode', async () => {
    configMock.edocs.stubMode = false;
    svc.healthCheck.mockResolvedValue({ status: 'up' });

    const res = await request(makeApp()).get('/v1/edocs/status');

    expect(res.body.data.stubMode).toBe(false);
  });

  test('omits latency when the health check does not report one', async () => {
    svc.healthCheck.mockResolvedValue({ status: 'stub' });

    const res = await request(makeApp()).get('/v1/edocs/status');

    expect(res.body.data).not.toHaveProperty('latencyMs');
  });

  test('keeps a zero latency, rather than dropping it as falsy', async () => {
    svc.healthCheck.mockResolvedValue({ status: 'up', latency: 0 });

    const res = await request(makeApp()).get('/v1/edocs/status');

    expect(res.body.data.latencyMs).toBe(0);
  });

  test('surfaces a reported error alongside the status', async () => {
    svc.healthCheck.mockResolvedValue({ status: 'down', error: 'connection refused' });

    const res = await request(makeApp()).get('/v1/edocs/status');

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: 'down', error: 'connection refused' });
  });

  test('returns 500 with an EDOCS_STATUS_FAILED code when the check throws', async () => {
    svc.healthCheck.mockRejectedValue(new Error('eDOCS unreachable'));

    const res = await request(makeApp()).get('/v1/edocs/status');

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      status: 500,
      title: 'eDOCS status check failed',
      detail: 'eDOCS unreachable',
      code: 'EDOCS_STATUS_FAILED',
    });
  });
});

describe('POST /v1/edocs/workspaces/ensure', () => {
  test('creates or resolves the workspace', async () => {
    svc.ensureWorkspace.mockResolvedValue({
      workspaceId: 'ws-1',
      workspaceName: 'P-001 Kapvergunning',
      created: true,
    });

    const res = await request(makeApp())
      .post('/v1/edocs/workspaces/ensure')
      .send({ projectNumber: 'P-001', projectName: 'Kapvergunning' });

    expect(res.status).toBe(200);
    expect(res.body.data.created).toBe(true);
    expect(svc.ensureWorkspace).toHaveBeenCalledWith('P-001', 'Kapvergunning');
  });

  test('trims the surrounding whitespace before calling the service', async () => {
    svc.ensureWorkspace.mockResolvedValue({ workspaceId: 'ws-1' });

    await request(makeApp())
      .post('/v1/edocs/workspaces/ensure')
      .send({ projectNumber: '  P-001  ', projectName: '  Kapvergunning  ' });

    expect(svc.ensureWorkspace).toHaveBeenCalledWith('P-001', 'Kapvergunning');
  });

  test.each([
    ['both fields missing', {}],
    ['a missing project name', { projectNumber: 'P-001' }],
    ['a missing project number', { projectName: 'Kapvergunning' }],
    ['a whitespace-only project number', { projectNumber: '   ', projectName: 'Kapvergunning' }],
    ['a whitespace-only project name', { projectNumber: 'P-001', projectName: '   ' }],
  ])('rejects %s with 400 INVALID_INPUT', async (_label, body) => {
    const res = await request(makeApp()).post('/v1/edocs/workspaces/ensure').send(body);

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      status: 400,
      title: 'Invalid request',
      detail: 'projectNumber and projectName are required',
      code: 'INVALID_INPUT',
    });
    expect(svc.ensureWorkspace).not.toHaveBeenCalled();
  });

  test('returns 500 with an EDOCS_WORKSPACE_FAILED code when creation throws', async () => {
    svc.ensureWorkspace.mockRejectedValue(new Error('library full'));

    const res = await request(makeApp())
      .post('/v1/edocs/workspaces/ensure')
      .send({ projectNumber: 'P-001', projectName: 'Kapvergunning' });

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      status: 500,
      title: 'eDOCS workspace request failed',
      detail: 'library full',
      code: 'EDOCS_WORKSPACE_FAILED',
    });
  });
});

describe('POST /v1/edocs/documents', () => {
  const BODY = {
    workspaceId: 'ws-1',
    filename: 'beschikking.pdf',
    contentBase64: 'JVBERi0=',
    metadata: { docName: 'Beschikking', appId: 'ACROBAT', formName: 'F1', extra: { zaak: 'Z-1' } },
  };

  test('uploads the document and returns the service result', async () => {
    svc.uploadDocument.mockResolvedValue({ documentId: 'doc-1', version: 1 });

    const res = await request(makeApp()).post('/v1/edocs/documents').send(BODY);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { documentId: 'doc-1', version: 1 } });
    expect(svc.uploadDocument).toHaveBeenCalledWith('ws-1', 'beschikking.pdf', 'JVBERi0=', {
      docName: 'Beschikking',
      appId: 'ACROBAT',
      formName: 'F1',
      extra: { zaak: 'Z-1' },
    });
  });

  test('trims the identifiers and the document name', async () => {
    svc.uploadDocument.mockResolvedValue({ documentId: 'doc-1' });

    await request(makeApp())
      .post('/v1/edocs/documents')
      .send({
        workspaceId: ' ws-1 ',
        filename: ' beschikking.pdf ',
        contentBase64: ' JVBERi0= ',
        metadata: { docName: ' Beschikking ' },
      });

    expect(svc.uploadDocument).toHaveBeenCalledWith(
      'ws-1',
      'beschikking.pdf',
      'JVBERi0=',
      expect.objectContaining({ docName: 'Beschikking' })
    );
  });

  test('passes the optional metadata through as undefined when omitted', async () => {
    svc.uploadDocument.mockResolvedValue({ documentId: 'doc-1' });

    await request(makeApp())
      .post('/v1/edocs/documents')
      .send({ ...BODY, metadata: { docName: 'Beschikking' } });

    expect(svc.uploadDocument).toHaveBeenCalledWith('ws-1', 'beschikking.pdf', 'JVBERi0=', {
      docName: 'Beschikking',
      appId: undefined,
      formName: undefined,
      extra: undefined,
    });
  });

  test.each([
    ['a missing workspaceId', { ...BODY, workspaceId: undefined }],
    ['a missing filename', { ...BODY, filename: undefined }],
    ['missing content', { ...BODY, contentBase64: undefined }],
    ['missing metadata', { ...BODY, metadata: undefined }],
    ['a missing docName', { ...BODY, metadata: {} }],
    ['a whitespace-only docName', { ...BODY, metadata: { docName: '  ' } }],
  ])('rejects %s with 400 INVALID_INPUT', async (_label, body) => {
    const res = await request(makeApp()).post('/v1/edocs/documents').send(body);

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      status: 400,
      title: 'Invalid request',
      detail: 'workspaceId, filename, contentBase64, and metadata.docName are required',
      code: 'INVALID_INPUT',
    });
    expect(svc.uploadDocument).not.toHaveBeenCalled();
  });

  test('returns 500 with an EDOCS_UPLOAD_FAILED code when the upload throws', async () => {
    svc.uploadDocument.mockRejectedValue(new Error('quota exceeded'));

    const res = await request(makeApp()).post('/v1/edocs/documents').send(BODY);

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      status: 500,
      title: 'eDOCS upload failed',
      detail: 'quota exceeded',
      code: 'EDOCS_UPLOAD_FAILED',
    });
  });
});

describe('GET /v1/edocs/workspaces/:workspaceId/documents', () => {
  test('lists the documents with a count', async () => {
    svc.getWorkspaceDocuments.mockResolvedValue([{ documentId: 'doc-1' }, { documentId: 'doc-2' }]);

    const res = await request(makeApp()).get('/v1/edocs/workspaces/ws-1/documents');

    expect(res.status).toBe(200);
    expect(res.body.data.count).toBe(2);
    expect(svc.getWorkspaceDocuments).toHaveBeenCalledWith('ws-1');
  });

  test('reports an empty workspace as a zero count', async () => {
    svc.getWorkspaceDocuments.mockResolvedValue([]);

    const res = await request(makeApp()).get('/v1/edocs/workspaces/ws-1/documents');

    expect(res.body.data).toEqual({ documents: [], count: 0 });
  });

  test('returns 500 with an EDOCS_DOCUMENTS_FAILED code when the listing throws', async () => {
    svc.getWorkspaceDocuments.mockRejectedValue(new Error('no such workspace'));

    const res = await request(makeApp()).get('/v1/edocs/workspaces/ws-9/documents');

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      status: 500,
      title: 'eDOCS document list failed',
      detail: 'no such workspace',
      code: 'EDOCS_DOCUMENTS_FAILED',
    });
  });
});

describe('/v1/edocs operations match their OpenAPI description', () => {
  // The route test app above has no version middleware and no error handler
  // (see edocs.routes.test.ts's own makeApp()), so a documented app needs
  // both added, matching how dso.routes.test.ts builds its own.
  function makeDocumentedApp() {
    const app = express();
    app.use(express.json());
    app.use(versionMiddleware); // app-wide in index.ts
    app.use('/v1/edocs', edocsRoutes);
    app.use(errorHandler); // app-wide in index.ts; answers malformed JSON bodies
    return app;
  }

  test('GET /status 200, as documented — up, with latencyMs', async () => {
    svc.healthCheck.mockResolvedValue({ status: 'up', latency: 42 });

    const res = await request(makeDocumentedApp()).get('/v1/edocs/status');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ status: 'up', stubMode: true, latencyMs: 42 });
    expectToMatchOperation(res, 'get', '/edocs/status');
  });

  test('GET /status 200, as documented — down, with an error, is not a failure response', async () => {
    svc.healthCheck.mockResolvedValue({ status: 'down', error: 'connect ECONNREFUSED' });

    const res = await request(makeDocumentedApp()).get('/v1/edocs/status');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      status: 'down',
      stubMode: true,
      error: 'connect ECONNREFUSED',
    });
    expectToMatchOperation(res, 'get', '/edocs/status');
  });

  test('GET /status 200, as documented — stub, omitting every optional field', async () => {
    svc.healthCheck.mockResolvedValue({ status: 'stub' });

    const res = await request(makeDocumentedApp()).get('/v1/edocs/status');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ status: 'stub', stubMode: true });
    expectToMatchOperation(res, 'get', '/edocs/status');
  });

  test('GET /status 500, as documented', async () => {
    svc.healthCheck.mockRejectedValue(new Error('eDOCS unreachable'));

    const res = await request(makeDocumentedApp()).get('/v1/edocs/status');

    expect(res.status).toBe(500);
    expectToMatchOperation(res, 'get', '/edocs/status');
  });

  test('POST /workspaces/ensure 200, as documented', async () => {
    svc.ensureWorkspace.mockResolvedValue({
      workspaceId: 'ws-123',
      workspaceName: 'FL-INF-2025-042 — Kapvergunning',
      created: true,
    });

    const res = await request(makeDocumentedApp())
      .post('/v1/edocs/workspaces/ensure')
      .send({ projectNumber: 'FL-INF-2025-042', projectName: 'Kapvergunning' });

    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'post', '/edocs/workspaces/ensure');
  });

  test('POST /workspaces/ensure 400, as documented', async () => {
    const res = await request(makeDocumentedApp()).post('/v1/edocs/workspaces/ensure').send({});

    expect(res.status).toBe(400);
    expectToMatchOperation(res, 'post', '/edocs/workspaces/ensure');
  });

  test('POST /workspaces/ensure 500, as documented', async () => {
    svc.ensureWorkspace.mockRejectedValue(new Error('library full'));

    const res = await request(makeDocumentedApp())
      .post('/v1/edocs/workspaces/ensure')
      .send({ projectNumber: 'FL-INF-2025-042', projectName: 'Kapvergunning' });

    expect(res.status).toBe(500);
    expectToMatchOperation(res, 'post', '/edocs/workspaces/ensure');
  });

  test('POST /workspaces/ensure 400 MALFORMED_BODY for a malformed JSON body, as documented (#143)', async () => {
    const res = await request(makeDocumentedApp())
      .post('/v1/edocs/workspaces/ensure')
      .set('Content-Type', 'application/json')
      .send('{"projectNumber":');

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MALFORMED_BODY');
    expectToMatchOperation(res, 'post', '/edocs/workspaces/ensure');
  });

  test('POST /documents 200, as documented — every optional metadata field filled', async () => {
    svc.uploadDocument.mockResolvedValue({
      documentId: 'doc-1',
      documentNumber: 'FL-2025-001234',
      workspaceId: 'ws-123',
    });

    const res = await request(makeDocumentedApp())
      .post('/v1/edocs/documents')
      .send({
        workspaceId: 'ws-123',
        filename: 'beschikking.pdf',
        contentBase64: 'JVBERi0xLjQKJeLjz9M=',
        metadata: {
          docName: 'Beschikking',
          appId: 'ACROBAT',
          formName: 'F1',
          extra: { zaak: 'Z-1' },
        },
      });

    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'post', '/edocs/documents');
  });

  test('POST /documents 200, as documented — every optional metadata field omitted', async () => {
    svc.uploadDocument.mockResolvedValue({
      documentId: 'doc-2',
      documentNumber: 'FL-2025-001235',
      workspaceId: 'ws-123',
    });

    const res = await request(makeDocumentedApp())
      .post('/v1/edocs/documents')
      .send({
        workspaceId: 'ws-123',
        filename: 'beschikking.pdf',
        contentBase64: 'JVBERi0xLjQKJeLjz9M=',
        metadata: { docName: 'Beschikking' },
      });

    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'post', '/edocs/documents');
  });

  test('POST /documents 400, as documented', async () => {
    const res = await request(makeDocumentedApp()).post('/v1/edocs/documents').send({});

    expect(res.status).toBe(400);
    expectToMatchOperation(res, 'post', '/edocs/documents');
  });

  test('POST /documents 500, as documented', async () => {
    svc.uploadDocument.mockRejectedValue(new Error('quota exceeded'));

    const res = await request(makeDocumentedApp())
      .post('/v1/edocs/documents')
      .send({
        workspaceId: 'ws-123',
        filename: 'beschikking.pdf',
        contentBase64: 'JVBERi0xLjQKJeLjz9M=',
        metadata: { docName: 'Beschikking' },
      });

    expect(res.status).toBe(500);
    expectToMatchOperation(res, 'post', '/edocs/documents');
  });

  test('POST /documents 400 MALFORMED_BODY for a malformed JSON body, as documented (#143)', async () => {
    const res = await request(makeDocumentedApp())
      .post('/v1/edocs/documents')
      .set('Content-Type', 'application/json')
      .send('{"workspaceId":');

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MALFORMED_BODY');
    expectToMatchOperation(res, 'post', '/edocs/documents');
  });

  test('GET /workspaces/:workspaceId/documents 200, as documented — populated', async () => {
    svc.getWorkspaceDocuments.mockResolvedValue([
      { id: 'doc-1', name: 'Aanvraag.pdf', documentNumber: 'FL-2025-001234' },
    ]);

    const res = await request(makeDocumentedApp()).get('/v1/edocs/workspaces/ws-123/documents');

    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'get', '/edocs/workspaces/{workspaceId}/documents');
  });

  test('GET /workspaces/:workspaceId/documents 200, as documented — an unknown workspace answers an empty list, not 404', async () => {
    svc.getWorkspaceDocuments.mockResolvedValue([]);

    const res = await request(makeDocumentedApp()).get('/v1/edocs/workspaces/ws-unknown/documents');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ documents: [], count: 0 });
    expectToMatchOperation(res, 'get', '/edocs/workspaces/{workspaceId}/documents');
  });

  test('GET /workspaces/:workspaceId/documents 500, as documented', async () => {
    svc.getWorkspaceDocuments.mockRejectedValue(new Error('no such workspace'));

    const res = await request(makeDocumentedApp()).get('/v1/edocs/workspaces/ws-123/documents');

    expect(res.status).toBe(500);
    expectToMatchOperation(res, 'get', '/edocs/workspaces/{workspaceId}/documents');
  });
});
