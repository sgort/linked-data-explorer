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
    svc.healthCheck.mockResolvedValue({ status: 'ok', latency: 25 });

    const res = await request(makeApp()).get('/v1/edocs/status');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: { status: 'ok', stubMode: true, latencyMs: 25 },
    });
  });

  test('reflects the configured stub mode', async () => {
    configMock.edocs.stubMode = false;
    svc.healthCheck.mockResolvedValue({ status: 'ok' });

    const res = await request(makeApp()).get('/v1/edocs/status');

    expect(res.body.data.stubMode).toBe(false);
  });

  test('omits latency when the health check does not report one', async () => {
    svc.healthCheck.mockResolvedValue({ status: 'degraded' });

    const res = await request(makeApp()).get('/v1/edocs/status');

    expect(res.body.data).not.toHaveProperty('latencyMs');
  });

  test('keeps a zero latency, rather than dropping it as falsy', async () => {
    svc.healthCheck.mockResolvedValue({ status: 'ok', latency: 0 });

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
    expect(res.body.error).toEqual({
      code: 'EDOCS_STATUS_FAILED',
      message: 'eDOCS unreachable',
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
    expect(res.body.error).toEqual({
      code: 'INVALID_INPUT',
      message: 'projectNumber and projectName are required',
    });
    expect(svc.ensureWorkspace).not.toHaveBeenCalled();
  });

  test('returns 500 with an EDOCS_WORKSPACE_FAILED code when creation throws', async () => {
    svc.ensureWorkspace.mockRejectedValue(new Error('library full'));

    const res = await request(makeApp())
      .post('/v1/edocs/workspaces/ensure')
      .send({ projectNumber: 'P-001', projectName: 'Kapvergunning' });

    expect(res.status).toBe(500);
    expect(res.body.error).toEqual({ code: 'EDOCS_WORKSPACE_FAILED', message: 'library full' });
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
    expect(res.body.error).toEqual({
      code: 'INVALID_INPUT',
      message: 'workspaceId, filename, contentBase64, and metadata.docName are required',
    });
    expect(svc.uploadDocument).not.toHaveBeenCalled();
  });

  test('returns 500 with an EDOCS_UPLOAD_FAILED code when the upload throws', async () => {
    svc.uploadDocument.mockRejectedValue(new Error('quota exceeded'));

    const res = await request(makeApp()).post('/v1/edocs/documents').send(BODY);

    expect(res.status).toBe(500);
    expect(res.body.error).toEqual({ code: 'EDOCS_UPLOAD_FAILED', message: 'quota exceeded' });
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
    expect(res.body.error).toEqual({
      code: 'EDOCS_DOCUMENTS_FAILED',
      message: 'no such workspace',
    });
  });
});
