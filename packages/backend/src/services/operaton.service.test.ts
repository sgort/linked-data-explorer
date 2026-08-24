import axios from 'axios';

jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
// The module exports a singleton, so axios.create() runs at import time — the
// client stub has to exist inside the factory rather than be wired up later.
jest.mock('axios', () => {
  const client = {
    get: jest.fn(),
    post: jest.fn(),
    interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } },
  };
  return { __esModule: true, default: { create: jest.fn(() => client) } };
});

const configMock = {
  operaton: {
    baseUrl: 'http://localhost:8080/engine-rest',
    timeout: 10000,
    apiKey: undefined as string | undefined,
  },
};
jest.mock('../utils/config', () => ({
  __esModule: true,
  config: configMock,
  default: configMock,
}));

import logger from '../utils/logger';
import { OperatonService, operatonService } from './operaton.service';

const mockCreate = axios.create as jest.Mock;
const client = mockCreate.mock.results[0].value as {
  get: jest.Mock;
  post: jest.Mock;
  interceptors: {
    request: { use: jest.Mock };
    response: { use: jest.Mock };
  };
};
const mockGet = client.get;
const mockPost = client.post;
const mockLogError = logger.error as jest.Mock;
const mockLogWarn = logger.warn as jest.Mock;

/** An axios-shaped rejection, as the service's error branches detect it. */
function axiosError(status: number, data?: unknown) {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    isAxiosError: true,
    response: { status, data },
  });
}

function formBody(call: unknown[]): string {
  return (call[1] as { getBuffer: () => Buffer }).getBuffer().toString('utf-8');
}

beforeEach(() => {
  mockGet.mockReset();
  mockPost.mockReset();
  mockCreate.mockClear();
  client.interceptors.request.use.mockClear();
  client.interceptors.response.use.mockClear();
  mockLogError.mockReset();
  mockLogWarn.mockReset();
  configMock.operaton.apiKey = undefined;
});

describe('construction', () => {
  test('binds the client to the configured Operaton base URL', () => {
    new OperatonService();

    expect(mockCreate).toHaveBeenCalledWith({
      baseURL: 'http://localhost:8080/engine-rest',
      timeout: 10000,
      headers: { 'Content-Type': 'application/json' },
    });
  });

  test('adds a bearer header only when an API key is configured', () => {
    configMock.operaton.apiKey = 'key-1';

    new OperatonService();

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer key-1' },
      })
    );
  });

  test('the request interceptor passes the config through untouched', () => {
    new OperatonService();
    const onRequest = client.interceptors.request.use.mock.calls[0][0];
    const cfg = { method: 'post', url: '/x', data: { a: 1 } };

    expect(onRequest(cfg)).toBe(cfg);
  });

  test('the response interceptor passes the response through untouched', () => {
    new OperatonService();
    const onResponse = client.interceptors.response.use.mock.calls[0][0];
    const res = { status: 200, data: { ok: true } };

    expect(onResponse(res)).toBe(res);
  });

  test('the response error interceptor logs and rethrows', () => {
    new OperatonService();
    const onError = client.interceptors.response.use.mock.calls[0][1];
    const err = { message: 'boom', response: { data: { detail: 'bad' } } };

    expect(() => onError(err)).toThrow();
    expect(mockLogError).toHaveBeenCalledWith('Operaton API Error', {
      message: 'boom',
      response: { detail: 'bad' },
    });
  });
});

describe('evaluateDecision', () => {
  test('posts the decision key with Operaton-typed variables', async () => {
    mockPost.mockResolvedValue({ data: [{ recht: { value: true, type: 'Boolean' } }] });

    const result = await new OperatonService().evaluateDecision('SVB_Leeftijd', { bsn: '123' });

    expect(result).toEqual([{ recht: { value: true, type: 'Boolean' } }]);
    expect(mockPost).toHaveBeenCalledWith('/decision-definition/key/SVB_Leeftijd/evaluate', {
      variables: { bsn: { value: '123', type: 'String' } },
    });
  });

  test.each([
    ['a boolean', true, 'Boolean'],
    ['a whole number', 67, 'Integer'],
    ['a fractional number', 1234.56, 'Double'],
    ['a string', 'Lelystad', 'String'],
    ['an ISO date string', '2026-01-01', 'String'],
    ['null', null, 'Null'],
    ['undefined', undefined, 'Null'],
    ['an object', { a: 1 }, 'String'],
  ])('infers the Operaton type for %s', async (_label, value, expected) => {
    mockPost.mockResolvedValue({ data: {} });

    await new OperatonService().evaluateDecision('D', { v: value });

    expect(mockPost.mock.calls[0][1].variables.v).toEqual({ value, type: expected });
  });

  test('wraps an evaluation failure with the decision context', async () => {
    mockPost.mockRejectedValue(new Error('no matching rule'));

    await expect(new OperatonService().evaluateDecision('D', {})).rejects.toThrow(
      'DMN evaluation failed: no matching rule'
    );
  });

  test('logs the Operaton response body alongside the failure', async () => {
    mockPost.mockRejectedValue(axiosError(500, { message: 'engine error' }));

    await expect(new OperatonService().evaluateDecision('D', {})).rejects.toThrow(
      'DMN evaluation failed'
    );
    expect(mockLogError).toHaveBeenCalledWith(
      'Failed to evaluate DMN: D',
      expect.objectContaining({ response: { message: 'engine error' } })
    );
  });
});

describe('extractValues', () => {
  const service = new OperatonService();

  test('unwraps the typed values of a plain result object', () => {
    expect(
      service.extractValues({
        recht: { value: true, type: 'Boolean' },
        bedrag: { value: 1200, type: 'Integer' },
      } as never)
    ).toEqual({ recht: true, bedrag: 1200 });
  });

  test('unwraps the first element when Operaton wraps the result in an array', () => {
    expect(service.extractValues([{ recht: { value: true, type: 'Boolean' } }] as never)).toEqual({
      recht: true,
    });
  });

  test('ignores entries that are not typed value objects', () => {
    expect(
      service.extractValues({
        recht: { value: true, type: 'Boolean' },
        stray: 'plain string',
        nested: { type: 'Boolean' },
        empty: null,
      } as never)
    ).toEqual({ recht: true });
  });

  test('returns an empty object for an empty array', () => {
    expect(service.extractValues([] as never)).toEqual({});
  });

  test('returns an empty object for a null response', () => {
    expect(service.extractValues(null as never)).toEqual({});
  });

  test('preserves a false or zero value rather than dropping it', () => {
    expect(
      service.extractValues({
        recht: { value: false, type: 'Boolean' },
        bedrag: { value: 0, type: 'Integer' },
      } as never)
    ).toEqual({ recht: false, bedrag: 0 });
  });
});

describe('healthCheck', () => {
  test('reports up with a measured latency', async () => {
    mockGet.mockResolvedValue({ data: { version: '7.x' } });

    const result = await new OperatonService().healthCheck();

    expect(result.status).toBe('up');
    expect(result.latency).toBeGreaterThanOrEqual(0);
    expect(mockGet).toHaveBeenCalledWith('/version');
  });

  test('reports down with the reason instead of throwing', async () => {
    mockGet.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(new OperatonService().healthCheck()).resolves.toEqual({
      status: 'down',
      error: 'ECONNREFUSED',
    });
  });
});

describe('getVariableHints', () => {
  test('queries process history and returns name/type pairs sorted by name', async () => {
    mockGet.mockResolvedValue({
      data: [
        { name: 'zBsn', type: 'String' },
        { name: 'aBedrag', type: 'Integer' },
      ],
    });

    const hints = await new OperatonService().getVariableHints('RipR21Process');

    expect(hints).toEqual([
      { name: 'aBedrag', type: 'Integer' },
      { name: 'zBsn', type: 'String' },
    ]);
    expect(mockGet).toHaveBeenCalledWith('/history/variable-instance', {
      params: { processDefinitionKey: 'RipR21Process', firstResult: 0, maxResults: 500 },
    });
  });

  test('deduplicates repeated variables, keeping the last type seen', async () => {
    mockGet.mockResolvedValue({
      data: [
        { name: 'bsn', type: 'String' },
        { name: 'bsn', type: 'Integer' },
      ],
    });

    await expect(new OperatonService().getVariableHints('P')).resolves.toEqual([
      { name: 'bsn', type: 'Integer' },
    ]);
  });

  test('defaults an untyped history entry to String', async () => {
    mockGet.mockResolvedValue({ data: [{ name: 'bsn' }] });

    await expect(new OperatonService().getVariableHints('P')).resolves.toEqual([
      { name: 'bsn', type: 'String' },
    ]);
  });

  test('wraps a history query failure', async () => {
    mockGet.mockRejectedValue(new Error('history disabled'));

    await expect(new OperatonService().getVariableHints('P')).rejects.toThrow(
      'Variable hints failed: history disabled'
    );
  });
});

describe('fetchDmnXml', () => {
  test('resolves the definition then downloads its XML', async () => {
    mockGet
      .mockResolvedValueOnce({ data: { id: 'def-1', name: 'D', version: 2 } })
      .mockResolvedValueOnce({ data: { dmnXml: '<definitions/>' } });

    const xml = await new OperatonService().fetchDmnXml('SVB_Leeftijd');

    expect(xml).toBe('<definitions/>');
    expect(mockGet).toHaveBeenNthCalledWith(1, '/decision-definition/key/SVB_Leeftijd');
    expect(mockGet).toHaveBeenNthCalledWith(2, '/decision-definition/def-1/xml');
  });

  test('accepts a raw XML body when the response is not wrapped', async () => {
    mockGet
      .mockResolvedValueOnce({ data: { id: 'def-1' } })
      .mockResolvedValueOnce({ data: '<definitions/>' });

    await expect(new OperatonService().fetchDmnXml('D')).resolves.toBe('<definitions/>');
  });

  test('returns null when Operaton has no such definition', async () => {
    mockGet.mockRejectedValue(axiosError(404));

    await expect(new OperatonService().fetchDmnXml('Unknown')).resolves.toBeNull();
  });

  test('throws on any other Operaton API error', async () => {
    mockGet.mockRejectedValue(axiosError(500, { message: 'engine error' }));

    await expect(new OperatonService().fetchDmnXml('D')).rejects.toThrow(
      'Failed to fetch DMN XML: Request failed with status code 500'
    );
  });

  test('throws on a non-HTTP failure', async () => {
    mockGet.mockRejectedValue(new Error('socket hang up'));

    await expect(new OperatonService().fetchDmnXml('D')).rejects.toThrow(
      'Failed to fetch DMN XML: socket hang up'
    );
  });
});

describe('assembleDrd', () => {
  function dmnXml(
    id: string,
    opts: { informationRequirement?: string; inputData?: string; decisionId?: string } = {}
  ) {
    const decisionId = opts.decisionId ?? id;
    const inputData = opts.inputData ?? '<inputData id="InputData_1" name="bsn" />';
    const ir =
      opts.informationRequirement ??
      '<informationRequirement id="ir_1"><requiredInput href="#InputData_1" /></informationRequirement>';
    return `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="https://www.omg.org/spec/DMN/20191111/MODEL/" id="defs_${id}" name="${id}">
  ${inputData}
  <decision id="${decisionId}" name="${id}">
    ${ir}
    <decisionTable id="dt_1" />
  </decision>
</definitions>`;
  }

  /** Serve one DMN XML per key through the two-call fetchDmnXml sequence. */
  function serveDmns(byKey: Record<string, string | null>) {
    mockGet.mockImplementation(async (url: string) => {
      const keyMatch = url.match(/^\/decision-definition\/key\/(.+)$/);
      if (keyMatch) {
        if (byKey[keyMatch[1]] === null) throw axiosError(404);
        return { data: { id: `def-${keyMatch[1]}` } };
      }
      const idMatch = url.match(/^\/decision-definition\/def-(.+)\/xml$/);
      if (!idMatch) throw new Error(`unexpected Operaton request: ${url}`);
      return { data: { dmnXml: byKey[idMatch[1]] } };
    });
  }

  test('refuses a chain with fewer than two DMNs', async () => {
    await expect(new OperatonService().assembleDrd(['A'], 'X')).rejects.toThrow(
      'DRD requires at least 2 DMNs'
    );
  });

  test('prefixes every id per DMN so identical local ids cannot collide', async () => {
    serveDmns({ A: dmnXml('A'), B: dmnXml('B') });

    const xml = await new OperatonService().assembleDrd(['A', 'B'], 'MyDRD');

    expect(xml).toContain('id="dmn0_A"');
    expect(xml).toContain('id="dmn1_B"');
    expect(xml).toContain('id="dmn0_InputData_1"');
    expect(xml).toContain('id="dmn1_InputData_1"');
  });

  test('rewrites intra-DMN href references to the prefixed ids', async () => {
    serveDmns({ A: dmnXml('A'), B: dmnXml('B') });

    const xml = await new OperatonService().assembleDrd(['A', 'B'], 'MyDRD');

    expect(xml).toContain('href="#dmn0_InputData_1"');
    expect(xml).toContain('href="#dmn1_InputData_1"');
    expect(xml).not.toContain('href="#InputData_1"');
  });

  test('wires each decision to require its predecessor', async () => {
    serveDmns({ A: dmnXml('A'), B: dmnXml('B'), C: dmnXml('C') });

    const xml = await new OperatonService().assembleDrd(['A', 'B', 'C'], 'MyDRD');

    expect(xml).toContain('href="#dmn0_A"');
    expect(xml).toContain('href="#dmn1_B"');
  });

  test('creates the requirement list when the decision has none', async () => {
    serveDmns({ A: dmnXml('A'), B: dmnXml('B', { informationRequirement: '' }) });

    const xml = await new OperatonService().assembleDrd(['A', 'B'], 'MyDRD');

    expect(xml).toContain('href="#dmn0_A"');
  });

  test('preserves an existing single requirement alongside the chain link', async () => {
    serveDmns({ A: dmnXml('A'), B: dmnXml('B') });

    const xml = await new OperatonService().assembleDrd(['A', 'B'], 'MyDRD');

    expect(xml).toContain('href="#dmn0_A"');
    expect(xml).toContain('href="#dmn1_InputData_1"');
  });

  test('preserves an existing requirement array alongside the chain link', async () => {
    serveDmns({
      A: dmnXml('A'),
      B: dmnXml('B', {
        inputData: '<inputData id="InputData_1" /><inputData id="InputData_2" />',
        informationRequirement:
          '<informationRequirement id="ir_1"><requiredInput href="#InputData_1" /></informationRequirement>' +
          '<informationRequirement id="ir_2"><requiredInput href="#InputData_2" /></informationRequirement>',
      }),
    });

    const xml = await new OperatonService().assembleDrd(['A', 'B'], 'MyDRD');

    expect(xml).toContain('href="#dmn0_A"');
    expect(xml).toContain('href="#dmn1_InputData_1"');
    expect(xml).toContain('href="#dmn1_InputData_2"');
  });

  test('names the diagram after the entry point, sanitising the id', async () => {
    serveDmns({ A: dmnXml('A'), 'B.1': dmnXml('B.1') });

    const xml = await new OperatonService().assembleDrd(['A', 'B.1'], 'MyDRD');

    expect(xml).toContain('id="drd_dmn1_B_1"');
    expect(xml).toContain('name="MyDRD"');
  });

  test('declares the DMN and Camunda namespaces on the assembled diagram', async () => {
    serveDmns({ A: dmnXml('A'), B: dmnXml('B') });

    const xml = await new OperatonService().assembleDrd(['A', 'B'], 'MyDRD');

    expect(xml).toContain('xmlns="https://www.omg.org/spec/DMN/20191111/MODEL/"');
    expect(xml).toContain('xmlns:camunda="http://camunda.org/schema/1.0/dmn"');
    expect(xml).toContain('exporter="Linked Data Explorer"');
  });

  test('deduplicates inputData that share an id within one DMN', async () => {
    serveDmns({
      A: dmnXml('A', {
        inputData: '<inputData id="InputData_1" name="a" /><inputData id="InputData_1" name="b" />',
      }),
      B: dmnXml('B'),
    });

    const xml = await new OperatonService().assembleDrd(['A', 'B'], 'MyDRD');

    expect(xml.match(/id="dmn0_InputData_1"/g)).toHaveLength(1);
  });

  test('falls back to the first decision when none matches the DMN key', async () => {
    serveDmns({ A: dmnXml('A', { decisionId: 'SomethingElse' }), B: dmnXml('B') });

    const xml = await new OperatonService().assembleDrd(['A', 'B'], 'MyDRD');

    expect(mockLogWarn).toHaveBeenCalledWith(
      'Main decision not found by ID, using first decision',
      {
        dmnId: 'A',
      }
    );
    expect(xml).toContain('href="#dmn0_SomethingElse"');
  });

  test('carries sub-decisions through unchanged', async () => {
    const withSub = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="https://www.omg.org/spec/DMN/20191111/MODEL/" id="defs_A">
  <decision id="A" name="A"><decisionTable id="dt_1" /></decision>
  <decision id="A_helper" name="helper"><decisionTable id="dt_2" /></decision>
</definitions>`;
    serveDmns({ A: withSub, B: dmnXml('B') });

    const xml = await new OperatonService().assembleDrd(['A', 'B'], 'MyDRD');

    expect(xml).toContain('id="dmn0_A"');
    expect(xml).toContain('id="dmn0_A_helper"');
  });

  test('fails when a DMN in the chain is not deployed', async () => {
    serveDmns({ A: dmnXml('A'), B: null });

    await expect(new OperatonService().assembleDrd(['A', 'B'], 'MyDRD')).rejects.toThrow(
      'DMN not found in Operaton: B'
    );
  });

  test('fails when a fetched DMN has no decision element', async () => {
    serveDmns({
      A: '<?xml version="1.0"?><definitions xmlns="https://www.omg.org/spec/DMN/20191111/MODEL/" id="d" />',
      B: dmnXml('B'),
    });

    await expect(new OperatonService().assembleDrd(['A', 'B'], 'MyDRD')).rejects.toThrow(
      'No decision element found in A'
    );
  });
});

describe('deployDrd', () => {
  test('uploads the DRD as a multipart deployment', async () => {
    mockPost.mockResolvedValue({ data: { id: 'dep-1' } });

    const result = await new OperatonService().deployDrd('<definitions/>', 'MyDRD', 'Entry.dmn');

    expect(result).toEqual({ deploymentId: 'dep-1' });
    const body = formBody(mockPost.mock.calls[0]);
    expect(body).toContain('name="deployment-name"');
    expect(body).toContain('MyDRD');
    expect(body).toContain('filename="Entry.dmn"');
    expect(body).toContain('enable-duplicate-filtering');
  });

  test('posts to the deployment endpoint with the form headers', async () => {
    mockPost.mockResolvedValue({ data: { id: 'dep-1' } });

    await new OperatonService().deployDrd('<definitions/>', 'MyDRD', 'Entry.dmn');

    expect(mockPost.mock.calls[0][0]).toBe('/deployment/create');
    expect(mockPost.mock.calls[0][2].headers['content-type']).toMatch(/multipart\/form-data/);
  });

  test('wraps a deployment failure', async () => {
    mockPost.mockRejectedValue(new Error('Operaton rejected the deployment'));

    await expect(
      new OperatonService().deployDrd('<definitions/>', 'MyDRD', 'Entry.dmn')
    ).rejects.toThrow('DRD deployment failed: Operaton rejected the deployment');
  });
});

describe('deployProcess', () => {
  test('sends tenant-id in the deployment FormData when organization is provided', async () => {
    const service = new OperatonService();
    const post = jest.fn().mockResolvedValue({ data: { id: 'deployment-1' } });
    (service as unknown as { client: { post: jest.Mock } }).client = { post };

    await service.deployProcess(
      '<bpmn:definitions/>',
      'RipR21Process',
      [],
      [],
      [],
      undefined,
      undefined,
      undefined,
      'infra-board',
      'flevoland'
    );

    expect(post).toHaveBeenCalledTimes(1);
    const body = formBody(post.mock.calls[0]);
    expect(body).toContain('name="tenant-id"');
    expect(body).toContain('flevoland');
    expect(body).toContain('name="deployment-name"');
  });

  test('omits tenant-id from the FormData when organization is not provided', async () => {
    const service = new OperatonService();
    const post = jest.fn().mockResolvedValue({ data: { id: 'deployment-1' } });
    (service as unknown as { client: { post: jest.Mock } }).client = { post };

    await service.deployProcess(
      '<bpmn:definitions/>',
      'RipR21Process',
      [],
      [],
      [],
      undefined,
      undefined,
      undefined,
      'infra-board'
    );

    const body = formBody(post.mock.calls[0]);
    expect(body).not.toContain('name="tenant-id"');
  });

  test('bundles the main BPMN, sub-processes, forms and documents in one deployment', async () => {
    mockPost.mockResolvedValue({ data: { id: 'dep-1' } });

    const result = await new OperatonService().deployProcess(
      '<bpmn:definitions/>',
      'RipR21Process',
      [{ id: 'form-a', schema: { components: [] } }],
      [{ filename: 'sub.bpmn', xml: '<bpmn:definitions/>' }],
      [{ id: 'doc-a', template: { zones: [] } }],
      undefined,
      undefined,
      undefined,
      ''
    );

    expect(result).toEqual({ deploymentId: 'dep-1', resourceCount: 4 });
    const body = formBody(mockPost.mock.calls[0]);
    expect(body).toContain('filename="RipR21Process.bpmn"');
    expect(body).toContain('filename="sub.bpmn"');
    expect(body).toContain('filename="form-a.form"');
    expect(body).toContain('filename="doc-a.document"');
  });

  test('counts only the main BPMN when nothing else is bundled', async () => {
    mockPost.mockResolvedValue({ data: { id: 'dep-1' } });

    const result = await new OperatonService().deployProcess(
      '<bpmn:definitions/>',
      'P',
      [],
      [],
      [],
      undefined,
      undefined,
      undefined,
      ''
    );

    expect(result.resourceCount).toBe(1);
  });

  test('targets a custom Operaton instance when a URL is supplied', async () => {
    mockPost.mockResolvedValue({ data: { id: 'dep-1' } });
    mockCreate.mockClear();

    await new OperatonService().deployProcess(
      '<bpmn:definitions/>',
      'P',
      [],
      [],
      [],
      'http://other:8080/engine-rest',
      'demo',
      'demo',
      ''
    );

    expect(mockCreate).toHaveBeenCalledWith({
      baseURL: 'http://other:8080/engine-rest',
      timeout: 10000,
      auth: { username: 'demo', password: 'demo' },
    });
  });

  test('omits basic auth when only a URL is supplied', async () => {
    mockPost.mockResolvedValue({ data: { id: 'dep-1' } });
    mockCreate.mockClear();

    await new OperatonService().deployProcess(
      '<bpmn:definitions/>',
      'P',
      [],
      [],
      [],
      'http://other:8080/engine-rest',
      undefined,
      undefined,
      ''
    );

    expect(mockCreate).toHaveBeenCalledWith({
      baseURL: 'http://other:8080/engine-rest',
      timeout: 10000,
    });
  });

  test('surfaces a string error body from Operaton', async () => {
    mockPost.mockRejectedValue(axiosError(400, 'ENGINE-09005 Could not parse BPMN process'));

    await expect(
      new OperatonService().deployProcess(
        '<bpmn:definitions/>',
        'P',
        [],
        [],
        [],
        undefined,
        undefined,
        undefined,
        ''
      )
    ).rejects.toThrow('Process deployment failed: ENGINE-09005 Could not parse BPMN process');
  });

  test('serialises a structured error body from Operaton', async () => {
    mockPost.mockRejectedValue(axiosError(400, { type: 'ProcessEngineException', message: 'bad' }));

    await expect(
      new OperatonService().deployProcess(
        '<bpmn:definitions/>',
        'P',
        [],
        [],
        [],
        undefined,
        undefined,
        undefined,
        ''
      )
    ).rejects.toThrow(
      'Process deployment failed: {"type":"ProcessEngineException","message":"bad"}'
    );
  });

  test('falls back to the error message when Operaton returns no body', async () => {
    mockPost.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(
      new OperatonService().deployProcess(
        '<bpmn:definitions/>',
        'P',
        [],
        [],
        [],
        undefined,
        undefined,
        undefined,
        ''
      )
    ).rejects.toThrow('Process deployment failed: ECONNREFUSED');
  });
});

describe('boardOwner tagging', () => {
  async function deployAndReadXml(bpmnXml: string, boardOwner?: string) {
    mockPost.mockResolvedValue({ data: { id: 'dep-1' } });
    await new OperatonService().deployProcess(
      bpmnXml,
      'P',
      [],
      [],
      [],
      undefined,
      undefined,
      undefined,
      boardOwner
    );
    return formBody(mockPost.mock.calls[0]);
  }

  const PROCESS = (inner = '') =>
    `<?xml version="1.0"?><bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">` +
    `<bpmn:process id="P" isExecutable="true">${inner}</bpmn:process></bpmn:definitions>`;

  test('derives infra-board from an infra candidate group', async () => {
    const body = await deployAndReadXml(
      PROCESS('<bpmn:userTask id="t" camunda:candidateGroups="infra-projectteam" />')
    );

    expect(body).toContain('name="boardOwner" value="infra-board"');
  });

  test('derives caseworker from a caseworker candidate group', async () => {
    const body = await deployAndReadXml(
      PROCESS('<bpmn:userTask id="t" camunda:candidateGroups="caseworker" />')
    );

    expect(body).toContain('name="boardOwner" value="caseworker"');
  });

  test('infra ownership wins when a process carries both roles', async () => {
    const body = await deployAndReadXml(
      PROCESS('<bpmn:userTask id="t" camunda:candidateGroups="caseworker,rip-r21" />')
    );

    expect(body).toContain('value="infra-board"');
    expect(body).not.toContain('value="caseworker"');
  });

  test('leaves the process untagged when no known group is present', async () => {
    const body = await deployAndReadXml(
      PROCESS('<bpmn:userTask id="t" camunda:candidateGroups="some-other-group" />')
    );

    expect(body).not.toContain('boardOwner');
  });

  test('an explicit empty boardOwner opts out of tagging', async () => {
    const body = await deployAndReadXml(
      PROCESS('<bpmn:userTask id="t" camunda:candidateGroups="infra-projectteam" />'),
      ''
    );

    expect(body).not.toContain('boardOwner');
  });

  test('an explicit boardOwner overrides derivation', async () => {
    const body = await deployAndReadXml(
      PROCESS('<bpmn:userTask id="t" camunda:candidateGroups="caseworker" />'),
      'custom-board'
    );

    expect(body).toContain('value="custom-board"');
  });

  test('declares the camunda namespace so the injected property resolves', async () => {
    const body = await deployAndReadXml(PROCESS(), 'infra-board');

    expect(body).toContain('xmlns:camunda="http://camunda.org/schema/1.0/bpmn"');
  });

  test('does not redeclare an already-present camunda namespace', async () => {
    const xml =
      `<?xml version="1.0"?><bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" ` +
      `xmlns:camunda="http://camunda.org/schema/1.0/bpmn">` +
      `<bpmn:process id="P"></bpmn:process></bpmn:definitions>`;

    const body = await deployAndReadXml(xml, 'infra-board');

    expect(body.match(/xmlns:camunda=/g)).toHaveLength(1);
  });

  test('is idempotent — an already tagged process is left alone', async () => {
    const xml = PROCESS(
      '<bpmn:extensionElements><camunda:properties>' +
        '<camunda:property name="boardOwner" value="existing" />' +
        '</camunda:properties></bpmn:extensionElements>'
    );

    const body = await deployAndReadXml(xml, 'infra-board');

    expect(body).toContain('value="existing"');
    expect(body).not.toContain('value="infra-board"');
  });

  test('merges into an existing camunda:properties block', async () => {
    const xml = PROCESS(
      '<bpmn:extensionElements><camunda:properties>' +
        '<camunda:property name="other" value="x" />' +
        '</camunda:properties></bpmn:extensionElements>'
    );

    const body = await deployAndReadXml(xml, 'infra-board');

    expect(body).toContain('name="boardOwner" value="infra-board"');
    expect(body).toContain('name="other" value="x"');
    expect(body.match(/<camunda:properties>/g)).toHaveLength(1);
  });

  test('adds a properties block to an existing extensionElements', async () => {
    const xml = PROCESS(
      '<bpmn:extensionElements><camunda:executionListener /></bpmn:extensionElements>'
    );

    const body = await deployAndReadXml(xml, 'infra-board');

    expect(body).toContain('<camunda:properties>');
    expect(body).toContain('name="boardOwner" value="infra-board"');
  });

  test('keeps documentation ahead of the injected extensionElements, as the schema requires', async () => {
    const xml = PROCESS('<bpmn:documentation>Toelichting</bpmn:documentation>');

    const body = await deployAndReadXml(xml, 'infra-board');

    const docAt = body.indexOf('<bpmn:documentation>');
    const extAt = body.indexOf('<bpmn:extensionElements>');
    expect(docAt).toBeGreaterThan(-1);
    expect(extAt).toBeGreaterThan(docAt);
  });

  test('leaves a self-closing process element untouched', async () => {
    const xml =
      `<?xml version="1.0"?><bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">` +
      `<bpmn:process id="P" isExecutable="true"/></bpmn:definitions>`;

    const body = await deployAndReadXml(xml, 'infra-board');

    expect(body).not.toContain('boardOwner');
  });

  test('leaves XML with no process element untouched', async () => {
    const body = await deployAndReadXml('<bpmn:definitions/>', 'infra-board');

    expect(body).not.toContain('boardOwner');
  });
});

describe('module exports', () => {
  test('the singleton is an OperatonService', () => {
    expect(operatonService).toBeInstanceOf(OperatonService);
  });
});
