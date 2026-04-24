import { BpmnRow, FormRow, DocumentRow, RopaRecordRow, RopaFieldRow } from './types';
import { Bpmn, Form, Document } from '../domain/types';
import { RopaRecord, RopaPersonalDataField } from '../types/ropa.types';

export function mapBpmn(row: BpmnRow): Bpmn {
  return {
    id: row.lde_id,
    bpmnProcessId: row.bpmn_process_id,
    name: row.name,
    description: row.description ?? undefined,
    xml: row.xml,
    processRole: row.process_role,
    calledElement: row.called_element ?? undefined,
    linkedDmnTemplates: row.linked_dmn_templates ?? [],
    status: row.status,
    readonly: row.readonly,
    schemaVersion: row.schema_version,
    language: row.language ?? undefined,
    organization: row.organization ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapForm(r: FormRow): Form {
  return {
    id: r.id,
    name: r.name,
    description: r.description ?? undefined,
    schema: typeof r.schema === 'string' ? JSON.parse(r.schema) : r.schema,
    status: r.status,
    language: r.language ?? undefined,
    organization: r.organization ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    readonly: false,
  };
}

export function mapDocument(r: DocumentRow): Document {
  return {
    id: r.id,
    name: r.name,
    description: r.description ?? undefined,
    processKey: r.process_key ?? undefined,
    serviceId: r.service_id ?? undefined,
    schemaVersion: r.schema_version,
    zones: typeof r.zones === 'string' ? JSON.parse(r.zones) : r.zones,
    bindings: typeof r.bindings === 'string' ? JSON.parse(r.bindings) : r.bindings,
    assets: typeof r.assets === 'string' ? JSON.parse(r.assets) : r.assets,
    status: r.status,
    language: r.language ?? undefined,
    organization: r.organization ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    readonly: false,
  };
}

export function mapRopaRecord(row: RopaRecordRow, fields: RopaPersonalDataField[]): RopaRecord {
  return {
    id: row.id,
    bpmnProcessId: row.bpmn_process_id,
    processLevel: row.process_level as RopaRecord['processLevel'],
    title: row.title,
    controllerName: row.controller_name,
    controllerContact: row.controller_contact,
    dpoContact: row.dpo_contact ?? undefined,
    purpose: row.purpose,
    legalBasisUri: row.legal_basis_uri,
    legalBasisLabel: row.legal_basis_label,
    gdprArticle: row.gdpr_article,
    dataSubjects: row.data_subjects,
    recipients: row.recipients,
    thirdCountryTransfers: row.third_country_transfers,
    thirdCountryDetails: row.third_country_details ?? undefined,
    retentionPeriod: row.retention_period,
    securityMeasures: row.security_measures,
    status: row.status as RopaRecord['status'],
    schemaVersion: row.schema_version,
    personalDataFields: fields,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export function mapRopaField(row: RopaFieldRow): RopaPersonalDataField {
  return {
    id: row.id,
    ropaRecordId: row.ropa_record_id,
    formId: row.form_id,
    fieldKey: row.field_key,
    fieldLabel: row.field_label,
    dataCategory: row.data_category,
    specialCategory: row.special_category,
    sortOrder: row.sort_order,
  };
}
