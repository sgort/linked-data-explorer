// packages/backend/src/services/triplydb.service.ts
// Service for proxying TriplyDB API calls to avoid CORS issues
// Uses native fetch (Node.js 18+) with proper TypeScript typing
// FIXED: Uses correct sync API from TriplyDB documentation

import { logger } from '../utils/logger';

interface TriplyDBConfig {
  baseUrl: string;
  account: string;
  dataset: string;
  apiToken: string;
}

interface Graph {
  name: string;
  graphName?: string;
}

interface SparqlBinding {
  value: string;
  type?: string;
  datatype?: string;
  'xml:lang'?: string;
}

interface SparqlQueryResult {
  results?: {
    bindings?: Record<string, SparqlBinding>[];
  };
}

/**
 * Execute a SPARQL query against any TriplyDB endpoint
 * Used by the /v1/triplydb/query endpoint to enable dynamic endpoint selection
 */
export async function executeQuery(endpoint: string, query: string): Promise<SparqlQueryResult> {
  logger.info('[TriplyDB Service] Executing SPARQL query', {
    endpoint: endpoint,
    queryLength: query.length,
  });

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/sparql-query',
        Accept: 'application/sparql-results+json',
      },
      body: query,
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('[TriplyDB Service] Query execution failed', {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
      });
      throw new Error(`Query failed: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as SparqlQueryResult;

    logger.info('[TriplyDB Service] Query executed successfully', {
      resultCount: data.results?.bindings?.length || 0,
    });

    return data;
  } catch (error) {
    logger.error('[TriplyDB Service] Error executing query', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw new Error(`Failed to execute query: ${(error as Error).message}`);
  }
}

/**
 * Execute a SPARQL CONSTRUCT/DESCRIBE query against any SPARQL endpoint and return
 * the resulting graph serialised as Turtle.
 *
 * Sibling to executeQuery(): that helper negotiates SPARQL-results JSON for
 * SELECT/ASK; this one negotiates `text/turtle` for graph-returning queries so the
 * caller can parse the closure with an RDF parser (n3). Used by the SHACL
 * validator's merge-simulated mode to union already-published triples with an
 * uploaded file before validation. Standard SPARQL 1.1 only — no TriplyDB-specific
 * extensions — so it keeps working against any compliant endpoint.
 */
export async function constructGraph(endpoint: string, query: string): Promise<string> {
  logger.info('[TriplyDB Service] Executing SPARQL CONSTRUCT', {
    endpoint: endpoint,
    queryLength: query.length,
  });

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/sparql-query',
        Accept: 'text/turtle',
      },
      body: query,
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('[TriplyDB Service] CONSTRUCT execution failed', {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
      });
      throw new Error(`CONSTRUCT failed: ${response.status} ${errorText}`);
    }

    const turtle = await response.text();

    logger.info('[TriplyDB Service] CONSTRUCT executed successfully', {
      bytes: turtle.length,
    });

    return turtle;
  } catch (error) {
    logger.error('[TriplyDB Service] Error executing CONSTRUCT', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw new Error(`Failed to execute CONSTRUCT: ${(error as Error).message}`);
  }
}

/**
 * List all graphs in a TriplyDB dataset
 */
export async function listGraphs(config: TriplyDBConfig): Promise<string[]> {
  const graphsUrl = `${config.baseUrl}/datasets/${config.account}/${config.dataset}/graphs`;

  logger.info('[TriplyDB Service] Fetching graphs', {
    url: graphsUrl,
    account: config.account,
    dataset: config.dataset,
  });

  try {
    const response = await fetch(graphsUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${config.apiToken}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('[TriplyDB Service] Failed to fetch graphs', {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
      });
      throw new Error(`Failed to fetch graphs: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as { graphs?: Graph[] } | Graph[];

    // Extract graph names
    const graphs = Array.isArray(data) ? data : data.graphs || [];
    const graphNames = graphs.map((g: Graph) => g.graphName || g.name || String(g));

    logger.info('[TriplyDB Service] Graphs retrieved successfully', {
      count: graphNames.length,
      graphs: graphNames,
    });

    return graphNames;
  } catch (error) {
    logger.error('[TriplyDB Service] Error listing graphs', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw new Error(`Failed to list graphs: ${(error as Error).message}`);
  }
}

/**
 * Update a TriplyDB service to include all graphs
 * Uses the correct sync API from TriplyDB documentation:
 * POST /datasets/{account}/{dataset}/services/{serviceName}
 * Body: {"sync": "true"}
 *
 * @param config       - TriplyDB configuration
 * @param serviceName  - Name of the service to sync
 * @param graphNames   - Optional pre-fetched graph list (used only for the response count)
 * @param graphName    - Optional graph IRI that triggered this sync (for traceability)
 */
export async function updateService(
  config: TriplyDBConfig,
  serviceName: string,
  graphNames?: string[],
  graphName?: string
): Promise<{
  success: boolean;
  message: string;
  graphCount: number;
  graphName?: string;
}> {
  logger.info('[TriplyDB Service] Synchronizing service', {
    serviceName: serviceName,
    account: config.account,
    dataset: config.dataset,
    triggeredByGraph: graphName || '(not specified)',
  });

  // Fetch all graphs to get count (for response message)
  if (!graphNames || graphNames.length === 0) {
    logger.debug('[TriplyDB Service] Fetching all graphs for count');
    graphNames = await listGraphs(config);
  }

  // Correct endpoint from documentation:
  // POST /datasets/{account}/{dataset}/services/{serviceName}
  // Body: {"sync": "true"}
  const serviceUrl = `${config.baseUrl}/datasets/${config.account}/${config.dataset}/services/${serviceName}`;

  logger.debug('[TriplyDB Service] Triggering service synchronization', {
    serviceUrl: serviceUrl,
    graphCount: graphNames.length,
  });

  try {
    // TriplyDB's service synchronisation API requires the literal string "true" (not the
    // boolean true) as the value for the "sync" key. This matches the documented request
    // body exactly — using a boolean would be silently ignored by the API.
    const syncResponse = await fetch(serviceUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sync: 'true' }),
    });

    logger.debug('[TriplyDB Service] Sync response received', {
      status: syncResponse.status,
      ok: syncResponse.ok,
    });

    // Get response text (may be empty for success)
    const responseText = await syncResponse.text();

    let responseData: { message?: string; error?: string } = {};
    if (responseText) {
      try {
        responseData = JSON.parse(responseText);
      } catch {
        // Failed to parse JSON, treat as plain text
        responseData = { message: responseText };
      }
    }

    if (!syncResponse.ok) {
      const errorMessage =
        responseData.message || responseData.error || responseText || `HTTP ${syncResponse.status}`;

      logger.error('[TriplyDB Service] Service sync failed', {
        serviceName: serviceName,
        status: syncResponse.status,
        error: errorMessage,
      });

      throw new Error(`Failed to sync service: ${syncResponse.status} ${errorMessage}`);
    }

    logger.info('[TriplyDB Service] Service synchronized successfully', {
      serviceName: serviceName,
      graphCount: graphNames.length,
      triggeredByGraph: graphName || '(not specified)',
    });

    return {
      success: true,
      message: `Service ${serviceName} updated to include ${graphNames.length} graphs`,
      graphCount: graphNames.length,
      ...(graphName ? { graphName } : {}),
    };
  } catch (error) {
    logger.error('[TriplyDB Service] Error synchronizing service', {
      serviceName: serviceName,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw new Error(`Failed to update service: ${(error as Error).message}`);
  }
}

/**
 * Test TriplyDB connection
 */
export async function testConnection(config: TriplyDBConfig): Promise<boolean> {
  const testUrl = `${config.baseUrl}/datasets/${config.account}/${config.dataset}`;

  logger.info('[TriplyDB Service] Testing connection', {
    url: testUrl,
    account: config.account,
    dataset: config.dataset,
  });

  try {
    const response = await fetch(testUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${config.apiToken}`,
        Accept: 'application/json',
      },
    });

    const success = response.ok;

    logger.info('[TriplyDB Service] Connection test completed', {
      success: success,
      status: response.status,
    });

    return success;
  } catch (error) {
    logger.error('[TriplyDB Service] Connection test failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return false;
  }
}
