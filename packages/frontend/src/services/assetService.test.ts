import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest';

import { fetchAssets, fetchVariableHints } from './assetService';

const server = setupServer();

// fetchAssets caches per (account, dataset) in a module-level Map with no
// exported reset hook — each test uses its own dataset name so tests never
// share (and pollute) a cache entry.
function endpointFor(dataset: string): string {
  return `https://api.open-regels.triply.cc/datasets/stevengort/${dataset}/services/${dataset}/sparql`;
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('fetchAssets', () => {
  test('fetches and returns assets on success', async () => {
    server.use(
      http.get('*/v1/triplydb/assets', () =>
        HttpResponse.json({
          success: true,
          assets: [{ id: 'a1', name: 'logo.png', url: 'x', size: 1, contentType: 'image/png' }],
        })
      )
    );

    const result = await fetchAssets(endpointFor('ds-success'));
    expect(result).toEqual([
      { id: 'a1', name: 'logo.png', url: 'x', size: 1, contentType: 'image/png' },
    ]);
  });

  test('returns [] when the endpoint cannot be parsed, without fetching', async () => {
    let called = false;
    server.use(
      http.get('*/v1/triplydb/assets', () => {
        called = true;
        return HttpResponse.json({ success: true, assets: [] });
      })
    );
    expect(await fetchAssets('not-a-valid-endpoint')).toEqual([]);
    expect(called).toBe(false);
  });

  test('returns [] on a non-ok response', async () => {
    server.use(
      http.get(
        '*/v1/triplydb/assets',
        () => new HttpResponse(null, { status: 500, statusText: 'Internal Server Error' })
      )
    );
    expect(await fetchAssets(endpointFor('ds-non-ok'))).toEqual([]);
  });

  test('returns [] (not a throw) when the fetch itself fails', async () => {
    server.use(http.get('*/v1/triplydb/assets', () => HttpResponse.error()));
    expect(await fetchAssets(endpointFor('ds-fetch-fails'))).toEqual([]);
  });

  test('caches results — a second call within the TTL does not re-fetch', async () => {
    let calls = 0;
    server.use(
      http.get('*/v1/triplydb/assets', () => {
        calls += 1;
        return HttpResponse.json({ success: true, assets: [] });
      })
    );
    const endpoint = endpointFor('ds-cache-hit');
    await fetchAssets(endpoint);
    await fetchAssets(endpoint);
    expect(calls).toBe(1);
  });

  test('forceRefresh bypasses the cache', async () => {
    let calls = 0;
    server.use(
      http.get('*/v1/triplydb/assets', () => {
        calls += 1;
        return HttpResponse.json({ success: true, assets: [] });
      })
    );
    const endpoint = endpointFor('ds-force-refresh');
    await fetchAssets(endpoint);
    await fetchAssets(endpoint, true);
    expect(calls).toBe(2);
  });
});

describe('fetchVariableHints', () => {
  test('returns the variable hints on success', async () => {
    server.use(
      http.get('*/v1/process/:key/variable-hints', () =>
        HttpResponse.json({ success: true, variables: [{ name: 'leeftijd', type: 'Integer' }] })
      )
    );
    expect(await fetchVariableHints('ZorgtoeslagProcess')).toEqual([
      { name: 'leeftijd', type: 'Integer' },
    ]);
  });

  test('returns [] on a non-ok response', async () => {
    server.use(
      http.get('*/v1/process/:key/variable-hints', () => new HttpResponse(null, { status: 500 }))
    );
    expect(await fetchVariableHints('ZorgtoeslagProcess')).toEqual([]);
  });

  test('returns [] (not a throw) when the fetch itself fails', async () => {
    server.use(http.get('*/v1/process/:key/variable-hints', () => HttpResponse.error()));
    expect(await fetchVariableHints('ZorgtoeslagProcess')).toEqual([]);
  });
});
