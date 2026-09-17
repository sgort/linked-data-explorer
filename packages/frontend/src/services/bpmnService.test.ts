// @vitest-environment jsdom
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

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
