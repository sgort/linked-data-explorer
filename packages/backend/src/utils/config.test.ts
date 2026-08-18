/* eslint-disable @typescript-eslint/no-require-imports */
// config.ts reads process.env at import time and validates on load, so every
// case re-imports it in an isolated registry with a patched environment.
//
// Note: variables are blanked with '' rather than deleted. dotenv.config() only
// fills in keys that are absent from process.env, so deleting a key would let
// packages/backend/.env repopulate it and the case would test the developer's
// local .env instead of the intended default.

type Config = typeof import('./config').config;

// validateConfig() throws on load when these are absent and NODE_ENV is not
// 'test'. Supplying them by default keeps every case hermetic — the suite must
// not depend on whether a developer's packages/backend/.env happens to be
// loaded, which varies with the working directory dotenv resolves against.
const REQUIRED_ENV = {
  TRIPLYDB_ENDPOINT: 'https://triplydb.example/sparql',
  OPERATON_BASE_URL: 'http://localhost:8080/engine-rest',
};

function loadConfig(overrides: Record<string, string>): Config {
  const env = { ...REQUIRED_ENV, ...overrides };
  const saved: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(env)) {
    saved[key] = process.env[key];
    process.env[key] = value;
  }

  try {
    let mod!: { config: Config };
    jest.isolateModules(() => {
      mod = require('./config');
    });
    return mod.config;
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

describe('deployment tier label', () => {
  test.each([
    ['prod', 'PROD'],
    ['production', 'PROD'],
    ['acc', 'ACC'],
    ['acceptance', 'ACC'],
    ['staging', 'ACC'],
    ['dev', 'development'],
    ['development', 'development'],
    ['local', 'development'],
    ['test', 'test'],
  ])('DEPLOYMENT_ENV=%s displays as %s', (raw, expected) => {
    expect(loadConfig({ DEPLOYMENT_ENV: raw }).displayEnv).toBe(expected);
  });

  test('an unrecognised tier is passed through verbatim rather than guessed at', () => {
    const config = loadConfig({ DEPLOYMENT_ENV: 'sandbox' });

    expect(config.deploymentEnv).toBe('sandbox');
    expect(config.displayEnv).toBe('sandbox');
  });

  test('the raw value is lowercased and trimmed before matching', () => {
    const config = loadConfig({ DEPLOYMENT_ENV: '  ACC  ' });

    expect(config.deploymentEnv).toBe('acc');
    expect(config.displayEnv).toBe('ACC');
  });

  test('falls back to NODE_ENV when DEPLOYMENT_ENV is unset, so local dev is zero-config', () => {
    const config = loadConfig({ DEPLOYMENT_ENV: '', NODE_ENV: 'production' });

    expect(config.deploymentEnv).toBe('production');
    expect(config.displayEnv).toBe('PROD');
  });

  test('falls back to development when neither variable is set', () => {
    const config = loadConfig({ DEPLOYMENT_ENV: '', NODE_ENV: '' });

    expect(config.deploymentEnv).toBe('development');
    expect(config.displayEnv).toBe('development');
  });

  test('ACC and PROD are distinguishable even though both run NODE_ENV=production', () => {
    const acc = loadConfig({ NODE_ENV: 'production', DEPLOYMENT_ENV: 'acc' });
    const prod = loadConfig({ NODE_ENV: 'production', DEPLOYMENT_ENV: 'prod' });

    expect(acc.displayEnv).toBe('ACC');
    expect(prod.displayEnv).toBe('PROD');
  });
});

describe('environment predicates', () => {
  const savedNodeEnv = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = savedNodeEnv;
  });

  test('isProduction / isDevelopment / isTest reflect NODE_ENV', () => {
    const config = loadConfig({});

    process.env.NODE_ENV = 'production';
    expect([config.isProduction(), config.isDevelopment(), config.isTest()]).toEqual([
      true,
      false,
      false,
    ]);

    process.env.NODE_ENV = 'development';
    expect([config.isProduction(), config.isDevelopment(), config.isTest()]).toEqual([
      false,
      true,
      false,
    ]);

    process.env.NODE_ENV = 'test';
    expect([config.isProduction(), config.isDevelopment(), config.isTest()]).toEqual([
      false,
      false,
      true,
    ]);
  });
});

describe('value parsing', () => {
  test('numeric settings are parsed as base-10 integers', () => {
    const config = loadConfig({
      PORT: '8080',
      TRIPLYDB_TIMEOUT: '45000',
      OPERATON_TIMEOUT: '9000',
      DSO_TIMEOUT: '20000',
      CHAIN_EXECUTION_TIMEOUT: '7500',
      MAX_CHAIN_DEPTH: '25',
    });

    expect(config.port).toBe(8080);
    expect(config.triplydb.timeout).toBe(45000);
    expect(config.operaton.timeout).toBe(9000);
    expect(config.dso.timeout).toBe(20000);
    expect(config.performance.chainExecutionTimeout).toBe(7500);
    expect(config.performance.maxChainDepth).toBe(25);
  });

  test('numeric settings fall back to their defaults when unset', () => {
    const config = loadConfig({
      PORT: '',
      TRIPLYDB_TIMEOUT: '',
      OPERATON_TIMEOUT: '',
      DSO_TIMEOUT: '',
      CHAIN_EXECUTION_TIMEOUT: '',
      MAX_CHAIN_DEPTH: '',
    });

    expect(config.port).toBe(3001);
    expect(config.triplydb.timeout).toBe(30000);
    expect(config.operaton.timeout).toBe(10000);
    expect(config.dso.timeout).toBe(15000);
    expect(config.performance.chainExecutionTimeout).toBe(5000);
    expect(config.performance.maxChainDepth).toBe(10);
  });

  test('CORS_ORIGIN is split into a list of origins', () => {
    const config = loadConfig({ CORS_ORIGIN: 'https://a.example,https://b.example' });

    expect(config.corsOrigin).toEqual(['https://a.example', 'https://b.example']);
  });

  test('CORS_ORIGIN defaults to the local frontend', () => {
    expect(loadConfig({ CORS_ORIGIN: '' }).corsOrigin).toEqual(['http://localhost:3000']);
  });

  test('caching is opt-in — only the literal string "true" enables it', () => {
    expect(loadConfig({ ENABLE_CACHING: 'true' }).performance.enableCaching).toBe(true);
    expect(loadConfig({ ENABLE_CACHING: '1' }).performance.enableCaching).toBe(false);
    expect(loadConfig({ ENABLE_CACHING: '' }).performance.enableCaching).toBe(false);
  });

  test('eDOCS stub mode defaults to on, and only "false" turns it off', () => {
    expect(loadConfig({ EDOCS_STUB_MODE: '' }).edocs.stubMode).toBe(true);
    expect(loadConfig({ EDOCS_STUB_MODE: 'true' }).edocs.stubMode).toBe(true);
    expect(loadConfig({ EDOCS_STUB_MODE: 'false' }).edocs.stubMode).toBe(false);
  });

  test('DSO pre-production and production endpoints are configured independently', () => {
    const config = loadConfig({
      DSO_CATALOGUE_BASE_URL: 'https://pre.example/catalogus',
      DSO_CATALOGUE_BASE_URL_PROD: 'https://prod.example/catalogus',
      DSO_API_KEY: 'pre-key',
      DSO_API_KEY_PROD: 'prod-key',
    });

    expect(config.dso.catalogueBaseUrl).toBe('https://pre.example/catalogus');
    expect(config.dsoProd.catalogueBaseUrl).toBe('https://prod.example/catalogus');
    expect(config.dso.apiKey).toBe('pre-key');
    expect(config.dsoProd.apiKey).toBe('prod-key');
  });

  test('DSO defaults point at the pre-production service for the acc tier', () => {
    const config = loadConfig({ DSO_CATALOGUE_BASE_URL: '', DSO_RTR_BASE_URL: '' });

    expect(config.dso.catalogueBaseUrl).toContain('service.pre.omgevingswet.overheid.nl');
    expect(config.dso.rtrBaseUrl).toContain('service.pre.omgevingswet.overheid.nl');
  });
});

describe('validateConfig', () => {
  test('throws outside test runs when required settings are missing', () => {
    expect(() =>
      loadConfig({ NODE_ENV: 'production', TRIPLYDB_ENDPOINT: '', OPERATON_BASE_URL: '' })
    ).toThrow('Missing required configuration: triplydb.endpoint, operaton.baseUrl');
  });

  test('names only the settings that are actually missing', () => {
    expect(() =>
      loadConfig({
        NODE_ENV: 'production',
        TRIPLYDB_ENDPOINT: '',
        OPERATON_BASE_URL: 'http://localhost:8080/engine-rest',
      })
    ).toThrow('Missing required configuration: triplydb.endpoint');
  });

  test('tolerates missing settings under NODE_ENV=test so the suite can run unconfigured', () => {
    expect(() =>
      loadConfig({ NODE_ENV: 'test', TRIPLYDB_ENDPOINT: '', OPERATON_BASE_URL: '' })
    ).not.toThrow();
  });

  test('does not throw when both required settings are present', () => {
    expect(() =>
      loadConfig({
        NODE_ENV: 'production',
        TRIPLYDB_ENDPOINT: 'https://triplydb.example/sparql',
        OPERATON_BASE_URL: 'http://localhost:8080/engine-rest',
      })
    ).not.toThrow();
  });
});
