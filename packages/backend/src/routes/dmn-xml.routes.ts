import express from 'express';
import { operatonService } from '../services/operaton.service';
import logger from '../utils/logger';

const router = express.Router();

/**
 * GET /api/dmns/:definitionKey/xml
 * Fetch DMN XML content from Operaton
 */
router.get('/:definitionKey/xml', async (req, res) => {
  const { definitionKey } = req.params;

  logger.info('Fetching DMN XML', { definitionKey });

  try {
    const dmnXml = await operatonService.fetchDmnXml(definitionKey);

    if (!dmnXml) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'DMN_NOT_FOUND',
          message: `DMN definition not found: ${definitionKey}`,
        },
      });
    }

    // Return XML with correct content type
    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Content-Disposition', `attachment; filename="${definitionKey}.dmn"`);
    res.send(dmnXml);
  } catch (error) {
    logger.error('Failed to fetch DMN XML', {
      definitionKey,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    res.status(500).json({
      success: false,
      error: {
        code: 'DMN_FETCH_FAILED',
        message: `Failed to fetch DMN: ${error instanceof Error ? error.message : 'Unknown error'}`,
      },
    });
  }
});

export default router;
