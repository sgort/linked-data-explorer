// packages/backend/src/routes/norms.routes.ts
// Exposes the cprmv:Rule publish format consumed by the SPARQL editor's
// norm publisher. The shape returned by getAllNorms matches
// cprmv-example.json verbatim, with one addition: `applicable_date`
// (parsed from the dated segment of `rule_id_path`) inserted between
// `rulesetid` and `rule_id_path`.

import { Router, Request, Response } from 'express';
import { getAllNorms } from '../services/norms.service';
import { ApiResponse } from '../types/api.types';
import { getErrorMessage, getErrorDetails } from '../utils/errors';
import logger from '../utils/logger';
import packageJson from '../../package.json';

const router = Router();

// Strict validation patterns for filter query parameters. Filter values
// are interpolated directly into a SPARQL FILTER clause downstream, so
// rejecting anything outside these character classes upfront is the
// injection-prevention contract — the service layer assumes pre-validated
// input. A bad value short-circuits with a 400 before any SPARQL fires.
const RULESETID_PATTERN = /^[A-Za-z0-9_-]+$/;
const APPLICABLE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /v1/norms
 * List all cprmv:Rule paths and norms in the configured TriplyDB dataset.
 *
 * Each rule object is emitted in the publish format defined by
 * cprmv-example.json — fully-qualified URI keys for type/id/definition/
 * contains, short keys for situatie/norm/per/rulesetid/applicable_date/
 * rule_id_path.
 *
 * Query parameters (all optional, may be combined):
 *   endpoint          — SPARQL endpoint URL. Defaults to
 *                       config.triplydb.endpoint (TRIPLYDB_ENDPOINT) when
 *                       omitted, matching the pattern used by /v1/dmns.
 *   rulesetid         — Exact-match filter on cprmv:rulesetId
 *                       (e.g. "BWBR0015703"). Must match
 *                       /^[A-Za-z0-9_-]+$/ or the request is rejected
 *                       with 400.
 *   applicable_date   — Filter on the dated segment of cprmv:ruleIdPath
 *                       (e.g. "2026-01-01" matches paths containing
 *                       "_2026-01-01_"). Must match /^\d{4}-\d{2}-\d{2}$/
 *                       or the request is rejected with 400.
 *
 * Compliance notes:
 * - API-05: noun-based resource name "norms"
 * - API-20: GET for read
 * - API-57: API-Version header
 *
 * Response shape: ApiResponse<{ total: number; rules: PublishedRule[] }>
 * The editor extracts response.data.rules to obtain the array in
 * publish-ready form. `total` reflects the filtered count.
 *
 * Examples:
 *   GET /v1/norms
 *   GET /v1/norms?rulesetid=BWBR0015703
 *   GET /v1/norms?applicable_date=2026-01-01
 *   GET /v1/norms?rulesetid=BWBR0015703&applicable_date=2026-01-01
 *   GET /v1/norms?endpoint=https://api.open-regels.triply.cc/datasets/stevengort/RONL/services/RONL/sparql
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
    logger.info('Norms list request', {
      endpoint: requestedEndpoint || 'default',
      ...(rulesetid && { rulesetid }),
      ...(applicableDate && { applicableDate }),
    });

    const rules = await getAllNorms(requestedEndpoint, {
      rulesetid,
      applicableDate,
    });

    res.json({
      success: true,
      data: {
        total: rules.length,
        rules,
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

export default router;