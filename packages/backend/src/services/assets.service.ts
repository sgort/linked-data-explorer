import pool from '../db/pool';
import { BpmnRow, FormRow, DocumentRow } from '../db/types';
import { Bpmn, Form, Document } from '../domain/types';
import { mapBpmn, mapForm, mapDocument } from '../db/mappers';

// ─── BPMN ────────────────────────────────────────────────────────────────────

export async function listBpmn(): Promise<Bpmn[]> {
  if (!pool) return [];
  const { rows } = await pool.query<BpmnRow>(
    `SELECT lde_id, bpmn_process_id, name, description, xml,
            process_role, called_element, linked_dmn_templates,
            status, readonly, schema_version, created_at, updated_at
     FROM process_definitions ORDER BY updated_at DESC`
  );
  return rows.map(mapBpmn);
}

export async function upsertBpmn(p: {
  id: string;
  bpmnProcessId?: string;
  name: string;
  description?: string;
  xml: string;
  processRole?: string;
  calledElement?: string;
  linkedDmnTemplates: string[];
  status?: string;
  createdAt: string;
  updatedAt: string;
}): Promise<void> {
  if (!pool) return;
  await pool.query(
    `INSERT INTO process_definitions
       (lde_id, bpmn_process_id, name, description, xml, process_role,
        called_element, linked_dmn_templates, status, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (lde_id) DO UPDATE SET
       bpmn_process_id      = EXCLUDED.bpmn_process_id,
       name                 = EXCLUDED.name,
       description          = EXCLUDED.description,
       xml                  = EXCLUDED.xml,
       process_role         = EXCLUDED.process_role,
       called_element       = EXCLUDED.called_element,
       linked_dmn_templates = EXCLUDED.linked_dmn_templates,
       status               = EXCLUDED.status,
       updated_at           = EXCLUDED.updated_at`,
    [
      p.id,
      p.bpmnProcessId ?? 'unknown',
      p.name,
      p.description ?? null,
      p.xml,
      p.processRole ?? 'standalone',
      p.calledElement ?? null,
      p.linkedDmnTemplates,
      p.status ?? 'wip',
      p.createdAt,
      p.updatedAt,
    ]
  );
}

export async function deleteBpmn(ldeId: string): Promise<void> {
  if (!pool) return;
  await pool.query('DELETE FROM process_definitions WHERE lde_id = $1', [ldeId]);
}

export async function getBpmnByBpmnProcessId(bpmnProcessId: string): Promise<unknown | null> {
  if (!pool) return null;
  const { rows } = await pool.query(
    `SELECT lde_id, bpmn_process_id, xml FROM process_definitions
     WHERE bpmn_process_id = $1 LIMIT 1`,
    [bpmnProcessId]
  );
  if (rows.length === 0) return null;
  return { id: rows[0].lde_id, bpmnProcessId: rows[0].bpmn_process_id, xml: rows[0].xml };
}

// ─── Forms ───────────────────────────────────────────────────────────────────

export async function listForms(): Promise<Form[]> {
  if (!pool) return [];

  const { rows } = await pool.query<FormRow>(
    `SELECT id, name, description, schema, status, created_at, updated_at
     FROM form_schemas
     ORDER BY updated_at DESC`
  );
  return rows.map(mapForm);
}

export async function upsertForm(f: {
  id: string;
  name: string;
  description?: string;
  schema: Record<string, unknown>;
  status?: string;
  createdAt: string;
  updatedAt: string;
}): Promise<void> {
  if (!pool) return;
  await pool.query(
    `INSERT INTO form_schemas (id, name, description, schema, status, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       description = EXCLUDED.description,
       schema = EXCLUDED.schema,
       status = EXCLUDED.status,
       updated_at = EXCLUDED.updated_at`,
    [
      f.id,
      f.name,
      f.description ?? null,
      JSON.stringify(f.schema),
      f.status ?? 'wip',
      f.createdAt,
      f.updatedAt,
    ]
  );
}

export async function deleteForm(id: string): Promise<void> {
  if (!pool) return;
  await pool.query('DELETE FROM form_schemas WHERE id = $1', [id]);
}

// ─── Documents ───────────────────────────────────────────────────────────────

export async function listDocuments(): Promise<Document[]> {
  if (!pool) return [];

  const { rows } = await pool.query<DocumentRow>(
    `SELECT id, name, description, process_key, service_id,
            schema_version, zones, bindings, assets, status,
            created_at, updated_at
     FROM document_templates
     ORDER BY updated_at DESC`
  );
  return rows.map(mapDocument);
}

export async function upsertDocument(d: {
  id: string;
  name: string;
  description?: string;
  processKey?: string;
  serviceId?: string;
  schemaVersion: number;
  zones: unknown;
  bindings: unknown;
  assets: unknown;
  status?: string;
  createdAt: string;
  updatedAt: string;
}): Promise<void> {
  if (!pool) return;
  await pool.query(
    `INSERT INTO document_templates (id, name, description, process_key, service_id, schema_version, zones, bindings, assets, status, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       description = EXCLUDED.description,
       process_key = EXCLUDED.process_key,
       service_id = EXCLUDED.service_id,
       schema_version = EXCLUDED.schema_version,
       zones = EXCLUDED.zones,
       bindings = EXCLUDED.bindings,
       assets = EXCLUDED.assets,
       status = EXCLUDED.status,
       updated_at = EXCLUDED.updated_at`,
    [
      d.id,
      d.name,
      d.description ?? null,
      d.processKey ?? null,
      d.serviceId ?? null,
      d.schemaVersion,
      JSON.stringify(d.zones),
      JSON.stringify(d.bindings),
      JSON.stringify(d.assets),
      d.status ?? 'wip',
      d.createdAt,
      d.updatedAt,
    ]
  );
}

export async function deleteDocument(id: string): Promise<void> {
  if (!pool) return;
  await pool.query('DELETE FROM document_templates WHERE id = $1', [id]);
}
