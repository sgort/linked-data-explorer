// packages/backend/src/routes/norms.routes.ts
// Exposes the cprmv:Rule publish format consumed by the SPARQL editor's
// norm publisher, with HTTP cache headers for efficient G2G consumption.

import { Router, Request, Response } from 'express';
import { getAllNorms, getDatasetVersionsByRulesetid } from '../services/norms.service';
import { ApiResponse } from '../types/api.types';
import { getErrorMessage, getErrorDetails } from '../utils/errors';
import { computeNormsEtag, computeLastModified } from '../utils/etag';
import logger from '../utils/logger';
import packageJson from '../../package.json';

const router = Router();

// Strict validation patterns for filter query parameters. Filter values are
// interpolated directly into a SPARQL FILTER clause downstream, so rejecting
// anything outside these character classes upfront is the injection-prevention
// contract — the service layer assumes pre-validated input.
const RULESETID_PATTERN = /^[A-Za-z0-9_-]+$/;
const APPLICABLE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// Cache-Control max-age. Biannual data tolerates generous caching; 1 hour is
// conservative. Could be longer (12-24h) once the publication cadence is
// observed in production.
const CACHE_MAX_AGE_SECONDS = 3600;

/**
 * GET /v1/norms
 * List all cprmv:Rule paths and norms in the configured TriplyDB dataset.
 *
 * Response envelope fields (under `data`):
 *   total                number of rules in the filtered result set
 *   dataset_versions     per-rulesetid map: { "<id>": { version, published_at } }
 *                        Only contains entries for rulesetids that have a
 *                        cprmv:Dataset record in TriplyDB.
 *   cprmv_version        CPRMV vocabulary version, e.g. "0.3.0"
 *   aggregations         { norms_per_rulesetid: { <id>: <count> } }
 *   rules                array of PublishedRule objects
 *
 * HTTP cache headers (set only when every rulesetid in the response has a
 * dataset_versions entry):
 *   ETag           opaque 8-hex hash over dataset_versions + filter params
 *   Last-Modified  RFC 7231 date — max(published_at) across the response
 *   Cache-Control  public, max-age=<CACHE_MAX_AGE_SECONDS>
 *
 * Conditional requests honoured: If-None-Match against ETag and
 * If-Modified-Since against Last-Modified → 304 Not Modified.
 *
 * When any rulesetid in the response is missing dataset metadata,
 * Cache-Control falls back to `no-cache` and ETag/Last-Modified are omitted.
 * Safe-by-default during rollout: caching kicks in progressively as
 * cprmv:Dataset records are published.
 *
 * Query parameters (all optional, may be combined):
 *   endpoint          SPARQL endpoint URL override
 *   rulesetid         exact-match filter, /^[A-Za-z0-9_-]+$/ or 400
 *   applicable_date   YYYY-MM-DD or 400
 *
 * Compliance notes:
 * - API-05: noun-based resource name "norms"
 * - API-20: GET for read
 * - API-57: API-Version header
 */
router.get('/', async (req: Request, res: Response) => {
  res.set('API-Version', packageJson.version);

  const requestedEndpoint = req.query.endpoint as string | undefined;
  const rulesetid = req.query.rulesetid as string | undefined;
  const applicableDate = req.query.applicable_date as string | undefined;

  // Validate filter inputs upfront. Reject on any pattern mismatch so the
  // service layer can safely treat values as injection-safe.
  if (rulesetid !== undefined && !RULESETID_PATTERN.test(rulesetid)) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_PARAM',
        message: 'Invalid rulesetid: must match /^[A-Za-z0-9_-]+$/',
      },
      timestamp: new Date().toISOString(),
    } as ApiResponse);
  }

  if (applicableDate !== undefined && !APPLICABLE_DATE_PATTERN.test(applicableDate)) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_PARAM',
        message: 'Invalid applicable_date: must be YYYY-MM-DD',
      },
      timestamp: new Date().toISOString(),
    } as ApiResponse);
  }

  try {
    // ETag short-circuit: when the request is filtered to a single rulesetid,
    // we can decide freshness from the (cached) metadata map alone — no need
    // to run the expensive rules query just to find out it would 304.
    //
    // For unfiltered requests we don't know which rulesetids would appear
    // until we run the rules query, so we have to do the full work first
    // and rely on application-level cache on subsequent requests.
    if (rulesetid) {
      const allDatasetVersions = await getDatasetVersionsByRulesetid(requestedEndpoint);
      const list = allDatasetVersions[rulesetid];

      if (list && list.length > 0) {
        const datasetVersionsForEtag = { [rulesetid]: list };
        const etag = computeNormsEtag({
          datasetVersions: datasetVersionsForEtag,
          filterSignature: {
            endpoint: requestedEndpoint,
            rulesetid,
            applicable_date: applicableDate,
          },
        });
        const lastModified = computeLastModified(datasetVersionsForEtag);

        res.set('ETag', etag);
        if (lastModified) res.set('Last-Modified', lastModified);
        res.set('Cache-Control', `public, max-age=${CACHE_MAX_AGE_SECONDS}`);

        if (req.fresh) {
          return res.status(304).end();
        }
      }
      // If `list` is missing, the rulesetid has no Dataset metadata yet.
      // We fall through to the full query without setting cache headers;
      // Cache-Control is set below after we have the full response.
    }

    logger.info('Norms list request', {
      endpoint: requestedEndpoint || 'default',
      ...(rulesetid && { rulesetid }),
      ...(applicableDate && { applicableDate }),
    });

    // Full rules query + aggregation + scoped dataset metadata
    const result = await getAllNorms(requestedEndpoint, {
      rulesetid,
      applicableDate,
    });

    // Cache headers when EVERY rulesetid in the response has dataset metadata.
    // Partial coverage falls back to no-cache: we can't reliably detect a
    // change in an unversioned ruleset, so consumers must always refetch.
    const rulesetIdsInResponse = Object.keys(result.aggregations.normsPerRulesetid);
    const allHaveMetadata =
      rulesetIdsInResponse.length > 0 &&
      rulesetIdsInResponse.every((id) => result.metadata.datasetVersions[id]?.length > 0);

    if (allHaveMetadata) {
      const etag = computeNormsEtag({
        datasetVersions: result.metadata.datasetVersions,
        filterSignature: {
          endpoint: requestedEndpoint,
          rulesetid,
          applicable_date: applicableDate,
        },
      });
      const lastModified = computeLastModified(result.metadata.datasetVersions);

      res.set('ETag', etag);
      if (lastModified) res.set('Last-Modified', lastModified);
      res.set('Cache-Control', `public, max-age=${CACHE_MAX_AGE_SECONDS}`);

      // Honour conditional request on the post-query path too. req.fresh
      // compares the headers we just set against If-None-Match /
      // If-Modified-Since. Unlikely to hit here (we'd have caught it in
      // the short-circuit above for single-rulesetid requests) but covers
      // the multi-rulesetid case where the consumer's cache is still valid.
      if (req.fresh) {
        return res.status(304).end();
      }
    } else {
      res.set('Cache-Control', 'no-cache');
    }

    // Serialise to envelope. Internal camelCase translates to snake_case at
    // the JSON boundary, matching the existing convention for per-rule fields
    // (applicableDate → applicable_date, normsPerRulesetid → norms_per_rulesetid).
    // `version` and `title` are nullable — primary ruleset only.
    //
    // Each rulesetid maps to a LIST of records (one per applicable period),
    // pre-sorted by the service: version desc, nulls last, publishedAt desc
    // tie-break. Consumers wanting "the latest applicable version" take [0].
    const datasetVersionsForJson: Record<
      string,
      Array<{ version: string | null; published_at: string; title: string | null }>
    > = {};
    for (const [k, list] of Object.entries(result.metadata.datasetVersions)) {
      datasetVersionsForJson[k] = list.map((v) => ({
        version: v.version,
        published_at: v.publishedAt,
        title: v.title,
      }));
    }

    res.json({
      success: true,
      data: {
        total: result.rules.length,
        dataset_versions: datasetVersionsForJson,
        cprmv_version: result.metadata.cprmvVersion,
        aggregations: {
          norms_per_rulesetid: result.aggregations.normsPerRulesetid,
        },
        rules: result.rules,
      },
      timestamp: new Date().toISOString(),
    } as ApiResponse);
  } catch (error: unknown) {
    logger.error('Norms list error', getErrorDetails(error));

    res.status(500).json({
      success: false,
      error: {
        code: 'QUERY_ERROR',
        message: getErrorMessage(error),
      },
      timestamp: new Date().toISOString(),
    } as ApiResponse);
  }
});

// getCprmvVersion is exported by the service (norms.service.ts) for potential
// reuse in other routes — e.g. /v1/health could surface it.

export default router;
