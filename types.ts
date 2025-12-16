import { SimulationNodeDatum, SimulationLinkDatum } from 'd3';

// SPARQL Response Types
export interface SparqlBinding {
  type: string;
  value: string;
  datatype?: string;
  "xml:lang"?: string;
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
  NL_SEARCH = 'NL_SEARCH'
}

export interface EndpointConfig {
  url: string;
  updateUrl?: string; // Optional for update queries
}