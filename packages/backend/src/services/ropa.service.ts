import pool from '../db/pool';
import { RopaRecord, RopaPersonalDataField, PublicRopaRecord } from '../types/ropa.types';

// ─── Mapping helpers ──────────────────────────────────────────────────────────

function rowToRecord(r: Record<string, unknown>, fields: RopaPersonalDataField[]): RopaRecord {
  return {
    id: r.id as string,
    bpmnProcessId: r.bpmn_process_id as string,
    processLevel: r.process_level as RopaRecord['processLevel'],
    title: r.title as string,
    controllerName: r.controller_name as string,
    controllerContact: r.controller_contact as string,
    dpoContact: (r.dpo_contact as string) ?? undefined,
    purpose: r.purpose as string,
    legalBasisUri: r.legal_basis_uri as string,
    legalBasisLabel: r.legal_basis_label as string,
    gdprArticle: r.gdpr_article as string,
    dataSubjects: r.data_subjects as string,
    recipients: r.recipients as string,
    thirdCountryTransfers: r.third_country_transfers as boolean,
    thirdCountryDetails: (r.third_country_details as string) ?? undefined,
    retentionPeriod: r.retention_period as string,
    securityMeasures: r.security_measures as string,
    status: r.status as RopaRecord['status'],
    schemaVersion: r.schema_version as number,
    personalDataFields: fields,
    createdAt: (r.created_at as Date).toISOString(),
    updatedAt: (r.updated_at as Date).toISOString(),
  };
}

function rowToField(r: Record<string, unknown>): RopaPersonalDataField {
  return {
    id: r.id as string,
    ropaRecordId: r.ropa_record_id as string,
    formId: r.form_id as string,
    fieldKey: r.field_key as string,
    fieldLabel: r.field_label as string,
    dataCategory: r.data_category as string,
    specialCategory: r.special_category as boolean,
    sortOrder: r.sort_order as number,
  };
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export async function listRopa(): Promise<RopaRecord[]> {
  if (!pool) return [];
  const { rows: recordRows } = await pool.query(
    `SELECT * FROM ropa_records ORDER BY updated_at DESC`
  );
  if (recordRows.length === 0) return [];
  const ids = recordRows.map((r) => r.id);
  const { rows: fieldRows } = await pool.query(
    `SELECT * FROM ropa_personal_data_fields
     WHERE ropa_record_id = ANY($1) ORDER BY sort_order ASC`,
    [ids]
  );
  return recordRows.map((r) =>
    rowToRecord(r, fieldRows.filter((f) => f.ropa_record_id === r.id).map(rowToField))
  );
}

export async function getRopaById(id: string): Promise<RopaRecord | null> {
  if (!pool) return null;
  const { rows } = await pool.query(`SELECT * FROM ropa_records WHERE id = $1`, [id]);
  if (rows.length === 0) return null;
  const { rows: fieldRows } = await pool.query(
    `SELECT * FROM ropa_personal_data_fields WHERE ropa_record_id = $1 ORDER BY sort_order ASC`,
    [id]
  );
  return rowToRecord(rows[0], fieldRows.map(rowToField));
}

export async function getRopaByBpmnProcessId(bpmnProcessId: string): Promise<RopaRecord | null> {
  if (!pool) return null;
  const { rows } = await pool.query(
    `SELECT * FROM ropa_records WHERE bpmn_process_id = $1 ORDER BY updated_at DESC LIMIT 1`,
    [bpmnProcessId]
  );
  if (rows.length === 0) return null;
  return getRopaById(rows[0].id as string);
}

export async function upsertRopa(
  record: Omit<RopaRecord, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
): Promise<string> {
  if (!pool) throw new Error('DB not configured');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

const { rows } = await client.query(
  `INSERT INTO ropa_records (
     bpmn_process_id, process_level, title, controller_name, controller_contact,
     dpo_contact, purpose, legal_basis_uri, legal_basis_label, gdpr_article,
     data_subjects, recipients, third_country_transfers, third_country_details,
     retention_period, security_measures, status, schema_version
   ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
   ON CONFLICT (bpmn_process_id) DO UPDATE SET
     process_level          = EXCLUDED.process_level,
     title                  = EXCLUDED.title,
     controller_name        = EXCLUDED.controller_name,
     controller_contact     = EXCLUDED.controller_contact,
     dpo_contact            = EXCLUDED.dpo_contact,
     purpose                = EXCLUDED.purpose,
     legal_basis_uri        = EXCLUDED.legal_basis_uri,
     legal_basis_label      = EXCLUDED.legal_basis_label,
     gdpr_article           = EXCLUDED.gdpr_article,
     data_subjects          = EXCLUDED.data_subjects,
     recipients             = EXCLUDED.recipients,
     third_country_transfers = EXCLUDED.third_country_transfers,
     third_country_details  = EXCLUDED.third_country_details,
     retention_period       = EXCLUDED.retention_period,
     security_measures      = EXCLUDED.security_measures,
     status                 = EXCLUDED.status,
     schema_version         = EXCLUDED.schema_version,
     updated_at             = NOW()
   RETURNING id`,
      [
        record.bpmnProcessId,
        record.processLevel,
        record.title,
        record.controllerName,
        record.controllerContact,
        record.dpoContact ?? null,
        record.purpose,
        record.legalBasisUri,
        record.legalBasisLabel,
        record.gdprArticle,
        record.dataSubjects,
        record.recipients,
        record.thirdCountryTransfers,
        record.thirdCountryDetails ?? null,
        record.retentionPeriod,
        record.securityMeasures,
        record.status,
        record.schemaVersion,
      ]
    );

    const recordId = rows[0].id as string;

    await client.query(`DELETE FROM ropa_personal_data_fields WHERE ropa_record_id = $1`, [
      recordId,
    ]);

    for (const field of record.personalDataFields) {
      await client.query(
        `INSERT INTO ropa_personal_data_fields
           (ropa_record_id, form_id, field_key, field_label, data_category, special_category, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          recordId,
          field.formId,
          field.fieldKey,
          field.fieldLabel,
          field.dataCategory,
          field.specialCategory,
          field.sortOrder,
        ]
      );
    }

    await client.query('COMMIT');
    return recordId;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function deleteRopa(id: string): Promise<void> {
  if (!pool) return;
  // CASCADE handles ropa_personal_data_fields
  await pool.query(`DELETE FROM ropa_records WHERE id = $1`, [id]);
}

export async function listPublicRopa(organisation?: string): Promise<PublicRopaRecord[]> {
  if (!pool) return [];
  const params: unknown[] = ['active'];
  let where = `WHERE r.status = $1`;
  if (organisation) {
    params.push(`%${organisation}%`);
    where += ` AND r.controller_name ILIKE $${params.length}`;
  }
  const { rows: recordRows } = await pool.query(
    `SELECT * FROM ropa_records r ${where} ORDER BY r.updated_at DESC`,
    params
  );
  if (recordRows.length === 0) return [];
  const ids = recordRows.map((r) => r.id);
  const { rows: fieldRows } = await pool.query(
    `SELECT * FROM ropa_personal_data_fields WHERE ropa_record_id = ANY($1) ORDER BY sort_order ASC`,
    [ids]
  );
  return recordRows.map((r) => {
    const full = rowToRecord(r, fieldRows.filter((f) => f.ropa_record_id === r.id).map(rowToField));
    // Strip internal fields before exposing publicly
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { schemaVersion, controllerContact, dpoContact, ...pub } = full;
    return pub as PublicRopaRecord;
  });
}
