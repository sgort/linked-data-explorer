import { Router, Request, Response } from 'express';
import { orchestrationService } from '../services/orchestration.service';
import { sparqlService } from '../services/sparql.service';
import logger from '../utils/logger';
import { ApiResponse, ChainExecutionRequest } from '../types/api.types';
import { ChainExecutionResult } from '../types/dmn.types';

const router = Router();

/**
 * POST /api/chains/execute
 * Execute a chain of DMNs
 */
router.post('/execute', async (req: Request, res: Response) => {
  try {
    const { dmnIds, inputs, options }: ChainExecutionRequest = req.body;

    if (!dmnIds || dmnIds.length === 0) {
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

    logger.info('Chain execution request', { dmnIds, inputCount: Object.keys(inputs).length });

    // Execute the chain
    const result = await orchestrationService.executeChain(dmnIds, inputs);

    // Filter response based on options
    const responseData: any = {
      success: result.success,
      chainId: result.chainId,
      executionTime: result.executionTime,
      finalOutputs: result.finalOutputs,
    };

    if (options?.includeIntermediateSteps) {
      responseData.steps = result.steps;
    }

    if (result.error) {
      responseData.error = result.error;
    }

    const statusCode = result.success ? 200 : 500;

    res.status(statusCode).json({
      success: result.success,
      data: responseData,
      timestamp: new Date().toISOString(),
    } as ApiResponse<typeof responseData>);
  } catch (error: any) {
    logger.error('Chain execution error', { error: error.message });

    res.status(500).json({
      success: false,
      error: {
        code: 'EXECUTION_ERROR',
        message: error.message,
      },
      timestamp: new Date().toISOString(),
    } as ApiResponse);
  }
});

/**
 * POST /api/chains/execute/heusdenpas
 * Execute the Heusdenpas chain (convenience endpoint)
 */
router.post('/execute/heusdenpas', async (req: Request, res: Response) => {
  try {
    const { inputs, options } = req.body;

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

    logger.info('Heusdenpas chain execution request', {
      inputCount: Object.keys(inputs).length,
    });

    // Execute Heusdenpas chain
    const result = await orchestrationService.executeHeusdenpasChain(inputs);

    // Build response
    const responseData: any = {
      success: result.success,
      chainId: result.chainId,
      executionTime: result.executionTime,
      finalOutputs: result.finalOutputs,
    };

    if (options?.includeIntermediateSteps) {
      responseData.steps = result.steps;
    }

    if (result.error) {
      responseData.error = result.error;
    }

    const statusCode = result.success ? 200 : 500;

    res.status(statusCode).json({
      success: result.success,
      data: responseData,
      timestamp: new Date().toISOString(),
    } as ApiResponse<typeof responseData>);
  } catch (error: any) {
    logger.error('Heusdenpas chain execution error', { error: error.message });

    res.status(500).json({
      success: false,
      error: {
        code: 'EXECUTION_ERROR',
        message: error.message,
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

    // Group links by source DMN
    const chainMap = new Map<string, any>();

    for (const link of links) {
      if (!chainMap.has(link.from)) {
        chainMap.set(link.from, {
          from: link.from,
          connections: [],
        });
      }

      chainMap.get(link.from)!.connections.push({
        to: link.to,
        variable: link.variable,
        variableType: link.variableType,
      });
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
  } catch (error: any) {
    logger.error('Chain discovery error', { error: error.message });

    res.status(500).json({
      success: false,
      error: {
        code: 'DISCOVERY_ERROR',
        message: error.message,
      },
      timestamp: new Date().toISOString(),
    } as ApiResponse);
  }
});

export default router;
