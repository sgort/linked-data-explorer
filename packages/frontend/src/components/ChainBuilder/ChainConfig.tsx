/* eslint-disable no-console */
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  FileInput,
  Layers,
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
  _loadedTemplate?: ChainPreset | null;
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
  _loadedTemplate,
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
    if (!templateName.trim()) {
      setSaveError('Template name is required');
      return;
    }

    setIsSavingTemplate(true);
    setSaveError(null);

    try {
      // Auto-detect template type based on DRD compatibility
      const templateType: 'sequential' | 'drd' = validation?.isDrdCompatible ? 'drd' : 'sequential';

      console.log('[SaveTemplate] Saving as:', templateType);
      console.log(
        '[SaveTemplate] Chain:',
        chain.map((d) => d.identifier)
      );

      // Create base template object with proper typing
      const baseTemplateData = {
        name: templateName,
        description:
          templateDescription ||
          `${templateType === 'drd' ? 'DRD' : 'Sequential'} chain with ${chain.length} DMN${chain.length > 1 ? 's' : ''}`,
        type: templateType,
        category: 'custom' as const,
        dmnIds: chain.map((d) => d.identifier),
        defaultInputs: inputs,
        tags: [`${chain.length}-dmn`, templateType],
        complexity: (chain.length === 1 ? 'simple' : chain.length <= 3 ? 'medium' : 'complex') as
          | 'simple'
          | 'medium'
          | 'complex',
        estimatedTime: validation?.estimatedTime || chain.length * 150 + 50,
        isPublic: false,
        endpoint,
      };

      // If DRD-compatible, deploy it and add DRD fields
      if (templateType === 'drd') {
        console.log('[SaveTemplate] Deploying DRD...');

        const deployResponse = await fetch(`${API_BASE_URL}/api/dmns/drd/deploy`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dmnIds: chain.map((d) => d.identifier),
            deploymentName: templateName,
          }),
        });

        const deployData = await deployResponse.json();
        console.log('[SaveTemplate] Deploy response:', deployData);

        if (!deployData.success) {
          const errorMsg =
            typeof deployData.error === 'string'
              ? deployData.error
              : deployData.error?.message ||
                JSON.stringify(deployData.error) ||
                'DRD deployment failed';
          throw new Error(errorMsg);
        }

        // Create template with DRD fields
        const drdTemplateData = {
          ...baseTemplateData,
          drdEntryPointId: deployData.data.entryPointId, // Changed from drdId
          drdDeploymentId: deployData.data.deploymentId,
          drdOriginalChain: chain.map((d) => d.identifier), // Add this for BPMN display
        };

        console.log('[SaveTemplate] Saving DRD template:', drdTemplateData);
        const savedTemplate = saveUserTemplate(endpoint, drdTemplateData);

        await loadTemplates();
        setShowSaveModal(false);
        setTemplateName('');
        setTemplateDescription('');
        alert(`✅ DRD Template "${savedTemplate.name}" deployed and saved!`);
      } else {
        // Save as sequential template
        console.log('[SaveTemplate] Saving sequential template:', baseTemplateData);
        const savedTemplate = saveUserTemplate(endpoint, baseTemplateData);

        await loadTemplates();
        setShowSaveModal(false);
        setTemplateName('');
        setTemplateDescription('');
        alert(`✅ Sequential Template "${savedTemplate.name}" saved!`);
      }
    } catch (error) {
      console.error('[SaveTemplate] Error:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      setSaveError(`Failed to save template: ${errorMessage}`);
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
                              {/* Add icon before name */}
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-base">
                                  {template.type === 'drd' ? '🎯' : '⛓️'}
                                </span>
                                <div className="font-medium text-sm text-slate-900">
                                  {template.name}
                                </div>
                              </div>

                              <div className="text-xs text-slate-500 mb-2">
                                {template.description}
                              </div>

                              <div className="flex items-center gap-2 flex-wrap">
                                {/* NEW: Type badge */}
                                <span
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                                    template.type === 'drd'
                                      ? 'bg-purple-100 text-purple-700'
                                      : 'bg-amber-100 text-amber-700'
                                  }`}
                                >
                                  {template.type === 'drd' ? 'DRD' : 'Sequential'}
                                </span>

                                {/* Existing badges */}
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
                                {/* Add icon before name */}
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-base">
                                    {template.type === 'drd' ? '🎯' : '⛓️'}
                                  </span>
                                  <div className="font-medium text-sm text-slate-900">
                                    {template.name}
                                  </div>
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

      {/* Action Buttons */}
      <div className="p-4 border-t border-slate-200 bg-slate-50">
        <div className="space-y-2">
          {/* Three equal buttons in a row */}
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={onExecute}
              disabled={!validation?.isValid || isExecuting}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium text-sm"
              title="Execute chain"
            >
              {isExecuting ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Zap size={16} />
              )}
              <span>{isExecuting ? 'Running' : 'Execute'}</span>
            </button>

            <button
              onClick={() => setShowSaveModal(true)}
              disabled={!validation?.isValid}
              className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                validation?.isDrdCompatible
                  ? 'bg-purple-600 hover:bg-purple-700 text-white'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
              title={validation?.isDrdCompatible ? 'Save as DRD' : 'Save template'}
            >
              <Save size={16} />
              <span>Save</span>
            </button>

            <ExportChain
              dmnIds={chain.map((dmn) => dmn.identifier)}
              inputs={inputs}
              chainDmns={chain}
              chainName={`chain-${chain.length}-dmns`}
              validation={validation}
            />
          </div>

          {/* Warning message for semantic chains */}
          {validation?.semanticMatches && validation.semanticMatches.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
              <AlertCircle size={14} />
              <span>Sequential execution required (semantic links)</span>
            </div>
          )}

          {/* Validation error message */}
          {!validation?.isValid && validation?.errors && validation.errors.length > 0 && (
            <div className="text-xs text-red-600 text-center">{validation.errors[0].message}</div>
          )}
        </div>
      </div>

      {/* Save Template Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
            <h3 className="text-lg font-semibold mb-4">
              {validation?.isDrdCompatible ? 'Save as DRD Template' : 'Save as Sequential Template'}
            </h3>

            {/* Template Type Detection */}
            <div
              className={`mb-4 p-3 rounded-lg border-2 ${
                validation?.isDrdCompatible
                  ? 'bg-purple-50 border-purple-200'
                  : 'bg-amber-50 border-amber-200'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl">{validation?.isDrdCompatible ? '🎯' : '⛓️'}</span>
                <div>
                  <div className="font-semibold text-sm">
                    {validation?.isDrdCompatible ? 'DRD Template' : 'Sequential Chain Template'}
                  </div>
                  <div className="text-xs text-slate-600">
                    {validation?.isDrdCompatible
                      ? 'Will be deployed as unified Decision Requirements Diagram'
                      : 'Will execute as sequential chain with semantic variable matching'}
                  </div>
                </div>
              </div>

              {validation?.isDrdCompatible ? (
                <div className="text-xs text-green-700 mt-2">
                  ✓ All {chain.length} DMNs use exact identifier matching
                </div>
              ) : (
                <div className="text-xs text-amber-700 mt-2">
                  ⚠️ Contains {validation?.semanticMatches?.length || 0} semantic variable link(s)
                </div>
              )}
            </div>

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
                onClick={handleSaveTemplate}
                disabled={!templateName.trim() || isSavingTemplate}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
              >
                {isSavingTemplate ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>{validation?.isDrdCompatible ? 'Deploying...' : 'Saving...'}</span>
                  </>
                ) : (
                  <>
                    <Save size={16} />
                    <span>{validation?.isDrdCompatible ? 'Save as DRD' : 'Save Template'}</span>
                  </>
                )}
              </button>
              <button
                onClick={() => {
                  setShowSaveModal(false);
                  setTemplateName('');
                  setTemplateDescription('');
                  setSaveError(null);
                }}
                className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
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
