jest.mock('../utils/logger', () => ({
  __esModule: true,
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

import {
  constructGraph,
  executeQuery,
  listGraphs,
  testConnection,
  updateService,
} from './triplydb.service';

const mockFetch = jest.fn();
const realFetch = global.fetch;

const CONFIG = {
  baseUrl: 'https://api.open-regels.triply.cc',
  account: 'stevengort',
  dataset: 'PublishTest',
  apiToken: 'tok-1',
};

/** Minimal stand-in for the parts of Response these functions touch. */
function response(
  init: { ok?: boolean; status?: number; statusText?: string; json?: unknown; text?: string } = {}
) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: init.statusText ?? 'OK',
    json: async () => init.json,
    text: async () => init.text ?? '',
  };
}

beforeEach(() => {
  mockFetch.mockReset();
  global.fetch = mockFetch as unknown as typeof fetch;
});

afterAll(() => {
  global.fetch = realFetch;
});

describe('executeQuery', () => {
  test('POSTs the query with SPARQL content negotiation and returns the results', async () => {
    const body = { results: { bindings: [{ s: { value: 'x' } }] } };
    mockFetch.mockResolvedValue(response({ json: body }));

    const result = await executeQuery(
      'https://triplydb.example/sparql',
      'SELECT * WHERE {?s ?p ?o}'
    );

    expect(result).toEqual(body);
    expect(mockFetch).toHaveBeenCalledWith('https://triplydb.example/sparql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/sparql-query',
        Accept: 'application/sparql-results+json',
      },
      body: 'SELECT * WHERE {?s ?p ?o}',
    });
  });

  test('handles an ASK-style result with no bindings array', async () => {
    mockFetch.mockResolvedValue(response({ json: { boolean: true } }));

    await expect(executeQuery('e', 'ASK {?s ?p ?o}')).resolves.toEqual({ boolean: true });
  });

  test('wraps a non-OK response, keeping the status and upstream body', async () => {
    mockFetch.mockResolvedValue(
      response({ ok: false, status: 400, statusText: 'Bad Request', text: 'malformed query' })
    );

    await expect(executeQuery('e', 'SELECT')).rejects.toThrow(
      'Failed to execute query: Query failed: 400 malformed query'
    );
  });

  test('wraps a transport failure', async () => {
    mockFetch.mockRejectedValue(new Error('ENOTFOUND'));

    await expect(executeQuery('e', 'q')).rejects.toThrow('Failed to execute query: ENOTFOUND');
  });
});

describe('constructGraph', () => {
  test('negotiates Turtle and returns the serialised graph', async () => {
    mockFetch.mockResolvedValue(response({ text: '<a> <b> <c> .' }));

    const turtle = await constructGraph(
      'https://triplydb.example/sparql',
      'CONSTRUCT WHERE {?s ?p ?o}'
    );

    expect(turtle).toBe('<a> <b> <c> .');
    expect(mockFetch).toHaveBeenCalledWith('https://triplydb.example/sparql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/sparql-query', Accept: 'text/turtle' },
      body: 'CONSTRUCT WHERE {?s ?p ?o}',
    });
  });

  test('returns an empty string when the closure is empty', async () => {
    mockFetch.mockResolvedValue(response({ text: '' }));

    await expect(constructGraph('e', 'CONSTRUCT')).resolves.toBe('');
  });

  test('wraps a non-OK response', async () => {
    mockFetch.mockResolvedValue(response({ ok: false, status: 500, text: 'server error' }));

    await expect(constructGraph('e', 'CONSTRUCT')).rejects.toThrow(
      'Failed to execute CONSTRUCT: CONSTRUCT failed: 500 server error'
    );
  });

  test('wraps a transport failure', async () => {
    mockFetch.mockRejectedValue(new Error('socket hang up'));

    await expect(constructGraph('e', 'CONSTRUCT')).rejects.toThrow(
      'Failed to execute CONSTRUCT: socket hang up'
    );
  });
});

describe('listGraphs', () => {
  test('authenticates and reads a bare array response', async () => {
    mockFetch.mockResolvedValue(
      response({ json: [{ graphName: 'graph:a' }, { name: 'graph:b' }] })
    );

    const graphs = await listGraphs(CONFIG);

    expect(graphs).toEqual(['graph:a', 'graph:b']);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.open-regels.triply.cc/datasets/stevengort/PublishTest/graphs',
      { method: 'GET', headers: { Authorization: 'Bearer tok-1', Accept: 'application/json' } }
    );
  });

  test('reads a { graphs: [...] } envelope too', async () => {
    mockFetch.mockResolvedValue(response({ json: { graphs: [{ graphName: 'graph:a' }] } }));

    await expect(listGraphs(CONFIG)).resolves.toEqual(['graph:a']);
  });

  test('falls back to the stringified entry when a graph names itself neither way', async () => {
    mockFetch.mockResolvedValue(response({ json: [{ id: 'g-1' }] }));

    await expect(listGraphs(CONFIG)).resolves.toEqual(['[object Object]']);
  });

  test('prefers graphName over name when both are present', async () => {
    mockFetch.mockResolvedValue(
      response({ json: [{ graphName: 'graph:preferred', name: 'graph:other' }] })
    );

    await expect(listGraphs(CONFIG)).resolves.toEqual(['graph:preferred']);
  });

  test('treats a missing graphs key as an empty dataset', async () => {
    mockFetch.mockResolvedValue(response({ json: {} }));

    await expect(listGraphs(CONFIG)).resolves.toEqual([]);
  });

  test('wraps a non-OK response', async () => {
    mockFetch.mockResolvedValue(response({ ok: false, status: 403, text: 'forbidden' }));

    await expect(listGraphs(CONFIG)).rejects.toThrow(
      'Failed to list graphs: Failed to fetch graphs: 403 forbidden'
    );
  });

  test('wraps a transport failure', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNRESET'));

    await expect(listGraphs(CONFIG)).rejects.toThrow('Failed to list graphs: ECONNRESET');
  });
});

describe('updateService', () => {
  test('POSTs the documented sync body as the literal string "true"', async () => {
    mockFetch.mockResolvedValue(response({ text: '' }));

    await updateService(CONFIG, 'PublishTest', ['graph:a', 'graph:b']);

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.open-regels.triply.cc/datasets/stevengort/PublishTest/services/PublishTest',
      {
        method: 'POST',
        headers: { Authorization: 'Bearer tok-1', 'Content-Type': 'application/json' },
        body: JSON.stringify({ sync: 'true' }),
      }
    );
  });

  test('reports the graph count from the supplied list without re-fetching', async () => {
    mockFetch.mockResolvedValue(response({ text: '' }));

    const result = await updateService(CONFIG, 'PublishTest', ['graph:a', 'graph:b']);

    expect(result).toEqual({
      success: true,
      message: 'Service PublishTest updated to include 2 graphs',
      graphCount: 2,
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  test('fetches the graph list itself when none is supplied', async () => {
    mockFetch
      .mockResolvedValueOnce(
        response({ json: [{ graphName: 'graph:a' }, { graphName: 'graph:b' }] })
      )
      .mockResolvedValueOnce(response({ text: '' }));

    const result = await updateService(CONFIG, 'PublishTest');

    expect(result.graphCount).toBe(2);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[0][0]).toContain('/graphs');
  });

  test('also fetches when an empty list is supplied', async () => {
    mockFetch
      .mockResolvedValueOnce(response({ json: [{ graphName: 'graph:a' }] }))
      .mockResolvedValueOnce(response({ text: '' }));

    const result = await updateService(CONFIG, 'PublishTest', []);

    expect(result.graphCount).toBe(1);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  test('echoes the triggering graph IRI when one is given', async () => {
    mockFetch.mockResolvedValue(response({ text: '' }));

    const result = await updateService(CONFIG, 'PublishTest', ['graph:a'], 'graph:trigger');

    expect(result.graphName).toBe('graph:trigger');
  });

  test('omits graphName entirely when no trigger is given', async () => {
    mockFetch.mockResolvedValue(response({ text: '' }));

    const result = await updateService(CONFIG, 'PublishTest', ['graph:a']);

    expect(result).not.toHaveProperty('graphName');
  });

  test('surfaces a JSON error message from a failed sync', async () => {
    mockFetch.mockResolvedValue(
      response({ ok: false, status: 409, text: JSON.stringify({ message: 'service is busy' }) })
    );

    await expect(updateService(CONFIG, 'PublishTest', ['graph:a'])).rejects.toThrow(
      'Failed to update service: Failed to sync service: 409 service is busy'
    );
  });

  test('falls back to the error key when the payload has no message', async () => {
    mockFetch.mockResolvedValue(
      response({ ok: false, status: 500, text: JSON.stringify({ error: 'internal' }) })
    );

    await expect(updateService(CONFIG, 'PublishTest', ['graph:a'])).rejects.toThrow(
      'Failed to sync service: 500 internal'
    );
  });

  test('treats an unparseable error body as plain text', async () => {
    mockFetch.mockResolvedValue(response({ ok: false, status: 502, text: '<html>bad gateway' }));

    await expect(updateService(CONFIG, 'PublishTest', ['graph:a'])).rejects.toThrow(
      'Failed to sync service: 502 <html>bad gateway'
    );
  });

  test('falls back to the status code when the failure body is empty', async () => {
    mockFetch.mockResolvedValue(response({ ok: false, status: 503, text: '' }));

    await expect(updateService(CONFIG, 'PublishTest', ['graph:a'])).rejects.toThrow(
      'Failed to sync service: 503 HTTP 503'
    );
  });

  test('accepts a successful sync that returns a JSON body', async () => {
    mockFetch.mockResolvedValue(response({ text: JSON.stringify({ message: 'queued' }) }));

    await expect(updateService(CONFIG, 'PublishTest', ['graph:a'])).resolves.toMatchObject({
      success: true,
    });
  });

  test('wraps a transport failure', async () => {
    mockFetch.mockRejectedValue(new Error('ETIMEDOUT'));

    await expect(updateService(CONFIG, 'PublishTest', ['graph:a'])).rejects.toThrow(
      'Failed to update service: ETIMEDOUT'
    );
  });
});

describe('testConnection', () => {
  test('returns true for a reachable, authorised dataset', async () => {
    mockFetch.mockResolvedValue(response({ ok: true, status: 200 }));

    await expect(testConnection(CONFIG)).resolves.toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.open-regels.triply.cc/datasets/stevengort/PublishTest',
      { method: 'GET', headers: { Authorization: 'Bearer tok-1', Accept: 'application/json' } }
    );
  });

  test('returns false rather than throwing when the credentials are rejected', async () => {
    mockFetch.mockResolvedValue(response({ ok: false, status: 401 }));

    await expect(testConnection(CONFIG)).resolves.toBe(false);
  });

  test('returns false rather than throwing when the host is unreachable', async () => {
    mockFetch.mockRejectedValue(new Error('ENOTFOUND'));

    await expect(testConnection(CONFIG)).resolves.toBe(false);
  });
});

// Every catch block distinguishes an Error from anything else a rejected fetch
// can carry (a string, a DOMException-like object). Cover the non-Error side so
// the logging fallbacks are exercised rather than assumed.
describe('non-Error transport failures', () => {
  test('executeQuery reports a rejection that is not an Error', async () => {
    mockFetch.mockRejectedValue('socket hang up');

    await expect(executeQuery('e', 'q')).rejects.toThrow('Failed to execute query:');
  });

  test('constructGraph reports a rejection that is not an Error', async () => {
    mockFetch.mockRejectedValue('socket hang up');

    await expect(constructGraph('e', 'q')).rejects.toThrow('Failed to execute CONSTRUCT:');
  });

  test('listGraphs reports a rejection that is not an Error', async () => {
    mockFetch.mockRejectedValue('socket hang up');

    await expect(listGraphs(CONFIG)).rejects.toThrow('Failed to list graphs:');
  });

  test('updateService reports a rejection that is not an Error', async () => {
    // Supply the graph list so the sync POST is the only fetch, and reject it.
    mockFetch.mockRejectedValue('socket hang up');

    await expect(updateService(CONFIG, 'svc', ['g1'])).rejects.toThrow('Failed to update service:');
  });

  test('testConnection returns false for a rejection that is not an Error', async () => {
    mockFetch.mockRejectedValue('socket hang up');

    await expect(testConnection(CONFIG)).resolves.toBe(false);
  });
});
