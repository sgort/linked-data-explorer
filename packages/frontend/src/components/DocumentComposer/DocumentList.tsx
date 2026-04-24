import { ChevronDown, ChevronRight, FileText, Plus, Trash2, Upload } from 'lucide-react';
import React, { useMemo, useRef, useState } from 'react';

import { DocumentTemplate } from '../../types/document.types';
import ArtefactListToolbar, {
  filterArtefacts,
  LanguageFilter,
} from '../common/ArtefactListToolbar';

/** Organization key used when a document has no `organization` set. */
const UNGROUPED = '__ungrouped__';

interface DocumentListProps {
  templates: DocumentTemplate[];
  activeTemplateId: string | null;
  onCreateTemplate: () => void;
  onImportTemplate: (template: DocumentTemplate) => void;
  onLoadTemplate: (id: string) => void;
  onDeleteTemplate: (id: string) => void;
  onUpdateTemplateName: (id: string, name: string) => void;
}

const DocumentList: React.FC<DocumentListProps> = ({
  templates,
  activeTemplateId,
  onCreateTemplate,
  onImportTemplate,
  onLoadTemplate,
  onDeleteTemplate,
  onUpdateTemplateName,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [search, setSearch] = useState('');
  const [languageFilter, setLanguageFilter] = useState<LanguageFilter>('all');
  const [collapsedOrgs, setCollapsedOrgs] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  /** Filter + group templates by organization. Memoised against full inputs. */
  const { filtered, groups } = useMemo(() => {
    const filteredTemplates = filterArtefacts(templates, search, languageFilter, (t) => [
      t.processKey ?? '',
    ]);

    const map = new Map<string, DocumentTemplate[]>();
    for (const t of filteredTemplates) {
      const key = t.organization || UNGROUPED;
      const bucket = map.get(key);
      if (bucket) bucket.push(t);
      else map.set(key, [t]);
    }

    const orderedKeys = [...map.keys()]
      .filter((k) => k !== UNGROUPED)
      .sort((a, b) => a.localeCompare(b));
    if (map.has(UNGROUPED)) orderedKeys.push(UNGROUPED);

    return {
      filtered: filteredTemplates,
      groups: orderedKeys.map((k) => ({ key: k, items: map.get(k) ?? [] })),
    };
  }, [templates, search, languageFilter]);

  const toggleOrg = (key: string) =>
    setCollapsedOrgs((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const template = JSON.parse(ev.target?.result as string) as DocumentTemplate;
          onImportTemplate({
            ...template,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            readonly: false,
            status: 'wip',
          });
        } catch {
          alert(`Invalid .document file — could not parse JSON: ${file.name}`);
        }
      };
      reader.readAsText(file);
    });
    e.target.value = '';
  };

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

  const renderCard = (template: DocumentTemplate) => (
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
              <span className="font-medium text-slate-800 text-sm truncate">{template.name}</span>
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
              <p className="text-[10px] text-slate-400 mt-0.5 truncate">{template.processKey}</p>
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
  );

  return (
    <div className="w-80 flex-shrink-0 flex flex-col border-r border-slate-200 bg-white">
      {/* Header */}
      <div className="h-12 flex items-center justify-between px-4 border-b border-slate-200 flex-shrink-0">
        <span className="text-sm font-semibold text-slate-700">DOCUMENTS</span>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".document"
            multiple
            className="hidden"
            onChange={handleFileChange}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
            title="Import .document file"
          >
            <Upload size={16} />
          </button>
          <button
            onClick={onCreateTemplate}
            className="p-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
            title="Create New document"
          >
            <Plus size={16} />
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <ArtefactListToolbar
        search={search}
        onSearchChange={setSearch}
        languageFilter={languageFilter}
        onLanguageFilterChange={setLanguageFilter}
        matchCount={filtered.length}
        totalCount={templates.length}
      />

      {/* List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {templates.length === 0 ? (
          <div className="text-center py-8 text-slate-400">
            <FileText size={28} className="mx-auto mb-2 opacity-30" />
            <p className="text-xs">No documents yet</p>
            <p className="text-xs mt-1">Click + to get started</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8 text-slate-400">
            <FileText size={28} className="mx-auto mb-2 opacity-30" />
            <p className="text-xs">No documents match the current filters</p>
          </div>
        ) : (
          groups.map(({ key, items }) => {
            const isCollapsed = collapsedOrgs.has(key);
            const label = key === UNGROUPED ? 'Ungrouped' : key;
            return (
              <div key={key}>
                <button
                  onClick={() => toggleOrg(key)}
                  className="w-full flex items-center gap-1 px-1 py-1 mb-1
                             text-[10px] font-bold uppercase tracking-wide
                             text-slate-500 hover:text-slate-700"
                >
                  {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                  <span>{label}</span>
                  <span className="ml-auto font-mono text-slate-400 normal-case">
                    {items.length}
                  </span>
                </button>
                {!isCollapsed && <div className="space-y-2">{items.map(renderCard)}</div>}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default DocumentList;
