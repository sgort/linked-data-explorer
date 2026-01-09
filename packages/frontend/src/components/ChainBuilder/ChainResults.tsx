import { CheckCircle2, ChevronDown, ChevronUp, Clock, Eye, XCircle } from 'lucide-react';
import React, { useState } from 'react';

import { ChainExecutionResult } from '../../types';

interface ChainResultsProps {
  result: ChainExecutionResult;
}

/**
 * Display chain execution results
 */
const ChainResults: React.FC<ChainResultsProps> = ({ result }) => {
  const [showSteps, setShowSteps] = useState(false);
  const [showAllOutputs, setShowAllOutputs] = useState(false);

  const outputEntries = Object.entries(result.finalOutputs);
  const displayedOutputs = showAllOutputs ? outputEntries : outputEntries.slice(0, 5);

  return (
    <div className="space-y-3">
      {/* Status Header */}
      <div className="flex items-center gap-2">
        {result.success ? (
          <>
            <CheckCircle2 size={20} className="text-green-600" />
            <span className="font-medium text-green-900">Execution Successful</span>
          </>
        ) : (
          <>
            <XCircle size={20} className="text-red-600" />
            <span className="font-medium text-red-900">Execution Failed</span>
          </>
        )}
      </div>

      {/* Execution Time */}
      <div className="flex items-center gap-2 text-sm text-slate-600 bg-slate-50 px-3 py-2 rounded-lg">
        <Clock size={14} />
        <span>Completed in {result.executionTime}ms</span>
      </div>

      {/* Error Message */}
      {result.error && (
        <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
          <div className="font-medium mb-1">Error:</div>
          <div>{result.error}</div>
        </div>
      )}

      {/* Final Outputs */}
      {result.success && (
        <div>
          <div className="font-medium text-sm text-slate-900 mb-2">
            Final Outputs ({outputEntries.length})
          </div>
          <div className="space-y-2">
            {displayedOutputs.map(([key, value]) => (
              <div key={key} className="bg-slate-50 px-3 py-2 rounded-lg">
                <div className="text-xs font-medium text-slate-700">{key}</div>
                <div className="text-sm text-slate-900 mt-0.5">
                  {typeof value === 'boolean' ? (
                    <span className={value ? 'text-green-600' : 'text-red-600'}>
                      {value ? '✓ true' : '✗ false'}
                    </span>
                  ) : (
                    <span>{JSON.stringify(value)}</span>
                  )}
                </div>
              </div>
            ))}
            {outputEntries.length > 5 && !showAllOutputs && (
              <button
                onClick={() => setShowAllOutputs(true)}
                className="w-full text-xs text-blue-600 hover:text-blue-700 py-1"
              >
                Show {outputEntries.length - 5} more outputs...
              </button>
            )}
          </div>
        </div>
      )}

      {/* Execution Steps (Collapsible) */}
      {result.steps && result.steps.length > 0 && (
        <div className="border-t border-slate-200 pt-3">
          <button
            onClick={() => setShowSteps(!showSteps)}
            className="flex items-center justify-between w-full text-sm font-medium text-slate-900 hover:text-slate-700"
          >
            <div className="flex items-center gap-2">
              <Eye size={14} />
              <span>Execution Steps ({result.steps.length})</span>
            </div>
            {showSteps ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          {showSteps && (
            <div className="mt-2 space-y-2">
              {result.steps.map((step, index) => (
                <div key={index} className="bg-slate-50 px-3 py-2 rounded-lg text-xs">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-slate-900">
                      {index + 1}. {step.dmnId}
                    </span>
                    <span className="text-slate-500">{step.duration}ms</span>
                  </div>
                  {step.error ? (
                    <div className="text-red-600">Error: {step.error}</div>
                  ) : (
                    <div className="text-slate-600">
                      {step.outputs && Object.keys(step.outputs).length > 0 && (
                        <div>Outputs: {Object.keys(step.outputs).join(', ')}</div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Copy Results Button */}
      <button
        onClick={() => {
          navigator.clipboard.writeText(JSON.stringify(result, null, 2));
          alert('Results copied to clipboard!');
        }}
        className="w-full text-xs text-slate-600 hover:text-slate-900 hover:bg-slate-100 px-3 py-2 rounded-lg border border-slate-200 transition-colors"
      >
        Copy Results as JSON
      </button>
    </div>
  );
};

export default ChainResults;
