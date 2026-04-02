import { Request, Response, Router } from 'express';
import cors from 'cors';

import { listPublicBundles } from '../services/assets.service';
import { getErrorMessage } from '../utils/errors';
import logger from '../utils/logger';

const router = Router();

// Fully open CORS — consumed by the RONL Business API caseworker dashboard
router.use(cors({ origin: '*', methods: ['GET', 'OPTIONS'] }));

router.get('/', async (_req: Request, res: Response) => {
    try {
        const data = await listPublicBundles();
        res.json({ success: true, data });
    } catch (err) {
        logger.error('[assets.public] listPublicBundles failed', { error: getErrorMessage(err) });
        res.status(500).json({
            success: false,
            error: { code: 'LIST_FAILED', message: getErrorMessage(err) },
        });
    }
});

export default router;