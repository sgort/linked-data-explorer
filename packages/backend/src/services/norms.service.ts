// packages/backend/src/services/norms.service.ts
// Service for fetching cprmv:Rule paths and norms from a TriplyDB SPARQL
// endpoint and emitting them in the publish format defined by
// cprmv-example.json.

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

/**
 * Child rule inside a `contains` map. Carries only type/id/definition —
 * matches the shape of nested rules in cprmv-example.json. Sub-rules
 * intentionally do not get the per-rule metadata fields (rulesetid,
 * applicable_date, rulesetid_index, rule_id_path, rule_id_path_key) — those
 * apply to top-level rules only.
 */
interface ChildRule {
  [RDF_TYPE]: string;
  [CPRMV_ID]: string;
  [CPRMV_DEFINITION]: string;
}

/**
 * Top-level published rule. Returned as Record<string, unknown> because
 * TypeScript can't enforce insertion order at the type level, and a
 * strict interface would force a constructor-then-overwrite pattern that
 * breaks the order JS publishers rely on.
 *
 * The constructor in getAllNorms below inserts keys in this order:
 *   type, id, definition, contains?, situatie?, norm?, per?,
 *   rulesetid, applicable_date, rulesetid_index,
 *   rule_id_path, rule_id_path_key
 *
 * Fields derived from rule_id_path:
 * - applicable_date  — `2025-07-01` from `BWBR..._2025-07-01_0, ...`
 * - rulesetid_index  — `0` (the integer after the date)
 * - rule_id_path_key — `BWBR0002471, Artikel 2, lid 6` (path with date+index
 *                      removed; stable across versions of the same ruleset)
 *
 * All three are `null` when rule_id_path doesn't match the canonical
 * `<rulesetid>_<YYYY-MM-DD>_<index>[, <rest>]` pattern.
 */
export type PublishedRule = Record<string, unknown>;

/**
 * Filter parameters accepted by getAllNorms. Both fields are pre-validated
 * by the calling route (norms.routes.ts) — rulesetid against
 * /^[A-Za-z0-9_-]+$/ and applicableDate against /^\d{4}-\d{2}-\d{2}$/ —
 * so direct string interpolation into SPARQL is safe here.
 */
export interface NormsFilter {
  rulesetid?: string;
  applicableDate?: string;
}

/**
 * Result envelope returned by getAllNorms. Fields use camelCase internally;
 * the route layer translates to snake_case when serialising to JSON
 * (matching the existing applicableDate -> applicable_date convention).
 */
export interface NormsResult {
  rules: PublishedRule[];
  aggregations: {
    /** Count of top-level rules per cprmv:rulesetId in the filtered result
     *  set. Sum of values equals rules.length. */
    normsPerRulesetid: Record<string, number>;
  };
}

// Canonical rule_id_path shape:
//   <rulesetid>_<YYYY-MM-DD>_<index>[, <rest>]
// Capture groups: 1=rulesetid, 2=date, 3=index, 4=rest (optional)
const RULE_ID_PATH_PATTERN = /^([^_]+)_(\d{4}-\d{2}-\d{2})_(\d+)(?:,\s*(.+))?$/;

interface RulePathParts {
  applicableDate: string | null;
  rulesetIdIndex: number | null;
  ruleIdPathKey: string | null;
}

/**
 * Extract derived fields from a rule_id_path. Returns all-null when the path
 * does not match the canonical shape — the caller renders these as JSON
 * `null` so downstream consumers can detect non-conforming data explicitly.
 *
 * Note: the rulesetid component is parsed from the path itself (group 1)
 * rather than substituted from the explicit cprmv:rulesetId field. In normal
 * data they agree; using the path-prefix here makes rule_id_path_key a pure
 * string transformation of rule_id_path with no cross-field dependency.
 */
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

// SPARQL query mirrors the "All Rule Paths and Norms by Ruleset" sample in
// packages/frontend/src/utils/constants.ts but pulls every attribute the
// publish format needs (id, definition, situatie, norm, per) plus the
// optional cprmv:contains relationship to first-level child rules.
//
// Filter clauses (rulesetid and/or applicable_date) are injected after the
// mandatory triple patterns so the SPARQL optimiser can apply them before
// resolving the OPTIONAL branches. The filter values are validated upstream
// in norms.routes.ts against strict character-class regexes, so direct
// string interpolation is safe.
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
 * Fetch all cprmv:Rule records (with optional contained sub-rules) and
 * return them in the publish format defined by cprmv-example.json, plus
 * a per-rulesetid aggregation over the filtered result set.
 *
 * Aggregation rule: the first SPARQL row seen for a parent rule URI fills
 * the scalar fields. Every subsequent row for the same parent only
 * contributes an entry to the `contains` map. SPARQL DISTINCT plus the
 * deterministic ORDER BY makes this stable across runs.
 *
 * The three rule_id_path-derived fields (applicable_date, rulesetid_index,
 * rule_id_path_key) are computed once per parent by parsing the canonical
 * path shape via extractRulePathParts.
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

  const query = buildNormsQuery(filter);
  const data = await triplydbService.executeQuery(targetEndpoint, query);
  const bindings = data.results?.bindings || [];

  logger.info('[Norms Service] SPARQL returned bindings', {
    rowCount: bindings.length,
  });

  // Intermediate accumulator keyed by parent rule URI. We collect scalar
  // fields plus a children map, then build the final ordered object once
  // per parent after the loop so property insertion order matches the
  // publish format exactly.
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

    // Add contained child if present. SPARQL may yield duplicate
    // (parent, child) pairs across runs; keying by child id makes the
    // operation idempotent (values are identical anyway).
    if (b.contained?.value && b.containedId?.value && b.containedDefinition?.value) {
      entry.children.set(b.containedId.value, {
        [RDF_TYPE]: CPRMV_RULE_TYPE,
        [CPRMV_ID]: b.containedId.value,
        [CPRMV_DEFINITION]: b.containedDefinition.value,
      });
    }
  }

  // Materialise objects in the publish-format key order. Conditional spreads
  // keep optional keys omitted entirely (rather than set to undefined) when
  // absent. The three path-derived fields are always present — `null` when
  // the path carries no parseable shape.
  const rules: PublishedRule[] = [];
  const normsPerRulesetid: Record<string, number> = {};

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

    // Per-rulesetid aggregation. We use the explicit cprmv:rulesetId here
    // (not the parsed path-prefix) so the counts always key by the
    // authoritative value — even if a stray rule has a non-conforming path.
    normsPerRulesetid[entry.rulesetId] = (normsPerRulesetid[entry.rulesetId] || 0) + 1;
  }

  logger.info('[Norms Service] Aggregated published rules', {
    count: rules.length,
    rulesets: Object.keys(normsPerRulesetid).length,
  });

  return {
    rules,
    aggregations: {
      normsPerRulesetid,
    },
  };
}