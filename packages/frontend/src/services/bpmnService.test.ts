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
    BpmnService.saveProcess(process({ readonly: true }));
    await new Promise((r) => setTimeout(r, 10));
    expect(posted).toBe(false);
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
