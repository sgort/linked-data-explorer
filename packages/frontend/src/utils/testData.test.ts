import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('../testData.json', () => ({
  default: {
    dmnTestData: {
      DMN_A: {
        description: 'Age calculation DMN',
        defaultInputs: { dagVanAanvraag: '2026-01-14', geboortedatum: '1975-05-15' },
        scenarios: {
          young: { geboortedatum: '2005-06-15', dagVanAanvraag: '2026-01-14' },
        },
      },
      DMN_B: {
        description: 'No-scenario DMN',
        defaultInputs: { inkomen: 2000 },
      },
    },
    chainTemplates: {
      'template-1': {
        name: 'Template One',
        description: 'desc',
        dmnIds: ['DMN_A'],
        scenario: 'young',
        testInputs: { geboortedatum: '2005-06-15' },
      },
    },
  },
}));

// Import after the mock so the module picks up the mocked JSON.
const {
  getAvailableScenarios,
  getAvailableTemplates,
  getCombinedTestData,
  getScenarioData,
  getTemplateData,
} = await import('./testData');

beforeEach(() => {
  vi.useRealTimers();
});

describe('getCombinedTestData', () => {
  test('merges inputs from multiple DMNs, replacing dagVanAanvraag with today', () => {
    const fixedNow = new Date('2026-07-22T00:00:00.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);

    const result = getCombinedTestData(['DMN_A', 'DMN_B']);

    expect(result).toEqual({
      dagVanAanvraag: '2026-07-22',
      geboortedatum: '1975-05-15',
      inkomen: 2000,
    });
  });

  test('ignores unknown DMN ids', () => {
    expect(getCombinedTestData(['NOT_A_REAL_DMN'])).toEqual({});
  });
});

describe('getScenarioData', () => {
  test('returns the named scenario when it exists', () => {
    expect(getScenarioData('DMN_A', 'young')).toEqual({
      geboortedatum: '2005-06-15',
      dagVanAanvraag: '2026-01-14',
    });
  });

  test('falls back to defaultInputs when the scenario does not exist', () => {
    expect(getScenarioData('DMN_A', 'no-such-scenario')).toEqual({
      dagVanAanvraag: '2026-01-14',
      geboortedatum: '1975-05-15',
    });
  });

  test('returns null for an unknown DMN', () => {
    expect(getScenarioData('NOT_A_REAL_DMN', 'young')).toBeNull();
  });
});

describe('getTemplateData', () => {
  test('returns testInputs for a known template', () => {
    expect(getTemplateData('template-1')).toEqual({ geboortedatum: '2005-06-15' });
  });

  test('returns null for an unknown template', () => {
    expect(getTemplateData('no-such-template')).toBeNull();
  });
});

describe('getAvailableScenarios', () => {
  test('lists scenario names for a DMN that has scenarios', () => {
    expect(getAvailableScenarios('DMN_A')).toEqual(['young']);
  });

  test('returns [] for a DMN with no scenarios', () => {
    expect(getAvailableScenarios('DMN_B')).toEqual([]);
  });

  test('returns [] for an unknown DMN', () => {
    expect(getAvailableScenarios('NOT_A_REAL_DMN')).toEqual([]);
  });
});

describe('getAvailableTemplates', () => {
  test('lists all template ids', () => {
    expect(getAvailableTemplates()).toEqual(['template-1']);
  });
});
