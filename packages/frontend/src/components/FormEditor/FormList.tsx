import { ChevronDown, ChevronRight, LayoutTemplate, Plus, Trash2, Upload } from 'lucide-react';
import React, { useMemo, useRef, useState } from 'react';

import { FormSchema } from '../../types';
import ArtefactListToolbar, {
  filterArtefacts,
  LanguageFilter,
} from '../common/ArtefactListToolbar';
import LanguageSelector, { LanguageCode } from '../common/LanguageSelector';
import OrganizationSelector from '../common/OrganizationSelector';

/** Organization key used when a form has no `organization` set. */
const UNGROUPED = '__ungrouped__';

interface FormListProps {
  forms: FormSchema[];
  activeFormId: string | null;
  activeForm?: FormSchema | null;
  /** Effective values for the footer (draft-aware, computed by parent). */
  effectiveLanguage?: FormSchema['language'];
  effectiveOrganization?: string;
  onCreateForm: () => void;
  onImportForm: (
    schema: Record<string, unknown>,
    name: string,
    inferredLanguage?: string,
    inferredOrganization?: string
  ) => void;
  onLoadForm: (formId: string) => void;
  onDeleteForm: (formId: string) => void;
  onUpdateFormName: (formId: string, name: string) => void;
  onLanguageChange?: (language: LanguageCode | undefined) => void;
  onOrganizationChange?: (organization: string | undefined) => void;
}

const FormList: React.FC<FormListProps> = ({
  forms,
  activeFormId,
  activeForm,
  effectiveLanguage,
  effectiveOrganization,
  onCreateForm,
  onImportForm,
  onLoadForm,
  onDeleteForm,
  onUpdateFormName,
  onLanguageChange,
  onOrganizationChange,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [search, setSearch] = useState('');
  const [languageFilter, setLanguageFilter] = useState<LanguageFilter>('all');
  const [collapsedOrgs, setCollapsedOrgs] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  /** Filter + group forms by organization. Memoised against full inputs. */
  const { filtered, groups } = useMemo(() => {
    const filteredForms = filterArtefacts(forms, search, languageFilter, (f) => [
      (f.schema as { id?: string })?.id ?? '',
    ]);

    const map = new Map<string, FormSchema[]>();
    for (const f of filteredForms) {
      const key = f.organization || UNGROUPED;
      const bucket = map.get(key);
      if (bucket) bucket.push(f);
      else map.set(key, [f]);
    }

    const orderedKeys = [...map.keys()]
      .filter((k) => k !== UNGROUPED)
      .sort((a, b) => a.localeCompare(b));
    if (map.has(UNGROUPED)) orderedKeys.push(UNGROUPED);

    return {
      filtered: filteredForms,
      groups: orderedKeys.map((k) => ({ key: k, items: map.get(k) ?? [] })),
    };
  }, [forms, search, languageFilter]);

  const toggleOrg = (key: string) =>
    setCollapsedOrgs((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  /** Distinct organization keys across all forms, for datalist autocomplete. */
  const organizationSuggestions = useMemo(
    () =>
      [
        ...new Set(
          forms.map((f) => f.organization).filter((o): o is string => !!o && o.trim() !== '')
        ),
      ].sort(),
    [forms]
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const parsed = JSON.parse(ev.target?.result as string) as Record<string, unknown>;
          // Strip LDE wrapper keys before handing the schema to form-js — they
          // aren't part of the form-js spec. They flow back via the inferred
          // language / organization params.
          const { language: jsonLang, organization: jsonOrg, ...schema } = parsed;

          const baseName = file.name.replace(/\.form$/i, '');
          const langMatch = baseName.match(/\.(en|nl|de)$/i);
          const filenameLang = langMatch?.[1].toLowerCase();
          const cleanName = langMatch ? baseName.slice(0, -langMatch[0].length) : baseName;

          // Prefer the language baked into the JSON over filename inference.
          const inferredLanguage = (jsonLang as string | undefined) ?? filenameLang;
          const name = (schema.id as string) ?? cleanName;
          onImportForm(
            schema as Record<string, unknown>,
            name,
            inferredLanguage,
            jsonOrg as string | undefined
          );
        } catch {
          alert(`Invalid .form file — could not parse JSON: ${file.name}`);
        }
      };
      reader.readAsText(file);
    });
    e.target.value = '';
  };

  const handleStartEdit = (form: FormSchema) => {
    if (form.readonly) return;
    setEditingId(form.id);
    setEditingName(form.name);
  };

  const handleSaveEdit = (formId: string) => {
    if (editingName.trim()) {
      onUpdateFormName(formId, editingName.trim());
    }
    setEditingId(null);
  };

  const renderCard = (form: FormSchema) => (
    <div
      key={form.id}
      className={`p-3 rounded-lg border cursor-pointer transition-colors ${
        activeFormId === form.id
          ? 'bg-blue-50 border-blue-200'
          : 'bg-white border-slate-200 hover:border-slate-300'
      }`}
      onClick={() => onLoadForm(form.id)}
    >
      <div className="flex items-start justify-between gap-2">
        {editingId === form.id ? (
          <input
            type="text"
            value={editingName}
            onChange={(e) => setEditingName(e.target.value)}
            onBlur={() => handleSaveEdit(form.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSaveEdit(form.id);
              if (e.key === 'Escape') setEditingId(null);
            }}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 px-2 py-1 border border-blue-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
          />
        ) : (
          <div className="flex-1" onDoubleClick={() => handleStartEdit(form)}>
            <div className="flex items-center gap-2">
              <h3 className="font-medium text-slate-800 text-sm">{form.name}</h3>
              {form.status === 'example' && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-medium">
                  EXAMPLE
                </span>
              )}
              {form.status === 'wip' && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">
                  WIP
                </span>
              )}
              {form.status === 'dso' && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-medium">
                  DSO
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {new Date(form.updatedAt).toLocaleDateString()}
            </p>
          </div>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDeleteForm(form.id);
          }}
          disabled={form.readonly}
          className={`p-1 rounded transition-colors ${
            form.readonly
              ? 'text-slate-300 cursor-not-allowed'
              : 'hover:bg-red-100 text-slate-400 hover:text-red-600'
          }`}
          title={form.readonly ? 'Cannot delete example' : 'Delete form'}
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );

  return (
    <div className="w-80 border-r border-slate-200 bg-white flex flex-col flex-shrink-0">
      <div className="p-4 border-b border-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Forms</h2>
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".form"
              multiple
              className="hidden"
              onChange={handleFileChange}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
              title="Import .form file"
            >
              <Upload size={16} />
            </button>
            <button
              onClick={onCreateForm}
              className="p-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
              title="New Form"
            >
              <Plus size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <ArtefactListToolbar
        search={search}
        onSearchChange={setSearch}
        languageFilter={languageFilter}
        onLanguageFilterChange={setLanguageFilter}
        matchCount={filtered.length}
        totalCount={forms.length}
      />

      <div className="flex-1 overflow-y-auto p-2 space-y-3">
        {forms.length === 0 ? (
          <div className="text-center py-8 text-slate-400">
            <LayoutTemplate size={32} className="mx-auto mb-2 opacity-50" />
            <p className="text-xs">No forms yet</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8 text-slate-400">
            <LayoutTemplate size={32} className="mx-auto mb-2 opacity-50" />
            <p className="text-xs">No forms match the current filters</p>
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
                {!isCollapsed && <div className="space-y-1">{items.map(renderCard)}</div>}
              </div>
            );
          })
        )}
      </div>

      {activeForm && (
        <div className="border-t border-slate-200 bg-slate-50 shrink-0 max-h-[50vh] overflow-y-auto">
          <LanguageSelector
            currentLanguage={effectiveLanguage as LanguageCode | undefined}
            onLanguageChange={(lang) => onLanguageChange?.(lang)}
            disabled={!onLanguageChange || activeForm.readonly}
          />
          <div className="border-t border-slate-200">
            <OrganizationSelector
              currentOrganization={effectiveOrganization}
              onOrganizationChange={(org) => onOrganizationChange?.(org)}
              suggestions={organizationSuggestions}
              disabled={!onOrganizationChange || activeForm.readonly}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default FormList;
