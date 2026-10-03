/**
 * DocumentTemplateSelector
 *
 * Destination: packages/frontend/src/components/BpmnModeler/DocumentTemplateSelector.tsx
 *
 * Injected into the bpmn-js properties panel for UserTask elements.
 * Writes ronl:documentRef to the BPMN element (same pattern as FormTemplateSelector).
 * Badge colour: purple (distinguishable from green form badge).
 *
 * The attribute holds a comma-separated LIST (see utils/documentRefs.ts): a
 * task can produce several deliverables, so the control attaches many. The
 * select is an "add" action rather than the state itself — the attached
 * templates are the chips above it, each removable — because a multi-select
 * makes removing one of three a ctrl-click puzzle, and the list is the thing
 * the modeller is actually editing.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useState } from 'react';

import { DocumentService } from '../../services/documentService';
import { DocumentTemplate } from '../../types/document.types';
import { formatDocumentRefs, parseDocumentRefs } from '../../utils/documentRefs';

interface DocumentTemplateSelectorProps {
  element: any;
  modeling: any;
  /** Raw `ronl:documentRef` value — one id, or several separated by commas. */
  selectedDocumentRef?: string;
}

const DocumentTemplateSelector: React.FC<DocumentTemplateSelectorProps> = ({
  element,
  modeling,
  selectedDocumentRef,
}) => {
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>(parseDocumentRefs(selectedDocumentRef));

  useEffect(() => {
    setTemplates(DocumentService.getTemplates());
  }, []);

  useEffect(() => {
    setSelectedIds(parseDocumentRefs(selectedDocumentRef));
  }, [selectedDocumentRef]);

  const write = (ids: string[]) => {
    setSelectedIds(ids);
    modeling.updateProperties(element, {
      'ronl:documentRef': formatDocumentRefs(ids),
    });
  };

  const handleAdd = (templateId: string) => {
    if (!templateId || selectedIds.includes(templateId)) return;
    write([...selectedIds, templateId]);
  };

  const handleRemove = (templateId: string) => {
    write(selectedIds.filter((id) => id !== templateId));
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

  const selectedTemplates = selectedIds.map((id) => ({
    id,
    template: templates.find((t) => t.id === id),
  }));
  const unattached = templates.filter((t) => !selectedIds.includes(t.id));

  return (
    <div className="p-3 bg-white border-t border-slate-200">
      <label className="block text-xs font-medium text-slate-700 mb-2">
        Link decision templates
      </label>

      {selectedTemplates.map(({ id, template }) => (
        <div key={id} className="mt-2 p-2 rounded text-xs bg-purple-50 text-slate-600">
          <div className="flex items-start justify-between gap-2">
            {/* An id with no template happens when a BPMN arrives referencing a
                template this browser has not been seeded with. Showing the id
                is more useful than hiding the attachment. */}
            <div className="font-medium text-purple-700 mb-1">📄 {template?.name ?? id}</div>
            <button
              type="button"
              onClick={() => handleRemove(id)}
              aria-label={`Remove ${template?.name ?? id}`}
              className="text-slate-400 hover:text-red-600 leading-none"
            >
              ✕
            </button>
          </div>
          {template?.description && (
            <div className="text-slate-500 mb-1">{template.description}</div>
          )}
          {template?.processKey && (
            <div className="text-slate-500 font-mono text-[10px]">
              processKey: {template.processKey}
            </div>
          )}
          <div className="text-slate-400 font-mono text-[10px] mt-0.5">documentRef: {id}</div>
        </div>
      ))}

      <select
        value=""
        onChange={(e) => handleAdd(e.target.value)}
        disabled={unattached.length === 0}
        className="mt-2 w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none bg-white disabled:bg-slate-50 disabled:text-slate-400"
      >
        <option value="">
          {unattached.length === 0 ? '-- All templates attached --' : '-- Add a template --'}
        </option>
        {unattached.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
    </div>
  );
};

export default DocumentTemplateSelector;
