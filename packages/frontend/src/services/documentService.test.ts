// @vitest-environment jsdom
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

// #163: signed in as an lde-author unless a test says otherwise.
const authMock = vi.hoisted(() => ({
  state: { ready: true, signedIn: true, isAuthor: true, name: 'Test' } as {
    ready: boolean;
    signedIn: boolean;
    isAuthor: boolean;
    name?: string;
  },
}));
vi.mock('./auth', () => ({
  getAuthState: () => authMock.state,
  subscribe: () => () => undefined,
  authHeaders: async (): Promise<Record<string, string>> =>
    authMock.state.isAuthor ? { Authorization: 'Bearer test-token' } : {},
}));
const AUTHOR = { ready: true, signedIn: true, isAuthor: true, name: 'Test' };
const SIGNED_OUT = { ready: true, signedIn: false, isAuthor: false };

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

describe('DocumentService — saving signed out keeps it in this browser (#163)', () => {
  afterEach(() => {
    authMock.state = AUTHOR;
  });

  test('a signed-out save does not call the backend and marks it local-only', () => {
    authMock.state = SIGNED_OUT;
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    fetchSpy.mockClear();
    expect(DocumentService.saveTemplate(template())).toEqual({ localOnly: true });
    expect(DocumentService.getTemplate('d1')?.localOnly).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("an author's save sends the token and clears the local-only mark", async () => {
    let auth: string | null = null;
    server.use(
      http.post('*/v1/assets/documents', ({ request }) => {
        auth = request.headers.get('Authorization');
        return HttpResponse.json({ data: { id: 'd1' } });
      })
    );
    expect(DocumentService.saveTemplate(template({ localOnly: true }))).toEqual({
      localOnly: false,
    });
    await vi.waitFor(() => expect(auth).toBe('Bearer test-token'));
    expect(DocumentService.getTemplate('d1')?.localOnly).toBeUndefined();
  });

  test('hydration keeps a local-only item the server does not have, and the server wins on the same id', async () => {
    localStorage.setItem(
      'linkedDataExplorer_documentTemplates',
      JSON.stringify([
        template({ id: 'mine', localOnly: true }),
        template({ id: 'both', name: 'Mine', localOnly: true }),
      ])
    );
    server.use(
      http.get('*/v1/assets/documents', () =>
        HttpResponse.json({ data: [template({ id: 'both', name: 'Shared' })] })
      )
    );
    const all = await DocumentService.hydrateFromServer();
    expect(all.map((x) => x.id).sort()).toEqual(['both', 'mine']);
    expect(all.find((x) => x.id === 'both')).toMatchObject({ name: 'Shared' });
    expect(all.find((x) => x.id === 'both')?.localOnly).toBeUndefined();
  });

  test('signed out, deleting a local-only item stays local and a shared item is kept', () => {
    authMock.state = SIGNED_OUT;
    localStorage.setItem(
      'linkedDataExplorer_documentTemplates',
      JSON.stringify([template({ id: 'mine', localOnly: true }), template({ id: 'shared' })])
    );
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    fetchSpy.mockClear();
    DocumentService.deleteTemplate('mine');
    DocumentService.deleteTemplate('shared');
    expect(DocumentService.getTemplate('mine')).toBeNull();
    expect(DocumentService.getTemplate('shared')).not.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
