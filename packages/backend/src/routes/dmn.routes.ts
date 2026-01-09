import { Router, Request, Response } from 'express';
import { sparqlService } from '../services/sparql.service';
import logger from '../utils/logger';
import { ApiResponse } from '../types/api.types';

const router = Router();

/**
 * GET /api/dmns
 * List all DMN models
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    logger.info('DMN list request');

    const dmns = await sparqlService.getAllDmns();

    res.json({
      success: true,
      data: {
        total: dmns.length,
        dmns,
      },
      timestamp: new Date().toISOString(),
    } as ApiResponse);
  } catch (error: any) {
    logger.error('DMN list error', { error: error.message });

    res.status(500).json({
      success: false,
      error: {
        code: 'QUERY_ERROR',
        message: error.message,
      },
      timestamp: new Date().toISOString(),
    } as ApiResponse);
  }
});

/**
 * GET /api/dmns/:identifier
 * Get a specific DMN by identifier
 */
router.get('/:identifier', async (req: Request, res: Response) => {
  try {
    const { identifier } = req.params;

    logger.info('DMN details request', { identifier });

    const dmn = await sparqlService.getDmnByIdentifier(identifier);

    if (!dmn) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: `DMN not found: ${identifier}`,
        },
        timestamp: new Date().toISOString(),
      } as ApiResponse);
    }

    res.json({
      success: true,
      data: dmn,
      timestamp: new Date().toISOString(),
    } as ApiResponse);
  } catch (error: any) {
    logger.error('DMN details error', { error: error.message });

    res.status(500).json({
      success: false,
      error: {
        code: 'QUERY_ERROR',
        message: error.message,
      },
      timestamp: new Date().toISOString(),
    } as ApiResponse);
  }
});

export default router;
