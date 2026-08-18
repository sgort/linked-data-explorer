// packages/backend/src/routes/dmn.routes.ts
// UPDATED: Added optional endpoint parameter for dynamic TriplyDB endpoint selection

import { Router, Request, Response } from 'express';
import { sparqlService } from '../services/sparql.service';
import logger from '../utils/logger';
import { ApiResponse } from '../types/api.types';
import { getErrorMessage, getErrorDetails, isAxiosError } from '../utils/errors';
import { operatonService } from '../services/operaton.service';
import { dmnValidationService } from '../services/dmn-validation.service';

const router = Router();

/**
 * GET /api/dmns
 * List all DMN models
 *
 * NEW: Optional query parameter 'endpoint' for dynamic TriplyDB endpoint selection
 * NEW: Optional query parameter 'refresh' to bypass cache and fetch fresh data
 * Example: GET /api/dmns?endpoint=https://api.open-regels.triply.cc/datasets/stevengort/Facts/services/facts/sparql
 * Example: GET /api/dmns?refresh=true
 *
 * If no endpoint is provided, uses default from config (TRIPLYDB_ENDPOINT)
 * Cache is maintained separately per endpoint (5 minute TTL per endpoint)
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    // NEW: Extract optional endpoint parameter
    const requestedEndpoint = req.query.endpoint as string | undefined;
    // NEW: Extract optional refresh parameter
    const refresh = req.query.refresh === 'true' || req.query.refresh === '1';

    if (requestedEndpoint) {
      logger.info('DMN list request with custom endpoint', {
        endpoint: requestedEndpoint,
        refresh,
      });
    } else if (refresh) {
      logger.info('DMN list request (refresh requested)');
    } else {
      logger.info('DMN list request (using default endpoint)');
    }

    // Pass endpoint and refresh to sparqlService
    const dmns = await sparqlService.getAllDmns(requestedEndpoint, refresh);

    // Enrich each DMN with a relative URL clients can use to download the
    // deployed DMN XML from Operaton. The handler lives at
    // `GET /v1/dmns/:identifier/xml` (also reachable via the legacy
    // `/api/dmns` alias). Relative URLs keep the response portable across
    // local / ACC / PROD without the backend needing to know its own host.
    const dmnsWithLinks = dmns.map((dmn) => ({
      ...dmn,
      xmlUrl: `/v1/dmns/${encodeURIComponent(dmn.identifier)}/xml`,
    }));

    res.json({
      success: true,
      data: {
        total: dmnsWithLinks.length,
        dmns: dmnsWithLinks,
        fromCache: !refresh, // Helpful for debugging
      },
      timestamp: new Date().toISOString(),
    } as ApiResponse);
  } catch (error: unknown) {
    const errorDetails = getErrorDetails(error);
    logger.error('DMN list error', errorDetails);

    res.status(500).json({
      success: false,
      error: {
        code: 'QUERY_ERROR',
        message: getErrorMessage(error),
      },
      timestamp: new Date().toISOString(),
    } as ApiResponse);
  }
});

/**
 * GET /api/dmns/semantic-equivalences
 * Find variables that share the same skos:exactMatch URI across DMNs
 */
router.get('/semantic-equivalences', async (req: Request, res: Response) => {
  try {
    const endpoint = req.query.endpoint as string | undefined;
    const equivalences = await sparqlService.findSemanticEquivalences(endpoint);

    res.json({
      success: true,
      data: equivalences,
      timestamp: new Date().toISOString(),
    } as ApiResponse);
  } catch (error: unknown) {
    const errorDetails = getErrorDetails(error);
    logger.error('Semantic equivalences error', errorDetails);
    res.status(500).json({
      success: false,
      error: { code: 'QUERY_ERROR', message: getErrorMessage(error) },
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /api/dmns/enhanced-chain-links
 * Find chain links via exact identifier match AND semantic skos:exactMatch
 */
router.get('/enhanced-chain-links', async (req: Request, res: Response) => {
  try {
    const endpoint = req.query.endpoint as string | undefined;
    const links = await sparqlService.findEnhancedChainLinks(endpoint);

    // Standardize response format to match other endpoints
    res.json({
      success: true,
      data: links,
      timestamp: new Date().toISOString(),
    } as ApiResponse);
  } catch (error: unknown) {
    const errorDetails = getErrorDetails(error);
    logger.error('Enhanced chain links error', errorDetails);
    res.status(500).json({
      success: false,
      error: { code: 'QUERY_ERROR', message: getErrorMessage(error) },
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /api/dmns/cycles
 * Detect circular dependencies in DMN chains
 */
router.get('/cycles', async (req: Request, res: Response) => {
  try {
    const endpoint = req.query.endpoint as string | undefined;
    const cycles = await sparqlService.detectChainCycles(endpoint);

    res.json({
      success: true,
      data: cycles,
      timestamp: new Date().toISOString(),
    } as ApiResponse);
  } catch (error: unknown) {
    const errorDetails = getErrorDetails(error);
    logger.error('Cycle detection error', errorDetails);
    res.status(500).json({
      success: false,
      error: { code: 'QUERY_ERROR', message: getErrorMessage(error) },
      timestamp: new Date().toISOString(),
    } as ApiResponse);
  }
});

/**
 * POST /api/dmns/drd/deploy
 * Assemble and deploy a DRD from an ordered chain of DMN identifiers.
 * Body: { dmnIds: string[], deploymentName: string }
 */
router.post('/drd/deploy', async (req: Request, res: Response) => {
  try {
    const { dmnIds, deploymentName } = req.body as {
      dmnIds: string[];
      deploymentName: string;
    };

    if (!Array.isArray(dmnIds) || dmnIds.length < 2) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'dmnIds must be an array with at least 2 entries',
        },
        timestamp: new Date().toISOString(),
      });
    }

    if (!deploymentName?.trim()) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'deploymentName is required' },
        timestamp: new Date().toISOString(),
      });
    }

    // The last DMN in the ordered array is the entry point (the top-level decision that
    // Operaton evaluates when the DRD is called). Operaton uses the entry-point decision's
    // key as the deployment resource key, which is why the filename is derived from it.
    const entryPointId = dmnIds[dmnIds.length - 1];
    const filename = `${entryPointId}.dmn`;

    const drdXml = await operatonService.assembleDrd(dmnIds, deploymentName);
    const result = await operatonService.deployDrd(drdXml, deploymentName, filename);

    res.json({
      success: true,
      data: {
        deploymentId: result.deploymentId,
        entryPointId,
        filename,
        dmnCount: dmnIds.length,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    logger.error('DRD deploy error', getErrorDetails(error));
    res.status(500).json({
      success: false,
      error: { code: 'DRD_DEPLOY_FAILED', message: getErrorMessage(error) },
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * POST /api/dmns/process/deploy
 * Deploy a BPMN process and its linked Camunda Form files in one multipart
 * request to Operaton.
 *
 * Body: {
 *   bpmnXml: string,
 *   deploymentName: string,
 *   forms: { id: string, schema: Record<string, unknown> }[]
 * }
 */
router.post('/process/deploy', async (req: Request, res: Response) => {
  try {
    const {
      bpmnXml,
      deploymentName,
      forms = [],
      subProcesses = [],
      documents = [],
      operatonUrl,
      operatonUsername,
      operatonPassword,
      boardOwner,
      organization,
    } = req.body as {
      bpmnXml: string;
      deploymentName: string;
      forms: { id: string; schema: Record<string, unknown> }[];
      subProcesses: { filename: string; xml: string }[];
      documents: { id: string; template: Record<string, unknown> }[];
      operatonUrl?: string;
      operatonUsername?: string;
      operatonPassword?: string;
      /** Owning board for the deployed process; auto-derived from candidate groups when omitted. */
      boardOwner?: string;
      /** Tenant tag, mandatory — becomes Operaton's native tenant-id. */
      organization?: string;
    };

    if (!bpmnXml?.trim()) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'bpmnXml is required' },
        timestamp: new Date().toISOString(),
      });
    }

    if (!deploymentName?.trim()) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'deploymentName is required' },
        timestamp: new Date().toISOString(),
      });
    }

    if (!organization?.trim()) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'organization is required' },
        timestamp: new Date().toISOString(),
      });
    }

    const result = await operatonService.deployProcess(
      bpmnXml,
      deploymentName,
      forms,
      subProcesses,
      documents,
      operatonUrl,
      operatonUsername,
      operatonPassword,
      boardOwner,
      organization
    );

    res.json({
      success: true,
      data: {
        deploymentId: result.deploymentId,
        resourceCount: result.resourceCount,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    logger.error('Process deploy error', getErrorDetails(error));
    res.status(500).json({
      success: false,
      error: { code: 'PROCESS_DEPLOY_FAILED', message: getErrorMessage(error) },
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * POST /v1/dmns/deploy
 * Deploy raw, ad-hoc DMN XML content directly to Operaton.
 *
 * Unlike `/drd/deploy`, this takes the DMN content as-is rather than
 * assembling it from pre-registered LDE norm identifiers -- built for the
 * CPSV Editor's own DMN tab, which has an uploaded/generated DMN file with
 * no registry entry of its own. Routing the deploy through this backend
 * instead of calling Operaton directly from the browser sidesteps CORS:
 * `operatonService.deployDrd`'s multipart POST is server-to-server, which
 * browsers' CORS preflight checks never apply to.
 *
 * Body: { xml: string, deploymentName: string, filename?: string }
 */
router.post('/deploy', async (req: Request, res: Response) => {
  try {
    const { xml, deploymentName, filename } = req.body as {
      xml: string;
      deploymentName: string;
      filename?: string;
    };

    if (!xml?.trim()) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'xml is required' },
        timestamp: new Date().toISOString(),
      });
    }

    if (!deploymentName?.trim()) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'deploymentName is required' },
        timestamp: new Date().toISOString(),
      });
    }

    const result = await operatonService.deployDrd(
      xml,
      deploymentName,
      filename?.trim() || `${deploymentName}.dmn`
    );

    res.json({
      success: true,
      data: { deploymentId: result.deploymentId },
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    logger.error('DMN deploy error', getErrorDetails(error));
    res.status(500).json({
      success: false,
      error: { code: 'DMN_DEPLOY_FAILED', message: getErrorMessage(error) },
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * POST /v1/dmns/evaluate/:decisionKey
 * Evaluate a decision against variables already in Operaton's native wire
 * format ({value, type, valueInfo}), passed straight through -- no
 * plain-JS-value type inference (that's evaluateDecision(), used elsewhere
 * for a different caller contract).
 *
 * Routed through this backend instead of calling Operaton directly from the
 * browser for the same CORS reason `/deploy` above is -- see the CPSV
 * Editor's DMNTab.jsx (handleEvaluateDMN and friends).
 *
 * Unlike every other route in this file, the response is Operaton's raw
 * evaluate response forwarded byte-for-byte (success or failure), not the
 * `{success, data, error}` envelope -- the DMN tab reads Operaton's raw JSON
 * directly (e.g. checking a failed response's body for `"type":
 * "RestException"`), exactly as it did calling Operaton directly before
 * being proxied through here, so no frontend response-parsing changes were
 * needed beyond the URL.
 *
 * Body: { variables: Record<string, {value, type, valueInfo?}> }
 */
router.post('/evaluate/:decisionKey', async (req: Request, res: Response) => {
  const { decisionKey } = req.params;
  try {
    const result = await operatonService.evaluateRaw(decisionKey, req.body?.variables ?? {});
    res.json(result);
  } catch (error: unknown) {
    if (isAxiosError(error) && error.response) {
      res.status(error.response.status ?? 500).json(error.response.data);
      return;
    }
    logger.error('DMN evaluate error', getErrorDetails(error));
    res.status(500).json({ type: 'ProxyError', message: getErrorMessage(error) });
  }
});

/**
 * GET /v1/dmns/:identifier/xml
 * Fetch the deployed DMN XML content from Operaton.
 *
 * Mirrors the handler in `dmn-xml.routes.ts` (still mounted at the legacy
 * `/api/dmns` path in `index.ts` for backward compatibility) but exposes the
 * route under the canonical `/v1/dmns` mount via the registry, and uses the
 * `:identifier` parameter name to match the convention of the surrounding
 * routes. The `identifier` value is passed verbatim as the Operaton decision
 * definition key — for RONL DMNs deployed via this platform these are
 * equivalent by convention.
 *
 * The response is `application/xml` with `Content-Disposition: attachment`
 * so browsers save the file as `<identifier>.dmn`. Declared before the
 * `GET /:identifier` route below to match the "more specific first" pattern
 * used elsewhere in this file, though strictly speaking the segment counts
 * differ so Express would not confuse them either way.
 */
router.get('/:identifier/xml', async (req: Request, res: Response) => {
  const { identifier } = req.params;

  logger.info('DMN XML download request', { identifier });

  try {
    const dmnXml = await operatonService.fetchDmnXml(identifier);

    if (!dmnXml) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'DMN_NOT_FOUND',
          message: `DMN definition not found in Operaton: ${identifier}`,
        },
        timestamp: new Date().toISOString(),
      } as ApiResponse);
    }

    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Content-Disposition', `attachment; filename="${identifier}.dmn"`);
    res.send(dmnXml);
  } catch (error: unknown) {
    const errorDetails = getErrorDetails(error);
    logger.error('DMN XML download error', errorDetails);
    res.status(500).json({
      success: false,
      error: {
        code: 'DMN_FETCH_FAILED',
        message: getErrorMessage(error),
      },
      timestamp: new Date().toISOString(),
    } as ApiResponse);
  }
});

/**
 * GET /api/dmns/:identifier
 * Get a specific DMN by identifier
 *
 * NEW: Optional query parameter 'endpoint' for dynamic TriplyDB endpoint selection
 */
router.get('/:identifier', async (req: Request, res: Response) => {
  try {
    const { identifier } = req.params;
    const requestedEndpoint = req.query.endpoint as string | undefined;

    logger.info('DMN details request', {
      identifier,
      ...(requestedEndpoint && { endpoint: requestedEndpoint }),
    });

    const dmn = await sparqlService.getDmnByIdentifier(identifier, requestedEndpoint);

    if (!dmn) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: `DMN not found: ${identifier}`,
        },
        timestamp: new Date().toISOString(),
      } as ApiResponse);
    }

    // Enrich with the XML download link (same convention as the list endpoint).
    const dmnWithLink = {
      ...dmn,
      xmlUrl: `/v1/dmns/${encodeURIComponent(identifier)}/xml`,
    };

    res.json({
      success: true,
      data: dmnWithLink,
      timestamp: new Date().toISOString(),
    } as ApiResponse);
  } catch (error: unknown) {
    const errorDetails = getErrorDetails(error);
    logger.error('DMN details error', errorDetails);

    res.status(500).json({
      success: false,
      error: {
        code: 'QUERY_ERROR',
        message: getErrorMessage(error),
      },
      timestamp: new Date().toISOString(),
    } as ApiResponse);
  }
});

/**
 * POST /v1/dmns/validate
 * Validate a DMN file against the RONL DMN+ syntactic layers.
 *
 * Request body (JSON):
 *   { "content": "<DMN XML as a string>" }
 *
 * Response (JSON):
 *   {
 *     "success": true,
 *     "data": {
 *       "valid": boolean,
 *       "parseError": string | null,
 *       "layers": {
 *         "base":        { "label": "Base DMN",         "issues": Issue[] },
 *         "business":    { "label": "Business Rules",   "issues": Issue[] },
 *         "execution":   { "label": "Execution Rules",  "issues": Issue[] },
 *         "interaction": { "label": "Interaction Rules","issues": Issue[] },
 *         "content":     { "label": "Content",          "issues": Issue[] }
 *       },
 *       "summary": { "errors": number, "warnings": number, "infos": number }
 *     },
 *     "timestamp": string
 *   }
 *
 * Issue shape:
 *   {
 *     "severity": "error" | "warning" | "info",
 *     "code":     string,    // e.g. "BASE-XSD", "BIZ-006", "EXEC-004"
 *     "message":  string,
 *     "location": string?,   // element description, e.g. "<decision id="d1">"
 *     "line":     number?,   // only for BASE-XSD errors from libxmljs2
 *     "column":   number?
 *   }
 *
 * This endpoint is unauthenticated. It performs no TriplyDB or Operaton calls.
 * The 10 MB body limit is enforced by express.json() in index.ts.
 */
router.post('/validate', async (req: Request, res: Response) => {
  try {
    const { content } = req.body as { content?: string };

    if (!content || typeof content !== 'string') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'Request body must contain a "content" field with the DMN XML as a string.',
        },
        timestamp: new Date().toISOString(),
      } as ApiResponse);
    }

    logger.info('[DMN Validate] Validation requested', { contentLength: content.length });

    const result = await dmnValidationService.validateDmnContent(content);

    logger.info('[DMN Validate] Complete', {
      valid: result.valid,
      errors: result.summary.errors,
      warnings: result.summary.warnings,
    });

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    } as ApiResponse);
  } catch (error: unknown) {
    logger.error('[DMN Validate] Unexpected error', getErrorDetails(error));
    res.status(500).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: getErrorMessage(error) },
      timestamp: new Date().toISOString(),
    } as ApiResponse);
  }
});

export default router;
