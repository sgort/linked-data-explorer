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
