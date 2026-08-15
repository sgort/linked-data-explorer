import { BpmnRow, DocumentRow, FormRow, RopaFieldRow, RopaRecordRow } from './types';
import { mapBpmn, mapDocument, mapForm, mapRopaField, mapRopaRecord } from './mappers';

const CREATED = new Date('2026-01-01T00:00:00.000Z');
const UPDATED = new Date('2026-02-02T00:00:00.000Z');

function bpmnRow(overrides: Partial<BpmnRow> = {}): BpmnRow {
  return {
    lde_id: 'p1',
    bpmn_process_id: 'ZorgtoeslagProcess',
    name: 'Zorgtoeslag',
    description: 'Aanvraag zorgtoeslag',
    xml: '<bpmn/>',
    process_role: 'shell',
    called_element: 'ZorgtoeslagSub',
    linked_dmn_templates: ['dmn-a'],
    status: 'example',
    readonly: true,
    schema_version: 2,
    language: 'nl',
    organization: 'Flevoland',
    created_at: CREATED,
    updated_at: UPDATED,
    ...overrides,
  } as BpmnRow;
}

function formRow(overrides: Partial<FormRow> = {}): FormRow {
  return {
    id: 'f1',
    name: 'Aanvraagformulier',
    description: 'Form',
    schema: '{"fields":[]}',
    status: 'wip',
    language: 'nl',
    organization: 'Flevoland',
    created_at: CREATED,
    updated_at: UPDATED,
    ...overrides,
  } as FormRow;
}

function documentRow(overrides: Partial<DocumentRow> = {}): DocumentRow {
  return {
    id: 'd1',
    name: 'Beschikking',
    description: 'Doc',
    process_key: 'ZorgtoeslagProcess',
    service_id: 'svc-1',
    schema_version: 1,
    zones: '[{"id":"z1"}]',
    bindings: '[{"path":"a"}]',
    assets: '[{"id":"logo"}]',
    status: 'wip',
    language: 'nl',
    organization: 'Flevoland',
    created_at: CREATED,
    updated_at: UPDATED,
    ...overrides,
  } as DocumentRow;
}

function ropaRow(overrides: Partial<RopaRecordRow> = {}): RopaRecordRow {
  return {
    id: 'r1',
    bpmn_process_id: 'ZorgtoeslagProcess',
    process_level: 'shell',
    title: 'Zorgtoeslag',
    controller_name: 'Provincie Flevoland',
    controller_contact: 'privacy@flevoland.nl',
    dpo_contact: 'fg@flevoland.nl',
    purpose: 'Toekennen zorgtoeslag',
    legal_basis_uri: 'https://wetten.nl/awb',
    legal_basis_label: 'Awb',
    gdpr_article: '6(1)(e)',
    data_subjects: 'Inwoners',
    recipients: 'Belastingdienst',
    third_country_transfers: true,
    third_country_details: 'Geen',
    retention_period: '7 jaar',
    security_measures: 'Encryptie',
    status: 'active',
    schema_version: 1,
    created_at: CREATED,
    updated_at: UPDATED,
    ...overrides,
  } as RopaRecordRow;
}

describe('mapBpmn', () => {
  test('maps snake_case columns onto the camelCase domain shape', () => {
    expect(mapBpmn(bpmnRow())).toEqual({
      id: 'p1',
      bpmnProcessId: 'ZorgtoeslagProcess',
      name: 'Zorgtoeslag',
      description: 'Aanvraag zorgtoeslag',
      xml: '<bpmn/>',
      processRole: 'shell',
      calledElement: 'ZorgtoeslagSub',
      linkedDmnTemplates: ['dmn-a'],
      status: 'example',
      readonly: true,
      schemaVersion: 2,
      language: 'nl',
      organization: 'Flevoland',
      createdAt: CREATED,
      updatedAt: UPDATED,
    });
  });

  test('converts nullable columns to undefined rather than leaking null', () => {
    const mapped = mapBpmn(
      bpmnRow({
        description: null,
        called_element: null,
        language: null,
        organization: null,
      })
    );

    expect(mapped.description).toBeUndefined();
    expect(mapped.calledElement).toBeUndefined();
    expect(mapped.language).toBeUndefined();
    expect(mapped.organization).toBeUndefined();
  });

  test('defaults a null linked_dmn_templates array to empty, so callers can map over it', () => {
    const mapped = mapBpmn(bpmnRow({ linked_dmn_templates: null as unknown as string[] }));

    expect(mapped.linkedDmnTemplates).toEqual([]);
  });
});

describe('mapForm', () => {
  test('passes an already-parsed jsonb schema through untouched', () => {
    // node-postgres hands jsonb back as an object; the row type says string, so
    // the mapper has to tolerate both and this is the object arm.
    const schema = { fields: [{ key: 'bsn' }] };

    expect(mapForm(formRow({ schema: schema as unknown as string })).schema).toBe(schema);
  });

  test('parses a schema that arrives as a JSON string', () => {
    const mapped = mapForm(formRow({ schema: '{"fields":[{"key":"bsn"}]}' }));

    expect(mapped.schema).toEqual({ fields: [{ key: 'bsn' }] });
  });

  test('nulls become undefined and forms are never readonly', () => {
    const mapped = mapForm(formRow({ description: null, language: null, organization: null }));

    expect(mapped.description).toBeUndefined();
    expect(mapped.language).toBeUndefined();
    expect(mapped.organization).toBeUndefined();
    expect(mapped.readonly).toBe(false);
  });
});

describe('mapDocument', () => {
  test('passes already-parsed jsonb columns through untouched', () => {
    const zones = [{ id: 'z1' }];
    const bindings = [{ path: 'a' }];
    const assets = [{ id: 'logo' }];
    const mapped = mapDocument(
      documentRow({
        zones: zones as unknown as string,
        bindings: bindings as unknown as string,
        assets: assets as unknown as string,
      })
    );

    expect(mapped.zones).toBe(zones);
    expect(mapped.bindings).toBe(bindings);
    expect(mapped.assets).toBe(assets);
  });

  test('parses zones, bindings and assets that arrive as JSON strings', () => {
    const mapped = mapDocument(documentRow());

    expect(mapped.zones).toEqual([{ id: 'z1' }]);
    expect(mapped.bindings).toEqual([{ path: 'a' }]);
    expect(mapped.assets).toEqual([{ id: 'logo' }]);
  });

  test('converts nullable columns to undefined', () => {
    const mapped = mapDocument(
      documentRow({
        description: null,
        process_key: null,
        service_id: null,
        language: null,
        organization: null,
      })
    );

    expect(mapped.description).toBeUndefined();
    expect(mapped.processKey).toBeUndefined();
    expect(mapped.serviceId).toBeUndefined();
    expect(mapped.language).toBeUndefined();
    expect(mapped.organization).toBeUndefined();
    expect(mapped.readonly).toBe(false);
  });
});

describe('mapRopaRecord', () => {
  test('maps every column and serialises timestamps to ISO strings', () => {
    const fields = [
      {
        id: 'fld-1',
        ropaRecordId: 'r1',
        formId: 'f1',
        fieldKey: 'bsn',
        fieldLabel: 'BSN',
        dataCategory: 'identificatie',
        specialCategory: false,
        sortOrder: 0,
      },
    ];

    expect(mapRopaRecord(ropaRow(), fields)).toEqual({
      id: 'r1',
      bpmnProcessId: 'ZorgtoeslagProcess',
      processLevel: 'shell',
      title: 'Zorgtoeslag',
      controllerName: 'Provincie Flevoland',
      controllerContact: 'privacy@flevoland.nl',
      dpoContact: 'fg@flevoland.nl',
      purpose: 'Toekennen zorgtoeslag',
      legalBasisUri: 'https://wetten.nl/awb',
      legalBasisLabel: 'Awb',
      gdprArticle: '6(1)(e)',
      dataSubjects: 'Inwoners',
      recipients: 'Belastingdienst',
      thirdCountryTransfers: true,
      thirdCountryDetails: 'Geen',
      retentionPeriod: '7 jaar',
      securityMeasures: 'Encryptie',
      status: 'active',
      schemaVersion: 1,
      personalDataFields: fields,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-02-02T00:00:00.000Z',
    });
  });

  test('converts the optional contact and transfer detail columns to undefined', () => {
    const mapped = mapRopaRecord(ropaRow({ dpo_contact: null, third_country_details: null }), []);

    expect(mapped.dpoContact).toBeUndefined();
    expect(mapped.thirdCountryDetails).toBeUndefined();
    expect(mapped.personalDataFields).toEqual([]);
  });
});

describe('mapRopaField', () => {
  test('maps a personal data field row', () => {
    const row: RopaFieldRow = {
      id: 'fld-1',
      ropa_record_id: 'r1',
      form_id: 'f1',
      field_key: 'bsn',
      field_label: 'BSN',
      data_category: 'identificatie',
      special_category: true,
      sort_order: 3,
    } as RopaFieldRow;

    expect(mapRopaField(row)).toEqual({
      id: 'fld-1',
      ropaRecordId: 'r1',
      formId: 'f1',
      fieldKey: 'bsn',
      fieldLabel: 'BSN',
      dataCategory: 'identificatie',
      specialCategory: true,
      sortOrder: 3,
    });
  });
});
