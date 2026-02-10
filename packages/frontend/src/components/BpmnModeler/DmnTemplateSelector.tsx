/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useState } from 'react';

import { DmnModel } from '../../types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

interface DmnTemplateSelectorProps {
  endpoint: string;
  element: any;
  modeling: any;
  selectedDecisionRef?: string;
}

const DmnTemplateSelector: React.FC<DmnTemplateSelectorProps> = ({
  endpoint,
  element,
  modeling,
}) => {
  const [dmns, setDmns] = useState<DmnModel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedIdentifier, setSelectedIdentifier] = useState<string>('');

  // Load templates on mount
  useEffect(() => {
    loadTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint]);

  const loadTemplates = async () => {
    setIsLoading(true);
    try {
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
    } catch (error) {
      console.error('Failed to load DMNs:', error);
      setDmns([]);
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

    const dmn = dmns.find((d) => d.identifier === identifier);
    if (!dmn) return;

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
        <div className="text-sm text-slate-500">Loading DMNs...</div>
      </div>
    );
  }

  if (dmns.length === 0) {
    return (
      <div className="p-3 bg-white border-t border-slate-200">
        <div className="text-sm text-slate-500">No DMNs available for this endpoint</div>
      </div>
    );
  }

  const selectedDmn = dmns.find((d) => d.identifier === selectedIdentifier);

  return (
    <div className="p-3 bg-white border-t border-slate-200">
      <label className="block text-xs font-medium text-slate-700 mb-2">Link to DMN</label>
      <select
        value={selectedIdentifier}
        onChange={(e) => handleDmnSelect(e.target.value)}
        className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
      >
        <option value="">-- Select a DMN --</option>
        {dmns.map((dmn) => (
          <option key={dmn.identifier} value={dmn.identifier}>
            {dmn.title.replace(/\.dmn$/i, '')}
          </option>
        ))}
      </select>

      {selectedDmn && (
        <div className="mt-2 p-2 bg-blue-50 rounded text-xs text-slate-600">
          <div className="font-medium mb-1">{selectedDmn.title.replace(/\.dmn$/i, '')}</div>
          {selectedDmn.description && (
            <div className="text-slate-500">{selectedDmn.description}</div>
          )}
          <div className="text-slate-500 mt-1 font-mono text-[10px]">
            ID: {selectedDmn.identifier}
          </div>
        </div>
      )}
    </div>
  );
};

export default DmnTemplateSelector;
