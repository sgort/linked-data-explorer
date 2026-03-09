/**
 * DocumentTemplateSelector
 *
 * Destination: packages/frontend/src/components/BpmnModeler/DocumentTemplateSelector.tsx
 *
 * Injected into the bpmn-js properties panel for UserTask elements.
 * Writes ronl:documentRef to the BPMN element (same pattern as FormTemplateSelector).
 * Badge colour: purple (distinguishable from green form badge).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useState } from 'react';

import { DocumentService } from '../../services/documentService';
import { DocumentTemplate } from '../../types/document.types';

interface DocumentTemplateSelectorProps {
  element: any;
  modeling: any;
  selectedDocumentRef?: string;
}

const DocumentTemplateSelector: React.FC<DocumentTemplateSelectorProps> = ({
  element,
  modeling,
  selectedDocumentRef,
}) => {
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [selectedId, setSelectedId] = useState<string>(selectedDocumentRef ?? '');

  useEffect(() => {
    setTemplates(DocumentService.getTemplates());
  }, []);

  useEffect(() => {
    setSelectedId(selectedDocumentRef ?? '');
  }, [selectedDocumentRef]);

  const handleSelect = (templateId: string) => {
    setSelectedId(templateId);

    if (!templateId) {
      modeling.updateProperties(element, {
        'ronl:documentRef': undefined,
      });
      return;
    }

    modeling.updateProperties(element, {
      'ronl:documentRef': templateId,
    });
  };

  if (templates.length === 0) {
    return (
      <div className="p-3 bg-white border-t border-slate-200">
        <div className="text-sm text-slate-500">
          No documents available — create one in the Document Composer.
        </div>
      </div>
    );
  }

  const selectedTemplate = templates.find((t) => t.id === selectedId);

  return (
    <div className="p-3 bg-white border-t border-slate-200">
      <label className="block text-xs font-medium text-slate-700 mb-2">
        Link decision template
      </label>
      <select
        value={selectedId}
        onChange={(e) => handleSelect(e.target.value)}
        className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none bg-white"
      >
        <option value="">-- Select a template --</option>
        {templates.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>

      {selectedTemplate && (
        <div className="mt-2 p-2 rounded text-xs bg-purple-50 text-slate-600">
          <div className="font-medium text-purple-700 mb-1">📄 {selectedTemplate.name}</div>
          {selectedTemplate.description && (
            <div className="text-slate-500 mb-1">{selectedTemplate.description}</div>
          )}
          {selectedTemplate.processKey && (
            <div className="text-slate-500 font-mono text-[10px]">
              processKey: {selectedTemplate.processKey}
            </div>
          )}
          <div className="text-slate-400 font-mono text-[10px] mt-0.5">
            documentRef: {selectedId}
          </div>
        </div>
      )}
    </div>
  );
};

export default DocumentTemplateSelector;
