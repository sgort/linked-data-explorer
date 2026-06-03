// packages/backend/src/routes/shacl.routes.ts
// SHACL validation endpoints. Validate CPSV-AP 3.2.0 (+ RONL custom) Turtle either
// stand-alone (file-local) or merged with the already-published graph for the
// file's subjects (catches multi-value fan-out before publish). The response shape
// mirrors /v1/dmns/validate so the frontend reuses the same layer/issue rendering.

import { Router, Request, Response } from 'express';
import logger from '../utils/logger';
import { ApiResponse } from '../types/api.types';
import { getErrorMessage, getErrorDetails } from '../utils/errors';
import { shaclValidationService } from '../services/shacl-validation.service';

const router = Router();

/**
 * POST /v1/shacl/validate
 * Validate a Turtle file against the vendored shape set (file-local; no network).
 *
 * Request body (JSON):
 *   { "content": "<Turtle as a string>" }
 *
 * Response (JSON): ApiResponse<ShaclValidationResult> — same shape as
 *   /v1/dmns/validate:
 *   {
 *     "valid": boolean,
 *     "parseError": string | null,
 *     "layers": {
 *       "cpsv-ap-core":  { "label": "CPSV-AP Core",         "issues": Issue[] },
 *       "cpsv-ap-vocab": { "label": "CPSV-AP Vocabularies",  "issues": Issue[] },
 *       "ronl-custom":   { "label": "RONL Custom",           "issues": Issue[] }
 *     },
 *     "summary": { "errors": number, "warnings": number, "infos": number }
 *   }
 *
 * This endpoint is unauthenticated and performs no TriplyDB/Operaton calls. The
 * 10 MB body limit is enforced by express.json() in index.ts.
 */
router.post('/validate', async (req: Request, res: Response) => {
    try {
        const { content } = req.body as { content?: string };

        if (!content || typeof content !== 'string') {
            return res.status(400).json({
                success: false,
                error: {
                    code: 'INVALID_REQUEST',
                    message: 'Request body must contain a "content" field with the Turtle as a string.',
                },
                timestamp: new Date().toISOString(),
            } as ApiResponse);
        }

        logger.info('[SHACL Validate] Validation requested', { contentLength: content.length });

        const result = await shaclValidationService.validateFile(content);

        logger.info('[SHACL Validate] Complete', {
            valid: result.valid,
            errors: result.summary.errors,
            warnings: result.summary.warnings,
        });

        res.json({
            success: true,
            data: result,
            timestamp: new Date().toISOString(),
        } as ApiResponse);
    } catch (error: unknown) {
        logger.error('[SHACL Validate] Unexpected error', getErrorDetails(error));
        res.status(500).json({
            success: false,
            error: { code: 'VALIDATION_ERROR', message: getErrorMessage(error) },
            timestamp: new Date().toISOString(),
        } as ApiResponse);
    }
});

/**
 * POST /v1/shacl/validate-merged
 * Validate a Turtle file unioned with the triples already published for its
 * subjects on a SPARQL endpoint. This is the only mode that catches fan-out
 * against live data (e.g. a divergent foaf:homepage already present in the store).
 *
 * Request body (JSON):
 *   { "content": "<Turtle as a string>", "endpoint"?: "<SPARQL endpoint URL>" }
 *   `endpoint` is optional and defaults to the configured TriplyDB endpoint.
 *
 * Response (JSON): ApiResponse<ShaclValidationResult> (same shape as /validate).
 *
 * A parse failure of the uploaded `content` returns 200 with parseError set
 * (valid:false); a failure fetching/parsing the remote graph is a 500, since that
 * is not the caller's input fault.
 */
router.post('/validate-merged', async (req: Request, res: Response) => {
    try {
        const { content, endpoint } = req.body as { content?: string; endpoint?: string };

        if (!content || typeof content !== 'string') {
            return res.status(400).json({
                success: false,
                error: {
                    code: 'INVALID_REQUEST',
                    message: 'Request body must contain a "content" field with the Turtle as a string.',
                },
                timestamp: new Date().toISOString(),
            } as ApiResponse);
        }

        logger.info('[SHACL Validate] Merged validation requested', {
            contentLength: content.length,
            endpoint: endpoint ?? '(default)',
        });

        const result = await shaclValidationService.validateMerged(content, endpoint);

        logger.info('[SHACL Validate] Merged complete', {
            valid: result.valid,
            errors: result.summary.errors,
            warnings: result.summary.warnings,
        });

        res.json({
            success: true,
            data: result,
            timestamp: new Date().toISOString(),
        } as ApiResponse);
    } catch (error: unknown) {
        logger.error('[SHACL Validate] Merged unexpected error', getErrorDetails(error));
        res.status(500).json({
            success: false,
            error: { code: 'VALIDATION_ERROR', message: getErrorMessage(error) },
            timestamp: new Date().toISOString(),
        } as ApiResponse);
    }
});

export default router;