import logger from '../utils/logger';
import pool from './pool';

/**
 * A stored process is unique per organisation and process id (#171). The
 * Operaton key is per tenant and the organisation is the tenant, so two
 * organisations may share a key; one organisation may not have it twice.
 *
 * Exempt, and so outside both statements below:
 *   - status 'e2e': the E2E fixture shells reuse the seeded example's key on
 *     purpose (#254); they are opened, never looked up by key.
 *   - process id 'unknown': upsertBpmn's placeholder when the XML had none.
 *
 * Existing duplicates are resolved before the index is created, so the index
 * can never fail on old data. Per group, the deployed, most recently updated
 * row stays; anything pointing at the others through shell_id is repointed to
 * it; the others are copied to process_definitions_dedup_archive (the whole
 * row as JSON, with the row that was kept) and then deleted. Once the index
 * exists no group can form again, so on every later start this finds nothing.
 *
 * A row that is itself removed is not repointed: one statement may not update
 * and delete the same row.
 */
export const DEDUPLICATE_PROCESS_DEFINITIONS = `
  WITH ranked AS (
    SELECT lde_id,
           first_value(lde_id) OVER w AS kept_lde_id,
           row_number() OVER w AS rn
    FROM process_definitions
    WHERE status <> 'e2e' AND bpmn_process_id <> 'unknown'
    WINDOW w AS (
      PARTITION BY COALESCE(organization, ''), bpmn_process_id
      ORDER BY deployed_at DESC NULLS LAST, updated_at DESC, lde_id
    )
  ),
  losers AS (
    SELECT lde_id, kept_lde_id FROM ranked WHERE rn > 1
  ),
  repointed AS (
    UPDATE process_definitions p
       SET shell_id = l.kept_lde_id
      FROM losers l
     WHERE p.shell_id = l.lde_id
       AND p.lde_id NOT IN (SELECT lde_id FROM losers)
    RETURNING p.lde_id
  ),
  archived AS (
    INSERT INTO process_definitions_dedup_archive (lde_id, kept_lde_id, row_data)
    SELECT p.lde_id, l.kept_lde_id, to_jsonb(p)
      FROM process_definitions p
      JOIN losers l ON l.lde_id = p.lde_id
    RETURNING lde_id
  )
  DELETE FROM process_definitions p
   USING losers l
   WHERE p.lde_id = l.lde_id
  RETURNING p.lde_id, l.kept_lde_id;
`;

export const UNIQUE_PROCESS_PER_ORGANIZATION = `
  CREATE UNIQUE INDEX IF NOT EXISTS idx_pd_org_bpmn_process_id_unique
    ON process_definitions (COALESCE(organization, ''), bpmn_process_id)
    WHERE status <> 'e2e' AND bpmn_process_id <> 'unknown';
`;

export async function migrate(): Promise<void> {
  if (!pool) {
    logger.warn('[DB] Skipping migrations — database not configured');
    return;
  }

  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS process_definitions (
        id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        lde_id               VARCHAR(255) UNIQUE NOT NULL,
        bpmn_process_id      VARCHAR(255) NOT NULL,
        name                 VARCHAR(500) NOT NULL,
        description          TEXT,
        xml                  TEXT        NOT NULL,
        process_role         VARCHAR(20)  NOT NULL DEFAULT 'standalone'
                               CHECK (process_role IN ('shell', 'subprocess', 'standalone')),
        called_element       VARCHAR(255),
        linked_dmn_templates TEXT[]      NOT NULL DEFAULT '{}',
        status               VARCHAR(20)  NOT NULL DEFAULT 'wip'
                               CHECK (status IN ('example', 'wip')),
        readonly             BOOLEAN     NOT NULL DEFAULT FALSE,
        schema_version       INTEGER     NOT NULL DEFAULT 1,
        created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      ALTER TABLE process_definitions
      ADD COLUMN IF NOT EXISTS deployed_at            TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS operaton_url           TEXT,
      ADD COLUMN IF NOT EXISTS operaton_deployment_id TEXT,
      ADD COLUMN IF NOT EXISTS deployed_forms         TEXT[] NOT NULL DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS deployed_documents     TEXT[] NOT NULL DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS language               VARCHAR(2),
      ADD COLUMN IF NOT EXISTS organization           VARCHAR(100),
      ADD COLUMN IF NOT EXISTS board_owner            VARCHAR(50),
      ADD COLUMN IF NOT EXISTS shell_id               VARCHAR(255);

      -- Widen the status CHECK to allow 'e2e' (e2e-fixtures imports). Drop
      -- and recreate rather than a bare ADD, so this block stays safe to
      -- run repeatedly.
      ALTER TABLE process_definitions
        DROP CONSTRAINT IF EXISTS process_definitions_status_check;
      ALTER TABLE process_definitions
        ADD CONSTRAINT process_definitions_status_check
        CHECK (status IN ('example', 'wip', 'e2e'));

      CREATE INDEX IF NOT EXISTS idx_pd_bpmn_process_id
        ON process_definitions (bpmn_process_id);
      CREATE INDEX IF NOT EXISTS idx_pd_called_element
        ON process_definitions (called_element)
        WHERE called_element IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_pd_process_role
        ON process_definitions (process_role);
      CREATE INDEX IF NOT EXISTS idx_pd_language
        ON process_definitions (language)
        WHERE language IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_pd_organization
        ON process_definitions (organization)
        WHERE organization IS NOT NULL;

      CREATE TABLE IF NOT EXISTS form_schemas (
        id             TEXT        PRIMARY KEY,
        name           TEXT        NOT NULL,
        description    TEXT,
        schema         JSONB       NOT NULL,
        status         TEXT        DEFAULT 'wip',
        schema_version INTEGER     NOT NULL DEFAULT 1,
        created_at     TIMESTAMPTZ NOT NULL,
        updated_at     TIMESTAMPTZ NOT NULL
      );

      ALTER TABLE form_schemas
      ADD COLUMN IF NOT EXISTS language     VARCHAR(2),
      ADD COLUMN IF NOT EXISTS organization VARCHAR(100);

      CREATE INDEX IF NOT EXISTS idx_fs_language
        ON form_schemas (language)
        WHERE language IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_fs_organization
        ON form_schemas (organization)
        WHERE organization IS NOT NULL;

      CREATE TABLE IF NOT EXISTS document_templates (
        id             TEXT        PRIMARY KEY,
        name           TEXT        NOT NULL,
        description    TEXT,
        process_key    TEXT,
        service_id     TEXT,
        schema_version INTEGER     NOT NULL DEFAULT 1,
        zones          JSONB       NOT NULL,
        bindings       JSONB       NOT NULL DEFAULT '[]',
        assets         JSONB       NOT NULL DEFAULT '[]',
        status         TEXT        DEFAULT 'wip',
        created_at     TIMESTAMPTZ NOT NULL,
        updated_at     TIMESTAMPTZ NOT NULL
      );

      ALTER TABLE document_templates
      ADD COLUMN IF NOT EXISTS language     VARCHAR(2),
      ADD COLUMN IF NOT EXISTS organization VARCHAR(100);

      CREATE INDEX IF NOT EXISTS idx_dt_language
        ON document_templates (language)
        WHERE language IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_dt_organization
        ON document_templates (organization)
        WHERE organization IS NOT NULL;

      -- status has always defaulted to 'wip' but was nullable, so a row written
      -- outside the upserts could reach the API as "status": null, which the
      -- OpenAPI description forbids (#151). Backfill, then enforce. Both steps
      -- are safe to repeat on every start.
      UPDATE form_schemas SET status = 'wip' WHERE status IS NULL;
      ALTER TABLE form_schemas
        ALTER COLUMN status SET NOT NULL;
      UPDATE document_templates SET status = 'wip' WHERE status IS NULL;
      ALTER TABLE document_templates
        ALTER COLUMN status SET NOT NULL;

      CREATE TABLE IF NOT EXISTS ropa_records (
        id                       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
        bpmn_process_id          VARCHAR(255) NOT NULL,
        process_level            VARCHAR(20)  NOT NULL
                                 CHECK (process_level IN ('shell', 'subprocess')),
        title                    VARCHAR(500) NOT NULL,
        controller_name          TEXT         NOT NULL,
        controller_contact       TEXT         NOT NULL,
        dpo_contact              TEXT,
        purpose                  TEXT         NOT NULL,
        legal_basis_uri          TEXT         NOT NULL,
        legal_basis_label        TEXT         NOT NULL,
        gdpr_article             VARCHAR(50)  NOT NULL,
        data_subjects            TEXT         NOT NULL,
        recipients               TEXT         NOT NULL,
        third_country_transfers  BOOLEAN      NOT NULL DEFAULT FALSE,
        third_country_details    TEXT,
        retention_period         TEXT         NOT NULL,
        security_measures        TEXT         NOT NULL,
        status                   VARCHAR(20)  NOT NULL DEFAULT 'draft'
                                 CHECK (status IN ('draft', 'active', 'archived')),
        schema_version           INTEGER      NOT NULL DEFAULT 1,
        created_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_ropa_bpmn_process_id_unique
        ON ropa_records (bpmn_process_id);
      CREATE INDEX IF NOT EXISTS idx_ropa_status
        ON ropa_records (status);

      CREATE TABLE IF NOT EXISTS ropa_personal_data_fields (
        id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
        ropa_record_id   UUID         NOT NULL
                           REFERENCES ropa_records(id) ON DELETE CASCADE,
        form_id          TEXT         NOT NULL,
        field_key        VARCHAR(255) NOT NULL,
        field_label      TEXT         NOT NULL,
        data_category    VARCHAR(100) NOT NULL,
        special_category BOOLEAN      NOT NULL DEFAULT FALSE,
        sort_order       INTEGER      NOT NULL DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_rpdf_ropa_record_id
        ON ropa_personal_data_fields (ropa_record_id);

      CREATE TABLE IF NOT EXISTS process_definitions_dedup_archive (
        lde_id       VARCHAR(255) NOT NULL,
        kept_lde_id  VARCHAR(255) NOT NULL,
        row_data     JSONB        NOT NULL,
        archived_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      );
    `);

    const archived = await client.query<{ lde_id: string; kept_lde_id: string }>(
      DEDUPLICATE_PROCESS_DEFINITIONS
    );
    if ((archived.rowCount ?? 0) > 0) {
      logger.warn('[DB] Archived duplicate stored processes before enforcing uniqueness', {
        archived: archived.rows.map((r) => `${r.lde_id} -> kept ${r.kept_lde_id}`),
      });
    }
    await client.query(UNIQUE_PROCESS_PER_ORGANIZATION);

    logger.info('[DB] Migrations applied');
  } finally {
    client.release();
  }
}
