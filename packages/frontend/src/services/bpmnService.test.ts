// @vitest-environment jsdom
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

// #163: signed in as an lde-author unless a test says otherwise.
const authMock = vi.hoisted(() => ({
  state: { ready: true, signedIn: true, isAuthor: true, name: 'Test' } as {
    ready: boolean;
    signedIn: boolean;
    isAuthor: boolean;
    name?: string;
  },
}));
vi.mock('./auth', () => ({
  getAuthState: () => authMock.state,
  subscribe: () => () => undefined,
  authHeaders: async (): Promise<Record<string, string>> =>
    authMock.state.isAuthor ? { Authorization: 'Bearer test-token' } : {},
}));
const AUTHOR = { ready: true, signedIn: true, isAuthor: true, name: 'Test' };
const SIGNED_OUT = { ready: true, signedIn: false, isAuthor: false };

import { BpmnProcess } from '../types';
import { BpmnService } from './bpmnService';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

beforeEach(() => {
  localStorage.clear();
});

function process(overrides: Partial<BpmnProcess> = {}): BpmnProcess {
  return {
    id: 'p1',
    name: 'Zorgtoeslag',
    xml: '<bpmn/>',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    linkedDmnTemplates: [],
    ...overrides,
  };
}

describe('BpmnService.getProcesses / getProcess', () => {
  test('returns [] / null when nothing is stored', () => {
    expect(BpmnService.getProcesses()).toEqual([]);
    expect(BpmnService.getProcess('p1')).toBeNull();
  });

  test('returns stored processes after saveProcess', () => {
    server.use(http.post('*/v1/assets/bpmn', () => HttpResponse.json({ success: true })));
    BpmnService.saveProcess(process());
    expect(BpmnService.getProcesses()).toEqual([process()]);
    expect(BpmnService.getProcess('p1')).toEqual(process());
  });
});

describe('BpmnService.saveProcess', () => {
  test('updates an existing process in place rather than duplicating it', () => {
    server.use(http.post('*/v1/assets/bpmn', () => HttpResponse.json({ success: true })));
    BpmnService.saveProcess(process());
    BpmnService.saveProcess(process({ name: 'v2' }));

    const stored = BpmnService.getProcesses();
    expect(stored).toHaveLength(1);
    expect(stored[0].name).toBe('v2');
  });

  test('background POST defaults bpmnProcessId and processRole when omitted', async () => {
    let body: Record<string, unknown> | undefined;
    server.use(
      http.post('*/v1/assets/bpmn', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ success: true });
      })
    );
    BpmnService.saveProcess(process());
    await vi.waitFor(() =>
      expect(body).toMatchObject({ bpmnProcessId: 'unknown', processRole: 'standalone' })
    );
  });

  test('does not POST for a readonly process', async () => {
    let posted = false;
    server.use(
      http.post('*/v1/assets/bpmn', () => {
        posted = true;
        return HttpResponse.json({ success: true });
      })
    );
    const saved = await BpmnService.saveProcess(process({ readonly: true }));
    expect(posted).toBe(false);
    expect(saved).toBe(true);
  });

  test('resolves true when the background POST succeeds', async () => {
    server.use(http.post('*/v1/assets/bpmn', () => HttpResponse.json({ success: true })));
    expect(await BpmnService.saveProcess(process())).toBe(true);
  });

  // The defect this covers (#155): the write was previously an unawaited,
  // swallowed fetch — a caller had no way to learn it failed, so a process
  // could report "saved" while nothing was actually stored.
  test('resolves false, rather than throwing, when the background POST fails', async () => {
    server.use(
      http.post(
        '*/v1/assets/bpmn',
        () => new HttpResponse(JSON.stringify({ success: false }), { status: 500 })
      )
    );
    expect(await BpmnService.saveProcess(process())).toBe(false);
  });

  test('resolves false when the request itself throws (network failure)', async () => {
    server.use(http.post('*/v1/assets/bpmn', () => HttpResponse.error()));
    expect(await BpmnService.saveProcess(process())).toBe(false);
  });

  test('still writes to localStorage even when the background POST fails', async () => {
    server.use(
      http.post(
        '*/v1/assets/bpmn',
        () => new HttpResponse(JSON.stringify({ success: false }), { status: 500 })
      )
    );
    await BpmnService.saveProcess(process());
    expect(BpmnService.getProcesses()).toEqual([process()]);
  });
});

describe('BpmnService.saveProcessDetailed (#171)', () => {
  const taken = {
    type: 'about:blank',
    status: 409,
    title: 'Process id already in use',
    code: 'PROCESS_ID_TAKEN',
    detail: 'Process id "AwbShellProcess" is already used by "AWB" (example_awb_process)',
    bpmnProcessId: 'AwbShellProcess',
    organization: 'flevoland',
    existing: { id: 'example_awb_process', name: 'AWB', status: 'example' },
  };

  test('reports the process that holds the id when the backend answers 409 PROCESS_ID_TAKEN', async () => {
    server.use(http.post('*/v1/assets/bpmn', () => HttpResponse.json(taken, { status: 409 })));
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const outcome = await BpmnService.saveProcessDetailed(process());

    expect(outcome).toEqual({
      saved: false,
      conflict: {
        bpmnProcessId: 'AwbShellProcess',
        organization: 'flevoland',
        existing: { id: 'example_awb_process', name: 'AWB', status: 'example' },
      },
    });
    // saveProcess keeps answering a plain boolean.
    expect(await BpmnService.saveProcess(process())).toBe(false);
  });

  test('treats any other 409 as an ordinary failure, without a conflict', async () => {
    server.use(
      http.post('*/v1/assets/bpmn', () => HttpResponse.json({ code: 'OTHER' }, { status: 409 }))
    );
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(await BpmnService.saveProcessDetailed(process())).toEqual({ saved: false });
  });

  test('reports saved: true on success', async () => {
    server.use(http.post('*/v1/assets/bpmn', () => HttpResponse.json({ success: true })));

    expect(await BpmnService.saveProcessDetailed(process())).toEqual({ saved: true });
  });
});

describe('BpmnService.forgetLocal', () => {
  test('drops the process from localStorage without contacting the server', () => {
    localStorage.setItem(
      'linkedDataExplorer_bpmnProcesses',
      JSON.stringify([process(), process({ id: 'p2' })])
    );

    // onUnhandledRequest: 'error' would fail this test on any request.
    BpmnService.forgetLocal('p1');

    expect(BpmnService.getProcesses().map((p) => p.id)).toEqual(['p2']);
  });
});

describe('BpmnService.deleteProcess', () => {
  test('removes the process from localStorage and fires a background DELETE', async () => {
    server.use(http.post('*/v1/assets/bpmn', () => HttpResponse.json({ success: true })));
    BpmnService.saveProcess(process());

    let deleted = false;
    server.use(
      http.delete('*/v1/assets/bpmn/:id', () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      })
    );
    BpmnService.deleteProcess('p1');

    expect(BpmnService.getProcesses()).toEqual([]);
    await vi.waitFor(() => expect(deleted).toBe(true));
  });
});

describe('BpmnService.hydrateFromServer', () => {
  test('merges local readonly examples with server data', async () => {
    server.use(http.post('*/v1/assets/bpmn', () => HttpResponse.json({ success: true })));
    BpmnService.saveProcess(process({ id: 'example-1', readonly: true }));

    server.use(
      http.get('*/v1/assets/bpmn', () =>
        HttpResponse.json({ data: [process({ id: 'server-1', name: 'From server' })] })
      )
    );

    const result = await BpmnService.hydrateFromServer();
    expect(result.map((p) => p.id).sort()).toEqual(['example-1', 'server-1']);
  });

  test('falls back to localStorage when the server request fails', async () => {
    server.use(http.post('*/v1/assets/bpmn', () => HttpResponse.json({ success: true })));
    BpmnService.saveProcess(process());
    server.use(http.get('*/v1/assets/bpmn', () => new HttpResponse(null, { status: 500 })));

    expect(await BpmnService.hydrateFromServer()).toEqual([process()]);
  });
});

describe('BpmnService — saving signed out keeps the process in this browser (#163)', () => {
  afterEach(() => {
    authMock.state = AUTHOR;
  });

  test('a signed-out save does not call the backend and marks the process local-only', async () => {
    authMock.state = SIGNED_OUT;
    // msw answers any request with an error (onUnhandledRequest: 'error').
    const outcome = await BpmnService.saveProcessDetailed(process());
    expect(outcome).toEqual({ saved: true, localOnly: true });
    expect(BpmnService.getProcess('p1')?.localOnly).toBe(true);
  });

  test("an author's save sends the token and clears the local-only mark", async () => {
    let auth: string | null = null;
    server.use(
      http.post('*/v1/assets/bpmn', ({ request }) => {
        auth = request.headers.get('Authorization');
        return HttpResponse.json({ data: { id: 'p1' } });
      })
    );
    const outcome = await BpmnService.saveProcessDetailed(process({ localOnly: true }));
    expect(outcome).toEqual({ saved: true });
    expect(auth).toBe('Bearer test-token');
    expect(BpmnService.getProcess('p1')?.localOnly).toBeUndefined();
  });

  test('hydration keeps a local-only process the server does not have', async () => {
    localStorage.setItem(
      'linkedDataExplorer_bpmnProcesses',
      JSON.stringify([process({ id: 'mine', localOnly: true })])
    );
    server.use(
      http.get('*/v1/assets/bpmn', () => HttpResponse.json({ data: [process({ id: 's1' })] }))
    );
    const all = await BpmnService.hydrateFromServer();
    expect(all.map((p) => p.id).sort()).toEqual(['mine', 's1']);
  });

  test('hydration lets the server copy win over a local-only one with the same id', async () => {
    localStorage.setItem(
      'linkedDataExplorer_bpmnProcesses',
      JSON.stringify([process({ id: 'p1', name: 'Mine', localOnly: true })])
    );
    server.use(
      http.get('*/v1/assets/bpmn', () =>
        HttpResponse.json({ data: [process({ id: 'p1', name: 'Shared' })] })
      )
    );
    const all = await BpmnService.hydrateFromServer();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ id: 'p1', name: 'Shared' });
    expect(all[0].localOnly).toBeUndefined();
  });

  test('a signed-out delete of a local-only process stays local', () => {
    authMock.state = SIGNED_OUT;
    localStorage.setItem(
      'linkedDataExplorer_bpmnProcesses',
      JSON.stringify([process({ localOnly: true })])
    );
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    fetchSpy.mockClear();
    BpmnService.deleteProcess('p1');
    expect(BpmnService.getProcess('p1')).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test('a signed-out delete of a shared process changes nothing', () => {
    authMock.state = SIGNED_OUT;
    localStorage.setItem('linkedDataExplorer_bpmnProcesses', JSON.stringify([process()]));
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    fetchSpy.mockClear();
    BpmnService.deleteProcess('p1');
    expect(BpmnService.getProcess('p1')).not.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
