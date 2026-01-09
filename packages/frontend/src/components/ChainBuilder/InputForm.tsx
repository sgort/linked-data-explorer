import React from 'react';

import { DmnModel } from '../../types';
import { ChainValidation } from '../../types/chainBuilder.types';

interface InputFormProps {
  chain: DmnModel[];
  inputs: Record<string, unknown>;
  onInputChange: (identifier: string, value: unknown) => void;
  validation: ChainValidation | null;
}

/**
 * Dynamic input form based on chain requirements
 */
const InputForm: React.FC<InputFormProps> = ({ chain, inputs, onInputChange, validation }) => {
  // Collect all required inputs
  const requiredInputs = validation?.missingInputs || [];

  // Also collect inputs from first DMN
  const firstDmnInputs = chain[0]?.inputs || [];

  // Merge and deduplicate
  const allInputs = [...firstDmnInputs];
  requiredInputs.forEach((req) => {
    if (!allInputs.find((i) => i.identifier === req.identifier)) {
      allInputs.push({
        identifier: req.identifier,
        title: req.title,
        type: req.type as 'String' | 'Integer' | 'Boolean' | 'Date' | 'Double',
        description: `Required by ${req.requiredBy}`,
      });
    }
  });

  if (allInputs.length === 0) {
    return (
      <div className="text-xs text-slate-500 text-center py-4">
        No inputs required for this chain
      </div>
    );
  }

  /**
   * Render input field based on type
   */
  const renderInput = (input: (typeof allInputs)[0]) => {
    const value = inputs[input.identifier];
    const hasValue = value !== undefined && value !== null && value !== '';

    switch (input.type) {
      case 'Boolean':
        return (
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={(value as boolean) || false}
              onChange={(e) => onInputChange(input.identifier, e.target.checked)}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <span className="text-sm text-slate-700">{input.title}</span>
          </label>
        );

      case 'Integer':
        return (
          <input
            type="number"
            step="1"
            value={(value as number) || ''}
            onChange={(e) => onInputChange(input.identifier, parseInt(e.target.value, 10) || 0)}
            placeholder={`Enter ${input.title.toLowerCase()}`}
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        );

      case 'Double':
        return (
          <input
            type="number"
            step="0.01"
            value={(value as number) || ''}
            onChange={(e) => onInputChange(input.identifier, parseFloat(e.target.value) || 0)}
            placeholder={`Enter ${input.title.toLowerCase()}`}
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        );

      case 'Date':
        return (
          <input
            type="date"
            value={(value as string) || ''}
            onChange={(e) => onInputChange(input.identifier, e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        );

      case 'String':
      default:
        return (
          <input
            type="text"
            value={(value as string) || ''}
            onChange={(e) => onInputChange(input.identifier, e.target.value)}
            placeholder={`Enter ${input.title.toLowerCase()}`}
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        );
    }
  };

  return (
    <div className="space-y-3">
      {allInputs.map((input) => {
        const hasValue =
          inputs[input.identifier] !== undefined &&
          inputs[input.identifier] !== null &&
          inputs[input.identifier] !== '';

        return (
          <div key={input.identifier} className="space-y-1">
            <label className="flex items-center justify-between text-xs font-medium text-slate-700">
              <span>
                {input.title}
                <span className="text-slate-400 ml-1">({input.type})</span>
              </span>
              {hasValue && <span className="text-green-600">✓</span>}
            </label>
            {renderInput(input)}
            {input.description && <p className="text-xs text-slate-400">{input.description}</p>}
          </div>
        );
      })}

      {/* Quick Fill Button (for testing) */}
      <button
        onClick={() => {
          // Fill with test data
          allInputs.forEach((input) => {
            let testValue: unknown;
            switch (input.type) {
              case 'Boolean':
                testValue = true;
                break;
              case 'Integer':
                testValue = 100;
                break;
              case 'Double':
                testValue = 100.0;
                break;
              case 'Date':
                testValue = '2025-01-01';
                break;
              case 'String':
              default:
                testValue = 'test';
                break;
            }
            onInputChange(input.identifier, testValue);
          });
        }}
        className="w-full mt-2 px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors border border-slate-200"
      >
        Fill with test data
      </button>
    </div>
  );
};

export default InputForm;
