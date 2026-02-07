import React from 'react';

interface BpmnPropertiesProps {
  selectedElement: unknown;
  endpoint?: string; // Make optional with ?
  onUpdateElement: (updates: Record<string, unknown>) => void;
}

const BpmnProperties: React.FC<BpmnPropertiesProps> = ({
  selectedElement,
  // endpoint is available but unused for now
  onUpdateElement,
}) => {
  // Type guard for element
  const element = selectedElement as {
    type?: string;
    id?: string;
    businessObject?: { name?: string };
  } | null;

  if (!element) {
    return (
      <div className="w-80 bg-white border-l border-slate-200 p-4">
        <div className="text-center py-8">
          <p className="text-sm text-slate-400">Select an element to view properties</p>
        </div>
      </div>
    );
  }

  const elementType = element.type || 'Unknown';
  const elementName = element.businessObject?.name || 'Unnamed';
  const elementId = element.id || '';

  return (
    <div className="w-80 bg-white border-l border-slate-200 flex flex-col">
      {/* Header */}
      <div className="h-14 bg-slate-50 border-b border-slate-200 px-4 flex items-center">
        <h2 className="text-sm font-semibold text-slate-700">Properties</h2>
      </div>

      {/* Properties Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Element Type */}
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Element Type</label>
          <div className="px-3 py-2 bg-slate-50 rounded text-sm text-slate-700 border border-slate-200">
            {elementType.replace('bpmn:', '')}
          </div>
        </div>

        {/* Element ID */}
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">ID</label>
          <div className="px-3 py-2 bg-slate-50 rounded text-sm text-slate-700 font-mono border border-slate-200">
            {elementId}
          </div>
        </div>

        {/* Element Name */}
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Name</label>
          <input
            type="text"
            value={elementName}
            onChange={(e) => onUpdateElement({ name: e.target.value })}
            className="w-full px-3 py-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            placeholder="Element name"
          />
        </div>

        {/* Business Rule Task Properties */}
        {elementType === 'bpmn:BusinessRuleTask' && (
          <>
            <div className="pt-4 border-t border-slate-200">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">DMN Decision Reference</h3>
              <p className="text-xs text-slate-500 mb-3">Link this task to a DMN decision model</p>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    Decision Ref
                  </label>
                  <input
                    type="text"
                    placeholder="DMN identifier"
                    className="w-full px-3 py-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    Result Variable
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., decision"
                    className="w-full px-3 py-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default BpmnProperties;
