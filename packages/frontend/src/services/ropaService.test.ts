import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest';

import { RopaRecord } from '../types/ropa.types';
import { RopaService } from './ropaService';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function ropaRecord(overrides: Partial<RopaRecord> = {}): RopaRecord {
  return {
    id: 'r1',
    bpmnProcessId: 'ZorgtoeslagProcess',
    processLevel: 'shell',
    title: 'Zorgtoeslag',
    controllerName: 'Belastingdienst',
    controllerContact: 'privacy@example.com',
    purpose: 'Toeslag verwerken',
    legalBasisUri: 'https://wetten.overheid.nl/x',
    legalBasisLabel: 'AWIR',
    gdprArticle: '6.1.c',
    dataSubjects: 'Aanvragers',
    recipients: 'Belastingdienst',
    thirdCountryTransfers: false,
    retentionPeriod: '7 jaar',
    securityMeasures: 'Encryptie',
    status: 'active',
    schemaVersion: 1,
    personalDataFields: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('RopaService.listRopa', () => {
  test('returns the parsed ROPA list on success', async () => {
    server.use(http.get('*/v1/assets/ropa', () => HttpResponse.json({ data: [ropaRecord()] })));

    const result = await RopaService.listRopa();
    expect(result).toEqual([ropaRecord()]);
  });

  test('throws HTTP <status> on a non-ok response', async () => {
    server.use(http.get('*/v1/assets/ropa', () => new HttpResponse(null, { status: 500 })));
    await expect(RopaService.listRopa()).rejects.toThrow('HTTP 500');
  });
});

describe('RopaService.getRopaByBpmnProcessId', () => {
  test('returns the record on success', async () => {
    server.use(
      http.get('*/v1/assets/ropa/by-bpmn-id/:id', () => HttpResponse.json({ data: ropaRecord() }))
    );
    expect(await RopaService.getRopaByBpmnProcessId('ZorgtoeslagProcess')).toEqual(ropaRecord());
  });

  test('returns null on a 404', async () => {
    server.use(
      http.get('*/v1/assets/ropa/by-bpmn-id/:id', () => new HttpResponse(null, { status: 404 }))
    );
    expect(await RopaService.getRopaByBpmnProcessId('unknown')).toBeNull();
  });

  test('URL-encodes the bpmnProcessId', async () => {
    let requestUrl = '';
    server.use(
      http.get('*/v1/assets/ropa/by-bpmn-id/:id', ({ request }) => {
        requestUrl = request.url;
        return HttpResponse.json({ data: ropaRecord() });
      })
    );
    await RopaService.getRopaByBpmnProcessId('proc/with slash');
    // msw's :id matcher auto-decodes params for handler convenience, so assert
    // against the raw request URL instead — that's what confirms encodeURIComponent
    // actually ran at the fetch call site.
    expect(requestUrl).toContain(encodeURIComponent('proc/with slash'));
  });
});

describe('RopaService.upsertRopa', () => {
  test('posts the record and returns the new id', async () => {
    let body: unknown;
    server.use(
      http.post('*/v1/assets/ropa', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ data: { id: 'new-id' } });
      })
    );

    const { id: _id, createdAt: _c, updatedAt: _u, ...input } = ropaRecord();
    const result = await RopaService.upsertRopa(input);

    expect(result).toBe('new-id');
    expect(body).toMatchObject({ title: 'Zorgtoeslag' });
  });

  test('throws HTTP <status> on failure', async () => {
    server.use(http.post('*/v1/assets/ropa', () => new HttpResponse(null, { status: 400 })));
    const { id: _id, createdAt: _c, updatedAt: _u, ...input } = ropaRecord();
    await expect(RopaService.upsertRopa(input)).rejects.toThrow('HTTP 400');
  });
});

describe('RopaService.deleteRopa', () => {
  test('sends a DELETE for the given id', async () => {
    let method = '';
    server.use(
      http.delete('*/v1/assets/ropa/:id', ({ request }) => {
        method = request.method;
        return new HttpResponse(null, { status: 204 });
      })
    );
    await RopaService.deleteRopa('r1');
    expect(method).toBe('DELETE');
  });

  test('throws HTTP <status> on failure', async () => {
    server.use(http.delete('*/v1/assets/ropa/:id', () => new HttpResponse(null, { status: 500 })));
    await expect(RopaService.deleteRopa('r1')).rejects.toThrow('HTTP 500');
  });
});
