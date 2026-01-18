// packages/backend/src/routes/cache.routes.ts
// Cache management endpoints for DMN orchestration

import { Router, Request, Response } from 'express';
import { sparqlService } from '../services/sparql.service';
import logger from '../utils/logger';
import { ApiResponse } from '../types/api.types';
import { getErrorMessage, getErrorDetails } from '../utils/errors';

const router = Router();

/**
 * GET /v1/cache/stats
 * Get cache statistics for all endpoints
 *
 * Returns information about cached DMN data including:
 * - Age of cache (in seconds)
 * - Number of DMN entries cached
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    logger.info('Cache stats request');

    const stats = sparqlService.getCacheStats();

    res.json({
      success: true,
      data: stats,
      timestamp: new Date().toISOString(),
    } as ApiResponse);
  } catch (error: unknown) {
    const errorDetails = getErrorDetails(error);
    logger.error('Cache stats error', errorDetails);

    res.status(500).json({
      success: false,
      error: {
        code: 'CACHE_ERROR',
        message: getErrorMessage(error),
      },
      timestamp: new Date().toISOString(),
    } as ApiResponse);
  }
});

/**
 * DELETE /v1/cache/clear
 * Clear DMN cache for specific endpoint or all endpoints
 *
 * Query parameters:
 * - endpoint (optional): Specific endpoint to clear. If omitted, clears all caches.
 */
router.delete('/clear', async (req: Request, res: Response) => {
  try {
    const endpoint = req.query.endpoint as string | undefined;

    if (endpoint) {
      logger.info('Clearing cache for specific endpoint', { endpoint });
      sparqlService.clearCache(endpoint);
    } else {
      logger.info('Clearing all caches');
      sparqlService.clearCache();
    }

    res.json({
      success: true,
      data: {
        message: endpoint ? `Cache cleared for endpoint: ${endpoint}` : 'All caches cleared',
        endpoint: endpoint || 'all',
      },
      timestamp: new Date().toISOString(),
    } as ApiResponse);
  } catch (error: unknown) {
    const errorDetails = getErrorDetails(error);
    logger.error('Cache clear error', errorDetails);

    res.status(500).json({
      success: false,
      error: {
        code: 'CACHE_ERROR',
        message: getErrorMessage(error),
      },
      timestamp: new Date().toISOString(),
    } as ApiResponse);
  }
});

export default router;
