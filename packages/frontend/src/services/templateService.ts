import { ChainPreset } from '../types/chainBuilder.types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

export interface ChainTemplate extends ChainPreset {
  category: 'social' | 'financial' | 'legal' | 'custom';
  tags: string[];
  complexity: 'simple' | 'medium' | 'complex';
  estimatedTime: number;
  usageCount?: number;
  createdAt: string;
  updatedAt: string;
  author?: string;
  isPublic: boolean;
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

export interface TemplateListResponse {
  total: number;
  templates: ChainTemplate[];
  categories: string[];
}

/**
 * Template Service
 * Handles fetching and managing chain templates from the backend
 */
export class TemplateService {
  /**
   * Fetch all available templates for a specific endpoint
   * NEW: Accepts endpoint parameter
   */
  async getAllTemplates(endpoint?: string): Promise<ChainTemplate[]> {
    try {
      // Build URL with optional endpoint parameter
      const url = endpoint
        ? `${API_BASE_URL}/api/chains/templates?endpoint=${encodeURIComponent(endpoint)}`
        : `${API_BASE_URL}/api/chains/templates`;

      const response = await fetch(url);
      const data = await response.json();

      if (data.success) {
        return data.data.templates;
      }

      console.error('Failed to fetch templates:', data.error);
      return [];
    } catch (error) {
      console.error('Error fetching templates:', error);
      return [];
    }
  }

  /**
   * Fetch templates by category for a specific endpoint
   * NEW: Accepts endpoint parameter
   */
  async getTemplatesByCategory(category: string, endpoint?: string): Promise<ChainTemplate[]> {
    try {
      // Build URL with category and optional endpoint
      const params = new URLSearchParams({ category });
      if (endpoint) {
        params.append('endpoint', endpoint);
      }

      const response = await fetch(`${API_BASE_URL}/api/chains/templates?${params}`);
      const data = await response.json();

      if (data.success) {
        return data.data.templates;
      }

      console.error('Failed to fetch templates by category:', data.error);
      return [];
    } catch (error) {
      console.error('Error fetching templates by category:', error);
      return [];
    }
  }

  /**
   * Fetch a specific template by ID for a specific endpoint
   * NEW: Accepts endpoint parameter
   */
  async getTemplateById(id: string, endpoint?: string): Promise<ChainTemplate | null> {
    try {
      // Build URL with optional endpoint parameter
      const url = endpoint
        ? `${API_BASE_URL}/api/chains/templates/${id}?endpoint=${encodeURIComponent(endpoint)}`
        : `${API_BASE_URL}/api/chains/templates/${id}`;

      const response = await fetch(url);
      const data = await response.json();

      if (data.success) {
        return data.data;
      }

      console.error('Failed to fetch template:', data.error);
      return null;
    } catch (error) {
      console.error('Error fetching template:', error);
      return null;
    }
  }
}

export const templateService = new TemplateService();
export default templateService;
