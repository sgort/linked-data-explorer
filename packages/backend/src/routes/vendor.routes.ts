import express, { Request, Response } from 'express';
import { vendorService } from '../services/vendor.service';
import logger from '../utils/logger';
import { getErrorMessage } from '../utils/errors';
import packageJson from '../../package.json';

const router = express.Router();

/**
 * GET /v1/vendors
 * Get all vendor services
 *
 * Query params:
 * - endpoint: SPARQL endpoint URL (optional)
 */
router.get('/', async (req: Request, res: Response) => {
  res.set('API-Version', packageJson.version);
  res.set('Content-Type', 'application/json');

  try {
    const endpoint = req.query.endpoint as string | undefined;

    logger.info('[Vendor Routes] Get all vendor services requested', {
      ...(endpoint && { endpoint }),
    });

    const vendorServices = await vendorService.getAllVendorServices(endpoint);

    res.json({
      success: true,
      data: {
        vendorServices,
        count: vendorServices.length,
      },
    });
  } catch (error) {
    logger.error('[Vendor Routes] Error fetching vendor services', {
      error: getErrorMessage(error),
    });

    res.status(500).json({
      success: false,
      error: getErrorMessage(error),
    });
  }
});

/**
 * GET /v1/vendors/dmn/:identifier
 * Get vendor services for a specific DMN
 *
 * Path params:
 * - identifier: DMN identifier (e.g., "SVB_LeeftijdsInformatie")
 *
 * Query params:
 * - endpoint: SPARQL endpoint URL (optional)
 */
router.get('/dmn/:identifier', async (req: Request, res: Response) => {
  res.set('API-Version', packageJson.version);
  res.set('Content-Type', 'application/json');

  try {
    const { identifier } = req.params;
    const endpoint = req.query.endpoint as string | undefined;

    logger.info('[Vendor Routes] Get vendor services for DMN', {
      identifier,
      ...(endpoint && { endpoint }),
    });

    const vendorServices = await vendorService.getVendorServicesForDmn(identifier, endpoint);

    res.json({
      success: true,
      data: {
        vendorServices,
        count: vendorServices.length,
        dmnIdentifier: identifier,
      },
    });
  } catch (error) {
    logger.error('[Vendor Routes] Error fetching vendor services for DMN', {
      identifier: req.params.identifier,
      error: getErrorMessage(error),
    });

    res.status(500).json({
      success: false,
      error: getErrorMessage(error),
    });
  }
});

export default router;
