import {
  closestCenter,
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import React, { useEffect, useState } from 'react';

import { ChainExecutionResult, DmnModel } from '../../types';
import { ChainPreset, ChainValidation } from '../../types/chainBuilder.types';
import ChainComposer from './ChainComposer';
import ChainConfig from './ChainConfig';
import DmnList from './DmnList';
import SemanticView from './SemanticView';

/**
 * Main Chain Builder Component
 *
 * Three-panel layout:
 * - Left: Draggable DMN list
 * - Middle: Chain composer (drop zone)
 * - Right: Configuration and execution
 */
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

interface ChainBuilderProps {
  endpoint: string; // TriplyDB SPARQL endpoint URL
}

const ChainBuilder: React.FC<ChainBuilderProps> = ({ endpoint }) => {
  // State
  const [availableDmns, setAvailableDmns] = useState<DmnModel[]>([]);
  const [selectedChain, setSelectedChain] = useState<string[]>([]);
  const [inputs, setInputs] = useState<Record<string, unknown>>({});
  const [executionResult, setExecutionResult] = useState<ChainExecutionResult | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isLoadingDmns, setIsLoadingDmns] = useState(false);
  const [validation, setValidation] = useState<ChainValidation | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'builder' | 'semantic'>('builder');

  // Load DMNs when endpoint changes
  useEffect(() => {
    loadDmns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint]);

  // Validate chain whenever it changes
  useEffect(() => {
    if (selectedChain.length > 0) {
      validateChain();
    } else {
      setValidation(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChain, availableDmns, inputs]);

  /**
   * Load available DMNs from backend
   * FIXED: Uses /api/dmns?endpoint=... to leverage backend caching
   * Backend returns complete DMN objects with inputs/outputs in one request
   */
  const loadDmns = async () => {
    setIsLoadingDmns(true);
    try {
      // Build URL with endpoint parameter
      const url = `${API_BASE_URL}/api/dmns?endpoint=${encodeURIComponent(endpoint)}`;

      const response = await fetch(url);
      const data = await response.json();

      if (data.success) {
        setAvailableDmns(data.data.dmns);
      } else {
        console.error('Failed to load DMNs:', data.error);
        setAvailableDmns([]);
      }
    } catch (error) {
      console.error('Error loading DMNs:', error);
      setAvailableDmns([]);
    } finally {
      setIsLoadingDmns(false);
    }
  };

  /**
   * Execute the chain
   */
  const handleExecute = async () => {
    if (!validation?.isValid) {
      alert('Please fix validation errors before executing');
      return;
    }

    setIsExecuting(true);
    setExecutionResult(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/chains/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dmnIds: selectedChain,
          inputs,
          endpoint, // Pass current endpoint to backend
          options: { includeIntermediateSteps: true },
        }),
      });

      const data = await response.json();

      if (data.success) {
        setExecutionResult(data.data);
      } else {
        const errorMessage =
          data.error?.message || data.data?.error || data.error || 'Unknown error occurred';

        const errorCode = data.error?.code || 'EXECUTION_ERROR';

        alert(
          `❌ Execution Failed\n\n` +
            `${errorMessage}\n\n` +
            `Error Code: ${errorCode}\n\n` +
            `Common causes:\n` +
            `• Missing deployment keys in Operaton\n` +
            `  (Check if DMN is deployed with correct key)\n` +
            `• DMN model not found in Operaton\n` +
            `• Invalid input values or types\n` +
            `• Network connectivity issues\n\n` +
            `Backend: ${API_BASE_URL}\n` +
            `Check browser console for technical details.`
        );

        console.error('Chain execution error:', {
          code: errorCode,
          message: errorMessage,
          apiError: data.error,
          executionError: data.data?.error,
          fullResponse: data,
          chain: selectedChain,
          inputs: inputs,
        });
      }
    } catch (error) {
      console.error('Network/fetch error:', error);

      const errorMessage = error instanceof Error ? error.message : 'Unknown network error';

      alert(
        `❌ Connection Failed\n\n` +
          `${errorMessage}\n\n` +
          `Possible causes:\n` +
          `• Backend server is not running\n` +
          `  (Expected at: ${API_BASE_URL})\n` +
          `• Network connectivity issues\n` +
          `• CORS configuration problems\n` +
          `• Firewall blocking the connection\n\n` +
          `Check browser console for details.`
      );
    } finally {
      setIsExecuting(false);
    }
  };

  /**
   * Validate the current chain
   */
  const validateChain = () => {
    const chainDmns = selectedChain
      .map((id) => availableDmns.find((d) => d.identifier === id))
      .filter((d): d is DmnModel => d !== undefined);

    if (chainDmns.length === 0) {
      setValidation(null);
      return;
    }

    const errors: ChainValidation['errors'] = [];
    const warnings: ChainValidation['warnings'] = [];
    const requiredInputs: ChainValidation['requiredInputs'] = [];
    const missingInputs: ChainValidation['missingInputs'] = [];

    // Track outputs available at each step
    const availableOutputs = new Set<string>();

    for (let i = 0; i < chainDmns.length; i++) {
      const dmn = chainDmns[i];

      // Check each required input
      for (const input of dmn.inputs) {
        // Check if input is provided by previous DMN
        const providedByPreviousDmn = availableOutputs.has(input.identifier);

        if (!providedByPreviousDmn) {
          // Deduplicate by identifier only (not identifier+requiredBy)
          // This ensures each unique input appears once in the form
          const alreadyAdded = requiredInputs.some((ri) => ri.identifier === input.identifier);
          if (!alreadyAdded) {
            const inputData = {
              identifier: input.identifier,
              title: input.title,
              type: input.type,
              requiredBy: dmn.identifier,
              description: input.description,
              testValue: input.testValue,
            };

            // Always add to requiredInputs (for form rendering)
            requiredInputs.push(inputData);

            // Also add to missingInputs if not filled yet
            const hasValue = input.identifier in inputs;
            if (!hasValue) {
              missingInputs.push(inputData);
            }
          }
        }
      }

      // Check for duplicate outputs (warnings)
      dmn.outputs.forEach((output) => {
        const outputCount = chainDmns.filter((d) =>
          d.outputs.some((o) => o.identifier === output.identifier)
        ).length;

        if (outputCount > 1) {
          warnings.push({
            type: 'duplicate_dmn',
            message: `Multiple DMNs output '${output.identifier}'`,
            dmnId: dmn.identifier,
          });
        }
      });

      // Add this DMN's outputs to available outputs
      for (const output of dmn.outputs) {
        availableOutputs.add(output.identifier);
      }
    }

    // Generate validation messages
    if (missingInputs.length > 0) {
      errors.push({
        type: 'missing_input',
        message: `Missing ${missingInputs.length} required input(s)`,
      });
    }

    if (chainDmns.length === 1) {
      warnings.push({
        type: 'performance',
        message: 'Single DMN chain - consider adding more for orchestration',
      });
    }

    // Estimate execution time (rough estimate: 150ms per DMN + 50ms base)
    const estimatedTime = chainDmns.length * 150 + 50;

    setValidation({
      isValid: errors.length === 0,
      errors,
      warnings,
      requiredInputs,
      missingInputs,
      estimatedTime,
    });
  };

  /**
   * Handle drag start
   */
  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(event.active.id as string);
  };

  /**
   * Handle drag end - CRITICAL: Preserve original logic for working drag-and-drop
   */
  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragId(null);

    const { active, over } = event;

    if (!over) {
      return;
    }

    const activeId = active.id as string;
    const overId = over.id as string;

    // Dragging from DMN list to chain
    // CRITICAL: This ID must match the useDroppable ID in ChainComposer
    if (overId === 'chain-droppable') {
      // Check if DMN already in chain
      if (selectedChain.includes(activeId)) {
        // eslint-disable-next-line no-console
        console.log('DMN already in chain');
        return;
      }

      // Add to end of chain
      setSelectedChain([...selectedChain, activeId]);
      return;
    }

    // Reordering within chain
    if (selectedChain.includes(activeId) && selectedChain.includes(overId)) {
      const oldIndex = selectedChain.indexOf(activeId);
      const newIndex = selectedChain.indexOf(overId);

      if (oldIndex !== newIndex) {
        const newChain = [...selectedChain];
        newChain.splice(oldIndex, 1);
        newChain.splice(newIndex, 0, activeId);
        setSelectedChain(newChain);
      }
    }
  };

  /**
   * Remove DMN from chain
   */
  const handleRemoveDmn = (identifier: string) => {
    setSelectedChain(selectedChain.filter((id) => id !== identifier));
    // Clear inputs, results, and validation
    setInputs({});
    setExecutionResult(null);
    setValidation(null);
  };

  /**
   * Clear entire chain
   */
  const handleClearChain = () => {
    setSelectedChain([]);
    setInputs({});
    setExecutionResult(null);
    setValidation(null);
  };

  /**
   * Handle input change
   */
  const handleInputChange = (identifier: string, value: unknown) => {
    setInputs((prev) => ({
      ...prev,
      [identifier]: value,
    }));
  };

  /**
   * Load a preset chain
   */
  const handleLoadPreset = (preset: ChainPreset) => {
    setSelectedChain(preset.dmnIds);
    setInputs(preset.defaultInputs || {});
    setExecutionResult(null);
  };

  // Get chain DMNs in order
  const chainDmns = selectedChain
    .map((id) => availableDmns.find((d) => d.identifier === id))
    .filter((d): d is DmnModel => d !== undefined);

  // Get active drag DMN
  const activeDmn = activeDragId ? availableDmns.find((d) => d.identifier === activeDragId) : null;

  return (
    <div className="flex flex-col h-full">
      {/* Tab Bar */}
      <div className="flex gap-2 px-4 pt-3 pb-0 bg-white border-b border-slate-200">
        <button
          onClick={() => setActiveTab('builder')}
          className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
            activeTab === 'builder'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          Chain Builder
        </button>
        <button
          onClick={() => setActiveTab('semantic')}
          className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
            activeTab === 'semantic'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          Semantic Analysis
        </button>
      </div>

      {activeTab === 'semantic' ? (
        <SemanticView endpoint={endpoint} apiBaseUrl={API_BASE_URL} />
      ) : (
        <DndContext
          key={selectedChain.length}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex h-full bg-slate-50">
            {/* Left Panel: DMN List */}
            <DmnList dmns={availableDmns} usedDmnIds={selectedChain} isLoading={isLoadingDmns} />

            {/* Middle Panel: Chain Composer */}
            <SortableContext items={selectedChain} strategy={verticalListSortingStrategy}>
              <ChainComposer
                chain={chainDmns}
                onRemoveDmn={handleRemoveDmn}
                onClearChain={handleClearChain}
                validation={validation}
              />
            </SortableContext>

            {/* Right Panel: Configuration & Execution */}
            <ChainConfig
              chain={chainDmns}
              validation={validation}
              inputs={inputs}
              onInputChange={handleInputChange}
              onExecute={handleExecute}
              onLoadPreset={handleLoadPreset}
              executionResult={executionResult}
              isExecuting={isExecuting}
              endpoint={endpoint}
            />
          </div>

          {/* Drag Overlay */}
          <DragOverlay>
            {activeDmn ? (
              <div className="p-3 bg-white rounded-lg border-2 border-blue-500 shadow-lg opacity-90">
                <div className="font-medium text-sm text-slate-900">{activeDmn.identifier}</div>
                <div className="text-xs text-slate-500 mt-1">
                  {activeDmn.inputs.length} inputs → {activeDmn.outputs.length} outputs
                </div>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
};

export default ChainBuilder;
