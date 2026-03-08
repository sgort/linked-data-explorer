import { Router, Request, Response } from 'express';
import { operatonService } from '../services/operaton.service';
import logger from '../utils/logger';
import { getErrorMessage } from '../utils/errors';

const router = Router();

/**
 * GET /v1/process/:key/variable-hints
 * Fetch deduplicated variable names and types from Operaton history
 * for a given process definition key.
 * Used by the Document Composer BindingPanel for variable discovery.
 */
router.get('/:key/variable-hints', async (req: Request, res: Response) => {
    const { key } = req.params;

    try {
        const variables = await operatonService.getVariableHints(key);
        res.json({ success: true, variables });
    } catch (error) {
        logger.error('Failed to get variable hints', {
            processKey: key,
            error: getErrorMessage(error),
        });
        res.status(500).json({
            success: false,
            error: { code: 'VARIABLE_HINTS_FAILED', message: 'Failed to retrieve variable hints' },
        });
    }
});

export default router;