// packages/backend/src/routes/dmn.routes.ts
// UPDATED: Added optional endpoint parameter for dynamic TriplyDB endpoint selection

import { Router, Request, Response } from 'express';
import { sparqlService } from '../services/sparql.service';
import logger from '../utils/logger';
import { ApiResponse } from '../types/api.types';
import { getErrorMessage, getErrorDetails } from '../utils/errors';

const router = Router();

/**
 * GET /api/dmns
 * List all DMN models
 *
 * NEW: Optional query parameter 'endpoint' for dynamic TriplyDB endpoint selection
 * NEW: Optional query parameter 'refresh' to bypass cache and fetch fresh data
 * Example: GET /api/dmns?endpoint=https://api.open-regels.triply.cc/datasets/stevengort/Facts/services/facts/sparql
 * Example: GET /api/dmns?refresh=true
 *
 * If no endpoint is provided, uses default from config (TRIPLYDB_ENDPOINT)
 * Cache is maintained separately per endpoint (5 minute TTL per endpoint)
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    // NEW: Extract optional endpoint parameter
    const requestedEndpoint = req.query.endpoint as string | undefined;
    // NEW: Extract optional refresh parameter
    const refresh = req.query.refresh === 'true' || req.query.refresh === '1';

    if (requestedEndpoint) {
      logger.info('DMN list request with custom endpoint', {
        endpoint: requestedEndpoint,
        refresh,
      });
    } else if (refresh) {
      logger.info('DMN list request (refresh requested)');
    } else {
      logger.info('DMN list request (using default endpoint)');
    }

    // Pass endpoint and refresh to sparqlService
    const dmns = await sparqlService.getAllDmns(requestedEndpoint, refresh);

    res.json({
      success: true,
      data: {
        total: dmns.length,
        dmns,
        fromCache: !refresh, // Helpful for debugging
      },
      timestamp: new Date().toISOString(),
    } as ApiResponse);
  } catch (error: unknown) {
    const errorDetails = getErrorDetails(error);
    logger.error('DMN list error', errorDetails);

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

/**
 * GET /api/dmns/semantic-equivalences
 * Find variables that share the same skos:exactMatch URI across DMNs
 */
router.get('/semantic-equivalences', async (req: Request, res: Response) => {
  try {
    const endpoint = req.query.endpoint as string | undefined;
    const equivalences = await sparqlService.findSemanticEquivalences(endpoint);
    res.json(equivalences);
  } catch (error: unknown) {
    const errorDetails = getErrorDetails(error);
    logger.error('Semantic equivalences error', errorDetails);
    res.status(500).json({
      success: false,
      error: { code: 'QUERY_ERROR', message: getErrorMessage(error) },
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /api/dmns/enhanced-chain-links
 * Find chain links via exact identifier match AND semantic skos:exactMatch
 */
router.get('/enhanced-chain-links', async (req: Request, res: Response) => {
  try {
    const endpoint = req.query.endpoint as string | undefined;
    const links = await sparqlService.findEnhancedChainLinks(endpoint);
    res.json(links);
  } catch (error: unknown) {
    const errorDetails = getErrorDetails(error);
    logger.error('Enhanced chain links error', errorDetails);
    res.status(500).json({
      success: false,
      error: { code: 'QUERY_ERROR', message: getErrorMessage(error) },
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /api/dmns/cycles
 * Detect circular dependencies in DMN chains
 */
router.get('/cycles', async (req: Request, res: Response) => {
  try {
    const endpoint = req.query.endpoint as string | undefined;
    const cycles = await sparqlService.detectChainCycles(endpoint);
    res.json(cycles);
  } catch (error: unknown) {
    const errorDetails = getErrorDetails(error);
    logger.error('Cycle detection error', errorDetails);
    res.status(500).json({
      success: false,
      error: { code: 'QUERY_ERROR', message: getErrorMessage(error) },
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /api/dmns/:identifier
 * Get a specific DMN by identifier
 *
 * NEW: Optional query parameter 'endpoint' for dynamic TriplyDB endpoint selection
 */
router.get('/:identifier', async (req: Request, res: Response) => {
  try {
    const { identifier } = req.params;
    const requestedEndpoint = req.query.endpoint as string | undefined;

    logger.info('DMN details request', {
      identifier,
      ...(requestedEndpoint && { endpoint: requestedEndpoint }),
    });

    const dmn = await sparqlService.getDmnByIdentifier(identifier, requestedEndpoint);

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
  } catch (error: unknown) {
    const errorDetails = getErrorDetails(error);
    logger.error('DMN details error', errorDetails);

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
