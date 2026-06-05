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
 * Deployment tier display label. NODE_ENV alone can't distinguish ACC from PROD
 * because both deployments run with NODE_ENV=production; the dedicated
 * DEPLOYMENT_ENV variable carries the tier signal, set per Azure App Service:
 *   az webapp config appsettings set -g rg-... -n ronl-linkeddata-backend-acc  --settings DEPLOYMENT_ENV=acc
 *   az webapp config appsettings set -g rg-... -n ronl-linkeddata-backend-prod --settings DEPLOYMENT_ENV=prod
 * Falls back to NODE_ENV when unset so local development stays zero-config.
 */
const rawDeploymentEnv = (process.env.DEPLOYMENT_ENV || process.env.NODE_ENV || 'development')
  .toLowerCase()
  .trim();

const formatDeploymentEnv = (env: string): string => {
  switch (env) {
    case 'prod':
    case 'production':
      return 'PROD';
    case 'acc':
    case 'acceptance':
    case 'staging':
      return 'ACC';
    case 'dev':
    case 'development':
    case 'local':
      return 'development';
    case 'test':
      return 'test';
    default:
      return env;
  }
};

/**
 * Application configuration
 */
export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  /** Raw deployment tier value: 'dev' | 'acc' | 'prod' | 'test' | ... */
  deploymentEnv: rawDeploymentEnv,
  /** Display label for the deployment tier; used by the root page and /v1/health. */
  displayEnv: formatDeploymentEnv(rawDeploymentEnv),
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

  dso: {
    catalogueBaseUrl:
      process.env.DSO_CATALOGUE_BASE_URL ||
      'https://service.pre.omgevingswet.overheid.nl/publiek/catalogus/api/opvragen/v3',
    rtrBaseUrl:
      process.env.DSO_RTR_BASE_URL ||
      'https://service.pre.omgevingswet.overheid.nl/publiek/toepasbare-regels/api/rtrgegevens/v2',
    zoekinterfaceBaseUrl:
      process.env.DSO_ZOEKINTERFACE_BASE_URL ||
      'https://service.pre.omgevingswet.overheid.nl/publiek/toepasbare-regels/api/zoekinterface/v2',
    opvragenWerkzaamhedenBaseUrl:
      process.env.DSO_OPVRAGEN_WERKZAAMHEDEN_BASE_URL ||
      'https://service.pre.omgevingswet.overheid.nl/publiek/toepasbare-regels/api/opvragenwerkzaamheden/v1',
    apiKey: process.env.DSO_API_KEY || '',
    timeout: parseInt(process.env.DSO_TIMEOUT || '15000', 10),
  },

  dsoProd: {
    catalogueBaseUrl:
      process.env.DSO_CATALOGUE_BASE_URL_PROD ||
      'https://service.omgevingswet.overheid.nl/publiek/catalogus/api/opvragen/v3',
    rtrBaseUrl:
      process.env.DSO_RTR_BASE_URL_PROD ||
      'https://service.omgevingswet.overheid.nl/publiek/toepasbare-regels/api/rtrgegevens/v2',
    zoekinterfaceBaseUrl:
      process.env.DSO_ZOEKINTERFACE_BASE_URL_PROD ||
      'https://service.omgevingswet.overheid.nl/publiek/toepasbare-regels/api/zoekinterface/v2',
    opvragenWerkzaamhedenBaseUrl:
      process.env.DSO_OPVRAGEN_WERKZAAMHEDEN_BASE_URL_PROD ||
      'https://service.omgevingswet.overheid.nl/publiek/toepasbare-regels/api/opvragenwerkzaamheden/v1',
    apiKey: process.env.DSO_API_KEY_PROD || '',
  },

  edocs: {
    baseUrl: process.env.EDOCS_BASE_URL || '',
    library: process.env.EDOCS_LIBRARY || '',
    userId: process.env.EDOCS_USER_ID || '',
    password: process.env.EDOCS_PASSWORD || '',
    stubMode: process.env.EDOCS_STUB_MODE !== 'false', // defaults to true for safety
  },

  database: {
    url: process.env.DATABASE_URL || '',
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
 * add 'edocs.baseUrl' to the required array in validateConfig only when !stubMode
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
