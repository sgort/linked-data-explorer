import { afterEach, describe, expect, test, vi } from 'vitest';

import { executeSparqlQuery } from './sparqlService';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('executeSparqlQuery — direct POST', () => {
  test('posts the query as form-urlencoded and returns the parsed response', async () => {
    let requestInit: RequestInit | undefined;
    global.fetch = vi.fn().mockImplementation((_url, init) => {
      requestInit = init;
      return Promise.resolve({
        ok: true,
        json: async () => ({ results: { bindings: [] } }),
      });
    });

    const result = await executeSparqlQuery('https://example.com/sparql', 'SELECT * WHERE {}');

    expect(result).toEqual({ results: { bindings: [] } });
    expect(requestInit?.method).toBe('POST');
    expect((requestInit?.headers as Record<string, string>)['Content-Type']).toBe(
      'application/x-www-form-urlencoded'
    );
  });

  test('throws with the JSON error message on a non-ok response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ message: 'Malformed query' }),
    });

    await expect(executeSparqlQuery('https://example.com/sparql', 'BAD QUERY')).rejects.toThrow(
      'Endpoint error (400): Malformed query'
    );
  });

  test('throws with the raw text when the error body is not JSON', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'plain text failure',
    });

    await expect(executeSparqlQuery('https://example.com/sparql', 'x')).rejects.toThrow(
      'Endpoint error (500): plain text failure'
    );
  });
});

describe('executeSparqlQuery — CORS proxy fallback', () => {
  test('auto-retries via the allorigins proxy on a TypeError for a remote endpoint', async () => {
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation((url: string) => {
      callCount += 1;
      if (!String(url).includes('allorigins')) {
        return Promise.reject(new TypeError('Failed to fetch'));
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ contents: JSON.stringify({ results: { bindings: [] } }) }),
      });
    });

    const result = await executeSparqlQuery('https://remote.example.com/sparql', 'SELECT *');

    expect(result).toEqual({ results: { bindings: [] } });
    expect(callCount).toBe(2);
  });

  test('does NOT retry via proxy for a localhost endpoint', async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(executeSparqlQuery('http://localhost:3030/sparql', 'SELECT *')).rejects.toThrow(
      /Jena Fuseki\/TripleDB is running/
    );
  });

  test('throws when the proxy itself is unreachable', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (String(url).includes('allorigins')) {
        return Promise.resolve({ ok: false });
      }
      return Promise.reject(new TypeError('Failed to fetch'));
    });

    await expect(
      executeSparqlQuery('https://remote.example.com/sparql', 'SELECT *')
    ).rejects.toThrow('CORS Proxy failed to reach the endpoint.');
  });

  test('throws when the proxy returns no contents', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (String(url).includes('allorigins')) {
        return Promise.resolve({ ok: true, json: async () => ({}) });
      }
      return Promise.reject(new TypeError('Failed to fetch'));
    });

    await expect(
      executeSparqlQuery('https://remote.example.com/sparql', 'SELECT *')
    ).rejects.toThrow('Proxy returned empty content');
  });
});

describe('executeSparqlQuery — non-network errors', () => {
  test('rethrows an error that is not a network-failure shape', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('something else entirely'));

    await expect(
      executeSparqlQuery('https://remote.example.com/sparql', 'SELECT *')
    ).rejects.toThrow('something else entirely');
  });
});
