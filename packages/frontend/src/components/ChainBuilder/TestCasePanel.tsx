import { Save, TestTube, Trash2, X } from 'lucide-react';
import React, { useState } from 'react';

import {
  deleteTestCase,
  getTestCasesForChain,
  saveTestCase,
  updateTestCase,
} from '../../services/testCaseStorage';
import { DmnModel } from '../../types';
import { TestCase } from '../../types/testCase.types';

interface TestCasePanelProps {
  chain: DmnModel[];
  endpoint: string;
  currentInputs: Record<string, unknown>;
  onLoadTestCase: (testCase: TestCase) => void;
}

const TestCasePanel: React.FC<TestCasePanelProps> = ({
  chain,
  endpoint,
  currentInputs,
  onLoadTestCase,
}) => {
  const [testCases, setTestCases] = useState<TestCase[]>(() =>
    getTestCasesForChain(
      endpoint,
      chain.map((d) => d.identifier)
    )
  );
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [testCaseName, setTestCaseName] = useState('');
  const [testCaseDescription, setTestCaseDescription] = useState('');

  const loadTestCases = () => {
    const cases = getTestCasesForChain(
      endpoint,
      chain.map((d) => d.identifier)
    );
    setTestCases(cases);
  };

  const handleSaveTestCase = () => {
    if (!testCaseName.trim()) {
      alert('Please enter a test case name');
      return;
    }

    try {
      const newTestCase = saveTestCase(
        endpoint,
        chain.map((d) => d.identifier),
        {
          name: testCaseName,
          description: testCaseDescription || undefined,
          inputs: currentInputs,
          tags: ['user-created'],
        }
      );

      setTestCases([...testCases, newTestCase]);
      setShowSaveModal(false);
      setTestCaseName('');
      setTestCaseDescription('');
    } catch (error) {
      console.error('Failed to save test case:', error);
      alert('Failed to save test case');
    }
  };

  const handleDeleteTestCase = (testCaseId: string) => {
    if (!confirm('Delete this test case?')) return;

    const success = deleteTestCase(
      endpoint,
      chain.map((d) => d.identifier),
      testCaseId
    );

    if (success) {
      setTestCases(testCases.filter((tc) => tc.id !== testCaseId));
    }
  };

  const handleLoadTestCase = (testCase: TestCase) => {
    // Update last run timestamp
    updateTestCase(
      endpoint,
      chain.map((d) => d.identifier),
      testCase.id,
      {
        lastRun: new Date().toISOString(),
      }
    );

    loadTestCases();
    onLoadTestCase(testCase);
  };

  if (chain.length === 0) {
    return null;
  }

  return (
    <div className="border-b border-slate-200">
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <TestTube size={18} className="text-indigo-600" />
            <span className="font-medium text-slate-900">Test Cases</span>
            <span className="text-xs text-slate-500">({testCases.length})</span>
          </div>
          <button
            onClick={() => setShowSaveModal(true)}
            className="flex items-center gap-1 px-3 py-1 text-xs bg-indigo-600 hover:bg-indigo-700 text-white rounded transition-colors"
          >
            <Save size={14} />
            Save Current
          </button>
        </div>

        {/* Test Case List */}
        <div className="space-y-2">
          {testCases.length === 0 ? (
            <div className="text-xs text-center text-slate-500 py-4 bg-slate-50 rounded-lg">
              No test cases yet. Save your current inputs to create one.
            </div>
          ) : (
            testCases.map((testCase) => (
              <div
                key={testCase.id}
                className="flex items-center gap-2 bg-slate-50 hover:bg-slate-100 p-2 rounded-lg transition-colors"
              >
                <button
                  onClick={() => handleLoadTestCase(testCase)}
                  className="flex-1 text-left text-sm"
                >
                  <div className="font-medium text-slate-900">{testCase.name}</div>
                  {testCase.description && (
                    <div className="text-xs text-slate-500 mt-0.5">{testCase.description}</div>
                  )}
                  <div className="text-xs text-slate-400 mt-1">
                    {Object.keys(testCase.inputs).length} input
                    {Object.keys(testCase.inputs).length !== 1 ? 's' : ''}
                    {testCase.lastRun && (
                      <span className="ml-2">
                        • Last run: {new Date(testCase.lastRun).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </button>
                <button
                  onClick={() => handleDeleteTestCase(testCase.id)}
                  className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Save Test Case Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-96 max-w-[90vw]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Save Test Case</h3>
              <button
                onClick={() => {
                  setShowSaveModal(false);
                  setTestCaseName('');
                  setTestCaseDescription('');
                }}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Test Case Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={testCaseName}
                  onChange={(e) => setTestCaseName(e.target.value)}
                  placeholder="e.g., Happy Path - Age 65"
                  className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Description (optional)
                </label>
                <textarea
                  value={testCaseDescription}
                  onChange={(e) => setTestCaseDescription(e.target.value)}
                  placeholder="Describe what this test case covers..."
                  rows={3}
                  className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

              <div className="text-xs text-slate-500 bg-slate-50 p-3 rounded">
                Current inputs will be saved with this test case. You can load it later to quickly
                populate the input form.
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={() => {
                  setShowSaveModal(false);
                  setTestCaseName('');
                  setTestCaseDescription('');
                }}
                className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveTestCase}
                className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
              >
                Save Test Case
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TestCasePanel;
