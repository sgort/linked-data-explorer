import { Router, Request, Response } from 'express';
import { orchestrationService } from '../services/orchestration.service';
import { sparqlService } from '../services/sparql.service';
import logger from '../utils/logger';
import { ApiResponse, ChainExecutionRequest } from '../types/api.types';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { ChainExecutionResult } from '../types/dmn.types';
import { getErrorMessage, getErrorDetails } from '../utils/errors';

const router = Router();

/**
 * POST /api/chains/execute
 * Execute a chain of DMNs
 */
router.post('/execute', async (req: Request, res: Response) => {
  try {
    const { dmnIds, inputs, options, endpoint }: ChainExecutionRequest = req.body;
    // Validate dmnIds exists and is not empty
    if (!dmnIds || dmnIds.length === 0) {
      // ✅ Now TypeScript knows dmnIds exists after this
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'dmnIds array is required and must not be empty',
        },
        timestamp: new Date().toISOString(),
      } as ApiResponse);
    }

    if (!inputs || Object.keys(inputs).length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'inputs object is required',
        },
        timestamp: new Date().toISOString(),
      } as ApiResponse);
    }

    logger.info('Chain execution request', {
      dmnIds,
      inputCount: Object.keys(inputs).length,
      endpoint: endpoint || 'default',
    });

    // ✅ After the check above, TypeScript knows dmnIds is string[]
    const result = await orchestrationService.executeChain(dmnIds, inputs, endpoint);

    const responseData = {
      success: result.success,
      chainId: result.chainId,
      executionTime: result.executionTime,
      finalOutputs: result.finalOutputs,
      ...(options?.includeIntermediateSteps && { steps: result.steps }),
      ...(result.error && { error: result.error }),
    };

    const statusCode = result.success ? 200 : 500;

    res.status(statusCode).json({
      success: result.success,
      data: responseData,
      timestamp: new Date().toISOString(),
    } as ApiResponse);
  } catch (error: unknown) {
    logger.error('Chain execution error', getErrorDetails(error));

    res.status(500).json({
      success: false,
      error: {
        code: 'EXECUTION_ERROR',
        message: getErrorMessage(error),
      },
      timestamp: new Date().toISOString(),
    } as ApiResponse);
  }
});

/**
 * GET /api/chains
 * Discover all available chains
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    logger.info('Chain discovery request');

    // Get chain links from SPARQL
    const links = await sparqlService.findChainLinks();

    // ✅ Define proper type for chain map entries
    interface ChainMapEntry {
      from: string;
      connections: Array<{
        to: string;
        variable: string;
        variableType: string;
      }>;
    }

    // ✅ Use the type
    const chainMap = new Map<string, ChainMapEntry>();

    for (const link of links) {
      if (!chainMap.has(link.from)) {
        chainMap.set(link.from, {
          from: link.from,
          connections: [],
        });
      }

      // ✅ Type-safe access
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

    res.status(500).json({
      success: false,
      error: {
        code: 'DISCOVERY_ERROR',
        message: getErrorMessage(error),
      },
      timestamp: new Date().toISOString(),
    } as ApiResponse);
  }
});

export default router;
