import { afterEach, describe, expect, test, vi } from 'vitest';

import { executeSparqlQuery } from './sparqlService';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('executeSparqlQuery — via the backend', () => {
  test('posts to the backend triplydb query route with the endpoint and query', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://backend.example.com');
    let requestUrl: string | undefined;
    let requestInit: RequestInit | undefined;
    global.fetch = vi.fn().mockImplementation((url, init) => {
      requestUrl = String(url);
      requestInit = init;
      return Promise.resolve({
        ok: true,
        json: async () => ({ success: true, head: { vars: ['s'] }, results: { bindings: [] } }),
      });
    });

    const result = await executeSparqlQuery('https://example.com/sparql', 'SELECT * WHERE {}');

    expect(requestUrl).toBe('https://backend.example.com/v1/triplydb/query');
    expect(requestInit?.method).toBe('POST');
    expect((requestInit?.headers as Record<string, string>)['Content-Type']).toBe(
      'application/json'
    );
    expect(JSON.parse(requestInit?.body as string)).toEqual({
      endpoint: 'https://example.com/sparql',
      query: 'SELECT * WHERE {}',
    });
    // The envelope's `success` field is stripped; only the SPARQL JSON shape
    // callers expect is returned.
    expect(result).toEqual({ head: { vars: ['s'] }, results: { bindings: [] } });
  });

  test('falls back to localhost:3001 when VITE_API_BASE_URL is not set', async () => {
    vi.stubEnv('VITE_API_BASE_URL', '');
    let requestUrl: string | undefined;
    global.fetch = vi.fn().mockImplementation((url) => {
      requestUrl = String(url);
      return Promise.resolve({
        ok: true,
        json: async () => ({ success: true, results: { bindings: [] } }),
      });
    });

    await executeSparqlQuery('https://example.com/sparql', 'SELECT * WHERE {}');

    expect(requestUrl).toBe('http://localhost:3001/v1/triplydb/query');
  });

  test('never calls the endpoint directly or the allorigins proxy', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://backend.example.com');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, results: { bindings: [] } }),
    });
    global.fetch = fetchMock;

    await executeSparqlQuery('https://example.com/sparql', 'SELECT * WHERE {}');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl] = fetchMock.mock.calls[0];
    expect(String(calledUrl)).not.toContain('example.com/sparql');
    expect(String(calledUrl)).not.toContain('allorigins');
  });

  test('throws with the backend problem detail on a non-OK response (e.g. a refused endpoint)', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://backend.example.com');
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        type: 'about:blank',
        status: 400,
        title: 'Invalid request',
        detail: 'endpoint must use https: on this environment',
        instance: '/v1/triplydb/query',
        code: 'INVALID_INPUT',
      }),
    });

    await expect(
      executeSparqlQuery('http://internal.example.com/sparql', 'SELECT * WHERE {}')
    ).rejects.toThrow('endpoint must use https: on this environment');
  });

  test('falls back to a generic message when the error body has no detail', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://backend.example.com');
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    });

    await expect(
      executeSparqlQuery('https://example.com/sparql', 'SELECT * WHERE {}')
    ).rejects.toThrow(/500/);
  });

  test('falls back to the generic message on a non-OK response with a non-JSON body (e.g. a 502 from an intermediary)', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://backend.example.com');
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => {
        throw new SyntaxError('Unexpected token \'<\', "<html>..." is not valid JSON');
      },
    });

    await expect(
      executeSparqlQuery('https://example.com/sparql', 'SELECT * WHERE {}')
    ).rejects.toThrow('Query failed (502).');
  });

  test('rethrows a network-level failure (no problem body to read)', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://backend.example.com');
    global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(
      executeSparqlQuery('https://example.com/sparql', 'SELECT * WHERE {}')
    ).rejects.toThrow('Failed to fetch');
  });
});
