import express from 'express';
import request from 'supertest';

jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
jest.mock('../services/template.service', () => ({
  __esModule: true,
  templateService: {
    getAllTemplates: jest.fn(),
    getTemplatesByCategory: jest.fn(),
    getTemplatesByTag: jest.fn(),
    getTemplateById: jest.fn(),
    incrementUsageCount: jest.fn(),
    getCategories: jest.fn(),
    getTags: jest.fn(),
  },
}));

import { templateService } from '../services/template.service';
import templateRoutes from './template.routes';
import { versionMiddleware } from '../middleware/version.middleware';
import { expectToMatchOperation } from '../openapi/testing/conformance';

const svc = templateService as unknown as Record<string, jest.Mock>;

function makeApp() {
  const app = express();
  app.use('/v1/chains/templates', templateRoutes);
  return app;
}

const TEMPLATES = [
  { id: 't1', name: 'Zorgtoeslag', category: 'toeslagen', tags: ['zorg'] },
  { id: 't2', name: 'Huurtoeslag', category: 'toeslagen', tags: ['huur'] },
  { id: 't3', name: 'Kapvergunning', category: 'vergunningen', tags: ['groen'] },
];

beforeEach(() => {
  for (const fn of Object.values(svc)) fn.mockReset();
  svc.incrementUsageCount.mockResolvedValue(undefined);
});

describe('GET /v1/chains/templates', () => {
  test('lists every template with a total and the derived category list', async () => {
    svc.getAllTemplates.mockResolvedValue(TEMPLATES);

    const res = await request(makeApp()).get('/v1/chains/templates');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual({
      total: 3,
      templates: TEMPLATES,
      categories: ['toeslagen', 'vergunningen'],
    });
  });

  test('derives categories de-duplicated and sorted, from the templates actually returned', async () => {
    svc.getAllTemplates.mockResolvedValue([
      { id: 'a', category: 'z-laatste' },
      { id: 'b', category: 'a-eerste' },
      { id: 'c', category: 'a-eerste' },
    ]);

    const res = await request(makeApp()).get('/v1/chains/templates');

    expect(res.body.data.categories).toEqual(['a-eerste', 'z-laatste']);
  });

  test('filters by category when the category param is given', async () => {
    svc.getTemplatesByCategory.mockResolvedValue([TEMPLATES[2]]);

    const res = await request(makeApp())
      .get('/v1/chains/templates')
      .query({ category: 'vergunningen' });

    expect(res.body.data.total).toBe(1);
    expect(svc.getTemplatesByCategory).toHaveBeenCalledWith('vergunningen', undefined);
    expect(svc.getAllTemplates).not.toHaveBeenCalled();
  });

  test('filters by tag when only the tag param is given', async () => {
    svc.getTemplatesByTag.mockResolvedValue([TEMPLATES[0]]);

    await request(makeApp()).get('/v1/chains/templates').query({ tag: 'zorg' });

    expect(svc.getTemplatesByTag).toHaveBeenCalledWith('zorg', undefined);
    expect(svc.getAllTemplates).not.toHaveBeenCalled();
  });

  test('category wins over tag when both are given', async () => {
    svc.getTemplatesByCategory.mockResolvedValue([]);

    await request(makeApp())
      .get('/v1/chains/templates')
      .query({ category: 'toeslagen', tag: 'zorg' });

    expect(svc.getTemplatesByCategory).toHaveBeenCalled();
    expect(svc.getTemplatesByTag).not.toHaveBeenCalled();
  });

  test('forwards the endpoint override to whichever lookup runs', async () => {
    svc.getAllTemplates.mockResolvedValue([]);
    svc.getTemplatesByCategory.mockResolvedValue([]);
    svc.getTemplatesByTag.mockResolvedValue([]);
    const endpoint = 'https://triplydb.example/sparql';
    const app = makeApp();

    await request(app).get('/v1/chains/templates').query({ endpoint });
    await request(app).get('/v1/chains/templates').query({ endpoint, category: 'toeslagen' });
    await request(app).get('/v1/chains/templates').query({ endpoint, tag: 'zorg' });

    expect(svc.getAllTemplates).toHaveBeenCalledWith(endpoint);
    expect(svc.getTemplatesByCategory).toHaveBeenCalledWith('toeslagen', endpoint);
    expect(svc.getTemplatesByTag).toHaveBeenCalledWith('zorg', endpoint);
  });

  test('returns 500 with a QUERY_ERROR code when the lookup throws', async () => {
    svc.getAllTemplates.mockRejectedValue(new Error('SPARQL timeout'));

    const res = await request(makeApp()).get('/v1/chains/templates');

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      success: false,
      error: { code: 'QUERY_ERROR', message: 'SPARQL timeout' },
    });
  });
});

describe('GET /v1/chains/templates/:id', () => {
  test('returns the template and counts the usage', async () => {
    svc.getTemplateById.mockResolvedValue(TEMPLATES[0]);

    const res = await request(makeApp()).get('/v1/chains/templates/t1');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(TEMPLATES[0]);
    expect(svc.getTemplateById).toHaveBeenCalledWith('t1', undefined);
    expect(svc.incrementUsageCount).toHaveBeenCalledWith('t1');
  });

  test('forwards the endpoint override so validity can be checked against it', async () => {
    svc.getTemplateById.mockResolvedValue(TEMPLATES[0]);

    await request(makeApp())
      .get('/v1/chains/templates/t1')
      .query({ endpoint: 'https://triplydb.example/sparql' });

    expect(svc.getTemplateById).toHaveBeenCalledWith('t1', 'https://triplydb.example/sparql');
  });

  test('returns 404 and skips the usage count when the template is unknown', async () => {
    svc.getTemplateById.mockResolvedValue(null);

    const res = await request(makeApp()).get('/v1/chains/templates/nope');

    expect(res.status).toBe(404);
    expect(res.body.error).toEqual({
      code: 'NOT_FOUND',
      message: 'Template not found or not valid for endpoint: nope',
    });
    expect(svc.incrementUsageCount).not.toHaveBeenCalled();
  });

  test('returns 500 with a QUERY_ERROR code when the lookup throws', async () => {
    svc.getTemplateById.mockRejectedValue(new Error('SPARQL timeout'));

    const res = await request(makeApp()).get('/v1/chains/templates/t1');

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('QUERY_ERROR');
  });
});

describe('GET /v1/chains/templates/categories/list', () => {
  test('returns the categories with a total', async () => {
    svc.getCategories.mockResolvedValue(['toeslagen', 'vergunningen']);

    const res = await request(makeApp()).get('/v1/chains/templates/categories/list');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ categories: ['toeslagen', 'vergunningen'], total: 2 });
  });

  test('is not shadowed by the /:id route', async () => {
    svc.getCategories.mockResolvedValue([]);

    await request(makeApp()).get('/v1/chains/templates/categories/list');

    expect(svc.getTemplateById).not.toHaveBeenCalled();
  });

  test('returns 500 with a QUERY_ERROR code when the lookup throws', async () => {
    svc.getCategories.mockRejectedValue(new Error('SPARQL timeout'));

    const res = await request(makeApp()).get('/v1/chains/templates/categories/list');

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('QUERY_ERROR');
  });
});

describe('GET /v1/chains/templates/tags/list', () => {
  test('returns the tags with a total', async () => {
    svc.getTags.mockResolvedValue(['zorg', 'huur', 'groen']);

    const res = await request(makeApp()).get('/v1/chains/templates/tags/list');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ tags: ['zorg', 'huur', 'groen'], total: 3 });
  });

  test('returns 500 with a QUERY_ERROR code when the lookup throws', async () => {
    svc.getTags.mockRejectedValue(new Error('SPARQL timeout'));

    const res = await request(makeApp()).get('/v1/chains/templates/tags/list');

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('QUERY_ERROR');
  });
});

describe('/v1/chains/templates matches its OpenAPI description', () => {
  function makeDocumentedApp() {
    const app = express();
    app.use(versionMiddleware); // app-wide in index.ts
    app.use('/v1/chains/templates', templateRoutes);
    return app;
  }

  const get = (path: string) => request(makeDocumentedApp()).get(`/v1/chains/templates${path}`);

  // Exercises every value of ChainTemplate's enums (type, category,
  // complexity) and both presence and absence of its optional fields
  // (defaultInputs, drdId, drdDeploymentId, usageCount, author), so a
  // schema that narrowed any of those would fail this test even though
  // today's three real predefined templates never populate drd/legal/custom.
  const FULL_TEMPLATE = {
    id: 'heusdenpas-full',
    name: 'Heusdenpas volledige aanvraag',
    description: 'Full chain for a Heusdenpas application.',
    type: 'sequential',
    category: 'social',
    dmnIds: ['dmn-1', 'dmn-2'],
    defaultInputs: {
      dagVanAanvraag: '2026-09-16',
      inkomen: 2100,
      heeftPartner: true,
      opmerking: null,
    },
    tags: ['social', 'benefits', 'municipal'],
    complexity: 'simple',
    estimatedTime: 1100,
    usageCount: 156,
    createdAt: '2026-01-08T10:00:00Z',
    updatedAt: '2026-01-08T10:00:00Z',
    author: 'RONL Team',
    isPublic: true,
  };

  const DRD_TEMPLATE = {
    id: 'drd-template',
    name: 'DRD template',
    description: 'A DRD-based template.',
    type: 'drd',
    category: 'legal',
    dmnIds: [],
    drdId: 'entry-point-1',
    drdDeploymentId: 'deployment-1',
    tags: ['legal'],
    complexity: 'complex',
    estimatedTime: 500,
    createdAt: '2026-02-01T09:00:00Z',
    updatedAt: '2026-02-01T09:00:00Z',
    isPublic: false,
  };

  const FINANCIAL_TEMPLATE = {
    id: 'benefits-calculation',
    name: 'Benefits calculation',
    description: 'Calculates a benefit amount.',
    type: 'sequential',
    category: 'financial',
    dmnIds: ['dmn-3'],
    tags: ['benefits', 'financial'],
    complexity: 'medium',
    estimatedTime: 450,
    createdAt: '2026-01-09T11:30:00Z',
    updatedAt: '2026-01-09T11:30:00Z',
    isPublic: true,
  };

  const CUSTOM_TEMPLATE = {
    id: 'custom-template',
    name: 'Custom template',
    description: 'A custom-category template.',
    type: 'sequential',
    category: 'custom',
    dmnIds: ['dmn-4'],
    tags: ['custom'],
    complexity: 'simple',
    estimatedTime: 300,
    createdAt: '2026-03-01T08:00:00Z',
    updatedAt: '2026-03-01T08:00:00Z',
    isPublic: true,
  };

  test('GET / 200, as documented', async () => {
    svc.getAllTemplates.mockResolvedValue([
      FULL_TEMPLATE,
      DRD_TEMPLATE,
      FINANCIAL_TEMPLATE,
      CUSTOM_TEMPLATE,
    ]);

    const res = await get('/');

    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'get', '/chains/templates');
  });

  test('GET / 200 filtered by category, as documented', async () => {
    svc.getTemplatesByCategory.mockResolvedValue([FINANCIAL_TEMPLATE]);

    const res = await get('/').query({ category: 'financial' });

    expect(res.status).toBe(200);
    expect(res.body.data.templates).toEqual([FINANCIAL_TEMPLATE]);
    expectToMatchOperation(res, 'get', '/chains/templates');
  });

  test('GET / 500, as documented', async () => {
    svc.getAllTemplates.mockRejectedValue(new Error('SPARQL timeout'));

    const res = await get('/');

    expect(res.status).toBe(500);
    expectToMatchOperation(res, 'get', '/chains/templates');
  });

  test('GET /:id 200, as documented', async () => {
    svc.getTemplateById.mockResolvedValue(DRD_TEMPLATE);

    const res = await get('/drd-template');

    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'get', '/chains/templates/{id}');
  });

  test('GET /:id 404, as documented', async () => {
    svc.getTemplateById.mockResolvedValue(null);

    const res = await get('/nope');

    expect(res.status).toBe(404);
    expectToMatchOperation(res, 'get', '/chains/templates/{id}');
  });

  test('GET /:id 500, as documented', async () => {
    svc.getTemplateById.mockRejectedValue(new Error('SPARQL timeout'));

    const res = await get('/heusdenpas-full');

    expect(res.status).toBe(500);
    expectToMatchOperation(res, 'get', '/chains/templates/{id}');
  });

  test('GET /categories/list 200, as documented', async () => {
    svc.getCategories.mockResolvedValue(['social', 'financial', 'legal', 'custom']);

    const res = await get('/categories/list');

    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'get', '/chains/templates/categories/list');
  });

  test('GET /categories/list 500, as documented', async () => {
    svc.getCategories.mockRejectedValue(new Error('SPARQL timeout'));

    const res = await get('/categories/list');

    expect(res.status).toBe(500);
    expectToMatchOperation(res, 'get', '/chains/templates/categories/list');
  });

  test('GET /tags/list 200, as documented', async () => {
    svc.getTags.mockResolvedValue(['social', 'benefits', 'municipal', 'legal']);

    const res = await get('/tags/list');

    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'get', '/chains/templates/tags/list');
  });

  test('GET /tags/list 500, as documented', async () => {
    svc.getTags.mockRejectedValue(new Error('SPARQL timeout'));

    const res = await get('/tags/list');

    expect(res.status).toBe(500);
    expectToMatchOperation(res, 'get', '/chains/templates/tags/list');
  });
});
