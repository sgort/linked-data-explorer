import { Router, Request, Response } from 'express';
import { orchestrationService } from '../services/orchestration.service';
import { sparqlService } from '../services/sparql.service';
import logger from '../utils/logger';
import { ApiResponse, ChainExecutionRequest } from '../types/api.types';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { ChainExecutionResult } from '../types/dmn.types';
import { getErrorMessage, getErrorDetails } from '../utils/errors';
import { sendProblem } from '../utils/problem';

const router = Router();

/**
 * POST /api/chains/execute
 * Execute a chain of DMNs
 */
router.post('/execute', async (req: Request, res: Response) => {
  try {
    const body = req.body as ChainExecutionRequest;
    const { dmnIds, inputs, options, endpoint, isDrd, drdEntryPointId } = body;

    // Validate dmnIds exists and is not empty
    if (!dmnIds || dmnIds.length === 0) {
      sendProblem(res, req, {
        status: 400,
        code: 'INVALID_REQUEST',
        detail: 'dmnIds array is required and must not be empty',
      });
      return;
    }

    if (!inputs || Object.keys(inputs).length === 0) {
      sendProblem(res, req, {
        status: 400,
        code: 'INVALID_REQUEST',
        detail: 'inputs object is required',
      });
      return;
    }

    logger.info('Chain execution request', {
      dmnIds,
      inputCount: Object.keys(inputs).length,
      endpoint: endpoint || 'default',
      isDrd: isDrd || false,
    });

    // Pass DRD parameters to orchestration service
    const result = await orchestrationService.executeChain(
      dmnIds,
      inputs,
      endpoint,
      isDrd,
      drdEntryPointId
    );

    if (!result.success) {
      // The orchestrator resolved rather than threw, but the chain still
      // carries real information -- which steps ran, the outputs so far --
      // alongside the failure. That is kept as the `data` extension member
      // rather than dropped, matching the shape the 200 response uses for
      // the same fields.
      sendProblem(res, req, {
        status: 500,
        title: 'Chain execution failed',
        detail: result.error ?? 'Chain execution failed',
        extensions: {
          data: {
            chainId: result.chainId,
            executionTime: result.executionTime,
            finalOutputs: result.finalOutputs,
            ...(options?.includeIntermediateSteps && { steps: result.steps }),
          },
        },
      });
      return;
    }

    const responseData = {
      success: true as const,
      chainId: result.chainId,
      executionTime: result.executionTime,
      finalOutputs: result.finalOutputs,
      ...(options?.includeIntermediateSteps && { steps: result.steps }),
    };

    res.status(200).json({
      success: true,
      data: responseData,
      timestamp: new Date().toISOString(),
    } as ApiResponse);
  } catch (error: unknown) {
    logger.error('Chain execution error', getErrorDetails(error));

    sendProblem(res, req, {
      status: 500,
      code: 'EXECUTION_ERROR',
      detail: getErrorMessage(error),
    });
  }
});

/**
 * GET /api/chains
 * Discover all available chains
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    logger.info('Chain discovery request');

    // Fetch all pairwise chain links from SPARQL.
    // Each link represents one output-to-input variable connection between two DMNs.
    const links = await sparqlService.findChainLinks();

    interface ChainMapEntry {
      from: string;
      connections: Array<{
        to: string;
        variable: string;
        variableType: string;
      }>;
    }

    // Group links by their source DMN so the response presents each DMN alongside
    // all the downstream DMNs it can feed, rather than a flat list of pairs.
    const chainMap = new Map<string, ChainMapEntry>();

    for (const link of links) {
      if (!chainMap.has(link.from)) {
        chainMap.set(link.from, {
          from: link.from,
          connections: [],
        });
      }

      const chainData = chainMap.get(link.from);
      if (chainData) {
        chainData.connections.push({
          to: link.to,
          variable: link.variable,
          variableType: link.variableType,
        });
      }
    }

    const chains = Array.from(chainMap.values());

    res.json({
      success: true,
      data: {
        total: chains.length,
        chains,
      },
      timestamp: new Date().toISOString(),
    } as ApiResponse);
  } catch (error: unknown) {
    logger.error('Chain discovery error', getErrorDetails(error));

    sendProblem(res, req, {
      status: 500,
      code: 'DISCOVERY_ERROR',
      detail: getErrorMessage(error),
    });
  }
});

export default router;
