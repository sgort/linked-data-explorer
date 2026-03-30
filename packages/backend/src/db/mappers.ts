import { BpmnRow, FormRow, DocumentRow } from './types';
import { Bpmn, Form, Document } from '../domain/types';

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
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    readonly: false,
  };
}