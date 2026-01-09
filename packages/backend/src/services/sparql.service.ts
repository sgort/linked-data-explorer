import axios, { AxiosInstance } from 'axios';
import { config } from '../utils/config';
import logger from '../utils/logger';
import { DmnModel, DmnVariable, ChainLink } from '../types/dmn.types';

/**
 * Service for querying TriplyDB via SPARQL
 */
export class SparqlService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: config.triplydb.endpoint,
      timeout: config.triplydb.timeout,
      headers: {
        Accept: 'application/sparql-results+json',
      },
    });
  }

  /**
   * Execute a SPARQL query
   */
  private async executeQuery(query: string): Promise<any> {
    try {
      logger.debug('Executing SPARQL query', { query });

      const response = await this.client.post('', query, {
        headers: { 'Content-Type': 'application/sparql-query' },
      });

      return response.data;
    } catch (error: any) {
      logger.error('SPARQL query failed', { error: error.message });
      throw new Error(`SPARQL query failed: ${error.message}`);
    }
  }

  /**
   * Get all DMN models
   */
  async getAllDmns(): Promise<DmnModel[]> {
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

    // Get unique DMNs
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
          testStatus: binding.testStatus?.value as 'passed' | 'failed' | 'pending',
          inputs: [],
          outputs: [],
        });
      }
    }

    // Now get inputs and outputs for each DMN
    const dmns = Array.from(dmnMap.values());
    for (const dmn of dmns) {
      dmn.inputs = await this.getDmnInputs(dmn.id);
      dmn.outputs = await this.getDmnOutputs(dmn.id);
    }

    return dmns;
  }

  /**
   * Get input variables for a DMN
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

    return bindings.map((b: any) => ({
      identifier: b.identifier.value,
      title: b.title.value,
      type: b.type.value,
      description: b.description?.value,
    }));
  }

  /**
   * Get output variables for a DMN
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

    return bindings.map((b: any) => ({
      identifier: b.identifier.value,
      title: b.title.value,
      type: b.type.value,
      description: b.description?.value,
    }));
  }

  /**
   * Find chain links between DMNs
   * A link exists when DMN1 outputs a variable that DMN2 requires as input
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

    return bindings.map((b: any) => ({
      from: b.dmn1Identifier.value,
      to: b.dmn2Identifier.value,
      variable: b.variableId.value,
      variableType: b.variableType.value,
    }));
  }

  /**
   * Get a specific DMN by identifier
   */
  async getDmnByIdentifier(identifier: string): Promise<DmnModel | null> {
    const dmns = await this.getAllDmns();
    return dmns.find((d) => d.identifier === identifier) || null;
  }

  /**
   * Health check - verify TriplyDB is accessible
   */
  async healthCheck(): Promise<{ status: 'up' | 'down'; latency?: number; error?: string }> {
    try {
      const startTime = Date.now();
      await this.executeQuery('SELECT ?s ?p ?o WHERE { ?s ?p ?o } LIMIT 1');
      const latency = Date.now() - startTime;

      return { status: 'up', latency };
    } catch (error: any) {
      return {
        status: 'down',
        error: error.message,
      };
    }
  }
}

export const sparqlService = new SparqlService();
export default sparqlService;
