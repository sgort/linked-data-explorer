import { ChainExecutionResult, DmnModel } from './index';

export interface ChainBuilderState {
  availableDmns: DmnModel[];
  selectedChain: string[];
  inputs: Record<string, unknown>;
  executionResult: ChainExecutionResult | null;
  isExecuting: boolean;
  isLoadingDmns: boolean;
}

export interface RequiredInput {
  identifier: string;
  title: string;
  type: 'String' | 'Integer' | 'Boolean' | 'Date' | 'Double';
  requiredBy: string;
  description?: string;
  testValue?: string | number | boolean;
}

export interface ChainValidation {
  isValid: boolean;
  isDrdCompatible: boolean; // NEW
  errors: ValidationError[];
  warnings: ValidationWarning[];
  semanticMatches: VariableMatch[]; // NEW
  drdIssues: string[]; // NEW
  requiredInputs: RequiredInput[];
  missingInputs: RequiredInput[];
  estimatedTime: number;
}

export interface ValidationError {
  type: 'missing_input' | 'type_mismatch' | 'circular_dependency';
  message: string;
  dmnId?: string;
  variableId?: string;
}

export interface ValidationWarning {
  type: 'unused_output' | 'duplicate_dmn' | 'performance';
  message: string;
  dmnId?: string;
}

export interface MissingInput {
  identifier: string;
  title: string;
  type: string;
  requiredBy: string;
}

export interface ChainPreset {
  id: string;
  name: string;
  description: string;
  dmnIds: string[];
  defaultInputs?: Record<string, unknown>;
  // NEW: DRD-specific fields
  isDrd?: boolean;
  drdDeploymentId?: string;
  drdEntryPointId?: string;
  drdOriginalChain?: string[];
  drdOutputs?: Array<{
    identifier: string;
    title: string;
    type: 'String' | 'Integer' | 'Boolean' | 'Date' | 'Double'; // Use union type
  }>;
}

export interface SavedChain {
  id: string;
  name: string;
  description?: string;
  dmnIds: string[];
  createdAt: string;
  lastUsed?: string;
}

export interface VariableMatch {
  outputDmn: string;
  outputVar: string;
  inputDmn: string;
  inputVar: string;
  matchType: 'exact' | 'semantic';
  semanticConcept?: string;
}
