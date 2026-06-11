// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../types/shacl-rdf.d.ts" />
// packages/backend/src/services/shacl-validation.service.ts
//
// SHACL validation for CPSV-AP 3.2.0 (+ custom RONL) Turtle files. Mirrors the
// DMN validator's architecture and response shape so the frontend can reuse the
// existing LayerSection / IssueRow components: the result is
// `{ valid, parseError, layers: {...}, summary: { errors, warnings, infos } }`,
// with violations grouped into layers by the shape file they originated from.
//
// Two entry points:
//   - validateFile(content)            — validate the uploaded Turtle against the
//                                         vendored shape set. Fast; no network.
//   - validateMerged(content, endpoint) — fetch the already-published triples for
//                                         the file's subjects from the SPARQL
//                                         endpoint, union them with the uploaded
//                                         content, then validate the result. This
//                                         is the only mode that catches multi-value
//                                         fan-out against live data (e.g. two
//                                         divergent foaf:homepage values on the same
//                                         organisation subject across publications).
//
// Library notes (verified against rdf-validate-shacl 0.6.5 / @rdfjs/dataset 2.0.2 /
// n3 1.26): the validator ships its own RDF environment — do NOT pass a foreign
// `factory`, or its `clownface` lookup breaks. `validate()` is async. Data graphs
// must be DatasetCore instances (with `.match`), so n3 quad arrays are wrapped via
// @rdfjs/dataset before use. Both RDF deps are ESM-only; they load through Node's
// require(esm) (Node >= 20.19 / 22).

import { promises as fs } from 'fs';
import path from 'path';
import { Parser } from 'n3';
import rdfDataset from '@rdfjs/dataset';
import SHACLValidator from 'rdf-validate-shacl';
import { constructGraph } from './triplydb.service';
import { config } from '../utils/config';
import logger from '../utils/logger';

// ── Response types (shape matches DmnValidator's so the UI components are shared) ──

export type ShaclLayerKey = 'cpsv-ap' | 'ronl-custom' | 'cprmv';

export interface ShaclIssue {
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  location?: string;
}

export interface ShaclLayerResult {
  label: string;
  /** false when no shape files were present for this layer (e.g. SEMIC shapes not vendored yet) — lets the UI distinguish "not evaluated" from "passed". */
  loaded: boolean;
  issues: ShaclIssue[];
}

export interface ShaclValidationResult {
  valid: boolean;
  parseError: string | null;
  layers: Record<ShaclLayerKey, ShaclLayerResult>;
  summary: { errors: number; warnings: number; infos: number };
}

// ── Shape layer configuration ─────────────────────────────────────────────────

// shapes/ lives at the package root (packages/backend/shapes). __dirname is
// .../src/services under ts-node and .../dist/services after build; ../../shapes
// resolves to packages/backend/shapes in both. NOTE: the build only emits dist/,
// so the deploy workflow must also copy shapes/ into the deploy bundle (see the
// kickoff follow-up) or these reads return ENOENT in Azure.
const SHAPES_ROOT = path.resolve(__dirname, '../../shapes');

interface LayerSpec {
  key: ShaclLayerKey;
  label: string;
  /** Explicit file list, relative to SHAPES_ROOT. */
  files?: string[];
  /** Directory (relative to SHAPES_ROOT) — every *.ttl inside is loaded. */
  dir?: string;
}

const LAYER_SPECS: LayerSpec[] = [
  {
    key: 'cpsv-ap',
    label: 'CPSV-AP 3.2.0',
    files: ['cpsv-ap/3.2.0/cpsv-ap-SHACL.ttl'],
  },
  {
    key: 'ronl-custom',
    label: 'RONL Custom',
    dir: 'ronl',
  },
  {
    key: 'cprmv',
    label: 'CPRMV 0.4.1',
    files: ['cprmv/0.4.1/cprmv.shacl.ttl'],
  },
];

interface LoadedLayer {
  key: ShaclLayerKey;
  label: string;
  /** null when no shape files are present for this layer (e.g. not vendored yet). */
  validator: SHACLValidator | null;
}

// ── Severity / code mapping ─────────────────────────────────────────────────────

const SH = 'http://www.w3.org/ns/shacl#';

function severityFromTerm(term: { value: string } | null): 'error' | 'warning' | 'info' {
  switch (term?.value) {
    case `${SH}Warning`:
      return 'warning';
    case `${SH}Info`:
      return 'info';
    case `${SH}Violation`:
    default:
      return 'error';
  }
}

// e.g. http://www.w3.org/ns/shacl#MaxCountConstraintComponent -> "SHACL-MAXCOUNT"
function codeFromComponent(term: { value: string } | null): string {
  if (!term?.value) return 'SHACL-CONSTRAINT';
  const local = term.value.split(/[#/]/).pop() ?? '';
  const base = local.replace(/ConstraintComponent$/, '');
  return base ? `SHACL-${base.toUpperCase()}` : 'SHACL-CONSTRAINT';
}

const PREFIXES: ReadonlyArray<[string, string]> = [
  ['foaf', 'http://xmlns.com/foaf/0.1/'],
  ['skos', 'http://www.w3.org/2004/02/skos/core#'],
  ['dct', 'http://purl.org/dc/terms/'],
  ['cv', 'http://data.europa.eu/m8g/'],
  ['ronl', 'https://regels.overheid.nl/ontology#'],
  ['sh', SH],
];

function compact(uri: string | undefined): string {
  if (!uri) return '';
  for (const [prefix, ns] of PREFIXES) {
    if (uri.startsWith(ns)) return `${prefix}:${uri.slice(ns.length)}`;
  }
  return uri;
}

// ── Service ─────────────────────────────────────────────────────────────────────

/**
 * Fetches a SPARQL CONSTRUCT result as Turtle. Injectable so merge-mode can be
 * exercised deterministically in tests with a fixed "already-published" graph;
 * defaults to the real TriplyDB-backed implementation.
 */
type GraphFetcher = (endpoint: string, query: string) => Promise<string>;

export class ShaclValidationService {
  // Shapes are read once and cached for the life of the process. Adding shape
  // files requires a restart (which Azure does on deploy).
  private layersPromise: Promise<LoadedLayer[]> | null = null;

  /** @param fetchGraph SPARQL CONSTRUCT→Turtle fetcher; override in tests. */
  constructor(private readonly fetchGraph: GraphFetcher = constructGraph) {}

  private parse(ttl: string) {
    return new Parser().parse(ttl);
  }

  private toDataset(ttl: string) {
    return rdfDataset.dataset(this.parse(ttl));
  }

  /**
   * Load and cache one SHACLValidator per layer. Missing shape files / directories
   * are tolerated — the corresponding layer simply has no validator and reports no
   * issues (this is the expected state for the CPSV-AP layers until the SEMIC
   * shapes are vendored).
   */
  private loadLayers(): Promise<LoadedLayer[]> {
    if (this.layersPromise) return this.layersPromise;

    this.layersPromise = (async () => {
      const layers: LoadedLayer[] = [];

      for (const spec of LAYER_SPECS) {
        const ttls: string[] = [];

        if (spec.files) {
          for (const rel of spec.files) {
            try {
              ttls.push(await fs.readFile(path.join(SHAPES_ROOT, rel), 'utf8'));
            } catch {
              logger.warn('[SHACL] Shape file not found (layer left empty)', {
                layer: spec.key,
                file: rel,
              });
            }
          }
        }

        if (spec.dir) {
          const dirPath = path.join(SHAPES_ROOT, spec.dir);
          try {
            const entries = await fs.readdir(dirPath);
            for (const name of entries.filter((n) => n.endsWith('.ttl')).sort()) {
              ttls.push(await fs.readFile(path.join(dirPath, name), 'utf8'));
            }
          } catch {
            logger.warn('[SHACL] Shape directory not found (layer left empty)', {
              layer: spec.key,
              dir: spec.dir,
            });
          }
        }

        let validator: SHACLValidator | null = null;
        if (ttls.length > 0) {
          const shapes = rdfDataset.dataset(this.parse(ttls.join('\n')));
          validator = new SHACLValidator(shapes);
        }

        layers.push({ key: spec.key, label: spec.label, validator });
      }

      const loaded = layers.filter((l) => l.validator).map((l) => l.key);
      logger.info('[SHACL] Shape layers loaded', { withShapes: loaded });
      return layers;
    })();

    return this.layersPromise;
  }

  private emptyLayers(): Record<ShaclLayerKey, ShaclLayerResult> {
    return {
      'cprmv' : { label: 'CPRMV 0.4.1', loaded: false, issues: [] },
      'cpsv-ap': { label: 'CPSV-AP 3.2.0', loaded: false, issues: [] },
      'ronl-custom': { label: 'RONL Custom', loaded: false, issues: [] }
    };
  }

  /**
   * List the object values present in `data` for a given (focusNode, path). Used to
   * enrich cardinality violations (maxCount / uniqueLang) with the actual offending
   * values, so the report names them rather than just stating the count is wrong.
   */
  private offendingValues(
    data: RdfDataset,
    focusNode: RdfTerm | null,
    path: RdfTerm | null
  ): string[] {
    if (!focusNode || !path || path.termType !== 'NamedNode') return [];
    const values: string[] = [];
    for (const quad of data.match(focusNode, path, null)) {
      // Normalise whitespace and cap length — published literals (e.g. long
      // multi-line rule descriptions) would otherwise bloat the issue message.
      const normalised = quad.object.value.replace(/\s+/g, ' ').trim();
      values.push(normalised.length > 60 ? `${normalised.slice(0, 60)}…` : normalised);
    }
    return values;
  }

  /**
   * Run every loaded layer's validator against `data` and assemble the combined
   * result. `parseError` is reserved for failures parsing the caller's content and
   * is passed through unchanged here.
   */
  private async runLayers(
    data: RdfDataset,
    parseError: string | null
  ): Promise<ShaclValidationResult> {
    const layers = this.emptyLayers();
    const summary = { errors: 0, warnings: 0, infos: 0 };

    const loaded = await this.loadLayers();

    for (const layer of loaded) {
      layers[layer.key].loaded = layer.validator !== null;
      if (!layer.validator) continue;
      const report = await layer.validator.validate(data);

      for (const result of report.results) {
        const severity = severityFromTerm(result.severity);
        const baseMessage =
          result.message.map((m) => m.value).join('; ') ||
          codeFromComponent(result.sourceConstraintComponent);

        const values = this.offendingValues(data, result.focusNode, result.path);
        const message =
          values.length > 1
            ? `${baseMessage} Found ${values.length} values: ${values.join(', ')}.`
            : baseMessage;

        const location =
          result.focusNode || result.path
            ? `${result.focusNode?.value ?? ''} ${compact(result.path?.value)}`.trim()
            : undefined;

        layers[layer.key].issues.push({
          severity,
          code: codeFromComponent(result.sourceConstraintComponent),
          message,
          location,
        });

        if (severity === 'error') summary.errors++;
        else if (severity === 'warning') summary.warnings++;
        else summary.infos++;
      }
    }

    return {
      valid: parseError === null && summary.errors === 0,
      parseError,
      layers,
      summary,
    };
  }

  /**
   * Validate the uploaded Turtle against the vendored shape set. No network access.
   */
  async validateFile(content: string): Promise<ShaclValidationResult> {
    let data: RdfDataset;
    try {
      data = this.toDataset(content);
    } catch (err) {
      logger.warn('[SHACL] Turtle parse failed (validateFile)', {
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      return {
        valid: false,
        parseError: err instanceof Error ? err.message : 'Failed to parse Turtle content.',
        layers: this.emptyLayers(),
        summary: { errors: 0, warnings: 0, infos: 0 },
      };
    }

    logger.info('[SHACL] validateFile', { contentLength: content.length, triples: data.size });
    return this.runLayers(data, null);
  }

  /**
   * Validate the uploaded Turtle unioned with the triples already published for its
   * subjects on the given SPARQL endpoint. A parse failure of the *uploaded* content
   * short-circuits to a parseError result; a failure fetching/parsing the remote
   * graph throws (surfaced as a 500 by the route), since that is not the caller's
   * input fault.
   */
  async validateMerged(content: string, endpoint?: string): Promise<ShaclValidationResult> {
    let localQuads;
    try {
      localQuads = this.parse(content);
    } catch (err) {
      logger.warn('[SHACL] Turtle parse failed (validateMerged)', {
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      return {
        valid: false,
        parseError: err instanceof Error ? err.message : 'Failed to parse Turtle content.',
        layers: this.emptyLayers(),
        summary: { errors: 0, warnings: 0, infos: 0 },
      };
    }

    // Distinct named subjects in the uploaded file — blank nodes can't be addressed
    // across endpoints, and the fan-out we care about is on named subjects anyway.
    const subjects = new Set<string>();
    for (const quad of localQuads) {
      if (quad.subject.termType === 'NamedNode') subjects.add(quad.subject.value);
    }

    // No named subjects -> nothing to merge against; fall back to file-local.
    if (subjects.size === 0) {
      logger.info('[SHACL] validateMerged: no named subjects, falling back to file-local');
      return this.runLayers(rdfDataset.dataset(localQuads), null);
    }

    const targetEndpoint = endpoint || config.triplydb.endpoint;
    if (!targetEndpoint) {
      throw new Error('No SPARQL endpoint configured — set TRIPLYDB_ENDPOINT or pass an endpoint.');
    }

    const values = Array.from(subjects)
      .map((uri) => `<${uri}>`)
      .join(' ');

    // Standard SPARQL 1.1 CONSTRUCT: the subjects' direct triples plus one level of
    // forward closure on any blank-node objects (addresses, contact points, etc.),
    // so nested shapes in the canonical CPSV-AP set evaluate against a complete
    // bounded description rather than a truncated one.
    const query = `CONSTRUCT {
  ?s ?p ?o .
  ?o ?p2 ?o2 .
}
WHERE {
  VALUES ?s { ${values} }
  ?s ?p ?o .
  OPTIONAL { ?o ?p2 ?o2 . FILTER(isBlank(?o)) }
}`;

    logger.info('[SHACL] validateMerged: fetching published graph', {
      endpoint: targetEndpoint,
      subjects: subjects.size,
    });

    const remoteTtl = await this.fetchGraph(targetEndpoint, query);
    const remoteQuads = this.parse(remoteTtl);

    const merged = rdfDataset.dataset([...localQuads, ...remoteQuads]);
    logger.info('[SHACL] validateMerged: merged graph assembled', {
      localTriples: localQuads.length,
      remoteTriples: remoteQuads.length,
      mergedTriples: merged.size,
    });

    return this.runLayers(merged, null);
  }
}

export const shaclValidationService = new ShaclValidationService();
export default shaclValidationService;
