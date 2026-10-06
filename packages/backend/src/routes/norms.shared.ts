// packages/backend/src/routes/norms.shared.ts
// What /v1/norms and /v2/norms share: input validation, cache headers and the
// JSON envelope. Kept in one place so the two versions cannot drift apart on
// the parts they are meant to agree on.

import { Request, Response } from 'express';
import {
  DatasetVersionInfo,
  NormsResult,
  SUPPORTED_CPRMV_VERSIONS,
} from '../services/norms.service';
import { sendProblem } from '../utils/problem';
import { computeNormsEtag, computeLastModified } from '../utils/etag';

// Filter values reach a SPARQL FILTER clause downstream, so rejecting anything
// outside this character class upfront is the injection-prevention contract;
// the service layer assumes pre-validated input.
const RULESETID_PATTERN = /^[A-Za-z0-9_-]+$/;

// Membership check rather than a regex: the value selects a namespace.
const SUPPORTED_CPRMV_VERSION_SET = new Set(SUPPORTED_CPRMV_VERSIONS);

// Biannual data tolerates generous caching; 1 hour is conservative.
export const CACHE_MAX_AGE_SECONDS = 3600;

/** Sends 400 and returns true when `rulesetid` is given and invalid. */
export function rejectInvalidRulesetid(
  req: Request,
  res: Response,
  rulesetid: string | undefined
): boolean {
  if (rulesetid === undefined || RULESETID_PATTERN.test(rulesetid)) return false;
  sendProblem(res, req, {
    status: 400,
    code: 'INVALID_PARAM',
    detail: 'Invalid rulesetid: must match /^[A-Za-z0-9_-]+$/',
  });
  return true;
}

/** Sends 400 and returns true when `cprmv_version` is given and unsupported. */
export function rejectInvalidCprmvVersion(
  req: Request,
  res: Response,
  version: string | undefined
): boolean {
  if (version === undefined || SUPPORTED_CPRMV_VERSION_SET.has(version)) return false;
  sendProblem(res, req, {
    status: 400,
    code: 'INVALID_PARAM',
    detail: `Invalid cprmv_version: must be one of ${SUPPORTED_CPRMV_VERSIONS.join(', ')}`,
  });
  return true;
}

/**
 * True when every rulesetid in the response has dataset metadata. Partial
 * coverage means a change in an unversioned ruleset cannot be detected, so
 * the caller must answer no-cache.
 */
export function hasCompleteMetadata(result: NormsResult): boolean {
  const ids = Object.keys(result.aggregations.normsPerRulesetid);
  return ids.length > 0 && ids.every((id) => result.metadata.datasetVersions[id]?.length > 0);
}

/** Sets ETag, Last-Modified (when derivable) and a public Cache-Control. */
export function setNormsCacheHeaders(
  res: Response,
  datasetVersions: Record<string, DatasetVersionInfo[]>,
  filterSignature: Record<string, string | undefined>,
  maxAgeSeconds: number = CACHE_MAX_AGE_SECONDS
): void {
  res.set('ETag', computeNormsEtag({ datasetVersions, filterSignature }));
  const lastModified = computeLastModified(datasetVersions);
  if (lastModified) res.set('Last-Modified', lastModified);
  res.set('Cache-Control', `public, max-age=${maxAgeSeconds}`);
}

/**
 * The `data` member of the envelope. Internal camelCase becomes snake_case at
 * the JSON boundary. Each rulesetid maps to a LIST of records, in service
 * order. `extra` adds version-specific members (v2: `valid_on`).
 */
export function toNormsData(
  result: NormsResult,
  extra: Record<string, unknown> = {}
): Record<string, unknown> {
  const datasetVersions: Record<
    string,
    Array<{
      version: string | null;
      published_at: string;
      title: string | null;
    }>
  > = {};
  for (const [id, list] of Object.entries(result.metadata.datasetVersions)) {
    datasetVersions[id] = list.map((v) => ({
      version: v.version,
      published_at: v.publishedAt,
      title: v.title,
    }));
  }

  return {
    total: result.rules.length,
    ...extra,
    dataset_versions: datasetVersions,
    cprmv_version: result.metadata.cprmvVersion,
    aggregations: {
      norms_per_rulesetid: result.aggregations.normsPerRulesetid,
    },
    rules: result.rules,
  };
}
