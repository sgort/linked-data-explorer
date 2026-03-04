import { ChainTestSuite, TestCase } from '../types/testCase.types';

const STORAGE_KEY = 'linkeddata-explorer-test-cases';

/**
 * Generate stable chain ID from DMN identifiers
 */
function generateChainId(dmnIds: string[]): string {
  // Sort to ensure same chain gets same ID regardless of how it was built
  return dmnIds.slice().sort().join('::');
}

/**
 * Storage structure per endpoint
 */
type TestCaseStorage = Record<string, ChainTestSuite[]>;

/**
 * Get all test suites for an endpoint
 */
export function getTestSuites(endpoint: string): ChainTestSuite[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];

    const storage: TestCaseStorage = JSON.parse(stored);
    return storage[endpoint] || [];
  } catch (error) {
    console.error('Error loading test suites:', error);
    return [];
  }
}

/**
 * Get test cases for a specific chain
 */
export function getTestCasesForChain(endpoint: string, chainDmns: string[]): TestCase[] {
  const chainId = generateChainId(chainDmns);
  const suites = getTestSuites(endpoint);
  const suite = suites.find((s) => s.chainId === chainId);
  return suite?.testCases || [];
}

/**
 * Save a new test case
 */
export function saveTestCase(
  endpoint: string,
  chainDmns: string[],
  testCase: Omit<TestCase, 'id' | 'createdAt'>
): TestCase {
  try {
    const chainId = generateChainId(chainDmns);
    const stored = localStorage.getItem(STORAGE_KEY);
    const storage: TestCaseStorage = stored ? JSON.parse(stored) : {};

    // Ensure endpoint exists
    if (!storage[endpoint]) {
      storage[endpoint] = [];
    }

    // Find or create suite for this chain
    let suite = storage[endpoint].find((s) => s.chainId === chainId);
    if (!suite) {
      suite = {
        chainId,
        chainDmns: chainDmns.slice(), // Store original order
        testCases: [],
      };
      storage[endpoint].push(suite);
    }

    // Create new test case
    const newTestCase: TestCase = {
      ...testCase,
      id: `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date().toISOString(),
    };

    suite.testCases.push(newTestCase);

    // Save back to localStorage
    localStorage.setItem(STORAGE_KEY, JSON.stringify(storage));

    return newTestCase;
  } catch (error) {
    console.error('Error saving test case:', error);
    throw new Error('Failed to save test case');
  }
}

/**
 * Update an existing test case
 */
export function updateTestCase(
  endpoint: string,
  chainDmns: string[],
  testCaseId: string,
  updates: Partial<Omit<TestCase, 'id' | 'createdAt'>>
): TestCase | null {
  try {
    const chainId = generateChainId(chainDmns);
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;

    const storage: TestCaseStorage = JSON.parse(stored);
    const suite = storage[endpoint]?.find((s) => s.chainId === chainId);
    if (!suite) return null;

    const testCase = suite.testCases.find((tc) => tc.id === testCaseId);
    if (!testCase) return null;

    // Update test case
    Object.assign(testCase, updates);

    // Save back
    localStorage.setItem(STORAGE_KEY, JSON.stringify(storage));

    return testCase;
  } catch (error) {
    console.error('Error updating test case:', error);
    return null;
  }
}

/**
 * Delete a test case
 */
export function deleteTestCase(endpoint: string, chainDmns: string[], testCaseId: string): boolean {
  try {
    const chainId = generateChainId(chainDmns);
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return false;

    const storage: TestCaseStorage = JSON.parse(stored);
    const suite = storage[endpoint]?.find((s) => s.chainId === chainId);
    if (!suite) return false;

    const index = suite.testCases.findIndex((tc) => tc.id === testCaseId);
    if (index === -1) return false;

    suite.testCases.splice(index, 1);

    // Save back
    localStorage.setItem(STORAGE_KEY, JSON.stringify(storage));

    return true;
  } catch (error) {
    console.error('Error deleting test case:', error);
    return false;
  }
}

/**
 * Clear all test cases for debugging
 */
export function clearAllTestCases(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Export test cases as JSON
 */
export function exportTestCases(): string {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored || '{}';
}

/**
 * Import test cases from JSON
 */
export function importTestCases(json: string): boolean {
  try {
    const parsed = JSON.parse(json);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
    return true;
  } catch (error) {
    console.error('Error importing test cases:', error);
    return false;
  }
}
