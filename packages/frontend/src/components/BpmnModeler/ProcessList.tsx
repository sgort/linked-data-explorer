import { FileText, Plus, Trash2 } from 'lucide-react';
import React, { useState } from 'react';

import { BpmnProcess } from '../../types';

interface ProcessListProps {
  processes: BpmnProcess[];
  activeProcessId: string | null;
  onCreateProcess: () => void;
  onLoadProcess: (processId: string) => void;
  onDeleteProcess: (processId: string) => void;
  onUpdateProcessName: (processId: string, name: string) => void;
}

const ProcessList: React.FC<ProcessListProps> = ({
  processes,
  activeProcessId,
  onCreateProcess,
  onLoadProcess,
  onDeleteProcess,
  onUpdateProcessName,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const handleStartEdit = (process: BpmnProcess) => {
    setEditingId(process.id);
    setEditingName(process.name);
  };

  const handleSaveEdit = (processId: string) => {
    if (editingName.trim()) {
      onUpdateProcessName(processId, editingName.trim());
    }
    setEditingId(null);
  };

  return (
    <div className="w-80 bg-white border-r border-slate-200 flex flex-col">
      {/* Header */}
      <div className="h-14 bg-slate-50 border-b border-slate-200 px-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">Processes</h2>
        <button
          onClick={onCreateProcess}
          className="p-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          title="Create New Process"
        >
          <Plus size={16} />
        </button>
      </div>

      {/* Process List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {processes.length === 0 ? (
          <div className="text-center py-8">
            <FileText size={48} className="mx-auto text-slate-300 mb-2" />
            <p className="text-sm text-slate-400">No processes yet</p>
          </div>
        ) : (
          processes.map((process) => (
            <div
              key={process.id}
              className={`p-3 rounded-lg border transition-all cursor-pointer ${
                activeProcessId === process.id
                  ? 'bg-blue-50 border-blue-200'
                  : 'bg-white border-slate-200 hover:border-slate-300'
              }`}
              onClick={() => onLoadProcess(process.id)}
            >
              <div className="flex items-start justify-between gap-2">
                {editingId === process.id ? (
                  <input
                    type="text"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onBlur={() => handleSaveEdit(process.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveEdit(process.id);
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="flex-1 px-2 py-1 border border-blue-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    autoFocus
                  />
                ) : (
                  <div className="flex-1" onDoubleClick={() => handleStartEdit(process)}>
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-slate-800 text-sm">{process.name}</h3>
                      {process.status === 'example' && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-medium">
                          EXAMPLE
                        </span>
                      )}
                      {process.status === 'wip' && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">
                          WIP
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      {new Date(process.updatedAt).toLocaleDateString()}
                    </p>
                  </div>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteProcess(process.id);
                  }}
                  disabled={process.readonly}
                  className={`p-1 rounded transition-colors ${
                    process.readonly
                      ? 'text-slate-300 cursor-not-allowed'
                      : 'hover:bg-red-100 text-slate-400 hover:text-red-600'
                  }`}
                  title={process.readonly ? 'Cannot delete example' : 'Delete Process'}
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

export default ProcessList;
