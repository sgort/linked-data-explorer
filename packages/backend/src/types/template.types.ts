/**
 * Chain Template type definitions
 */

export interface ChainTemplate {
  id: string;
  name: string;
  description: string;
  type: 'sequential' | 'drd'; // NEW: Distinguish between semantic chains and DRDs
  category: 'social' | 'financial' | 'legal' | 'custom';
  dmnIds: string[]; // For sequential chains
  drdId?: string; // For DRD templates (entry point identifier)
  drdDeploymentId?: string; // For DRD templates (Operaton deployment)
  defaultInputs?: Record<string, unknown>;
  tags: string[];
  complexity: 'simple' | 'medium' | 'complex';
  estimatedTime: number; // milliseconds
  usageCount?: number;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  author?: string;
  isPublic: boolean;
}

export interface ChainTemplateListResponse {
  total: number;
  templates: ChainTemplate[];
  categories: string[];
}

export interface ChainTemplateRequest {
  name: string;
  description: string;
  category: 'social' | 'financial' | 'legal' | 'custom';
  dmnIds: string[];
  defaultInputs?: Record<string, unknown>;
  tags?: string[];
}
