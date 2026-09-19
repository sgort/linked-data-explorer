import { Router, Request, Response } from 'express';
import { templateService } from '../services/template.service';
import logger from '../utils/logger';
import { ApiResponse } from '../types/api.types';
import { ChainTemplateListResponse } from '../types/template.types';
import { getErrorMessage, getErrorDetails } from '../utils/errors';
import { sendProblem } from '../utils/problem';

const router = Router();

/**
 * GET /v1/chains/templates
 * List all available chain templates
 * Supports ?endpoint= parameter for filtering
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { category, tag, endpoint } = req.query; // ← ADD endpoint

    logger.info('Chain templates list request', {
      category,
      tag,
      ...(endpoint && { endpoint }), // ← LOG endpoint if present
    });

    let templates;

    if (category && typeof category === 'string') {
      templates = await templateService.getTemplatesByCategory(
        category,
        endpoint as string | undefined // ← PASS endpoint
      );
    } else if (tag && typeof tag === 'string') {
      templates = await templateService.getTemplatesByTag(
        tag,
        endpoint as string | undefined // ← PASS endpoint
      );
    } else {
      templates = await templateService.getAllTemplates(
        endpoint as string | undefined // ← PASS endpoint
      );
    }

    // Extract categories from already-fetched templates
    const categories = Array.from(new Set(templates.map((t) => t.category))).sort();

    const response: ChainTemplateListResponse = {
      total: templates.length,
      templates,
      categories,
    };

    res.json({
      success: true,
      data: response,
      timestamp: new Date().toISOString(),
    } as ApiResponse);
  } catch (error: unknown) {
    const errorDetails = getErrorDetails(error);
    logger.error('Chain templates list error', errorDetails);

    sendProblem(res, req, { status: 500, code: 'QUERY_ERROR', detail: getErrorMessage(error) });
  }
});

/**
 * GET /v1/chains/templates/:id
 * Get a specific template by ID
 * Supports ?endpoint= parameter for validation
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { endpoint } = req.query; // ← ADD endpoint

    logger.info('Chain template details request', {
      id,
      ...(endpoint && { endpoint }), // ← LOG endpoint if present
    });

    const template = await templateService.getTemplateById(
      id,
      endpoint as string | undefined // ← PASS endpoint
    );

    if (!template) {
      sendProblem(res, req, {
        status: 404,
        code: 'NOT_FOUND',
        detail: `Template not found or not valid for endpoint: ${id}`,
      });
      return;
    }

    // Increment usage count
    await templateService.incrementUsageCount(id);

    res.json({
      success: true,
      data: template,
      timestamp: new Date().toISOString(),
    } as ApiResponse);
  } catch (error: unknown) {
    const errorDetails = getErrorDetails(error);
    logger.error('Chain template details error', errorDetails);

    sendProblem(res, req, { status: 500, code: 'QUERY_ERROR', detail: getErrorMessage(error) });
  }
});

/**
 * GET /v1/chains/templates/categories/list
 * Get all available categories
 */
router.get('/categories/list', async (req: Request, res: Response) => {
  try {
    logger.info('Template categories request');

    const categories = await templateService.getCategories();

    res.json({
      success: true,
      data: {
        categories,
        total: categories.length,
      },
      timestamp: new Date().toISOString(),
    } as ApiResponse);
  } catch (error: unknown) {
    const errorDetails = getErrorDetails(error);
    logger.error('Template categories error', errorDetails);

    sendProblem(res, req, { status: 500, code: 'QUERY_ERROR', detail: getErrorMessage(error) });
  }
});

/**
 * GET /v1/chains/templates/tags/list
 * Get all available tags
 */
router.get('/tags/list', async (req: Request, res: Response) => {
  try {
    logger.info('Template tags request');

    const tags = await templateService.getTags();

    res.json({
      success: true,
      data: {
        tags,
        total: tags.length,
      },
      timestamp: new Date().toISOString(),
    } as ApiResponse);
  } catch (error: unknown) {
    const errorDetails = getErrorDetails(error);
    logger.error('Template tags error', errorDetails);

    sendProblem(res, req, { status: 500, code: 'QUERY_ERROR', detail: getErrorMessage(error) });
  }
});

export default router;
