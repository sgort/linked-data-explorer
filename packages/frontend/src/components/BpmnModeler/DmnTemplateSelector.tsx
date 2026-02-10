/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useState } from 'react';

import { ChainTemplate, templateService } from '../../services/templateService';
import { getUserTemplates } from '../../services/userTemplateStorage';

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
  const [templates, setTemplates] = useState<ChainTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');

  // Load templates on mount
  useEffect(() => {
    loadTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint]);

  const loadTemplates = async () => {
    setIsLoading(true);
    try {
      // Load predefined templates from backend
      const predefinedTemplates = await templateService.getAllTemplates(endpoint);

      // Load user templates from localStorage for this endpoint
      const userTemplates = getUserTemplates(endpoint);

      // Merge both, user templates appear after predefined
      setTemplates([...predefinedTemplates, ...userTemplates]);
    } catch (error) {
      console.error('Failed to load DMN templates:', error);
      setTemplates([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplateId(templateId);

    if (!templateId) {
      // Clear selection
      modeling.updateProperties(element, {
        'camunda:decisionRef': undefined,
        'camunda:resultVariable': undefined,
      });
      return;
    }

    const template = templates.find((t) => t.id === templateId);
    if (!template) return;

    // Get the first DMN ID from the template
    const dmnId = template.dmnIds[0];

    // Suggest result variable name (lowercase first letter of DMN ID)
    const suggestedVariable = dmnId.charAt(0).toLowerCase() + dmnId.slice(1) + 'Result';

    // Update BusinessRuleTask properties
    modeling.updateProperties(element, {
      'camunda:decisionRef': dmnId,
      'camunda:resultVariable': suggestedVariable,
      'camunda:mapDecisionResult': 'singleEntry',
    });
  };

  if (isLoading) {
    return (
      <div className="p-3 bg-white border-t border-slate-200">
        <div className="text-sm text-slate-500">Loading DMN templates...</div>
      </div>
    );
  }

  if (templates.length === 0) {
    return (
      <div className="p-3 bg-white border-t border-slate-200">
        <div className="text-sm text-slate-500">No DMN templates available</div>
        <div className="text-xs text-slate-400 mt-1">
          Create templates in the Chain Composer first
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 bg-white border-t border-slate-200">
      <label className="block text-xs font-medium text-slate-700 mb-2">
        Quick Link to DMN Template
      </label>
      <select
        value={selectedTemplateId}
        onChange={(e) => handleTemplateSelect(e.target.value)}
        className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
      >
        <option value="">-- Select a template --</option>
        {templates.map((template) => (
          <option key={template.id} value={template.id}>
            {template.name}
          </option>
        ))}
      </select>

      {selectedTemplateId && (
        <div className="mt-2 p-2 bg-blue-50 rounded text-xs text-slate-600">
          <div className="font-medium mb-1">
            {templates.find((t) => t.id === selectedTemplateId)?.name}
          </div>
          <div className="text-slate-500">
            {templates.find((t) => t.id === selectedTemplateId)?.description}
          </div>
          <div className="text-slate-500 mt-1 font-mono text-[10px]">
            DMN: {templates.find((t) => t.id === selectedTemplateId)?.dmnIds.join(', ')}
          </div>
        </div>
      )}
    </div>
  );
};

export default DmnTemplateSelector;
