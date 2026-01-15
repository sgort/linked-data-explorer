/**
 * Test data for DMN chain execution
 * Imports from shared testData.json for consistency
 */

import testDataConfig from '../../../../testData.json';

// Inline type definitions (to avoid rootDir issues)
interface DmnTestInputs {
  [key: string]: string | number | boolean | null;
}

interface DmnTestDataConfig {
  description: string;
  defaultInputs: DmnTestInputs;
  scenarios?: {
    [scenarioName: string]: DmnTestInputs;
  };
}

interface ChainTemplateConfig {
  name: string;
  description: string;
  dmnIds: string[];
  scenario: string;
  testInputs: DmnTestInputs;
}

interface TestDataConfig {
  dmnTestData: {
    [dmnId: string]: DmnTestDataConfig;
  };
  chainTemplates: {
    [templateId: string]: ChainTemplateConfig;
  };
}

// Type assertion for imported JSON
const typedTestData = testDataConfig as TestDataConfig;

// Re-export the DMN test data for easy access
export const DMN_TEST_DATA: Record<string, DmnTestInputs> = Object.entries(
  typedTestData.dmnTestData
).reduce(
  (acc, [dmnId, config]) => {
    acc[dmnId] = config.defaultInputs;
    return acc;
  },
  {} as Record<string, DmnTestInputs>
);

/**
 * Get combined test data for a list of DMN identifiers
 * Replaces request date with current date, keeps birth dates static
 *
 * @param dmnIds - Array of DMN identifiers
 * @returns Combined test data object with current date for requests only
 */
export function getCombinedTestData(dmnIds: string[]): Record<string, unknown> {
  const combined: Record<string, unknown> = {};
  const today = new Date().toISOString().split('T')[0];

  dmnIds.forEach((dmnId) => {
    const dmnData = DMN_TEST_DATA[dmnId];
    if (dmnData) {
      // Merge data, only replacing request date with today
      Object.entries(dmnData).forEach(([key, value]) => {
        // Only replace dagVanAanvraag with today, keep birth dates static
        if (key === 'dagVanAanvraag') {
          combined[key] = today;
        } else {
          combined[key] = value;
        }
      });
    }
  });

  return combined;
}

/**
 * Get test data for a specific scenario
 *
 * @param dmnId - DMN identifier
 * @param scenario - Scenario name (e.g., 'young_single', 'elderly_couple')
 * @returns Scenario test data or default if not found
 */
export function getScenarioData(dmnId: string, scenario: string): DmnTestInputs | null {
  const dmnConfig = typedTestData.dmnTestData[dmnId];
  if (!dmnConfig) return null;

  const scenarioData = dmnConfig.scenarios?.[scenario];
  return scenarioData || dmnConfig.defaultInputs;
}

/**
 * Get template test data
 *
 * @param templateId - Template identifier
 * @returns Template test inputs
 */
export function getTemplateData(templateId: string): DmnTestInputs | null {
  const template = typedTestData.chainTemplates[templateId];
  return template?.testInputs || null;
}

/**
 * Get all available scenarios for a DMN
 *
 * @param dmnId - DMN identifier
 * @returns Array of scenario names
 */
export function getAvailableScenarios(dmnId: string): string[] {
  const dmnConfig = typedTestData.dmnTestData[dmnId];
  return dmnConfig?.scenarios ? Object.keys(dmnConfig.scenarios) : [];
}

/**
 * Get all available template IDs
 *
 * @returns Array of template identifiers
 */
export function getAvailableTemplates(): string[] {
  return Object.keys(typedTestData.chainTemplates);
}
