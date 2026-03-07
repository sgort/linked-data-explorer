/**
 * DocumentList
 *
 * Destination: packages/frontend/src/components/DocumentComposer/DocumentList.tsx
 *
 * Left list panel showing all document templates.
 * Mirrors FormList.tsx in structure and behaviour.
 */

import { FileText, Plus, Trash2 } from 'lucide-react';
import React, { useState } from 'react';

import { DocumentTemplate } from '../../types/document.types';

interface DocumentListProps {
  templates: DocumentTemplate[];
  activeTemplateId: string | null;
  onCreateTemplate: () => void;
  onLoadTemplate: (id: string) => void;
  onDeleteTemplate: (id: string) => void;
  onUpdateTemplateName: (id: string, name: string) => void;
}

const DocumentList: React.FC<DocumentListProps> = ({
  templates,
  activeTemplateId,
  onCreateTemplate,
  onLoadTemplate,
  onDeleteTemplate,
  onUpdateTemplateName,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const handleStartEdit = (template: DocumentTemplate) => {
    if (template.readonly) return;
    setEditingId(template.id);
    setEditingName(template.name);
  };

  const handleSaveEdit = (id: string) => {
    if (editingName.trim()) {
      onUpdateTemplateName(id, editingName.trim());
    }
    setEditingId(null);
  };

  return (
    <div className="w-64 flex-shrink-0 flex flex-col border-r border-slate-200 bg-white">
      {/* Header */}
      <div className="h-12 flex items-center justify-between px-4 border-b border-slate-200 flex-shrink-0">
        <span className="text-sm font-semibold text-slate-700">Documents</span>
        <button
          onClick={onCreateTemplate}
          className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
          title="New document"
        >
          <Plus size={16} />
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {templates.length === 0 && (
          <div className="text-center py-8 text-slate-400">
            <FileText size={28} className="mx-auto mb-2 opacity-30" />
            <p className="text-xs">No documents</p>
            <p className="text-xs mt-1">Click + to get started</p>
          </div>
        )}

        {templates.map((template) => (
          <div
            key={template.id}
            onClick={() => onLoadTemplate(template.id)}
            className={`
              p-3 rounded-lg border cursor-pointer transition-all
              ${
                activeTemplateId === template.id
                  ? 'bg-blue-50 border-blue-200'
                  : 'bg-white border-slate-200 hover:border-slate-300'
              }
            `}
          >
            <div className="flex items-start justify-between gap-2">
              {editingId === template.id ? (
                <input
                  type="text"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onBlur={() => handleSaveEdit(template.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveEdit(template.id);
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="flex-1 px-2 py-0.5 border border-blue-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
              ) : (
                <div className="flex-1 min-w-0" onDoubleClick={() => handleStartEdit(template)}>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-medium text-slate-800 text-sm truncate">
                      {template.name}
                    </span>
                    {template.status === 'example' && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-medium flex-shrink-0">
                        EXAMPLE
                      </span>
                    )}
                    {template.status === 'wip' && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium flex-shrink-0">
                        DRAFT
                      </span>
                    )}
                  </div>
                  {template.processKey && (
                    <p className="text-[10px] text-slate-400 mt-0.5 truncate">
                      {template.processKey}
                    </p>
                  )}
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {new Date(template.updatedAt).toLocaleDateString('nl-NL')}
                  </p>
                </div>
              )}

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteTemplate(template.id);
                }}
                disabled={template.readonly}
                className={`p-1 rounded flex-shrink-0 transition-colors ${
                  template.readonly
                    ? 'text-slate-200 cursor-not-allowed'
                    : 'text-slate-300 hover:text-red-500 hover:bg-red-50'
                }`}
                title={template.readonly ? 'Example documents cannot be deleted' : 'Delete'}
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DocumentList;
