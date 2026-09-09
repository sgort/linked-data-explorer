jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));
jest.mock('./triplydb.service', () => ({ __esModule: true, executeQuery: jest.fn() }));

const configMock = { triplydb: { endpoint: 'https://default.example/sparql' } };
jest.mock('../utils/config', () => ({
  __esModule: true,
  config: configMock,
  default: configMock,
}));

import * as triplydbService from './triplydb.service';
import {
  DEFAULT_CPRMV_VERSION,
  SUPPORTED_CPRMV_VERSIONS,
  getAllNorms,
  getCprmvVersion,
  getDatasetVersionsByRulesetid,
} from './norms.service';

const mockExecuteQuery = triplydbService.executeQuery as jest.Mock;

type Binding = Record<string, { value: string }>;
const lit = (v: string) => ({ value: v });

function bindings(rows: Binding[]) {
  return { results: { bindings: rows } };
}

// The dataset-metadata cache is module-level and keyed by endpoint+version, so
// each case gets its own endpoint unless it is explicitly about caching.
let endpointSeq = 0;
function uniqueEndpoint() {
  endpointSeq += 1;
  return `https://endpoint-${endpointSeq}.example/sparql`;
}

/** Route metadata and rules queries to separate canned results. */
function respondWith(sets: { meta?: Binding[]; rules?: Binding[] }) {
  mockExecuteQuery.mockImplementation(async (_endpoint: string, query: string) => {
    if (query.includes('cprmv:Rule')) return bindings(sets.rules ?? []);
    return bindings(sets.meta ?? []);
  });
}

function queryFor(fragment: string): string {
  const call = mockExecuteQuery.mock.calls.find(([, q]: [string, string]) => q.includes(fragment));
  if (!call) throw new Error(`no query containing "${fragment}" was issued`);
  return call[1] as string;
}

function ruleRow(overrides: Binding = {}): Binding {
  return {
    rule: lit('https://example.org/rule/1'),
    id: lit('r1'),
    definition: lit('Een norm'),
    rulesetId: lit('BWBR0015703'),
    ruleIdPath: lit('BWBR0015703_2026-01-01_1'),
    ...overrides,
  };
}

const NS_030 = 'https://cprmv.open-regels.nl/0.3.0/';
const NS_041 = 'https://standaarden.open-regels.nl/standards/cprmv/0.4.1#';
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';

beforeEach(() => {
  mockExecuteQuery.mockReset();
  configMock.triplydb.endpoint = 'https://default.example/sparql';
});

describe('version constants', () => {
  test('exposes the supported CPRMV versions the route validates against', () => {
    expect(SUPPORTED_CPRMV_VERSIONS).toEqual(['0.3.0', '0.3.2', '0.4.1']);
  });

  test('defaults to the version currently published in TriplyDB', () => {
    expect(DEFAULT_CPRMV_VERSION).toBe('0.3.0');
    expect(getCprmvVersion()).toBe('0.3.0');
  });
});

describe('getDatasetVersionsByRulesetid', () => {
  test('returns nothing when no endpoint is configured or supplied', async () => {
    configMock.triplydb.endpoint = '';

    await expect(getDatasetVersionsByRulesetid()).resolves.toEqual({});
    expect(mockExecuteQuery).not.toHaveBeenCalled();
  });

  test('queries the 0.3.x cprmv:Dataset shape by default', async () => {
    respondWith({});

    await getDatasetVersionsByRulesetid(uniqueEndpoint());

    const query = mockExecuteQuery.mock.calls[0][1];
    expect(query).toContain('a cprmv:Dataset');
    expect(query).toContain('dct:issued ?issued');
    expect(query).toContain('OPTIONAL { ?ds dcat:version ?version }');
    expect(query).toContain(`PREFIX cprmv: <${NS_030}>`);
  });

  test('queries the 0.4.1 cprmv:RuleSet shape, binding validFrom as the freshness signal', async () => {
    respondWith({});

    await getDatasetVersionsByRulesetid(uniqueEndpoint(), '0.4.1');

    const query = mockExecuteQuery.mock.calls[0][1];
    expect(query).toContain('a cprmv:RuleSet');
    expect(query).toContain('cprmv:validFrom ?version');
    expect(query).toContain('BIND(?version AS ?issued)');
    expect(query).toContain(`PREFIX cprmv: <${NS_041}>`);
  });

  test('uses the 0.3.2 namespace when that version is requested', async () => {
    respondWith({});

    await getDatasetVersionsByRulesetid(uniqueEndpoint(), '0.3.2');

    expect(mockExecuteQuery.mock.calls[0][1]).toContain(
      'PREFIX cprmv: <https://cprmv.open-regels.nl/0.3.2/>'
    );
  });

  test('falls back to the default namespace for an unrecognised version', async () => {
    respondWith({});

    await getDatasetVersionsByRulesetid(uniqueEndpoint(), '9.9.9');

    expect(mockExecuteQuery.mock.calls[0][1]).toContain(`PREFIX cprmv: <${NS_030}>`);
  });

  test('groups the records by ruleset id', async () => {
    respondWith({
      meta: [
        {
          rulesetId: lit('BWBR0015703'),
          issued: lit('2026-05-15T06:57:11Z'),
          version: lit('2026-01-01'),
          title: lit('Participatiewet'),
        },
        { rulesetId: lit('BWBR0002222'), issued: lit('2026-01-02T00:00:00Z') },
      ],
    });

    const result = await getDatasetVersionsByRulesetid(uniqueEndpoint());

    expect(result.BWBR0015703).toEqual([
      { version: '2026-01-01', publishedAt: '2026-05-15T06:57:11Z', title: 'Participatiewet' },
    ]);
    expect(result.BWBR0002222).toEqual([
      { version: null, publishedAt: '2026-01-02T00:00:00Z', title: null },
    ]);
  });

  test('keeps every applicable period of the same law', async () => {
    respondWith({
      meta: [
        {
          rulesetId: lit('BWBR1'),
          issued: lit('2025-01-01T00:00:00Z'),
          version: lit('2025-01-01'),
        },
        {
          rulesetId: lit('BWBR1'),
          issued: lit('2026-01-01T00:00:00Z'),
          version: lit('2026-01-01'),
        },
      ],
    });

    const result = await getDatasetVersionsByRulesetid(uniqueEndpoint());

    expect(result.BWBR1).toHaveLength(2);
  });

  test('sorts versions descending so [0] is the most recent applicable period', async () => {
    respondWith({
      meta: [
        {
          rulesetId: lit('BWBR1'),
          issued: lit('2025-01-01T00:00:00Z'),
          version: lit('2025-01-01'),
        },
        {
          rulesetId: lit('BWBR1'),
          issued: lit('2026-01-01T00:00:00Z'),
          version: lit('2026-01-01'),
        },
      ],
    });

    const result = await getDatasetVersionsByRulesetid(uniqueEndpoint());

    expect(result.BWBR1.map((v) => v.version)).toEqual(['2026-01-01', '2025-01-01']);
  });

  test('sorts unversioned non-primary records last', async () => {
    respondWith({
      meta: [
        { rulesetId: lit('BWBR1'), issued: lit('2026-06-01T00:00:00Z') },
        {
          rulesetId: lit('BWBR1'),
          issued: lit('2025-01-01T00:00:00Z'),
          version: lit('2025-01-01'),
        },
      ],
    });

    const result = await getDatasetVersionsByRulesetid(uniqueEndpoint());

    expect(result.BWBR1.map((v) => v.version)).toEqual(['2025-01-01', null]);
  });

  test('breaks a version tie on publication time, most recent first', async () => {
    respondWith({
      meta: [
        { rulesetId: lit('BWBR1'), issued: lit('2026-01-01T00:00:00Z'), version: lit('v1') },
        { rulesetId: lit('BWBR1'), issued: lit('2026-06-01T00:00:00Z'), version: lit('v1') },
      ],
    });

    const result = await getDatasetVersionsByRulesetid(uniqueEndpoint());

    expect(result.BWBR1.map((v) => v.publishedAt)).toEqual([
      '2026-06-01T00:00:00Z',
      '2026-01-01T00:00:00Z',
    ]);
  });

  test('orders unversioned records by publication time', async () => {
    respondWith({
      meta: [
        { rulesetId: lit('BWBR1'), issued: lit('2025-01-01T00:00:00Z') },
        { rulesetId: lit('BWBR1'), issued: lit('2026-01-01T00:00:00Z') },
      ],
    });

    const result = await getDatasetVersionsByRulesetid(uniqueEndpoint());

    expect(result.BWBR1.map((v) => v.publishedAt)).toEqual([
      '2026-01-01T00:00:00Z',
      '2025-01-01T00:00:00Z',
    ]);
  });

  test.each([
    ['no ruleset id', { issued: lit('2026-01-01T00:00:00Z') }],
    ['no publication date', { rulesetId: lit('BWBR1') }],
  ])('silently skips a malformed record with %s', async (_label, row) => {
    respondWith({ meta: [row] });

    await expect(getDatasetVersionsByRulesetid(uniqueEndpoint())).resolves.toEqual({});
  });

  test('serves a repeat call from the cache', async () => {
    respondWith({ meta: [{ rulesetId: lit('BWBR1'), issued: lit('2026-01-01T00:00:00Z') }] });
    const endpoint = uniqueEndpoint();

    await getDatasetVersionsByRulesetid(endpoint);
    await getDatasetVersionsByRulesetid(endpoint);

    expect(mockExecuteQuery).toHaveBeenCalledTimes(1);
  });

  test('caches per version, since each queries a different namespace', async () => {
    respondWith({ meta: [] });
    const endpoint = uniqueEndpoint();

    await getDatasetVersionsByRulesetid(endpoint, '0.3.0');
    await getDatasetVersionsByRulesetid(endpoint, '0.3.2');

    expect(mockExecuteQuery).toHaveBeenCalledTimes(2);
  });

  test('degrades to an empty map when the metadata query fails', async () => {
    mockExecuteQuery.mockRejectedValue(new Error('endpoint unreachable'));

    await expect(getDatasetVersionsByRulesetid(uniqueEndpoint())).resolves.toEqual({});
  });

  test('falls back to the configured endpoint when none is supplied', async () => {
    configMock.triplydb.endpoint = uniqueEndpoint();
    respondWith({});

    await getDatasetVersionsByRulesetid();

    expect(mockExecuteQuery.mock.calls[0][0]).toBe(configMock.triplydb.endpoint);
  });
});

describe('getAllNorms query construction', () => {
  test('fails when there is no endpoint to query', async () => {
    configMock.triplydb.endpoint = '';

    await expect(getAllNorms()).rejects.toThrow(
      'No SPARQL endpoint configured — set TRIPLYDB_ENDPOINT or pass ?endpoint='
    );
  });

  test('queries flat cprmv:Rule resources with no filters by default', async () => {
    respondWith({});

    await getAllNorms(uniqueEndpoint());

    const query = queryFor('cprmv:Rule');
    expect(query).toContain('?rule a cprmv:Rule');
    expect(query).not.toContain('FILTER');
  });

  test('filters on an exact ruleset id', async () => {
    respondWith({});

    await getAllNorms(uniqueEndpoint(), { rulesetid: 'BWBR0015703' });

    expect(queryFor('cprmv:Rule')).toContain('FILTER(STR(?rulesetId) = "BWBR0015703")');
  });

  test('filters on the applicable date embedded in the rule id path', async () => {
    respondWith({});

    await getAllNorms(uniqueEndpoint(), { applicableDate: '2026-01-01' });

    expect(queryFor('cprmv:Rule')).toContain('FILTER(CONTAINS(STR(?ruleIdPath), "_2026-01-01_"))');
  });

  test('combines both filters', async () => {
    respondWith({});

    await getAllNorms(uniqueEndpoint(), { rulesetid: 'BWBR1', applicableDate: '2026-01-01' });

    const query = queryFor('cprmv:Rule');
    expect(query).toContain('STR(?rulesetId) = "BWBR1"');
    expect(query).toContain('_2026-01-01_');
  });

  test('swaps the namespace for the requested CPRMV version', async () => {
    respondWith({});

    await getAllNorms(uniqueEndpoint(), undefined, '0.4.1');

    expect(queryFor('cprmv:Rule')).toContain(`PREFIX cprmv: <${NS_041}>`);
  });
});

describe('getAllNorms rule mapping', () => {
  test('emits rules in the publish format, namespaced by the requested version', async () => {
    respondWith({ rules: [ruleRow()] });

    const result = await getAllNorms(uniqueEndpoint());

    expect(result.rules[0]).toEqual({
      [RDF_TYPE]: `${NS_030}Rule`,
      [`${NS_030}id`]: 'r1',
      [`${NS_030}definition`]: 'Een norm',
      rulesetid: 'BWBR0015703',
      applicable_date: '2026-01-01',
      rulesetid_index: 1,
      rule_id_path: 'BWBR0015703_2026-01-01_1',
      rule_id_path_key: 'BWBR0015703',
    });
  });

  test('uses the 0.4.1 term IRIs when that version is requested', async () => {
    respondWith({ rules: [ruleRow()] });

    const result = await getAllNorms(uniqueEndpoint(), undefined, '0.4.1');

    expect(result.rules[0][RDF_TYPE]).toBe(`${NS_041}Rule`);
    // Indexed rather than toHaveProperty: the IRI contains dots, which Jest
    // would otherwise read as a nested property path.
    expect(result.rules[0][`${NS_041}id`]).toBe('r1');
    expect(result.metadata.cprmvVersion).toBe('0.4.1');
  });

  test('parses a rule id path that carries a trailing article reference', async () => {
    respondWith({
      rules: [ruleRow({ ruleIdPath: lit('BWBR0015703_2026-01-01_3, Artikel 5 lid 2') })],
    });

    const [rule] = (await getAllNorms(uniqueEndpoint())).rules;

    expect(rule.applicable_date).toBe('2026-01-01');
    expect(rule.rulesetid_index).toBe(3);
    expect(rule.rule_id_path_key).toBe('BWBR0015703, Artikel 5 lid 2');
  });

  test('leaves the derived path fields null when the path is not canonical', async () => {
    respondWith({ rules: [ruleRow({ ruleIdPath: lit('not-a-canonical-path') })] });

    const [rule] = (await getAllNorms(uniqueEndpoint())).rules;

    expect(rule.applicable_date).toBeNull();
    expect(rule.rulesetid_index).toBeNull();
    expect(rule.rule_id_path_key).toBeNull();
    expect(rule.rule_id_path).toBe('not-a-canonical-path');
  });

  test('includes the optional norm fields only when the graph supplies them', async () => {
    respondWith({
      rules: [ruleRow({ situatie: lit('Bij aanvraag'), norm: lit('€ 1.200'), per: lit('maand') })],
    });

    const [rule] = (await getAllNorms(uniqueEndpoint())).rules;

    expect(rule).toMatchObject({ situatie: 'Bij aanvraag', norm: '€ 1.200', per: 'maand' });
  });

  test('omits the optional norm fields when absent', async () => {
    respondWith({ rules: [ruleRow()] });

    const [rule] = (await getAllNorms(uniqueEndpoint())).rules;

    expect(rule).not.toHaveProperty('situatie');
    expect(rule).not.toHaveProperty('norm');
    expect(rule).not.toHaveProperty('per');
  });

  test('nests contained rules under the version-namespaced contains key', async () => {
    respondWith({
      rules: [
        ruleRow({
          contained: lit('https://example.org/rule/1a'),
          containedId: lit('r1a'),
          containedDefinition: lit('Deelnorm'),
        }),
      ],
    });

    const [rule] = (await getAllNorms(uniqueEndpoint())).rules;

    expect(rule[`${NS_030}contains`]).toEqual({
      r1a: {
        [RDF_TYPE]: `${NS_030}Rule`,
        [`${NS_030}id`]: 'r1a',
        [`${NS_030}definition`]: 'Deelnorm',
      },
    });
  });

  test('collapses the repeated parent rows a contains join produces', async () => {
    respondWith({
      rules: [
        ruleRow({
          contained: lit('c1'),
          containedId: lit('r1a'),
          containedDefinition: lit('Deel A'),
        }),
        ruleRow({
          contained: lit('c2'),
          containedId: lit('r1b'),
          containedDefinition: lit('Deel B'),
        }),
      ],
    });

    const result = await getAllNorms(uniqueEndpoint());

    expect(result.rules).toHaveLength(1);
    expect(Object.keys(result.rules[0][`${NS_030}contains`] as object)).toEqual(['r1a', 'r1b']);
  });

  test('omits the contains key when a rule has no children', async () => {
    respondWith({ rules: [ruleRow()] });

    const [rule] = (await getAllNorms(uniqueEndpoint())).rules;

    // Indexed rather than toHaveProperty: the IRI contains dots, which Jest
    // would otherwise read as a nested property path.
    expect(Object.keys(rule)).not.toContain(`${NS_030}contains`);
  });

  test('ignores a partial contains join', async () => {
    respondWith({ rules: [ruleRow({ contained: lit('c1'), containedId: lit('r1a') })] });

    const [rule] = (await getAllNorms(uniqueEndpoint())).rules;

    expect(Object.keys(rule)).not.toContain(`${NS_030}contains`);
  });

  test('skips a binding with no rule subject', async () => {
    respondWith({ rules: [{ id: lit('orphan') }, ruleRow()] });

    const result = await getAllNorms(uniqueEndpoint());

    expect(result.rules).toHaveLength(1);
  });

  test('defaults missing scalar columns to empty strings rather than undefined', async () => {
    respondWith({ rules: [{ rule: lit('https://example.org/rule/1') }] });

    const [rule] = (await getAllNorms(uniqueEndpoint())).rules;

    expect(rule[`${NS_030}id`]).toBe('');
    expect(rule[`${NS_030}definition`]).toBe('');
    expect(rule.rulesetid).toBe('');
    expect(rule.rule_id_path).toBe('');
  });
});

describe('getAllNorms aggregation and metadata', () => {
  test('counts the norms per ruleset', async () => {
    respondWith({
      rules: [
        ruleRow(),
        ruleRow({ rule: lit('https://example.org/rule/2'), id: lit('r2') }),
        ruleRow({
          rule: lit('https://example.org/rule/3'),
          id: lit('r3'),
          rulesetId: lit('BWBR2222'),
          ruleIdPath: lit('BWBR2222_2026-01-01_1'),
        }),
      ],
    });

    const result = await getAllNorms(uniqueEndpoint());

    expect(result.aggregations.normsPerRulesetid).toEqual({ BWBR0015703: 2, BWBR2222: 1 });
  });

  test('includes dataset metadata only for the rulesets present in the response', async () => {
    respondWith({
      meta: [
        { rulesetId: lit('BWBR0015703'), issued: lit('2026-01-01T00:00:00Z') },
        { rulesetId: lit('UNRELATED'), issued: lit('2026-01-01T00:00:00Z') },
      ],
      rules: [ruleRow()],
    });

    const result = await getAllNorms(uniqueEndpoint());

    expect(Object.keys(result.metadata.datasetVersions)).toEqual(['BWBR0015703']);
  });

  test('lists the metadata keys in sorted order', async () => {
    respondWith({
      meta: [
        { rulesetId: lit('BWBR2222'), issued: lit('2026-01-01T00:00:00Z') },
        { rulesetId: lit('BWBR0015703'), issued: lit('2026-01-01T00:00:00Z') },
      ],
      rules: [
        ruleRow(),
        ruleRow({
          rule: lit('https://example.org/rule/2'),
          rulesetId: lit('BWBR2222'),
          ruleIdPath: lit('BWBR2222_2026-01-01_1'),
        }),
      ],
    });

    const result = await getAllNorms(uniqueEndpoint());

    expect(Object.keys(result.metadata.datasetVersions)).toEqual(['BWBR0015703', 'BWBR2222']);
  });

  test('omits rulesets that have no dataset record at all', async () => {
    respondWith({ meta: [], rules: [ruleRow()] });

    const result = await getAllNorms(uniqueEndpoint());

    expect(result.metadata.datasetVersions).toEqual({});
  });

  test('still serves rules when the metadata query fails', async () => {
    mockExecuteQuery.mockImplementation(async (_e: string, query: string) => {
      if (query.includes('cprmv:Rule')) return bindings([ruleRow()]);
      throw new Error('metadata query failed');
    });

    const result = await getAllNorms(uniqueEndpoint());

    expect(result.rules).toHaveLength(1);
    expect(result.metadata.datasetVersions).toEqual({});
  });

  test('propagates a failure of the rules query itself', async () => {
    mockExecuteQuery.mockImplementation(async (_e: string, query: string) => {
      if (query.includes('cprmv:Rule')) throw new Error('rules query failed');
      return bindings([]);
    });

    await expect(getAllNorms(uniqueEndpoint())).rejects.toThrow('rules query failed');
  });

  test('returns an empty but well-formed result for an empty dataset', async () => {
    respondWith({});

    const result = await getAllNorms(uniqueEndpoint());

    expect(result).toEqual({
      rules: [],
      aggregations: { normsPerRulesetid: {} },
      metadata: { datasetVersions: {}, cprmvVersion: '0.3.0' },
    });
  });

  test('tolerates a result envelope with no bindings key', async () => {
    mockExecuteQuery.mockResolvedValue({});

    const result = await getAllNorms(uniqueEndpoint());

    expect(result.rules).toEqual([]);
  });
});
