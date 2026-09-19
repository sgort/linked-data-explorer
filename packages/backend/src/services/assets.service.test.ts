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
  recordDeployedBundle,
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
    shell_id: null,
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

  test('upsertBpmn passes shellId through when given', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await upsertBpmn({
      id: 'sub1',
      name: 'Tree Felling Permit',
      xml: '<bpmn/>',
      calledElement: 'AwbShellProcess',
      shellId: 'shell1',
      linkedDmnTemplates: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
    });

    const [, params] = mockQuery.mock.calls[0];
    expect(params).toContain('shell1');
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

  test('getBpmnByBpmnProcessId orders by deployed_at DESC NULLS LAST, updated_at DESC before LIMIT 1 (#156)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await getBpmnByBpmnProcessId('ZorgtoeslagProcess');

    const [sql] = mockQuery.mock.calls[0];
    expect(sql).toEqual(
      expect.stringContaining('ORDER BY deployed_at DESC NULLS LAST, updated_at DESC')
    );
    expect(sql.indexOf('ORDER BY')).toBeGreaterThan(-1);
    expect(sql.indexOf('ORDER BY')).toBeLessThan(sql.indexOf('LIMIT 1'));
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
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
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
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
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

  test('markDeployed resolves true when a row was actually updated', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    expect(await markDeployed('p1', 'dep-1', undefined, [], [])).toBe(true);
  });

  test('markDeployed resolves false for a zero-row update (no matching lde_id) rather than reporting success', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    expect(await markDeployed('missing-id', 'dep-1', undefined, [], [])).toBe(false);
  });

  describe('recordDeployedBundle', () => {
    const input = {
      bpmnProcessId: 'ZorgtoeslagProcess',
      bpmnXml: '<bpmn:definitions/>',
      organization: 'flevoland',
      deploymentId: 'dep-1',
      operatonUrl: 'https://operaton.example.com',
      formIds: ['f1'],
      documentIds: ['d1'],
      boardOwner: 'flevoland',
    };

    test('stamps the existing row deployed by its own lde_id, without creating one', async () => {
      mockQuery
        // getBpmnByBpmnProcessId lookup
        .mockResolvedValueOnce({
          rows: [{ lde_id: 'p1', bpmn_process_id: 'ZorgtoeslagProcess', xml: '<bpmn/>' }],
        })
        // markDeployed UPDATE
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      expect(await recordDeployedBundle(input)).toEqual({ recorded: true });
      expect(mockQuery).toHaveBeenCalledTimes(2);
      const [updateSql, updateParams] = mockQuery.mock.calls[1];
      expect(updateSql).toEqual(expect.stringContaining('UPDATE process_definitions'));
      expect(updateParams[0]).toBe('p1');
    });

    test('creates a minimal row keyed by the process id when none exists yet, then stamps it deployed', async () => {
      mockQuery
        // getBpmnByBpmnProcessId lookup — nothing found
        .mockResolvedValueOnce({ rows: [] })
        // upsertBpmn INSERT
        .mockResolvedValueOnce({ rows: [] })
        // markDeployed UPDATE
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      expect(await recordDeployedBundle(input)).toEqual({ recorded: true });
      expect(mockQuery).toHaveBeenCalledTimes(3);

      const [insertSql, insertParams] = mockQuery.mock.calls[1];
      expect(insertSql).toEqual(expect.stringContaining('INSERT INTO process_definitions'));
      // id, bpmn_process_id, name, description, xml, ...
      expect(insertParams[0]).toBe('ZorgtoeslagProcess'); // lde_id defaults to the process id
      expect(insertParams[1]).toBe('ZorgtoeslagProcess'); // bpmn_process_id
      expect(insertParams[2]).toBe('ZorgtoeslagProcess'); // name defaults to the process id
      expect(insertParams[4]).toBe('<bpmn:definitions/>'); // xml
      expect(insertParams[11]).toBe('flevoland'); // organization

      const [updateSql, updateParams] = mockQuery.mock.calls[2];
      expect(updateSql).toEqual(expect.stringContaining('UPDATE process_definitions'));
      expect(updateParams[0]).toBe('ZorgtoeslagProcess');
    });

    test('reports "existing-row-not-stamped", rather than throwing, when an existing row\'s stamp lands on zero rows', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ lde_id: 'p1', bpmn_process_id: 'ZorgtoeslagProcess', xml: '<bpmn/>' }],
        })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      expect(await recordDeployedBundle(input)).toEqual({
        recorded: false,
        reason: 'existing-row-not-stamped',
      });
    });

    test('reports "new-row-not-stamped" when a freshly created row\'s stamp lands on zero rows', async () => {
      mockQuery
        // getBpmnByBpmnProcessId lookup — nothing found
        .mockResolvedValueOnce({ rows: [] })
        // upsertBpmn INSERT
        .mockResolvedValueOnce({ rows: [] })
        // markDeployed UPDATE — matches nothing
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      expect(await recordDeployedBundle(input)).toEqual({
        recorded: false,
        reason: 'new-row-not-stamped',
      });
    });
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
