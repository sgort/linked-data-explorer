import { ChainExecutionResult, DmnModel } from './index';

export interface ChainBuilderState {
  availableDmns: DmnModel[];
  selectedChain: string[];
  inputs: Record<string, unknown>;
  executionResult: ChainExecutionResult | null;
  isExecuting: boolean;
  isLoadingDmns: boolean;
}

export interface ChainValidation {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  missingInputs: MissingInput[];
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
}

export interface SavedChain {
  id: string;
  name: string;
  description?: string;
  dmnIds: string[];
  createdAt: string;
  lastUsed?: string;
}
