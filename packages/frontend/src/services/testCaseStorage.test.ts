// @vitest-environment jsdom
import { beforeEach, describe, expect, test } from 'vitest';

import {
  clearAllTestCases,
  deleteTestCase,
  exportTestCases,
  getTestCasesForChain,
  getTestSuites,
  importTestCases,
  saveTestCase,
  updateTestCase,
} from './testCaseStorage';

const ENDPOINT = 'https://api.open-regels.triply.cc/datasets/x/facts/sparql';
const DMNS = ['dmn-b', 'dmn-a'];

beforeEach(() => {
  clearAllTestCases();
});

describe('getTestSuites / getTestCasesForChain', () => {
  test('return [] when nothing has been saved', () => {
    expect(getTestSuites(ENDPOINT)).toEqual([]);
    expect(getTestCasesForChain(ENDPOINT, DMNS)).toEqual([]);
  });

  test('return [] when localStorage holds invalid JSON', () => {
    localStorage.setItem('linkeddata-explorer-test-cases', 'not json');
    expect(getTestSuites(ENDPOINT)).toEqual([]);
  });
});

describe('saveTestCase', () => {
  test('creates a suite keyed by a chain id that ignores DMN order', () => {
    saveTestCase(ENDPOINT, DMNS, { name: 'Case 1', inputs: { a: 1 } });

    // Same DMNs, different order — must resolve to the same chain/suite.
    const reordered = getTestCasesForChain(ENDPOINT, ['dmn-a', 'dmn-b']);
    expect(reordered).toHaveLength(1);
    expect(reordered[0].name).toBe('Case 1');
  });

  test('assigns a unique id and createdAt to the new test case', () => {
    const tc = saveTestCase(ENDPOINT, DMNS, { name: 'Case 1', inputs: {} });
    expect(tc.id).toMatch(/^test-/);
    expect(tc.createdAt).toBeTruthy();
  });

  test('appends to an existing suite rather than replacing it', () => {
    saveTestCase(ENDPOINT, DMNS, { name: 'Case 1', inputs: {} });
    saveTestCase(ENDPOINT, DMNS, { name: 'Case 2', inputs: {} });
    expect(getTestCasesForChain(ENDPOINT, DMNS)).toHaveLength(2);
  });

  test('keeps separate suites per endpoint', () => {
    saveTestCase(ENDPOINT, DMNS, { name: 'Case 1', inputs: {} });
    saveTestCase('https://other.example.com/sparql', DMNS, { name: 'Other', inputs: {} });
    expect(getTestCasesForChain(ENDPOINT, DMNS)).toHaveLength(1);
  });
});

describe('updateTestCase', () => {
  test('updates fields on an existing test case', () => {
    const tc = saveTestCase(ENDPOINT, DMNS, { name: 'Case 1', inputs: {} });
    const updated = updateTestCase(ENDPOINT, DMNS, tc.id, { name: 'Renamed' });
    expect(updated?.name).toBe('Renamed');
    expect(getTestCasesForChain(ENDPOINT, DMNS)[0].name).toBe('Renamed');
  });

  test('returns null when nothing has ever been saved', () => {
    expect(updateTestCase(ENDPOINT, DMNS, 'no-such-id', { name: 'x' })).toBeNull();
  });

  test('returns null when the suite exists but the test case id does not', () => {
    saveTestCase(ENDPOINT, DMNS, { name: 'Case 1', inputs: {} });
    expect(updateTestCase(ENDPOINT, DMNS, 'no-such-id', { name: 'x' })).toBeNull();
  });
});

describe('deleteTestCase', () => {
  test('removes the matching test case and returns true', () => {
    const tc = saveTestCase(ENDPOINT, DMNS, { name: 'Case 1', inputs: {} });
    expect(deleteTestCase(ENDPOINT, DMNS, tc.id)).toBe(true);
    expect(getTestCasesForChain(ENDPOINT, DMNS)).toEqual([]);
  });

  test('returns false when nothing has ever been saved', () => {
    expect(deleteTestCase(ENDPOINT, DMNS, 'no-such-id')).toBe(false);
  });

  test('returns false when the id does not match any test case', () => {
    saveTestCase(ENDPOINT, DMNS, { name: 'Case 1', inputs: {} });
    expect(deleteTestCase(ENDPOINT, DMNS, 'no-such-id')).toBe(false);
  });
});

describe('export / import', () => {
  test('exportTestCases returns "{}" when nothing is stored', () => {
    expect(exportTestCases()).toBe('{}');
  });

  test('round-trips through export -> import', () => {
    saveTestCase(ENDPOINT, DMNS, { name: 'Case 1', inputs: {} });
    const exported = exportTestCases();

    clearAllTestCases();
    expect(getTestCasesForChain(ENDPOINT, DMNS)).toEqual([]);

    expect(importTestCases(exported)).toBe(true);
    expect(getTestCasesForChain(ENDPOINT, DMNS)).toHaveLength(1);
  });

  test('importTestCases returns false for invalid JSON, without touching storage', () => {
    saveTestCase(ENDPOINT, DMNS, { name: 'Case 1', inputs: {} });
    expect(importTestCases('not json')).toBe(false);
    expect(getTestCasesForChain(ENDPOINT, DMNS)).toHaveLength(1);
  });
});
