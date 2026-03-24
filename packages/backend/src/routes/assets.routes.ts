import { Request, Response, Router } from 'express';

import {
  deleteBpmn,
  deleteDocument,
  deleteForm,
  getBpmnByBpmnProcessId,
  listBpmn,
  listDocuments,
  listForms,
  upsertBpmn,
  upsertDocument,
  upsertForm,
} from '../services/assets.service';
import { getErrorMessage } from '../utils/errors';
import logger from '../utils/logger';
import pool from '../db/pool';

const router = Router();

const dbRequired = (_req: Request, res: Response): boolean => {
  if (!pool) {
    res.status(503).json({
      success: false,
      error: { code: 'DB_NOT_CONFIGURED', message: 'Asset storage not configured' },
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
    res
      .status(500)
      .json({ success: false, error: { code: 'LIST_FAILED', message: getErrorMessage(err) } });
  }
});

router.post('/bpmn', async (req: Request, res: Response) => {
  if (!dbRequired(req, res)) return;
  try {
    await upsertBpmn(req.body);
    res.json({ success: true });
  } catch (err) {
    logger.error('[assets] upsertBpmn failed', { error: getErrorMessage(err) });
    res
      .status(500)
      .json({ success: false, error: { code: 'UPSERT_FAILED', message: getErrorMessage(err) } });
  }
});

router.delete('/bpmn/:id', async (req: Request, res: Response) => {
  if (!dbRequired(req, res)) return;
  try {
    await deleteBpmn(req.params.id);
    res.json({ success: true });
  } catch (err) {
    logger.error('[assets] deleteBpmn failed', { error: getErrorMessage(err) });
    res
      .status(500)
      .json({ success: false, error: { code: 'DELETE_FAILED', message: getErrorMessage(err) } });
  }
});

// Used by BpmnCanvas bundle assembly to resolve calledElement → subprocess XML
router.get('/bpmn/by-bpmn-id/:bpmnProcessId', async (req: Request, res: Response) => {
  if (!dbRequired(req, res)) return;
  try {
    const result = await getBpmnByBpmnProcessId(req.params.bpmnProcessId);
    if (!result)
      return res
        .status(404)
        .json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: `No process found for bpmnProcessId: ${req.params.bpmnProcessId}`,
          },
        });
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error('[assets] getBpmnByBpmnProcessId failed', { error: getErrorMessage(err) });
    res
      .status(500)
      .json({ success: false, error: { code: 'LOOKUP_FAILED', message: getErrorMessage(err) } });
  }
});

// ─── Forms ────────────────────────────────────────────────────────────────────

router.get('/forms', async (_req: Request, res: Response) => {
  if (!dbRequired(_req, res)) return;
  try {
    res.json({ success: true, data: await listForms() });
  } catch (err) {
    logger.error('[assets] listForms failed', { error: getErrorMessage(err) });
    res
      .status(500)
      .json({ success: false, error: { code: 'LIST_FAILED', message: getErrorMessage(err) } });
  }
});

router.post('/forms', async (req: Request, res: Response) => {
  if (!dbRequired(req, res)) return;
  try {
    await upsertForm(req.body);
    res.json({ success: true });
  } catch (err) {
    logger.error('[assets] upsertForm failed', { error: getErrorMessage(err) });
    res
      .status(500)
      .json({ success: false, error: { code: 'UPSERT_FAILED', message: getErrorMessage(err) } });
  }
});

router.delete('/forms/:id', async (req: Request, res: Response) => {
  if (!dbRequired(req, res)) return;
  try {
    await deleteForm(req.params.id);
    res.json({ success: true });
  } catch (err) {
    logger.error('[assets] deleteForm failed', { error: getErrorMessage(err) });
    res
      .status(500)
      .json({ success: false, error: { code: 'DELETE_FAILED', message: getErrorMessage(err) } });
  }
});

// ─── Documents ────────────────────────────────────────────────────────────────

router.get('/documents', async (_req: Request, res: Response) => {
  if (!dbRequired(_req, res)) return;
  try {
    res.json({ success: true, data: await listDocuments() });
  } catch (err) {
    logger.error('[assets] listDocuments failed', { error: getErrorMessage(err) });
    res
      .status(500)
      .json({ success: false, error: { code: 'LIST_FAILED', message: getErrorMessage(err) } });
  }
});

router.post('/documents', async (req: Request, res: Response) => {
  if (!dbRequired(req, res)) return;
  try {
    await upsertDocument(req.body);
    res.json({ success: true });
  } catch (err) {
    logger.error('[assets] upsertDocument failed', { error: getErrorMessage(err) });
    res
      .status(500)
      .json({ success: false, error: { code: 'UPSERT_FAILED', message: getErrorMessage(err) } });
  }
});

router.delete('/documents/:id', async (req: Request, res: Response) => {
  if (!dbRequired(req, res)) return;
  try {
    await deleteDocument(req.params.id);
    res.json({ success: true });
  } catch (err) {
    logger.error('[assets] deleteDocument failed', { error: getErrorMessage(err) });
    res
      .status(500)
      .json({ success: false, error: { code: 'DELETE_FAILED', message: getErrorMessage(err) } });
  }
});

export default router;
