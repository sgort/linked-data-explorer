/* eslint-disable @typescript-eslint/no-require-imports */
// pool.ts is a module-level singleton whose behaviour depends entirely on
// config.database.url at import time, so every case re-imports it in isolation
// with a different mocked config.

const mockPoolCtor = jest.fn();
const mockOn = jest.fn();
const mockWarn = jest.fn();
const mockError = jest.fn();

jest.mock('pg', () => ({
  __esModule: true,
  Pool: class {
    on = mockOn;
    constructor(opts: unknown) {
      mockPoolCtor(opts);
    }
  },
}));

jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: {
    warn: (...a: unknown[]) => mockWarn(...a),
    error: (...a: unknown[]) => mockError(...a),
  },
}));

const configMock = { database: { url: '' } };
jest.mock('../utils/config', () => ({
  __esModule: true,
  config: configMock,
  default: configMock,
}));

function loadPool(databaseUrl: string) {
  configMock.database.url = databaseUrl;
  let loaded: unknown;
  jest.isolateModules(() => {
    loaded = require('./pool').default;
  });
  return loaded;
}

beforeEach(() => {
  mockPoolCtor.mockClear();
  mockOn.mockClear();
  mockWarn.mockClear();
  mockError.mockClear();
});

describe('db/pool', () => {
  test('creates a pool from DATABASE_URL when one is configured', () => {
    const pool = loadPool('postgres://user:pw@localhost:5432/lde');

    expect(pool).not.toBeNull();
    expect(mockPoolCtor).toHaveBeenCalledWith({
      connectionString: 'postgres://user:pw@localhost:5432/lde',
    });
    expect(mockWarn).not.toHaveBeenCalled();
  });

  test('registers an error handler so an idle-client failure cannot crash the process', () => {
    loadPool('postgres://localhost/lde');

    expect(mockOn).toHaveBeenCalledWith('error', expect.any(Function));

    const handler = mockOn.mock.calls[0][1] as (err: Error) => void;
    handler(new Error('connection terminated unexpectedly'));

    expect(mockError).toHaveBeenCalledWith('[DB] Unexpected pool error', {
      error: 'connection terminated unexpectedly',
    });
  });

  test('exports null and warns when DATABASE_URL is absent, leaving asset storage disabled', () => {
    const pool = loadPool('');

    expect(pool).toBeNull();
    expect(mockPoolCtor).not.toHaveBeenCalled();
    expect(mockWarn).toHaveBeenCalledWith(
      '[DB] DATABASE_URL not configured — asset storage disabled'
    );
  });
});
