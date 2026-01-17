// packages/backend/src/services/sparql.service.ts
// UPDATED: Added endpoint parameter support with per-endpoint caching

import axios, { AxiosInstance } from 'axios';
import { config } from '../utils/config';
import logger from '../utils/logger';
import { DmnModel, DmnVariable, ChainLink } from '../types/dmn.types';
import { getErrorMessage, getErrorDetails } from '../utils/errors';

/**
 * Type for SPARQL query result bindings
 */
interface SparqlBinding {
  value: string;
  type?: string;
  datatype?: string;
  'xml:lang'?: string;
}

/**
 * Type for a single SPARQL result row
 */
type SparqlResultRow = Record<string, SparqlBinding>;

/**
 * Type for complete SPARQL query results
 */
interface SparqlQueryResult {
  results?: {
    bindings?: SparqlResultRow[];
  };
}

/**
 * Cache entry for DMN list
 */
interface CacheEntry {
  data: DmnModel[];
  timestamp: number;
}

/**
 * Service for querying TriplyDB via SPARQL
 * Provides methods to discover DMN models and their relationships
 *
 * UPDATED: Now supports multiple endpoints with separate caches per endpoint
 */
export class SparqlService {
  private client: AxiosInstance;

  // NEW: Cache per endpoint (Map of endpoint URL -> cache entry)
  private dmnCacheMap: Map<string, CacheEntry> = new Map();

  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor() {
    // Default client (for backward compatibility)
    this.client = axios.create({
      baseURL: config.triplydb.endpoint,
      timeout: config.triplydb.timeout,
      headers: {
        Accept: 'application/sparql-results+json',
      },
    });

    logger.info('SPARQL Service initialized', {
      endpoint: config.triplydb.endpoint,
      timeout: config.triplydb.timeout,
    });
  }

  /**
   * Execute a SPARQL query against TriplyDB
   * NEW: Accepts optional endpoint parameter
   *
   * @param query - SPARQL query string
   * @param endpoint - Optional SPARQL endpoint URL (defaults to config endpoint)
   * @returns Query results
   * @throws Error if query fails
   */
  private async executeQuery(query: string, endpoint?: string): Promise<SparqlQueryResult> {
    try {
      const targetEndpoint = endpoint || config.triplydb.endpoint;

      logger.debug('Executing SPARQL query', {
        endpoint: targetEndpoint,
        queryLength: query.length,
      });

      // Create ad-hoc client for custom endpoint, or use default
      const client = endpoint
        ? axios.create({
            baseURL: endpoint,
            timeout: config.triplydb.timeout,
            headers: {
              Accept: 'application/sparql-results+json',
            },
          })
        : this.client;

      const response = await client.post('', query, {
        headers: { 'Content-Type': 'application/sparql-query' },
      });

      return response.data as SparqlQueryResult;
    } catch (error: unknown) {
      logger.error('SPARQL query failed', getErrorDetails(error));
      throw new Error(`SPARQL query failed: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Get all DMN models from TriplyDB
   * Uses 5-minute cache to avoid repeated queries (separate cache per endpoint)
   * NEW: Accepts optional endpoint parameter
   *
   * @param endpoint - Optional SPARQL endpoint URL (defaults to config endpoint)
   * @returns Array of DMN models with inputs and outputs
   */
  async getAllDmns(endpoint?: string): Promise<DmnModel[]> {
    const now = Date.now();
    const targetEndpoint = endpoint || config.triplydb.endpoint;

    // Check cache for this specific endpoint
    const cached = this.dmnCacheMap.get(targetEndpoint);
    if (cached && now - cached.timestamp < this.CACHE_TTL) {
      const age = Math.round((now - cached.timestamp) / 1000);
      logger.info('Using cached DMN list', {
        endpoint: targetEndpoint,
        count: cached.data.length,
        age: age + 's',
      });
      return cached.data;
    }

    // Fetch fresh data
    logger.info('Fetching fresh DMN list from TriplyDB', {
      endpoint: targetEndpoint,
      reason: cached ? 'cache expired' : 'cache empty',
    });

    const query = `
PREFIX cprmv: <https://cprmv.open-regels.nl/0.3.0/>
PREFIX cpsv: <http://purl.org/vocab/cpsv#>
PREFIX dct: <http://purl.org/dc/terms/>
PREFIX ronl: <https://regels.overheid.nl/termen/>

SELECT ?dmn ?identifier ?title ?description ?deploymentId ?deployedAt ?implementedBy ?lastTested ?testStatus
WHERE {
  ?dmn a cprmv:DecisionModel ;
       dct:identifier ?identifier ;
       dct:title ?title .
  
  OPTIONAL { ?dmn dct:description ?description }
  OPTIONAL { ?dmn cprmv:deploymentId ?deploymentId }
  OPTIONAL { ?dmn cprmv:deployedAt ?deployedAt }
  OPTIONAL { ?dmn ronl:implementedBy ?implementedBy }
  OPTIONAL { ?dmn cprmv:lastTested ?lastTested }
  OPTIONAL { ?dmn cprmv:testStatus ?testStatus }
}
ORDER BY ?identifier
    `;

    const data = await this.executeQuery(query, endpoint);
    const bindings = data.results?.bindings || [];

    logger.info(`Found ${bindings.length} DMN records`);

    // Group by DMN URI to handle duplicates
    const dmnMap = new Map<string, DmnModel>();

    for (const binding of bindings) {
      const id = binding.dmn.value;
      if (!dmnMap.has(id)) {
        dmnMap.set(id, {
          id,
          identifier: binding.identifier.value,
          title: binding.title.value,
          description: binding.description?.value,
          deploymentId: binding.deploymentId?.value,
          deployedAt: binding.deployedAt?.value,
          implementedBy: binding.implementedBy?.value,
          lastTested: binding.lastTested?.value,
          testStatus: binding.testStatus?.value as 'passed' | 'failed' | 'pending' | undefined,
          inputs: [],
          outputs: [],
        });
      }
    }

    // Get unique DMNs and enrich with inputs/outputs
    const dmns = Array.from(dmnMap.values());
    logger.info(`Processing ${dmns.length} unique DMNs`);

    for (const dmn of dmns) {
      dmn.inputs = await this.getDmnInputs(dmn.id, endpoint);
      dmn.outputs = await this.getDmnOutputs(dmn.id, endpoint);
      logger.debug(
        `DMN ${dmn.identifier}: ${dmn.inputs.length} inputs, ${dmn.outputs.length} outputs`
      );
    }

    // Update cache for this endpoint
    this.dmnCacheMap.set(targetEndpoint, {
      data: dmns,
      timestamp: now,
    });

    logger.info(`Cached ${dmns.length} DMNs for 5 minutes`, {
      endpoint: targetEndpoint,
    });

    return dmns;
  }

  /**
   * Get input variables for a specific DMN
   * NEW: Accepts optional endpoint parameter
   *
   * @param dmnId - URI of the DMN model
   * @param endpoint - Optional SPARQL endpoint URL
   * @returns Array of input variables
   */
  private async getDmnInputs(dmnId: string, endpoint?: string): Promise<DmnVariable[]> {
    const query = `
PREFIX cpsv: <http://purl.org/vocab/cpsv#>
PREFIX dct: <http://purl.org/dc/terms/>
PREFIX schema: <http://schema.org/>

SELECT ?identifier ?title ?type ?description
WHERE {
  ?input cpsv:isRequiredBy <${dmnId}> ;
         dct:identifier ?identifier ;
         dct:title ?title ;
         dct:type ?type .
  
  OPTIONAL { ?input dct:description ?description }
}
ORDER BY ?identifier
    `;

    const data = await this.executeQuery(query, endpoint);
    const bindings = data.results?.bindings || [];

    return bindings.map((b: SparqlResultRow) => ({
      identifier: b.identifier.value,
      title: b.title.value,
      type: b.type.value as 'String' | 'Integer' | 'Boolean' | 'Date' | 'Double',
      description: b.description?.value,
    }));
  }

  /**
   * Get output variables for a specific DMN
   * NEW: Accepts optional endpoint parameter
   *
   * @param dmnId - URI of the DMN model
   * @param endpoint - Optional SPARQL endpoint URL
   * @returns Array of output variables
   */
  private async getDmnOutputs(dmnId: string, endpoint?: string): Promise<DmnVariable[]> {
    const query = `
PREFIX cpsv: <http://purl.org/vocab/cpsv#>
PREFIX dct: <http://purl.org/dc/terms/>

SELECT ?identifier ?title ?type ?description
WHERE {
  ?output cpsv:produces <${dmnId}> ;
          dct:identifier ?identifier ;
          dct:title ?title ;
          dct:type ?type .
  
  OPTIONAL { ?output dct:description ?description }
}
ORDER BY ?identifier
    `;

    const data = await this.executeQuery(query, endpoint);
    const bindings = data.results?.bindings || [];

    return bindings.map((b: SparqlResultRow) => ({
      identifier: b.identifier.value,
      title: b.title.value,
      type: b.type.value as 'String' | 'Integer' | 'Boolean' | 'Date' | 'Double',
      description: b.description?.value,
    }));
  }

  /**
   * Find chain links between DMNs (alias for backward compatibility)
   * Finds DMNs that can be chained based on matching output/input variables
   * NEW: Accepts optional endpoint parameter
   *
   * @param endpoint - Optional SPARQL endpoint URL
   * @returns Array of chain links
   */
  async findChainLinks(endpoint?: string): Promise<ChainLink[]> {
    logger.info('Discovering chain links', {
      ...(endpoint && { endpoint }),
    });

    const query = `
PREFIX cprmv: <https://cprmv.open-regels.nl/0.3.0/>
PREFIX cpsv: <http://purl.org/vocab/cpsv#>
PREFIX dct: <http://purl.org/dc/terms/>

SELECT ?dmn1Identifier ?dmn2Identifier ?variableId ?variableType
WHERE {
  # DMN 1 produces a variable
  ?dmn1 a cprmv:DecisionModel ;
        dct:identifier ?dmn1Identifier .
  ?output1 cpsv:produces ?dmn1 ;
           dct:identifier ?variableId ;
           dct:type ?variableType .
  
  # DMN 2 requires the same variable
  ?dmn2 a cprmv:DecisionModel ;
        dct:identifier ?dmn2Identifier .
  ?input2 cpsv:isRequiredBy ?dmn2 ;
          dct:identifier ?variableId .
  
  # Ensure they're different DMNs
  FILTER(?dmn1 != ?dmn2)
}
ORDER BY ?dmn1Identifier ?dmn2Identifier ?variableId
    `;

    const data = await this.executeQuery(query, endpoint);
    const bindings = data.results?.bindings || [];

    logger.info(`Found ${bindings.length} chain links`);

    return bindings.map((b: SparqlResultRow) => ({
      from: b.dmn1Identifier.value,
      to: b.dmn2Identifier.value,
      variable: b.variableId.value,
      variableType: b.variableType.value,
    }));
  }

  /**
   * Get a specific DMN by its identifier
   * NEW: Accepts optional endpoint parameter
   *
   * @param identifier - DMN identifier (e.g., "SVB_LeeftijdsInformatie")
   * @param endpoint - Optional SPARQL endpoint URL
   * @returns DMN model or null if not found
   */
  async getDmnByIdentifier(identifier: string, endpoint?: string): Promise<DmnModel | null> {
    logger.debug(`Looking up DMN by identifier: ${identifier}`, {
      ...(endpoint && { endpoint }),
    });

    // Use cached list if available
    const dmns = await this.getAllDmns(endpoint);
    const dmn = dmns.find((d) => d.identifier === identifier) || null;

    if (!dmn) {
      logger.warn(`DMN not found: ${identifier}`);
    }

    return dmn;
  }

  /**
   * Clear DMN list cache (useful for testing or when DMNs are updated)
   * NEW: Can clear all caches or specific endpoint cache
   *
   * @param endpoint - Optional endpoint to clear (if not provided, clears all)
   */
  clearCache(endpoint?: string): void {
    if (endpoint) {
      logger.info('Clearing DMN list cache for endpoint', { endpoint });
      this.dmnCacheMap.delete(endpoint);
    } else {
      logger.info('Clearing all DMN list caches');
      this.dmnCacheMap.clear();
    }
  }

  /**
   * Health check - verify TriplyDB is accessible
   * NEW: Accepts optional endpoint parameter
   *
   * @param endpoint - Optional SPARQL endpoint URL
   * @returns Health status with latency
   */
  async healthCheck(endpoint?: string): Promise<{
    status: 'up' | 'down';
    latency?: number;
    error?: string;
  }> {
    try {
      const startTime = Date.now();
      await this.executeQuery('SELECT ?s ?p ?o WHERE { ?s ?p ?o } LIMIT 1', endpoint);
      const latency = Date.now() - startTime;

      logger.debug('TriplyDB health check successful', {
        latency,
        ...(endpoint && { endpoint }),
      });

      return { status: 'up', latency };
    } catch (error: unknown) {
      logger.error('TriplyDB health check failed', getErrorDetails(error));

      return {
        status: 'down',
        error: getErrorMessage(error),
      };
    }
  }
}

// Export singleton instance
export const sparqlService = new SparqlService();
export default sparqlService;
