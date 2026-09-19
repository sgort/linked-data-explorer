import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// getDeployTarget caches its result in a module-level promise for the whole
// session, with no exported reset hook (#165) -- vi.resetModules() plus a
// fresh dynamic import gives each test its own, un-cached instance.
beforeEach(() => {
  vi.resetModules();
});

async function importService() {
  return import('./deployTargetService');
}

describe('getDeployTarget', () => {
  test('resolves the operatonUrl on success', async () => {
    server.use(
      http.get('*/v1/dmns/process/deploy-target', () =>
        HttpResponse.json({
          success: true,
          data: { operatonUrl: 'https://operaton.example.org/engine-rest' },
          timestamp: '2026-09-19T00:00:00.000Z',
        })
      )
    );

    const { getDeployTarget } = await importService();
    expect(await getDeployTarget()).toBe('https://operaton.example.org/engine-rest');
  });

  test('resolves null on a non-ok response (e.g. 503, no Operaton configured)', async () => {
    server.use(
      http.get('*/v1/dmns/process/deploy-target', () =>
        HttpResponse.json(
          { type: 'about:blank', status: 503, title: 'Operaton not configured', detail: 'x' },
          { status: 503 }
        )
      )
    );

    const { getDeployTarget } = await importService();
    expect(await getDeployTarget()).toBeNull();
  });

  test('resolves null when the request fails outright (backend unreachable)', async () => {
    server.use(http.get('*/v1/dmns/process/deploy-target', () => HttpResponse.error()));

    const { getDeployTarget } = await importService();
    expect(await getDeployTarget()).toBeNull();
  });

  test('caches the result for the session: a second call does not refetch', async () => {
    let calls = 0;
    server.use(
      http.get('*/v1/dmns/process/deploy-target', () => {
        calls += 1;
        return HttpResponse.json({
          success: true,
          data: { operatonUrl: 'https://operaton.example.org/engine-rest' },
          timestamp: '2026-09-19T00:00:00.000Z',
        });
      })
    );

    const { getDeployTarget } = await importService();
    await getDeployTarget();
    await getDeployTarget();

    expect(calls).toBe(1);
  });

  test('does not cache a failure: the next call asks again once the backend is back', async () => {
    let calls = 0;
    server.use(
      http.get('*/v1/dmns/process/deploy-target', () => {
        calls += 1;
        if (calls === 1) return HttpResponse.error();
        return HttpResponse.json({
          success: true,
          data: { operatonUrl: 'https://operaton.example.org/engine-rest' },
          timestamp: '2026-09-19T00:00:00.000Z',
        });
      })
    );

    const { getDeployTarget } = await importService();
    expect(await getDeployTarget()).toBeNull();
    expect(await getDeployTarget()).toBe('https://operaton.example.org/engine-rest');
    expect(calls).toBe(2);
  });
});
