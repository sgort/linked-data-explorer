// @vitest-environment jsdom
import { beforeEach, describe, expect, test } from 'vitest';

import { getStoredVersion, setStoredVersion } from './exampleVersions';

beforeEach(() => {
  localStorage.clear();
});

describe('getStoredVersion', () => {
  test('returns 0 when nothing has ever been seeded', () => {
    expect(getStoredVersion('example_awb_process')).toBe(0);
  });

  test('returns the stored version for a known example', () => {
    setStoredVersion('example_awb_process', 4);
    expect(getStoredVersion('example_awb_process')).toBe(4);
  });

  test('returns 0 when localStorage holds invalid JSON', () => {
    localStorage.setItem('linkedDataExplorer_exampleVersions', 'not json');
    expect(getStoredVersion('example_awb_process')).toBe(0);
  });
});

describe('setStoredVersion', () => {
  test('persists across separate calls without clobbering other entries', () => {
    setStoredVersion('example_awb_process', 4);
    setStoredVersion('example_tree_felling', 6);

    expect(getStoredVersion('example_awb_process')).toBe(4);
    expect(getStoredVersion('example_tree_felling')).toBe(6);
  });

  test('overwrites an existing entry for the same example', () => {
    setStoredVersion('example_awb_process', 1);
    setStoredVersion('example_awb_process', 2);
    expect(getStoredVersion('example_awb_process')).toBe(2);
  });

  test('does not throw when localStorage already holds invalid JSON', () => {
    localStorage.setItem('linkedDataExplorer_exampleVersions', 'not json');
    expect(() => setStoredVersion('example_awb_process', 1)).not.toThrow();
  });
});
