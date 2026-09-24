// packages/backend/src/routes/cache.routes.ts
// Cache management endpoints for DMN orchestration

import { Router, Request, Response } from 'express';
import { sparqlService } from '../services/sparql.service';
import logger from '../utils/logger';
import { ApiResponse } from '../types/api.types';
import { getErrorMessage, getErrorDetails } from '../utils/errors';
import { sendProblem } from '../utils/problem';
import { allCacheStats, clearNamedCaches } from '../utils/ttl-cache';

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

    const stats = { ...sparqlService.getCacheStats(), ...allCacheStats() };

    res.json({
      success: true,
      data: stats,
      timestamp: new Date().toISOString(),
    } as ApiResponse);
  } catch (error: unknown) {
    const errorDetails = getErrorDetails(error);
    logger.error('Cache stats error', errorDetails);

    sendProblem(res, req, { status: 500, code: 'CACHE_ERROR', detail: getErrorMessage(error) });
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
      clearNamedCaches(endpoint);
    } else {
      logger.info('Clearing all caches');
      sparqlService.clearCache();
      clearNamedCaches();
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

    sendProblem(res, req, { status: 500, code: 'CACHE_ERROR', detail: getErrorMessage(error) });
  }
});

export default router;
