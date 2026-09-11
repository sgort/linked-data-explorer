import { Request, Response, Router } from 'express';
import cors from 'cors';

import { listPublicBundles } from '../services/assets.service';
import { getErrorMessage } from '../utils/errors';
import logger from '../utils/logger';

const router = Router();

// Fully open CORS — consumed by the RONL Business API caseworker dashboard
// Kept although index.ts already applies it, so the router is correct when mounted on
// its own -- as its tests do. Public, read-only, no credentials; see utils/publicPaths.ts.
// nosemgrep: javascript.express.web.cors-permissive-express.cors-permissive-express
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
