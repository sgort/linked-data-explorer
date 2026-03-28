import { Request, Response, Router } from 'express';
import {
  listRopa,
  getRopaByBpmnProcessId,
  upsertRopa,
  deleteRopa,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  listPublicRopa,
} from '../services/ropa.service';
import { getErrorMessage } from '../utils/errors';
import logger from '../utils/logger';
import pool from '../db/pool';

const router = Router();

const dbRequired = (_req: Request, res: Response): boolean => {
  if (!pool) {
    res
      .status(503)
      .json({
        success: false,
        error: { code: 'DB_NOT_CONFIGURED', message: 'Asset storage not configured' },
      });
    return false;
  }
  return true;
};

// ─── Authenticated asset routes (/v1/assets/ropa) ────────────────────────────

router.get('/', async (_req, res) => {
  if (!dbRequired(_req, res)) return;
  try {
    res.json({ success: true, data: await listRopa() });
  } catch (err) {
    logger.error('[ropa] listRopa failed', { error: getErrorMessage(err) });
    res
      .status(500)
      .json({ success: false, error: { code: 'LIST_FAILED', message: getErrorMessage(err) } });
  }
});

router.get('/by-bpmn-id/:bpmnProcessId', async (req, res) => {
  if (!dbRequired(req, res)) return;
  try {
    const result = await getRopaByBpmnProcessId(req.params.bpmnProcessId);
    if (!result)
      return res
        .status(404)
        .json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: `No RoPA record for bpmnProcessId: ${req.params.bpmnProcessId}`,
          },
        });
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error('[ropa] getRopaByBpmnProcessId failed', { error: getErrorMessage(err) });
    res
      .status(500)
      .json({ success: false, error: { code: 'LOOKUP_FAILED', message: getErrorMessage(err) } });
  }
});

router.post('/', async (req, res) => {
  if (!dbRequired(req, res)) return;
  try {
    const id = await upsertRopa(req.body);
    res.json({ success: true, data: { id } });
  } catch (err) {
    logger.error('[ropa] upsertRopa failed', { error: getErrorMessage(err) });
    res
      .status(500)
      .json({ success: false, error: { code: 'UPSERT_FAILED', message: getErrorMessage(err) } });
  }
});

router.delete('/:id', async (req, res) => {
  if (!dbRequired(req, res)) return;
  try {
    await deleteRopa(req.params.id);
    res.json({ success: true });
  } catch (err) {
    logger.error('[ropa] deleteRopa failed', { error: getErrorMessage(err) });
    res
      .status(500)
      .json({ success: false, error: { code: 'DELETE_FAILED', message: getErrorMessage(err) } });
  }
});

export default router;
