// packages/backend/src/routes/dso.routes.ts

import { Router, Request, Response } from 'express';
import * as dsoService from '../services/dso.service';
import { logger } from '../utils/logger';
import packageJson from '../../package.json';

const router = Router();

const getEnv = (req: Request): 'pre' | 'prod' => {
  if (req.headers['x-dso-env'] === 'prod' || req.query['env'] === 'prod') return 'prod';
  return 'pre';
};

/**
 * POST /v1/dso/activiteiten/oin
 * Retrieve all activities registered by a specific authority (OIN).
 *
 * Body: { oin: string }
 */
router.post('/activiteiten/oin', async (req: Request, res: Response) => {
  res.set('API-Version', packageJson.version);
  try {
    const { oin, datum } = req.body as { oin?: string; datum?: string };
    if (!oin) {
      return res.status(400).json({ success: false, error: 'oin is required' });
    }
    const data = await dsoService.getActiviteitenByOin(oin, getEnv(req), datum);
    res.status(200).json({ success: true, data });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'DSO request failed';
    logger.error('[DSO Routes] POST /activiteiten/oin failed', { error: msg });
    res.status(502).json({ success: false, error: msg });
  }
});

/**
 * POST /v1/dso/activiteiten/zoek
 * Search activities by date and optional point geometry.
 *
 * Body: { datum?: string, lat?: number, lon?: number, page?: number, pageSize?: number }
 */
router.post('/activiteiten/zoek', async (req: Request, res: Response) => {
  res.set('API-Version', packageJson.version);
  try {
    const { datum, lat, lon, page, pageSize } = req.body as {
      datum?: string;
      lat?: number;
      lon?: number;
      page?: number;
      pageSize?: number;
    };
    const data = await dsoService.zoekActiviteiten(
      { datum, lat, lon, page, pageSize },
      getEnv(req)
    );
    res.status(200).json({ success: true, data });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'DSO request failed';
    logger.error('[DSO Routes] POST /activiteiten/zoek failed', { error: msg });
    res.status(502).json({ success: false, error: msg });
  }
});

/**
 * GET /v1/dso/activiteiten/:urn
 * Fetch a single activity by URN from the RTR.
 *
 * Query params:
 *   datum  — dd-MM-yyyy (optional, defaults to today)
 */
router.get('/activiteiten/:urn', async (req: Request, res: Response) => {
  res.set('API-Version', packageJson.version);

  try {
    const urn = decodeURIComponent(req.params.urn);
    const datum = req.query.datum as string | undefined;

    const data = await dsoService.getActiviteit(urn, datum, getEnv(req));
    res.status(200).json({ success: true, data });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'DSO request failed';
    const status = msg.includes('404') ? 404 : 502;
    logger.error('[DSO Routes] GET /activiteiten/:urn failed', { error: msg });
    res.status(status).json({ success: false, error: msg });
  }
});

/**
 * GET /v1/dso/begrippen
 * Search concepts in the DSO Stelselcatalogus.
 *
 * Query params:
 *   zoekTerm  — free-text search (optional)
 *   geldigOp  — validity date YYYY-MM-dd (optional, defaults to current)
 *   page      — page number (default 1)
 *   pageSize  — 10 | 20 | 40 | 100 (default 10)
 *
 * Returns the HAL response from DSO verbatim, wrapped in LDE's standard envelope.
 */
router.get('/begrippen', async (req: Request, res: Response) => {
  res.set('API-Version', packageJson.version);

  try {
    const { zoekTerm, geldigOp, page, pageSize } = req.query;

    const data = await dsoService.getBegrippen(
      {
        zoekTerm: zoekTerm as string | undefined,
        geldigOp: geldigOp as string | undefined,
        page: page ? parseInt(page as string, 10) : undefined,
        pageSize: pageSize ? parseInt(pageSize as string, 10) : undefined,
      },
      getEnv(req)
    );

    res.status(200).json({ success: true, data });
  } catch (error) {
    logger.error('[DSO Routes] GET /begrippen failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    res.status(502).json({
      success: false,
      error: error instanceof Error ? error.message : 'DSO request failed',
    });
  }
});

/**
 * GET /v1/dso/activiteiten
 * Retrieve all legal activities valid on a given date from the RTR.
 *
 * Query params:
 *   datum     — date dd-MM-yyyy (optional, defaults to today)
 *   page      — page number (default 1)
 *   pageSize  — 10 | 20 | 40 | 100 (default 10)
 */
router.get('/activiteiten', async (req: Request, res: Response) => {
  res.set('API-Version', packageJson.version);

  try {
    const { datum, page, pageSize } = req.query;

    const data = await dsoService.getActiviteiten(
      {
        datum: datum as string | undefined,
        page: page ? parseInt(page as string, 10) : undefined,
        pageSize: pageSize ? parseInt(pageSize as string, 10) : undefined,
      },
      getEnv(req)
    );

    res.status(200).json({ success: true, data });
  } catch (error) {
    logger.error('[DSO Routes] GET /activiteiten failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    res.status(502).json({
      success: false,
      error: error instanceof Error ? error.message : 'DSO request failed',
    });
  }
});

/**
 * POST /v1/dso/werkzaamheden/zoek
 * Search werkzaamheden via the Zoekinterface.
 * Body: { zoekterm?: string, page?: number, pageSize?: number }
 */
router.post('/werkzaamheden/zoek', async (req: Request, res: Response) => {
  res.set('API-Version', packageJson.version);
  try {
    const { zoekterm, page, pageSize } = req.body as {
      zoekterm?: string;
      page?: number;
      pageSize?: number;
    };
    const data = await dsoService.zoekWerkzaamheden({ zoekterm, page, pageSize }, getEnv(req));
    res.status(200).json({ success: true, data });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'DSO request failed';
    logger.error('[DSO Routes] POST /werkzaamheden/zoek failed', { error: msg });
    res.status(502).json({ success: false, error: msg });
  }
});

/**
 * POST /v1/dso/werkzaamheden/suggereer
 * Autocomplete suggestions for werkzaamheden search terms.
 * Body: { zoekterm: string }
 */
router.post('/werkzaamheden/suggereer', async (req: Request, res: Response) => {
  res.set('API-Version', packageJson.version);
  try {
    const { zoekterm } = req.body as { zoekterm?: string };
    if (!zoekterm) {
      return res.status(400).json({ success: false, error: 'zoekterm is required' });
    }
    const data = await dsoService.suggereerWerkzaamheden(zoekterm, getEnv(req));
    res.status(200).json({ success: true, data });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'DSO request failed';
    logger.error('[DSO Routes] POST /werkzaamheden/suggereer failed', { error: msg });
    res.status(502).json({ success: false, error: msg });
  }
});

/**
 * GET /v1/dso/werkzaamheden/:urn
 * Retrieve versioned detail for a single werkzaamheid.
 */
router.get('/werkzaamheden/:urn', async (req: Request, res: Response) => {
  res.set('API-Version', packageJson.version);
  try {
    const urn = decodeURIComponent(req.params.urn);
    const data = await dsoService.getWerkzaamheidDetail(urn, getEnv(req));
    res.status(200).json({ success: true, data });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'DSO request failed';
    const status = msg.includes('404') ? 404 : 502;
    logger.error('[DSO Routes] GET /werkzaamheden/:urn failed', { error: msg });
    res.status(status).json({ success: false, error: msg });
  }
});

/**
 * GET /v1/dso/toepasbare-regels
 * Fetch metadata for toepasbare regels by functioneleStructuurRef.
 *
 * Query params:
 *   functioneleStructuurRef  — full concept URI (required)
 */
router.get('/toepasbare-regels', async (req: Request, res: Response) => {
  res.set('API-Version', packageJson.version);
  const { functioneleStructuurRef } = req.query;
  if (!functioneleStructuurRef || typeof functioneleStructuurRef !== 'string') {
    return res.status(400).json({ success: false, error: 'functioneleStructuurRef is required' });
  }
  try {
    const data = await dsoService.getToepasbareRegels(functioneleStructuurRef, getEnv(req));
    res.status(200).json({ success: true, data });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'DSO request failed';
    const status = msg.includes('404') ? 404 : 502;
    logger.error('[DSO Routes] GET /toepasbare-regels failed', { error: msg });
    res.status(status).json({ success: false, error: msg });
  }
});

/**
 * GET /v1/dso/toepasbare-regels/:id/sttr
 * Download the raw STTR XML for a toepasbare regel.
 */
router.get('/toepasbare-regels/:id/sttr', async (req: Request, res: Response) => {
  res.set('API-Version', packageJson.version);
  try {
    const xml = await dsoService.getSttrBestand(req.params.id, getEnv(req));
    res.set('Content-Type', 'application/xml');
    res.set('Content-Disposition', `attachment; filename="sttr-${req.params.id}.xml"`);
    res.status(200).send(xml);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'DSO request failed';
    const status = msg.includes('404') ? 404 : 502;
    logger.error('[DSO Routes] GET /toepasbare-regels/:id/sttr failed', { error: msg });
    res.status(status).json({ success: false, error: msg });
  }
});

/**
 * GET /v1/dso/toepasbare-regels/:id/dmn
 * Extract the embedded DMN <definitions> from a conclusie STTR and return it
 * as a standalone DMN XML file ready for import into LDE or deployment to Operaton.
 */
router.get('/toepasbare-regels/:id/dmn', async (req: Request, res: Response) => {
  res.set('API-Version', packageJson.version);
  try {
    const xml = await dsoService.getSttrBestand(req.params.id, getEnv(req));
    const dmn = dsoService.extractDmnFromSttr(xml);
    res.set('Content-Type', 'application/xml');
    res.set('Content-Disposition', `attachment; filename="decision-${req.params.id}.dmn"`);
    res.status(200).send(dmn);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'DMN extraction failed';
    const status = msg.includes('404') ? 404 : msg.includes('No DMN') ? 422 : 502;
    logger.error('[DSO Routes] GET /toepasbare-regels/:id/dmn failed', { error: msg });
    res.status(status).json({ success: false, error: msg });
  }
});

/**
 * GET /v1/dso/toepasbare-regels/:id/form-scaffold
 * Generate a best-effort form-js field scaffold from an indieningsvereisten STTR.
 *
 * Query params:
 *   formId  — desired form-js schema id (optional, defaults to the toepasbare-regel id)
 */
router.get('/toepasbare-regels/:id/form-scaffold', async (req: Request, res: Response) => {
  res.set('API-Version', packageJson.version);
  try {
    const xml = await dsoService.getSttrBestand(req.params.id, getEnv(req));
    const formId = (req.query.formId as string | undefined) ?? req.params.id;
    const scaffold = dsoService.extractFormScaffoldFromSttr(xml, formId);
    res.status(200).json({ success: true, data: scaffold });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Form scaffold extraction failed';
    const status = msg.includes('404') ? 404 : 502;
    logger.error('[DSO Routes] GET /toepasbare-regels/:id/form-scaffold failed', { error: msg });
    res.status(status).json({ success: false, error: msg });
  }
});

export default router;
