import { Request, Response, Router } from 'express';

import {
  deleteBpmn,
  deleteDocument,
  deleteForm,
  getBpmnByBpmnProcessId,
  listBpmn,
  listDocuments,
  listForms,
  markDeployed,
  upsertBpmn,
  upsertDocument,
  upsertForm,
} from '../services/assets.service';
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

// ─── BPMN ─────────────────────────────────────────────────────────────────────

router.get('/bpmn', async (_req: Request, res: Response) => {
  if (!dbRequired(_req, res)) return;
  try {
    res.json({ success: true, data: await listBpmn() });
  } catch (err) {
    logger.error('[assets] listBpmn failed', { error: getErrorMessage(err) });
    sendProblem(res, _req, { status: 500, code: 'LIST_FAILED', detail: getErrorMessage(err) });
  }
});

router.post('/bpmn', async (req: Request, res: Response) => {
  if (!dbRequired(req, res)) return;
  try {
    await upsertBpmn(req.body);
    res.json({ success: true });
  } catch (err) {
    logger.error('[assets] upsertBpmn failed', { error: getErrorMessage(err) });
    sendProblem(res, req, { status: 500, code: 'UPSERT_FAILED', detail: getErrorMessage(err) });
  }
});

router.delete('/bpmn/:id', async (req: Request, res: Response) => {
  if (!dbRequired(req, res)) return;
  try {
    await deleteBpmn(req.params.id);
    res.json({ success: true });
  } catch (err) {
    logger.error('[assets] deleteBpmn failed', { error: getErrorMessage(err) });
    sendProblem(res, req, { status: 500, code: 'DELETE_FAILED', detail: getErrorMessage(err) });
  }
});

router.patch('/bpmn/:id/deploy', async (req: Request, res: Response) => {
  if (!dbRequired(req, res)) return;
  try {
    const {
      deploymentId,
      operatonUrl,
      formIds = [],
      documentIds = [],
      boardOwner,
    } = req.body as {
      deploymentId: string;
      operatonUrl?: string;
      formIds?: string[];
      documentIds?: string[];
      boardOwner?: string;
    };
    const updated = await markDeployed(
      req.params.id,
      deploymentId,
      operatonUrl,
      formIds,
      documentIds,
      boardOwner
    );
    if (!updated) {
      sendProblem(res, req, {
        status: 404,
        code: 'NOT_FOUND',
        detail: `No process found for id: ${req.params.id}`,
      });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    logger.error('[assets] markDeployed failed', { error: getErrorMessage(err) });
    sendProblem(res, req, {
      status: 500,
      code: 'DEPLOY_MARK_FAILED',
      detail: getErrorMessage(err),
    });
  }
});

// Used by BpmnCanvas bundle assembly to resolve calledElement → subprocess XML
router.get('/bpmn/by-bpmn-id/:bpmnProcessId', async (req: Request, res: Response) => {
  if (!dbRequired(req, res)) return;
  try {
    const result = await getBpmnByBpmnProcessId(req.params.bpmnProcessId);
    if (!result) {
      sendProblem(res, req, {
        status: 404,
        code: 'NOT_FOUND',
        detail: `No process found for bpmnProcessId: ${req.params.bpmnProcessId}`,
      });
      return;
    }
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error('[assets] getBpmnByBpmnProcessId failed', { error: getErrorMessage(err) });
    sendProblem(res, req, { status: 500, code: 'LOOKUP_FAILED', detail: getErrorMessage(err) });
  }
});

// ─── Forms ────────────────────────────────────────────────────────────────────

router.get('/forms', async (_req: Request, res: Response) => {
  if (!dbRequired(_req, res)) return;
  try {
    res.json({ success: true, data: await listForms() });
  } catch (err) {
    logger.error('[assets] listForms failed', { error: getErrorMessage(err) });
    sendProblem(res, _req, { status: 500, code: 'LIST_FAILED', detail: getErrorMessage(err) });
  }
});

router.post('/forms', async (req: Request, res: Response) => {
  if (!dbRequired(req, res)) return;
  try {
    await upsertForm(req.body);
    res.json({ success: true });
  } catch (err) {
    logger.error('[assets] upsertForm failed', { error: getErrorMessage(err) });
    sendProblem(res, req, { status: 500, code: 'UPSERT_FAILED', detail: getErrorMessage(err) });
  }
});

router.delete('/forms/:id', async (req: Request, res: Response) => {
  if (!dbRequired(req, res)) return;
  try {
    await deleteForm(req.params.id);
    res.json({ success: true });
  } catch (err) {
    logger.error('[assets] deleteForm failed', { error: getErrorMessage(err) });
    sendProblem(res, req, { status: 500, code: 'DELETE_FAILED', detail: getErrorMessage(err) });
  }
});

// ─── Documents ────────────────────────────────────────────────────────────────

router.get('/documents', async (_req: Request, res: Response) => {
  if (!dbRequired(_req, res)) return;
  try {
    res.json({ success: true, data: await listDocuments() });
  } catch (err) {
    logger.error('[assets] listDocuments failed', { error: getErrorMessage(err) });
    sendProblem(res, _req, { status: 500, code: 'LIST_FAILED', detail: getErrorMessage(err) });
  }
});

router.post('/documents', async (req: Request, res: Response) => {
  if (!dbRequired(req, res)) return;
  try {
    await upsertDocument(req.body);
    res.json({ success: true });
  } catch (err) {
    logger.error('[assets] upsertDocument failed', { error: getErrorMessage(err) });
    sendProblem(res, req, { status: 500, code: 'UPSERT_FAILED', detail: getErrorMessage(err) });
  }
});

router.delete('/documents/:id', async (req: Request, res: Response) => {
  if (!dbRequired(req, res)) return;
  try {
    await deleteDocument(req.params.id);
    res.json({ success: true });
  } catch (err) {
    logger.error('[assets] deleteDocument failed', { error: getErrorMessage(err) });
    sendProblem(res, req, { status: 500, code: 'DELETE_FAILED', detail: getErrorMessage(err) });
  }
});

export default router;
