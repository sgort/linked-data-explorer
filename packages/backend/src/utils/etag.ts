// packages/backend/src/utils/etag.ts
// HTTP ETag computation for response caching.

import crypto from 'crypto';

export interface DatasetVersionInfo {
  version: string;
  publishedAt: string; // ISO 8601
}

export interface EtagInputs {
  /** Per-rulesetid dataset metadata for every rulesetid present in the
   *  response. Order-independent — entries are sorted by rulesetid before
   *  hashing so the ETag is stable regardless of insertion order. */
  datasetVersions: Record<string, DatasetVersionInfo>;
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
  // Dataset versions: sorted rulesetid → "<id>:<version>:<publishedAt>".
  const datasetPart = Object.keys(inputs.datasetVersions)
    .sort()
    .map((k) => {
      const v = inputs.datasetVersions[k];
      return `${k}:${v.version}:${v.publishedAt}`;
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
  datasetVersions: Record<string, DatasetVersionInfo>
): string | null {
  const timestamps = Object.values(datasetVersions).map((v) =>
    new Date(v.publishedAt).getTime()
  );
  if (timestamps.length === 0) return null;

  const latest = Math.max(...timestamps);
  // Node's Date.prototype.toUTCString() emits exactly the RFC 7231 format.
  return new Date(latest).toUTCString();
}