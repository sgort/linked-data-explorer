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

import { FormSchema } from '../types';
import { FormService } from './formService';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

beforeEach(() => {
  localStorage.clear();
});

function form(overrides: Partial<FormSchema> = {}): FormSchema {
  return {
    id: 'f1',
    name: 'Aanvraagformulier',
    schema: {},
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('FormService.getForms / getForm', () => {
  test('returns [] / null when nothing is stored', () => {
    expect(FormService.getForms()).toEqual([]);
    expect(FormService.getForm('f1')).toBeNull();
  });

  test('returns stored forms after saveForm', () => {
    server.use(http.post('*/v1/assets/forms', () => HttpResponse.json({ success: true })));
    FormService.saveForm(form());
    expect(FormService.getForms()).toEqual([form()]);
    expect(FormService.getForm('f1')).toEqual(form());
  });
});

describe('FormService.saveForm', () => {
  test('updates an existing form in place rather than duplicating it', () => {
    server.use(http.post('*/v1/assets/forms', () => HttpResponse.json({ success: true })));
    FormService.saveForm(form());
    FormService.saveForm(form({ name: 'v2' }));

    const stored = FormService.getForms();
    expect(stored).toHaveLength(1);
    expect(stored[0].name).toBe('v2');
  });

  test('fires a background POST including schema_version for a non-readonly form', async () => {
    let body: unknown;
    server.use(
      http.post('*/v1/assets/forms', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ success: true });
      })
    );
    FormService.saveForm(form());
    await vi.waitFor(() => expect(body).toMatchObject({ schema_version: 1 }));
  });

  test('does not POST for a readonly form', async () => {
    let posted = false;
    server.use(
      http.post('*/v1/assets/forms', () => {
        posted = true;
        return HttpResponse.json({ success: true });
      })
    );
    FormService.saveForm(form({ readonly: true }));
    await new Promise((r) => setTimeout(r, 10));
    expect(posted).toBe(false);
  });
});

describe('FormService.deleteForm', () => {
  test('removes the form from localStorage and fires a background DELETE', async () => {
    server.use(http.post('*/v1/assets/forms', () => HttpResponse.json({ success: true })));
    FormService.saveForm(form());

    let deleted = false;
    server.use(
      http.delete('*/v1/assets/forms/:id', () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      })
    );
    FormService.deleteForm('f1');

    expect(FormService.getForms()).toEqual([]);
    await vi.waitFor(() => expect(deleted).toBe(true));
  });
});

describe('FormService.hydrateFromServer', () => {
  test('merges local readonly examples with server data', async () => {
    server.use(http.post('*/v1/assets/forms', () => HttpResponse.json({ success: true })));
    FormService.saveForm(form({ id: 'example-1', readonly: true }));

    server.use(
      http.get('*/v1/assets/forms', () =>
        HttpResponse.json({ data: [form({ id: 'server-1', name: 'From server' })] })
      )
    );

    const result = await FormService.hydrateFromServer();
    expect(result.map((f) => f.id).sort()).toEqual(['example-1', 'server-1']);
  });

  test('falls back to localStorage when the server request fails', async () => {
    server.use(http.post('*/v1/assets/forms', () => HttpResponse.json({ success: true })));
    FormService.saveForm(form());
    server.use(http.get('*/v1/assets/forms', () => new HttpResponse(null, { status: 500 })));

    expect(await FormService.hydrateFromServer()).toEqual([form()]);
  });
});

describe('FormService — saving signed out keeps it in this browser (#163)', () => {
  afterEach(() => {
    authMock.state = AUTHOR;
  });

  test('a signed-out save does not call the backend and marks it local-only', () => {
    authMock.state = SIGNED_OUT;
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    fetchSpy.mockClear();
    expect(FormService.saveForm(form())).toEqual({ localOnly: true });
    expect(FormService.getForm('f1')?.localOnly).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("an author's save sends the token and clears the local-only mark", async () => {
    let auth: string | null = null;
    server.use(
      http.post('*/v1/assets/forms', ({ request }) => {
        auth = request.headers.get('Authorization');
        return HttpResponse.json({ data: { id: 'f1' } });
      })
    );
    expect(FormService.saveForm(form({ localOnly: true }))).toEqual({ localOnly: false });
    await vi.waitFor(() => expect(auth).toBe('Bearer test-token'));
    expect(FormService.getForm('f1')?.localOnly).toBeUndefined();
  });

  test('hydration keeps a local-only item the server does not have, and the server wins on the same id', async () => {
    localStorage.setItem(
      'linkedDataExplorer_formSchemas',
      JSON.stringify([
        form({ id: 'mine', localOnly: true }),
        form({ id: 'both', name: 'Mine', localOnly: true }),
      ])
    );
    server.use(
      http.get('*/v1/assets/forms', () =>
        HttpResponse.json({ data: [form({ id: 'both', name: 'Shared' })] })
      )
    );
    const all = await FormService.hydrateFromServer();
    expect(all.map((x) => x.id).sort()).toEqual(['both', 'mine']);
    expect(all.find((x) => x.id === 'both')).toMatchObject({ name: 'Shared' });
    expect(all.find((x) => x.id === 'both')?.localOnly).toBeUndefined();
  });

  test('signed out, deleting a local-only item stays local and a shared item is kept', () => {
    authMock.state = SIGNED_OUT;
    localStorage.setItem(
      'linkedDataExplorer_formSchemas',
      JSON.stringify([form({ id: 'mine', localOnly: true }), form({ id: 'shared' })])
    );
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    fetchSpy.mockClear();
    FormService.deleteForm('mine');
    FormService.deleteForm('shared');
    expect(FormService.getForm('mine')).toBeNull();
    expect(FormService.getForm('shared')).not.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
