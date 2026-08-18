import axios from 'axios';

jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));
// The module exports a singleton, so axios.create() runs at import time — the
// client stub has to exist inside the factory rather than be wired up later.
jest.mock('axios', () => {
  const client = { post: jest.fn() };
  return { __esModule: true, default: { create: jest.fn(() => client), get: jest.fn() } };
});

const configMock = {
  triplydb: {
    endpoint: 'https://api.example/datasets/acct/facts/services/facts/sparql',
    timeout: 30000,
  },
};
jest.mock('../utils/config', () => ({
  __esModule: true,
  config: configMock,
  default: configMock,
}));

import { SparqlService, sparqlService } from './sparql.service';

const mockCreate = axios.create as jest.Mock;
const mockPost = (mockCreate.mock.results[0].value as { post: jest.Mock }).post;
const mockGet = axios.get as jest.Mock;

const DEFAULT_ENDPOINT = configMock.triplydb.endpoint;

type Binding = Record<string, { value: string }>;

const lit = (v: string) => ({ value: v });

function bindings(rows: Binding[]) {
  return { data: { results: { bindings: rows } } };
}

/**
 * Route each SPARQL POST to a canned result based on a distinctive fragment of
 * the query, so getAllDmns' main → vendors → inputs → outputs sequence can be
 * driven without depending on call order.
 */
function respondWith(sets: {
  main?: Binding[];
  vendors?: Binding[];
  inputs?: Binding[];
  outputs?: Binding[];
}) {
  mockPost.mockImplementation(async (_url: string, query: string) => {
    if (query.includes('ronl:VendorService')) return bindings(sets.vendors ?? []);
    if (query.includes('cpsv:isRequiredBy <')) return bindings(sets.inputs ?? []);
    if (query.includes('cpsv:produces <')) return bindings(sets.outputs ?? []);
    return bindings(sets.main ?? []);
  });
}

function dmnRow(overrides: Binding = {}): Binding {
  return {
    dmn: lit('https://example.org/dmn/1'),
    identifier: lit('SVB_LeeftijdsInformatie'),
    title: lit('Leeftijdsinformatie'),
    ...overrides,
  };
}

function service() {
  return new SparqlService();
}

beforeEach(() => {
  mockPost.mockReset();
  mockGet.mockReset();
  mockCreate.mockClear();
});

describe('construction', () => {
  test('builds a default client for the configured TriplyDB endpoint', () => {
    service();

    expect(mockCreate).toHaveBeenCalledWith({
      baseURL: DEFAULT_ENDPOINT,
      timeout: 30000,
      headers: { Accept: 'application/sparql-results+json' },
    });
  });
});

describe('executeSparqlQuery', () => {
  test('POSTs the query as application/sparql-query and returns the raw result', async () => {
    mockPost.mockResolvedValue(bindings([{ s: lit('x') }]));

    const result = await service().executeSparqlQuery('https://other.example/sparql', 'SELECT *');

    expect(result).toEqual({ results: { bindings: [{ s: { value: 'x' } }] } });
    expect(mockPost).toHaveBeenCalledWith('', 'SELECT *', {
      headers: { 'Content-Type': 'application/sparql-query' },
    });
  });

  test('builds a throwaway client for a custom endpoint rather than reusing the default one', async () => {
    mockPost.mockResolvedValue(bindings([]));
    const svc = service();
    mockCreate.mockClear();

    await svc.executeSparqlQuery('https://other.example/sparql', 'SELECT *');

    expect(mockCreate).toHaveBeenCalledWith({
      baseURL: 'https://other.example/sparql',
      timeout: 30000,
      headers: { Accept: 'application/sparql-results+json' },
    });
  });

  test('wraps a query failure with the endpoint-agnostic prefix', async () => {
    mockPost.mockRejectedValue(new Error('502 Bad Gateway'));

    await expect(service().executeSparqlQuery('e', 'SELECT *')).rejects.toThrow(
      'SPARQL query failed: 502 Bad Gateway'
    );
  });
});

describe('getAllDmns', () => {
  test('maps the discovery rows onto DMN models', async () => {
    respondWith({
      main: [
        dmnRow({
          description: lit('Bepaalt de leeftijd'),
          deploymentId: lit('dep-1'),
          deployedAt: lit('2026-01-01'),
          implementedBy: lit('https://example.org/svb'),
          lastTested: lit('2026-02-01'),
          testStatus: lit('passed'),
          service: lit('https://example.org/service/1'),
          serviceTitle: lit('Leeftijdscheck'),
          organization: lit('https://example.org/org/svb'),
          orgName: lit('SVB'),
          validationStatus: lit('validated'),
          validatedBy: lit('https://example.org/org/ronl'),
          validatedByName: lit('RONL'),
          validatedAt: lit('2026-03-01'),
          validationNote: lit('Akkoord'),
        }),
      ],
    });

    const [dmn] = await service().getAllDmns();

    expect(dmn).toMatchObject({
      id: 'https://example.org/dmn/1',
      identifier: 'SVB_LeeftijdsInformatie',
      title: 'Leeftijdsinformatie',
      description: 'Bepaalt de leeftijd',
      deploymentId: 'dep-1',
      testStatus: 'passed',
      serviceTitle: 'Leeftijdscheck',
      organizationName: 'SVB',
      validationStatus: 'validated',
      validatedByName: 'RONL',
      validationNote: 'Akkoord',
      inputs: [],
      outputs: [],
      vendorCount: 0,
    });
  });

  test('leaves the optional columns undefined when the graph does not supply them', async () => {
    respondWith({ main: [dmnRow()] });

    const [dmn] = await service().getAllDmns();

    expect(dmn.description).toBeUndefined();
    expect(dmn.deploymentId).toBeUndefined();
    expect(dmn.organizationName).toBeUndefined();
    expect(dmn.logoUrl).toBeUndefined();
  });

  test('collapses the repeated service/organisation rows for one DMN', async () => {
    respondWith({
      main: [
        dmnRow({ serviceTitle: lit('Eerste dienst') }),
        dmnRow({ serviceTitle: lit('Tweede dienst') }),
      ],
    });

    const dmns = await service().getAllDmns();

    expect(dmns).toHaveLength(1);
    expect(dmns[0].serviceTitle).toBe('Eerste dienst');
  });

  test('returns one model per distinct DMN URI', async () => {
    respondWith({
      main: [
        dmnRow(),
        dmnRow({ dmn: lit('https://example.org/dmn/2'), identifier: lit('SZW_Bijstandsnorm') }),
      ],
    });

    const dmns = await service().getAllDmns();

    expect(dmns.map((d) => d.identifier)).toEqual(['SVB_LeeftijdsInformatie', 'SZW_Bijstandsnorm']);
  });

  test('attaches the vendor implementation count', async () => {
    respondWith({
      main: [dmnRow()],
      vendors: [{ basedOn: lit('https://example.org/dmn/1'), vendorCount: lit('3') }],
    });

    const [dmn] = await service().getAllDmns();

    expect(dmn.vendorCount).toBe(3);
  });

  test('reports zero vendors for a DMN nobody implements', async () => {
    respondWith({
      main: [dmnRow()],
      vendors: [{ basedOn: lit('https://example.org/other'), vendorCount: lit('2') }],
    });

    const [dmn] = await service().getAllDmns();

    expect(dmn.vendorCount).toBe(0);
  });

  test('handles an empty graph', async () => {
    respondWith({});

    await expect(service().getAllDmns()).resolves.toEqual([]);
  });

  test('tolerates a result envelope with no bindings key', async () => {
    mockPost.mockResolvedValue({ data: {} });

    await expect(service().getAllDmns()).resolves.toEqual([]);
  });
});

describe('getAllDmns caching', () => {
  test('serves a second call from cache without re-querying', async () => {
    respondWith({ main: [dmnRow()] });
    const svc = service();

    await svc.getAllDmns();
    const callsAfterFirst = mockPost.mock.calls.length;
    await svc.getAllDmns();

    expect(mockPost.mock.calls).toHaveLength(callsAfterFirst);
  });

  test('refresh=true bypasses the cache', async () => {
    respondWith({ main: [dmnRow()] });
    const svc = service();

    await svc.getAllDmns();
    const callsAfterFirst = mockPost.mock.calls.length;
    await svc.getAllDmns(undefined, true);

    expect(mockPost.mock.calls.length).toBeGreaterThan(callsAfterFirst);
  });

  test('re-queries once the five-minute TTL has passed', async () => {
    respondWith({ main: [dmnRow()] });
    const svc = service();
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);

    await svc.getAllDmns();
    const callsAfterFirst = mockPost.mock.calls.length;

    nowSpy.mockReturnValue(1_000_000 + 5 * 60 * 1000 + 1);
    await svc.getAllDmns();

    expect(mockPost.mock.calls.length).toBeGreaterThan(callsAfterFirst);
    nowSpy.mockRestore();
  });

  test('keeps a separate cache per endpoint', async () => {
    respondWith({ main: [dmnRow()] });
    const svc = service();

    await svc.getAllDmns();
    const callsAfterFirst = mockPost.mock.calls.length;
    await svc.getAllDmns('https://other.example/sparql');

    expect(mockPost.mock.calls.length).toBeGreaterThan(callsAfterFirst);
  });

  test('clearCache(endpoint) drops only that endpoint entry', async () => {
    respondWith({ main: [dmnRow()] });
    const svc = service();
    await svc.getAllDmns();
    await svc.getAllDmns('https://other.example/sparql');

    svc.clearCache('https://other.example/sparql');

    expect(Object.keys(svc.getCacheStats())).toEqual([DEFAULT_ENDPOINT]);
  });

  test('clearCache() drops every entry', async () => {
    respondWith({ main: [dmnRow()] });
    const svc = service();
    await svc.getAllDmns();
    await svc.getAllDmns('https://other.example/sparql');

    svc.clearCache();

    expect(svc.getCacheStats()).toEqual({});
  });

  test('getCacheStats reports the age in seconds and the entry count', async () => {
    respondWith({ main: [dmnRow()] });
    const svc = service();
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
    await svc.getAllDmns();

    nowSpy.mockReturnValue(1_000_000 + 42_000);
    const stats = svc.getCacheStats();

    expect(stats[DEFAULT_ENDPOINT]).toEqual({ age: 42, count: 1 });
    nowSpy.mockRestore();
  });

  test('getCacheStats is empty before anything has been fetched', () => {
    expect(service().getCacheStats()).toEqual({});
  });
});

describe('DMN variables', () => {
  const inputRow = (type: string, value?: string): Binding => ({
    identifier: lit('leeftijd'),
    title: lit('Leeftijd'),
    type: lit(type),
    ...(value !== undefined ? { value: lit(value) } : {}),
  });

  test('maps input identifier, title, type and description', async () => {
    respondWith({
      main: [dmnRow()],
      inputs: [{ ...inputRow('Integer'), description: lit('De leeftijd') }],
    });

    const [dmn] = await service().getAllDmns();

    expect(dmn.inputs[0]).toMatchObject({
      identifier: 'leeftijd',
      title: 'Leeftijd',
      type: 'Integer',
      description: 'De leeftijd',
    });
  });

  test('omits testValue when the graph has no schema:value', async () => {
    respondWith({ main: [dmnRow()], inputs: [inputRow('String')] });

    const [dmn] = await service().getAllDmns();

    expect(dmn.inputs[0]).not.toHaveProperty('testValue');
    expect(dmn.inputs[0].description).toBeUndefined();
  });

  test.each([
    ['Integer', '67', 67],
    ['Double', '1234.56', 1234.56],
    ['Boolean', 'true', true],
    ['Boolean', 'TRUE', true],
    ['Boolean', 'false', false],
    ['String', 'Lelystad', 'Lelystad'],
    ['Date', '2026-01-01', '2026-01-01'],
  ])('coerces a %s test value', async (type, raw, expected) => {
    respondWith({ main: [dmnRow()], inputs: [inputRow(type, raw)] });

    const [dmn] = await service().getAllDmns();

    expect(dmn.inputs[0].testValue).toBe(expected);
  });

  test('applies the same coercion to outputs', async () => {
    respondWith({
      main: [dmnRow()],
      outputs: [
        { identifier: lit('recht'), title: lit('Recht'), type: lit('Boolean'), value: lit('true') },
      ],
    });

    const [dmn] = await service().getAllDmns();

    expect(dmn.outputs[0]).toMatchObject({ identifier: 'recht', type: 'Boolean', testValue: true });
  });

  test('an output without a test value is mapped without one', async () => {
    respondWith({
      main: [dmnRow()],
      outputs: [{ identifier: lit('recht'), title: lit('Recht'), type: lit('Boolean') }],
    });

    const [dmn] = await service().getAllDmns();

    expect(dmn.outputs[0]).not.toHaveProperty('testValue');
  });
});

describe('logo resolution', () => {
  const rowWithLogo = () =>
    dmnRow({
      organization: lit('https://example.org/org/svb'),
      logo: lit('Sociale_Verzekeringsbank_logo.png'),
    });

  test('resolves the logo filename to the versioned TriplyDB asset URL', async () => {
    respondWith({ main: [rowWithLogo()] });
    mockGet.mockResolvedValue({
      data: [
        {
          assetName: 'Sociale_Verzekeringsbank_logo.png',
          identifier: 'a1',
          versions: [{ id: 'v1', url: 'https://cdn.example/svb.png', fileSize: 100 }],
        },
      ],
    });

    const [dmn] = await service().getAllDmns(DEFAULT_ENDPOINT);

    expect(dmn.logoUrl).toBe('https://cdn.example/svb.png');
    expect(mockGet).toHaveBeenCalledWith(
      'https://api.open-regels.triply.cc/datasets/acct/facts/assets',
      { timeout: 5000 }
    );
  });

  test('strips any directory prefix from the filename before matching', async () => {
    respondWith({
      main: [
        dmnRow({
          organization: lit('https://example.org/org/svb'),
          logo: lit('logos/svb.png'),
        }),
      ],
    });
    mockGet.mockResolvedValue({
      data: [
        { assetName: 'svb.png', identifier: 'a1', versions: [{ id: 'v', url: 'u', fileSize: 1 }] },
      ],
    });

    const [dmn] = await service().getAllDmns(DEFAULT_ENDPOINT);

    expect(dmn.logoUrl).toBe('u');
  });

  test('gives up quietly when the endpoint URL carries no account/dataset path', async () => {
    respondWith({ main: [rowWithLogo()] });

    const [dmn] = await service().getAllDmns('https://plain.example/sparql');

    expect(dmn.logoUrl).toBeUndefined();
    expect(mockGet).not.toHaveBeenCalled();
  });

  test('gives up quietly when no asset matches the filename', async () => {
    respondWith({ main: [rowWithLogo()] });
    mockGet.mockResolvedValue({
      data: [{ assetName: 'other.png', identifier: 'a', versions: [] }],
    });

    const [dmn] = await service().getAllDmns(DEFAULT_ENDPOINT);

    expect(dmn.logoUrl).toBeUndefined();
  });

  test('gives up quietly when the matching asset has no versions', async () => {
    respondWith({ main: [rowWithLogo()] });
    mockGet.mockResolvedValue({
      data: [{ assetName: 'Sociale_Verzekeringsbank_logo.png', identifier: 'a', versions: [] }],
    });

    const [dmn] = await service().getAllDmns(DEFAULT_ENDPOINT);

    expect(dmn.logoUrl).toBeUndefined();
  });

  test('a failing assets call does not fail the whole DMN list', async () => {
    respondWith({ main: [rowWithLogo()] });
    mockGet.mockRejectedValue(new Error('assets API down'));

    const [dmn] = await service().getAllDmns(DEFAULT_ENDPOINT);

    expect(dmn.identifier).toBe('SVB_LeeftijdsInformatie');
    expect(dmn.logoUrl).toBeUndefined();
  });

  test('is skipped when the DMN has an organisation but no logo', async () => {
    respondWith({ main: [dmnRow({ organization: lit('https://example.org/org/svb') })] });

    await service().getAllDmns(DEFAULT_ENDPOINT);

    expect(mockGet).not.toHaveBeenCalled();
  });

  test('is skipped when the DMN has a logo but no organisation', async () => {
    respondWith({ main: [dmnRow({ logo: lit('svb.png') })] });

    await service().getAllDmns(DEFAULT_ENDPOINT);

    expect(mockGet).not.toHaveBeenCalled();
  });
});

describe('getVendorCounts', () => {
  test('parses the aggregated counts into a map', async () => {
    mockPost.mockResolvedValue(
      bindings([
        { basedOn: lit('https://example.org/dmn/1'), vendorCount: lit('3') },
        { basedOn: lit('https://example.org/dmn/2'), vendorCount: lit('1') },
      ])
    );

    const counts = await service().getVendorCounts();

    expect(counts.get('https://example.org/dmn/1')).toBe(3);
    expect(counts.get('https://example.org/dmn/2')).toBe(1);
  });

  test('degrades to an empty map rather than failing the caller', async () => {
    mockPost.mockRejectedValue(new Error('endpoint unreachable'));

    await expect(service().getVendorCounts()).resolves.toEqual(new Map());
  });
});

describe('getDmnByIdentifier', () => {
  test('finds the DMN in the cached list', async () => {
    respondWith({ main: [dmnRow()] });

    const dmn = await service().getDmnByIdentifier('SVB_LeeftijdsInformatie');

    expect(dmn?.id).toBe('https://example.org/dmn/1');
  });

  test('returns null for an unknown identifier', async () => {
    respondWith({ main: [dmnRow()] });

    await expect(service().getDmnByIdentifier('Nope')).resolves.toBeNull();
  });

  test('reuses the cache rather than issuing a fresh discovery query', async () => {
    respondWith({ main: [dmnRow()] });
    const svc = service();
    await svc.getAllDmns();
    const callsAfterFirst = mockPost.mock.calls.length;

    await svc.getDmnByIdentifier('SVB_LeeftijdsInformatie');

    expect(mockPost.mock.calls).toHaveLength(callsAfterFirst);
  });
});

describe('findChainLinks', () => {
  test('maps each pairwise link', async () => {
    mockPost.mockResolvedValue(
      bindings([
        {
          dmn1Identifier: lit('A'),
          dmn2Identifier: lit('B'),
          variableId: lit('leeftijd'),
          variableType: lit('Integer'),
        },
      ])
    );

    await expect(service().findChainLinks()).resolves.toEqual([
      { from: 'A', to: 'B', variable: 'leeftijd', variableType: 'Integer' },
    ]);
  });

  test('returns an empty list when nothing chains', async () => {
    mockPost.mockResolvedValue(bindings([]));

    await expect(service().findChainLinks()).resolves.toEqual([]);
  });
});

describe('findSemanticEquivalences', () => {
  const row = (extra: Binding = {}): Binding => ({
    sharedConcept: lit('https://example.org/concept/age'),
    concept1: lit('https://example.org/c1'),
    concept1Label: lit('Leeftijd'),
    variable1: lit('https://example.org/v1'),
    variable1Id: lit('leeftijd'),
    variable1Type: lit('Integer'),
    concept2: lit('https://example.org/c2'),
    concept2Label: lit('Age'),
    variable2: lit('https://example.org/v2'),
    variable2Id: lit('age'),
    variable2Type: lit('Integer'),
    dmn1: lit('https://example.org/dmn/1'),
    dmn1Title: lit('DMN 1'),
    dmn2: lit('https://example.org/dmn/2'),
    dmn2Title: lit('DMN 2'),
    ...extra,
  });

  test('nests each side of the equivalence under its concept', async () => {
    mockPost.mockResolvedValue(
      bindings([row({ concept1Notation: lit('N1'), concept2Notation: lit('N2') })])
    );

    const [eq] = await service().findSemanticEquivalences();

    expect(eq).toEqual({
      sharedConcept: 'https://example.org/concept/age',
      concept1: {
        uri: 'https://example.org/c1',
        label: 'Leeftijd',
        notation: 'N1',
        variable: {
          uri: 'https://example.org/v1',
          identifier: 'leeftijd',
          type: 'Integer',
        },
      },
      concept2: {
        uri: 'https://example.org/c2',
        label: 'Age',
        notation: 'N2',
        variable: { uri: 'https://example.org/v2', identifier: 'age', type: 'Integer' },
      },
      dmn1: { uri: 'https://example.org/dmn/1', title: 'DMN 1' },
      dmn2: { uri: 'https://example.org/dmn/2', title: 'DMN 2' },
    });
  });

  test('leaves the notation undefined when the concept has none', async () => {
    mockPost.mockResolvedValue(bindings([row()]));

    const [eq] = await service().findSemanticEquivalences();

    expect(eq.concept1.notation).toBeUndefined();
    expect(eq.concept2.notation).toBeUndefined();
  });
});

describe('findEnhancedChainLinks', () => {
  const row = (matchType: string): Binding => ({
    dmn1: lit('https://example.org/dmn/1'),
    dmn1Identifier: lit('A'),
    dmn1Title: lit('DMN A'),
    dmn2: lit('https://example.org/dmn/2'),
    dmn2Identifier: lit('B'),
    dmn2Title: lit('DMN B'),
    outputVarId: lit('leeftijd'),
    inputVarId: lit('leeftijd'),
    variableType: lit('Integer'),
    matchType: lit(matchType),
    sharedConcept: lit('https://example.org/concept/age'),
  });

  test.each(['exact', 'semantic'])('emits one link for a %s match', async (matchType) => {
    mockPost.mockResolvedValue(bindings([row(matchType)]));

    const links = await service().findEnhancedChainLinks();

    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      matchType,
      outputVariable: 'leeftijd',
      inputVariable: 'leeftijd',
      variableType: 'Integer',
      dmn1: { uri: 'https://example.org/dmn/1', identifier: 'A', title: 'DMN A' },
      dmn2: { uri: 'https://example.org/dmn/2', identifier: 'B', title: 'DMN B' },
    });
  });

  test('splits a "both" match into separate exact and semantic links', async () => {
    mockPost.mockResolvedValue(bindings([row('both')]));

    const links = await service().findEnhancedChainLinks();

    expect(links.map((l) => l.matchType)).toEqual(['exact', 'semantic']);
    expect(links[0].sharedConcept).toBe('https://example.org/concept/age');
    expect(links[1].sharedConcept).toBe('https://example.org/concept/age');
  });

  test('returns an empty list when nothing matches', async () => {
    mockPost.mockResolvedValue(bindings([]));

    await expect(service().findEnhancedChainLinks()).resolves.toEqual([]);
  });
});

describe('detectChainCycles', () => {
  test('reports each three-hop cycle as an ordered path', async () => {
    mockPost.mockResolvedValue(
      bindings([
        {
          dmn1: lit('u1'),
          dmn1Title: lit('T1'),
          dmn2: lit('u2'),
          dmn2Title: lit('T2'),
          dmn3: lit('u3'),
          dmn3Title: lit('T3'),
        },
      ])
    );

    await expect(service().detectChainCycles()).resolves.toEqual([
      {
        path: [
          { uri: 'u1', title: 'T1' },
          { uri: 'u2', title: 'T2' },
          { uri: 'u3', title: 'T3' },
        ],
        type: 'three-hop',
      },
    ]);
  });

  test('returns an empty list for an acyclic graph', async () => {
    mockPost.mockResolvedValue(bindings([]));

    await expect(service().detectChainCycles()).resolves.toEqual([]);
  });
});

describe('healthCheck', () => {
  test('reports up with a measured latency', async () => {
    mockPost.mockResolvedValue(bindings([]));

    const result = await service().healthCheck();

    expect(result.status).toBe('up');
    expect(result.latency).toBeGreaterThanOrEqual(0);
  });

  test('probes the endpoint with a trivial query', async () => {
    mockPost.mockResolvedValue(bindings([]));

    await service().healthCheck();

    expect(mockPost).toHaveBeenCalledWith(
      '',
      'SELECT ?s ?p ?o WHERE { ?s ?p ?o } LIMIT 1',
      expect.anything()
    );
  });

  test('reports down with the reason instead of throwing', async () => {
    mockPost.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(service().healthCheck()).resolves.toEqual({
      status: 'down',
      error: 'SPARQL query failed: ECONNREFUSED',
    });
  });

  test('honours an endpoint override', async () => {
    mockPost.mockResolvedValue(bindings([]));
    const svc = service();
    mockCreate.mockClear();

    await svc.healthCheck('https://other.example/sparql');

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ baseURL: 'https://other.example/sparql' })
    );
  });
});

describe('module exports', () => {
  test('the singleton is a SparqlService', () => {
    expect(sparqlService).toBeInstanceOf(SparqlService);
  });
});
