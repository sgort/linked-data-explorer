import { ChainTemplate } from '../types/template.types';
import logger from '../utils/logger';
import { sparqlService } from './sparql.service';
import testDataConfig from '../testData.json';

// Inline type definitions (to avoid rootDir issues)
interface DmnTestInputs {
  [key: string]: string | number | boolean | null;
}

interface ChainTemplateConfig {
  name: string;
  description: string;
  dmnIds: string[];
  scenario: string;
  testInputs: DmnTestInputs;
}

interface TestDataConfig {
  dmnTestData: {
    [dmnId: string]: {
      description: string;
      defaultInputs: DmnTestInputs;
    };
  };
  chainTemplates: {
    [templateId: string]: ChainTemplateConfig;
  };
}

// Type assertion for imported JSON
const typedTestData = testDataConfig as TestDataConfig;

/**
 * Service for managing chain templates
 * Provides predefined and custom chain configurations
 */
export class TemplateService {
  // No cache needed - we use sparqlService's per-endpoint cache

  /**
   * Predefined chain templates
   * Default inputs loaded from shared testData.json
   */
  private readonly PREDEFINED_TEMPLATES: ChainTemplate[] = [
    {
      id: 'heusdenpas-full',
      name: typedTestData.chainTemplates['heusdenpas-full'].name,
      description: typedTestData.chainTemplates['heusdenpas-full'].description,
      category: 'social',
      dmnIds: typedTestData.chainTemplates['heusdenpas-full'].dmnIds,
      defaultInputs: {
        ...typedTestData.chainTemplates['heusdenpas-full'].testInputs,
        dagVanAanvraag: new Date().toISOString().split('T')[0], // Always today
      },
      tags: ['social', 'benefits', 'municipal', 'heusden'],
      complexity: 'complex',
      estimatedTime: 1100,
      usageCount: 156,
      createdAt: '2026-01-08T10:00:00Z',
      updatedAt: new Date().toISOString(),
      author: 'RONL Team',
      isPublic: true,
    },
    {
      id: 'age-verification',
      name: typedTestData.chainTemplates['age-verification'].name,
      description: typedTestData.chainTemplates['age-verification'].description,
      category: 'social',
      dmnIds: typedTestData.chainTemplates['age-verification'].dmnIds,
      defaultInputs: {
        ...typedTestData.chainTemplates['age-verification'].testInputs,
        dagVanAanvraag: new Date().toISOString().split('T')[0], // Always today
      },
      tags: ['age', 'simple', 'svb'],
      complexity: 'simple',
      estimatedTime: 200,
      usageCount: 89,
      createdAt: '2026-01-08T10:00:00Z',
      updatedAt: new Date().toISOString(),
      author: 'RONL Team',
      isPublic: true,
    },
    {
      id: 'benefits-calculation',
      name: typedTestData.chainTemplates['benefits-calculation'].name,
      description: typedTestData.chainTemplates['benefits-calculation'].description,
      category: 'financial',
      dmnIds: typedTestData.chainTemplates['benefits-calculation'].dmnIds,
      defaultInputs: {
        ...typedTestData.chainTemplates['benefits-calculation'].testInputs,
        dagVanAanvraag: new Date().toISOString().split('T')[0], // Always today
      },
      tags: ['benefits', 'financial', 'svb', 'szw'],
      complexity: 'medium',
      estimatedTime: 450,
      usageCount: 67,
      createdAt: '2026-01-09T11:30:00Z',
      updatedAt: new Date().toISOString(),
      author: 'RONL Team',
      isPublic: true,
    },
  ];

  /**
   * Get all available templates
   * Returns predefined templates (hardcoded in testData.json)
   *
   * @param endpoint - Optional SPARQL endpoint URL (reserved for future DB-backed templates)
   * @returns Array of predefined templates
   */
  async getAllTemplates(endpoint?: string): Promise<ChainTemplate[]> {
    logger.info('Fetching all chain templates', {
      ...(endpoint && { endpoint: 'parameter-ignored-for-predefined-templates' }),
    });

    // Return all predefined templates
    // NOTE: endpoint parameter kept for future when templates are stored in database
    // For now, predefined templates are global and not filtered by endpoint
    logger.info('Templates fetched', {
      count: this.PREDEFINED_TEMPLATES.length,
      source: 'predefined',
    });

    return this.PREDEFINED_TEMPLATES;
  }

  /**
   * Get template by ID
   *
   * @param id - Template identifier
   * @param endpoint - Optional SPARQL endpoint URL (reserved for future)
   * @returns Template or null if not found
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getTemplateById(id: string, endpoint?: string): Promise<ChainTemplate | null> {
    logger.info('Fetching template by ID', { id });

    // Get all templates (endpoint ignored for predefined templates)
    const templates = await this.getAllTemplates();
    return templates.find((t) => t.id === id) || null;
  }

  /**
   * Get templates by category
   * NEW: Accepts endpoint parameter
   *
   * @param category - Template category (e.g., 'social', 'financial')
   * @param endpoint - Optional SPARQL endpoint URL
   * @returns Filtered templates valid for the endpoint
   */
  async getTemplatesByCategory(category: string, endpoint?: string): Promise<ChainTemplate[]> {
    logger.info('Fetching templates by category', {
      category,
      ...(endpoint && { endpoint }),
    });

    const templates = await this.getAllTemplates(endpoint);
    return templates.filter((t) => t.category === category);
  }

  /**
   * Get templates by tag
   * NEW: Accepts endpoint parameter
   *
   * @param tag - Template tag (e.g., 'benefits', 'municipal')
   * @param endpoint - Optional SPARQL endpoint URL
   * @returns Filtered templates valid for the endpoint
   */
  async getTemplatesByTag(tag: string, endpoint?: string): Promise<ChainTemplate[]> {
    logger.info('Fetching templates by tag', {
      tag,
      ...(endpoint && { endpoint }),
    });

    const templates = await this.getAllTemplates(endpoint);
    return templates.filter((t) => t.tags.includes(tag));
  }
  /**
   * Get all unique categories
   *
   * @returns Array of category names
   */
  async getCategories(): Promise<string[]> {
    const templates = await this.getAllTemplates();
    const categories = new Set(templates.map((t) => t.category));
    return Array.from(categories).sort();
  }

  /**
   * Get all unique tags
   *
   * @returns Array of tag names
   */
  async getTags(): Promise<string[]> {
    const templates = await this.getAllTemplates();
    const tags = new Set(templates.flatMap((t) => t.tags));
    return Array.from(tags).sort();
  }

  /**
   * Increment usage count for a template
   * Future: Persist to database
   */
  async incrementUsageCount(id: string): Promise<void> {
    logger.info('Incrementing template usage count', { id });
    // For now, this is in-memory only
    // Future: Update database
  }

  /**
   * Clear DMN cache
   * Delegates to sparqlService which handles per-endpoint caches
   *
   * @param endpoint - Optional endpoint to clear, or clear all if not provided
   */
  clearCache(endpoint?: string): void {
    logger.info('Clearing DMN cache', {
      ...(endpoint ? { endpoint } : { scope: 'all' }),
    });
    sparqlService.clearCache(endpoint);
  }
}

// Export singleton instance
export const templateService = new TemplateService();
export default templateService;
