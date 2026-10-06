// GET /v2/norms: the norms in force on a date. Succeeds /v1/norms, whose
// default CPRMV version (0.3.0) holds only superseded periods and whose
// applicable_date matched a period's start date exactly.

import { Router, Request, Response } from 'express';
import { DEFAULT_CPRMV_VERSION_V2, getNormsInForce } from '../services/norms.service';
import { ApiResponse } from '../types/api.types';
import { getErrorMessage, getErrorDetails } from '../utils/errors';
import { sendProblem } from '../utils/problem';
import { refuseOptionalEndpoint } from '../utils/outboundUrl';
import {
  isCalendarDate,
  secondsUntilAmsterdamMidnight,
  todayInAmsterdam,
} from '../utils/amsterdamDate';
import {
  CACHE_MAX_AGE_SECONDS,
  hasCompleteMetadata,
  rejectInvalidCprmvVersion,
  rejectInvalidRulesetid,
  setNormsCacheHeaders,
  toNormsData,
} from './norms.shared';
import logger from '../utils/logger';
import packageJson from '../../package.json';

const router = Router();

/**
 * GET /v2/norms
 *
 * Query parameters (all optional):
 *   valid_on        YYYY-MM-DD, a real date; default today in Europe/Amsterdam.
 *                   Per ruleset, the rules of the latest period starting on
 *                   or before this date.
 *   cprmv_version   one of SUPPORTED_CPRMV_VERSIONS; default 0.4.1
 *   rulesetid       /^[A-Za-z0-9_-]+$/
 *   endpoint        SPARQL endpoint override, checked before use (#142)
 *
 * The envelope is v1's plus `valid_on` (the resolved date); dataset_versions
 * holds only the records of the selected periods. A bare request's max-age
 * never reaches past the next Amsterdam midnight, when "today" changes.
 */
router.get('/', async (req: Request, res: Response) => {
  res.set('API-Version', packageJson.version);

  const requestedEndpoint = req.query.endpoint as string | undefined;
  if (refuseOptionalEndpoint(res, req, req.query.endpoint, 'endpoint')) return;

  // A v1 URL ported unchanged would otherwise have its date silently ignored.
  if (req.query.applicable_date !== undefined) {
    sendProblem(res, req, {
      status: 400,
      code: 'INVALID_PARAM',
      detail:
        'applicable_date is not supported on /v2/norms; use valid_on, the date the norms must be in force on',
    });
    return;
  }

  const rulesetidParam = req.query.rulesetid;
  const requestedValidOn = req.query.valid_on;
  const cprmvVersionParam = req.query.cprmv_version;

  if (rejectInvalidRulesetid(req, res, rulesetidParam)) return;
  const rulesetid = rulesetidParam as string | undefined;

  if (requestedValidOn !== undefined && !isCalendarDate(requestedValidOn)) {
    sendProblem(res, req, {
      status: 400,
      code: 'INVALID_PARAM',
      detail: 'Invalid valid_on: must be a calendar date as YYYY-MM-DD',
    });
    return;
  }

  if (rejectInvalidCprmvVersion(req, res, cprmvVersionParam)) return;
  const requestedCprmvVersion = cprmvVersionParam as string | undefined;

  const now = new Date();
  const validOn = (requestedValidOn as string | undefined) ?? todayInAmsterdam(now);
  const cprmvVersion = requestedCprmvVersion ?? DEFAULT_CPRMV_VERSION_V2;
  const maxAge =
    requestedValidOn === undefined
      ? Math.min(CACHE_MAX_AGE_SECONDS, secondsUntilAmsterdamMidnight(now))
      : CACHE_MAX_AGE_SECONDS;

  try {
    logger.info('Norms in force request', {
      endpoint: requestedEndpoint || 'default',
      validOn,
      cprmvVersion,
      ...(rulesetid && { rulesetid }),
    });

    const result = await getNormsInForce(requestedEndpoint, { rulesetid, validOn }, cprmvVersion);

    if (hasCompleteMetadata(result)) {
      setNormsCacheHeaders(
        res,
        result.metadata.datasetVersions,
        {
          api: 'v2',
          endpoint: requestedEndpoint,
          rulesetid,
          valid_on: validOn,
          cprmv_version: cprmvVersion,
        },
        maxAge
      );
      if (req.fresh) {
        return res.status(304).end();
      }
    } else {
      res.set('Cache-Control', 'no-cache');
    }

    res.json({
      success: true,
      data: toNormsData(result, { valid_on: validOn }),
      timestamp: new Date().toISOString(),
    } as ApiResponse);
  } catch (error: unknown) {
    logger.error('Norms in force error', getErrorDetails(error));

    sendProblem(res, req, {
      status: 500,
      code: 'QUERY_ERROR',
      detail: getErrorMessage(error),
    });
  }
});

export default router;
