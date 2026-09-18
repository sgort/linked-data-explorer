import express from 'express';
import { operatonService } from '../services/operaton.service';
import logger from '../utils/logger';
import { sendProblem } from '../utils/problem';

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
      sendProblem(res, req, {
        status: 404,
        code: 'DMN_NOT_FOUND',
        detail: `DMN definition not found: ${definitionKey}`,
      });
      return;
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

    sendProblem(res, req, {
      status: 500,
      code: 'DMN_FETCH_FAILED',
      detail: `Failed to fetch DMN: ${error instanceof Error ? error.message : 'Unknown error'}`,
    });
  }
});

export default router;
