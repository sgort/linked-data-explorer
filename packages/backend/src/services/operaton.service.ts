import axios, { AxiosInstance } from 'axios';
import { config } from '../utils/config';
import logger from '../utils/logger';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { OperatonEvaluationRequest, OperatonEvaluationResponse } from '../types/dmn.types';
import { getErrorMessage, getErrorDetails, isError } from '../utils/errors';

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
  extractValues(operatonResponse: OperatonEvaluationResponse | OperatonEvaluationResponse[]): Record<string, unknown> {
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
      extractedCount: Object.keys(extracted).length
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
}

export const operatonService = new OperatonService();
export default operatonService;
