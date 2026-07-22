import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { clearLogoCache, prefetchLogos, resolveLogo } from './logoResolver';

const ENDPOINT =
  'https://api.open-regels.triply.cc/datasets/stevengort/facts/services/facts/sparql';

function mockFetchAssets(assets: Array<{ id: string; name: string; url: string }>) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    statusText: 'OK',
    json: async () => ({ success: true, assets, count: assets.length }),
  });
}

beforeEach(() => {
  clearLogoCache();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('resolveLogo', () => {
  test('returns null when no path is provided', async () => {
    expect(await resolveLogo(null, ENDPOINT)).toBeNull();
    expect(await resolveLogo(undefined, ENDPOINT)).toBeNull();
    expect(await resolveLogo('', ENDPOINT)).toBeNull();
  });

  test('returns a complete TriplyDB versioned URL as-is, no fetch', async () => {
    global.fetch = vi.fn();
    const completeUrl = 'https://api.open-regels.triply.cc/datasets/acc/ds/assets/logo.png/v1abc';

    expect(await resolveLogo(completeUrl, ENDPOINT)).toBe(completeUrl);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('returns a non-TriplyDB full URL as-is, no fetch', async () => {
    global.fetch = vi.fn();
    const externalUrl = 'https://vendor-cdn.example.com/logo.png';

    expect(await resolveLogo(externalUrl, ENDPOINT)).toBe(externalUrl);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('resolves a relative path via the assets API', async () => {
    mockFetchAssets([{ id: 'a1', name: 'logo.png', url: 'https://resolved.example.com/logo.png' }]);

    const result = await resolveLogo('./assets/logo.png', ENDPOINT);

    expect(result).toBe('https://resolved.example.com/logo.png');
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/v1/triplydb/assets?account=stevengort&dataset=facts')
    );
  });

  test('resolves an incomplete TriplyDB URL (no version id) via the assets API', async () => {
    mockFetchAssets([{ id: 'a1', name: 'logo.png', url: 'https://resolved.example.com/logo.png' }]);

    const result = await resolveLogo(
      'https://open-regels.triply.cc/stevengort/facts/assets/logo.png',
      ENDPOINT
    );

    expect(result).toBe('https://resolved.example.com/logo.png');
  });

  test('returns null when no asset matches the filename', async () => {
    mockFetchAssets([
      { id: 'a1', name: 'other.png', url: 'https://resolved.example.com/other.png' },
    ]);
    expect(await resolveLogo('./assets/logo.png', ENDPOINT)).toBeNull();
  });

  test('returns null when the endpoint cannot be parsed', async () => {
    global.fetch = vi.fn();
    expect(await resolveLogo('./assets/logo.png', 'not-a-valid-endpoint')).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('returns null (not a throw) when the assets fetch fails outright', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network error'));
    expect(await resolveLogo('./assets/logo.png', ENDPOINT)).toBeNull();
  });

  test('returns [] worth of assets (null match) when the response is not ok', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, statusText: 'Internal Server Error' });
    expect(await resolveLogo('./assets/logo.png', ENDPOINT)).toBeNull();
  });

  test('caches assets per endpoint — a second call within the TTL does not re-fetch', async () => {
    mockFetchAssets([{ id: 'a1', name: 'logo.png', url: 'https://resolved.example.com/logo.png' }]);

    await resolveLogo('./assets/logo.png', ENDPOINT);
    await resolveLogo('./assets/other.png', ENDPOINT);

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('passes an apiToken through to the assets request when provided', async () => {
    mockFetchAssets([]);
    await resolveLogo('./assets/logo.png', ENDPOINT, 'secret-token');
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('apiToken=secret-token'));
  });
});

describe('clearLogoCache', () => {
  test('clearing a specific endpoint forces a re-fetch for that endpoint only', async () => {
    mockFetchAssets([{ id: 'a1', name: 'logo.png', url: 'https://resolved.example.com/logo.png' }]);

    await resolveLogo('./assets/logo.png', ENDPOINT);
    clearLogoCache(ENDPOINT);
    await resolveLogo('./assets/logo.png', ENDPOINT);

    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test('clearing all caches (no argument) forces a re-fetch for every endpoint', async () => {
    mockFetchAssets([{ id: 'a1', name: 'logo.png', url: 'https://resolved.example.com/logo.png' }]);

    await resolveLogo('./assets/logo.png', ENDPOINT);
    clearLogoCache();
    await resolveLogo('./assets/logo.png', ENDPOINT);

    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});

describe('prefetchLogos', () => {
  test('warms the cache so a subsequent resolveLogo call does not re-fetch', async () => {
    mockFetchAssets([{ id: 'a1', name: 'logo.png', url: 'https://resolved.example.com/logo.png' }]);

    await prefetchLogos(ENDPOINT);
    await resolveLogo('./assets/logo.png', ENDPOINT);

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
