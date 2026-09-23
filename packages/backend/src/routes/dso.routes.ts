// packages/backend/src/routes/dso.routes.ts

import { Router, Request, Response } from 'express';
import * as dsoService from '../services/dso.service';
import * as ozonService from '../services/ozon.service';
import { buildDossier } from '../services/dossier.service';
import { profileDossier } from '../services/quality.service';
import { logger } from '../utils/logger';
import { sendProblem } from '../utils/problem';
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
      sendProblem(res, req, { status: 400, title: 'Invalid request', detail: 'oin is required' });
      return;
    }
    const data = await dsoService.getActiviteitenByOin(oin, getEnv(req), datum);
    res.status(200).json({ success: true, data });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'DSO request failed';
    logger.error('[DSO Routes] POST /activiteiten/oin failed', { error: msg });
    sendProblem(res, req, { status: 502, title: 'Upstream request failed', detail: msg });
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
    sendProblem(res, req, { status: 502, title: 'Upstream request failed', detail: msg });
  }
});

/**
 * GET /v1/dso/activiteiten/:urn/dossier
 * The full chain: legal source, annotation, decision criteria, submission
 * requirements, plus the quality profile.
 *
 * Declared before `/activiteiten/:urn` by convention, grouping the two
 * `/activiteiten/:urn*` routes together — not because ordering is
 * load-bearing here. A 2-segment route (`/activiteiten/:urn`) cannot match
 * this route's 3-segment path (`/activiteiten/:urn/dossier`) regardless of
 * declaration order, so the routes would resolve identically either way.
 */
router.get('/activiteiten/:urn/dossier', async (req: Request, res: Response) => {
  res.set('API-Version', packageJson.version);
  try {
    const datum = typeof req.query['datum'] === 'string' ? req.query['datum'] : undefined;
    const authority =
      typeof req.query['authority'] === 'string' ? req.query['authority'] : undefined;

    const data = await buildDossier({
      urn: req.params['urn'] as string,
      env: getEnv(req),
      datum,
      authority,
    });

    res
      .status(200)
      .json({ success: true, data: { ...data, qualityProfile: profileDossier(data) } });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'DSO request failed';
    logger.error('[DSO Routes] GET /activiteiten/:urn/dossier failed', { error: msg });
    const status = msg.includes('404') ? 404 : 502;
    sendProblem(res, req, {
      status,
      title: status === 404 ? 'Not found' : 'Upstream request failed',
      detail: msg,
    });
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
    // Express already decodes path params — a second decodeURIComponent here
    // would corrupt a URN containing a literal `%` (e.g. `%25` -> `%`).
    const urn = req.params.urn;
    const datum = req.query.datum as string | undefined;

    const data = await dsoService.getActiviteit(urn, datum, getEnv(req));
    res.status(200).json({ success: true, data });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'DSO request failed';
    const status = msg.includes('404') ? 404 : 502;
    logger.error('[DSO Routes] GET /activiteiten/:urn failed', { error: msg });
    sendProblem(res, req, {
      status,
      title: status === 404 ? 'Not found' : 'Upstream request failed',
      detail: msg,
    });
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
    sendProblem(res, req, {
      status: 502,
      title: 'Upstream request failed',
      detail: error instanceof Error ? error.message : 'DSO request failed',
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
    sendProblem(res, req, {
      status: 502,
      title: 'Upstream request failed',
      detail: error instanceof Error ? error.message : 'DSO request failed',
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
    sendProblem(res, req, { status: 502, title: 'Upstream request failed', detail: msg });
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
      sendProblem(res, req, {
        status: 400,
        title: 'Invalid request',
        detail: 'zoekterm is required',
      });
      return;
    }
    const data = await dsoService.suggereerWerkzaamheden(zoekterm, getEnv(req));
    res.status(200).json({ success: true, data });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'DSO request failed';
    logger.error('[DSO Routes] POST /werkzaamheden/suggereer failed', { error: msg });
    sendProblem(res, req, { status: 502, title: 'Upstream request failed', detail: msg });
  }
});

/**
 * GET /v1/dso/werkzaamheden/:urn
 * Retrieve versioned detail for a single werkzaamheid.
 */
router.get('/werkzaamheden/:urn', async (req: Request, res: Response) => {
  res.set('API-Version', packageJson.version);
  try {
    // Express already decodes path params — see the identical comment on
    // GET /activiteiten/:urn above.
    const urn = req.params.urn;
    const data = await dsoService.getWerkzaamheidDetail(urn, getEnv(req));
    res.status(200).json({ success: true, data });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'DSO request failed';
    const status = msg.includes('404') ? 404 : 502;
    logger.error('[DSO Routes] GET /werkzaamheden/:urn failed', { error: msg });
    sendProblem(res, req, {
      status,
      title: status === 404 ? 'Not found' : 'Upstream request failed',
      detail: msg,
    });
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
    sendProblem(res, req, {
      status: 400,
      title: 'Invalid request',
      detail: 'functioneleStructuurRef is required',
    });
    return;
  }
  try {
    const data = await dsoService.getToepasbareRegels(functioneleStructuurRef, getEnv(req));
    res.status(200).json({ success: true, data });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'DSO request failed';
    const status = msg.includes('404') ? 404 : 502;
    logger.error('[DSO Routes] GET /toepasbare-regels failed', { error: msg });
    sendProblem(res, req, {
      status,
      title: status === 404 ? 'Not found' : 'Upstream request failed',
      detail: msg,
    });
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
    sendProblem(res, req, {
      status,
      title: status === 404 ? 'Not found' : 'Upstream request failed',
      detail: msg,
    });
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
    sendProblem(res, req, {
      status,
      title:
        status === 404 ? 'Not found' : status === 422 ? 'No DMN found' : 'Upstream request failed',
      detail: msg,
    });
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
    sendProblem(res, req, {
      status,
      title: status === 404 ? 'Not found' : 'Upstream request failed',
      detail: msg,
    });
  }
});

/**
 * POST /v1/dso/regelingen/zoek
 * Find an authority's regelingen. Body: { bevoegdGezag?: string[], typeBevoegdGezag?: string[] }
 */
router.post('/regelingen/zoek', async (req: Request, res: Response) => {
  res.set('API-Version', packageJson.version);
  try {
    const { bevoegdGezag, typeBevoegdGezag, size } = req.body as {
      bevoegdGezag?: string[];
      typeBevoegdGezag?: string[];
      size?: number;
    };
    if (!bevoegdGezag?.length && !typeBevoegdGezag?.length) {
      sendProblem(res, req, {
        status: 400,
        title: 'Invalid request',
        detail: 'bevoegdGezag or typeBevoegdGezag is required',
      });
      return;
    }
    const data = await ozonService.zoekRegelingen({ bevoegdGezag, typeBevoegdGezag }, getEnv(req), {
      size,
    });
    res.status(200).json({ success: true, data });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'DSO request failed';
    logger.error('[DSO Routes] POST /regelingen/zoek failed', { error: msg });
    const status = msg.includes('404') ? 404 : 502;
    sendProblem(res, req, {
      status,
      title: status === 404 ? 'Not found' : 'Upstream request failed',
      detail: msg,
    });
  }
});

/**
 * GET /v1/dso/regelingen/:id/annotaties
 * The regeltekst annotation graph for one regeling.
 */
router.get('/regelingen/:id/annotaties', async (req: Request, res: Response) => {
  res.set('API-Version', packageJson.version);
  try {
    const geldigOp = typeof req.query['geldigOp'] === 'string' ? req.query['geldigOp'] : undefined;
    const data = await ozonService.getRegeltekstAnnotaties(req.params.id, getEnv(req), {
      geldigOp,
    });
    res.status(200).json({ success: true, data });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'DSO request failed';
    logger.error('[DSO Routes] GET /regelingen/:id/annotaties failed', { error: msg });
    const status = msg.includes('404') ? 404 : 502;
    sendProblem(res, req, {
      status,
      title: status === 404 ? 'Not found' : 'Upstream request failed',
      detail: msg,
    });
  }
});

/**
 * GET /v1/dso/regelingen/:id/documentstructuur/:wId
 * One document component (an article or lid) with its STOP/IMOP content.
 */
router.get('/regelingen/:id/documentstructuur/:wId', async (req: Request, res: Response) => {
  res.set('API-Version', packageJson.version);
  try {
    const data = await ozonService.getDocumentComponent(req.params.id, req.params.wId, getEnv(req));
    res.status(200).json({ success: true, data });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'DSO request failed';
    logger.error('[DSO Routes] GET /regelingen/:id/documentstructuur/:wId failed', { error: msg });
    const status = msg.includes('404') ? 404 : 502;
    sendProblem(res, req, {
      status,
      title: status === 404 ? 'Not found' : 'Upstream request failed',
      detail: msg,
    });
  }
});

export default router;
