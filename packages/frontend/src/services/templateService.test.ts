import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest';

import { ChainTemplate, templateService } from './templateService';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function chainTemplate(overrides: Partial<ChainTemplate> = {}): ChainTemplate {
  return {
    id: 't1',
    name: 'Age verification',
    type: 'sequential',
    category: 'social',
    tags: [],
    complexity: 'simple',
    estimatedTime: 5,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    isPublic: true,
    ...overrides,
  } as ChainTemplate;
}

describe('templateService.getAllTemplates', () => {
  test('returns the template list on success', async () => {
    server.use(
      http.get('*/api/chains/templates', () =>
        HttpResponse.json({
          success: true,
          data: { templates: [chainTemplate()], total: 1, categories: [] },
        })
      )
    );
    expect(await templateService.getAllTemplates()).toEqual([chainTemplate()]);
  });

  test('passes the endpoint as a query param when provided', async () => {
    let url = '';
    server.use(
      http.get('*/api/chains/templates', ({ request }) => {
        url = request.url;
        return HttpResponse.json({
          success: true,
          data: { templates: [], total: 0, categories: [] },
        });
      })
    );
    await templateService.getAllTemplates('https://example.com/sparql');
    expect(url).toContain(`endpoint=${encodeURIComponent('https://example.com/sparql')}`);
  });

  test('returns [] when the backend reports success: false', async () => {
    server.use(
      http.get('*/api/chains/templates', () => HttpResponse.json({ success: false, error: 'boom' }))
    );
    expect(await templateService.getAllTemplates()).toEqual([]);
  });

  test('returns [] (not a throw) when the request fails outright', async () => {
    server.use(http.get('*/api/chains/templates', () => HttpResponse.error()));
    expect(await templateService.getAllTemplates()).toEqual([]);
  });
});

describe('templateService.getTemplatesByCategory', () => {
  test('filters by category and includes it as a query param', async () => {
    let url = '';
    server.use(
      http.get('*/api/chains/templates', ({ request }) => {
        url = request.url;
        return HttpResponse.json({
          success: true,
          data: { templates: [chainTemplate({ category: 'financial' })], total: 1, categories: [] },
        });
      })
    );
    const result = await templateService.getTemplatesByCategory('financial');
    expect(url).toContain('category=financial');
    expect(result[0].category).toBe('financial');
  });

  test('passes the endpoint alongside the category when provided', async () => {
    let url = '';
    server.use(
      http.get('*/api/chains/templates', ({ request }) => {
        url = request.url;
        return HttpResponse.json({
          success: true,
          data: { templates: [], total: 0, categories: [] },
        });
      })
    );

    await templateService.getTemplatesByCategory('financial', 'https://example.com/sparql');

    expect(url).toContain('category=financial');
    expect(url).toContain(`endpoint=${encodeURIComponent('https://example.com/sparql')}`);
  });

  test('returns [] when the backend reports success: false', async () => {
    server.use(
      http.get('*/api/chains/templates', () =>
        HttpResponse.json({ success: false, error: 'unknown category' })
      )
    );
    expect(await templateService.getTemplatesByCategory('nope')).toEqual([]);
  });

  test('returns [] (not a throw) when the request fails outright', async () => {
    server.use(http.get('*/api/chains/templates', () => HttpResponse.error()));
    expect(await templateService.getTemplatesByCategory('financial')).toEqual([]);
  });
});

describe('templateService.getTemplateById', () => {
  test('returns the template on success', async () => {
    server.use(
      http.get('*/api/chains/templates/:id', () =>
        HttpResponse.json({ success: true, data: chainTemplate() })
      )
    );
    expect(await templateService.getTemplateById('t1')).toEqual(chainTemplate());
  });

  test('returns null when the backend reports success: false', async () => {
    server.use(
      http.get('*/api/chains/templates/:id', () =>
        HttpResponse.json({ success: false, error: 'not found' })
      )
    );
    expect(await templateService.getTemplateById('missing')).toBeNull();
  });

  test('passes the endpoint as a query param when provided', async () => {
    let url = '';
    server.use(
      http.get('*/api/chains/templates/:id', ({ request }) => {
        url = request.url;
        return HttpResponse.json({ success: true, data: chainTemplate() });
      })
    );

    await templateService.getTemplateById('t1', 'https://example.com/sparql');

    expect(url).toContain(`endpoint=${encodeURIComponent('https://example.com/sparql')}`);
  });

  test('returns null (not a throw) when the request fails outright', async () => {
    server.use(http.get('*/api/chains/templates/:id', () => HttpResponse.error()));
    expect(await templateService.getTemplateById('t1')).toBeNull();
  });
});
