import fs from 'fs';
import os from 'os';
import path from 'path';

import { BUILD_INFO_PATH, getBuildInfo, readBuildInfo } from './buildInfo';

const SHA = '56c9605c68e9a1b2c3d4e5f60718293a4b5c6d7e';

const UNTRACKED = { sha: '', shortSha: '', run: '', isTracked: false, label: 'local build' };

let dir: string;

beforeEach(() => {
  // One directory per test, so parallel workers never share a file.
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'build-info-'));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function writeFile(content: string): string {
  const file = path.join(dir, 'build-info.json');
  fs.writeFileSync(file, content);
  return file;
}

describe('readBuildInfo', () => {
  test('describes a build recorded by the deploy workflow', () => {
    const file = writeFile(JSON.stringify({ sha: SHA, run: '412', runId: '34874562304' }));

    expect(readBuildInfo(file)).toEqual({
      sha: SHA,
      shortSha: '56c9605',
      run: '412',
      isTracked: true,
      label: 'build 56c9605 · #412',
    });
  });

  test('trims surrounding whitespace from both values', () => {
    const file = writeFile(JSON.stringify({ sha: ` ${SHA}\n`, run: ' 412 ' }));

    expect(readBuildInfo(file)).toMatchObject({ sha: SHA, run: '412', isTracked: true });
  });

  test('reports a local build when there is no file', () => {
    expect(readBuildInfo(path.join(dir, 'absent.json'))).toEqual(UNTRACKED);
  });

  // A run number with no SHA implies provenance the build does not have, and a
  // SHA with no run number cannot tell two builds of one commit apart.
  test('a run number without a SHA counts as untracked', () => {
    const file = writeFile(JSON.stringify({ sha: '', run: '412' }));

    expect(readBuildInfo(file)).toEqual(UNTRACKED);
  });

  test('a SHA without a run number counts as untracked', () => {
    const file = writeFile(JSON.stringify({ sha: SHA }));

    expect(readBuildInfo(file)).toEqual(UNTRACKED);
  });

  test('a value that is not a string counts as missing', () => {
    const file = writeFile(JSON.stringify({ sha: SHA, run: 412 }));

    expect(readBuildInfo(file)).toEqual(UNTRACKED);
  });

  test('an unreadable file reports a local build instead of throwing', () => {
    // A directory at the path makes the read itself fail, on every platform.
    const file = path.join(dir, 'build-info.json');
    fs.mkdirSync(file);

    expect(readBuildInfo(file)).toEqual(UNTRACKED);
  });

  test('malformed JSON reports a local build instead of throwing', () => {
    const file = writeFile('{ "sha": ');

    expect(readBuildInfo(file)).toEqual(UNTRACKED);
  });

  test('JSON that is not an object reports a local build', () => {
    const file = writeFile('null');

    expect(readBuildInfo(file)).toEqual(UNTRACKED);
  });

  test('returns a fresh object, so a caller cannot alter the fallback', () => {
    const first = readBuildInfo(path.join(dir, 'absent.json'));
    first.label = 'changed';

    expect(readBuildInfo(path.join(dir, 'absent.json')).label).toBe('local build');
  });
});

describe('BUILD_INFO_PATH', () => {
  // The deploy workflows write deploy/build-info.json, next to package.json.
  test('points at the package root, where package.json also lives', () => {
    expect(path.basename(BUILD_INFO_PATH)).toBe('build-info.json');
    expect(fs.existsSync(path.join(path.dirname(BUILD_INFO_PATH), 'package.json'))).toBe(true);
  });
});

describe('getBuildInfo', () => {
  test('reads once and returns the same answer thereafter', () => {
    const first = getBuildInfo();

    expect(first.label).toEqual(expect.any(String));
    expect(getBuildInfo()).toBe(first);
  });
});
