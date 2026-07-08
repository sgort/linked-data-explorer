/* eslint-disable @typescript-eslint/no-explicit-any */
import axios, { AxiosInstance } from 'axios';
import { config } from '../utils/config';
import logger from '../utils/logger';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { OperatonEvaluationRequest, OperatonEvaluationResponse } from '../types/dmn.types';
import { getErrorMessage, getErrorDetails, isError, isAxiosError } from '../utils/errors';
import FormData from 'form-data';
// Required for fs.writeFileSync that's kept for potential future debugging
// import * as fs from 'fs';
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
   * Fetch deduplicated variable names and types from Operaton history
   * for a given process definition key.
   * Used by the Document Composer BindingPanel for variable discovery.
   */
  async getVariableHints(processKey: string): Promise<Array<{ name: string; type: string }>> {
    try {
      const response = await this.client.get('/history/variable-instance', {
        params: { processDefinitionKey: processKey, firstResult: 0, maxResults: 500 },
      });

      const seen = new Map<string, string>();
      for (const v of response.data as { name: string; type: string }[]) {
        seen.set(v.name, v.type ?? 'String');
      }

      return Array.from(seen.entries())
        .map(([name, type]) => ({ name, type }))
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch (error: unknown) {
      logger.error('Failed to get variable hints', {
        processKey,
        error: getErrorMessage(error),
      });
      throw new Error(`Variable hints failed: ${getErrorMessage(error)}`);
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
   * Make all IDs in a decision/inputData unique by prefixing with a DMN-scoped prefix.
   *
   * A two-pass approach is required:
   *   Pass 1 — Walk the entire subtree and build a mapping of every old ID to its new
   *             prefixed form. This ensures forward-referenced IDs (e.g. an
   *             informationRequirement that references a decision defined later in the XML)
   *             are known before we start rewriting them.
   *   Pass 2 — Walk the subtree again and apply the ID renames to both @_id attributes
   *             and @_href references (which use the "#id" fragment convention).
   *
   * Without this two-pass strategy a single forward pass would miss hrefs that point to
   * IDs not yet renamed, leaving dangling references in the assembled DRD.
   */
  private makeIdsUnique(element: any, prefix: string): Map<string, string> {
    const idMap = new Map<string, string>();

    // Pass 1: collect all IDs and build old→new mapping
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

    // Pass 2: rewrite all @_id values and @_href fragment references using the mapping
    const updateReferences = (obj: any) => {
      if (!obj || typeof obj !== 'object') return;

      if (obj['@_id'] && idMap.has(obj['@_id'])) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
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
   * Assemble a Decision Requirements Diagram (DRD) from an ordered chain of DMN identifiers.
   *
   * Ordering convention:
   *   dmnIds[0]    — the most upstream decision (no informationRequirement from another DMN)
   *   dmnIds[last] — the entry point: the final decision that Operaton evaluates when
   *                  the DRD is called. Its informationRequirement chain traverses all
   *                  preceding decisions, so evaluating it triggers the entire chain.
   *
   * Each DMN's IDs are prefixed with "dmn{index}_" to prevent collisions when multiple
   * DMN files define elements with the same local ID (e.g. every generated DMN has an
   * inputData with id="InputData_1").
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

        // Identify the "main" (top-level) decision for this DMN — the one whose id
        // matches the DMN's own identifier. By convention, Operaton DMN files use the
        // decision key as the decision id (e.g. decision id="SVB_LeeftijdsInformatie").
        // After prefixing, this becomes "dmn0_SVB_LeeftijdsInformatie".
        // Sub-decisions within the same file have different IDs and are left unchanged.
        const mainDecision = decisions.find((d: any) => {
          return d['@_id'] === `${idPrefix}_${dmnId}`;
        });

        if (!mainDecision) {
          logger.warn('Main decision not found by ID, using first decision', { dmnId });
        }

        const mainId = mainDecision ? mainDecision['@_id'] : decisions[0]['@_id'];
        mainDecisionIds.push(mainId);

        // Wire the chain: the main decision of DMN i must declare an informationRequirement
        // on the main decision of DMN i-1. This is prepended so it appears before any
        // existing informationRequirements (which reference the DMN's own inputData).
        decisions.forEach((decision: any) => {
          if (decision['@_id'] === mainId) {
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

              // Normalise informationRequirement to an array before unshifting so we
              // handle both the absent, single-object, and already-array cases uniformly.
              if (!decision.informationRequirement) {
                decision.informationRequirement = [chainRequirement];
              } else if (Array.isArray(decision.informationRequirement)) {
                decision.informationRequirement.unshift(chainRequirement);
              } else {
                // fast-xml-parser returns a plain object when there is only one element
                decision.informationRequirement = [
                  chainRequirement,
                  decision.informationRequirement,
                ];
              }
            }
          }
          // Sub-decisions (helper decisions inside the same DMN file) keep their original
          // informationRequirements unchanged — they already reference the correct inputData.
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

      // Save to file for inspection - kept for potential future debugging
      // fs.writeFileSync('/tmp/generated-drd.dmn', drdXml, 'utf-8');
      // logger.info('DRD saved to /tmp/generated-drd.dmn');

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

  /**
   * Deploy a BPMN process together with its Camunda Form files, sub-process BPMNs,
   * and document templates in a single multipart request to Operaton.
   *
   * All resources must be included in one deployment call because Operaton resolves
   * camunda:formRef and sub-process references at runtime by looking up resources
   * within the same deployment. Splitting them across multiple deployments would
   * cause "form not found" or "process not found" errors at task execution time.
   *
   * An optional operatonUrl/operatonUsername/operatonPassword allows deploying to a
   * different Operaton instance than the one configured in environment variables,
   * which is used by the BPMN Modeler when users configure a custom Operaton server.
   */
  async deployProcess(
    bpmnXml: string,
    deploymentName: string,
    forms: { id: string; schema: Record<string, unknown> }[],
    subProcesses: { filename: string; xml: string }[] = [],
    documents: { id: string; template: Record<string, unknown> }[] = [],
    operatonUrl?: string,
    operatonUsername?: string,
    operatonPassword?: string,
    boardOwner?: string
  ): Promise<{ deploymentId: string; resourceCount: number }> {
    try {
      // Stamp the owning board onto the process definition (deploy-time tag).
      // boardOwner semantics:
      //   undefined  → derive from the BPMN's candidate groups
      //   '' (empty) → caller explicitly opted out; deploy untagged
      //   value      → use as-is (explicit override)
      const owner = boardOwner === undefined ? this.deriveBoardOwner(bpmnXml) : boardOwner;
      const taggedXml = this.injectBoardOwner(bpmnXml, owner);

      logger.info('Deploying BPMN process to Operaton', {
        deploymentName,
        formCount: forms.length,
        subProcessCount: subProcesses.length,
        boardOwner: owner ?? '(none)',
      });

      const client = operatonUrl
        ? axios.create({
            baseURL: operatonUrl,
            timeout: config.operaton.timeout,
            ...(operatonUsername &&
              operatonPassword && {
                auth: { username: operatonUsername, password: operatonPassword },
              }),
          })
        : this.client;

      const formData = new FormData();
      formData.append('deployment-name', deploymentName);
      formData.append('enable-duplicate-filtering', 'false');

      // Main BPMN
      const mainFilename = `${deploymentName}.bpmn`;
      formData.append(mainFilename, Buffer.from(taggedXml, 'utf-8'), {
        filename: mainFilename,
        contentType: 'application/xml',
      });

      // Subprocess BPMNs
      for (const sp of subProcesses) {
        formData.append(sp.filename, Buffer.from(sp.xml, 'utf-8'), {
          filename: sp.filename,
          contentType: 'application/xml',
        });
      }

      // Form schemas
      for (const form of forms) {
        const formFilename = `${form.id}.form`;
        formData.append(formFilename, Buffer.from(JSON.stringify(form.schema), 'utf-8'), {
          filename: formFilename,
          contentType: 'application/json',
        });
      }

      // Document templates
      for (const doc of documents) {
        const docFilename = `${doc.id}.document`;
        formData.append(docFilename, Buffer.from(JSON.stringify(doc.template), 'utf-8'), {
          filename: docFilename,
          contentType: 'application/json',
        });
      }

      const response = await client.post('/deployment/create', formData, {
        headers: formData.getHeaders(),
      });

      const deploymentId: string = response.data.id;
      const resourceCount = 1 + subProcesses.length + forms.length + documents.length;
      logger.info('BPMN process deployed successfully', { deploymentId, resourceCount });
      return { deploymentId, resourceCount };
    } catch (error) {
      const operatonBody = isAxiosError(error) ? error.response?.data : undefined;
      logger.error('BPMN process deployment failed', {
        deploymentName,
        error: error instanceof Error ? error.message : 'Unknown error',
        operatonStatus: isAxiosError(error) ? error.response?.status : undefined,
        operatonResponse: operatonBody,
      });
      const detail =
        typeof operatonBody === 'string'
          ? operatonBody
          : operatonBody
            ? JSON.stringify(operatonBody)
            : error instanceof Error
              ? error.message
              : 'Unknown error';
      throw new Error(`Process deployment failed: ${detail}`);
    }
  }

  /**
   * Candidate-group → board mapping used to derive a process's owning board when
   * the deploy request doesn't pass one explicitly. Kept here as the single point
   * of coupling to RONL's board taxonomy; extend as new boards/roles appear.
   */
  private static readonly BOARD_BY_GROUP: { match: RegExp; board: string }[] = [
    { match: /^(infra-projectteam|infra-medewerker|rip-[\w-]+)$/i, board: 'infra-board' },
    { match: /^(caseworker|case-workers|hr-medewerker)$/i, board: 'caseworker' },
  ];

  /**
   * Derive the owning board from the candidate groups present in the BPMN. Returns
   * undefined when no known group is found, so the process is left untagged (and the
   * consumer falls back to its legacy split). Infra ownership wins over caseworker
   * when both appear, since RIP processes also carry the broad `caseworker` role.
   */
  private deriveBoardOwner(bpmnXml: string): string | undefined {
    const groups = new Set<string>();
    for (const m of bpmnXml.matchAll(/candidateGroups\s*=\s*["']([^"']+)["']/g)) {
      for (const g of m[1].split(',')) groups.add(g.trim());
    }
    let found: string | undefined;
    for (const g of groups) {
      for (const { match, board } of OperatonService.BOARD_BY_GROUP) {
        if (match.test(g)) {
          if (board === 'infra-board') return 'infra-board';
          found = board;
        }
      }
    }
    return found;
  }

  /**
   * Inject a process-level <camunda:property name="boardOwner" …/> into the main
   * BPMN process element. Conservative by design: idempotent, and if the BPMN shape
   * is anything unexpected the original XML is returned untouched — deployment must
   * never break because of tagging.
   */
  private injectBoardOwner(bpmnXml: string, boardOwner?: string): string {
    if (!boardOwner) return bpmnXml;
    try {
      if (/name\s*=\s*["']boardOwner["']/.test(bpmnXml)) return bpmnXml; // already tagged

      const processOpen = bpmnXml.match(/<([A-Za-z_][\w.-]*:)?process\b[^>]*?>/);
      if (!processOpen || processOpen[0].endsWith('/>')) return bpmnXml;
      const pfx = processOpen[1] ?? '';
      let insertAt = (processOpen.index as number) + processOpen[0].length;

      // The BPMN schema requires documentation before extensionElements in a
      // process element's child sequence — skip past any leading <documentation>
      // element(s) so the injected block doesn't reorder them ahead of it.
      const docTag =
        /^\s*<([A-Za-z_][\w.-]*:)?documentation\b[^>]*\/>|^\s*<([A-Za-z_][\w.-]*:)?documentation\b[^>]*>[\s\S]*?<\/\2documentation>/;
      for (;;) {
        const docMatch = bpmnXml.slice(insertAt).match(docTag);
        if (!docMatch) break;
        insertAt += docMatch[0].length;
      }

      const property = `<camunda:property name="boardOwner" value="${boardOwner}" />`;
      const after = bpmnXml.slice(insertAt);
      const extOpen = after.match(/^\s*<([A-Za-z_][\w.-]*:)?extensionElements\b[^>]*?>/);

      let tagged: string;
      if (extOpen) {
        // Process already opens with an extensionElements — merge into it, reusing an
        // existing camunda:properties block when present, otherwise adding one.
        const extEnd = insertAt + extOpen[0].length;
        const propsOpen = bpmnXml.slice(extEnd).match(/^\s*<camunda:properties\b[^>]*?>/);
        if (propsOpen) {
          const at = extEnd + propsOpen[0].length;
          tagged = bpmnXml.slice(0, at) + property + bpmnXml.slice(at);
        } else {
          const block = `<camunda:properties>${property}</camunda:properties>`;
          tagged = bpmnXml.slice(0, extEnd) + block + bpmnXml.slice(extEnd);
        }
      } else {
        const block =
          `<${pfx}extensionElements><camunda:properties>${property}` +
          `</camunda:properties></${pfx}extensionElements>`;
        tagged = bpmnXml.slice(0, insertAt) + block + bpmnXml.slice(insertAt);
      }

      return this.ensureCamundaNamespace(tagged);
    } catch (err) {
      logger.warn('boardOwner injection skipped — BPMN deployed untouched', {
        error: err instanceof Error ? err.message : String(err),
      });
      return bpmnXml;
    }
  }

  /** Ensure the camunda namespace is declared on <definitions> so the property resolves. */
  private ensureCamundaNamespace(xml: string): string {
    if (/xmlns:camunda\s*=/.test(xml)) return xml;
    const defs = xml.match(/<([A-Za-z_][\w.-]*:)?definitions\b[^>]*?>/);
    if (!defs) return xml;
    const patched = defs[0].replace(/>$/, ` xmlns:camunda="http://camunda.org/schema/1.0/bpmn">`);
    return (
      xml.slice(0, defs.index as number) +
      patched +
      xml.slice((defs.index as number) + defs[0].length)
    );
  }
}

export const operatonService = new OperatonService();
export default operatonService;
