import { Pool } from 'pg';

import { config } from '../utils/config';
import logger from '../utils/logger';

let pool: Pool | null = null;

if (config.database.url) {
  pool = new Pool({ connectionString: config.database.url });
  pool.on('error', (err) => {
    logger.error('[DB] Unexpected pool error', { error: err.message });
  });
} else {
  logger.warn('[DB] DATABASE_URL not configured — asset storage disabled');
}

export default pool;
