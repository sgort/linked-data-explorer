// packages/backend/src/routes/health.routes.ts
// Dutch Government API Design Rules Compliant Implementation - FIXED

import { Router, Request, Response } from 'express';
import axios from 'axios';
import { config } from '../utils/config';
import { logger } from '../utils/logger';
import { sparqlService } from '../services/sparql.service';

const router = Router();

// Get package.json for version info
import packageJson from '../../package.json';

/**
 * Health check endpoint - Compliant with Dutch Government API Design Rules
 *
 * GET /v1/health
 *
 * Compliance notes:
 * - API-05: Uses noun "health" for resource name
 * - API-54: Singular resource (standalone, not in collection)
 * - API-57: Returns API-Version header with full semantic version
 * - API-04: English is acceptable for technical/monitoring endpoints
 *
 * Returns comprehensive health information including:
 * - Application metadata (name, version, environment)
 * - Service status (TriplyDB, Operaton)
 * - System uptime and timestamp
 */
router.get('/', async (_req: Request, res: Response) => {
  const healthCheck = {
    // Application metadata (integrated from root endpoint)
    name: 'Linked Data Explorer Backend',
    version: packageJson.version,
    environment: config.nodeEnv,

    // Health status
    status: 'healthy', // 'healthy' | 'degraded' | 'unhealthy'
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),

    // Service checks
    services: {
      triplydb: {
        status: 'unknown', // 'up' | 'down' | 'unknown'
        latency: 0,
        lastCheck: new Date().toISOString(),
      },
      operaton: {
        status: 'unknown',
        latency: 0,
        lastCheck: new Date().toISOString(),
      },
    },

    // API documentation reference (API-51 compliant)
    documentation: '/v1/openapi.json',
  };

  // Set API-Version header (API-57 requirement)
  res.set('API-Version', packageJson.version);

  try {
    // Check TriplyDB connection - FIXED: Use sparqlService.healthCheck()
    try {
      const triplyHealth = await sparqlService.healthCheck();
      healthCheck.services.triplydb.status = triplyHealth.status;
      healthCheck.services.triplydb.latency = triplyHealth.latency || 0;

      if (triplyHealth.status === 'down') {
        logger.warn('TriplyDB health check failed', {
          error: triplyHealth.error,
        });
        healthCheck.status = 'degraded';
      }
    } catch (error) {
      logger.warn('TriplyDB health check failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      healthCheck.services.triplydb.status = 'down';
      healthCheck.status = 'degraded';
    }

    // Check Operaton connection
    const operatonStart = Date.now();
    try {
      await axios.get(`${config.operaton.baseUrl}/version`, {
        timeout: config.operaton.timeout || 5000,
      });
      healthCheck.services.operaton.status = 'up';
      healthCheck.services.operaton.latency = Date.now() - operatonStart;
    } catch (error) {
      logger.warn('Operaton health check failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      healthCheck.services.operaton.status = 'down';
      healthCheck.status = 'degraded';
    }

    // Update last check timestamp
    healthCheck.services.triplydb.lastCheck = new Date().toISOString();
    healthCheck.services.operaton.lastCheck = new Date().toISOString();

    // Return appropriate HTTP status code based on health
    const statusCode = healthCheck.status === 'healthy' ? 200 : 503;

    // Set Content-Type explicitly (security best practice)
    res.set('Content-Type', 'application/json');

    res.status(statusCode).json(healthCheck);
  } catch (error) {
    logger.error('Health check failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    // Set API-Version header even for error responses
    res.set('API-Version', packageJson.version);
    res.set('Content-Type', 'application/json');

    res.status(503).json({
      ...healthCheck,
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Health check failed',
    });
  }
});

export default router;
