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
    `);
    logger.info('[DB] Migrations applied');
  } finally {
    client.release();
  }
}
