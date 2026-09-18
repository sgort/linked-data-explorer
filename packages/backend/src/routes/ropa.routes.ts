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
import { sendProblem } from '../utils/problem';

const router = Router();

const dbRequired = (req: Request, res: Response): boolean => {
  if (!pool) {
    sendProblem(res, req, {
      status: 503,
      code: 'DB_NOT_CONFIGURED',
      detail: 'Asset storage not configured',
    });
    return false;
  }
  return true;
};

// ─── Authenticated asset routes (/v1/assets/ropa) ────────────────────────────

router.get('/', async (req, res) => {
  if (!dbRequired(req, res)) return;
  try {
    res.json({ success: true, data: await listRopa() });
  } catch (err) {
    logger.error('[ropa] listRopa failed', { error: getErrorMessage(err) });
    sendProblem(res, req, { status: 500, code: 'LIST_FAILED', detail: getErrorMessage(err) });
  }
});

router.get('/by-bpmn-id/:bpmnProcessId', async (req, res) => {
  if (!dbRequired(req, res)) return;
  try {
    const result = await getRopaByBpmnProcessId(req.params.bpmnProcessId);
    if (!result) {
      sendProblem(res, req, {
        status: 404,
        code: 'NOT_FOUND',
        detail: `No RoPA record for bpmnProcessId: ${req.params.bpmnProcessId}`,
      });
      return;
    }
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error('[ropa] getRopaByBpmnProcessId failed', { error: getErrorMessage(err) });
    sendProblem(res, req, { status: 500, code: 'LOOKUP_FAILED', detail: getErrorMessage(err) });
  }
});

router.post('/', async (req, res) => {
  if (!dbRequired(req, res)) return;
  try {
    const id = await upsertRopa(req.body);
    res.json({ success: true, data: { id } });
  } catch (err) {
    logger.error('[ropa] upsertRopa failed', { error: getErrorMessage(err) });
    sendProblem(res, req, { status: 500, code: 'UPSERT_FAILED', detail: getErrorMessage(err) });
  }
});

router.delete('/:id', async (req, res) => {
  if (!dbRequired(req, res)) return;
  try {
    await deleteRopa(req.params.id);
    res.json({ success: true });
  } catch (err) {
    logger.error('[ropa] deleteRopa failed', { error: getErrorMessage(err) });
    sendProblem(res, req, { status: 500, code: 'DELETE_FAILED', detail: getErrorMessage(err) });
  }
});

export default router;
