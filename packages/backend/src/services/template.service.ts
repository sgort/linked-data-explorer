import { ChainTemplate } from '../types/template.types';
import logger from '../utils/logger';
import { sparqlService } from './sparql.service';
import testDataConfig from '../../../../testData.json';

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
  // Cache for DMN list (to avoid repeated SPARQL queries)
  private dmnCache: {
    data: Set<string> | null;
    timestamp: number;
  } = {
      data: null,
      timestamp: 0,
    };

  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  /**
   * Get cached DMN identifiers or fetch from SPARQL
   */
  private async getAvailableDmnIds(): Promise<Set<string>> {
    const now = Date.now();

    // Return cached data if still valid
    if (this.dmnCache.data && now - this.dmnCache.timestamp < this.CACHE_TTL) {
      logger.info('Using cached DMN list', {
        age: Math.round((now - this.dmnCache.timestamp) / 1000) + 's',
      });
      return this.dmnCache.data;
    }

    // Fetch fresh data
    logger.info('Fetching fresh DMN list', {
      reason: this.dmnCache.data ? 'cache expired' : 'cache empty',
    });
    const allDmns = await sparqlService.getAllDmns();
    const dmnIds = new Set(allDmns.map((dmn) => dmn.identifier));

    // Update cache
    this.dmnCache = {
      data: dmnIds,
      timestamp: now,
    };

    return dmnIds;
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
        dagVanAanvraag: new Date().toISOString().split('T')[0],  // Always today
      }, tags: ['social', 'benefits', 'municipal', 'heusden'],
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
        dagVanAanvraag: new Date().toISOString().split('T')[0],  // Always today
      }, tags: ['age', 'simple', 'svb'],
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
        dagVanAanvraag: new Date().toISOString().split('T')[0],  // Always today
      }, tags: ['benefits', 'financial', 'svb', 'szw'],
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
   * Future: Can be extended to include user-created templates from database
   */
  async getAllTemplates(): Promise<ChainTemplate[]> {
    logger.info('Fetching all chain templates');

    // Get cached or fresh DMN list (only queries SPARQL once per 5 minutes)
    const availableDmnIds = await this.getAvailableDmnIds();

    // Validate that DMNs in templates exist
    const validatedTemplates: ChainTemplate[] = [];

    for (const template of this.PREDEFINED_TEMPLATES) {
      // Check if all DMNs in template exist (using cached set)
      const missingDmns = template.dmnIds.filter((dmnId) => !availableDmnIds.has(dmnId));

      if (missingDmns.length > 0) {
        logger.warn('Template references missing DMNs', {
          templateId: template.id,
          missingDmns,
        });
        // Skip templates with missing DMNs
        continue;
      }

      validatedTemplates.push(template);
    }

    logger.info('Templates fetched', { count: validatedTemplates.length });

    return validatedTemplates;
  }

  /**
   * Get template by ID
   *
   * @param id - Template identifier
   * @returns Template or null if not found
   */
  async getTemplateById(id: string): Promise<ChainTemplate | null> {
    logger.info('Fetching template by ID', { id });

    const templates = await this.getAllTemplates();
    return templates.find((t) => t.id === id) || null;
  }

  /**
   * Get templates by category
   *
   * @param category - Template category (e.g., 'social', 'financial')
   * @returns Filtered templates
   */
  async getTemplatesByCategory(category: string): Promise<ChainTemplate[]> {
    logger.info('Fetching templates by category', { category });

    const templates = await this.getAllTemplates();
    return templates.filter((t) => t.category === category);
  }

  /**
   * Get templates by tag
   *
   * @param tag - Template tag (e.g., 'benefits', 'municipal')
   * @returns Filtered templates
   */
  async getTemplatesByTag(tag: string): Promise<ChainTemplate[]> {
    logger.info('Fetching templates by tag', { tag });

    const templates = await this.getAllTemplates();
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
   */
  clearCache(): void {
    logger.info('Clearing DMN cache');
    this.dmnCache = {
      data: null,
      timestamp: 0,
    };
  }
}

// Export singleton instance
export const templateService = new TemplateService();
export default templateService;