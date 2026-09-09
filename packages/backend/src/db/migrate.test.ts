const mockQuery = jest.fn();
const mockRelease = jest.fn();
const mockConnect = jest.fn();
const mockInfo = jest.fn();
const mockWarn = jest.fn();

jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: { info: (...a: unknown[]) => mockInfo(...a), warn: (...a: unknown[]) => mockWarn(...a) },
}));

const poolMock: { current: unknown } = { current: null };
jest.mock('./pool', () => ({
  __esModule: true,
  get default() {
    return poolMock.current;
  },
}));

import { migrate } from './migrate';

beforeEach(() => {
  mockQuery.mockReset().mockResolvedValue({ rows: [] });
  mockRelease.mockReset();
  mockConnect.mockReset().mockResolvedValue({ query: mockQuery, release: mockRelease });
  mockInfo.mockReset();
  mockWarn.mockReset();
  poolMock.current = { connect: mockConnect };
});

describe('migrate', () => {
  test('runs the schema DDL on a pooled client and logs completion', async () => {
    await migrate();

    expect(mockConnect).toHaveBeenCalledTimes(1);
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockInfo).toHaveBeenCalledWith('[DB] Migrations applied');
  });

  test('creates every table the application depends on', async () => {
    await migrate();

    const sql = mockQuery.mock.calls[0][0] as string;
    for (const table of [
      'process_definitions',
      'form_schemas',
      'document_templates',
      'ropa_records',
      'ropa_personal_data_fields',
    ]) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    }
  });

  test('is idempotent by construction — every DDL statement is guarded', async () => {
    await migrate();

    const sql = mockQuery.mock.calls[0][0] as string;
    const creates = sql.match(/CREATE (?:UNIQUE )?(?:TABLE|INDEX)(?! IF NOT EXISTS)/g);
    const alters = sql.match(/ADD COLUMN(?! IF NOT EXISTS)/g);

    expect(creates).toBeNull();
    expect(alters).toBeNull();
  });

  test('releases the client even when the DDL fails, so the pool is not leaked', async () => {
    mockQuery.mockRejectedValue(new Error('permission denied for schema public'));

    await expect(migrate()).rejects.toThrow('permission denied for schema public');
    expect(mockRelease).toHaveBeenCalledTimes(1);
    expect(mockInfo).not.toHaveBeenCalled();
  });

  test('releases the client on success', async () => {
    await migrate();

    expect(mockRelease).toHaveBeenCalledTimes(1);
  });

  test('skips silently when no database is configured', async () => {
    poolMock.current = null;

    await expect(migrate()).resolves.toBeUndefined();
    expect(mockConnect).not.toHaveBeenCalled();
    expect(mockWarn).toHaveBeenCalledWith('[DB] Skipping migrations — database not configured');
  });
});
