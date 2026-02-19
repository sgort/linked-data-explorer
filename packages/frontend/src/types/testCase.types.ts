export interface TestCase {
  id: string;
  name: string;
  description?: string;
  inputs: Record<string, unknown>;
  expectedOutputs?: Record<string, unknown>;
  tags?: string[];
  createdAt: string;
  lastRun?: string;
  lastResult?: 'pass' | 'fail' | 'pending';
}

export interface ChainTestSuite {
  chainId: string; // Hash of sorted DMN IDs
  chainDmns: string[]; // Original order
  testCases: TestCase[];
}

export interface TestCaseExecution {
  testCaseId: string;
  executionTime: number;
  passed: boolean;
  actualOutputs: Record<string, unknown>;
  mismatches?: Array<{
    key: string;
    expected: unknown;
    actual: unknown;
  }>;
}
