import logger from '../utils/logger';
import pool from './pool';

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
      ADD COLUMN IF NOT EXISTS deployed_documents     TEXT[] NOT NULL DEFAULT '{}';

      CREATE INDEX IF NOT EXISTS idx_pd_bpmn_process_id
        ON process_definitions (bpmn_process_id);
      CREATE INDEX IF NOT EXISTS idx_pd_called_element
        ON process_definitions (called_element)
        WHERE called_element IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_pd_process_role
        ON process_definitions (process_role);

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
    `);
    logger.info('[DB] Migrations applied');
  } finally {
    client.release();
  }
}
