// Covers the "DB not configured" (pool === null) branches of ropa.service.ts.
// Kept in its own file with a single static mock — see the note in
// ropa.service.test.ts for why this doesn't share that file's mock.
jest.mock('../db/pool', () => ({ __esModule: true, default: null }));

import {
  deleteRopa,
  getRopaById,
  getRopaByBpmnProcessId,
  listPublicRopa,
  listRopa,
  upsertRopa,
} from './ropa.service';

describe('ropa.service with no database configured', () => {
  test('read functions degrade to empty/null instead of throwing', async () => {
    await expect(listRopa()).resolves.toEqual([]);
    await expect(getRopaById('x')).resolves.toBeNull();
    await expect(getRopaByBpmnProcessId('x')).resolves.toBeNull();
    await expect(listPublicRopa()).resolves.toEqual([]);
  });

  test('deleteRopa is a silent no-op', async () => {
    await expect(deleteRopa('x')).resolves.toBeUndefined();
  });

  test('upsertRopa throws, since a write with no database cannot silently succeed', async () => {
    await expect(upsertRopa({} as never)).rejects.toThrow('DB not configured');
  });
});
