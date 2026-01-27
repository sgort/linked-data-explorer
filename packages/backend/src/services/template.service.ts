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
   * Get available DMN identifiers for an endpoint
   * Uses sparqlService which has per-endpoint caching (5-minute TTL)
   *
   * @param endpoint - Optional SPARQL endpoint URL
   * @returns Set of DMN identifiers available at that endpoint
   */
  private async getAvailableDmnIds(endpoint?: string): Promise<Set<string>> {
    try {
      // Use sparqlService with endpoint parameter
      // This already has per-endpoint caching built-in!
      const dmns = await sparqlService.getAllDmns(endpoint);
      return new Set(dmns.map((dmn) => dmn.identifier));
    } catch (error) {
      logger.error('Failed to fetch DMN list', {
        error: error instanceof Error ? error.message : 'Unknown error',
        endpoint: endpoint || 'default',
      });
      // Return empty set on error (template filtering will exclude all templates)
      return new Set();
    }
  }

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
   * NEW: Accepts endpoint parameter to filter by available DMNs
   *
   * @param endpoint - Optional SPARQL endpoint URL
   * @returns Array of validated templates
   */
  async getAllTemplates(endpoint?: string): Promise<ChainTemplate[]> {
    logger.info('Fetching all chain templates', {
      ...(endpoint && { endpoint }),
    });

    // Get available DMN IDs for the specified endpoint
    const availableDmnIds = await this.getAvailableDmnIds(endpoint);

    // Validate that DMNs in templates exist
    const validatedTemplates: ChainTemplate[] = [];

    for (const template of this.PREDEFINED_TEMPLATES) {
      // Check if all DMNs in template exist
      const missingDmns = template.dmnIds.filter((dmnId) => !availableDmnIds.has(dmnId));

      if (missingDmns.length > 0) {
        logger.debug('Template skipped - missing DMNs', {
          templateId: template.id,
          missingDmns,
          endpoint: endpoint || 'default',
        });
        continue;
      }

      validatedTemplates.push(template);
    }

    logger.info('Templates fetched', {
      total: this.PREDEFINED_TEMPLATES.length,
      valid: validatedTemplates.length,
      filtered: this.PREDEFINED_TEMPLATES.length - validatedTemplates.length,
      ...(endpoint && { endpoint }),
    });

    return validatedTemplates;
  }

  /**
   * Get template by ID
   * NEW: Accepts endpoint parameter for validation
   *
   * @param id - Template identifier
   * @param endpoint - Optional SPARQL endpoint URL
   * @returns Template or null if not found or invalid for endpoint
   */
  async getTemplateById(id: string, endpoint?: string): Promise<ChainTemplate | null> {
    logger.info('Fetching template by ID', {
      id,
      ...(endpoint && { endpoint }),
    });

    // Get all validated templates for this endpoint
    const templates = await this.getAllTemplates(endpoint);

    // Find the requested template
    const template = templates.find((t) => t.id === id);

    if (!template) {
      logger.warn('Template not found or not valid for endpoint', {
        id,
        endpoint: endpoint || 'default',
      });
      return null;
    }

    return template;
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
   * Clear DMN cache (useful for testing or when DMNs are updated)
   * Now delegates to sparqlService which handles per-endpoint caches
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
