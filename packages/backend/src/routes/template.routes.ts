import { Router, Request, Response } from 'express';
import { templateService } from '../services/template.service';
import logger from '../utils/logger';
import { ApiResponse } from '../types/api.types';
import { ChainTemplateListResponse } from '../types/template.types';
import { getErrorMessage, getErrorDetails } from '../utils/errors';

const router = Router();

/**
 * GET /v1/chains/templates
 * List all available chain templates
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { category, tag } = req.query;

    logger.info('Chain templates list request', { category, tag });

    let templates;

    if (category && typeof category === 'string') {
      templates = await templateService.getTemplatesByCategory(category);
    } else if (tag && typeof tag === 'string') {
      templates = await templateService.getTemplatesByTag(tag);
    } else {
      templates = await templateService.getAllTemplates();
    }

    const categories = await templateService.getCategories();

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

    res.status(500).json({
      success: false,
      error: {
        code: 'QUERY_ERROR',
        message: getErrorMessage(error),
      },
      timestamp: new Date().toISOString(),
    } as ApiResponse);
  }
});

/**
 * GET /v1/chains/templates/:id
 * Get a specific template by ID
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    logger.info('Chain template details request', { id });

    const template = await templateService.getTemplateById(id);

    if (!template) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: `Template not found: ${id}`,
        },
        timestamp: new Date().toISOString(),
      } as ApiResponse);
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

    res.status(500).json({
      success: false,
      error: {
        code: 'QUERY_ERROR',
        message: getErrorMessage(error),
      },
      timestamp: new Date().toISOString(),
    } as ApiResponse);
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

    res.status(500).json({
      success: false,
      error: {
        code: 'QUERY_ERROR',
        message: getErrorMessage(error),
      },
      timestamp: new Date().toISOString(),
    } as ApiResponse);
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

    res.status(500).json({
      success: false,
      error: {
        code: 'QUERY_ERROR',
        message: getErrorMessage(error),
      },
      timestamp: new Date().toISOString(),
    } as ApiResponse);
  }
});

export default router;
