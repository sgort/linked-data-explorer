import { Router, Request, Response } from 'express';
import { operatonService } from '../services/operaton.service';
import { sparqlService } from '../services/sparql.service';
import { HealthCheckResponse } from '../types/api.types';
import { getErrorMessage } from '../utils/errors';

const router = Router();

/**
 * GET /api/health
 * Health check endpoint
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const startTime = Date.now();

    // Check TriplyDB
    const triplydbStatus = await sparqlService.healthCheck();

    // Check Operaton
    const operatonStatus = await operatonService.healthCheck();

    // Determine overall status
    const allUp = triplydbStatus.status === 'up' && operatonStatus.status === 'up';
    const anyDown = triplydbStatus.status === 'down' || operatonStatus.status === 'down';

    const overallStatus = allUp ? 'healthy' : anyDown ? 'unhealthy' : 'degraded';

    const response: HealthCheckResponse = {
      status: overallStatus,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      services: {
        triplydb: {
          status: triplydbStatus.status,
          latency: triplydbStatus.latency,
          lastCheck: new Date().toISOString(),
          error: triplydbStatus.error,
        },
        operaton: {
          status: operatonStatus.status,
          latency: operatonStatus.latency,
          lastCheck: new Date().toISOString(),
          error: operatonStatus.error,
        },
      },
    };

    const statusCode = overallStatus === 'healthy' ? 200 : overallStatus === 'degraded' ? 200 : 503;

    res.status(statusCode).json(response);
  } catch (error: unknown) {
    res.status(500).json({
      status: 'unhealthy',
      error: getErrorMessage(error),
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /api/health/ready
 * Readiness probe
 */
router.get('/ready', (req: Request, res: Response) => {
  res.status(200).json({ ready: true });
});

/**
 * GET /api/health/live
 * Liveness probe
 */
router.get('/live', (req: Request, res: Response) => {
  res.status(200).json({ alive: true });
});

export default router;
