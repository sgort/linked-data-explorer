// packages/backend/src/utils/etag.ts
// HTTP ETag computation for response caching.

import crypto from 'crypto';

export interface DatasetVersionInfo {
  /** BWB's own version, e.g. "2026-01-01". Null for non-primary rulesets
   *  whose version the publisher doesn't know (only the service's primary
   *  legalResource carries a known version; other rulesets entering via
   *  cprmv:Rule references are version-unknown by construction). */
  version: string | null;
  /** dct:issued — when this Dataset record was published. Always present.
   *  ISO 8601. This is the meaningful signal for cache validity. */
  publishedAt: string;
  /** dct:title — human-readable name like "Participatiewet". Null for
   *  non-primary rulesets (same reason as version). */
  title: string | null;
}

export interface EtagInputs {
  /** Per-rulesetid list of dataset metadata entries. Each rulesetid can carry
   *  multiple cprmv:Dataset records — different applicable periods of the
   *  same law are concurrent, not competing. The list is hashed in caller-
   *  provided order; the route layer pre-sorts (version desc, nulls last,
   *  published_at desc tie-break). */
  datasetVersions: Record<string, DatasetVersionInfo[]>;
  /** All request parameters that affect the response shape. Anything that
   *  changes the rules array must be included. */
  filterSignature: Record<string, string | undefined>;
}

/**
 * Compute a strong ETag for a /v1/norms response.
 *
 * Strong (no `W/` prefix) because the ETag exactly represents the response:
 * given the same per-rulesetid dataset versions and the same filter
 * parameters, the SPARQL ORDER BY makes the response byte-identical.
 *
 * Format: `"<8-hex-hash>"` — fully opaque. Unlike the previous
 * single-version design, there's no meaningful human-readable prefix to
 * embed (a response can span multiple BWB rulesets at different versions).
 * Consumers treat ETags as opaque per HTTP semantics anyway.
 *
 * The hash covers a stable serialisation of:
 *  - All `<rulesetid>:<version>:<publishedAt>` triples, sorted by rulesetid
 *  - All non-undefined filter parameters, sorted by key
 *
 * Joined with `|` between sections and `;` between entries within a section
 * to avoid collision via separator choice.
 */
export function computeNormsEtag(inputs: EtagInputs): string {
  // Dataset versions: sorted by rulesetid; within each rulesetid the list
  // order is preserved (caller-provided sort by version desc, nulls last).
  // Format per entry: "<version|null>:<publishedAt>". Title is intentionally
  // excluded — informational metadata, not part of cache identity. Any
  // title-only update arrives as a new dct:issued anyway, so publishedAt
  // covers it.
  const datasetPart = Object.keys(inputs.datasetVersions)
    .sort()
    .map((k) => {
      const entries = inputs.datasetVersions[k]
        .map((v) => `${v.version ?? 'null'}:${v.publishedAt}`)
        .join(',');
      return `${k}=${entries}`;
    })
    .join(';');

  // Filter signature: drop undefined values BEFORE sorting so semantically-
  // equivalent inputs (`{}` vs `{ rulesetid: undefined }`) hash identically.
  const filterPart = Object.keys(inputs.filterSignature)
    .filter((k) => inputs.filterSignature[k] !== undefined)
    .sort()
    .map((k) => `${k}=${inputs.filterSignature[k]}`)
    .join('|');

  const hash = crypto
    .createHash('sha256')
    .update(`${datasetPart}||${filterPart}`)
    .digest('hex')
    .slice(0, 8);

  return `"${hash}"`;
}

/**
 * Pick the latest publication timestamp across the response's datasets,
 * formatted as RFC 7231 (HTTP-date) for the Last-Modified header.
 *
 * Semantics: a consumer's `If-Modified-Since` returns 304 only when nothing
 * in the response has been republished since their last fetch. Returns null
 * when the input map is empty.
 */
export function computeLastModified(
  datasetVersions: Record<string, DatasetVersionInfo[]>
): string | null {
  const timestamps: number[] = [];
  for (const entries of Object.values(datasetVersions)) {
    for (const v of entries) {
      timestamps.push(new Date(v.publishedAt).getTime());
    }
  }
  if (timestamps.length === 0) return null;

  const latest = Math.max(...timestamps);
  // Node's Date.prototype.toUTCString() emits exactly the RFC 7231 format.
  return new Date(latest).toUTCString();
}
