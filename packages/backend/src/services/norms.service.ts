// packages/backend/src/services/norms.service.ts
// Service for fetching cprmv:Rule paths and norms from a TriplyDB SPARQL
// endpoint and emitting them in the publish format defined by
// cprmv-example.json. Also fetches per-rulesetid dataset metadata (version,
// publication date) used for the dataset_versions envelope field and HTTP
// cache headers.
//
// Data model assumption (TTL example):
//
//   <.../datasets/BWBR0015703_2026-01-01> a cprmv:Dataset ;
//     cprmv:rulesetId "BWBR0015703" ;
//     cprmv:version "2026.1.0" ;
//     cprmv:datePublished "2026-01-15T00:00:00Z"^^xsd:dateTime .
//
// Multiple Dataset resources may share a cprmv:rulesetId over time
// (historical versions). The query picks the latest per rulesetid via a
// FILTER NOT EXISTS subpattern.

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
 * Version metadata for a single ruleset's Dataset record. publishedAt is
 * ISO 8601 (as returned by SPARQL).
 */
export interface DatasetVersionInfo {
  version: string;
  publishedAt: string;
}

/**
 * Snapshot metadata returned alongside rules. `datasetVersions` only
 * contains entries for rulesetids that have a cprmv:Dataset resource
 * in TriplyDB — during rollout this may be a subset of the rulesetids
 * present in `rules`. cprmvVersion is always set.
 */
export interface NormsResult {
  rules: PublishedRule[];
  aggregations: {
    normsPerRulesetid: Record<string, number>;
  };
  metadata: {
    datasetVersions: Record<string, DatasetVersionInfo>;
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

// Fetches ALL cprmv:Dataset records, picking the latest per rulesetid via
// FILTER NOT EXISTS. The NOT EXISTS pattern is generally more efficient than
// a MAX subquery on TriplyDB-hosted Virtuoso/Comunica engines.
const DATASET_METADATA_QUERY = `
PREFIX cprmv: <${CPRMV_NS}>

SELECT ?rulesetId ?version ?published
WHERE {
  ?ds a cprmv:Dataset ;
      cprmv:rulesetId ?rulesetId ;
      cprmv:version ?version ;
      cprmv:datePublished ?published .

  FILTER NOT EXISTS {
    ?other a cprmv:Dataset ;
           cprmv:rulesetId ?rulesetId ;
           cprmv:datePublished ?otherPublished .
    FILTER(?otherPublished > ?published)
  }
}
ORDER BY ?rulesetId
`;

interface MetadataCacheEntry {
  /** Per-rulesetid latest version info. */
  byRulesetid: Record<string, DatasetVersionInfo>;
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
): Promise<Record<string, DatasetVersionInfo>> {
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

    const byRulesetid: Record<string, DatasetVersionInfo> = {};
    for (const b of bindings) {
      const rulesetId = b.rulesetId?.value;
      const version = b.version?.value;
      const published = b.published?.value;
      if (rulesetId && version && published) {
        byRulesetid[rulesetId] = { version, publishedAt: published };
      }
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
    filterClauses.push(
      `  FILTER(CONTAINS(STR(?ruleIdPath), "_${filter.applicableDate}_"))`
    );
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
export async function getAllNorms(
  endpoint?: string,
  filter?: NormsFilter
): Promise<NormsResult> {
  const targetEndpoint = endpoint || config.triplydb.endpoint;

  if (!targetEndpoint) {
    throw new Error(
      'No SPARQL endpoint configured — set TRIPLYDB_ENDPOINT or pass ?endpoint='
    );
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
  // query. Sorted on serialisation by key (route layer uses Object.keys
  // ordering, which preserves insertion order; we insert in rulesetId-sorted
  // order below).
  const datasetVersions: Record<string, DatasetVersionInfo> = {};
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
  // sorted order. Rulesetids without a cprmv:Dataset record are absent.
  for (const rulesetId of Array.from(rulesetIdsInResponse).sort()) {
    const info = allDatasetVersions[rulesetId];
    if (info) {
      datasetVersions[rulesetId] = info;
    }
  }

  logger.info('[Norms Service] Aggregated published rules', {
    count: rules.length,
    rulesets: Object.keys(normsPerRulesetid).length,
    versionedRulesets: Object.keys(datasetVersions).length,
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