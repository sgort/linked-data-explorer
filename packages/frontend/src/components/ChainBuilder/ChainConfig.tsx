import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  FileInput,
  Layers,
  Link2,
  Save,
  Tag,
  Trash2,
  Zap,
} from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import { ChainTemplate, templateService } from '../../services/templateService';
import {
  deleteUserTemplate,
  getUserTemplates,
  saveUserTemplate,
  UserTemplate,
} from '../../services/userTemplateStorage';
import { ChainExecutionResult, DmnModel } from '../../types';
import { ChainPreset, ChainValidation } from '../../types/chainBuilder.types';
import { TestCase } from '../../types/testCase.types';
import ChainResults from './ChainResults';
import ExecutionProgress from './ExecutionProgress';
import ExportChain from './ExportChain';
import InputForm from './InputForm';
import TestCasePanel from './TestCasePanel';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

interface ChainConfigProps {
  chain: DmnModel[];
  validation: ChainValidation | null;
  inputs: Record<string, unknown>;
  onInputChange: (identifier: string, value: unknown) => void;
  onExecute: () => void;
  onLoadPreset: (preset: ChainPreset) => void;
  executionResult: ChainExecutionResult | null;
  isExecuting: boolean;
  endpoint: string;
  loadedTemplate?: ChainPreset | null;
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
  endpoint,
  loadedTemplate,
}) => {
  const [showValidation, setShowValidation] = useState(true);
  const [showInputs, setShowInputs] = useState(true);
  const [templates, setTemplates] = useState<ChainTemplate[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Template save modal state
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [saveMode, setSaveMode] = useState<'drd' | 'sequential'>('drd');

  // Add refs for scrollable container and execution area
  const scrollableContainerRef = useRef<HTMLDivElement>(null);
  const executionAreaRef = useRef<HTMLDivElement>(null);

  /**
   * Load templates from backend and localStorage
   */
  const loadTemplates = useCallback(async () => {
    setIsLoadingTemplates(true);
    try {
      // Load predefined templates from backend
      let predefinedTemplates: ChainTemplate[];

      if (selectedCategory === 'all') {
        predefinedTemplates = await templateService.getAllTemplates();
      } else if (selectedCategory === 'custom') {
        predefinedTemplates = [];
      } else {
        predefinedTemplates = await templateService.getTemplatesByCategory(selectedCategory);
      }

      // Load user templates from localStorage
      const userTemplates = getUserTemplates(endpoint);

      // Filter user templates by category
      const filteredUserTemplates =
        selectedCategory === 'all'
          ? userTemplates
          : userTemplates.filter((t) => t.category === selectedCategory);

      // Combine both
      const combinedTemplates: ChainTemplate[] = [...predefinedTemplates, ...filteredUserTemplates];

      setTemplates(combinedTemplates);
    } catch (error) {
      console.error('Error loading templates:', error);
    } finally {
      setIsLoadingTemplates(false);
    }
  }, [selectedCategory, endpoint]);

  // Load templates on mount and when category or endpoint changes
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

  const handleLoadTestCase = (testCase: TestCase) => {
    // Load test case inputs
    Object.entries(testCase.inputs).forEach(([key, value]) => {
      onInputChange(key, value);
    });
  };

  const handleSaveTemplate = async () => {
    if (!validation?.isValid) {
      setSaveError('Cannot save invalid chain as template');
      return;
    }
    if (!templateName.trim()) {
      setSaveError('Template name is required');
      return;
    }

    setIsSavingTemplate(true);
    setSaveError(null);

    try {
      const dmnIds = chain.map((dmn) => dmn.identifier);
      const entryPointId = dmnIds[dmnIds.length - 1];

      // Get output schema from the last DMN in the chain
      const lastDmn = chain[chain.length - 1];
      const drdOutputs = lastDmn.outputs.map((output) => ({
        identifier: output.identifier,
        title: output.title || output.identifier,
        type: output.type,
      }));

      // Assemble + deploy DRD to Operaton
      const response = await fetch(`${API_BASE_URL}/api/dmns/drd/deploy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dmnIds,
          deploymentName: `drd-${entryPointId}-${new Date().toISOString().split('T')[0]}`,
        }),
      });

      const data = await response.json();

      if (!data.success) {
        setSaveError(`DRD deployment failed: ${data.error?.message || 'Unknown error'}`);
        return;
      }

      // Save template with DRD metadata including outputs
      saveUserTemplate(endpoint, {
        name: templateName.trim(),
        description:
          templateDescription.trim() ||
          `DRD with ${chain.length} decisions, entry point: ${entryPointId}`,
        category: 'custom',
        dmnIds: [entryPointId],
        defaultInputs: inputs,
        tags: ['custom', 'drd', 'user-created'],
        complexity: chain.length <= 2 ? 'simple' : chain.length <= 3 ? 'medium' : 'complex',
        estimatedTime: 300,
        author: 'local-user',
        isPublic: false,
        endpoint: '',
        // DRD metadata
        isDrd: true,
        drdDeploymentId: data.data.deploymentId,
        drdEntryPointId: `dmn${chain.length - 1}_${entryPointId}`,
        drdOriginalChain: dmnIds,
        drdOutputs: drdOutputs, // NEW: Store output schema
      });

      setShowSaveModal(false);
      setTemplateName('');
      setTemplateDescription('');
      loadTemplates();
    } catch (error) {
      setSaveError(`Failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsSavingTemplate(false);
    }
  };

  /**
   * Handle delete user template
   */
  const handleDeleteTemplate = (templateId: string, e: React.MouseEvent) => {
    e.stopPropagation();

    if (!confirm('Are you sure you want to delete this template?')) {
      return;
    }

    const success = deleteUserTemplate(endpoint, templateId);
    if (success) {
      loadTemplates();
    } else {
      alert('Failed to delete template');
    }
  };

  /**
   * Check if template is a user template
   */
  const isUserTemplate = (template: ChainTemplate): template is UserTemplate => {
    return 'isUserTemplate' in template && template.isUserTemplate === true;
  };

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
                <div className="text-center text-xs text-slate-400 py-4">Loading templates...</div>
              ) : templates.length === 0 ? (
                <div className="text-center text-xs text-slate-500 py-4 bg-slate-50 rounded-lg border border-slate-200">
                  No templates in this category
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Predefined Templates */}
                  {templates.filter((t) => !isUserTemplate(t)).length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
                        Example Templates
                      </h4>
                      <div className="space-y-2">
                        {templates
                          .filter((t) => !isUserTemplate(t))
                          .map((template) => (
                            <button
                              key={template.id}
                              onClick={() => onLoadPreset(template)}
                              className="w-full px-3 py-2.5 text-left hover:bg-blue-50 rounded-lg transition-colors border border-slate-200 hover:border-blue-300"
                            >
                              <div className="font-medium text-sm text-slate-900 mb-1">
                                {template.name}
                              </div>
                              <div className="text-xs text-slate-500 mb-2">
                                {template.description}
                              </div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${getCategoryColor(template.category)}`}
                                >
                                  <Tag size={10} />
                                  {template.category}
                                </span>
                                <span
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${getComplexityColor(template.complexity)}`}
                                >
                                  <Layers size={10} />
                                  {template.complexity}
                                </span>
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs text-slate-600 bg-slate-100">
                                  <Clock size={10} />~{template.estimatedTime}ms
                                </span>
                                {template.usageCount && (
                                  <span className="text-xs text-slate-400">
                                    {template.usageCount} uses
                                  </span>
                                )}
                              </div>
                            </button>
                          ))}
                      </div>
                    </div>
                  )}

                  {/* User Templates */}
                  {templates.filter((t) => isUserTemplate(t)).length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
                        My Templates
                      </h4>
                      <div className="space-y-2">
                        {templates
                          .filter((t) => isUserTemplate(t))
                          .map((template) => (
                            <div key={template.id} className="relative">
                              <button
                                onClick={() => onLoadPreset(template)}
                                className="w-full px-3 py-2.5 text-left hover:bg-blue-50 rounded-lg transition-colors border border-slate-200 hover:border-blue-300"
                              >
                                <div className="font-medium text-sm text-slate-900 mb-1 pr-6">
                                  {template.name}
                                </div>
                                <div className="text-xs text-slate-500 mb-2">
                                  {template.description}
                                </div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span
                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${getComplexityColor(template.complexity)}`}
                                  >
                                    <Layers size={10} />
                                    {template.complexity}
                                  </span>
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs text-slate-600 bg-slate-100">
                                    <Clock size={10} />~{template.estimatedTime}ms
                                  </span>
                                </div>
                              </button>
                              <button
                                onClick={(e) => handleDeleteTemplate(template.id, e)}
                                className="absolute top-2 right-2 p-1 bg-red-100 text-red-600 rounded hover:bg-red-200 transition-colors"
                                title="Delete template"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Chain loaded state
  return (
    <div className="w-96 bg-white border-l border-slate-200 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-slate-200 flex justify-between items-center">
        <div>
          <h2 className="font-semibold text-slate-900">Chain Configuration</h2>
          <p className="text-xs text-slate-500 mt-1">
            {chain.length} DMN{chain.length !== 1 ? 's' : ''} in chain
            {loadedTemplate?.isDrd && (
              <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700">
                🔗 DRD
              </span>
            )}
          </p>
        </div>

        {/* Save as Template Button */}
        <button
          onClick={() => setShowSaveModal(true)}
          disabled={!validation?.isValid}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title={validation?.isValid ? 'Save chain as template' : 'Fix validation errors first'}
        >
          <Save size={14} />
          Save
        </button>
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

        {/* Test Cases Section */}
        <TestCasePanel
          chain={chain}
          endpoint={endpoint}
          currentInputs={inputs}
          onLoadTestCase={handleLoadTestCase}
        />

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

      {/* Action Buttons (Footer) */}
      <div className="p-4 border-t border-slate-200 bg-slate-50">
        <div className="space-y-2">
          {/* Execution Mode Info */}
          {chain.length > 0 && validation && (
            <div className="text-xs text-center">
              {validation.isDrdCompatible ? (
                <span className="text-purple-600">✓ DRD-compatible chain (unified execution)</span>
              ) : (
                <span className="text-blue-600">
                  ⚠️ Sequential execution required (semantic links)
                </span>
              )}
            </div>
          )}

          <div className="flex items-center gap-2">
            {/* Execute Button (Left) */}
            <button
              onClick={onExecute}
              disabled={!validation?.isValid || isExecuting}
              className={`
          flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium text-sm
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
                  <Zap size={16} />
                  <span>Execute Chain</span>
                </>
              )}
            </button>

            {/* Save/Export Button (Right) - Conditional based on DRD compatibility */}
            {validation?.isDrdCompatible ? (
              <button
                onClick={() => setShowSaveModal(true)}
                disabled={!validation?.isValid}
                className={`
            flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm
            transition-all duration-150
            ${
              validation?.isValid
                ? 'bg-purple-600 hover:bg-purple-700 text-white shadow-sm hover:shadow-md'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
            }
          `}
                title="Save as unified DRD"
              >
                <Link2 size={16} />
                <span>Save</span>
              </button>
            ) : (
              <ExportChain
                dmnIds={chain.map((dmn) => dmn.identifier)}
                inputs={inputs}
                chainDmns={chain}
                chainName={`chain-${chain.length}-dmns`}
                validation={validation}
              />
            )}
          </div>

          {!validation?.isValid && chain.length > 0 && (
            <p className="text-xs text-center text-amber-600">Fix validation errors to execute</p>
          )}
        </div>
      </div>

      {/* Save Template Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-96 max-w-[90vw]">
            <h3 className="text-lg font-semibold mb-4">Save as DRD</h3>

            {saveError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
                {saveError}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Template Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={templateName}
                  onChange={(e) => {
                    setTemplateName(e.target.value);
                    setSaveError(null);
                  }}
                  placeholder="e.g., My Eligibility Check"
                  className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Description (optional)
                </label>
                <textarea
                  value={templateDescription}
                  onChange={(e) => setTemplateDescription(e.target.value)}
                  placeholder="Describe what this chain does..."
                  rows={3}
                  className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div className="text-xs bg-slate-50 p-3 rounded">
                {validation?.isDrdCompatible ? (
                  <>
                    <div className="text-slate-700 mb-2">
                      The {chain.length} DMNs will be assembled into a single DRD and deployed to
                      Operaton. The saved template uses{' '}
                      <strong>{chain[chain.length - 1]?.identifier}</strong> as its entry point.
                    </div>
                    <div className="text-green-600 font-medium">
                      ✓ All variables use exact identifier matching
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-amber-700 font-medium mb-2">
                      ⚠️ This chain cannot be saved as a DRD
                    </div>
                    <div className="text-slate-600">
                      Chain contains {validation?.semanticMatches?.length || 0} semantic variable
                      link(s). DRD requires exact identifier matches. This template will use
                      sequential execution.
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={() => {
                  void handleSaveTemplate();
                }}
                disabled={!templateName.trim() || isSavingTemplate}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
              >
                {isSavingTemplate ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Deploying DRD…</span>
                  </>
                ) : (
                  <span>Save as DRD</span>
                )}
              </button>
              <button
                onClick={() => {
                  setShowSaveModal(false);
                  setTemplateName('');
                  setTemplateDescription('');
                  setSaveError(null);
                }}
                className="px-4 py-2 border border-slate-300 text-slate-700 rounded hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChainConfig;
