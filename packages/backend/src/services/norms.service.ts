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
 * matches the shape of nested rules in cprmv-example.json.
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
 * The constructor in getAllNorms below inserts keys in the exact order
 * shown in cprmv-example.json, with `applicable_date` inserted between
 * `rulesetid` and `rule_id_path`: type, id, definition, contains?,
 * situatie?, norm?, per?, rulesetid, applicable_date, rule_id_path.
 *
 * `applicable_date` is parsed from the `_YYYY-MM-DD_` segment embedded
 * in `rule_id_path` (e.g. "BWBR0015703_2026-01-01_0, Artikel 20, ..."
 * yields "2026-01-01"). It is `null` when no date matches the pattern.
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

// Extracts "2026-01-01" from "BWBR0015703_2026-01-01_0, Artikel 20, ...".
// Returns null if the path does not contain a dated segment.
const APPLICABLE_DATE_PATTERN = /_(\d{4}-\d{2}-\d{2})_/;

function extractApplicableDate(ruleIdPath: string): string | null {
    const match = ruleIdPath.match(APPLICABLE_DATE_PATTERN);
    return match ? match[1] : null;
}

// SPARQL query mirrors the "All Rule Paths and Norms by Ruleset" sample in
// packages/frontend/src/utils/constants.ts but pulls every attribute the
// publish format needs (id, definition, situatie, norm, per) plus the
// optional cprmv:contains relationship to first-level child rules.
//
// Children are joined via OPTIONAL — when a parent has multiple children
// the result set carries one row per (parent, child) pair, with the
// parent's scalar fields repeated. The aggregation step in getAllNorms
// collapses these rows back into a single object per parent.
//
// Filter clauses (rulesetid and/or applicable_date) are injected after
// the mandatory triple patterns so the SPARQL optimiser can apply them
// before resolving the OPTIONAL branches. The filter values are
// validated upstream in norms.routes.ts against strict character-class
// regexes, so direct string interpolation is safe.
function buildNormsQuery(filter?: NormsFilter): string {
    const filterClauses: string[] = [];

    if (filter?.rulesetid) {
        filterClauses.push(`  FILTER(STR(?rulesetId) = "${filter.rulesetid}")`);
    }
    if (filter?.applicableDate) {
        // CONTAINS on the dated segment: matches e.g. "_2026-01-01_" inside
        // "BWBR0015703_2026-01-01_0, Artikel 20, ...". Underscores on both
        // sides of the date prevent prefix collisions.
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
 * return them in the publish format defined by cprmv-example.json.
 *
 * Aggregation rule: the first SPARQL row seen for a parent rule URI fills
 * the scalar fields (id, definition, rulesetId, ruleIdPath, situatie,
 * norm, per). Every subsequent row for the same parent only contributes
 * an entry to the `contains` map. SPARQL DISTINCT plus the deterministic
 * ORDER BY makes this stable across runs.
 *
 * `applicable_date` is derived once per parent by parsing the
 * `_YYYY-MM-DD_` segment out of `ruleIdPath` (see extractApplicableDate).
 *
 * @param endpoint - Optional SPARQL endpoint URL. Falls back to
 *                   config.triplydb.endpoint (TRIPLYDB_ENDPOINT) when
 *                   omitted, matching the pattern used by dmn.routes.
 * @param filter   - Optional rulesetid / applicableDate filter. Values
 *                   must already be validated against the regexes
 *                   documented on NormsFilter — the route layer is
 *                   responsible for that.
 */
export async function getAllNorms(
    endpoint?: string,
    filter?: NormsFilter
): Promise<PublishedRule[]> {
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
    // example exactly.
    interface Accumulator {
        id: string;
        definition: string;
        rulesetId: string;
        ruleIdPath: string;
        applicableDate: string | null;
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
            entry = {
                id: b.id?.value ?? '',
                definition: b.definition?.value ?? '',
                rulesetId: b.rulesetId?.value ?? '',
                ruleIdPath,
                applicableDate: extractApplicableDate(ruleIdPath),
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

    // Materialise objects in the exact key order shown in cprmv-example.json,
    // with `applicable_date` inserted between `rulesetid` and `rule_id_path`.
    // Order: type, id, definition, contains?, situatie?, norm?, per?,
    // rulesetid, applicable_date, rule_id_path. Conditional spreads keep
    // optional keys omitted entirely (rather than set to undefined) when
    // absent. `applicable_date` is always present — `null` when the path
    // carries no parseable date.
    const rules: PublishedRule[] = [];
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
            rule_id_path: entry.ruleIdPath,
        };

        rules.push(rule);
    }

    logger.info('[Norms Service] Aggregated published rules', {
        count: rules.length,
    });

    return rules;
}