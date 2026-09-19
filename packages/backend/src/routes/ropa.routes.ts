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
import { asRecord, checkField, FieldErrors, isUuid, prefixErrors } from '../utils/validation';

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

/** Mirrors `ropa_personal_data_fields`' own `NOT NULL` columns — every one is
 *  bound directly, with no fallback, inside `upsertRopa`'s per-field loop.
 *  `dataCategory` has no database CHECK constraint, so it is type-checked
 *  only, matching `openapi.yaml`'s own note for that field. */
function validatePersonalDataField(item: unknown, index: number): FieldErrors {
  if (typeof item !== 'object' || item === null || Array.isArray(item)) {
    return [`personalDataFields[${index}] must be an object`];
  }
  const errors: FieldErrors = [];
  const body = item as Record<string, unknown>;
  checkField(errors, body, 'formId', { required: true, type: 'string' });
  checkField(errors, body, 'fieldKey', { required: true, type: 'string' });
  checkField(errors, body, 'fieldLabel', { required: true, type: 'string' });
  checkField(errors, body, 'dataCategory', { required: true, type: 'string' });
  checkField(errors, body, 'specialCategory', { required: true, type: 'boolean' });
  checkField(errors, body, 'sortOrder', { required: true, type: 'integer' });
  return prefixErrors(errors, `personalDataFields[${index}]`);
}

/**
 * Mirrors `ropa_records`. `id`, `createdAt` and `updatedAt` are never read
 * from the body (database-generated/-clocked), unlike the three Assets
 * upserts. Every other column has no fallback in `upsertRopa` — including
 * the ones with a database default (`thirdCountryTransfers`,
 * `status`, `schemaVersion`, and each field's `specialCategory`/
 * `sortOrder`) — so all of them are required here (see the operation's own
 * OpenAPI description).
 */
function validateRopaUpsert(body: Record<string, unknown>): FieldErrors {
  const errors: FieldErrors = [];
  checkField(errors, body, 'bpmnProcessId', { required: true, type: 'string', nonBlank: true });
  checkField(errors, body, 'processLevel', {
    required: true,
    type: 'string',
    enum: ['shell', 'subprocess'],
  });
  checkField(errors, body, 'title', { required: true, type: 'string', nonBlank: true });
  checkField(errors, body, 'controllerName', { required: true, type: 'string' });
  checkField(errors, body, 'controllerContact', { required: true, type: 'string' });
  checkField(errors, body, 'dpoContact', { type: 'string' });
  checkField(errors, body, 'purpose', { required: true, type: 'string' });
  checkField(errors, body, 'legalBasisUri', { required: true, type: 'string' });
  checkField(errors, body, 'legalBasisLabel', { required: true, type: 'string' });
  checkField(errors, body, 'gdprArticle', { required: true, type: 'string' });
  checkField(errors, body, 'dataSubjects', { required: true, type: 'string' });
  checkField(errors, body, 'recipients', { required: true, type: 'string' });
  checkField(errors, body, 'thirdCountryTransfers', { required: true, type: 'boolean' });
  checkField(errors, body, 'thirdCountryDetails', { type: 'string' });
  checkField(errors, body, 'retentionPeriod', { required: true, type: 'string' });
  checkField(errors, body, 'securityMeasures', { required: true, type: 'string' });
  checkField(errors, body, 'status', {
    required: true,
    type: 'string',
    enum: ['draft', 'active', 'archived'],
  });
  checkField(errors, body, 'schemaVersion', { required: true, type: 'integer' });

  const fields = checkField(errors, body, 'personalDataFields', { required: true, type: 'array' });
  if (Array.isArray(fields)) {
    fields.forEach((item, index) => {
      errors.push(...validatePersonalDataField(item, index));
    });
  }

  return errors;
}

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
  const errors = validateRopaUpsert(asRecord(req.body));
  if (errors.length > 0) {
    sendProblem(res, req, { status: 400, code: 'INVALID_INPUT', detail: errors.join('; ') });
    return;
  }
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
  if (!isUuid(req.params.id)) {
    sendProblem(res, req, {
      status: 400,
      code: 'INVALID_INPUT',
      detail: `id must be a UUID: ${req.params.id}`,
    });
    return;
  }
  try {
    await deleteRopa(req.params.id);
    res.json({ success: true });
  } catch (err) {
    logger.error('[ropa] deleteRopa failed', { error: getErrorMessage(err) });
    sendProblem(res, req, { status: 500, code: 'DELETE_FAILED', detail: getErrorMessage(err) });
  }
});

export default router;
