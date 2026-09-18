jest.mock('../utils/logger', () => ({
  __esModule: true,
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

const mockRequest = jest.fn();
jest.mock('../utils/outboundHttp', () => ({
  createOutboundClient: () => ({ request: (...args: unknown[]) => mockRequest(...args) }),
}));

import {
  constructGraph,
  executeQuery,
  listGraphs,
  testConnection,
  updateService,
} from './triplydb.service';

const CONFIG = {
  baseUrl: 'https://api.open-regels.triply.cc',
  account: 'stevengort',
  dataset: 'PublishTest',
  apiToken: 'tok-1',
};

/** Minimal stand-in for what client.request() resolves to (axios response shape). */
function reply(status: number, body: unknown = '', statusText = '') {
  return { status, statusText, data: typeof body === 'string' ? body : JSON.stringify(body) };
}

/** A rejection shaped like OutboundRefusedError, as the guard throws it. */
function guardRefusal(message: string) {
  return Object.assign(new Error(message), { code: 'EOUTBOUNDREFUSED' });
}

beforeEach(() => {
  mockRequest.mockReset();
});

describe('executeQuery', () => {
  test('POSTs the query with SPARQL content negotiation and returns the results', async () => {
    const body = { results: { bindings: [{ s: { value: 'x' } }] } };
    mockRequest.mockResolvedValue(reply(200, body));

    const result = await executeQuery(
      'https://triplydb.example/sparql',
      'SELECT * WHERE {?s ?p ?o}'
    );

    expect(result).toEqual(body);
    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://triplydb.example/sparql',
        method: 'POST',
        data: 'SELECT * WHERE {?s ?p ?o}',
        headers: {
          'Content-Type': 'application/sparql-query',
          Accept: 'application/sparql-results+json',
        },
      })
    );
  });

  test('handles an ASK-style result with no bindings array', async () => {
    mockRequest.mockResolvedValue(reply(200, { boolean: true }));

    await expect(executeQuery('e', 'ASK {?s ?p ?o}')).resolves.toEqual({ boolean: true });
  });

  test('wraps a non-OK response, keeping the status and upstream body', async () => {
    mockRequest.mockResolvedValue(reply(400, 'malformed query', 'Bad Request'));

    await expect(executeQuery('e', 'SELECT')).rejects.toThrow(
      'Failed to execute query: Query failed: 400 malformed query'
    );
  });

  test('wraps a transport failure', async () => {
    mockRequest.mockRejectedValue(new Error('ENOTFOUND'));

    await expect(executeQuery('e', 'q')).rejects.toThrow('Failed to execute query: ENOTFOUND');
  });

  test('surfaces a refusal from the guard', async () => {
    mockRequest.mockRejectedValue(guardRefusal('x.example resolves to an internal address'));

    await expect(executeQuery('https://x.example/sparql', 'q')).rejects.toThrow(
      'Failed to execute query: x.example resolves to an internal address'
    );
  });
});

describe('constructGraph', () => {
  test('negotiates Turtle and returns the serialised graph', async () => {
    mockRequest.mockResolvedValue(reply(200, '<a> <b> <c> .'));

    const turtle = await constructGraph(
      'https://triplydb.example/sparql',
      'CONSTRUCT WHERE {?s ?p ?o}'
    );

    expect(turtle).toBe('<a> <b> <c> .');
    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://triplydb.example/sparql',
        method: 'POST',
        data: 'CONSTRUCT WHERE {?s ?p ?o}',
        headers: { 'Content-Type': 'application/sparql-query', Accept: 'text/turtle' },
      })
    );
  });

  test('returns an empty string when the closure is empty', async () => {
    mockRequest.mockResolvedValue(reply(200, ''));

    await expect(constructGraph('e', 'CONSTRUCT')).resolves.toBe('');
  });

  test('wraps a non-OK response', async () => {
    mockRequest.mockResolvedValue(reply(500, 'server error'));

    await expect(constructGraph('e', 'CONSTRUCT')).rejects.toThrow(
      'Failed to execute CONSTRUCT: CONSTRUCT failed: 500 server error'
    );
  });

  test('wraps a transport failure', async () => {
    mockRequest.mockRejectedValue(new Error('socket hang up'));

    await expect(constructGraph('e', 'CONSTRUCT')).rejects.toThrow(
      'Failed to execute CONSTRUCT: socket hang up'
    );
  });
});

describe('listGraphs', () => {
  test('authenticates and reads a bare array response', async () => {
    mockRequest.mockResolvedValue(reply(200, [{ graphName: 'graph:a' }, { name: 'graph:b' }]));

    const graphs = await listGraphs(CONFIG);

    expect(graphs).toEqual(['graph:a', 'graph:b']);
    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://api.open-regels.triply.cc/datasets/stevengort/PublishTest/graphs',
        method: 'GET',
        headers: { Authorization: 'Bearer tok-1', Accept: 'application/json' },
      })
    );
  });

  test('reads a { graphs: [...] } envelope too', async () => {
    mockRequest.mockResolvedValue(reply(200, { graphs: [{ graphName: 'graph:a' }] }));

    await expect(listGraphs(CONFIG)).resolves.toEqual(['graph:a']);
  });

  test('falls back to the stringified entry when a graph names itself neither way', async () => {
    mockRequest.mockResolvedValue(reply(200, [{ id: 'g-1' }]));

    await expect(listGraphs(CONFIG)).resolves.toEqual(['[object Object]']);
  });

  test('prefers graphName over name when both are present', async () => {
    mockRequest.mockResolvedValue(
      reply(200, [{ graphName: 'graph:preferred', name: 'graph:other' }])
    );

    await expect(listGraphs(CONFIG)).resolves.toEqual(['graph:preferred']);
  });

  test('treats a missing graphs key as an empty dataset', async () => {
    mockRequest.mockResolvedValue(reply(200, {}));

    await expect(listGraphs(CONFIG)).resolves.toEqual([]);
  });

  test('wraps a non-OK response', async () => {
    mockRequest.mockResolvedValue(reply(403, 'forbidden'));

    await expect(listGraphs(CONFIG)).rejects.toThrow(
      'Failed to list graphs: Failed to fetch graphs: 403 forbidden'
    );
  });

  test('wraps a transport failure', async () => {
    mockRequest.mockRejectedValue(new Error('ECONNRESET'));

    await expect(listGraphs(CONFIG)).rejects.toThrow('Failed to list graphs: ECONNRESET');
  });
});

describe('updateService', () => {
  test('POSTs the documented sync body as the literal string "true"', async () => {
    mockRequest.mockResolvedValue(reply(200, ''));

    await updateService(CONFIG, 'PublishTest', ['graph:a', 'graph:b']);

    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://api.open-regels.triply.cc/datasets/stevengort/PublishTest/services/PublishTest',
        method: 'POST',
        data: JSON.stringify({ sync: 'true' }),
        headers: { Authorization: 'Bearer tok-1', 'Content-Type': 'application/json' },
      })
    );
  });

  test('reports the graph count from the supplied list without re-fetching', async () => {
    mockRequest.mockResolvedValue(reply(200, ''));

    const result = await updateService(CONFIG, 'PublishTest', ['graph:a', 'graph:b']);

    expect(result).toEqual({
      success: true,
      message: 'Service PublishTest updated to include 2 graphs',
      graphCount: 2,
    });
    expect(mockRequest).toHaveBeenCalledTimes(1);
  });

  test('fetches the graph list itself when none is supplied', async () => {
    mockRequest
      .mockResolvedValueOnce(reply(200, [{ graphName: 'graph:a' }, { graphName: 'graph:b' }]))
      .mockResolvedValueOnce(reply(200, ''));

    const result = await updateService(CONFIG, 'PublishTest');

    expect(result.graphCount).toBe(2);
    expect(mockRequest).toHaveBeenCalledTimes(2);
    expect(mockRequest.mock.calls[0][0]).toMatchObject({
      url: expect.stringContaining('/graphs'),
    });
  });

  test('also fetches when an empty list is supplied', async () => {
    mockRequest
      .mockResolvedValueOnce(reply(200, [{ graphName: 'graph:a' }]))
      .mockResolvedValueOnce(reply(200, ''));

    const result = await updateService(CONFIG, 'PublishTest', []);

    expect(result.graphCount).toBe(1);
    expect(mockRequest).toHaveBeenCalledTimes(2);
  });

  test('echoes the triggering graph IRI when one is given', async () => {
    mockRequest.mockResolvedValue(reply(200, ''));

    const result = await updateService(CONFIG, 'PublishTest', ['graph:a'], 'graph:trigger');

    expect(result.graphName).toBe('graph:trigger');
  });

  test('omits graphName entirely when no trigger is given', async () => {
    mockRequest.mockResolvedValue(reply(200, ''));

    const result = await updateService(CONFIG, 'PublishTest', ['graph:a']);

    expect(result).not.toHaveProperty('graphName');
  });

  test('surfaces a JSON error message from a failed sync', async () => {
    mockRequest.mockResolvedValue(reply(409, JSON.stringify({ message: 'service is busy' })));

    await expect(updateService(CONFIG, 'PublishTest', ['graph:a'])).rejects.toThrow(
      'Failed to update service: Failed to sync service: 409 service is busy'
    );
  });

  test('falls back to the error key when the payload has no message', async () => {
    mockRequest.mockResolvedValue(reply(500, JSON.stringify({ error: 'internal' })));

    await expect(updateService(CONFIG, 'PublishTest', ['graph:a'])).rejects.toThrow(
      'Failed to sync service: 500 internal'
    );
  });

  test('treats an unparseable error body as plain text', async () => {
    mockRequest.mockResolvedValue(reply(502, '<html>bad gateway'));

    await expect(updateService(CONFIG, 'PublishTest', ['graph:a'])).rejects.toThrow(
      'Failed to sync service: 502 <html>bad gateway'
    );
  });

  test('falls back to the status code when the failure body is empty', async () => {
    mockRequest.mockResolvedValue(reply(503, ''));

    await expect(updateService(CONFIG, 'PublishTest', ['graph:a'])).rejects.toThrow(
      'Failed to sync service: 503 HTTP 503'
    );
  });

  test('accepts a successful sync that returns a JSON body', async () => {
    mockRequest.mockResolvedValue(reply(200, JSON.stringify({ message: 'queued' })));

    await expect(updateService(CONFIG, 'PublishTest', ['graph:a'])).resolves.toMatchObject({
      success: true,
    });
  });

  test('wraps a transport failure', async () => {
    mockRequest.mockRejectedValue(new Error('ETIMEDOUT'));

    await expect(updateService(CONFIG, 'PublishTest', ['graph:a'])).rejects.toThrow(
      'Failed to update service: ETIMEDOUT'
    );
  });
});

describe('testConnection', () => {
  test('returns true for a reachable, authorised dataset', async () => {
    mockRequest.mockResolvedValue(reply(200, ''));

    await expect(testConnection(CONFIG)).resolves.toBe(true);
    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://api.open-regels.triply.cc/datasets/stevengort/PublishTest',
        method: 'GET',
        headers: { Authorization: 'Bearer tok-1', Accept: 'application/json' },
      })
    );
  });

  test('returns false rather than throwing when the credentials are rejected', async () => {
    mockRequest.mockResolvedValue(reply(401, ''));

    await expect(testConnection(CONFIG)).resolves.toBe(false);
  });

  test('returns false rather than throwing when the host is unreachable', async () => {
    mockRequest.mockRejectedValue(new Error('ENOTFOUND'));

    await expect(testConnection(CONFIG)).resolves.toBe(false);
  });

  test('returns false when the guard refuses the target', async () => {
    mockRequest.mockRejectedValue(guardRefusal('x.example resolves to an internal address'));

    await expect(testConnection({ ...CONFIG, baseUrl: 'https://x.example' })).resolves.toBe(false);
  });
});

// Every catch block distinguishes an Error from anything else a rejected request
// can carry (a string, a DOMException-like object). Cover the non-Error side so
// the logging fallbacks are exercised rather than assumed.
describe('non-Error transport failures', () => {
  test('executeQuery reports a rejection that is not an Error', async () => {
    mockRequest.mockRejectedValue('socket hang up');

    await expect(executeQuery('e', 'q')).rejects.toThrow('Failed to execute query:');
  });

  test('constructGraph reports a rejection that is not an Error', async () => {
    mockRequest.mockRejectedValue('socket hang up');

    await expect(constructGraph('e', 'q')).rejects.toThrow('Failed to execute CONSTRUCT:');
  });

  test('listGraphs reports a rejection that is not an Error', async () => {
    mockRequest.mockRejectedValue('socket hang up');

    await expect(listGraphs(CONFIG)).rejects.toThrow('Failed to list graphs:');
  });

  test('updateService reports a rejection that is not an Error', async () => {
    // Supply the graph list so the sync POST is the only request, and reject it.
    mockRequest.mockRejectedValue('socket hang up');

    await expect(updateService(CONFIG, 'svc', ['g1'])).rejects.toThrow('Failed to update service:');
  });

  test('testConnection returns false for a rejection that is not an Error', async () => {
    mockRequest.mockRejectedValue('socket hang up');

    await expect(testConnection(CONFIG)).resolves.toBe(false);
  });
});
