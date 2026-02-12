/* eslint-disable @typescript-eslint/no-explicit-any */
import axios, { AxiosInstance } from 'axios';
import { config } from '../utils/config';
import logger from '../utils/logger';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { OperatonEvaluationRequest, OperatonEvaluationResponse } from '../types/dmn.types';
import { getErrorMessage, getErrorDetails, isError } from '../utils/errors';
import FormData from 'form-data';
import * as fs from 'fs';
import { XMLParser, XMLBuilder } from 'fast-xml-parser';

/**
 * Service for interacting with Operaton REST API
 */
export class OperatonService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: config.operaton.baseUrl,
      timeout: config.operaton.timeout,
      headers: {
        'Content-Type': 'application/json',
        ...(config.operaton.apiKey && { Authorization: `Bearer ${config.operaton.apiKey}` }),
      },
    });

    // Add request/response interceptors for logging
    this.client.interceptors.request.use((config) => {
      logger.debug('Operaton API Request', {
        method: config.method,
        url: config.url,
        data: config.data,
      });
      return config;
    });

    this.client.interceptors.response.use(
      (response) => {
        logger.debug('Operaton API Response', {
          status: response.status,
          data: response.data,
        });
        return response;
      },
      (error) => {
        logger.error('Operaton API Error', {
          message: error.message,
          response: error.response?.data,
        });
        throw error;
      }
    );
  }

  /**
   * Evaluate a DMN decision
   * @param decisionKey - The decision key/identifier (e.g., "SVB_LeeftijdsInformatie")
   * @param variables - Input variables for the decision
   * @returns Decision evaluation result
   */
  async evaluateDecision(
    decisionKey: string,
    variables: Record<string, unknown>
  ): Promise<OperatonEvaluationResponse | OperatonEvaluationResponse[]> {
    try {
      const startTime = Date.now();

      // Transform variables to Operaton format
      const operatonVariables = this.transformVariablesToOperatonFormat(variables);

      logger.info(`Evaluating DMN: ${decisionKey}`, { variables: operatonVariables });

      const response = await this.client.post(`/decision-definition/key/${decisionKey}/evaluate`, {
        variables: operatonVariables,
      });

      const duration = Date.now() - startTime;
      logger.info(`DMN evaluation completed: ${decisionKey}`, { duration });

      return response.data;
    } catch (error: unknown) {
      const errorDetails = getErrorDetails(error);

      // Extract additional context for axios errors
      const additionalContext: Record<string, unknown> = {};
      if (isError(error) && 'response' in error) {
        const axiosError = error as { response?: { data?: unknown } };
        additionalContext.response = axiosError.response?.data;
      }

      logger.error(`Failed to evaluate DMN: ${decisionKey}`, {
        ...errorDetails,
        ...additionalContext,
      });

      throw new Error(`DMN evaluation failed: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Transform plain variables to Operaton format
   * Each variable needs to be wrapped with value and type
   */
  private transformVariablesToOperatonFormat(
    variables: Record<string, unknown>
  ): Record<string, { value: unknown; type: string }> {
    const transformed: Record<string, { value: unknown; type: string }> = {};

    for (const [key, value] of Object.entries(variables)) {
      transformed[key] = {
        value,
        type: this.inferType(value),
      };
    }

    return transformed;
  }

  /**
   * Infer Operaton type from JavaScript value
   */
  private inferType(value: unknown): string {
    if (value === null || value === undefined) {
      return 'Null';
    }

    switch (typeof value) {
      case 'boolean':
        return 'Boolean';
      case 'number':
        return Number.isInteger(value) ? 'Integer' : 'Double';
      case 'string':
        // Check if it's a date string (YYYY-MM-DD format)
        if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
          return 'String'; // Operaton usually handles dates as strings
        }
        return 'String';
      default:
        return 'String';
    }
  }

  /**
   * Extract plain values from Operaton response
   * Operaton returns { variableName: { value: X, type: Y } }
   * OR [{ variableName: { value: X, type: Y } }] (array with single object)
   * We want just { variableName: X }
   */
  extractValues(
    operatonResponse: OperatonEvaluationResponse | OperatonEvaluationResponse[]
  ): Record<string, unknown> {
    const extracted: Record<string, unknown> = {};

    // Handle array response - Operaton sometimes wraps response in array
    let responseObject = operatonResponse;
    if (Array.isArray(operatonResponse) && operatonResponse.length > 0) {
      responseObject = operatonResponse[0];
      logger.debug('Unwrapped array response', { originalLength: operatonResponse.length });
    }

    // Now extract values from the object
    if (typeof responseObject === 'object' && responseObject !== null) {
      for (const [key, valueObj] of Object.entries(responseObject)) {
        if (typeof valueObj === 'object' && valueObj !== null && 'value' in valueObj) {
          extracted[key] = (valueObj as { value: unknown }).value;
        }
      }
    }

    logger.info('Extracted values:', {
      extractedKeys: Object.keys(extracted),
      extractedCount: Object.keys(extracted).length,
    });

    return extracted;
  }

  /**
   * Health check - verify Operaton is accessible
   */
  async healthCheck(): Promise<{ status: 'up' | 'down'; latency?: number; error?: string }> {
    try {
      const startTime = Date.now();
      await this.client.get('/version');
      const latency = Date.now() - startTime;

      return { status: 'up', latency };
    } catch (error: unknown) {
      return {
        status: 'down',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * Fetch DMN XML content from Operaton
   * Add this method to the OperatonService class in operaton.service.ts
   *
   * Uses the Operaton REST API to get the DMN definition XML
   *
   * @param definitionKey - DMN definition key (e.g., "SVB_LeeftijdsInformatie")
   * @returns DMN XML string or null if not found
   */
  async fetchDmnXml(definitionKey: string): Promise<string | null> {
    try {
      logger.info('Fetching DMN XML from Operaton', { definitionKey });

      // Step 1: Get the latest decision definition for this key
      const definitionsUrl = `/decision-definition/key/${definitionKey}`;

      logger.debug('Fetching decision definition', { url: definitionsUrl });

      const definitionResponse = await this.client.get(definitionsUrl);

      const decisionDefinitionId = definitionResponse.data.id;

      logger.debug('Got decision definition', {
        id: decisionDefinitionId,
        key: definitionKey,
        name: definitionResponse.data.name,
        version: definitionResponse.data.version,
      });

      // Step 2: Fetch the DMN XML using the definition ID
      const xmlUrl = `/decision-definition/${decisionDefinitionId}/xml`;

      logger.debug('Fetching DMN XML', { url: xmlUrl });

      const xmlResponse = await this.client.get(xmlUrl);

      // Response structure: { id, dmnXml } or just the XML string
      const dmnXml = xmlResponse.data.dmnXml || xmlResponse.data;

      logger.info('Successfully fetched DMN XML', {
        definitionKey,
        definitionId: decisionDefinitionId,
        xmlLength: typeof dmnXml === 'string' ? dmnXml.length : 0,
      });

      return dmnXml;
    } catch (error) {
      // Handle axios errors (this.client is an AxiosInstance)
      if (error && typeof error === 'object' && 'isAxiosError' in error) {
        const axiosError = error as unknown as {
          response?: { status?: number; data?: unknown };
          message: string;
        };

        if (axiosError.response?.status === 404) {
          logger.warn('DMN definition not found in Operaton', {
            definitionKey,
            status: 404,
          });
          return null;
        }

        logger.error('Operaton API error while fetching DMN XML', {
          definitionKey,
          status: axiosError.response?.status,
          message: axiosError.message,
          data: axiosError.response?.data,
        });
      } else {
        logger.error('Unexpected error fetching DMN XML', {
          definitionKey,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }

      throw new Error(
        `Failed to fetch DMN XML: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Make all IDs in a decision/inputData unique by prefixing with dmnId prefix.
   * Uses two-pass approach: first collect all IDs, then update all references.
   */
  private makeIdsUnique(element: any, prefix: string): Map<string, string> {
    const idMap = new Map<string, string>();

    // First pass: collect all IDs and build mapping
    const collectIds = (obj: any) => {
      if (!obj || typeof obj !== 'object') return;

      if (obj['@_id']) {
        const oldId = obj['@_id'];
        const newId = `${prefix}_${oldId}`;
        idMap.set(oldId, newId);
      }

      for (const key in obj) {
        if (Array.isArray(obj[key])) {
          obj[key].forEach((item: any) => collectIds(item));
        } else if (typeof obj[key] === 'object') {
          collectIds(obj[key]);
        }
      }
    };

    // Second pass: update all IDs and hrefs
    const updateReferences = (obj: any) => {
      if (!obj || typeof obj !== 'object') return;

      if (obj['@_id'] && idMap.has(obj['@_id'])) {
        obj['@_id'] = idMap.get(obj['@_id'])!;
      }

      if (obj['@_href']) {
        const href = obj['@_href'];
        if (href.startsWith('#')) {
          const refId = href.substring(1);
          if (idMap.has(refId)) {
            obj['@_href'] = `#${idMap.get(refId)}`;
          }
        }
      }

      for (const key in obj) {
        if (Array.isArray(obj[key])) {
          obj[key].forEach((item: any) => updateReferences(item));
        } else if (typeof obj[key] === 'object') {
          updateReferences(obj[key]);
        }
      }
    };

    collectIds(element);
    updateReferences(element);

    return idMap;
  }
  /**
   * Assemble a DRD from an ordered chain of DMN identifiers.
   * dmnIds[0] has no dependencies; dmnIds[last] is the entry point.
   */
  async assembleDrd(dmnIds: string[], drdName: string): Promise<string> {
    if (dmnIds.length < 2) {
      throw new Error('DRD requires at least 2 DMNs');
    }

    try {
      logger.info('Starting DRD assembly', { dmnCount: dmnIds.length });

      const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '@_',
        textNodeName: '#text',
        preserveOrder: false,
      });

      const builder = new XMLBuilder({
        ignoreAttributes: false,
        attributeNamePrefix: '@_',
        format: true,
        indentBy: '  ',
        suppressEmptyNode: true,
      });

      // Collect ALL decisions and inputData from all DMN files
      const allDecisions: any[] = [];
      const allInputData: any[] = [];
      const inputDataIds = new Set<string>();
      const mainDecisionIds: string[] = [];

      for (let i = 0; i < dmnIds.length; i++) {
        const dmnId = dmnIds[i];
        logger.info(`Processing DMN ${i + 1}/${dmnIds.length}`, { dmnId });

        const xml = await this.fetchDmnXml(dmnId);
        if (!xml) {
          throw new Error(`DMN not found in Operaton: ${dmnId}`);
        }

        const parsed = parser.parse(xml);
        const definitions = parsed.definitions;

        if (!definitions || !definitions.decision) {
          throw new Error(`No decision element found in ${dmnId}`);
        }

        // Create a prefix for this DMN's IDs (use index to ensure uniqueness)
        const idPrefix = `dmn${i}`;

        // Clone the entire definitions object
        const clonedDefinitions = JSON.parse(JSON.stringify(definitions));

        // Make ALL IDs unique for this entire DMN (decisions + inputData) in one pass
        // This ensures cross-references within the same DMN are correctly updated
        this.makeIdsUnique(clonedDefinitions, idPrefix);

        // Extract decisions
        const decisions = Array.isArray(clonedDefinitions.decision)
          ? clonedDefinitions.decision
          : [clonedDefinitions.decision];

        logger.info('Found decisions', {
          dmnId,
          count: decisions.length,
          decisionIds: decisions.map((d: any) => d['@_id']),
        });

        // Extract inputData elements (deduplicated by id)
        if (clonedDefinitions.inputData) {
          const inputDataElements = Array.isArray(clonedDefinitions.inputData)
            ? clonedDefinitions.inputData
            : [clonedDefinitions.inputData];

          inputDataElements.forEach((inputData: any) => {
            const id = inputData['@_id'];
            if (!inputDataIds.has(id)) {
              inputDataIds.add(id);
              allInputData.push(inputData);
            }
          });

          logger.info('Found inputData', {
            dmnId,
            count: inputDataElements.length,
            inputDataIds: inputDataElements.map((id: any) => id['@_id']),
          });
        }

        // The main decision is the one with prefixed id matching dmnId
        const mainDecision = decisions.find((d: any) => {
          return d['@_id'] === `${idPrefix}_${dmnId}`;
        });

        if (!mainDecision) {
          logger.warn('Main decision not found by ID, using first decision', { dmnId });
        }

        const mainId = mainDecision ? mainDecision['@_id'] : decisions[0]['@_id'];
        mainDecisionIds.push(mainId);

        // For the main decision, add chain-based informationRequirement at the START
        decisions.forEach((decision: any) => {
          if (decision['@_id'] === mainId) {
            // This is the main decision
            // Add chain requirement if not first DMN (PREPEND to existing requirements)
            if (i > 0) {
              const requiredId = mainDecisionIds[i - 1];
              logger.info('Adding chain requirement', {
                from: decision['@_id'],
                requires: requiredId,
              });

              const chainRequirement = {
                requiredDecision: {
                  '@_href': `#${requiredId}`,
                },
              };

              // Prepend to existing informationRequirement array
              if (!decision.informationRequirement) {
                decision.informationRequirement = [chainRequirement];
              } else if (Array.isArray(decision.informationRequirement)) {
                decision.informationRequirement.unshift(chainRequirement);
              } else {
                decision.informationRequirement = [
                  chainRequirement,
                  decision.informationRequirement,
                ];
              }
            }
          }
          // Sub-decisions keep their original informationRequirement unchanged
        });

        // Add all decisions from this DMN to the combined list
        allDecisions.push(...decisions);
      }

      const entryPointId = mainDecisionIds[mainDecisionIds.length - 1];
      const sanitizedId = entryPointId.replace(/[^a-zA-Z0-9_-]/g, '_');

      logger.info('Building DRD XML', {
        entryPointId,
        totalDecisions: allDecisions.length,
        totalInputData: allInputData.length,
        mainDecisions: mainDecisionIds,
      });

      // Build the DRD structure
      const drd: any = {
        '?xml': {
          '@_version': '1.0',
          '@_encoding': 'UTF-8',
        },
        definitions: {
          '@_xmlns': 'https://www.omg.org/spec/DMN/20191111/MODEL/',
          '@_xmlns:camunda': 'http://camunda.org/schema/1.0/dmn',
          '@_id': `drd_${sanitizedId}`,
          '@_name': drdName,
          '@_namespace': 'http://camunda.org/schema/1.0/dmn',
          '@_exporter': 'Linked Data Explorer',
          '@_exporterVersion': '1.0',
          decision: allDecisions,
        },
      };

      // Add inputData if any exist
      if (allInputData.length > 0) {
        drd.definitions.inputData = allInputData;
      }

      const drdXml = builder.build(drd);

      logger.info('DRD XML generated', { length: drdXml.length });

      // Save to file for inspection
      fs.writeFileSync('/tmp/generated-drd.dmn', drdXml, 'utf-8');
      logger.info('DRD saved to /tmp/generated-drd.dmn');

      return drdXml;
    } catch (error) {
      logger.error('DRD assembly failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  /**
   * Deploy a DRD XML to Operaton.
   */
  /**
   * Deploy a DRD XML to Operaton.
   */
  async deployDrd(
    drdXml: string,
    deploymentName: string,
    filename: string
  ): Promise<{ deploymentId: string }> {
    try {
      logger.info('Deploying DRD to Operaton', { deploymentName, filename });

      // Use form-data package for Node.js multipart/form-data
      // const FormData = require('form-data');
      const formData = new FormData();

      formData.append('deployment-name', deploymentName);
      formData.append('enable-duplicate-filtering', 'false');
      formData.append('data', Buffer.from(drdXml, 'utf-8'), {
        filename: filename,
        contentType: 'application/xml',
      });

      const response = await this.client.post('/deployment/create', formData, {
        headers: formData.getHeaders(),
      });

      const deploymentId: string = response.data.id;

      logger.info('DRD deployed successfully', { deploymentId });
      return { deploymentId };
    } catch (error) {
      logger.error('DRD deployment failed', {
        deploymentName,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new Error(
        `DRD deployment failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}

export const operatonService = new OperatonService();
export default operatonService;
