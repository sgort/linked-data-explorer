import { LayoutTemplate, Plus, Trash2 } from 'lucide-react';
import React, { useState } from 'react';

import { FormSchema } from '../../types';

interface FormListProps {
  forms: FormSchema[];
  activeFormId: string | null;
  onCreateForm: () => void;
  onLoadForm: (formId: string) => void;
  onDeleteForm: (formId: string) => void;
  onUpdateFormName: (formId: string, name: string) => void;
}

const FormList: React.FC<FormListProps> = ({
  forms,
  activeFormId,
  onCreateForm,
  onLoadForm,
  onDeleteForm,
  onUpdateFormName,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

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

  return (
    <div className="w-64 border-r border-slate-200 bg-white flex flex-col flex-shrink-0">
      <div className="p-4 border-b border-slate-200">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Forms</h2>
          <button
            onClick={onCreateForm}
            className="p-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
            title="New Form"
          >
            <Plus size={16} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {forms.length === 0 ? (
          <div className="text-center py-8 text-slate-400">
            <LayoutTemplate size={32} className="mx-auto mb-2 opacity-50" />
            <p className="text-xs">No forms yet</p>
          </div>
        ) : (
          forms.map((form) => (
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
          ))
        )}
      </div>
    </div>
  );
};

export default FormList;
