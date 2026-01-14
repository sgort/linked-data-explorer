import { ChainTemplate } from '../types/template.types';
import logger from '../utils/logger';
import { sparqlService } from './sparql.service';

/**
 * Service for managing chain templates
 * Provides predefined and custom chain configurations
 */
export class TemplateService {
  /**
   * Predefined chain templates
   * These represent common government service workflows
   */
  private readonly PREDEFINED_TEMPLATES: ChainTemplate[] = [
    {
      id: 'heusdenpas-full',
      name: 'Heusdenpas Eligibility Check',
      description: 'Complete eligibility determination for Heusden municipal benefits',
      category: 'social',
      dmnIds: [
        'SVB_LeeftijdsInformatie',
        'SZW_BijstandsnormInformatie',
        'RONL_HeusdenpasEindresultaat',
      ],
      defaultInputs: {
        geboortedatumAanvrager: '1975-05-15',
        geboortedatumPartner: '1978-03-22',
        dagVanAanvraag: new Date().toISOString().split('T')[0],
        aanvragerAlleenstaand: false,
        aanvragerHeeftKinderen: true,
        aanvragerHeeftKind4Tm17: true,
        aanvragerInwonerHeusden: true,
        gemeenteCodeWoonplaats: '0794',
        maandelijksBrutoInkomenAanvrager: 1500,
        maandelijksBrutoInkomenPartner: 1200,
        aanvragerUitkeringBaanbrekers: false,
        aanvragerVoedselbankpasDenBosch: false,
        aanvragerKwijtscheldingGemeentelijkeBelastingen: false,
        aanvragerSchuldhulptrajectKredietbankNederland: false,
        aanvragerDitKalenderjaarAlAangevraagd: false,
        aanvragerAanmerkingStudieFinanciering: false,
      },
      tags: ['social', 'benefits', 'municipal', 'heusden'],
      complexity: 'complex',
      estimatedTime: 1100,
      usageCount: 156,
      createdAt: '2026-01-08T10:00:00Z',
      updatedAt: '2026-01-14T14:30:00Z',
      author: 'RONL Team',
      isPublic: true,
    },
    {
      id: 'age-verification',
      name: 'Age Verification Only',
      description: 'Simple age calculation from birth date',
      category: 'social',
      dmnIds: ['SVB_LeeftijdsInformatie'],
      defaultInputs: {
        geboortedatumAanvrager: '1990-06-15',
        dagVanAanvraag: new Date().toISOString().split('T')[0],
      },
      tags: ['age', 'simple', 'svb'],
      complexity: 'simple',
      estimatedTime: 200,
      usageCount: 89,
      createdAt: '2026-01-08T10:00:00Z',
      updatedAt: '2026-01-12T09:15:00Z',
      author: 'RONL Team',
      isPublic: true,
    },
    {
      id: 'benefits-calculation',
      name: 'Social Benefits Calculation',
      description: 'Calculate social assistance amounts (SVB → SZW)',
      category: 'financial',
      dmnIds: ['SVB_LeeftijdsInformatie', 'SZW_BijstandsnormInformatie'],
      defaultInputs: {
        geboortedatumAanvrager: '1985-03-20',
        geboortedatumPartner: null,
        dagVanAanvraag: new Date().toISOString().split('T')[0],
        aanvragerAlleenstaand: true,
        aanvragerHeeftKinderen: false,
        gemeenteCodeWoonplaats: '0794',
        maandelijksBrutoInkomenAanvrager: 800,
      },
      tags: ['benefits', 'financial', 'svb', 'szw'],
      complexity: 'medium',
      estimatedTime: 450,
      usageCount: 67,
      createdAt: '2026-01-09T11:30:00Z',
      updatedAt: '2026-01-13T16:45:00Z',
      author: 'RONL Team',
      isPublic: true,
    },
    {
      id: 'municipal-eligibility',
      name: 'Municipal Benefits Eligibility',
      description: 'Heusden municipal benefits determination (SZW → Heusden)',
      category: 'social',
      dmnIds: ['SZW_BijstandsnormInformatie', 'RONL_HeusdenpasEindresultaat'],
      defaultInputs: {
        aanvragerAlleenstaand: true,
        aanvragerHeeftKinderen: true,
        aanvragerHeeftKind4Tm17: true,
        aanvragerInwonerHeusden: true,
        gemeenteCodeWoonplaats: '0794',
        maandelijksBrutoInkomenAanvrager: 1200,
        aanvragerUitkeringBaanbrekers: false,
        aanvragerVoedselbankpasDenBosch: false,
        aanvragerKwijtscheldingGemeentelijkeBelastingen: false,
        aanvragerSchuldhulptrajectKredietbankNederland: false,
        aanvragerDitKalenderjaarAlAangevraagd: false,
        aanvragerAanmerkingStudieFinanciering: false,
      },
      tags: ['municipal', 'heusden', 'benefits'],
      complexity: 'medium',
      estimatedTime: 650,
      usageCount: 34,
      createdAt: '2026-01-10T14:20:00Z',
      updatedAt: '2026-01-14T10:00:00Z',
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

    // Get all DMNs once (instead of querying for each template DMN)
    const allDmns = await sparqlService.getAllDmns();
    const availableDmnIds = new Set(allDmns.map((dmn) => dmn.identifier));

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
   */
  async getTemplateById(id: string): Promise<ChainTemplate | null> {
    logger.info('Fetching template by ID', { id });

    const templates = await this.getAllTemplates();
    const template = templates.find((t) => t.id === id);

    if (!template) {
      logger.warn('Template not found', { id });
      return null;
    }

    return template;
  }

  /**
   * Get templates by category
   */
  async getTemplatesByCategory(category: string): Promise<ChainTemplate[]> {
    logger.info('Fetching templates by category', { category });

    const templates = await this.getAllTemplates();
    return templates.filter((t) => t.category === category);
  }

  /**
   * Get templates by tag
   */
  async getTemplatesByTag(tag: string): Promise<ChainTemplate[]> {
    logger.info('Fetching templates by tag', { tag });

    const templates = await this.getAllTemplates();
    return templates.filter((t) => t.tags.includes(tag));
  }

  /**
   * Get all unique categories
   */
  async getCategories(): Promise<string[]> {
    const templates = await this.getAllTemplates();
    const categories = new Set(templates.map((t) => t.category));
    return Array.from(categories).sort();
  }

  /**
   * Get all unique tags
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
}

export const templateService = new TemplateService();
export default templateService;
