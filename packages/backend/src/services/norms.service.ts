// packages/backend/src/services/norms.service.ts
// Service for fetching cprmv:Rule paths and norms from a TriplyDB SPARQL
// endpoint and emitting them in the publish format defined by
// cprmv-example.json. Also fetches per-rulesetid dataset metadata (version,
// publication date) used for the dataset_versions envelope field and HTTP
// cache headers.
//
// Data model assumption (TTL example, as emitted by the CPSV editor —
// see cprmv-dataset-generation.md in the CPSV editor docs):
//
//   <.../datasets/BWBR0015703_2026-01-01> a cprmv:Dataset, dcat:Dataset ;
//     dct:identifier "BWBR0015703_2026-01-01" ;
//     dct:title "Participatiewet"@nl ;
//     cprmv:rulesetId "BWBR0015703" ;
//     cprmv:implements <https://wetten.overheid.nl/BWBR0015703/2026-01-01> ;
//     dcat:version "2026-01-01" ;
//     dct:issued "2026-05-15T06:57:11Z"^^xsd:dateTime ;
//     dcat:landingPage <https://wetten.overheid.nl/BWBR0015703/2026-01-01> .
//
// Non-primary rulesets (those entering a service via cprmv:Rule references
// rather than as the primary legalResource) omit dct:title and dcat:version
// because the editor doesn't know their values. dct:issued is always
// present and drives latest-pick + cache validity.

import * as triplydbService from './triplydb.service';
import { config } from '../utils/config';
import logger from '../utils/logger';

// CPRMV namespace constants — kept as full URIs because the publish format
// expects fully-qualified property keys for type/id/definition/contains.
const CPRMV_NS = 'https://cprmv.open-regels.nl/0.3.0/';
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const CPRMV_RULE_TYPE = `${CPRMV_NS}Rule`;
const CPRMV_ID = `${CPRMV_NS}id`;
const CPRMV_DEFINITION = `${CPRMV_NS}definition`;
const CPRMV_CONTAINS = `${CPRMV_NS}contains`;

// CPRMV vocabulary version — extracted from the namespace URI so the constant
// stays self-consistent with CPRMV_NS. Surfaced via cprmv_version envelope
// field; describes which vocabulary this BACKEND speaks (independent of
// which data has been published).
const CPRMV_VERSION_MATCH = CPRMV_NS.match(/\/(\d+\.\d+\.\d+)\/?$/);
const CPRMV_VERSION = CPRMV_VERSION_MATCH ? CPRMV_VERSION_MATCH[1] : 'unknown';

// Dataset metadata cache TTL. Biannual data tolerates this happily; the cache
// keeps the metadata SPARQL query off the hot path while still picking up new
// publications within a minute or two.
const META_CACHE_TTL_MS = 60_000;

interface ChildRule {
  [RDF_TYPE]: string;
  [CPRMV_ID]: string;
  [CPRMV_DEFINITION]: string;
}

export type PublishedRule = Record<string, unknown>;

export interface NormsFilter {
  rulesetid?: string;
  applicableDate?: string;
}

/**
 * Version metadata for a single ruleset's cprmv:Dataset record.
 *
 * - `version`: dcat:version. Present only for the primary ruleset (the one
 *   matching the service's legalResource.bwbId in the CPSV editor). Null for
 *   non-primary rulesets — the editor doesn't know their versions.
 * - `publishedAt`: dct:issued. Always present. ISO 8601. The meaningful
 *   signal for cache validity — it changes on every (re-)publication.
 * - `title`: dct:title. Like version, present only for the primary ruleset.
 */
export interface DatasetVersionInfo {
  version: string | null;
  publishedAt: string;
  title: string | null;
}

/**
 * Snapshot metadata returned alongside rules.
 *
 * `datasetVersions` is keyed by `cprmv:rulesetId`; each value is a LIST of
 * cprmv:Dataset records, because different applicable periods of the same
 * law are concurrent rather than competing (e.g. BWBR0015703 has separate
 * Datasets for the 2025-01-01 and 2026-01-01 applicable periods, both
 * authoritative for rules with the matching applicable_date).
 *
 * The list is sorted by version descending with nulls at the end, ties
 * broken by publishedAt descending — `[0]` is the most-recent applicable
 * version of that ruleset. Non-primary rulesets have null versions and
 * sort by publication time only.
 *
 * Only contains entries for rulesetids that have at least one cprmv:Dataset
 * resource in TriplyDB. cprmvVersion is always set.
 */
export interface NormsResult {
  rules: PublishedRule[];
  aggregations: {
    normsPerRulesetid: Record<string, number>;
  };
  metadata: {
    datasetVersions: Record<string, DatasetVersionInfo[]>;
    cprmvVersion: string;
  };
}

// Canonical rule_id_path shape:
//   <rulesetid>_<YYYY-MM-DD>_<index>[, <rest>]
const RULE_ID_PATH_PATTERN = /^([^_]+)_(\d{4}-\d{2}-\d{2})_(\d+)(?:,\s*(.+))?$/;

interface RulePathParts {
  applicableDate: string | null;
  rulesetIdIndex: number | null;
  ruleIdPathKey: string | null;
}

function extractRulePathParts(ruleIdPath: string): RulePathParts {
  const match = ruleIdPath.match(RULE_ID_PATH_PATTERN);
  if (!match) {
    return { applicableDate: null, rulesetIdIndex: null, ruleIdPathKey: null };
  }
  const [, rulesetIdPart, date, indexStr, rest] = match;
  const ruleIdPathKey = rest ? `${rulesetIdPart}, ${rest}` : rulesetIdPart;
  return {
    applicableDate: date,
    rulesetIdIndex: parseInt(indexStr, 10),
    ruleIdPathKey,
  };
}

// =====================================================================
// Dataset metadata (per rulesetid)
// =====================================================================

// Fetches ALL cprmv:Dataset records. Each cprmv:rulesetId may have multiple
// records — different applicable periods of the same law (e.g. 2025-01-01
// and 2026-01-01 of BWBR0015703) are concurrent and authoritative. The
// caller groups by rulesetId and sorts by version desc (nulls last),
// publishedAt desc tie-break.
//
// The CPSV editor's publish format (see cprmv-dataset-generation.md):
//   - dct:issued     — always present, publication timestamp (xsd:dateTime)
//   - dcat:version   — primary ruleset only (the service's legalResource)
//   - dct:title      — primary ruleset only
const DATASET_METADATA_QUERY = `
PREFIX cprmv: <${CPRMV_NS}>
PREFIX dct: <http://purl.org/dc/terms/>
PREFIX dcat: <http://www.w3.org/ns/dcat#>

SELECT ?rulesetId ?version ?issued ?title
WHERE {
  ?ds a cprmv:Dataset ;
      cprmv:rulesetId ?rulesetId ;
      dct:issued ?issued .

  OPTIONAL { ?ds dcat:version ?version }
  OPTIONAL { ?ds dct:title ?title }
}
ORDER BY ?rulesetId DESC(?issued)
`;

interface MetadataCacheEntry {
  /** Per-rulesetid list of dataset records (one per applicable period).
   *  Sorted by version desc, nulls last, publishedAt desc tie-break. */
  byRulesetid: Record<string, DatasetVersionInfo[]>;
  expires: number;
}

// Cache keyed by endpoint URL so different SPARQL endpoints don't share
// metadata. In-memory module-level state — the Azure App Service runs a
// single Node process; the cache is purely an optimisation.
const metaCache = new Map<string, MetadataCacheEntry>();

/**
 * Fetch the latest cprmv:Dataset record per rulesetid from the configured
 * TriplyDB endpoint. Returns a map keyed by rulesetid; rulesetids without
 * a Dataset resource are simply absent from the map.
 *
 * Cached for META_CACHE_TTL_MS per endpoint URL. Network or query errors
 * are logged and return an empty map — /v1/norms still serves data, but
 * with degraded cache headers.
 */
export async function getDatasetVersionsByRulesetid(
  endpoint?: string
): Promise<Record<string, DatasetVersionInfo[]>> {
  const targetEndpoint = endpoint || config.triplydb.endpoint;

  if (!targetEndpoint) return {};

  // Cache hit
  const cached = metaCache.get(targetEndpoint);
  if (cached && cached.expires > Date.now()) {
    return cached.byRulesetid;
  }

  // Cache miss — query SPARQL
  try {
    const data = await triplydbService.executeQuery(targetEndpoint, DATASET_METADATA_QUERY);
    const bindings = data.results?.bindings || [];

    const byRulesetid: Record<string, DatasetVersionInfo[]> = {};
    for (const b of bindings) {
      // Required: rulesetId and dct:issued. Optional: dcat:version, dct:title.
      // A Dataset without dct:issued is malformed and silently skipped.
      const rulesetId = b.rulesetId?.value;
      const issued = b.issued?.value;
      if (!rulesetId || !issued) continue;

      const entry: DatasetVersionInfo = {
        version: b.version?.value ?? null,
        publishedAt: issued,
        title: b.title?.value ?? null,
      };
      (byRulesetid[rulesetId] ||= []).push(entry);
    }

    // Sort each ruleset's list: version desc with nulls at the end, ties
    // broken by publishedAt desc. `[0]` is the most-recent applicable
    // version of that ruleset; non-primary rulesets (all nulls) end up in
    // pure publication-time order.
    //
    // Comparator: a sorts BEFORE b when the function returns a negative
    // number. We want "version desc, nulls last" → null values must always
    // sort AFTER non-null ones; among non-nulls, lexically-greater strings
    // (e.g. "2026-01-01" > "2025-01-01") come first; on equal versions
    // (including both null), publishedAt desc.
    for (const list of Object.values(byRulesetid)) {
      list.sort((a, b) => {
        if (a.version !== b.version) {
          if (a.version === null) return 1;
          if (b.version === null) return -1;
          return a.version < b.version ? 1 : -1;
        }
        // version equal (both strings or both null) → publishedAt desc
        return a.publishedAt < b.publishedAt ? 1 : -1;
      });
    }

    metaCache.set(targetEndpoint, {
      byRulesetid,
      expires: Date.now() + META_CACHE_TTL_MS,
    });

    logger.info('[Norms Service] Dataset metadata fetched', {
      endpoint: targetEndpoint,
      rulesetCount: Object.keys(byRulesetid).length,
    });

    return byRulesetid;
  } catch (error: unknown) {
    logger.warn('[Norms Service] Dataset metadata query failed; serving without cache headers', {
      endpoint: targetEndpoint,
      error: error instanceof Error ? error.message : String(error),
    });
    return {};
  }
}

/**
 * Backend constant accessor for the CPRMV vocabulary version.
 * Exposed for the route layer so it can populate `cprmv_version` even
 * when there are no datasets at all.
 */
export function getCprmvVersion(): string {
  return CPRMV_VERSION;
}

// =====================================================================
// Norms query
// =====================================================================

function buildNormsQuery(filter?: NormsFilter): string {
  const filterClauses: string[] = [];

  if (filter?.rulesetid) {
    filterClauses.push(`  FILTER(STR(?rulesetId) = "${filter.rulesetid}")`);
  }
  if (filter?.applicableDate) {
    filterClauses.push(`  FILTER(CONTAINS(STR(?ruleIdPath), "_${filter.applicableDate}_"))`);
  }

  const filterBlock = filterClauses.length > 0 ? `\n${filterClauses.join('\n')}\n` : '';

  return `
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX cprmv: <${CPRMV_NS}>

SELECT DISTINCT
  ?rule ?id ?definition ?rulesetId ?ruleIdPath
  ?situatie ?norm ?per
  ?contained ?containedId ?containedDefinition
WHERE {
  ?rule a cprmv:Rule ;
        cprmv:id ?id ;
        cprmv:definition ?definition ;
        cprmv:rulesetId ?rulesetId ;
        cprmv:ruleIdPath ?ruleIdPath .
${filterBlock}
  OPTIONAL { ?rule cprmv:situatie ?situatie }
  OPTIONAL { ?rule cprmv:norm ?norm }
  OPTIONAL { ?rule cprmv:per ?per }

  OPTIONAL {
    ?rule cprmv:contains ?contained .
    ?contained a cprmv:Rule ;
               cprmv:id ?containedId ;
               cprmv:definition ?containedDefinition .
  }
}
ORDER BY ?rulesetId ?ruleIdPath ?containedId
`;
}

/**
 * Fetch all cprmv:Rule records, the per-rulesetid aggregation, and the
 * per-rulesetid dataset metadata for any ruleset present in the result.
 * Metadata for rulesetids without a cprmv:Dataset record is simply absent
 * from the returned map; the route layer treats missing entries as a
 * "do not cache" signal.
 */
export async function getAllNorms(endpoint?: string, filter?: NormsFilter): Promise<NormsResult> {
  const targetEndpoint = endpoint || config.triplydb.endpoint;

  if (!targetEndpoint) {
    throw new Error('No SPARQL endpoint configured — set TRIPLYDB_ENDPOINT or pass ?endpoint=');
  }

  logger.info('[Norms Service] Fetching all rule paths and norms', {
    endpoint: targetEndpoint,
    ...(filter?.rulesetid && { rulesetid: filter.rulesetid }),
    ...(filter?.applicableDate && { applicableDate: filter.applicableDate }),
  });

  // Dataset metadata first — cached, cheap. Failures degrade to empty map;
  // we still serve rules data below.
  const allDatasetVersions = await getDatasetVersionsByRulesetid(targetEndpoint);

  const query = buildNormsQuery(filter);
  const data = await triplydbService.executeQuery(targetEndpoint, query);
  const bindings = data.results?.bindings || [];

  logger.info('[Norms Service] SPARQL returned bindings', {
    rowCount: bindings.length,
  });

  interface Accumulator {
    id: string;
    definition: string;
    rulesetId: string;
    ruleIdPath: string;
    applicableDate: string | null;
    rulesetIdIndex: number | null;
    ruleIdPathKey: string | null;
    situatie?: string;
    norm?: string;
    per?: string;
    children: Map<string, ChildRule>;
  }

  const acc = new Map<string, Accumulator>();

  for (const b of bindings) {
    const ruleUri = b.rule?.value;
    if (!ruleUri) continue;

    let entry = acc.get(ruleUri);
    if (!entry) {
      const ruleIdPath = b.ruleIdPath?.value ?? '';
      const parts = extractRulePathParts(ruleIdPath);
      entry = {
        id: b.id?.value ?? '',
        definition: b.definition?.value ?? '',
        rulesetId: b.rulesetId?.value ?? '',
        ruleIdPath,
        applicableDate: parts.applicableDate,
        rulesetIdIndex: parts.rulesetIdIndex,
        ruleIdPathKey: parts.ruleIdPathKey,
        situatie: b.situatie?.value,
        norm: b.norm?.value,
        per: b.per?.value,
        children: new Map(),
      };
      acc.set(ruleUri, entry);
    }

    if (b.contained?.value && b.containedId?.value && b.containedDefinition?.value) {
      entry.children.set(b.containedId.value, {
        [RDF_TYPE]: CPRMV_RULE_TYPE,
        [CPRMV_ID]: b.containedId.value,
        [CPRMV_DEFINITION]: b.containedDefinition.value,
      });
    }
  }

  const rules: PublishedRule[] = [];
  const normsPerRulesetid: Record<string, number> = {};
  // Dataset versions scoped to JUST the rulesetids present in this response —
  // we don't want to leak metadata for unrelated datasets the consumer didn't
  // query. Each entry is a list (one record per applicable period of that
  // ruleset), pre-sorted by getDatasetVersionsByRulesetid.
  const datasetVersions: Record<string, DatasetVersionInfo[]> = {};
  const rulesetIdsInResponse = new Set<string>();

  for (const entry of acc.values()) {
    const rule: PublishedRule = {
      [RDF_TYPE]: CPRMV_RULE_TYPE,
      [CPRMV_ID]: entry.id,
      [CPRMV_DEFINITION]: entry.definition,
      ...(entry.children.size > 0 && {
        [CPRMV_CONTAINS]: Object.fromEntries(entry.children),
      }),
      ...(entry.situatie !== undefined && { situatie: entry.situatie }),
      ...(entry.norm !== undefined && { norm: entry.norm }),
      ...(entry.per !== undefined && { per: entry.per }),
      rulesetid: entry.rulesetId,
      applicable_date: entry.applicableDate,
      rulesetid_index: entry.rulesetIdIndex,
      rule_id_path: entry.ruleIdPath,
      rule_id_path_key: entry.ruleIdPathKey,
    };

    rules.push(rule);
    normsPerRulesetid[entry.rulesetId] = (normsPerRulesetid[entry.rulesetId] || 0) + 1;
    rulesetIdsInResponse.add(entry.rulesetId);
  }

  // Insert dataset metadata for the rulesetids present in the response, in
  // sorted order. Rulesetids without any cprmv:Dataset record are absent
  // (the source map only contains entries we actually retrieved).
  for (const rulesetId of Array.from(rulesetIdsInResponse).sort()) {
    const list = allDatasetVersions[rulesetId];
    if (list && list.length > 0) {
      datasetVersions[rulesetId] = list;
    }
  }

  logger.info('[Norms Service] Aggregated published rules', {
    count: rules.length,
    rulesets: Object.keys(normsPerRulesetid).length,
    versionedRulesets: Object.keys(datasetVersions).length,
    totalDatasetRecords: Object.values(datasetVersions).reduce((n, l) => n + l.length, 0),
  });

  return {
    rules,
    aggregations: { normsPerRulesetid },
    metadata: {
      datasetVersions,
      cprmvVersion: CPRMV_VERSION,
    },
  };
}
