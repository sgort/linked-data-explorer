import { Router, Request, Response } from 'express';
import { edocsService } from '../services/edocs.service';
import logger from '../utils/logger';
import { getErrorMessage } from '../utils/errors';
import { config } from '../utils/config';

const router = Router();

/**
 * GET /v1/edocs/status
 * Returns eDOCS connectivity status and whether stub mode is active.
 * Useful for the LDE UI to show integration health.
 */
router.get('/status', async (_req: Request, res: Response) => {
  try {
    const health = await edocsService.healthCheck();
    res.json({
      success: true,
      data: {
        status: health.status,
        stubMode: config.edocs.stubMode,
        ...(health.latency !== undefined && { latencyMs: health.latency }),
        ...(health.error && { error: health.error }),
      },
    });
  } catch (err) {
    logger.error('[edocs.routes] Status check failed', { error: getErrorMessage(err) });
    res.status(500).json({
      success: false,
      error: { code: 'EDOCS_STATUS_FAILED', message: getErrorMessage(err) },
    });
  }
});

/**
 * POST /v1/edocs/workspaces/ensure
 * Creates a project workspace if one does not already exist, or returns the existing one.
 *
 * Body: { projectNumber: string, projectName: string }
 * Response: { workspaceId, workspaceName, created }
 *
 * This endpoint is also called by the external task worker internally.
 * Exposing it via HTTP allows manual testing and future UI integration.
 */
router.post('/workspaces/ensure', async (req: Request, res: Response) => {
  const { projectNumber, projectName } = req.body as {
    projectNumber?: string;
    projectName?: string;
  };

  if (!projectNumber?.trim() || !projectName?.trim()) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_INPUT',
        message: 'projectNumber and projectName are required',
      },
    });
  }

  try {
    logger.info('[edocs.routes] Ensure workspace', { projectNumber, projectName });
    const result = await edocsService.ensureWorkspace(projectNumber.trim(), projectName.trim());
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error('[edocs.routes] ensureWorkspace failed', {
      projectNumber,
      error: getErrorMessage(err),
    });
    res.status(500).json({
      success: false,
      error: { code: 'EDOCS_WORKSPACE_FAILED', message: getErrorMessage(err) },
    });
  }
});

/**
 * POST /v1/edocs/documents
 * Uploads a document to an eDOCS workspace.
 *
 * Body: {
 *   workspaceId:   string,
 *   filename:      string,
 *   contentBase64: string,   — base64-encoded file content
 *   metadata: {
 *     docName:   string,
 *     appId?:    string,
 *     formName?: string,
 *     extra?:    Record<string, string>
 *   }
 * }
 */
router.post('/documents', async (req: Request, res: Response) => {
  const { workspaceId, filename, contentBase64, metadata } = req.body as {
    workspaceId?: string;
    filename?: string;
    contentBase64?: string;
    metadata?: {
      docName?: string;
      appId?: string;
      formName?: string;
      extra?: Record<string, string>;
    };
  };

  if (
    !workspaceId?.trim() ||
    !filename?.trim() ||
    !contentBase64?.trim() ||
    !metadata?.docName?.trim()
  ) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_INPUT',
        message: 'workspaceId, filename, contentBase64, and metadata.docName are required',
      },
    });
  }

  try {
    logger.info('[edocs.routes] Upload document', {
      workspaceId,
      filename,
      docName: metadata.docName,
    });
    const result = await edocsService.uploadDocument(
      workspaceId.trim(),
      filename.trim(),
      contentBase64.trim(),
      {
        docName: metadata.docName.trim(),
        appId: metadata.appId,
        formName: metadata.formName,
        extra: metadata.extra,
      }
    );
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error('[edocs.routes] uploadDocument failed', {
      workspaceId,
      error: getErrorMessage(err),
    });
    res.status(500).json({
      success: false,
      error: { code: 'EDOCS_UPLOAD_FAILED', message: getErrorMessage(err) },
    });
  }
});

/**
 * GET /v1/edocs/workspaces/:workspaceId/documents
 * Lists documents stored in an eDOCS workspace.
 */
router.get('/workspaces/:workspaceId/documents', async (req: Request, res: Response) => {
  const { workspaceId } = req.params;

  try {
    logger.info('[edocs.routes] Get workspace documents', { workspaceId });
    const documents = await edocsService.getWorkspaceDocuments(workspaceId);
    res.json({ success: true, data: { documents, count: documents.length } });
  } catch (err) {
    logger.error('[edocs.routes] getWorkspaceDocuments failed', {
      workspaceId,
      error: getErrorMessage(err),
    });
    res.status(500).json({
      success: false,
      error: { code: 'EDOCS_DOCUMENTS_FAILED', message: getErrorMessage(err) },
    });
  }
});

export default router;
