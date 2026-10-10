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

import {
  DEDUPLICATE_PROCESS_DEFINITIONS,
  migrate,
  UNIQUE_PROCESS_PER_ORGANIZATION,
} from './migrate';

beforeEach(() => {
  mockQuery.mockReset().mockResolvedValue({ rows: [] });
  mockRelease.mockReset();
  mockConnect.mockReset().mockResolvedValue({ query: mockQuery, release: mockRelease });
  mockInfo.mockReset();
  mockWarn.mockReset();
  poolMock.current = { connect: mockConnect };
});

describe('migrate', () => {
  test('runs the schema DDL, then the #171 deduplication and unique index, and logs completion', async () => {
    await migrate();

    expect(mockConnect).toHaveBeenCalledTimes(1);
    expect(mockQuery).toHaveBeenCalledTimes(3);
    expect(mockQuery.mock.calls[1][0]).toBe(DEDUPLICATE_PROCESS_DEFINITIONS);
    expect(mockQuery.mock.calls[2][0]).toBe(UNIQUE_PROCESS_PER_ORGANIZATION);
    expect(mockInfo).toHaveBeenCalledWith('[DB] Migrations applied');
  });

  test('creates the archive table before deduplicating into it (#171)', async () => {
    await migrate();

    expect(mockQuery.mock.calls[0][0]).toContain(
      'CREATE TABLE IF NOT EXISTS process_definitions_dedup_archive'
    );
  });

  test('deduplicates per organisation and process id, keeping the deployed, newest row (#171)', () => {
    const sql = DEDUPLICATE_PROCESS_DEFINITIONS;
    expect(sql).toMatch(/PARTITION BY COALESCE\(organization, ''\), bpmn_process_id/);
    expect(sql).toMatch(/ORDER BY deployed_at DESC NULLS LAST, updated_at DESC, lde_id/);
    // Exempt rows never take part: the E2E fixture shells and the placeholder id.
    expect(sql).toContain("WHERE status <> 'e2e' AND bpmn_process_id <> 'unknown'");
    // Archived before deleted, and shell_id links moved to the row that stays.
    expect(sql).toContain('INSERT INTO process_definitions_dedup_archive');
    expect(sql).toContain('SET shell_id = l.kept_lde_id');
  });

  test('the unique index has the same scope and exemptions as the deduplication', () => {
    expect(UNIQUE_PROCESS_PER_ORGANIZATION).toContain('CREATE UNIQUE INDEX IF NOT EXISTS');
    expect(UNIQUE_PROCESS_PER_ORGANIZATION).toContain(
      "(COALESCE(organization, ''), bpmn_process_id)"
    );
    expect(UNIQUE_PROCESS_PER_ORGANIZATION).toContain(
      "WHERE status <> 'e2e' AND bpmn_process_id <> 'unknown'"
    );
  });

  test('logs each archived duplicate and the row it gave way to', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ lde_id: 'process_2', kept_lde_id: 'process_1' }],
      })
      .mockResolvedValueOnce({ rows: [] });

    await migrate();

    expect(mockWarn).toHaveBeenCalledWith(
      '[DB] Archived duplicate stored processes before enforcing uniqueness',
      { archived: ['process_2 -> kept process_1'] }
    );
  });

  test('stays quiet when there was nothing to deduplicate', async () => {
    await migrate();

    expect(mockWarn).not.toHaveBeenCalled();
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

  test('makes form and document status NOT NULL, backfilling any NULL first (#151)', async () => {
    await migrate();

    const sql = mockQuery.mock.calls[0][0] as string;
    for (const table of ['form_schemas', 'document_templates']) {
      const backfill = sql.indexOf(`UPDATE ${table} SET status = 'wip' WHERE status IS NULL`);
      const constrain = sql.search(
        new RegExp(`ALTER TABLE ${table}\\s+ALTER COLUMN status SET NOT NULL`)
      );
      expect(backfill).toBeGreaterThan(-1);
      expect(constrain).toBeGreaterThan(backfill);
    }
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
