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
   * Fetch all available templates
   */
  async getAllTemplates(): Promise<ChainTemplate[]> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/chains/templates`);
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
   * Fetch templates by category
   */
  async getTemplatesByCategory(category: string): Promise<ChainTemplate[]> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/chains/templates?category=${category}`);
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
   * Fetch a specific template by ID
   */
  async getTemplateById(id: string): Promise<ChainTemplate | null> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/chains/templates/${id}`);
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

  /**
   * Fetch all available categories
   */
  async getCategories(): Promise<string[]> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/chains/templates/categories/list`);
      const data = await response.json();

      if (data.success) {
        return data.data.categories;
      }

      console.error('Failed to fetch categories:', data.error);
      return [];
    } catch (error) {
      console.error('Error fetching categories:', error);
      return [];
    }
  }
}

export const templateService = new TemplateService();
export default templateService;
