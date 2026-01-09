import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

export const config = {
  // Server
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3001', 10),
  host: process.env.HOST || 'localhost',

  // CORS
  corsOrigin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],

  // TriplyDB
  triplydb: {
    endpoint: process.env.TRIPLYDB_ENDPOINT || '',
    timeout: parseInt(process.env.TRIPLYDB_TIMEOUT || '30000', 10),
  },

  // Operaton
  operaton: {
    baseUrl: process.env.OPERATON_BASE_URL || 'https://operaton.open-regels.nl/engine-rest',
    timeout: parseInt(process.env.OPERATON_TIMEOUT || '10000', 10),
    apiKey: process.env.OPERATON_API_KEY,
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'json',
  },

  // Performance
  performance: {
    chainExecutionTimeout: parseInt(process.env.CHAIN_EXECUTION_TIMEOUT || '5000', 10),
    maxChainDepth: parseInt(process.env.MAX_CHAIN_DEPTH || '10', 10),
    enableCaching: process.env.ENABLE_CACHING === 'true',
  },

  // Validation
  isDevelopment: () => config.nodeEnv === 'development',
  isProduction: () => config.nodeEnv === 'production',
  isTest: () => config.nodeEnv === 'test',
};

// Validate required configuration
const validateConfig = () => {
  const required = ['triplydb.endpoint', 'operaton.baseUrl'];
  const missing: string[] = [];

  required.forEach((key) => {
    const value = key.split('.').reduce((obj: any, k) => obj?.[k], config);
    if (!value) {
      missing.push(key);
    }
  });

  if (missing.length > 0 && !config.isTest()) {
    throw new Error(`Missing required configuration: ${missing.join(', ')}`);
  }
};

validateConfig();

export default config;
