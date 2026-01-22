import { SimulationLinkDatum, SimulationNodeDatum } from 'd3';

// SPARQL Response Types
export interface SparqlBinding {
  type: string;
  value: string;
  datatype?: string;
  'xml:lang'?: string;
}

export interface SparqlResultHead {
  vars: string[];
}

export interface SparqlResultResults {
  bindings: Record<string, SparqlBinding>[];
}

export interface SparqlResponse {
  head: SparqlResultHead;
  results: SparqlResultResults;
}

// Graph Visualization Types
export interface GraphNode extends SimulationNodeDatum {
  id: string;
  group: number;
  label: string;
  type: 'uri' | 'literal' | 'bnode';
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
}

export interface GraphLink extends SimulationLinkDatum<GraphNode> {
  source: string | GraphNode;
  target: string | GraphNode;
  predicate: string;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

// App Types
export enum ViewMode {
  QUERY = 'QUERY',
  VISUALIZE = 'VISUALIZE',
  CHANGELOG = 'CHANGELOG',
  ORCHESTRATION = 'ORCHESTRATION',
  TUTORIAL = 'TUTORIAL',
}

export interface EndpointConfig {
  url: string;
  updateUrl?: string;
}

// DMN Orchestration Types
export interface DmnVariable {
  identifier: string;
  title: string;
  type: 'String' | 'Integer' | 'Boolean' | 'Date' | 'Double';
  description?: string;
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
  inputs: DmnVariable[];
  outputs: DmnVariable[];
}

export interface DmnChainLink {
  sourceDmn: string;
  targetDmn: string;
  sourceOutput: string;
  targetInput: string;
  variableId: string;
  variableType: string;
}

export interface DmnChain {
  nodes: DmnModel[];
  links: DmnChainLink[];
}

export interface OrchestrationState {
  dmns: DmnModel[];
  chains: DmnChainLink[];
  selectedDmn: DmnModel | null;
  isLoading: boolean;
  error: string | null;
}

// DMN Chain Execution Types (for backend API responses)
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

/**
 * TriplyDB Asset
 */
export interface TriplyDBAsset {
  id: string;
  name: string;
  url: string;
  size: number;
  contentType: string;
}

/**
 * TriplyDB Assets API Response
 */
export interface TriplyDBAssetsResponse {
  success: boolean;
  assets: TriplyDBAsset[];
  count: number;
}

/**
 * Organization with logo support
 */
export interface Organization {
  uri: string;
  identifier: string;
  name: string;
  homepage?: string;
  logo?: string;
  spatial?: string;
}
