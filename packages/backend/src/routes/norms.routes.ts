// packages/backend/src/routes/norms.routes.ts
// Exposes the cprmv:Rule publish format consumed by the SPARQL editor's
// norm publisher, with HTTP cache headers for efficient G2G consumption.

import { Router, Request, Response } from 'express';
import {
  getAllNorms,
  getDatasetVersionsByRulesetid,
  DEFAULT_CPRMV_VERSION,
} from '../services/norms.service';
import { ApiResponse } from '../types/api.types';
import { getErrorMessage, getErrorDetails } from '../utils/errors';
import { sendProblem } from '../utils/problem';
import { refuseOptionalEndpoint } from '../utils/outboundUrl';
import {
  hasCompleteMetadata,
  rejectInvalidCprmvVersion,
  rejectInvalidRulesetid,
  setNormsCacheHeaders,
  toNormsData,
} from './norms.shared';
import { scheduledDeprecationMiddleware } from '../middleware/version.middleware';
import logger from '../utils/logger';
import packageJson from '../../package.json';

const router = Router();

// /v1/norms is succeeded by /v2/norms (norms in force on a date, CPRMV 0.4.1
// by default). The stability contract keeps v1 for at least 24 months after
// the deprecation date; these two dates are the ones it publishes.
export const NORMS_V1_DEPRECATED_AT = new Date('2026-11-01T00:00:00Z');
export const NORMS_V1_SUNSET_AT = new Date('2028-11-01T00:00:00Z');

// Mounted before the handler so every response carries it: 200, 304, 4xx, 5xx.
router.use(
  scheduledDeprecationMiddleware({
    deprecatedAt: NORMS_V1_DEPRECATED_AT,
    sunsetAt: NORMS_V1_SUNSET_AT,
    successorPath: '/v2/norms',
  })
);

// v1's applicable_date is a shape check only: an exact match on a period's
// start date. /v2/norms replaces it with valid_on.
const APPLICABLE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /v1/norms
 * List all cprmv:Rule paths and norms in the configured TriplyDB dataset.
 *
 * Response envelope fields (under `data`):
 *   total                number of rules in the filtered result set
 *   dataset_versions     per-rulesetid map: { "<id>": [{ version, published_at, title }] }
 *                        Only contains entries for rulesetids that have a
 *                        version record in TriplyDB.
 *   cprmv_version        CPRMV vocabulary version, e.g. "0.3.0"
 *   aggregations         { norms_per_rulesetid: { <id>: <count> } }
 *   rules                array of PublishedRule objects
 *
 * HTTP cache headers (set only when every rulesetid in the response has a
 * dataset_versions entry): ETag, Last-Modified, Cache-Control public,
 * max-age=3600. If-None-Match / If-Modified-Since → 304. Otherwise
 * Cache-Control: no-cache.
 *
 * Query parameters (all optional, may be combined):
 *   endpoint          SPARQL endpoint URL override
 *   rulesetid         exact-match filter, /^[A-Za-z0-9_-]+$/ or 400
 *   applicable_date   YYYY-MM-DD or 400; exact match on a period's start date
 *   cprmv_version     one of SUPPORTED_CPRMV_VERSIONS or 400; default 0.3.0
 *
 * Compliance notes:
 * - API-05: noun-based resource name "norms"
 * - API-20: GET for read
 * - API-57: API-Version header
 */
router.get('/', async (req: Request, res: Response) => {
  res.set('API-Version', packageJson.version);

  const requestedEndpoint = req.query.endpoint as string | undefined;
  if (refuseOptionalEndpoint(res, req, req.query.endpoint, 'endpoint')) return;
  const rulesetidParam = req.query.rulesetid;
  const applicableDate = req.query.applicable_date as string | undefined;
  const cprmvVersionParam = req.query.cprmv_version;

  if (rejectInvalidRulesetid(req, res, rulesetidParam)) return;
  const rulesetid = rulesetidParam as string | undefined;

  if (applicableDate !== undefined && !APPLICABLE_DATE_PATTERN.test(applicableDate)) {
    sendProblem(res, req, {
      status: 400,
      code: 'INVALID_PARAM',
      detail: 'Invalid applicable_date: must be YYYY-MM-DD',
    });
    return;
  }

  if (rejectInvalidCprmvVersion(req, res, cprmvVersionParam)) return;
  const requestedCprmvVersion = cprmvVersionParam as string | undefined;

  const cprmvVersion = requestedCprmvVersion ?? DEFAULT_CPRMV_VERSION;
  const filterSignature = {
    endpoint: requestedEndpoint,
    rulesetid,
    applicable_date: applicableDate,
    cprmv_version: cprmvVersion,
  };

  try {
    // ETag short-circuit: filtered to a single rulesetid, freshness can be
    // decided from the (cached) metadata map alone, before the rules query.
    if (rulesetid) {
      const allDatasetVersions = await getDatasetVersionsByRulesetid(
        requestedEndpoint,
        cprmvVersion
      );
      const list = allDatasetVersions[rulesetid];

      if (list && list.length > 0) {
        setNormsCacheHeaders(res, { [rulesetid]: list }, filterSignature);
        if (req.fresh) {
          return res.status(304).end();
        }
      }
      // No metadata yet: fall through to the full query without cache headers.
    }

    logger.info('Norms list request', {
      endpoint: requestedEndpoint || 'default',
      ...(rulesetid && { rulesetid }),
      ...(applicableDate && { applicableDate }),
    });

    const result = await getAllNorms(
      requestedEndpoint,
      { rulesetid, applicableDate },
      cprmvVersion
    );

    if (hasCompleteMetadata(result)) {
      setNormsCacheHeaders(res, result.metadata.datasetVersions, filterSignature);
      // Covers the multi-rulesetid case where the consumer's cache is valid.
      if (req.fresh) {
        return res.status(304).end();
      }
    } else {
      res.set('Cache-Control', 'no-cache');
    }

    res.json({
      success: true,
      data: toNormsData(result),
      timestamp: new Date().toISOString(),
    } as ApiResponse);
  } catch (error: unknown) {
    logger.error('Norms list error', getErrorDetails(error));

    sendProblem(res, req, {
      status: 500,
      code: 'QUERY_ERROR',
      detail: getErrorMessage(error),
    });
  }
});

export default router;
