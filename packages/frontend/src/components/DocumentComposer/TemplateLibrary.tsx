/**
 * TemplateLibrary
 *
 * Destination: packages/frontend/src/components/DocumentComposer/TemplateLibrary.tsx
 *
 * Right panel — "Sjablonen" tab.
 * Displays all available templates (localStorage + seeded examples), grouped by processKey.
 * Clicking a template loads it into the editor (with a "Save as new" prompt for readonly templates).
 */

import { BookOpen, FileText } from 'lucide-react';
import React from 'react';

import { DocumentTemplate } from '../../types/document.types';

interface TemplateLibraryProps {
  templates: DocumentTemplate[];
  activeTemplateId: string | null;
  onLoadTemplate: (template: DocumentTemplate) => void;
}

const TemplateLibrary: React.FC<TemplateLibraryProps> = ({
  templates,
  activeTemplateId,
  onLoadTemplate,
}) => {
  // Group by processKey, ungrouped last
  const groups = new Map<string, DocumentTemplate[]>();

  for (const t of templates) {
    const key = t.processKey ?? '—';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }

  if (templates.length === 0) {
    return (
      <div className="text-center py-8 text-slate-400">
        <FileText size={32} className="mx-auto mb-2 opacity-30" />
        <p className="text-xs">No templates available.</p>
        <p className="text-xs mt-1">Create a new document to get started.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-400 px-1">Click a template to open it in the editor</p>

      {Array.from(groups.entries()).map(([processKey, group]) => (
        <div key={processKey}>
          <div className="flex items-center gap-1.5 mb-2 px-1">
            <BookOpen size={11} className="text-slate-400" />
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              {processKey}
            </span>
          </div>

          <div className="space-y-1.5">
            {group.map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => onLoadTemplate(template)}
                className={`
                  w-full text-left px-3 py-2 rounded-lg border transition-all
                  ${
                    activeTemplateId === template.id
                      ? 'bg-blue-50 border-blue-300 text-blue-800'
                      : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700'
                  }
                `}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{template.name}</p>
                    {template.description && (
                      <p className="text-[10px] text-slate-400 mt-0.5 truncate">
                        {template.description}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    {template.status === 'example' && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-medium">
                        EXAMPLE
                      </span>
                    )}
                    {template.status === 'wip' && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">
                        DRAFT
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

export default TemplateLibrary;
