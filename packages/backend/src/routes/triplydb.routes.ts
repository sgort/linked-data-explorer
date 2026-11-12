// packages/backend/src/routes/triplydb.routes.ts
// Dutch Government API Design Rules Compliant Implementation

import { Router, Request, Response } from 'express';
import * as triplydbService from '../services/triplydb.service';
import { logger } from '../utils/logger';
import { sendProblem } from '../utils/problem';
import { refuseTarget, checkSparqlEndpoint } from '../utils/outboundUrl';

const router = Router();

// Get package.json for version info
import packageJson from '../../package.json';
import { requireAuthor } from '../middleware/auth.middleware';
import type { NextFunction } from 'express';

/**
 * Publishing needs the server's TriplyDB account and token (ttl-editor#234).
 * Without them the backend still runs; only these routes answer 503.
 */
export function requirePublishTarget(req: Request, res: Response, next: NextFunction): void {
  if (triplydbService.publishTarget()) {
    next();
    return;
  }
  sendProblem(res, req, {
    status: 503,
    title: 'Publishing not configured',
    detail: 'Publishing is not configured on this backend',
  });
}

/**
 * GET /v1/triplydb/publish-target
 * The non-secret part of where the editors publish to: base URL and account,
 * never the token. ttl-editor builds its "required services" picker URL from
 * it plus the dataset the author chose.
 */
router.get('/publish-target', requirePublishTarget, (_req: Request, res: Response) => {
  res.set('API-Version', packageJson.version);
  res.status(200).json(triplydbService.publishTarget());
});

/** TriplyDB's own rule for dataset names; it also keeps a write inside the account. */
export const DATASET_NAME = /^[A-Za-z0-9-]{1,40}$/;
const GRAPH_PREFIX = 'https://regels.overheid.nl/graphs/';
const PLAIN_FILE_NAME = /^[^/\\]+$/;

interface PublishLogo {
  fileName: string;
  dataUrl: string;
}

/** The reason a publish request is refused, or null when it is valid. */
function publishInputError(body: Record<string, unknown>): string | null {
  const { dataset, graph, filename, ttl, logos } = body;
  if (typeof dataset !== 'string' || !DATASET_NAME.test(dataset)) {
    return '`dataset` must be 1 to 40 letters, digits or hyphens';
  }
  if (
    typeof graph !== 'string' ||
    !graph.startsWith(GRAPH_PREFIX) ||
    !URL.canParse(graph) ||
    /\s/.test(graph)
  ) {
    return `\`graph\` must be an IRI under ${GRAPH_PREFIX}`;
  }
  if (typeof filename !== 'string' || !filename.trim()) return '`filename` is required';
  if (typeof ttl !== 'string' || !ttl.trim()) return '`ttl` must not be empty';
  if (logos !== undefined) {
    if (!Array.isArray(logos)) return '`logos` must be a list';
    for (const logo of logos as Partial<PublishLogo>[]) {
      if (
        typeof logo?.fileName !== 'string' ||
        !PLAIN_FILE_NAME.test(logo.fileName) ||
        logo.fileName.includes('..')
      ) {
        return 'each logo needs a plain `fileName`';
      }
      if (typeof logo.dataUrl !== 'string' || !logo.dataUrl.startsWith('data:image/')) {
        return 'each logo needs an image `dataUrl`';
      }
    }
  }
  return null;
}

/**
 * POST /v1/triplydb/publish
 * Publish a service description as the signed-in lde-author (ttl-editor#234):
 * upload the TTL into its graph, upload the logos, sync the dataset's service.
 * The TriplyDB token is the server's; the caller never sends or sees one.
 * Every attempt writes one log line saying who published what, and how it went.
 */
router.post(
  '/publish',
  requireAuthor,
  requirePublishTarget,
  async (req: Request, res: Response) => {
    res.set('API-Version', packageJson.version);

    const body = (req.body ?? {}) as Record<string, unknown>;
    const invalid = publishInputError(body);
    if (invalid) {
      sendProblem(res, req, { status: 400, code: 'INVALID_INPUT', detail: invalid });
      return;
    }

    const dataset = body.dataset as string;
    const graph = body.graph as string;
    const logos = (body.logos as PublishLogo[] | undefined) ?? [];
    const user = res.locals.user as { sub: string; username?: string } | undefined;
    const entry = {
      event: 'triplydb.publish',
      user: user?.username ?? user?.sub,
      organization: body.organization,
      service: body.service,
      graph,
      dataset,
    };

    const dbConfig = triplydbService.serverConfig(dataset);

    try {
      await triplydbService.uploadTtl(dbConfig, body.ttl as string, body.filename as string, graph);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Upload failed';
      logger.warn('[TriplyDB] publish', { ...entry, outcome: 'failed', error: message });
      sendProblem(res, req, { status: 502, title: 'TriplyDB request failed', detail: message });
      return;
    }

    const logoResults: Array<{ fileName: string; ok: boolean }> = [];
    for (const logo of logos) {
      try {
        await triplydbService.uploadAsset(dbConfig, logo.fileName, logo.dataUrl);
        logoResults.push({ fileName: logo.fileName, ok: true });
      } catch {
        logoResults.push({ fileName: logo.fileName, ok: false });
      }
    }

    let serviceError: string | undefined;
    try {
      await triplydbService.updateService(dbConfig, dataset, undefined, graph);
    } catch (error) {
      serviceError = error instanceof Error ? error.message : 'Service update failed';
    }

    if (serviceError) {
      logger.info('[TriplyDB] publish', {
        ...entry,
        outcome: 'published-with-warning',
        error: serviceError,
      });
    } else {
      logger.info('[TriplyDB] publish', { ...entry, outcome: 'published' });
    }

    res.status(200).json({
      success: true,
      url: `${dbConfig.baseUrl.replace('api.', '')}/datasets/${dbConfig.account}/${dataset}`,
      graph,
      serviceUpdated: !serviceError,
      ...(serviceError ? { serviceError } : {}),
      logos: logoResults,
    });
  }
);

/**
 * POST /v1/triplydb/query
 * Execute a SPARQL query against any TriplyDB endpoint
 *
 * Compliance notes:
 * - API-05: Uses noun "query" for resource name
 * - API-57: Returns API-Version header
 * - API-48: POST used for query execution with payload
 *
 * Purpose: Allows frontend to execute SPARQL queries against different TriplyDB
 * endpoints without hardcoding the endpoint. This enables dynamic dataset switching
 * in the Orchestration view while avoiding CORS issues.
 *
 * Request body:
 * {
 *   "endpoint": "https://api.open-regels.triply.cc/datasets/.../sparql",
 *   "query": "SELECT ?s ?p ?o WHERE { ?s ?p ?o } LIMIT 10"
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "results": {
 *     "bindings": [...]
 *   }
 * }
 */
router.post('/query', async (req: Request, res: Response) => {
  // Set API-Version header (API-57 requirement)
  res.set('API-Version', packageJson.version);
  res.set('Content-Type', 'application/json');

  try {
    const { endpoint, query } = req.body;

    // Validate request
    if (!endpoint || !query) {
      logger.warn('[TriplyDB Routes] Invalid query request: missing endpoint or query', {
        hasEndpoint: !!endpoint,
        hasQuery: !!query,
      });

      sendProblem(res, req, {
        status: 400,
        title: 'Invalid request',
        detail: 'Missing required fields: endpoint and query',
      });
      return;
    }

    if (refuseTarget(res, req, checkSparqlEndpoint(endpoint, 'endpoint'))) return;

    logger.info('[TriplyDB Routes] SPARQL query request received', {
      endpoint: endpoint,
      queryLength: query.length,
    });

    const startTime = Date.now();
    const result = await triplydbService.executeQuery(endpoint, query);
    const duration = Date.now() - startTime;

    logger.info('[TriplyDB Routes] Query executed successfully', {
      duration: `${duration}ms`,
      resultCount: result.results?.bindings?.length || 0,
    });

    res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    logger.error('[TriplyDB Routes] Query execution failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });

    sendProblem(res, req, {
      status: 500,
      title: 'TriplyDB request failed',
      detail: error instanceof Error ? error.message : 'Query execution failed',
    });
  }
});

/**
 * The dataset a request names, as `dataset` or (as older clients send it)
 * `config.dataset`. Anything else in `config` — instance, account, token — is
 * ignored: these routes use the server's own (ttl-editor#234).
 */
function requestedDataset(body: unknown): string | null {
  const b = (body ?? {}) as { dataset?: unknown; config?: { dataset?: unknown } };
  const dataset = b.dataset ?? b.config?.dataset;
  return typeof dataset === 'string' && DATASET_NAME.test(dataset) ? dataset : null;
}

function refuseDataset(req: Request, res: Response): void {
  sendProblem(res, req, {
    status: 400,
    code: 'INVALID_INPUT',
    detail: '`dataset` must be 1 to 40 letters, digits or hyphens',
  });
}

/**
 * POST /v1/triplydb/update-service
 * Sync a service of a dataset in the server's TriplyDB account so it includes
 * every graph. Requires lde-author; uses the server's token (ttl-editor#234).
 *
 * Request body: { "dataset": "PublishTest", "serviceName": "PublishTest", "graphName": "..." }
 * Response:     { "success": true, "message": "...", "graphCount": 3 }
 */
router.post(
  '/update-service',
  requireAuthor,
  requirePublishTarget,
  async (req: Request, res: Response) => {
    res.set('API-Version', packageJson.version);

    const dataset = requestedDataset(req.body);
    if (!dataset) {
      refuseDataset(req, res);
      return;
    }
    const { serviceName, graphName } = req.body as { serviceName?: unknown; graphName?: string };
    if (typeof serviceName !== 'string' || !DATASET_NAME.test(serviceName)) {
      sendProblem(res, req, {
        status: 400,
        code: 'INVALID_INPUT',
        detail: '`serviceName` must be 1 to 40 letters, digits or hyphens',
      });
      return;
    }

    try {
      logger.info('[TriplyDB Routes] Service update request received', {
        dataset,
        serviceName,
        graphName: graphName || '(not specified)',
      });
      const result = await triplydbService.updateService(
        triplydbService.serverConfig(dataset),
        serviceName,
        undefined,
        graphName
      );
      res.status(200).json(result);
    } catch (error) {
      logger.error('[TriplyDB Routes] Service update failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      sendProblem(res, req, {
        status: 500,
        title: 'TriplyDB request failed',
        detail: error instanceof Error ? error.message : 'Service update failed',
      });
    }
  }
);

/**
 * POST /v1/triplydb/list-graphs
 * List the graphs of a dataset in the server's TriplyDB account.
 * Requires lde-author; uses the server's token (ttl-editor#234).
 *
 * Request body: { "dataset": "PublishTest" }
 * Response:     { "success": true, "graphs": ["..."], "count": 3 }
 */
router.post(
  '/list-graphs',
  requireAuthor,
  requirePublishTarget,
  async (req: Request, res: Response) => {
    res.set('API-Version', packageJson.version);

    const dataset = requestedDataset(req.body);
    if (!dataset) {
      refuseDataset(req, res);
      return;
    }

    try {
      const graphNames = await triplydbService.listGraphs(triplydbService.serverConfig(dataset));
      res.status(200).json({ success: true, graphs: graphNames, count: graphNames.length });
    } catch (error) {
      logger.error('[TriplyDB Routes] List graphs failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      sendProblem(res, req, {
        status: 500,
        title: 'TriplyDB request failed',
        detail: error instanceof Error ? error.message : 'Failed to list graphs',
      });
    }
  }
);

/**
 * POST /v1/triplydb/test-connection
 * Check that a dataset exists in the server's TriplyDB account, as the Publish
 * dialog's "Test connection" does. Requires lde-author (ttl-editor#234).
 *
 * Request body: { "dataset": "PublishTest" }
 * Response:     { "success": true, "message": "Connection successful", "status": 200 }
 */
router.post(
  '/test-connection',
  requireAuthor,
  requirePublishTarget,
  async (req: Request, res: Response) => {
    res.set('API-Version', packageJson.version);

    const dataset = requestedDataset(req.body);
    if (!dataset) {
      refuseDataset(req, res);
      return;
    }

    try {
      const status = await triplydbService.testConnection(triplydbService.serverConfig(dataset));
      if (status === 404) {
        sendProblem(res, req, {
          status: 404,
          title: 'Dataset not found',
          detail: `Dataset ${dataset} was not found in the publishing account`,
        });
        return;
      }
      // Anything else that is not a success is TriplyDB's problem or the
      // server's token, not the author's dataset name.
      if (status < 200 || status >= 300) {
        sendProblem(res, req, {
          status: 502,
          title: 'TriplyDB request failed',
          detail: `TriplyDB answered HTTP ${status}`,
        });
        return;
      }
      res.status(200).json({ success: true, message: 'Connection successful', status: 200 });
    } catch (error) {
      logger.error('[TriplyDB Routes] Connection test error', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      sendProblem(res, req, {
        status: 500,
        title: 'TriplyDB request failed',
        detail: error instanceof Error ? error.message : 'Connection test failed',
      });
    }
  }
);

// ADD TO: packages/backend/src/routes/triplydb.routes.ts
// Add these endpoints after the existing /test-connection endpoint

/**
 * GET /v1/triplydb/assets
 * List all assets in a TriplyDB dataset
 *
 * Compliance notes:
 * - API-05: Uses noun "assets" for resource name
 * - API-57: Returns API-Version header
 * - API-20: GET used for read operations
 *
 * Purpose: Retrieves list of all assets in a dataset for logo resolution.
 * Proxied through backend to avoid CORS issues and handle authentication.
 *
 * Query params:
 * - account: TriplyDB account name
 * - dataset: TriplyDB dataset name
 *
 * A private dataset's token is forwarded from the caller's own
 * `Authorization: Bearer` header, not taken from the query string (#142).
 *
 * Response:
 * {
 *   "success": true,
 *   "assets": [
 *     {
 *       "id": "6971d972d24ef89d5d015ef7",
 *       "name": "Sociale_Verzekeringsbank_logo.png",
 *       "url": "https://open-regels.triply.cc/stevengort/facts/assets/6971d972d24ef89d5d015ef7",
 *       "size": 65536,
 *       "contentType": "image/png"
 *     }
 *   ],
 *   "count": 1
 * }
 */
router.get('/assets', async (req: Request, res: Response) => {
  res.set('API-Version', packageJson.version);
  res.set('Content-Type', 'application/json');

  try {
    const { account, dataset } = req.query;

    if (!account || !dataset) {
      logger.warn('[TriplyDB Routes] Invalid assets request: missing account or dataset');
      sendProblem(res, req, {
        status: 400,
        title: 'Invalid request',
        detail: 'Missing required parameters: account and dataset',
      });
      return;
    }

    logger.info('[TriplyDB Routes] Assets list request', {
      account: account as string,
      dataset: dataset as string,
    });

    const baseUrl = 'https://api.open-regels.triply.cc';
    const url = `${baseUrl}/datasets/${encodeURIComponent(String(account))}/${encodeURIComponent(String(dataset))}/assets`;

    const headers: Record<string, string> = {
      Accept: 'application/json',
    };

    const authorization = req.get('authorization');
    if (authorization?.startsWith('Bearer ')) {
      headers.Authorization = authorization;
    }

    const startTime = Date.now();
    const response = await fetch(url, { headers });
    const duration = Date.now() - startTime;

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('[TriplyDB Routes] Assets list failed', {
        status: response.status,
        error: errorText,
      });
      sendProblem(res, req, {
        status: response.status,
        title: 'TriplyDB request failed',
        detail: `Failed to list assets: ${response.statusText}`,
      });
      return;
    }

    const assets = (await response.json()) as Array<{
      identifier: string;
      assetName: string;
      createdAt: string;
      versions: Array<{
        id: string;
        fileSize: number;
        url: string;
      }>;
    }>;

    // Enrich with full URLs and normalize field names
    const enrichedAssets = assets.map((asset) => ({
      id: asset.identifier,
      name: asset.assetName,
      // Use the actual URL from TriplyDB's version endpoint
      url:
        asset.versions[0]?.url ||
        `https://open-regels.triply.cc/${account}/${dataset}/assets/${asset.identifier}`,
      size: asset.versions[0]?.fileSize || 0,
      contentType: 'image/png', // TriplyDB doesn't provide this, assume PNG
    }));

    logger.info('[TriplyDB Routes] Assets listed successfully', {
      count: enrichedAssets.length,
      duration: `${duration}ms`,
    });

    res.status(200).json({
      success: true,
      assets: enrichedAssets,
      count: enrichedAssets.length,
    });
  } catch (error) {
    logger.error('[TriplyDB Routes] Assets list error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    sendProblem(res, req, {
      status: 500,
      title: 'TriplyDB request failed',
      detail: error instanceof Error ? error.message : 'Failed to list assets',
    });
  }
});

/**
 * GET /v1/triplydb/health
 * Health check endpoint for TriplyDB proxy service
 *
 * Compliance notes:
 * - API-05: Uses noun "health" for resource name
 * - API-54: Singular resource (standalone, not in collection)
 * - API-57: Returns API-Version header
 * - API-04: English is acceptable for technical/monitoring endpoints
 *
 * Returns service status and version information
 */
router.get('/health', (_req: Request, res: Response) => {
  // Set API-Version header (API-57 requirement)
  res.set('API-Version', packageJson.version);
  res.set('Content-Type', 'application/json');

  const healthCheck = {
    status: 'ok',
    service: 'triplydb-proxy',
    version: packageJson.version,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  };

  logger.debug('[TriplyDB Routes] Health check requested');

  res.status(200).json(healthCheck);
});

export default router;
