// packages/backend/src/routes/triplydb.routes.ts
// Dutch Government API Design Rules Compliant Implementation

import { Router, Request, Response } from 'express';
import * as triplydbService from '../services/triplydb.service';
import { logger } from '../utils/logger';

const router = Router();

// Get package.json for version info
import packageJson from '../../package.json';

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

      return res.status(400).json({
        success: false,
        error: 'Missing required fields: endpoint and query',
        status: 400,
      });
    }

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

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Query execution failed',
      status: 500,
    });
  }
});

/**
 * POST /v1/triplydb/update-service
 * Update a TriplyDB service to include all graphs in the dataset
 *
 * Compliance notes:
 * - API-05: Uses noun "triplydb" for resource name
 * - API-57: Returns API-Version header with full semantic version
 * - API-04: English is acceptable for technical/integration endpoints
 * - API-48: POST used for actions that modify state
 *
 * Purpose: Proxies TriplyDB service update requests to avoid CORS issues
 * in browser-based applications. After publishing new data to TriplyDB,
 * this endpoint updates the service configuration to include all graphs,
 * enabling cumulative data access.
 *
 * Request body:
 * {
 *   "config": {
 *     "baseUrl": "https://api.open-regels.triply.cc",
 *     "account": "stevengort",
 *     "dataset": "PublishTest",
 *     "apiToken": "your-token"
 *   },
 *   "serviceName": "PublishTest"
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "message": "Service PublishTest updated to include 3 graphs",
 *   "graphCount": 3
 * }
 */
router.post('/update-service', async (req: Request, res: Response) => {
  // Set API-Version header (API-57 requirement)
  res.set('API-Version', packageJson.version);
  res.set('Content-Type', 'application/json');

  try {
    const { config, serviceName } = req.body;

    // Validate request
    if (!config || !serviceName) {
      logger.warn('[TriplyDB Routes] Invalid request: missing config or serviceName', {
        hasConfig: !!config,
        hasServiceName: !!serviceName,
      });

      return res.status(400).json({
        success: false,
        error: 'Missing required fields: config and serviceName',
        status: 400,
      });
    }

    if (!config.baseUrl || !config.account || !config.dataset || !config.apiToken) {
      logger.warn('[TriplyDB Routes] Invalid config: missing required fields', {
        hasBaseUrl: !!config.baseUrl,
        hasAccount: !!config.account,
        hasDataset: !!config.dataset,
        hasApiToken: !!config.apiToken,
      });

      return res.status(400).json({
        success: false,
        error: 'Invalid config: missing baseUrl, account, dataset, or apiToken',
        status: 400,
      });
    }

    logger.info('[TriplyDB Routes] Service update request received', {
      account: config.account,
      dataset: config.dataset,
      serviceName: serviceName,
    });

    // Call service to update
    const startTime = Date.now();
    const result = await triplydbService.updateService(config, serviceName);
    const duration = Date.now() - startTime;

    logger.info('[TriplyDB Routes] Service update successful', {
      serviceName: serviceName,
      graphCount: result.graphCount,
      duration: `${duration}ms`,
    });

    // FIXED: Don't duplicate 'success' - result already contains it
    res.status(200).json(result);
  } catch (error) {
    logger.error('[TriplyDB Routes] Service update failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Service update failed',
      status: 500,
    });
  }
});

/**
 * POST /v1/triplydb/list-graphs
 * List all graphs in a TriplyDB dataset
 *
 * Compliance notes:
 * - API-05: Uses noun "graphs" for resource name
 * - API-57: Returns API-Version header
 * - API-48: POST used to avoid exposing credentials in URL
 *
 * Purpose: Retrieves list of all graphs in a dataset for service configuration.
 * Proxied through backend to avoid CORS issues and secure credential handling.
 *
 * Request body:
 * {
 *   "config": {
 *     "baseUrl": "https://api.open-regels.triply.cc",
 *     "account": "stevengort",
 *     "dataset": "PublishTest",
 *     "apiToken": "your-token"
 *   }
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "graphs": ["graph:default", "graph:default-1", "graph:default-2"],
 *   "count": 3
 * }
 */
router.post('/list-graphs', async (req: Request, res: Response) => {
  // Set API-Version header (API-57 requirement)
  res.set('API-Version', packageJson.version);
  res.set('Content-Type', 'application/json');

  try {
    const { config } = req.body;

    // Validate request
    if (!config || !config.baseUrl || !config.account || !config.dataset || !config.apiToken) {
      logger.warn('[TriplyDB Routes] Invalid list-graphs request: missing config');

      return res.status(400).json({
        success: false,
        error: 'Invalid or missing config',
        status: 400,
      });
    }

    logger.info('[TriplyDB Routes] List graphs request received', {
      account: config.account,
      dataset: config.dataset,
    });

    const startTime = Date.now();
    const graphNames = await triplydbService.listGraphs(config);
    const duration = Date.now() - startTime;

    logger.info('[TriplyDB Routes] Graphs listed successfully', {
      count: graphNames.length,
      duration: `${duration}ms`,
    });

    res.status(200).json({
      success: true,
      graphs: graphNames,
      count: graphNames.length,
    });
  } catch (error) {
    logger.error('[TriplyDB Routes] List graphs failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to list graphs',
      status: 500,
    });
  }
});

/**
 * POST /v1/triplydb/test-connection
 * Test TriplyDB connection
 *
 * Compliance notes:
 * - API-05: Uses noun for resource
 * - API-57: Returns API-Version header
 * - API-48: POST used to avoid exposing credentials
 *
 * Purpose: Validates TriplyDB credentials and connectivity before attempting
 * data operations. Used for connection testing in CPSV Editor configuration.
 *
 * Request body:
 * {
 *   "config": {
 *     "baseUrl": "https://api.open-regels.triply.cc",
 *     "account": "stevengort",
 *     "dataset": "PublishTest",
 *     "apiToken": "your-token"
 *   }
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "message": "Connection successful"
 * }
 */
router.post('/test-connection', async (req: Request, res: Response) => {
  // Set API-Version header (API-57 requirement)
  res.set('API-Version', packageJson.version);
  res.set('Content-Type', 'application/json');

  try {
    const { config } = req.body;

    if (!config) {
      logger.warn('[TriplyDB Routes] Test connection request missing config');

      return res.status(400).json({
        success: false,
        error: 'Missing config',
        status: 400,
      });
    }

    logger.info('[TriplyDB Routes] Connection test requested');

    const startTime = Date.now();
    const isConnected = await triplydbService.testConnection(config);
    const duration = Date.now() - startTime;

    logger.info('[TriplyDB Routes] Connection test completed', {
      success: isConnected,
      duration: `${duration}ms`,
    });

    const statusCode = isConnected ? 200 : 503;

    res.status(statusCode).json({
      success: isConnected,
      message: isConnected ? 'Connection successful' : 'Connection failed',
      status: statusCode,
    });
  } catch (error) {
    logger.error('[TriplyDB Routes] Connection test error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Connection test failed',
      status: 500,
    });
  }
});

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
 * - apiToken: TriplyDB API token (optional, for private datasets)
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
    const { account, dataset, apiToken } = req.query;

    if (!account || !dataset) {
      logger.warn('[TriplyDB Routes] Invalid assets request: missing account or dataset');
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: account and dataset',
        status: 400,
      });
    }

    logger.info('[TriplyDB Routes] Assets list request', {
      account: account as string,
      dataset: dataset as string,
    });

    const baseUrl = 'https://api.open-regels.triply.cc';
    const url = `${baseUrl}/datasets/${account}/${dataset}/assets`;

    const headers: Record<string, string> = {
      Accept: 'application/json',
    };

    if (apiToken) {
      headers.Authorization = `Bearer ${apiToken}`;
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
      return res.status(response.status).json({
        success: false,
        error: `Failed to list assets: ${response.statusText}`,
        status: response.status,
      });
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

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to list assets',
      status: 500,
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
