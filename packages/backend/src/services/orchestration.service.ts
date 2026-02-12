import { DmnModel, ChainExecutionResult, ExecutionStep } from '../types/dmn.types';
import { operatonService } from './operaton.service';
import { sparqlService } from './sparql.service';
import logger from '../utils/logger';
import { getErrorMessage, getErrorDetails } from '../utils/errors';

/**
 * Service for orchestrating DMN chain execution
 * Replicates the BPMN sequential execution pattern
 */
export class OrchestrationService {
  /**
   * Execute a chain of DMNs sequentially
   * Each DMN's outputs become inputs for the next DMN
   *
   * @param dmnIdentifiers - Array of DMN identifiers to execute in order
   * @param initialInputs - Initial input variables
   * @param endpoint - Optional TriplyDB endpoint for DMN lookup
   * @returns Chain execution result
   */
  async executeChain(
    dmnIdentifiers: string[],
    initialInputs: Record<string, unknown>,
    endpoint?: string,
    isDrd?: boolean, // NEW parameter
    drdEntryPointId?: string // NEW parameter
  ): Promise<ChainExecutionResult> {
    // NEW: Handle DRD execution directly via Operaton
    if (isDrd && drdEntryPointId) {
      const startTime = Date.now();
      logger.info('Executing DRD via Operaton', { drdEntryPointId });

      try {
        const result = await operatonService.evaluateDecision(drdEntryPointId, initialInputs);
        const outputs = operatonService.extractValues(result);
        const duration = Date.now() - startTime;

        logger.info('DRD execution completed', { duration, outputs: Object.keys(outputs) });

        return {
          success: true,
          chainId: `DRD:${drdEntryPointId}`,
          executionTime: duration,
          steps: [
            {
              dmnId: drdEntryPointId,
              dmnTitle: `DRD (${dmnIdentifiers.length} decisions)`,
              startTime,
              endTime: Date.now(),
              duration,
              inputs: initialInputs,
              outputs,
            },
          ],
          finalOutputs: outputs,
        };
      } catch (error: unknown) {
        const duration = Date.now() - startTime;
        logger.error('DRD execution failed', getErrorDetails(error));

        return {
          success: false,
          chainId: `DRD:${drdEntryPointId}`,
          executionTime: duration,
          steps: [],
          finalOutputs: {},
          error: getErrorMessage(error),
        };
      }
    }
    const chainStartTime = Date.now();
    const steps: ExecutionStep[] = [];
    let currentVariables = { ...initialInputs };

    logger.info('Starting chain execution', {
      chain: dmnIdentifiers,
      inputs: Object.keys(initialInputs),
      endpoint: endpoint || 'default',
    });

    try {
      // Get DMN models for validation
      const dmnModels: DmnModel[] = [];
      for (const identifier of dmnIdentifiers) {
        const dmn = await sparqlService.getDmnByIdentifier(identifier, endpoint);
        if (!dmn) {
          throw new Error(`DMN not found: ${identifier}`);
        }
        dmnModels.push(dmn);
      }

      // Execute each DMN in sequence
      for (let i = 0; i < dmnModels.length; i++) {
        const dmn = dmnModels[i];
        const stepStartTime = Date.now();

        logger.info(`Executing DMN ${i + 1}/${dmnModels.length}: ${dmn.identifier}`);

        const step: ExecutionStep = {
          dmnId: dmn.identifier,
          dmnTitle: dmn.title,
          startTime: stepStartTime,
          inputs: { ...currentVariables },
        };

        try {
          // Execute DMN via Operaton
          const operatonResponse = await operatonService.evaluateDecision(
            dmn.identifier,
            currentVariables
          );

          // Extract plain values from Operaton response
          const outputs = operatonService.extractValues(operatonResponse);

          step.outputs = outputs;
          step.endTime = Date.now();
          step.duration = step.endTime - stepStartTime;

          logger.info(`DMN completed: ${dmn.identifier}`, {
            duration: step.duration,
            outputs: Object.keys(outputs),
          });

          // Flatten/merge outputs into current variables (like BPMN script task)
          currentVariables = { ...currentVariables, ...outputs };
        } catch (error: unknown) {
          // ✅ Changed from any
          step.error = getErrorMessage(error); // ✅ Use helper
          step.endTime = Date.now();
          step.duration = step.endTime - stepStartTime;

          logger.error(`DMN execution failed: ${dmn.identifier}`, getErrorDetails(error)); // ✅ Use helper
          throw error;
        }

        steps.push(step);
      }

      const chainEndTime = Date.now();
      const totalDuration = chainEndTime - chainStartTime;

      logger.info('Chain execution completed', {
        duration: totalDuration,
        steps: steps.length,
      });

      return {
        success: true,
        chainId: dmnIdentifiers.join('->'),
        executionTime: totalDuration,
        steps,
        finalOutputs: currentVariables,
      };
    } catch (error: unknown) {
      // ✅ Changed from any
      const chainEndTime = Date.now();
      const totalDuration = chainEndTime - chainStartTime;

      logger.error('Chain execution failed', {
        ...getErrorDetails(error), // ✅ Use helper
        duration: totalDuration,
      });

      return {
        success: false,
        chainId: dmnIdentifiers.join('->'),
        executionTime: totalDuration,
        steps,
        finalOutputs: currentVariables,
        error: getErrorMessage(error), // ✅ Use helper
      };
    }
  }

  /**
   * Execute the Heusdenpas chain (SVB → SZW → Heusden)
   * This is a convenience method for the production chain
   */
  async executeHeusdenpasChain(inputs: Record<string, unknown>): Promise<ChainExecutionResult> {
    // ✅ Changed from any
    const chain = [
      'SVB_LeeftijdsInformatie',
      'SZW_BijstandsnormInformatie',
      'RONL_HeusdenpasEindresultaat',
    ];

    logger.info('Executing Heusdenpas chain', { inputs: Object.keys(inputs) });

    return this.executeChain(chain, inputs);
  }

  /**
   * Validate that inputs match required variables for a chain
   */
  validateChainInputs(
    dmns: DmnModel[],
    inputs: Record<string, unknown> // ✅ Changed from any
  ): { valid: boolean; missingInputs: string[]; errors: string[] } {
    const errors: string[] = [];
    const requiredInputs = new Set<string>();

    // Collect all required inputs from the first DMN
    // (subsequent DMNs get their inputs from previous outputs)
    if (dmns.length > 0) {
      const firstDmn = dmns[0];
      firstDmn.inputs.forEach((input) => {
        requiredInputs.add(input.identifier);
      });
    }

    // Check which required inputs are missing
    const missingInputs = Array.from(requiredInputs).filter((input) => !(input in inputs));

    if (missingInputs.length > 0) {
      errors.push(`Missing required inputs: ${missingInputs.join(', ')}`);
    }

    // Check for type mismatches (basic validation)
    for (const [key, value] of Object.entries(inputs)) {
      if (value === null || value === undefined) continue;

      const expectedType = dmns[0]?.inputs.find((i) => i.identifier === key)?.type;
      if (!expectedType) continue;

      const actualType = typeof value;
      const typeMatches =
        (expectedType === 'String' && actualType === 'string') ||
        (expectedType === 'Integer' && actualType === 'number' && Number.isInteger(value)) ||
        (expectedType === 'Boolean' && actualType === 'boolean') ||
        (expectedType === 'Double' && actualType === 'number');

      if (!typeMatches) {
        errors.push(`Type mismatch for ${key}: expected ${expectedType}, got ${actualType}`);
      }
    }

    return {
      valid: errors.length === 0,
      missingInputs,
      errors,
    };
  }
}

export const orchestrationService = new OrchestrationService();
export default orchestrationService;
