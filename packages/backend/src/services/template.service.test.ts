jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
jest.mock('./sparql.service', () => ({
  __esModule: true,
  sparqlService: { clearCache: jest.fn() },
}));

import { sparqlService } from './sparql.service';
import { TemplateService, templateService } from './template.service';
import testData from '../testData.json';

const mockClearCache = sparqlService.clearCache as jest.Mock;

const TEMPLATE_IDS = ['heusdenpas-full', 'age-verification', 'benefits-calculation'];

beforeEach(() => {
  mockClearCache.mockReset();
});

describe('getAllTemplates', () => {
  test('returns every predefined template', async () => {
    const templates = await templateService.getAllTemplates();

    expect(templates.map((t) => t.id)).toEqual(TEMPLATE_IDS);
  });

  test('sources name, description and chain from testData.json rather than hardcoding them', async () => {
    const templates = await templateService.getAllTemplates();

    for (const template of templates) {
      const source = (
        testData as unknown as Record<string, Record<string, Record<string, unknown>>>
      ).chainTemplates[template.id];
      expect(template.name).toBe(source.name);
      expect(template.description).toBe(source.description);
      expect(template.dmnIds).toEqual(source.dmnIds);
    }
  });

  test('stamps dagVanAanvraag with today, so templates never run against a stale date', async () => {
    const today = new Date().toISOString().split('T')[0];

    const templates = await templateService.getAllTemplates();

    for (const template of templates) {
      expect(template.defaultInputs?.dagVanAanvraag).toBe(today);
    }
  });

  test('carries the scenario inputs from testData.json alongside the stamped date', async () => {
    const [heusdenpas] = await templateService.getAllTemplates();
    const source = (
      testData as unknown as Record<string, Record<string, { testInputs: Record<string, unknown> }>>
    ).chainTemplates['heusdenpas-full'].testInputs;

    for (const [key, value] of Object.entries(source)) {
      if (key === 'dagVanAanvraag') continue;
      expect(heusdenpas.defaultInputs?.[key]).toEqual(value);
    }
  });

  test('ignores the endpoint parameter — predefined templates are global', async () => {
    const withEndpoint = await templateService.getAllTemplates('https://triplydb.example/sparql');
    const without = await templateService.getAllTemplates();

    expect(withEndpoint.map((t) => t.id)).toEqual(without.map((t) => t.id));
  });

  test('every template is public and fully described', async () => {
    const templates = await templateService.getAllTemplates();

    for (const template of templates) {
      expect(template.isPublic).toBe(true);
      expect(template.author).toBe('RONL Team');
      expect(template.type).toBe('sequential');
      expect(template.tags.length).toBeGreaterThan(0);
      expect(template.dmnIds.length).toBeGreaterThan(0);
      expect(['simple', 'medium', 'complex']).toContain(template.complexity);
    }
  });
});

describe('getTemplateById', () => {
  test.each(TEMPLATE_IDS)('resolves %s', async (id) => {
    const template = await templateService.getTemplateById(id);

    expect(template?.id).toBe(id);
  });

  test('returns null for an unknown id rather than throwing', async () => {
    await expect(templateService.getTemplateById('nope')).resolves.toBeNull();
  });

  test('accepts but ignores an endpoint override', async () => {
    const template = await templateService.getTemplateById(
      'age-verification',
      'https://triplydb.example/sparql'
    );

    expect(template?.id).toBe('age-verification');
  });
});

describe('getTemplatesByCategory', () => {
  test('returns only the templates in the requested category', async () => {
    const social = await templateService.getTemplatesByCategory('social');

    expect(social.map((t) => t.id)).toEqual(['heusdenpas-full', 'age-verification']);
  });

  test('returns the financial template for its own category', async () => {
    const financial = await templateService.getTemplatesByCategory('financial');

    expect(financial.map((t) => t.id)).toEqual(['benefits-calculation']);
  });

  test('returns an empty list for an unknown category', async () => {
    await expect(templateService.getTemplatesByCategory('nonexistent')).resolves.toEqual([]);
  });

  test('accepts an endpoint override without changing the result', async () => {
    const filtered = await templateService.getTemplatesByCategory(
      'social',
      'https://triplydb.example/sparql'
    );

    expect(filtered).toHaveLength(2);
  });
});

describe('getTemplatesByTag', () => {
  test('matches templates carrying the tag', async () => {
    const benefits = await templateService.getTemplatesByTag('benefits');

    expect(benefits.map((t) => t.id)).toEqual(['heusdenpas-full', 'benefits-calculation']);
  });

  test('matches a tag held by a single template', async () => {
    const heusden = await templateService.getTemplatesByTag('heusden');

    expect(heusden.map((t) => t.id)).toEqual(['heusdenpas-full']);
  });

  test('returns an empty list for an unknown tag', async () => {
    await expect(templateService.getTemplatesByTag('nonexistent')).resolves.toEqual([]);
  });

  test('accepts an endpoint override without changing the result', async () => {
    const tagged = await templateService.getTemplatesByTag(
      'benefits',
      'https://triplydb.example/sparql'
    );

    expect(tagged).toHaveLength(2);
  });
});

describe('getCategories', () => {
  test('returns the distinct categories, sorted', async () => {
    await expect(templateService.getCategories()).resolves.toEqual(['financial', 'social']);
  });
});

describe('getTags', () => {
  test('returns the distinct tags across all templates, sorted', async () => {
    const tags = await templateService.getTags();

    expect(tags).toEqual([...tags].sort());
    expect(new Set(tags).size).toBe(tags.length);
    expect(tags).toEqual(
      expect.arrayContaining(['age', 'benefits', 'financial', 'heusden', 'municipal', 'simple'])
    );
  });
});

describe('incrementUsageCount', () => {
  test('resolves without touching persistent storage yet', async () => {
    await expect(templateService.incrementUsageCount('age-verification')).resolves.toBeUndefined();
  });
});

describe('clearCache', () => {
  test('delegates a scoped clear to the SPARQL service', () => {
    templateService.clearCache('https://triplydb.example/sparql');

    expect(mockClearCache).toHaveBeenCalledWith('https://triplydb.example/sparql');
  });

  test('delegates a full clear to the SPARQL service', () => {
    templateService.clearCache();

    expect(mockClearCache).toHaveBeenCalledWith(undefined);
  });
});

describe('module exports', () => {
  test('the singleton is an instance of TemplateService', () => {
    expect(templateService).toBeInstanceOf(TemplateService);
  });

  test('each instance exposes the same template set', async () => {
    const fresh = new TemplateService();

    await expect(fresh.getAllTemplates()).resolves.toHaveLength(TEMPLATE_IDS.length);
  });
});
