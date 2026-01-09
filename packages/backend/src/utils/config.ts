import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Type-safe nested property accessor
 */
const getNestedProperty = (obj: Record<string, unknown>, path: string): unknown => {
  return path.split('.').reduce<unknown>((current, key) => {
    if (current && typeof current === 'object' && key in current) {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
};

/**
 * Application configuration
 */
export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3001', 10),
  host: process.env.HOST || 'localhost',

  corsOrigin: (process.env.CORS_ORIGIN || 'http://localhost:3000').split(','),

  triplydb: {
    endpoint: process.env.TRIPLYDB_ENDPOINT || '',
    timeout: parseInt(process.env.TRIPLYDB_TIMEOUT || '30000', 10),
  },

  operaton: {
    baseUrl: process.env.OPERATON_BASE_URL || '',
    timeout: parseInt(process.env.OPERATON_TIMEOUT || '10000', 10),
    apiKey: process.env.OPERATON_API_KEY,
  },

  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'json',
  },

  performance: {
    chainExecutionTimeout: parseInt(process.env.CHAIN_EXECUTION_TIMEOUT || '5000', 10),
    maxChainDepth: parseInt(process.env.MAX_CHAIN_DEPTH || '10', 10),
    enableCaching: process.env.ENABLE_CACHING === 'true',
  },

  isProduction: () => process.env.NODE_ENV === 'production',
  isDevelopment: () => process.env.NODE_ENV === 'development',
  isTest: () => process.env.NODE_ENV === 'test',
};

/**
 * Validate required configuration values
 */
const validateConfig = () => {
  const required = ['triplydb.endpoint', 'operaton.baseUrl'];
  const missing: string[] = [];

  required.forEach((key) => {
    const value = getNestedProperty(config as Record<string, unknown>, key);
    if (!value) {
      missing.push(key);
    }
  });

  if (missing.length > 0 && !config.isTest()) {
    throw new Error(`Missing required configuration: ${missing.join(', ')}`);
  }
};

// Validate on module load
validateConfig();

export default config;
