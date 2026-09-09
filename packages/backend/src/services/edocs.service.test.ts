import axios from 'axios';

jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));
// The module exports a singleton, so axios.create() runs at import time — the
// client stub has to exist inside the factory rather than be wired up later.
jest.mock('axios', () => {
  const client = {
    get: jest.fn(),
    post: jest.fn(),
    interceptors: { request: { use: jest.fn() } },
  };
  return { __esModule: true, default: { create: jest.fn(() => client) } };
});

const configMock = {
  edocs: {
    baseUrl: 'https://edocs.example/api',
    library: 'FLEVOLAND',
    userId: 'svc-lde',
    password: 'secret',
    stubMode: true,
  },
};
jest.mock('../utils/config', () => ({
  __esModule: true,
  config: configMock,
  default: configMock,
}));

import { EdocsService } from './edocs.service';

const mockCreate = axios.create as jest.Mock;
// Every instance shares the one stubbed client the factory built.
const client = mockCreate.mock.results[0].value as {
  get: jest.Mock;
  post: jest.Mock;
  interceptors: { request: { use: jest.Mock } };
};
const mockGet = client.get;
const mockPost = client.post;
const mockInterceptorUse = client.interceptors.request.use;

type RequestInterceptor = (cfg: { headers: Record<string, string> }) => {
  headers: Record<string, string>;
};

/** Build a service with the stub flag the constructor will read. */
function makeService(stubMode: boolean) {
  configMock.edocs.stubMode = stubMode;
  return new EdocsService();
}

function lastInterceptor(): RequestInterceptor {
  const calls = mockInterceptorUse.mock.calls;
  return calls[calls.length - 1][0] as RequestInterceptor;
}

/** A successful /connect response carrying the session token header. */
const CONNECT_OK = { headers: { 'x-dm-dst': 'tok-abc' }, data: {} };

function httpError(status: number) {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    response: { status },
  });
}

beforeEach(() => {
  mockGet.mockReset();
  mockPost.mockReset();
  mockInterceptorUse.mockReset();
  mockCreate.mockClear();
});

describe('construction', () => {
  test('creates an axios client bound to the configured eDOCS base URL', () => {
    makeService(false);

    expect(mockCreate).toHaveBeenCalledWith({
      baseURL: 'https://edocs.example/api',
      timeout: 15000,
      headers: { 'Content-Type': 'application/json' },
    });
  });

  test('registers a request interceptor that leaves headers alone before authentication', () => {
    makeService(false);

    const cfg = lastInterceptor()({ headers: {} });

    expect(cfg.headers['X-DM-DST']).toBeUndefined();
  });

  test('the interceptor attaches the cached session token once connected', async () => {
    const service = makeService(false);
    mockPost.mockResolvedValue(CONNECT_OK);
    mockGet.mockResolvedValue({ data: {} });

    await service.getWorkspaceDocuments('ws-1');
    const cfg = lastInterceptor()({ headers: {} });

    expect(cfg.headers['X-DM-DST']).toBe('tok-abc');
  });
});

describe('stub mode', () => {
  test('ensureWorkspace returns a deterministic id derived from the project number', async () => {
    const service = makeService(true);

    const result = await service.ensureWorkspace('FL-INF-2025-042', 'Herinrichting N305');

    expect(result).toEqual({
      workspaceId: 'stub-ws-FL-INF-2025-042',
      workspaceName: 'FL-INF-2025-042 — Herinrichting N305',
      created: false,
    });
    expect(mockPost).not.toHaveBeenCalled();
    expect(mockGet).not.toHaveBeenCalled();
  });

  test('ensureWorkspace sanitises punctuation out of the stub id', async () => {
    const service = makeService(true);

    const result = await service.ensureWorkspace('FL/INF 2025.042', 'Project');

    expect(result.workspaceId).toBe('stub-ws-FL-INF-2025-042');
  });

  test('uploadDocument returns a stub document without calling eDOCS', async () => {
    const service = makeService(true);

    const result = await service.uploadDocument('ws-1', 'report.pdf', 'JVBERi0=', {
      docName: 'Rapport',
    });

    expect(result.workspaceId).toBe('ws-1');
    expect(result.documentId).toMatch(/^stub-doc-\d+$/);
    expect(result.documentNumber).toMatch(/^STUB-\d+$/);
    expect(mockPost).not.toHaveBeenCalled();
  });

  test('getWorkspaceDocuments returns a single placeholder document', async () => {
    const service = makeService(true);

    await expect(service.getWorkspaceDocuments('ws-1')).resolves.toEqual([
      { id: 'stub-doc-1', name: 'Stub document', documentNumber: 'STUB-001' },
    ]);
    expect(mockGet).not.toHaveBeenCalled();
  });

  test('healthCheck reports the stub status rather than up or down', async () => {
    const service = makeService(true);

    await expect(service.healthCheck()).resolves.toEqual({ status: 'stub' });
    expect(mockGet).not.toHaveBeenCalled();
  });
});

describe('authentication', () => {
  test('connects once and reuses the cached token for later calls', async () => {
    const service = makeService(false);
    mockPost.mockResolvedValue(CONNECT_OK);
    mockGet.mockResolvedValue({ data: {} });

    await service.getWorkspaceDocuments('ws-1');
    await service.getWorkspaceDocuments('ws-2');

    const connectCalls = mockPost.mock.calls.filter(([url]) => url === '/connect');
    expect(connectCalls).toHaveLength(1);
    expect(connectCalls[0][1]).toEqual({
      data: { userid: 'svc-lde', password: 'secret', library: 'FLEVOLAND' },
    });
  });

  test('fails loudly when connect succeeds but returns no session token', async () => {
    const service = makeService(false);
    mockPost.mockResolvedValue({ headers: {}, data: {} });

    await expect(service.getWorkspaceDocuments('ws-1')).rejects.toThrow(
      'eDOCS connect() succeeded but X-DM-DST token was absent from response headers'
    );
  });

  test.each([401, 403])('re-authenticates once and retries after a %s response', async (status) => {
    const service = makeService(false);
    mockPost.mockResolvedValue(CONNECT_OK);
    mockGet.mockRejectedValueOnce(httpError(status)).mockResolvedValueOnce({ data: {} });

    await expect(service.getWorkspaceDocuments('ws-1')).resolves.toEqual([]);

    expect(mockPost.mock.calls.filter(([url]) => url === '/connect')).toHaveLength(2);
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  test('does not retry other HTTP errors', async () => {
    const service = makeService(false);
    mockPost.mockResolvedValue(CONNECT_OK);
    mockGet.mockRejectedValue(httpError(500));

    await expect(service.getWorkspaceDocuments('ws-1')).rejects.toThrow(
      'Request failed with status code 500'
    );
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  test('does not retry a non-HTTP failure', async () => {
    const service = makeService(false);
    mockPost.mockResolvedValue(CONNECT_OK);
    mockGet.mockRejectedValue(new Error('socket hang up'));

    await expect(service.getWorkspaceDocuments('ws-1')).rejects.toThrow('socket hang up');
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  test('a second 401 on the retry propagates rather than looping', async () => {
    const service = makeService(false);
    mockPost.mockResolvedValue(CONNECT_OK);
    mockGet.mockRejectedValue(httpError(401));

    await expect(service.getWorkspaceDocuments('ws-1')).rejects.toThrow(
      'Request failed with status code 401'
    );
    expect(mockGet).toHaveBeenCalledTimes(2);
  });
});

describe('ensureWorkspace against a live server', () => {
  beforeEach(() => {
    mockPost.mockImplementation(async (url: string) => {
      if (url === '/connect') return CONNECT_OK;
      return { data: { data: { id: 'ws-new' } } };
    });
  });

  test('reuses an existing workspace matching the project number', async () => {
    const service = makeService(false);
    mockGet.mockResolvedValue({
      data: { data: { list: [{ id: 'ws-1', data: { DOCNAME: 'FL-042 — Bestaand' } }] } },
    });

    const result = await service.ensureWorkspace('FL-042', 'Nieuw');

    expect(result).toEqual({
      workspaceId: 'ws-1',
      workspaceName: 'FL-042 — Bestaand',
      created: false,
    });
    expect(mockGet).toHaveBeenCalledWith('/workspaces', {
      params: { library: 'FLEVOLAND', filter: "DOCNAME like 'FL-042%'", max: 1 },
    });
  });

  test('creates a workspace when none matches, using the naming convention', async () => {
    const service = makeService(false);
    mockGet.mockResolvedValue({ data: { data: { list: [] } } });

    const result = await service.ensureWorkspace('FL-042', 'Herinrichting N305');

    expect(result).toEqual({
      workspaceId: 'ws-new',
      workspaceName: 'FL-042 — Herinrichting N305',
      created: true,
    });
    expect(mockPost).toHaveBeenCalledWith(
      '/workspaces',
      {
        data: {
          DOCNAME: 'FL-042 — Herinrichting N305',
          AUTHOR_ID: 'svc-lde',
          APP_ID: 'INFRA',
        },
      },
      { params: { library: 'FLEVOLAND' } }
    );
  });

  test('treats a response with no list as "no existing workspace"', async () => {
    const service = makeService(false);
    mockGet.mockResolvedValue({ data: {} });

    const result = await service.ensureWorkspace('FL-042', 'Project');

    expect(result.created).toBe(true);
  });

  test('accepts a create response that returns the id at the top level', async () => {
    const service = makeService(false);
    mockGet.mockResolvedValue({ data: { data: { list: [] } } });
    mockPost.mockImplementation(async (url: string) => {
      if (url === '/connect') return CONNECT_OK;
      return { data: { id: 'ws-flat' } };
    });

    const result = await service.ensureWorkspace('FL-042', 'Project');

    expect(result.workspaceId).toBe('ws-flat');
  });
});

describe('uploadDocument against a live server', () => {
  function postedBody() {
    const call = mockPost.mock.calls.find(([url]) => url === '/documents');
    if (!call) throw new Error('no POST /documents was recorded');
    return call[1] as { file: string; data: Record<string, unknown> };
  }

  beforeEach(() => {
    mockPost.mockImplementation(async (url: string) => {
      if (url === '/connect') return CONNECT_OK;
      return { data: { data: { id: 'doc-1', DOCNUMBER: 'FL-2025-001234' } } };
    });
  });

  test('uploads the base64 content with the eDOCS profile fields', async () => {
    const service = makeService(false);

    const result = await service.uploadDocument('42', 'report.pdf', 'JVBERi0=', {
      docName: 'Rapport',
    });

    expect(result).toEqual({
      documentId: 'doc-1',
      documentNumber: 'FL-2025-001234',
      workspaceId: '42',
    });
    expect(postedBody().file).toBe('JVBERi0=');
    expect(postedBody().data).toMatchObject({
      DOCNAME: 'Rapport',
      AUTHOR_ID: 'svc-lde',
      TYPIST_ID: 'svc-lde',
      APP_ID: 'INFRA',
    });
  });

  test('honours an explicit APP_ID', async () => {
    const service = makeService(false);

    await service.uploadDocument('42', 'r.pdf', 'x', { docName: 'R', appId: 'ACROBAT' });

    expect(postedBody().data.APP_ID).toBe('ACROBAT');
  });

  test('links the document to the workspace by numeric id', async () => {
    const service = makeService(false);

    await service.uploadDocument('42', 'r.pdf', 'x', { docName: 'R' });

    expect(postedBody().data._restapi).toEqual({
      ref: { type: 'workspace', id: 42, lib: 'FLEVOLAND' },
    });
  });

  test('includes the form name in the _restapi block when one is given', async () => {
    const service = makeService(false);

    await service.uploadDocument('42', 'r.pdf', 'x', { docName: 'R', formName: 'INFRAPROF' });

    expect(postedBody().data._restapi).toEqual({
      form_name: 'INFRAPROF',
      ref: { type: 'workspace', id: 42, lib: 'FLEVOLAND' },
    });
  });

  test('passes arbitrary extra profile fields through', async () => {
    const service = makeService(false);

    await service.uploadDocument('42', 'r.pdf', 'x', {
      docName: 'R',
      extra: { ZAAKNUMMER: 'Z-1', AFDELING: 'INFRA' },
    });

    expect(postedBody().data).toMatchObject({ ZAAKNUMMER: 'Z-1', AFDELING: 'INFRA' });
  });

  test('falls back to the document id when eDOCS returns no DOCNUMBER', async () => {
    const service = makeService(false);
    mockPost.mockImplementation(async (url: string) => {
      if (url === '/connect') return CONNECT_OK;
      return { data: { id: 'doc-flat' } };
    });

    const result = await service.uploadDocument('42', 'r.pdf', 'x', { docName: 'R' });

    expect(result).toEqual({
      documentId: 'doc-flat',
      documentNumber: 'doc-flat',
      workspaceId: '42',
    });
  });
});

describe('getWorkspaceDocuments against a live server', () => {
  beforeEach(() => {
    mockPost.mockResolvedValue(CONNECT_OK);
  });

  test('normalises the eDOCS list into id, name and document number', async () => {
    const service = makeService(false);
    mockGet.mockResolvedValue({
      data: {
        data: {
          list: [
            { id: 'd1', data: { DOCNAME: 'Rapport', DOCNUMBER: 'FL-1' } },
            { id: 'd2', data: { DOCNAME: 'Bijlage', DOCNUMBER: 'FL-2' } },
          ],
        },
      },
    });

    await expect(service.getWorkspaceDocuments('ws-1')).resolves.toEqual([
      { id: 'd1', name: 'Rapport', documentNumber: 'FL-1' },
      { id: 'd2', name: 'Bijlage', documentNumber: 'FL-2' },
    ]);
    expect(mockGet).toHaveBeenCalledWith('/workspaces/ws-1/documents', {
      params: { library: 'FLEVOLAND' },
    });
  });

  test('returns an empty list when the workspace has no documents', async () => {
    const service = makeService(false);
    mockGet.mockResolvedValue({ data: {} });

    await expect(service.getWorkspaceDocuments('ws-1')).resolves.toEqual([]);
  });
});

describe('healthCheck against a live server', () => {
  test('reports up with a measured latency', async () => {
    const service = makeService(false);
    mockGet.mockResolvedValue({ data: {} });

    const result = await service.healthCheck();

    expect(result.status).toBe('up');
    expect(result.latency).toBeGreaterThanOrEqual(0);
    expect(mockGet).toHaveBeenCalledWith('/libraries');
  });

  test('reports down with the reason instead of throwing', async () => {
    const service = makeService(false);
    mockGet.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(service.healthCheck()).resolves.toEqual({
      status: 'down',
      error: 'ECONNREFUSED',
    });
  });

  test('does not require an authenticated session', async () => {
    const service = makeService(false);
    mockGet.mockResolvedValue({ data: {} });

    await service.healthCheck();

    expect(mockPost).not.toHaveBeenCalled();
  });
});
