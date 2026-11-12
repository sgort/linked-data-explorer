import { Router, Request, Response } from 'express';
import { edocsService } from '../services/edocs.service';
import logger from '../utils/logger';
import { getErrorMessage } from '../utils/errors';
import { sendProblem } from '../utils/problem';
import { config } from '../utils/config';

const router = Router();

/**
 * GET /v1/edocs/status
 * Returns eDOCS connectivity status and whether stub mode is active.
 * Useful for the LDE UI to show integration health.
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    const health = await edocsService.healthCheck();
    res.json({
      success: true,
      data: {
        status: health.status,
        stubMode: config.edocs.stubMode,
        ...(health.latency !== undefined && { latencyMs: health.latency }),
        ...(health.error && { error: health.error }),
      },
    });
  } catch (err) {
    logger.error('[edocs.routes] Status check failed', { error: getErrorMessage(err) });
    sendProblem(res, req, {
      status: 500,
      code: 'EDOCS_STATUS_FAILED',
      detail: getErrorMessage(err),
    });
  }
});

// #163: POST /workspaces/ensure, POST /documents and
// GET /workspaces/:workspaceId/documents were removed. No client called them,
// and LDE ACC/PROD ran them as stubs; the external-task worker calls
// edocsService directly.

export default router;
