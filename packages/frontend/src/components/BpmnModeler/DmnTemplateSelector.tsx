/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useState } from 'react';

import { getUserTemplates } from '../../services/userTemplateStorage';
import { DmnModel } from '../../types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

interface DmnTemplateSelectorProps {
  endpoint: string;
  element: any;
  modeling: any;
  selectedDecisionRef?: string;
}

interface DmnOption {
  identifier: string;
  title: string;
  description?: string;
  isDrd?: boolean;
  originalChain?: string[];
}

const DmnTemplateSelector: React.FC<DmnTemplateSelectorProps> = ({
  endpoint,
  element,
  modeling,
}) => {
  const [dmns, setDmns] = useState<DmnModel[]>([]);
  const [drdOptions, setDrdOptions] = useState<DmnOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedIdentifier, setSelectedIdentifier] = useState<string>('');

  // Load DMNs and DRD templates on mount
  useEffect(() => {
    loadOptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint]);

  const loadOptions = async () => {
    setIsLoading(true);
    try {
      // Load regular DMNs from API
      const url = endpoint
        ? `${API_BASE_URL}/v1/dmns?endpoint=${encodeURIComponent(endpoint)}`
        : `${API_BASE_URL}/v1/dmns`;
      const response = await fetch(url);
      const data = await response.json();

      if (data.success) {
        const dmnArray = Array.isArray(data.data) ? data.data : (data.data?.dmns ?? []);
        setDmns(dmnArray);
      } else {
        setDmns([]);
      }

      // Load local DRD templates
      const userTemplates = getUserTemplates(endpoint);
      const drdTemplates = userTemplates
        .filter((template) => template.isDrd && template.drdEntryPointId)
        .map((template) => ({
          identifier: template.drdEntryPointId!,
          title: `${template.name} (DRD)`,
          description: template.description,
          isDrd: true,
          originalChain: template.drdOriginalChain,
        }));

      setDrdOptions(drdTemplates);
    } catch (error) {
      console.error('Failed to load DMNs and DRDs:', error);
      setDmns([]);
      setDrdOptions([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDmnSelect = (identifier: string) => {
    setSelectedIdentifier(identifier);

    if (!identifier) {
      modeling.updateProperties(element, {
        'camunda:decisionRef': undefined,
        'camunda:resultVariable': undefined,
      });
      return;
    }

    // Check if it's a DRD
    const drdOption = drdOptions.find((d) => d.identifier === identifier);
    const dmnOption = dmns.find((d) => d.identifier === identifier);

    const selectedOption = drdOption || dmnOption;
    if (!selectedOption) return;

    const suggestedVariable = identifier.charAt(0).toLowerCase() + identifier.slice(1) + 'Result';

    modeling.updateProperties(element, {
      'camunda:decisionRef': identifier,
      'camunda:resultVariable': suggestedVariable,
      'camunda:mapDecisionResult': 'singleEntry',
    });
  };

  if (isLoading) {
    return (
      <div className="p-3 bg-white border-t border-slate-200">
        <div className="text-sm text-slate-500">Loading DMNs and DRDs...</div>
      </div>
    );
  }

  const totalOptions = dmns.length + drdOptions.length;

  if (totalOptions === 0) {
    return (
      <div className="p-3 bg-white border-t border-slate-200">
        <div className="text-sm text-slate-500">No DMNs or DRDs available for this endpoint</div>
      </div>
    );
  }

  // Find selected option (could be DMN or DRD)
  const selectedDmn = dmns.find((d) => d.identifier === selectedIdentifier);
  const selectedDrd = drdOptions.find((d) => d.identifier === selectedIdentifier);
  const selectedOption = selectedDrd || selectedDmn;

  return (
    <div className="p-3 bg-white border-t border-slate-200">
      <label className="block text-xs font-medium text-slate-700 mb-2">Link to DMN/DRD</label>
      <select
        value={selectedIdentifier}
        onChange={(e) => handleDmnSelect(e.target.value)}
        className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
      >
        <option value="">-- Select a DMN or DRD --</option>

        {/* DRD Options Group */}
        {drdOptions.length > 0 && (
          <optgroup label="🔗 DRDs (Unified Chains)">
            {drdOptions.map((drd) => (
              <option key={drd.identifier} value={drd.identifier}>
                {drd.title}
              </option>
            ))}
          </optgroup>
        )}

        {/* Regular DMN Options Group */}
        {dmns.length > 0 && (
          <optgroup label="📋 Single DMNs">
            {dmns.map((dmn) => (
              <option key={dmn.identifier} value={dmn.identifier}>
                {dmn.title.replace(/\.dmn$/i, '')}
              </option>
            ))}
          </optgroup>
        )}
      </select>

      {selectedOption && (
        <div
          className={`mt-2 p-2 rounded text-xs ${
            selectedDrd ? 'bg-purple-50 text-slate-600' : 'bg-blue-50 text-slate-600'
          }`}
        >
          <div className="flex items-center gap-2 mb-1">
            <span className={`font-medium ${selectedDrd ? 'text-purple-700' : ''}`}>
              {selectedDrd ? '🔗' : '📋'} {selectedOption.title.replace(/\.dmn$/i, '')}
            </span>
            {selectedDrd && (
              <span className="px-2 py-0.5 bg-purple-600 text-white rounded text-[10px] font-medium">
                DRD
              </span>
            )}
          </div>

          {selectedOption.description && (
            <div className="text-slate-500 mb-1">{selectedOption.description}</div>
          )}

          {selectedDrd && selectedDrd.originalChain && (
            <div className="text-slate-500 text-[10px] mt-1">
              Combines: {selectedDrd.originalChain.join(' → ')}
            </div>
          )}

          <div className="text-slate-500 mt-1 font-mono text-[10px]">
            Decision Ref: {selectedOption.identifier}
          </div>
        </div>
      )}
    </div>
  );
};

export default DmnTemplateSelector;
