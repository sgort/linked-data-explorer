// packages/backend/src/services/sparql.service.ts
// UPDATED: Added endpoint parameter support with per-endpoint caching

import axios, { AxiosInstance } from 'axios';
import { config } from '../utils/config';
import logger from '../utils/logger';
import {
  DmnModel,
  DmnVariable,
  ChainLink,
  EnhancedChainLink,
  SemanticEquivalence,
  ChainCycle,
} from '../types/dmn.types';
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
   * NEW: Accepts optional refresh parameter to bypass cache
   *
   * @param endpoint - Optional SPARQL endpoint URL (defaults to config endpoint)
   * @param refresh - If true, bypass cache and fetch fresh data
   * @returns Array of DMN models with inputs and outputs
   */
  async getAllDmns(endpoint?: string, refresh = false): Promise<DmnModel[]> {
    const now = Date.now();
    const targetEndpoint = endpoint || config.triplydb.endpoint;

    // If refresh requested, skip cache check
    if (refresh) {
      logger.info('Refresh requested, bypassing cache', { endpoint: targetEndpoint });
      // Continue to fetch fresh data...
    } else {
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
    }

    // Fetch fresh data
    logger.info('Fetching fresh DMN list from TriplyDB', {
      endpoint: targetEndpoint,
      reason: refresh
        ? 'refresh requested'
        : this.dmnCacheMap.get(targetEndpoint)
          ? 'cache expired'
          : 'cache empty',
    });

    const query = `
PREFIX cprmv: <https://cprmv.open-regels.nl/0.3.0/>
PREFIX cpsv: <http://purl.org/vocab/cpsv#>
PREFIX dct: <http://purl.org/dc/terms/>
PREFIX ronl: <https://regels.overheid.nl/termen/>
PREFIX cv: <http://data.europa.eu/m8g/>
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT ?dmn ?identifier ?title ?description ?deploymentId ?deployedAt 
       ?implementedBy ?lastTested ?testStatus 
       ?service ?serviceTitle ?organization ?orgName ?logo
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
  
  # NEW: Traverse DMN → Service → Organization → Logo
  OPTIONAL {
    ?dmn ronl:implements ?service .
    ?service dct:title ?serviceTitle .
    
    OPTIONAL {
      ?service cv:hasCompetentAuthority ?organization .
      ?organization skos:prefLabel ?orgName .
      
      OPTIONAL {
        ?organization foaf:logo ?logo
      }
    }
  }
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
        // Resolve logo URL if logo filename is present
        let logoUrl: string | undefined;
        if (binding.logo?.value && binding.organization?.value) {
          logoUrl = await this.resolveLogoUrl(
            binding.logo.value,
            binding.organization.value,
            endpoint
          );
        }

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
          service: binding.service?.value,
          serviceTitle: binding.serviceTitle?.value,
          organization: binding.organization?.value,
          organizationName: binding.orgName?.value,
          logoUrl, // NEW: Resolved logo URL
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
   * NEW: Fetches schema:value for test data
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

SELECT ?identifier ?title ?type ?description ?value
WHERE {
  ?input cpsv:isRequiredBy <${dmnId}> ;
         dct:identifier ?identifier ;
         dct:title ?title ;
         dct:type ?type .
  
  OPTIONAL { ?input dct:description ?description }
  OPTIONAL { ?input schema:value ?value }
}
ORDER BY ?identifier
  `;

    const data = await this.executeQuery(query, endpoint);
    const bindings = data.results?.bindings || [];

    return bindings.map((b: SparqlResultRow) => {
      const result: DmnVariable = {
        identifier: b.identifier.value,
        title: b.title.value,
        type: b.type.value as 'String' | 'Integer' | 'Boolean' | 'Date' | 'Double',
        description: b.description?.value,
      };

      // Add testValue if schema:value exists
      if (b.value) {
        const rawValue = b.value.value;
        // Convert to appropriate type based on DMN type
        if (result.type === 'Integer') {
          result.testValue = parseInt(rawValue, 10);
        } else if (result.type === 'Double') {
          result.testValue = parseFloat(rawValue);
        } else if (result.type === 'Boolean') {
          result.testValue = rawValue.toLowerCase() === 'true';
        } else {
          result.testValue = rawValue;
        }
      }

      return result;
    });
  }

  /**
   * Get output variables for a specific DMN
   * NEW: Accepts optional endpoint parameter
   * NEW: Fetches schema:value for test data
   *
   * @param dmnId - URI of the DMN model
   * @param endpoint - Optional SPARQL endpoint URL
   * @returns Array of output variables
   */
  private async getDmnOutputs(dmnId: string, endpoint?: string): Promise<DmnVariable[]> {
    const query = `
PREFIX cpsv: <http://purl.org/vocab/cpsv#>
PREFIX dct: <http://purl.org/dc/terms/>
PREFIX schema: <http://schema.org/>

SELECT ?identifier ?title ?type ?description ?value
WHERE {
  ?output cpsv:produces <${dmnId}> ;
          dct:identifier ?identifier ;
          dct:title ?title ;
          dct:type ?type .
  
  OPTIONAL { ?output dct:description ?description }
  OPTIONAL { ?output schema:value ?value }
}
ORDER BY ?identifier
  `;

    const data = await this.executeQuery(query, endpoint);
    const bindings = data.results?.bindings || [];

    return bindings.map((b: SparqlResultRow) => {
      const result: DmnVariable = {
        identifier: b.identifier.value,
        title: b.title.value,
        type: b.type.value as 'String' | 'Integer' | 'Boolean' | 'Date' | 'Double',
        description: b.description?.value,
      };

      // Add testValue if schema:value exists
      if (b.value) {
        const rawValue = b.value.value;
        // Convert to appropriate type based on DMN type
        if (result.type === 'Integer') {
          result.testValue = parseInt(rawValue, 10);
        } else if (result.type === 'Double') {
          result.testValue = parseFloat(rawValue);
        } else if (result.type === 'Boolean') {
          result.testValue = rawValue.toLowerCase() === 'true';
        } else {
          result.testValue = rawValue;
        }
      }

      return result;
    });
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
   * Find semantically equivalent variables across DMNs using skos:exactMatch
   * @param endpoint - Optional SPARQL endpoint URL
   * @returns Array of semantic equivalences
   */
  async findSemanticEquivalences(endpoint?: string): Promise<SemanticEquivalence[]> {
    logger.info('Finding semantic equivalences via skos:exactMatch');

    const query = `
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX dct: <http://purl.org/dc/terms/>
PREFIX cpsv: <http://purl.org/vocab/cpsv#>
PREFIX cprmv: <https://cprmv.open-regels.nl/0.3.0/>

SELECT ?concept1 ?concept1Label ?concept1Notation ?variable1 ?variable1Id ?variable1Type
       ?concept2 ?concept2Label ?concept2Notation ?variable2 ?variable2Id ?variable2Type
       ?sharedConcept ?dmn1 ?dmn1Title ?dmn2 ?dmn2Title
WHERE {
  # First concept with exactMatch
  ?concept1 a skos:Concept ;
            skos:exactMatch ?sharedConcept ;
            skos:prefLabel ?concept1Label ;
            dct:subject ?variable1 .
  
  OPTIONAL { ?concept1 skos:notation ?concept1Notation }
  
  ?variable1 dct:identifier ?variable1Id ;
             dct:type ?variable1Type .
  
  # Determine variable direction for concept1
  {
    ?variable1 a cpsv:Input ;
               cpsv:isRequiredBy ?dmn1 .
  } UNION {
    ?variable1 a cpsv:Output ;
               cpsv:produces ?dmn1 .
  }
  
  ?dmn1 a cprmv:DecisionModel ;
        dct:title ?dmn1Title .
  
  # Second concept with same exactMatch
  ?concept2 a skos:Concept ;
            skos:exactMatch ?sharedConcept ;
            skos:prefLabel ?concept2Label ;
            dct:subject ?variable2 .
  
  OPTIONAL { ?concept2 skos:notation ?concept2Notation }
  
  ?variable2 dct:identifier ?variable2Id ;
             dct:type ?variable2Type .
  
  # Determine variable direction for concept2
  {
    ?variable2 a cpsv:Input ;
               cpsv:isRequiredBy ?dmn2 .
  } UNION {
    ?variable2 a cpsv:Output ;
               cpsv:produces ?dmn2 .
  }
  
  ?dmn2 a cprmv:DecisionModel ;
        dct:title ?dmn2Title .
  
  # Ensure different concepts (but same sharedConcept URI)
  FILTER(?concept1 != ?concept2)
  FILTER(?dmn1 != ?dmn2)
  FILTER(LANG(?dmn1Title) = "nl" || LANG(?dmn1Title) = "")
  FILTER(LANG(?dmn2Title) = "nl" || LANG(?dmn2Title) = "")
}
ORDER BY ?sharedConcept ?dmn1Title ?dmn2Title
`;

    const data = await this.executeQuery(query, endpoint);
    const bindings = data.results?.bindings || [];

    const equivalences: SemanticEquivalence[] = bindings.map((b: SparqlResultRow) => ({
      sharedConcept: b.sharedConcept.value,
      concept1: {
        uri: b.concept1.value,
        label: b.concept1Label.value,
        notation: b.concept1Notation?.value,
        variable: {
          uri: b.variable1.value,
          identifier: b.variable1Id.value,
          type: b.variable1Type.value,
        },
      },
      concept2: {
        uri: b.concept2.value,
        label: b.concept2Label.value,
        notation: b.concept2Notation?.value,
        variable: {
          uri: b.variable2.value,
          identifier: b.variable2Id.value,
          type: b.variable2Type.value,
        },
      },
      dmn1: {
        uri: b.dmn1.value,
        title: b.dmn1Title.value,
      },
      dmn2: {
        uri: b.dmn2.value,
        title: b.dmn2Title.value,
      },
    }));

    logger.info(`Found ${equivalences.length} semantic equivalences`);
    return equivalences;
  }

  /**
   * Enhanced chain link discovery using both exact and semantic matching
   */
  async findEnhancedChainLinks(endpoint?: string): Promise<EnhancedChainLink[]> {
    logger.info('Finding enhanced chain links with semantic matching');

    const query = `
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX dct: <http://purl.org/dc/terms/>
PREFIX cpsv: <http://purl.org/vocab/cpsv#>
PREFIX cprmv: <https://cprmv.open-regels.nl/0.3.0/>

SELECT DISTINCT ?dmn1 ?dmn1Identifier ?dmn1Title 
                ?dmn2 ?dmn2Identifier ?dmn2Title 
                ?outputVar ?inputVar ?outputVarType ?inputVarType
                ?matchType ?sharedConcept
WHERE {
  # DMN1 produces output
  ?outputVar a cpsv:Output ;
             cpsv:produces ?dmn1 ;
             dct:identifier ?outputVarId ;
             dct:type ?outputVarType .
  
  # DMN2 requires input
  ?inputVar a cpsv:Input ;
            cpsv:isRequiredBy ?dmn2 ;
            dct:identifier ?inputVarId ;
            dct:type ?inputVarType .
  
  # Get DMN metadata
  ?dmn1 a cprmv:DecisionModel ;
        dct:identifier ?dmn1Identifier ;
        dct:title ?dmn1Title .
  
  ?dmn2 a cprmv:DecisionModel ;
        dct:identifier ?dmn2Identifier ;
        dct:title ?dmn2Title .
  
  # Match via exact identifier OR semantic concept
  {
    # Exact match (original logic)
    FILTER(?outputVarId = ?inputVarId)
    BIND("exact" as ?matchType)
    BIND(?outputVarId as ?sharedConcept)
  }
  UNION
  {
    # Semantic match via skos:exactMatch
    ?outputConcept a skos:Concept ;
                   skos:exactMatch ?conceptUri ;
                   dct:subject ?outputVar .
    
    ?inputConcept a skos:Concept ;
                  skos:exactMatch ?conceptUri ;
                  dct:subject ?inputVar .
    
    BIND("semantic" as ?matchType)
    BIND(?conceptUri as ?sharedConcept)
  }
  
  # Type compatibility check
  FILTER(?outputVarType = ?inputVarType)
  FILTER(?dmn1 != ?dmn2)
  FILTER(LANG(?dmn1Title) = "nl" || LANG(?dmn1Title) = "")
  FILTER(LANG(?dmn2Title) = "nl" || LANG(?dmn2Title) = "")
}
ORDER BY ?matchType ?dmn1Title ?dmn2Title
`;

    const data = await this.executeQuery(query, endpoint);
    const bindings = data.results?.bindings || [];

    return bindings.map((b: SparqlResultRow) => ({
      dmn1: {
        uri: b.dmn1.value,
        identifier: b.dmn1Identifier.value,
        title: b.dmn1Title.value,
      },
      dmn2: {
        uri: b.dmn2.value,
        identifier: b.dmn2Identifier.value,
        title: b.dmn2Title.value,
      },
      outputVariable: b.outputVar.value,
      inputVariable: b.inputVar.value,
      variableType: b.outputVarType.value,
      matchType: b.matchType.value as 'exact' | 'semantic',
      sharedConcept: b.sharedConcept.value,
    }));
  }

  /**
   * Detect cycles in DMN chains using semantic links
   */
  async detectChainCycles(endpoint?: string): Promise<ChainCycle[]> {
    logger.info('Detecting cycles in DMN chains');

    const query = `
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX dct: <http://purl.org/dc/terms/>
PREFIX cpsv: <http://purl.org/vocab/cpsv#>
PREFIX cprmv: <https://cprmv.open-regels.nl/0.3.0/>

SELECT DISTINCT ?dmn1 ?dmn1Title ?dmn2 ?dmn2Title ?dmn3 ?dmn3Title
                ?var1 ?var2 ?concept1 ?concept2
WHERE {
  # Path: DMN1 → DMN2
  ?output1 a cpsv:Output ;
           cpsv:produces ?dmn1 .
  ?input2 a cpsv:Input ;
          cpsv:isRequiredBy ?dmn2 .
  
  # Match via concept or identifier
  {
    ?output1 dct:identifier ?var1 .
    ?input2 dct:identifier ?var1 .
  } UNION {
    ?concept1 skos:exactMatch ?concept1Uri ;
              dct:subject ?output1 .
    ?concept1b skos:exactMatch ?concept1Uri ;
               dct:subject ?input2 .
  }
  
  # Path: DMN2 → DMN3
  ?output2 a cpsv:Output ;
           cpsv:produces ?dmn2 .
  ?input3 a cpsv:Input ;
          cpsv:isRequiredBy ?dmn3 .
  
  {
    ?output2 dct:identifier ?var2 .
    ?input3 dct:identifier ?var2 .
  } UNION {
    ?concept2 skos:exactMatch ?concept2Uri ;
              dct:subject ?output2 .
    ?concept2b skos:exactMatch ?concept2Uri ;
               dct:subject ?input3 .
  }
  
  # Path: DMN3 → DMN1 (CYCLE!)
  ?output3 a cpsv:Output ;
           cpsv:produces ?dmn3 .
  ?input1 a cpsv:Input ;
          cpsv:isRequiredBy ?dmn1 .
  
  {
    ?output3 dct:identifier ?var3 .
    ?input1 dct:identifier ?var3 .
  } UNION {
    ?concept3 skos:exactMatch ?concept3Uri ;
              dct:subject ?output3 .
    ?concept3b skos:exactMatch ?concept3Uri ;
               dct:subject ?input1 .
  }
  
  ?dmn1 a cprmv:DecisionModel ; dct:title ?dmn1Title .
  ?dmn2 a cprmv:DecisionModel ; dct:title ?dmn2Title .
  ?dmn3 a cprmv:DecisionModel ; dct:title ?dmn3Title .
  
  FILTER(?dmn1 != ?dmn2 && ?dmn2 != ?dmn3 && ?dmn3 != ?dmn1)
}
`;

    const data = await this.executeQuery(query, endpoint);
    const bindings = data.results?.bindings || [];

    return bindings.map((b: SparqlResultRow) => ({
      path: [
        { uri: b.dmn1.value, title: b.dmn1Title.value },
        { uri: b.dmn2.value, title: b.dmn2Title.value },
        { uri: b.dmn3.value, title: b.dmn3Title.value },
      ],
      type: 'three-hop',
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
   * Resolve logo URL from filename
   * Fetches assets from TriplyDB and finds matching logo
   *
   * @param logoFilename - Logo filename from RDF (e.g., "Sociale_Verzekeringsbank_logo.png")
   * @param organizationUri - Organization URI for logging
   * @param endpoint - SPARQL endpoint URL
   * @returns Full logo URL with version ID, or undefined if not found
   */
  private async resolveLogoUrl(
    logoFilename: string,
    organizationUri: string,
    endpoint?: string
  ): Promise<string | undefined> {
    try {
      // Extract account/dataset from endpoint
      // Example: https://api.open-regels.triply.cc/datasets/stevengort/facts/services/facts/sparql
      const match = endpoint?.match(/datasets\/([^/]+)\/([^/]+)/);
      if (!match) {
        logger.debug('Could not extract account/dataset from endpoint', { endpoint });
        return undefined;
      }

      const [, account, dataset] = match;

      // Clean filename (remove path if present)
      const filename = logoFilename.split('/').pop();
      if (!filename) {
        logger.debug('Invalid logo filename', { logoFilename });
        return undefined;
      }

      // Fetch assets from TriplyDB
      const assetsUrl = `https://api.open-regels.triply.cc/datasets/${account}/${dataset}/assets`;
      logger.debug('Fetching assets to resolve logo', {
        assetsUrl,
        filename,
        organization: organizationUri,
      });

      const response = await axios.get(assetsUrl, {
        timeout: 5000, // 5 second timeout
      });

      const assets = response.data as Array<{
        assetName: string;
        identifier: string;
        versions: Array<{
          id: string;
          url: string;
          fileSize: number;
        }>;
      }>;

      // Find matching asset by filename
      const matchingAsset = assets.find((a) => a.assetName === filename);

      if (matchingAsset && matchingAsset.versions.length > 0) {
        const logoUrl = matchingAsset.versions[0].url;
        logger.debug('Resolved logo URL', {
          filename,
          logoUrl,
          organization: organizationUri,
        });
        return logoUrl;
      }

      logger.debug('Logo asset not found', {
        filename,
        availableAssets: assets.map((a) => a.assetName),
        organization: organizationUri,
      });
      return undefined;
    } catch (error) {
      logger.warn('Failed to resolve logo URL', {
        logoFilename,
        organization: organizationUri,
        error: getErrorMessage(error),
      });
      return undefined;
    }
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
   * Get cache statistics
   * Returns information about all cached endpoints including age and entry count
   *
   * @returns Object with cache statistics per endpoint
   */
  getCacheStats(): Record<string, { age: number; count: number }> {
    const stats: Record<string, { age: number; count: number }> = {};
    const now = Date.now();

    this.dmnCacheMap.forEach((entry, endpoint) => {
      const age = Math.floor((now - entry.timestamp) / 1000);
      stats[endpoint] = {
        age,
        count: entry.data.length,
      };
    });

    return stats;
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
