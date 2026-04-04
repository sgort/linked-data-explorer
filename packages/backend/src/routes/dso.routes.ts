// packages/backend/src/routes/dso.routes.ts

import { Router, Request, Response } from 'express';
import * as dsoService from '../services/dso.service';
import { logger } from '../utils/logger';
import packageJson from '../../package.json';

const router = Router();

/**
 * GET /v1/dso/begrippen
 * Search concepts in the DSO Stelselcatalogus.
 *
 * Query params:
 *   zoekTerm  — free-text search (optional)
 *   geldigOp  — validity date YYYY-MM-dd (optional, defaults to current)
 *   page      — page number (default 1)
 *   pageSize  — 10 | 20 | 40 | 100 (default 10)
 *
 * Returns the HAL response from DSO verbatim, wrapped in LDE's standard envelope.
 */
router.get('/begrippen', async (req: Request, res: Response) => {
  res.set('API-Version', packageJson.version);

  try {
    const { zoekTerm, geldigOp, page, pageSize } = req.query;

    const data = await dsoService.getBegrippen({
      zoekTerm: zoekTerm as string | undefined,
      geldigOp: geldigOp as string | undefined,
      page: page ? parseInt(page as string, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize as string, 10) : undefined,
    });

    res.status(200).json({ success: true, data });
  } catch (error) {
    logger.error('[DSO Routes] GET /begrippen failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    res.status(502).json({
      success: false,
      error: error instanceof Error ? error.message : 'DSO request failed',
    });
  }
});

/**
 * GET /v1/dso/activiteiten
 * Retrieve all legal activities valid on a given date from the RTR.
 *
 * Query params:
 *   datum     — date dd-MM-yyyy (optional, defaults to today)
 *   page      — page number (default 1)
 *   pageSize  — 10 | 20 | 40 | 100 (default 10)
 */
router.get('/activiteiten', async (req: Request, res: Response) => {
  res.set('API-Version', packageJson.version);

  try {
    const { datum, page, pageSize } = req.query;

    const data = await dsoService.getActiviteiten({
      datum: datum as string | undefined,
      page: page ? parseInt(page as string, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize as string, 10) : undefined,
    });

    res.status(200).json({ success: true, data });
  } catch (error) {
    logger.error('[DSO Routes] GET /activiteiten failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    res.status(502).json({
      success: false,
      error: error instanceof Error ? error.message : 'DSO request failed',
    });
  }
});

export default router;
