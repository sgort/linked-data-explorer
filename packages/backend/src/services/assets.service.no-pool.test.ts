// Covers the "DB not configured" (pool === null) branches of assets.service.ts.
// Kept in its own file — see the note in ropa.service.test.ts for why.
jest.mock('../db/pool', () => ({ __esModule: true, default: null }));

import {
  deleteBpmn,
  deleteDocument,
  deleteForm,
  getBpmnByBpmnProcessId,
  listBpmn,
  listDocuments,
  listForms,
  listPublicBundles,
  markDeployed,
  upsertBpmn,
  upsertDocument,
  upsertForm,
} from './assets.service';

describe('assets.service with no database configured', () => {
  test('every read function degrades to an empty array or null', async () => {
    await expect(listBpmn()).resolves.toEqual([]);
    await expect(listForms()).resolves.toEqual([]);
    await expect(listDocuments()).resolves.toEqual([]);
    await expect(listPublicBundles()).resolves.toEqual([]);
    await expect(getBpmnByBpmnProcessId('x')).resolves.toBeNull();
  });

  test('every write function is a silent no-op', async () => {
    await expect(
      upsertBpmn({
        id: 'x',
        name: 'x',
        xml: '<bpmn/>',
        linkedDmnTemplates: [],
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      })
    ).resolves.toBeUndefined();
    await expect(deleteBpmn('x')).resolves.toBeUndefined();
    await expect(markDeployed('x', 'dep-1', undefined, [], [])).resolves.toBeUndefined();
    await expect(
      upsertForm({
        id: 'x',
        name: 'x',
        schema: {},
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      })
    ).resolves.toBeUndefined();
    await expect(deleteForm('x')).resolves.toBeUndefined();
    await expect(
      upsertDocument({
        id: 'x',
        name: 'x',
        schemaVersion: 1,
        zones: [],
        bindings: {},
        assets: [],
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      })
    ).resolves.toBeUndefined();
    await expect(deleteDocument('x')).resolves.toBeUndefined();
  });
});
