import pool from '../db/pool';
import { BpmnRow, FormRow, DocumentRow } from '../db/types';
import { Bpmn, Form, Document } from '../domain/types';
import { mapBpmn, mapForm, mapDocument } from '../db/mappers';

// ─── BPMN ────────────────────────────────────────────────────────────────────

export async function listBpmn(): Promise<Bpmn[]> {
  if (!pool) return [];
  const { rows } = await pool.query<BpmnRow>(
    `SELECT lde_id, bpmn_process_id, name, description, xml,
            process_role, called_element, shell_id, linked_dmn_templates,
            status, readonly, schema_version, language, organization,
            created_at, updated_at
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
  shellId?: string;
  linkedDmnTemplates: string[];
  status?: string;
  language?: string;
  organization?: string;
  createdAt: string;
  updatedAt: string;
}): Promise<void> {
  if (!pool) return;
  await pool.query(
    `INSERT INTO process_definitions
       (lde_id, bpmn_process_id, name, description, xml, process_role,
        called_element, shell_id, linked_dmn_templates, status, language, organization,
        created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     ON CONFLICT (lde_id) DO UPDATE SET
       bpmn_process_id      = EXCLUDED.bpmn_process_id,
       name                 = EXCLUDED.name,
       description          = EXCLUDED.description,
       xml                  = EXCLUDED.xml,
       process_role         = EXCLUDED.process_role,
       called_element       = EXCLUDED.called_element,
       shell_id             = EXCLUDED.shell_id,
       linked_dmn_templates = EXCLUDED.linked_dmn_templates,
       status               = EXCLUDED.status,
       language             = EXCLUDED.language,
       organization         = EXCLUDED.organization,
       updated_at           = EXCLUDED.updated_at`,
    [
      p.id,
      p.bpmnProcessId ?? 'unknown',
      p.name,
      p.description ?? null,
      p.xml,
      p.processRole ?? 'standalone',
      p.calledElement ?? null,
      p.shellId ?? null,
      p.linkedDmnTemplates,
      p.status ?? 'wip',
      p.language ?? null,
      p.organization ?? null,
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

/**
 * Stamps a stored process as deployed. Returns whether a row actually
 * matched `ldeId` — a bare `UPDATE ... WHERE lde_id = $1` succeeds (and
 * previously reported success) even when nothing matched, which left a
 * missing/mismatched id as a silent no-op. Callers must treat `false` as
 * "not recorded", not as an error to swallow.
 */
export async function markDeployed(
  ldeId: string,
  deploymentId: string,
  operatonUrl: string | undefined,
  formIds: string[],
  documentIds: string[],
  boardOwner?: string
): Promise<boolean> {
  if (!pool) return false;
  const result = await pool.query(
    `UPDATE process_definitions SET
       deployed_at            = NOW(),
       operaton_deployment_id = $2,
       operaton_url           = $3,
       deployed_forms         = $4,
       deployed_documents     = $5,
       board_owner            = COALESCE($6, board_owner)
     WHERE lde_id = $1`,
    [ldeId, deploymentId, operatonUrl ?? null, formIds, documentIds, boardOwner ?? null]
  );
  return (result.rowCount ?? 0) > 0;
}

export interface DeployedBundleInput {
  /** The BPMN's own `<process id>` — the natural key `upsertBpmn`/`saveProcess`
   *  already write on every canvas Save (see `getBpmnByBpmnProcessId`). */
  bpmnProcessId: string;
  /** Only used to seed a minimal row when no stored process matches yet. */
  bpmnXml: string;
  organization?: string;
  deploymentId: string;
  operatonUrl?: string;
  formIds: string[];
  documentIds: string[];
  boardOwner?: string;
}

/**
 * Records a just-deployed bundle server-side, in the same request/response
 * cycle as the Operaton deploy, so the write no longer depends on a second,
 * browser-initiated, unawaited request.
 *
 * Finds the row by `bpmnProcessId`; if none exists yet (the process was
 * deployed without ever being Saved first), creates a minimal one — `name`
 * defaults to the process id itself, `lde_id` is the process id too, since
 * that is already the natural key this lookup uses and keeps the row
 * debuggable. Every other column takes `upsertBpmn`'s own default (see its
 * `ON CONFLICT` insert): `process_role` 'standalone', `status` 'wip',
 * `linked_dmn_templates` '{}'. Either way, stamps the row deployed via
 * `markDeployed`.
 *
 * Never throws for a "nothing to record" outcome — returns `false` instead,
 * same as `markDeployed`. A thrown exception here (e.g. the database is
 * briefly unreachable) is left for the caller to catch; it must not be
 * allowed to fail the deploy itself, which already happened in Operaton.
 */
export async function recordDeployedBundle(input: DeployedBundleInput): Promise<boolean> {
  if (!pool) return false;

  const existing = (await getBpmnByBpmnProcessId(input.bpmnProcessId)) as { id: string } | null;
  const ldeId = existing?.id ?? input.bpmnProcessId;

  if (!existing) {
    const now = new Date().toISOString();
    await upsertBpmn({
      id: ldeId,
      bpmnProcessId: input.bpmnProcessId,
      name: input.bpmnProcessId,
      xml: input.bpmnXml,
      linkedDmnTemplates: [],
      organization: input.organization,
      createdAt: now,
      updatedAt: now,
    });
  }

  return markDeployed(
    ldeId,
    input.deploymentId,
    input.operatonUrl,
    input.formIds,
    input.documentIds,
    input.boardOwner
  );
}

export async function listPublicBundles(): Promise<unknown[]> {
  if (!pool) return [];
  const { rows } = await pool.query<{
    lde_id: string;
    bpmn_process_id: string;
    name: string;
    description: string | null;
    process_role: string;
    called_element: string | null;
    linked_dmn_templates: string[];
    status: string;
    deployed_at: Date;
    operaton_url: string | null;
    operaton_deployment_id: string | null;
    deployed_forms: string[];
    deployed_documents: string[];
    language: string | null;
    organization: string | null;
    board_owner: string | null;
    updated_at: Date;
  }>(
    `SELECT pd_shell.lde_id,
            pd_shell.bpmn_process_id,
            pd_shell.name,
            pd_shell.description,
            pd_shell.process_role,
            pd_shell.linked_dmn_templates,
            pd_shell.status,
            pd_shell.deployed_at,
            pd_shell.operaton_url,
            pd_shell.operaton_deployment_id,
            pd_shell.deployed_forms,
            pd_shell.deployed_documents,
            pd_shell.language,
            pd_shell.organization,
            pd_shell.board_owner,
            pd_shell.updated_at,
            COALESCE(
              json_agg(
                json_build_object(
                  'id', pd_sub.lde_id,
                  'name', pd_sub.name,
                  'bpmnProcessId', pd_sub.bpmn_process_id,
                  'status', pd_sub.status
                )
              ) FILTER (WHERE pd_sub.lde_id IS NOT NULL),
              '[]'
            ) AS subprocesses,
            COALESCE(
              (SELECT json_agg(json_build_object('id', fs.schema->>'id', 'name', fs.name))
               FROM form_schemas fs
               WHERE fs.schema->>'id' = ANY(pd_shell.deployed_forms)),
              '[]'
            ) AS forms,
            COALESCE(
              (SELECT json_agg(json_build_object('id', dt.id, 'name', dt.name))
               FROM document_templates dt
               WHERE dt.id = ANY(pd_shell.deployed_documents)),
              '[]'
            ) AS documents
     FROM process_definitions pd_shell
     LEFT JOIN process_definitions pd_sub
       ON pd_sub.called_element = pd_shell.bpmn_process_id
      AND pd_sub.process_role   = 'subprocess'
     WHERE pd_shell.process_role IN ('shell', 'standalone')
       AND pd_shell.deployed_at IS NOT NULL
     GROUP BY pd_shell.lde_id,
              pd_shell.bpmn_process_id,
              pd_shell.name,
              pd_shell.description,
              pd_shell.process_role,
              pd_shell.linked_dmn_templates,
              pd_shell.status,
              pd_shell.deployed_at,
              pd_shell.operaton_url,
              pd_shell.operaton_deployment_id,
              pd_shell.deployed_forms,
              pd_shell.deployed_documents,
              pd_shell.language,
              pd_shell.organization,
              pd_shell.board_owner,
              pd_shell.updated_at
     ORDER BY pd_shell.deployed_at DESC`
  );
  return rows.map((r) => ({
    id: r.lde_id,
    bpmnProcessId: r.bpmn_process_id,
    name: r.name,
    description: r.description ?? undefined,
    processRole: r.process_role,
    linkedDmnTemplates: r.linked_dmn_templates ?? [],
    status: r.status,
    deployedAt: r.deployed_at,
    operatonUrl: r.operaton_url ?? undefined,
    operatonDeploymentId: r.operaton_deployment_id ?? undefined,
    deployedForms: (r as unknown as { forms: { id: string; name: string }[] }).forms,
    deployedDocuments: (r as unknown as { documents: { id: string; name: string }[] }).documents,
    subprocesses: (
      r as unknown as {
        subprocesses: { id: string; name: string; bpmnProcessId: string; status: string }[];
      }
    ).subprocesses,
    language: r.language ?? undefined,
    organization: r.organization ?? undefined,
    boardOwner: r.board_owner ?? undefined,
    updatedAt: r.updated_at,
  }));
}

// ─── Forms ───────────────────────────────────────────────────────────────────

export async function listForms(): Promise<Form[]> {
  if (!pool) return [];

  const { rows } = await pool.query<FormRow>(
    `SELECT id, name, description, schema, status, language, organization,
            created_at, updated_at
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
  language?: string;
  organization?: string;
  createdAt: string;
  updatedAt: string;
}): Promise<void> {
  if (!pool) return;
  await pool.query(
    `INSERT INTO form_schemas (id, name, description, schema, status,
                                language, organization, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (id) DO UPDATE SET
       name         = EXCLUDED.name,
       description  = EXCLUDED.description,
       schema       = EXCLUDED.schema,
       status       = EXCLUDED.status,
       language     = EXCLUDED.language,
       organization = EXCLUDED.organization,
       updated_at   = EXCLUDED.updated_at`,
    [
      f.id,
      f.name,
      f.description ?? null,
      JSON.stringify(f.schema),
      f.status ?? 'wip',
      f.language ?? null,
      f.organization ?? null,
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
            language, organization, created_at, updated_at
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
  language?: string;
  organization?: string;
  createdAt: string;
  updatedAt: string;
}): Promise<void> {
  if (!pool) return;
  await pool.query(
    `INSERT INTO document_templates (id, name, description, process_key, service_id, schema_version, zones, bindings, assets, status, language, organization, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     ON CONFLICT (id) DO UPDATE SET
       name           = EXCLUDED.name,
       description    = EXCLUDED.description,
       process_key    = EXCLUDED.process_key,
       service_id     = EXCLUDED.service_id,
       schema_version = EXCLUDED.schema_version,
       zones          = EXCLUDED.zones,
       bindings       = EXCLUDED.bindings,
       assets         = EXCLUDED.assets,
       status         = EXCLUDED.status,
       language       = EXCLUDED.language,
       organization   = EXCLUDED.organization,
       updated_at     = EXCLUDED.updated_at`,
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
      d.language ?? null,
      d.organization ?? null,
      d.createdAt,
      d.updatedAt,
    ]
  );
}

export async function deleteDocument(id: string): Promise<void> {
  if (!pool) return;
  await pool.query('DELETE FROM document_templates WHERE id = $1', [id]);
}
