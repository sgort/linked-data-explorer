import { Request, Response, Router } from 'express';
import cors from 'cors';
import { listPublicRopa } from '../services/ropa.service';
import { getErrorMessage } from '../utils/errors';
import logger from '../utils/logger';

const router = Router();

// Fully open CORS — this route is consumed by ropa.flevoland.nl and similar
router.use(cors({ origin: '*', methods: ['GET', 'OPTIONS'] }));

router.get('/', async (req: Request, res: Response) => {
  try {
    const organisation = req.query.organisation as string | undefined;
    const data = await listPublicRopa(organisation);
    res.json({ success: true, data });
  } catch (err) {
    logger.error('[ropa.public] listPublicRopa failed', { error: getErrorMessage(err) });
    res
      .status(500)
      .json({ success: false, error: { code: 'LIST_FAILED', message: getErrorMessage(err) } });
  }
});

export default router;
