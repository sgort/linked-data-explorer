/**
 * Core DMN and Chain type definitions
 */

export interface DmnVariable {
  identifier: string;
  title: string;
  type: 'String' | 'Integer' | 'Boolean' | 'Date' | 'Double';
  description?: string;
  value?: unknown;
  testValue?: string | number | boolean;
}

export interface DmnModel {
  id: string;
  identifier: string;
  title: string;
  description?: string;
  deploymentId?: string;
  deployedAt?: string;
  implementedBy?: string;
  lastTested?: string;
  testStatus?: 'passed' | 'failed' | 'pending';
  service?: string; // NEW: Service URI
  serviceTitle?: string; // NEW: Service display name
  organization?: string; // NEW: Organization URI
  organizationName?: string; // NEW: Organization display name
  logoUrl?: string; // NEW: Full logo URL (resolved with version ID)
  inputs: DmnVariable[];
  outputs: DmnVariable[];
}

export interface ChainLink {
  from: string; // DMN identifier
  to: string; // DMN identifier
  variable: string; // Variable that connects them
  variableType: string;
}

export interface DmnChain {
  id: string;
  name: string;
  description?: string;
  dmns: DmnModel[];
  links: ChainLink[];
  estimatedExecutionTime?: number;
  complexity: 'simple' | 'medium' | 'complex';
}

export interface ExecutionStep {
  dmnId: string;
  dmnTitle: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  inputs: Record<string, unknown>;
  outputs?: Record<string, unknown>;
  error?: string;
}

export interface ChainExecutionResult {
  success: boolean;
  chainId: string;
  executionTime: number;
  steps: ExecutionStep[];
  finalOutputs: Record<string, unknown>;
  error?: string;
}

export interface OperatonEvaluationRequest {
  variables: Record<string, { value: unknown; type: string }>;
}

export interface OperatonEvaluationResponse {
  [key: string]: {
    value: unknown;
    type: string;
  };
}
