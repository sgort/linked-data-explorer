import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  FileInput,
  Layers,
  Tag,
  Zap,
} from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import { ChainTemplate, templateService } from '../../services/templateService';
import { ChainExecutionResult, DmnModel } from '../../types';
import { ChainPreset, ChainValidation } from '../../types/chainBuilder.types';
import ChainResults from './ChainResults';
import ExecutionProgress from './ExecutionProgress';
import InputForm from './InputForm';

interface ChainConfigProps {
  chain: DmnModel[];
  validation: ChainValidation | null;
  inputs: Record<string, unknown>;
  onInputChange: (identifier: string, value: unknown) => void;
  onExecute: () => void;
  onLoadPreset: (preset: ChainPreset) => void;
  executionResult: ChainExecutionResult | null;
  isExecuting: boolean;
}

/**
 * Right panel: Chain configuration and execution
 */
const ChainConfig: React.FC<ChainConfigProps> = ({
  chain,
  validation,
  inputs,
  onInputChange,
  onExecute,
  onLoadPreset,
  executionResult,
  isExecuting,
}) => {
  const [showValidation, setShowValidation] = useState(true);
  const [showInputs, setShowInputs] = useState(true);
  const [templates, setTemplates] = useState<ChainTemplate[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Add refs for scrollable container and execution area
  const scrollableContainerRef = useRef<HTMLDivElement>(null);
  const executionAreaRef = useRef<HTMLDivElement>(null);

  /**
   * Load templates from backend
   */
  const loadTemplates = useCallback(async () => {
    setIsLoadingTemplates(true);
    try {
      let fetchedTemplates: ChainTemplate[];

      if (selectedCategory === 'all') {
        fetchedTemplates = await templateService.getAllTemplates();
      } else {
        fetchedTemplates = await templateService.getTemplatesByCategory(selectedCategory);
      }

      setTemplates(fetchedTemplates);
    } catch (error) {
      console.error('Error loading templates:', error);
    } finally {
      setIsLoadingTemplates(false);
    }
  }, [selectedCategory]);

  // Load templates on mount and when category changes
  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  // Scroll to execution area when execution starts
  useEffect(() => {
    if (isExecuting && scrollableContainerRef.current && executionAreaRef.current) {
      const container = scrollableContainerRef.current;
      const executionArea = executionAreaRef.current;
      const executionTop = executionArea.offsetTop;

      container.scrollTo({
        top: executionTop - 20,
        behavior: 'smooth',
      });
    }
  }, [isExecuting]);

  /**
   * Get badge color for complexity
   */
  const getComplexityColor = (complexity: string) => {
    switch (complexity) {
      case 'simple':
        return 'bg-green-100 text-green-700';
      case 'medium':
        return 'bg-amber-100 text-amber-700';
      case 'complex':
        return 'bg-red-100 text-red-700';
      default:
        return 'bg-slate-100 text-slate-700';
    }
  };

  /**
   * Get badge color for category
   */
  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'social':
        return 'bg-blue-100 text-blue-700';
      case 'financial':
        return 'bg-emerald-100 text-emerald-700';
      case 'legal':
        return 'bg-purple-100 text-purple-700';
      case 'custom':
        return 'bg-slate-100 text-slate-700';
      default:
        return 'bg-slate-100 text-slate-700';
    }
  };

  // Empty state with templates
  if (chain.length === 0) {
    return (
      <div className="w-96 bg-white border-l border-slate-200 flex flex-col">
        <div className="p-4 border-b border-slate-200">
          <h2 className="font-semibold text-slate-900">Chain Configuration</h2>
        </div>
        <div className="flex-1 overflow-y-auto">
          <div className="p-6">
            <div className="text-center mb-6">
              <div className="text-slate-400 mb-2">
                <FileInput size={48} className="mx-auto" />
              </div>
              <p className="text-sm text-slate-500">
                Add DMNs to your chain to configure and execute
              </p>
            </div>

            {/* Template Selection */}
            {templates.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-slate-700">Load Template:</p>
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="text-xs px-2 py-1 border border-slate-200 rounded-md"
                  >
                    <option value="all">All Categories</option>
                    <option value="social">Social</option>
                    <option value="financial">Financial</option>
                    <option value="legal">Legal</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>

                {isLoadingTemplates ? (
                  <div className="text-center text-xs text-slate-400 py-4">
                    Loading templates...
                  </div>
                ) : (
                  <div className="space-y-2">
                    {templates.map((template) => (
                      <button
                        key={template.id}
                        onClick={() => onLoadPreset(template)}
                        className="w-full px-3 py-2.5 text-left hover:bg-blue-50 rounded-lg transition-colors border border-slate-200 hover:border-blue-300"
                      >
                        {/* Template Name */}
                        <div className="font-medium text-sm text-slate-900 mb-1">
                          {template.name}
                        </div>

                        {/* Description */}
                        <div className="text-xs text-slate-500 mb-2">{template.description}</div>

                        {/* Metadata Row */}
                        <div className="flex items-center gap-2 flex-wrap">
                          {/* Category Badge */}
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${getCategoryColor(template.category)}`}
                          >
                            <Tag size={10} />
                            {template.category}
                          </span>

                          {/* Complexity Badge */}
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${getComplexityColor(template.complexity)}`}
                          >
                            <Layers size={10} />
                            {template.complexity}
                          </span>

                          {/* Estimated Time */}
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs text-slate-600 bg-slate-100">
                            <Clock size={10} />~{template.estimatedTime}ms
                          </span>

                          {/* Usage Count */}
                          {template.usageCount && (
                            <span className="text-xs text-slate-400">
                              {template.usageCount} uses
                            </span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Chain loaded state
  return (
    <div className="w-96 bg-white border-l border-slate-200 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-slate-200">
        <h2 className="font-semibold text-slate-900">Chain Configuration</h2>
        <p className="text-xs text-slate-500 mt-1">
          {chain.length} DMN{chain.length !== 1 ? 's' : ''} in chain
        </p>
      </div>

      {/* Scrollable Content */}
      <div ref={scrollableContainerRef} className="flex-1 overflow-y-auto">
        {/* Validation Section */}
        {validation && (
          <div className="border-b border-slate-200">
            <button
              onClick={() => setShowValidation(!showValidation)}
              className="w-full p-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center gap-2">
                {validation.isValid ? (
                  <CheckCircle2 size={18} className="text-green-600" />
                ) : (
                  <AlertCircle size={18} className="text-amber-600" />
                )}
                <span className="font-medium text-slate-900">Validation</span>
              </div>
              {showValidation ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>

            {showValidation && (
              <div className="px-4 pb-4 space-y-2">
                {/* Validation Status */}
                {validation.isValid ? (
                  <div className="text-sm text-green-700 bg-green-50 px-3 py-2 rounded-lg">
                    ✓ Chain is valid and ready to execute
                  </div>
                ) : (
                  <>
                    {validation.errors.map((error, index) => (
                      <div
                        key={index}
                        className="text-sm text-red-700 bg-red-50 px-3 py-2 rounded-lg"
                      >
                        {error.message}
                      </div>
                    ))}
                  </>
                )}

                {/* Warnings */}
                {validation.warnings.map((warning, index) => (
                  <div
                    key={index}
                    className="text-sm text-amber-700 bg-amber-50 px-3 py-2 rounded-lg"
                  >
                    {warning.message}
                  </div>
                ))}

                {/* Estimated Time */}
                {validation.estimatedTime && (
                  <div className="flex items-center gap-2 text-xs text-slate-600 bg-slate-50 px-3 py-2 rounded-lg">
                    <Clock size={14} />
                    <span>Estimated execution time: ~{validation.estimatedTime}ms</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Inputs Section */}
        <div className="border-b border-slate-200">
          <button
            onClick={() => setShowInputs(!showInputs)}
            className="w-full p-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <FileInput size={18} className="text-blue-600" />
              <span className="font-medium text-slate-900">Inputs</span>
            </div>
            {showInputs ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {showInputs && (
            <div className="px-4 pb-4">
              <InputForm
                chain={chain}
                inputs={inputs}
                onInputChange={onInputChange}
                validation={validation}
              />
            </div>
          )}
        </div>

        {/* Execution Area */}
        <div ref={executionAreaRef}>
          {/* Execution Progress */}
          {isExecuting && (
            <div className="p-4 border-b border-slate-200">
              <ExecutionProgress chain={chain} />
            </div>
          )}

          {/* Results */}
          {executionResult && (
            <div className="p-4">
              <ChainResults result={executionResult} />
            </div>
          )}
        </div>
      </div>

      {/* Execute Button (Footer) */}
      <div className="p-4 border-t border-slate-200 bg-slate-50">
        <button
          onClick={onExecute}
          disabled={!validation?.isValid || isExecuting}
          className={`
            w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium
            transition-all duration-150
            ${
              validation?.isValid && !isExecuting
                ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm hover:shadow-md'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
            }
          `}
        >
          {isExecuting ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              <span>Executing...</span>
            </>
          ) : (
            <>
              <Zap size={18} />
              <span>Execute Chain</span>
            </>
          )}
        </button>

        {!validation?.isValid && chain.length > 0 && (
          <p className="text-xs text-center text-amber-600 mt-2">
            Fix validation errors to execute
          </p>
        )}
      </div>
    </div>
  );
};

export default ChainConfig;
