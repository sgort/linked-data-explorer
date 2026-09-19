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
import { asRecord, checkBoardOwner, checkField, FieldErrors } from '../utils/validation';

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

/**
 * Mirrors `process_definitions`' own `NOT NULL`/`CHECK` constraints
 * (`db/migrate.ts`) and `upsertBpmn`'s own fallbacks (`assets.service.ts`):
 * `bpmnProcessId`, `processRole` and `status` are all defaulted in the
 * service (`?? 'unknown'`/`'standalone'`/`'wip'`) so stay optional here too.
 */
function validateBpmnUpsert(body: Record<string, unknown>): FieldErrors {
  const errors: FieldErrors = [];
  checkField(errors, body, 'id', { required: true, type: 'string', nonBlank: true });
  checkField(errors, body, 'bpmnProcessId', { type: 'string', nonBlank: true });
  checkField(errors, body, 'name', { required: true, type: 'string', nonBlank: true });
  checkField(errors, body, 'description', { type: 'string' });
  checkField(errors, body, 'xml', { required: true, type: 'string' });
  checkField(errors, body, 'processRole', {
    type: 'string',
    enum: ['shell', 'subprocess', 'standalone'],
  });
  checkField(errors, body, 'calledElement', { type: 'string' });
  checkField(errors, body, 'shellId', { type: 'string' });
  checkField(errors, body, 'linkedDmnTemplates', { required: true, type: 'stringArray' });
  checkField(errors, body, 'status', { type: 'string', enum: ['example', 'wip', 'e2e'] });
  checkField(errors, body, 'language', { type: 'string' });
  checkField(errors, body, 'organization', { type: 'string' });
  checkField(errors, body, 'createdAt', { required: true, type: 'string' });
  checkField(errors, body, 'updatedAt', { required: true, type: 'string' });
  return errors;
}

/**
 * Mirrors `form_schemas`. `status` has no database CHECK constraint (any
 * string is accepted), so it is type-checked but never enum-checked.
 */
function validateFormUpsert(body: Record<string, unknown>): FieldErrors {
  const errors: FieldErrors = [];
  checkField(errors, body, 'id', { required: true, type: 'string', nonBlank: true });
  checkField(errors, body, 'name', { required: true, type: 'string', nonBlank: true });
  checkField(errors, body, 'description', { type: 'string' });
  checkField(errors, body, 'schema', { required: true, type: 'object' });
  checkField(errors, body, 'status', { type: 'string' });
  checkField(errors, body, 'language', { type: 'string' });
  checkField(errors, body, 'organization', { type: 'string' });
  checkField(errors, body, 'createdAt', { required: true, type: 'string' });
  checkField(errors, body, 'updatedAt', { required: true, type: 'string' });
  return errors;
}

/**
 * Mirrors `document_templates`. `schemaVersion`, `zones`, `bindings` and
 * `assets` each have a database default, but `upsertDocument` always
 * supplies a value explicitly (see the operation's own OpenAPI
 * description), so an omitted one reaches the database as NULL and 500s
 * today — all four stay required here. `status` has no database CHECK
 * constraint, same as forms.
 */
function validateDocumentUpsert(body: Record<string, unknown>): FieldErrors {
  const errors: FieldErrors = [];
  checkField(errors, body, 'id', { required: true, type: 'string', nonBlank: true });
  checkField(errors, body, 'name', { required: true, type: 'string', nonBlank: true });
  checkField(errors, body, 'description', { type: 'string' });
  checkField(errors, body, 'processKey', { type: 'string' });
  checkField(errors, body, 'serviceId', { type: 'string' });
  checkField(errors, body, 'schemaVersion', { required: true, type: 'integer' });
  checkField(errors, body, 'zones', { required: true, type: 'object' });
  checkField(errors, body, 'bindings', { required: true, type: 'array' });
  checkField(errors, body, 'assets', { required: true, type: 'array' });
  checkField(errors, body, 'status', { type: 'string' });
  checkField(errors, body, 'language', { type: 'string' });
  checkField(errors, body, 'organization', { type: 'string' });
  checkField(errors, body, 'createdAt', { required: true, type: 'string' });
  checkField(errors, body, 'updatedAt', { required: true, type: 'string' });
  return errors;
}

/**
 * Every field of `PATCH /assets/bpmn/{id}/deploy` is either optional or
 * defaulted in the route itself (`formIds = []`, `documentIds = []`) or
 * writes to a nullable column with no fallback needed (`deploymentId`,
 * `operatonUrl`, `boardOwner`) — an empty body, or no body at all, already
 * succeeds (documented explicitly in `openapi.yaml`). So nothing here is
 * required; only type, for whatever is actually present.
 */
function validateBpmnDeploy(body: Record<string, unknown>): FieldErrors {
  const errors: FieldErrors = [];
  checkField(errors, body, 'deploymentId', { type: 'string' });
  checkField(errors, body, 'operatonUrl', { type: 'string' });
  checkField(errors, body, 'formIds', { type: 'stringArray' });
  checkField(errors, body, 'documentIds', { type: 'stringArray' });
  checkBoardOwner(errors, body);
  return errors;
}

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
  const errors = validateBpmnUpsert(asRecord(req.body));
  if (errors.length > 0) {
    sendProblem(res, req, { status: 400, code: 'INVALID_INPUT', detail: errors.join('; ') });
    return;
  }
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
  const deployErrors = validateBpmnDeploy(asRecord(req.body));
  if (deployErrors.length > 0) {
    sendProblem(res, req, { status: 400, code: 'INVALID_INPUT', detail: deployErrors.join('; ') });
    return;
  }
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
  const errors = validateFormUpsert(asRecord(req.body));
  if (errors.length > 0) {
    sendProblem(res, req, { status: 400, code: 'INVALID_INPUT', detail: errors.join('; ') });
    return;
  }
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
  const errors = validateDocumentUpsert(asRecord(req.body));
  if (errors.length > 0) {
    sendProblem(res, req, { status: 400, code: 'INVALID_INPUT', detail: errors.join('; ') });
    return;
  }
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
