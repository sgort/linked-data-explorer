// @vitest-environment jsdom
import { beforeEach, describe, expect, test } from 'vitest';

import { getTemplateTestCases, initializeDefaultTestCases } from './defaultTestCases';
import { clearAllTestCases, getTestCasesForChain } from './testCaseStorage';

const ENDPOINT = 'https://api.open-regels.triply.cc/datasets/x/facts/sparql';

beforeEach(() => {
  clearAllTestCases();
});

describe('initializeDefaultTestCases', () => {
  test('seeds test cases for every template on a fresh endpoint', () => {
    initializeDefaultTestCases(ENDPOINT);
    expect(getTestCasesForChain(ENDPOINT, ['SVB_LeeftijdsInformatie'])).not.toEqual([]);
  });

  test('is idempotent — does not duplicate test cases on a second call', () => {
    initializeDefaultTestCases(ENDPOINT);
    const firstCount = getTestCasesForChain(ENDPOINT, ['SVB_LeeftijdsInformatie']).length;

    initializeDefaultTestCases(ENDPOINT);
    const secondCount = getTestCasesForChain(ENDPOINT, ['SVB_LeeftijdsInformatie']).length;

    expect(secondCount).toBe(firstCount);
  });
});

describe('getTemplateTestCases', () => {
  test('returns [] for an unknown template id', () => {
    expect(getTemplateTestCases('no-such-template', ENDPOINT)).toEqual([]);
  });

  test('returns [] for a known template before seeding', () => {
    expect(getTemplateTestCases('age-verification', ENDPOINT)).toEqual([]);
  });

  test('returns the seeded test cases for a known template after initialization', () => {
    initializeDefaultTestCases(ENDPOINT);
    expect(getTemplateTestCases('age-verification', ENDPOINT).length).toBeGreaterThan(0);
  });
});
