// @vitest-environment jsdom
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

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
