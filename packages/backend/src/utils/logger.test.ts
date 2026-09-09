/* eslint-disable @typescript-eslint/no-require-imports */
// logger.ts configures Winston from environment variables at import time and
// creates logs/ as a module side-effect, so each case re-imports it in an
// isolated registry with fs stubbed out.

import type winstonType from 'winston';
import type { Logger } from 'winston';

const MESSAGE = Symbol.for('message');

interface LoggerModule {
  logger: Logger;
  default: Logger;
}

interface LoadResult {
  mod: LoggerModule;
  winston: typeof winstonType;
  existsSync: jest.Mock;
  mkdirSync: jest.Mock;
}

function loadLogger(env: Record<string, string | undefined>, logsDirExists = true): LoadResult {
  const saved: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(env)) {
    saved[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  const existsSync = jest.fn().mockReturnValue(logsDirExists);
  const mkdirSync = jest.fn();

  let mod!: LoggerModule;
  let winston!: typeof winstonType;
  try {
    jest.isolateModules(() => {
      jest.doMock('fs', () => ({
        ...jest.requireActual('fs'),
        existsSync,
        mkdirSync,
      }));
      mod = require('./logger');
      // Loaded from the same isolated registry as the logger under test, so the
      // transport class below is the one its Logger instance actually accepts.
      winston = require('winston');
    });
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    jest.dontMock('fs');
  }

  return { mod, winston, existsSync, mkdirSync };
}

/**
 * Log one record and return what the logger's own format produced. Going
 * through logger.log() rather than calling format.transform() directly keeps
 * the assertions on the real pipeline — and swapping in a silent transport
 * stops the file transports from writing into logs/ during the test run.
 */
async function capture(
  loaded: LoadResult,
  level: string,
  message: string,
  meta?: Record<string, unknown>
): Promise<string> {
  const { mod, winston } = loaded;
  mod.logger.clear();
  mod.logger.add(new winston.transports.Console({ silent: true }));

  const lines: string[] = [];
  mod.logger.on('data', (info: Record<symbol, string>) => lines.push(info[MESSAGE]));
  mod.logger.log(level, message, meta);
  await new Promise((resolve) => setImmediate(resolve));

  return lines[0];
}

/** Strip colorize's ANSI escapes so assertions read on the text. */
// eslint-disable-next-line no-control-regex
const stripAnsi = (s: string): string => s.replace(/\[[0-9;]*m/g, '');

describe('logger module shape', () => {
  test('named and default exports are the same instance', () => {
    const { mod } = loadLogger({});

    expect(mod.default).toBe(mod.logger);
  });

  test('writes to the console plus separate error and combined log files', () => {
    const { mod } = loadLogger({});

    const filenames = mod.logger.transports
      .map((t) => (t as { filename?: string }).filename)
      .filter(Boolean);

    expect(mod.logger.transports).toHaveLength(3);
    expect(filenames).toEqual(['error.log', 'combined.log']);
  });

  test('the error log only accepts error-level records', () => {
    const { mod } = loadLogger({});

    const errorTransport = mod.logger.transports.find(
      (t) => (t as { filename?: string }).filename === 'error.log'
    );

    expect(errorTransport?.level).toBe('error');
  });
});

describe('log level', () => {
  test('honours LOG_LEVEL', () => {
    const { mod } = loadLogger({ LOG_LEVEL: 'debug' });

    expect(mod.logger.level).toBe('debug');
  });

  test('falls back to info when LOG_LEVEL is unset', () => {
    const { mod } = loadLogger({ LOG_LEVEL: '' });

    expect(mod.logger.level).toBe('info');
  });
});

describe('log format', () => {
  test('emits machine-readable JSON by default', async () => {
    const line = await capture(loadLogger({ LOG_FORMAT: '' }), 'info', 'started', { port: 3001 });

    expect(JSON.parse(line)).toEqual({ level: 'info', message: 'started', port: 3001 });
  });

  test('emits JSON when LOG_FORMAT is explicitly json', async () => {
    const line = await capture(loadLogger({ LOG_FORMAT: 'json' }), 'warn', 'slow');

    expect(JSON.parse(line)).toEqual({ level: 'warn', message: 'slow' });
  });

  test('renders a timestamped human-readable line when LOG_FORMAT is pretty', async () => {
    const line = stripAnsi(
      await capture(loadLogger({ LOG_FORMAT: 'pretty' }), 'info', 'chain executed', {
        durationMs: 12,
      })
    );

    expect(line).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} \[info\]: chain executed /);
    expect(line).toContain('"durationMs": 12');
  });

  test('pretty format omits the metadata block when there is no metadata', async () => {
    const line = stripAnsi(await capture(loadLogger({ LOG_FORMAT: 'pretty' }), 'info', 'ready'));

    expect(line).toMatch(/\[info\]: ready $/);
  });
});

describe('logs directory bootstrap', () => {
  test('creates logs/ when it does not exist yet, before Winston opens the files', () => {
    const { existsSync, mkdirSync } = loadLogger({}, false);

    expect(existsSync).toHaveBeenCalledWith('logs');
    expect(mkdirSync).toHaveBeenCalledWith('logs');
  });

  test('leaves an existing logs/ directory alone', () => {
    const { mkdirSync } = loadLogger({}, true);

    expect(mkdirSync).not.toHaveBeenCalled();
  });
});
