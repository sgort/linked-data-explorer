// @vitest-environment jsdom
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

import { DocumentTemplate } from '../types/document.types';
import { DocumentService } from './documentService';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

beforeEach(() => {
  localStorage.clear();
});

function template(overrides: Partial<DocumentTemplate> = {}): DocumentTemplate {
  return {
    id: 'd1',
    name: 'Beschikking',
    schemaVersion: 1,
    zones: [],
    bindings: {},
    assets: [],
    status: 'wip',
    ...overrides,
  } as DocumentTemplate;
}

describe('DocumentService.getTemplates / getTemplate', () => {
  test('returns [] when nothing is stored', () => {
    expect(DocumentService.getTemplates()).toEqual([]);
    expect(DocumentService.getTemplate('d1')).toBeNull();
  });

  test('returns stored templates after saveTemplate', () => {
    server.use(http.post('*/v1/assets/documents', () => HttpResponse.json({ success: true })));
    DocumentService.saveTemplate(template());
    expect(DocumentService.getTemplates()).toEqual([template()]);
    expect(DocumentService.getTemplate('d1')).toEqual(template());
  });
});

describe('DocumentService.saveTemplate', () => {
  test('updates an existing template in place rather than duplicating it', () => {
    server.use(http.post('*/v1/assets/documents', () => HttpResponse.json({ success: true })));
    DocumentService.saveTemplate(template());
    DocumentService.saveTemplate(template({ name: 'Beschikking v2' }));

    const stored = DocumentService.getTemplates();
    expect(stored).toHaveLength(1);
    expect(stored[0].name).toBe('Beschikking v2');
  });

  test('fires a background POST for a non-readonly template', async () => {
    let posted = false;
    server.use(
      http.post('*/v1/assets/documents', () => {
        posted = true;
        return HttpResponse.json({ success: true });
      })
    );
    DocumentService.saveTemplate(template());
    await vi.waitFor(() => expect(posted).toBe(true));
  });

  test('does not POST for a readonly template', async () => {
    let posted = false;
    server.use(
      http.post('*/v1/assets/documents', () => {
        posted = true;
        return HttpResponse.json({ success: true });
      })
    );
    DocumentService.saveTemplate(template({ readonly: true }));
    await new Promise((r) => setTimeout(r, 10));
    expect(posted).toBe(false);
  });

  test('does not throw when the background save fails', () => {
    server.use(http.post('*/v1/assets/documents', () => new HttpResponse(null, { status: 500 })));
    expect(() => DocumentService.saveTemplate(template())).not.toThrow();
  });
});

describe('DocumentService.deleteTemplate', () => {
  test('removes the template from localStorage and fires a background DELETE', async () => {
    server.use(http.post('*/v1/assets/documents', () => HttpResponse.json({ success: true })));
    DocumentService.saveTemplate(template());

    let deleted = false;
    server.use(
      http.delete('*/v1/assets/documents/:id', () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      })
    );
    DocumentService.deleteTemplate('d1');

    expect(DocumentService.getTemplates()).toEqual([]);
    await vi.waitFor(() => expect(deleted).toBe(true));
  });
});

describe('DocumentService.hydrateFromServer', () => {
  test('merges local readonly examples with server data and caches the result', async () => {
    server.use(http.post('*/v1/assets/documents', () => HttpResponse.json({ success: true })));
    DocumentService.saveTemplate(template({ id: 'example-1', readonly: true }));

    server.use(
      http.get('*/v1/assets/documents', () =>
        HttpResponse.json({ data: [template({ id: 'server-1', name: 'From server' })] })
      )
    );

    const result = await DocumentService.hydrateFromServer();

    expect(result.map((t) => t.id).sort()).toEqual(['example-1', 'server-1']);
    expect(
      DocumentService.getTemplates()
        .map((t) => t.id)
        .sort()
    ).toEqual(['example-1', 'server-1']);
  });

  test('falls back to localStorage when the server request fails', async () => {
    server.use(http.post('*/v1/assets/documents', () => HttpResponse.json({ success: true })));
    DocumentService.saveTemplate(template());
    server.use(http.get('*/v1/assets/documents', () => new HttpResponse(null, { status: 500 })));

    const result = await DocumentService.hydrateFromServer();

    expect(result).toEqual([template()]);
  });
});
