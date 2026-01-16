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
 * Service for querying TriplyDB via SPARQL
 * Provides methods to discover DMN models and their relationships
 */
export class SparqlService {
  private client: AxiosInstance;

  // Cache for full DMN list (to avoid repeated SPARQL queries)
  private dmnListCache: {
    data: DmnModel[] | null;
    timestamp: number;
  } = {
    data: null,
    timestamp: 0,
  };

  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor() {
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
   *
   * @param query - SPARQL query string
   * @returns Query results
   * @throws Error if query fails
   */
  private async executeQuery(query: string): Promise<SparqlQueryResult> {
    try {
      logger.debug('Executing SPARQL query', { query: query.substring(0, 200) });

      const response = await this.client.post('', query, {
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
   * Uses 5-minute cache to avoid repeated queries
   *
   * @returns Array of DMN models with inputs and outputs
   */
  async getAllDmns(): Promise<DmnModel[]> {
    const now = Date.now();

    // Return cached data if still valid
    if (this.dmnListCache.data && now - this.dmnListCache.timestamp < this.CACHE_TTL) {
      const age = Math.round((now - this.dmnListCache.timestamp) / 1000);
      logger.info('Using cached DMN list', {
        count: this.dmnListCache.data.length,
        age: age + 's',
      });
      return this.dmnListCache.data;
    }

    // Fetch fresh data
    logger.info('Fetching fresh DMN list from TriplyDB', {
      reason: this.dmnListCache.data ? 'cache expired' : 'cache empty',
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

    const data = await this.executeQuery(query);
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
      dmn.inputs = await this.getDmnInputs(dmn.id);
      dmn.outputs = await this.getDmnOutputs(dmn.id);
      logger.debug(
        `DMN ${dmn.identifier}: ${dmn.inputs.length} inputs, ${dmn.outputs.length} outputs`
      );
    }

    // Update cache
    this.dmnListCache = {
      data: dmns,
      timestamp: now,
    };

    logger.info(`Cached ${dmns.length} DMNs for 5 minutes`);

    return dmns;
  }

  /**
   * Get input variables for a specific DMN
   *
   * @param dmnId - URI of the DMN model
   * @returns Array of input variables
   */
  private async getDmnInputs(dmnId: string): Promise<DmnVariable[]> {
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

    const data = await this.executeQuery(query);
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
   *
   * @param dmnId - URI of the DMN model
   * @returns Array of output variables
   */
  private async getDmnOutputs(dmnId: string): Promise<DmnVariable[]> {
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

    const data = await this.executeQuery(query);
    const bindings = data.results?.bindings || [];

    return bindings.map((b: SparqlResultRow) => ({
      identifier: b.identifier.value,
      title: b.title.value,
      type: b.type.value as 'String' | 'Integer' | 'Boolean' | 'Date' | 'Double',
      description: b.description?.value,
    }));
  }

  /**
   * Find chain links between DMNs based on variable matching
   * A link exists when DMN1 outputs a variable that DMN2 requires as input
   *
   * @returns Array of chain links
   */
  async findChainLinks(): Promise<ChainLink[]> {
    const query = `
PREFIX cprmv: <https://cprmv.open-regels.nl/0.3.0/>
PREFIX cpsv: <http://purl.org/vocab/cpsv#>
PREFIX dct: <http://purl.org/dc/terms/>

SELECT DISTINCT ?dmn1 ?dmn1Identifier ?dmn2 ?dmn2Identifier ?variableId ?variableType
WHERE {
  # DMN 1 outputs a variable
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

    const data = await this.executeQuery(query);
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
   *
   * @param identifier - DMN identifier (e.g., "SVB_LeeftijdsInformatie")
   * @returns DMN model or null if not found
   */
  async getDmnByIdentifier(identifier: string): Promise<DmnModel | null> {
    logger.debug(`Looking up DMN by identifier: ${identifier}`);

    // Use cached list if available
    const dmns = await this.getAllDmns();
    const dmn = dmns.find((d) => d.identifier === identifier) || null;

    if (!dmn) {
      logger.warn(`DMN not found: ${identifier}`);
    }

    return dmn;
  }

  /**
   * Clear DMN list cache (useful for testing or when DMNs are updated)
   */
  clearCache(): void {
    logger.info('Clearing DMN list cache');
    this.dmnListCache = {
      data: null,
      timestamp: 0,
    };
  }

  /**
   * Health check - verify TriplyDB is accessible
   *
   * @returns Health status with latency
   */
  async healthCheck(): Promise<{ status: 'up' | 'down'; latency?: number; error?: string }> {
    try {
      const startTime = Date.now();
      await this.executeQuery('SELECT ?s ?p ?o WHERE { ?s ?p ?o } LIMIT 1');
      const latency = Date.now() - startTime;

      logger.debug('TriplyDB health check successful', { latency });

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
