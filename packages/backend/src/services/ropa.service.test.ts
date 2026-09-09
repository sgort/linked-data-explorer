import { RopaFieldRow, RopaRecordRow } from '../db/types';

const mockQuery = jest.fn();
const mockConnect = jest.fn();

jest.mock('../db/pool', () => ({
  __esModule: true,
  default: { query: (...args: unknown[]) => mockQuery(...args), connect: () => mockConnect() },
}));

import {
  deleteRopa,
  getRopaById,
  getRopaByBpmnProcessId,
  listPublicRopa,
  listRopa,
  upsertRopa,
} from './ropa.service';

function recordRow(overrides: Partial<RopaRecordRow> = {}): RopaRecordRow {
  return {
    id: 'r1',
    bpmn_process_id: 'ZorgtoeslagProcess',
    process_level: 'shell',
    title: 'Zorgtoeslag',
    controller_name: 'Belastingdienst',
    controller_contact: 'privacy@example.com',
    dpo_contact: null,
    purpose: 'Toeslag verwerken',
    legal_basis_uri: 'https://wetten.overheid.nl/x',
    legal_basis_label: 'AWIR',
    gdpr_article: '6.1.c',
    data_subjects: 'Aanvragers',
    recipients: 'Belastingdienst',
    third_country_transfers: false,
    third_country_details: null,
    retention_period: '7 jaar',
    security_measures: 'Encryptie',
    status: 'active',
    schema_version: 1,
    created_at: new Date('2026-01-01T00:00:00.000Z'),
    updated_at: new Date('2026-06-01T00:00:00.000Z'),
    ...overrides,
  };
}

function fieldRow(overrides: Partial<RopaFieldRow> = {}): RopaFieldRow {
  return {
    id: 'f1',
    ropa_record_id: 'r1',
    form_id: 'form1',
    field_key: 'bsn',
    field_label: 'BSN',
    data_category: 'identifying',
    special_category: false,
    sort_order: 0,
    ...overrides,
  };
}

beforeEach(() => {
  mockQuery.mockReset();
  mockConnect.mockReset();
});

describe('listRopa', () => {
  test('returns records with their fields attached, mapped from snake_case rows', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [recordRow()] })
      .mockResolvedValueOnce({ rows: [fieldRow()] });

    const result = await listRopa();

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 'r1', bpmnProcessId: 'ZorgtoeslagProcess' });
    expect(result[0].personalDataFields).toEqual([
      {
        id: 'f1',
        ropaRecordId: 'r1',
        formId: 'form1',
        fieldKey: 'bsn',
        fieldLabel: 'BSN',
        dataCategory: 'identifying',
        specialCategory: false,
        sortOrder: 0,
      },
    ]);
  });

  test('returns [] without querying fields when there are no records', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const result = await listRopa();

    expect(result).toEqual([]);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });
});

describe('getRopaById', () => {
  test('returns null when no record matches', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    expect(await getRopaById('missing')).toBeNull();
  });

  test('returns the mapped record with its fields', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [recordRow()] })
      .mockResolvedValueOnce({ rows: [fieldRow()] });

    const result = await getRopaById('r1');
    expect(result?.title).toBe('Zorgtoeslag');
    expect(result?.personalDataFields).toHaveLength(1);
  });
});

describe('getRopaByBpmnProcessId', () => {
  test('returns null when no record matches the process id', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    expect(await getRopaByBpmnProcessId('unknown')).toBeNull();
  });

  test('delegates to getRopaById using the found record id', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [recordRow({ id: 'r1' })] }) // lookup by bpmn_process_id
      .mockResolvedValueOnce({ rows: [recordRow({ id: 'r1' })] }) // getRopaById's own record query
      .mockResolvedValueOnce({ rows: [] }); // getRopaById's field query

    const result = await getRopaByBpmnProcessId('ZorgtoeslagProcess');
    expect(result?.id).toBe('r1');
  });
});

describe('upsertRopa', () => {
  const baseInput = {
    bpmnProcessId: 'ZorgtoeslagProcess',
    processLevel: 'shell' as const,
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
    status: 'active' as const,
    schemaVersion: 1,
    personalDataFields: [
      {
        id: 'f1',
        ropaRecordId: 'r1',
        formId: 'form1',
        fieldKey: 'bsn',
        fieldLabel: 'BSN',
        dataCategory: 'identifying',
        specialCategory: false,
        sortOrder: 0,
      },
    ],
  };

  test('runs the upsert in a transaction and returns the new record id', async () => {
    const client = { query: jest.fn(), release: jest.fn() };
    mockConnect.mockResolvedValueOnce(client);
    client.query
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 'new-id' }] }) // INSERT ... RETURNING id
      .mockResolvedValueOnce(undefined) // DELETE existing fields
      .mockResolvedValueOnce(undefined) // INSERT field
      .mockResolvedValueOnce(undefined); // COMMIT

    const id = await upsertRopa(baseInput);

    expect(id).toBe('new-id');
    expect(client.query).toHaveBeenCalledWith('BEGIN');
    expect(client.query).toHaveBeenCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  test('rolls back and rethrows when the transaction fails', async () => {
    const client = { query: jest.fn(), release: jest.fn() };
    mockConnect.mockResolvedValueOnce(client);
    client.query
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockRejectedValueOnce(new Error('constraint violation')); // INSERT fails

    await expect(upsertRopa(baseInput)).rejects.toThrow('constraint violation');
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalledTimes(1);
  });
});

describe('deleteRopa', () => {
  test('issues a DELETE for the given id', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await deleteRopa('r1');
    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM ropa_records'), [
      'r1',
    ]);
  });
});

describe('listPublicRopa', () => {
  test('strips internal fields (schemaVersion, controllerContact, dpoContact) from the result', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [recordRow()] })
      .mockResolvedValueOnce({ rows: [fieldRow()] });

    const [pub] = await listPublicRopa();

    expect(pub).not.toHaveProperty('schemaVersion');
    expect(pub).not.toHaveProperty('controllerContact');
    expect(pub).not.toHaveProperty('dpoContact');
    expect(pub).toMatchObject({ title: 'Zorgtoeslag' });
  });

  test('adds an organisation ILIKE filter when provided', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await listPublicRopa('Flevoland');

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('ILIKE'),
      expect.arrayContaining(['active', '%Flevoland%'])
    );
  });

  test('omits the ILIKE filter when no organisation is given', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await listPublicRopa();

    expect(mockQuery).toHaveBeenCalledWith(expect.not.stringContaining('ILIKE'), ['active']);
  });
});

// The "pool is null" (DB not configured) branches are covered in
// ropa.service.no-pool.test.ts — a separate file with its own single static
// mock, since jest.doMock inside isolateModules doesn't reliably override
// this file's top-level jest.mock('../db/pool', ...) for a fresh import.
