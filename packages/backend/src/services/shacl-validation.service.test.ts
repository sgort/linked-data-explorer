// @rdfjs/dataset and rdf-validate-shacl are ESM-only and reach this service
// through Node's require(esm), which Jest's CommonJS runtime cannot do — so both
// are stubbed, along with n3's parser. The stubs are deliberately thin: what is
// under test here is the service's own layer loading, issue mapping and merge
// logic, not the RDF libraries.

jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

// Turtle stand-in: a newline-separated list of JSON quad arrays, so tests can
// state graph content directly. "INVALID…" simulates a parse failure.
jest.mock('n3', () => ({
  __esModule: true,
  Parser: class {
    parse(ttl: string) {
      if (ttl.startsWith('INVALID')) throw new Error('Unexpected "]" on line 3');
      return ttl
        .split('\n')
        .filter((line) => line.trim())
        .flatMap((line) => JSON.parse(line))
        .map((q: any) => ({
          subject: { termType: q.st ?? 'NamedNode', value: q.s },
          predicate: { termType: 'NamedNode', value: q.p },
          object: { termType: 'Literal', value: q.o },
        }));
    }
  },
}));

jest.mock('@rdfjs/dataset', () => ({
  __esModule: true,
  default: {
    dataset: (quads: any[]) => ({
      size: quads.length,
      quads,
      match: (s: any, p: any) =>
        quads.filter(
          (q) => (!s || q.subject.value === s.value) && (!p || q.predicate.value === p.value)
        ),
    }),
  },
}));

jest.mock('rdf-validate-shacl', () => {
  const state = { reports: [] as any[], instances: 0 };
  class SHACLValidator {
    static state = state;
    private index: number;
    constructor(public shapes: unknown) {
      this.index = state.instances;
      state.instances += 1;
    }
    async validate() {
      return state.reports[this.index] ?? { results: [] };
    }
  }
  return { __esModule: true, default: SHACLValidator };
});

jest.mock('fs', () => ({
  __esModule: true,
  promises: { readFile: jest.fn(), readdir: jest.fn() },
}));

jest.mock('./triplydb.service', () => ({ __esModule: true, constructGraph: jest.fn() }));

const configMock = { triplydb: { endpoint: 'https://default.example/sparql' } };
jest.mock('../utils/config', () => ({
  __esModule: true,
  config: configMock,
  default: configMock,
}));

import { promises as fs } from 'fs';
import SHACLValidator from 'rdf-validate-shacl';
import { constructGraph } from './triplydb.service';
import { ShaclValidationService, shaclValidationService } from './shacl-validation.service';

const mockReadFile = fs.readFile as unknown as jest.Mock;
const mockReaddir = fs.readdir as unknown as jest.Mock;
const mockConstructGraph = constructGraph as jest.Mock;
const validatorState = (
  SHACLValidator as unknown as { state: { reports: any[]; instances: number } }
).state;

const SH = 'http://www.w3.org/ns/shacl#';

/** Serialise quads into the stand-in Turtle the mocked parser understands. */
function ttl(quads: Array<{ s: string; p: string; o: string; st?: string }>) {
  return JSON.stringify(quads);
}

const SHAPE_TTL = ttl([{ s: 'shape', p: 'a', o: 'sh:NodeShape' }]);

// Key presence rather than ?? so an explicit null override survives — several
// cases exist precisely to exercise the "term is absent" branches.
function shaclResult(over: Partial<Record<string, any>> = {}) {
  const pick = (key: string, fallback: unknown) => (key in over ? over[key] : fallback);
  return {
    severity: pick('severity', { value: `${SH}Violation` }),
    message: pick('message', [{ value: 'Boodschap' }]),
    sourceConstraintComponent: pick('sourceConstraintComponent', {
      value: `${SH}MinCountConstraintComponent`,
    }),
    focusNode: pick('focusNode', null),
    path: pick('path', null),
  };
}

/** Make every layer resolve to a validator. */
function allShapesPresent() {
  mockReadFile.mockResolvedValue(SHAPE_TTL);
  mockReaddir.mockResolvedValue(['a.ttl', 'b.ttl', 'notes.md']);
}

function service() {
  return new ShaclValidationService();
}

beforeEach(() => {
  mockReadFile.mockReset();
  mockReaddir.mockReset();
  mockConstructGraph.mockReset();
  validatorState.reports = [];
  validatorState.instances = 0;
  configMock.triplydb.endpoint = 'https://default.example/sparql';
});

describe('shape layer loading', () => {
  test('loads a validator for each layer that has shape files', async () => {
    allShapesPresent();

    const result = await service().validateFile(ttl([]));

    expect(result.layers['cpsv-ap'].loaded).toBe(true);
    expect(result.layers['ronl-custom'].loaded).toBe(true);
    expect(result.layers.cprmv.loaded).toBe(true);
  });

  test('reads the vendored shape files from the package shapes/ directory', async () => {
    allShapesPresent();

    await service().validateFile(ttl([]));

    const paths = mockReadFile.mock.calls.map(([p]: [string]) => p.replace(/\\/g, '/'));
    expect(paths.some((p) => p.endsWith('shapes/cpsv-ap/3.2.0/cpsv-ap-SHACL.ttl'))).toBe(true);
    expect(paths.some((p) => p.endsWith('shapes/cprmv/0.4.1/cprmv.shacl.ttl'))).toBe(true);
  });

  test('loads only .ttl files from a shape directory, in sorted order', async () => {
    allShapesPresent();
    mockReaddir.mockResolvedValue(['z.ttl', 'a.ttl', 'readme.md']);

    await service().validateFile(ttl([]));

    const dirReads = mockReadFile.mock.calls
      .map(([p]: [string]) => p.replace(/\\/g, '/'))
      .filter((p) => p.includes('/shapes/ronl/'));
    expect(dirReads.map((p) => p.split('/').pop())).toEqual(['a.ttl', 'z.ttl']);
  });

  test('leaves a layer unloaded when its shape file is missing', async () => {
    mockReadFile.mockRejectedValue(new Error('ENOENT'));
    mockReaddir.mockResolvedValue([]);

    const result = await service().validateFile(ttl([]));

    expect(result.layers['cpsv-ap'].loaded).toBe(false);
    expect(result.layers.cprmv.loaded).toBe(false);
    expect(result.valid).toBe(true);
  });

  test('leaves a layer unloaded when its shape directory is missing', async () => {
    mockReadFile.mockResolvedValue(SHAPE_TTL);
    mockReaddir.mockRejectedValue(new Error('ENOENT'));

    const result = await service().validateFile(ttl([]));

    expect(result.layers['ronl-custom'].loaded).toBe(false);
    expect(result.layers['cpsv-ap'].loaded).toBe(true);
  });

  test('reads the shapes once and reuses them for later validations', async () => {
    allShapesPresent();
    const svc = service();

    await svc.validateFile(ttl([]));
    const readsAfterFirst = mockReadFile.mock.calls.length;
    await svc.validateFile(ttl([]));

    expect(mockReadFile.mock.calls).toHaveLength(readsAfterFirst);
  });
});

describe('validateFile', () => {
  test('reports a Turtle parse failure without running any layer', async () => {
    allShapesPresent();

    const result = await service().validateFile('INVALID turtle');

    expect(result.valid).toBe(false);
    expect(result.parseError).toBe('Unexpected "]" on line 3');
    expect(result.summary).toEqual({ errors: 0, warnings: 0, infos: 0 });
    expect(result.layers['cpsv-ap']).toEqual({
      label: 'CPSV-AP 3.2.0',
      loaded: false,
      issues: [],
    });
  });

  test('passes a conforming graph', async () => {
    allShapesPresent();

    const result = await service().validateFile(ttl([{ s: 'a', p: 'b', o: 'c' }]));

    expect(result).toMatchObject({
      valid: true,
      parseError: null,
      summary: { errors: 0, warnings: 0, infos: 0 },
    });
  });

  test('attributes each violation to the layer whose shapes produced it', async () => {
    allShapesPresent();
    validatorState.reports = [
      { results: [shaclResult({ message: [{ value: 'CPSV probleem' }] })] },
      { results: [] },
      { results: [shaclResult({ message: [{ value: 'CPRMV probleem' }] })] },
    ];

    const result = await service().validateFile(ttl([{ s: 'a', p: 'b', o: 'c' }]));

    expect(result.layers['cpsv-ap'].issues[0].message).toBe('CPSV probleem');
    expect(result.layers['ronl-custom'].issues).toEqual([]);
    expect(result.layers.cprmv.issues[0].message).toBe('CPRMV probleem');
  });
});

describe('severity mapping', () => {
  test.each([
    [`${SH}Violation`, 'error'],
    [`${SH}Warning`, 'warning'],
    [`${SH}Info`, 'info'],
  ])('maps sh:%s to %s', async (term, expected) => {
    allShapesPresent();
    validatorState.reports = [{ results: [shaclResult({ severity: { value: term } })] }];

    const result = await service().validateFile(ttl([]));

    expect(result.layers['cpsv-ap'].issues[0].severity).toBe(expected);
  });

  test('treats an unknown or absent severity as an error', async () => {
    allShapesPresent();
    validatorState.reports = [{ results: [shaclResult({ severity: null })] }];

    const result = await service().validateFile(ttl([]));

    expect(result.layers['cpsv-ap'].issues[0].severity).toBe('error');
  });
});

describe('constraint code mapping', () => {
  test.each([
    [`${SH}MaxCountConstraintComponent`, 'SHACL-MAXCOUNT'],
    [`${SH}MinCountConstraintComponent`, 'SHACL-MINCOUNT'],
    [`${SH}UniqueLangConstraintComponent`, 'SHACL-UNIQUELANG'],
  ])('turns %s into %s', async (term, expected) => {
    allShapesPresent();
    validatorState.reports = [
      { results: [shaclResult({ sourceConstraintComponent: { value: term } })] },
    ];

    const result = await service().validateFile(ttl([]));

    expect(result.layers['cpsv-ap'].issues[0].code).toBe(expected);
  });

  test('falls back to a generic code when no constraint component is reported', async () => {
    allShapesPresent();
    validatorState.reports = [{ results: [shaclResult({ sourceConstraintComponent: null })] }];

    const result = await service().validateFile(ttl([]));

    expect(result.layers['cpsv-ap'].issues[0].code).toBe('SHACL-CONSTRAINT');
  });

  test('falls back to a generic code for a component IRI with no local name', async () => {
    allShapesPresent();
    validatorState.reports = [
      { results: [shaclResult({ sourceConstraintComponent: { value: `${SH}` } })] },
    ];

    const result = await service().validateFile(ttl([]));

    expect(result.layers['cpsv-ap'].issues[0].code).toBe('SHACL-CONSTRAINT');
  });
});

describe('issue messages', () => {
  test('joins multiple shape messages', async () => {
    allShapesPresent();
    validatorState.reports = [
      { results: [shaclResult({ message: [{ value: 'Eerste' }, { value: 'Tweede' }] })] },
    ];

    const result = await service().validateFile(ttl([]));

    expect(result.layers['cpsv-ap'].issues[0].message).toBe('Eerste; Tweede');
  });

  test('falls back to the constraint code when the shape carries no message', async () => {
    allShapesPresent();
    validatorState.reports = [
      {
        results: [
          shaclResult({
            message: [],
            sourceConstraintComponent: { value: `${SH}MaxCountConstraintComponent` },
          }),
        ],
      },
    ];

    const result = await service().validateFile(ttl([]));

    expect(result.layers['cpsv-ap'].issues[0].message).toBe('SHACL-MAXCOUNT');
  });

  test('names the offending values when a cardinality constraint is violated', async () => {
    allShapesPresent();
    const focusNode = { termType: 'NamedNode', value: 'https://example.org/org/1' };
    const path = { termType: 'NamedNode', value: 'http://xmlns.com/foaf/0.1/homepage' };
    validatorState.reports = [
      { results: [shaclResult({ message: [{ value: 'Te veel waarden.' }], focusNode, path })] },
    ];

    const result = await service().validateFile(
      ttl([
        {
          s: 'https://example.org/org/1',
          p: 'http://xmlns.com/foaf/0.1/homepage',
          o: 'https://a.nl',
        },
        {
          s: 'https://example.org/org/1',
          p: 'http://xmlns.com/foaf/0.1/homepage',
          o: 'https://b.nl',
        },
      ])
    );

    expect(result.layers['cpsv-ap'].issues[0].message).toBe(
      'Te veel waarden. Found 2 values: https://a.nl, https://b.nl.'
    );
  });

  test('leaves a single-value violation message alone', async () => {
    allShapesPresent();
    const focusNode = { termType: 'NamedNode', value: 'https://example.org/org/1' };
    const path = { termType: 'NamedNode', value: 'http://xmlns.com/foaf/0.1/homepage' };
    validatorState.reports = [
      { results: [shaclResult({ message: [{ value: 'Fout.' }], focusNode, path })] },
    ];

    const result = await service().validateFile(
      ttl([
        {
          s: 'https://example.org/org/1',
          p: 'http://xmlns.com/foaf/0.1/homepage',
          o: 'https://a.nl',
        },
      ])
    );

    expect(result.layers['cpsv-ap'].issues[0].message).toBe('Fout.');
  });

  test('normalises whitespace inside reported values', async () => {
    allShapesPresent();
    const focusNode = { termType: 'NamedNode', value: 's' };
    const path = { termType: 'NamedNode', value: 'p' };
    validatorState.reports = [{ results: [shaclResult({ focusNode, path })] }];

    const result = await service().validateFile(
      ttl([
        { s: 's', p: 'p', o: '  eerste\n  waarde ' },
        { s: 's', p: 'p', o: 'tweede' },
      ])
    );

    expect(result.layers['cpsv-ap'].issues[0].message).toContain('eerste waarde, tweede');
  });

  test('does not look up values for a blank-node path', async () => {
    allShapesPresent();
    const focusNode = { termType: 'NamedNode', value: 's' };
    const path = { termType: 'BlankNode', value: '_:b0' };
    validatorState.reports = [
      { results: [shaclResult({ message: [{ value: 'Fout.' }], focusNode, path })] },
    ];

    const result = await service().validateFile(
      ttl([
        { s: 's', p: '_:b0', o: 'a' },
        { s: 's', p: '_:b0', o: 'b' },
      ])
    );

    expect(result.layers['cpsv-ap'].issues[0].message).toBe('Fout.');
  });
});

describe('issue locations', () => {
  test('combines the focus node with a compacted path', async () => {
    allShapesPresent();
    validatorState.reports = [
      {
        results: [
          shaclResult({
            focusNode: { termType: 'NamedNode', value: 'https://example.org/org/1' },
            path: { termType: 'NamedNode', value: 'http://xmlns.com/foaf/0.1/homepage' },
          }),
        ],
      },
    ];

    const result = await service().validateFile(ttl([]));

    expect(result.layers['cpsv-ap'].issues[0].location).toBe(
      'https://example.org/org/1 foaf:homepage'
    );
  });

  test.each([
    ['skos', 'http://www.w3.org/2004/02/skos/core#prefLabel', 'skos:prefLabel'],
    ['dct', 'http://purl.org/dc/terms/title', 'dct:title'],
    ['cv', 'http://data.europa.eu/m8g/hasCompetentAuthority', 'cv:hasCompetentAuthority'],
    ['ronl', 'https://regels.overheid.nl/ontology#implements', 'ronl:implements'],
    ['sh', `${SH}targetClass`, 'sh:targetClass'],
  ])('compacts a %s path', async (_label, uri, expected) => {
    allShapesPresent();
    validatorState.reports = [
      {
        results: [
          shaclResult({
            focusNode: { termType: 'NamedNode', value: 's' },
            path: { termType: 'NamedNode', value: uri },
          }),
        ],
      },
    ];

    const result = await service().validateFile(ttl([]));

    expect(result.layers['cpsv-ap'].issues[0].location).toBe(`s ${expected}`);
  });

  test('leaves an unknown namespace uncompacted', async () => {
    allShapesPresent();
    validatorState.reports = [
      {
        results: [
          shaclResult({
            focusNode: { termType: 'NamedNode', value: 's' },
            path: { termType: 'NamedNode', value: 'https://elders.example/prop' },
          }),
        ],
      },
    ];

    const result = await service().validateFile(ttl([]));

    expect(result.layers['cpsv-ap'].issues[0].location).toBe('s https://elders.example/prop');
  });

  test('reports the focus node alone when there is no path', async () => {
    allShapesPresent();
    validatorState.reports = [
      { results: [shaclResult({ focusNode: { termType: 'NamedNode', value: 's' } })] },
    ];

    const result = await service().validateFile(ttl([]));

    expect(result.layers['cpsv-ap'].issues[0].location).toBe('s');
  });

  test('omits the location when neither focus node nor path is reported', async () => {
    allShapesPresent();
    validatorState.reports = [{ results: [shaclResult()] }];

    const result = await service().validateFile(ttl([]));

    expect(result.layers['cpsv-ap'].issues[0].location).toBeUndefined();
  });
});

describe('result summary', () => {
  test('counts issues by severity across layers', async () => {
    allShapesPresent();
    validatorState.reports = [
      {
        results: [
          shaclResult({ severity: { value: `${SH}Violation` } }),
          shaclResult({ severity: { value: `${SH}Warning` } }),
        ],
      },
      { results: [shaclResult({ severity: { value: `${SH}Info` } })] },
    ];

    const result = await service().validateFile(ttl([]));

    expect(result.summary).toEqual({ errors: 1, warnings: 1, infos: 1 });
  });

  test('is invalid when any violation is present', async () => {
    allShapesPresent();
    validatorState.reports = [{ results: [shaclResult()] }];

    const result = await service().validateFile(ttl([]));

    expect(result.valid).toBe(false);
  });

  test('stays valid when only warnings and infos are present', async () => {
    allShapesPresent();
    validatorState.reports = [
      {
        results: [
          shaclResult({ severity: { value: `${SH}Warning` } }),
          shaclResult({ severity: { value: `${SH}Info` } }),
        ],
      },
    ];

    const result = await service().validateFile(ttl([]));

    expect(result.valid).toBe(true);
  });
});

describe('validateMerged', () => {
  const LOCAL = ttl([
    { s: 'https://example.org/org/1', p: 'http://xmlns.com/foaf/0.1/homepage', o: 'https://a.nl' },
  ]);

  test('reports a parse failure of the uploaded content without fetching anything', async () => {
    allShapesPresent();

    const result = await service().validateMerged('INVALID turtle');

    expect(result.parseError).toBe('Unexpected "]" on line 3');
    expect(result.valid).toBe(false);
    expect(mockConstructGraph).not.toHaveBeenCalled();
  });

  test('fetches the published triples for the file subjects and unions them', async () => {
    allShapesPresent();
    const fetchGraph = jest.fn().mockResolvedValue(
      ttl([
        {
          s: 'https://example.org/org/1',
          p: 'http://xmlns.com/foaf/0.1/homepage',
          o: 'https://b.nl',
        },
      ])
    );
    const focusNode = { termType: 'NamedNode', value: 'https://example.org/org/1' };
    const path = { termType: 'NamedNode', value: 'http://xmlns.com/foaf/0.1/homepage' };
    validatorState.reports = [
      { results: [shaclResult({ message: [{ value: 'Te veel.' }], focusNode, path })] },
    ];

    const result = await new ShaclValidationService(fetchGraph).validateMerged(
      LOCAL,
      'https://triplydb.example/sparql'
    );

    // Only the merged graph contains both homepages — this is the fan-out the
    // merge mode exists to catch.
    expect(result.layers['cpsv-ap'].issues[0].message).toBe(
      'Te veel. Found 2 values: https://a.nl, https://b.nl.'
    );
  });

  test('builds a bounded-description CONSTRUCT over the named subjects', async () => {
    allShapesPresent();
    const fetchGraph = jest.fn().mockResolvedValue(ttl([]));

    await new ShaclValidationService(fetchGraph).validateMerged(
      LOCAL,
      'https://triplydb.example/sparql'
    );

    const [endpoint, query] = fetchGraph.mock.calls[0];
    expect(endpoint).toBe('https://triplydb.example/sparql');
    expect(query).toContain('VALUES ?s { <https://example.org/org/1> }');
    expect(query).toContain('CONSTRUCT');
    expect(query).toContain('OPTIONAL { ?o ?p2 ?o2 . FILTER(isBlank(?o)) }');
  });

  test('falls back to the configured endpoint when none is supplied', async () => {
    allShapesPresent();
    const fetchGraph = jest.fn().mockResolvedValue(ttl([]));

    await new ShaclValidationService(fetchGraph).validateMerged(LOCAL);

    expect(fetchGraph.mock.calls[0][0]).toBe('https://default.example/sparql');
  });

  test('fails when there is no endpoint to merge against', async () => {
    allShapesPresent();
    configMock.triplydb.endpoint = '';

    await expect(service().validateMerged(LOCAL)).rejects.toThrow(
      'No SPARQL endpoint configured — set TRIPLYDB_ENDPOINT or pass an endpoint.'
    );
  });

  test('validates file-locally when the upload has no named subjects', async () => {
    allShapesPresent();
    const fetchGraph = jest.fn();

    const result = await new ShaclValidationService(fetchGraph).validateMerged(
      ttl([{ s: '_:b0', p: 'p', o: 'o', st: 'BlankNode' }])
    );

    expect(fetchGraph).not.toHaveBeenCalled();
    expect(result.valid).toBe(true);
  });

  test('deduplicates the subjects it asks the endpoint about', async () => {
    allShapesPresent();
    const fetchGraph = jest.fn().mockResolvedValue(ttl([]));

    await new ShaclValidationService(fetchGraph).validateMerged(
      ttl([
        { s: 'https://example.org/org/1', p: 'p1', o: 'a' },
        { s: 'https://example.org/org/1', p: 'p2', o: 'b' },
      ])
    );

    const query = fetchGraph.mock.calls[0][1];
    expect(query.match(/<https:\/\/example\.org\/org\/1>/g)).toHaveLength(1);
  });

  test('propagates a failure fetching the published graph, since it is not caller input', async () => {
    allShapesPresent();
    const fetchGraph = jest.fn().mockRejectedValue(new Error('CONSTRUCT failed'));

    await expect(new ShaclValidationService(fetchGraph).validateMerged(LOCAL)).rejects.toThrow(
      'CONSTRUCT failed'
    );
  });
});

describe('module exports', () => {
  test('the singleton is a ShaclValidationService', () => {
    expect(shaclValidationService).toBeInstanceOf(ShaclValidationService);
  });
});
