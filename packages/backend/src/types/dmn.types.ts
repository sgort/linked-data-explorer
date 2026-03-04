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

  // NEW: Validation metadata (RONL Ontology v1.0)
  validationStatus?: 'validated' | 'in-review' | 'not-validated';
  validatedBy?: string; // Organization URI
  validatedByName?: string; // Organization display name
  validatedAt?: string; // ISO 8601 date
  validationNote?: string; // Optional notes

  // NEW: Vendor implementation count
  vendorCount?: number; // Number of vendor implementations available
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

export interface ConceptInfo {
  uri: string;
  label: string;
  notation?: string;
  variable: {
    uri: string;
    identifier: string;
    type: string;
  };
}

export interface SemanticEquivalence {
  sharedConcept: string; // The skos:exactMatch URI
  concept1: ConceptInfo;
  concept2: ConceptInfo;
  dmn1: {
    uri: string;
    title: string;
  };
  dmn2: {
    uri: string;
    title: string;
  };
}

export interface EnhancedChainLink {
  dmn1: {
    uri: string;
    identifier: string;
    title: string;
  };
  dmn2: {
    uri: string;
    identifier: string;
    title: string;
  };
  outputVariable: string;
  inputVariable: string;
  variableType: string;
  matchType: 'exact' | 'semantic';
  sharedConcept: string;
}

export interface ChainCycle {
  path: Array<{ uri: string; title: string }>;
  type: 'three-hop' | 'four-hop';
}
