import { BpmnRow, DocumentRow, FormRow } from '../db/types';

const mockQuery = jest.fn();

jest.mock('../db/pool', () => ({
  __esModule: true,
  default: { query: (...args: unknown[]) => mockQuery(...args) },
}));

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

function bpmnRow(overrides: Partial<BpmnRow> = {}): BpmnRow {
  return {
    lde_id: 'p1',
    bpmn_process_id: 'ZorgtoeslagProcess',
    name: 'Zorgtoeslag',
    description: null,
    xml: '<bpmn/>',
    process_role: 'standalone',
    called_element: null,
    linked_dmn_templates: [],
    status: 'wip',
    readonly: false,
    schema_version: 1,
    language: null,
    organization: null,
    created_at: new Date('2026-01-01T00:00:00.000Z'),
    updated_at: new Date('2026-06-01T00:00:00.000Z'),
    ...overrides,
  };
}

function formRow(overrides: Partial<FormRow> = {}): FormRow {
  return {
    id: 'f1',
    name: 'Aanvraagformulier',
    description: null,
    schema: JSON.stringify({ id: 'f1', components: [] }),
    status: 'wip',
    language: null,
    organization: null,
    created_at: new Date('2026-01-01T00:00:00.000Z'),
    updated_at: new Date('2026-06-01T00:00:00.000Z'),
    ...overrides,
  };
}

function documentRow(overrides: Partial<DocumentRow> = {}): DocumentRow {
  return {
    id: 'd1',
    name: 'Beschikking',
    description: null,
    process_key: null,
    service_id: null,
    schema_version: 1,
    zones: JSON.stringify([]),
    bindings: JSON.stringify({}),
    assets: JSON.stringify([]),
    status: 'wip',
    language: null,
    organization: null,
    created_at: new Date('2026-01-01T00:00:00.000Z'),
    updated_at: new Date('2026-06-01T00:00:00.000Z'),
    ...overrides,
  };
}

beforeEach(() => {
  mockQuery.mockReset();
});

describe('BPMN', () => {
  test('listBpmn maps rows via mapBpmn', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [bpmnRow()] });
    const [result] = await listBpmn();
    expect(result).toMatchObject({ id: 'p1', bpmnProcessId: 'ZorgtoeslagProcess' });
  });

  test('upsertBpmn defaults optional fields and passes positional params', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await upsertBpmn({
      id: 'p1',
      name: 'Zorgtoeslag',
      xml: '<bpmn/>',
      linkedDmnTemplates: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
    });

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO process_definitions'),
      [
        'p1',
        'unknown',
        'Zorgtoeslag',
        null,
        '<bpmn/>',
        'standalone',
        null,
        [],
        'wip',
        null,
        null,
        '2026-01-01T00:00:00.000Z',
        '2026-06-01T00:00:00.000Z',
      ]
    );
  });

  test('deleteBpmn issues a DELETE for the given lde_id', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await deleteBpmn('p1');
    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('DELETE'), ['p1']);
  });

  test('getBpmnByBpmnProcessId returns null when nothing matches', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    expect(await getBpmnByBpmnProcessId('unknown')).toBeNull();
  });

  test('getBpmnByBpmnProcessId returns the id/bpmnProcessId/xml when found', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ lde_id: 'p1', bpmn_process_id: 'ZorgtoeslagProcess', xml: '<bpmn/>' }],
    });
    expect(await getBpmnByBpmnProcessId('ZorgtoeslagProcess')).toEqual({
      id: 'p1',
      bpmnProcessId: 'ZorgtoeslagProcess',
      xml: '<bpmn/>',
    });
  });

  test('markDeployed passes boardOwner through COALESCE (falls back to existing when omitted)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await markDeployed('p1', 'dep-1', 'https://operaton.example.com', ['f1'], ['d1']);
    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('UPDATE process_definitions'), [
      'p1',
      'dep-1',
      'https://operaton.example.com',
      ['f1'],
      ['d1'],
      null,
    ]);
  });

  test('markDeployed passes null when operatonUrl is omitted', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await markDeployed('p1', 'dep-1', undefined, ['f1'], ['d1']);
    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('UPDATE process_definitions'), [
      'p1',
      'dep-1',
      null,
      ['f1'],
      ['d1'],
      null,
    ]);
  });

  test('listPublicBundles maps subprocesses/forms/documents from the aggregated query', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          lde_id: 'p1',
          bpmn_process_id: 'ZorgtoeslagProcess',
          name: 'Zorgtoeslag',
          description: null,
          process_role: 'shell',
          linked_dmn_templates: null,
          status: 'deployed',
          deployed_at: new Date('2026-06-01T00:00:00.000Z'),
          operaton_url: 'https://operaton.example.com',
          operaton_deployment_id: 'dep-1',
          deployed_forms: ['f1'],
          deployed_documents: ['d1'],
          language: null,
          organization: null,
          board_owner: null,
          updated_at: new Date('2026-06-01T00:00:00.000Z'),
          subprocesses: [],
          forms: [{ id: 'f1', name: 'Aanvraagformulier' }],
          documents: [{ id: 'd1', name: 'Beschikking' }],
        },
      ],
    });

    const [result] = await listPublicBundles();

    expect(result).toMatchObject({
      id: 'p1',
      bpmnProcessId: 'ZorgtoeslagProcess',
      linkedDmnTemplates: [],
      deployedForms: [{ id: 'f1', name: 'Aanvraagformulier' }],
      deployedDocuments: [{ id: 'd1', name: 'Beschikking' }],
    });
  });

  test('listPublicBundles maps null operaton_url/operaton_deployment_id to undefined', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          lde_id: 'p1',
          bpmn_process_id: 'ZorgtoeslagProcess',
          name: 'Zorgtoeslag',
          description: null,
          process_role: 'shell',
          linked_dmn_templates: null,
          status: 'wip',
          deployed_at: null,
          operaton_url: null,
          operaton_deployment_id: null,
          deployed_forms: [],
          deployed_documents: [],
          language: null,
          organization: null,
          board_owner: null,
          updated_at: new Date('2026-06-01T00:00:00.000Z'),
          subprocesses: [],
          forms: [],
          documents: [],
        },
      ],
    });

    const [result] = await listPublicBundles();

    expect(result).toMatchObject({ operatonUrl: undefined, operatonDeploymentId: undefined });
  });
});

describe('Forms', () => {
  test('listForms maps rows via mapForm (parsing the stringified schema)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [formRow()] });
    const [result] = await listForms();
    expect(result.schema).toEqual({ id: 'f1', components: [] });
  });

  test('upsertForm stringifies the schema before sending it', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await upsertForm({
      id: 'f1',
      name: 'Aanvraagformulier',
      schema: { id: 'f1', components: [] },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
    });

    const [, params] = mockQuery.mock.calls[0];
    expect(params[3]).toBe(JSON.stringify({ id: 'f1', components: [] }));
  });

  test('deleteForm issues a DELETE for the given id', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await deleteForm('f1');
    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('DELETE'), ['f1']);
  });
});

describe('Documents', () => {
  test('listDocuments maps rows via mapDocument (parsing zones/bindings/assets)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [documentRow()] });
    const [result] = await listDocuments();
    expect(result.zones).toEqual([]);
    expect(result.bindings).toEqual({});
    expect(result.assets).toEqual([]);
  });

  test('upsertDocument stringifies zones/bindings/assets before sending them', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await upsertDocument({
      id: 'd1',
      name: 'Beschikking',
      schemaVersion: 1,
      zones: [{ id: 'z1' }],
      bindings: { z1: 'field1' },
      assets: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
    });

    const [, params] = mockQuery.mock.calls[0];
    expect(params[6]).toBe(JSON.stringify([{ id: 'z1' }]));
    expect(params[7]).toBe(JSON.stringify({ z1: 'field1' }));
    expect(params[8]).toBe(JSON.stringify([]));
  });

  test('deleteDocument issues a DELETE for the given id', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await deleteDocument('d1');
    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('DELETE'), ['d1']);
  });
});
