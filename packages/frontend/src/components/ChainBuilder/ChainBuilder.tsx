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

/**
 * Main Chain Builder Component
 *
 * Three-panel layout:
 * - Left: Draggable DMN list
 * - Middle: Chain composer (drop zone)
 * - Right: Configuration and execution
 */
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

const ChainBuilder: React.FC = () => {
  // State
  const [availableDmns, setAvailableDmns] = useState<DmnModel[]>([]);
  const [selectedChain, setSelectedChain] = useState<string[]>([]);
  const [inputs, setInputs] = useState<Record<string, unknown>>({});
  const [executionResult, setExecutionResult] = useState<ChainExecutionResult | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isLoadingDmns, setIsLoadingDmns] = useState(false);
  const [validation, setValidation] = useState<ChainValidation | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  // Load DMNs on mount
  useEffect(() => {
    loadDmns();
  }, []);

  // Validate chain whenever it changes
  useEffect(() => {
    if (selectedChain.length > 0) {
      validateChain();
    } else {
      setValidation(null);
    }
  }, [selectedChain, availableDmns, inputs]);

  /**
   * Load available DMNs from backend
   */
  const loadDmns = async () => {
    setIsLoadingDmns(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/dmns`);
      const data = await response.json();

      if (data.success) {
        setAvailableDmns(data.data.dmns);
      } else {
        console.error('Failed to load DMNs:', data.error);
      }
    } catch (error) {
      console.error('Error loading DMNs:', error);
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
          options: { includeIntermediateSteps: true },
        }),
      });

      const data = await response.json();

      if (data.success) {
        setExecutionResult(data.data);
      } else {
        alert(`Execution failed: ${data.error?.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Execution error:', error);
      alert('Failed to execute chain');
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

    // ✅ Track outputs available at each step (considering order!)
    const availableOutputsAtStep = new Map<number, Set<string>>();

    // ✅ Process each DMN in sequence
    chainDmns.forEach((dmn, index) => {
      // Get outputs available from previous DMNs
      const previousOutputs = new Set<string>();
      for (let i = 0; i < index; i++) {
        chainDmns[i].outputs.forEach((output) => {
          previousOutputs.add(output.identifier);
        });
      }
      availableOutputsAtStep.set(index, previousOutputs);

      // Check each input
      dmn.inputs.forEach((input) => {
        const providedByPreviousDmn = previousOutputs.has(input.identifier);

        // ✅ User must provide this input if:
        // 1. No PREVIOUS DMN outputs it, AND
        // 2. User hasn't provided it yet
        if (!providedByPreviousDmn) {
          const alreadyAdded = requiredInputs.some((ri) => ri.identifier === input.identifier);
          if (!alreadyAdded) {
            const inputData = {
              identifier: input.identifier,
              title: input.title,
              type: input.type,
              requiredBy: dmn.identifier,
              description: input.description,
            };

            // ✅ Always add to requiredInputs (for form rendering)
            requiredInputs.push(inputData);

            // ✅ Also add to missingInputs if not filled yet
            const hasValue = input.identifier in inputs;
            if (!hasValue) {
              missingInputs.push(inputData);
            }
          }
        }
      });

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
    });

    // Estimate execution time (150ms per DMN + 50ms overhead)
    const estimatedTime = chainDmns.length * 150 + 50;

    // ✅ ADD DEBUG LOGGING
    console.log('=== VALIDATION DEBUG ===');
    console.log('Chain order:', selectedChain);
    console.log(
      'Chain DMNs:',
      chainDmns.map((d) => d.identifier)
    );
    console.log(
      'Required inputs:',
      requiredInputs.map((r) => r.identifier)
    );
    console.log(
      'Missing inputs:',
      missingInputs.map((m) => m.identifier)
    );
    console.log('========================');

    setValidation({
      isValid: missingInputs.length === 0,
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
   * Handle drag end event
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
    if (overId === 'chain-droppable') {
      // Check if DMN already in chain
      if (selectedChain.includes(activeId)) {
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
   * Load a preset chain
   */
  const handleLoadPreset = (preset: ChainPreset) => {
    setSelectedChain(preset.dmnIds);
    if (preset.defaultInputs) {
      setInputs(preset.defaultInputs);
    }
  };

  /**
   * Update input value
   */
  const handleInputChange = (identifier: string, value: unknown) => {
    setInputs((prev) => ({
      ...prev,
      [identifier]: value,
    }));
  };

  // Get chain DMNs with full model data
  const chainDmns = selectedChain
    .map((id) => availableDmns.find((d) => d.identifier === id))
    .filter((d): d is DmnModel => d !== undefined);

  // Get the active DMN for drag overlay
  const activeDmn = activeDragId ? availableDmns.find((d) => d.identifier === activeDragId) : null;

  return (
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
  );
};

export default ChainBuilder;
