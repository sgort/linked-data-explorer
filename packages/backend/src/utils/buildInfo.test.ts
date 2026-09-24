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

  // The test above pins THAT the read is cached. This one pins WHEN it happens,
  // which is the part that matters and the part nothing covered.
  //
  // A zip deploy overwrites build-info.json while the PREVIOUS process is still
  // serving; the restart comes afterwards. So the file does change under a
  // running process -- which is what the comment on getBuildInfo used to deny.
  // Reading it lazily let that old process report the NEW build the moment
  // something first asked, and the first thing to ask is the deploy's own
  // build.sha check. A false pass in the gate whose whole purpose is to prove
  // the new build is serving.
  //
  // Seen on production on 24 September 2026, promotion e71c4a4: the check read
  // build.sha = e71c4a4 and, two seconds later, version = 2026.09.5 -- the
  // previous release. One process: version is bound at module load, build.sha
  // was read from disk afterwards. The plan has capacity 1, so two instances
  // could not explain it.
  test('reports the build it loaded with, even after the file changes underneath', async () => {
    const real = jest.requireActual<typeof fs>('fs').readFileSync;
    // Whatever is on disk right now. The deploy changes it mid-test.
    let onDisk = JSON.stringify({ sha: SHA, run: '412' });

    const spy = jest.spyOn(fs, 'readFileSync').mockImplementation(((
      file: fs.PathOrFileDescriptor,
      options?: unknown
    ) => {
      if (String(file).endsWith('build-info.json')) return onDisk;
      return (real as (...args: unknown[]) => unknown)(file, options);
    }) as typeof fs.readFileSync);

    let loaded!: typeof import('./buildInfo');
    try {
      await jest.isolateModulesAsync(async () => {
        loaded = await import('./buildInfo');
      });

      // The deploy lands: build-info.json on disk is now a different build,
      // while this process keeps serving.
      onDisk = JSON.stringify({ sha: SHA, run: '999' });

      // Read at module load, the overwrite is never observed. Read lazily, this
      // process reports 999 -- a build it is not running.
      expect(loaded.getBuildInfo().run).toBe('412');
    } finally {
      spy.mockRestore();
    }
  });
});
