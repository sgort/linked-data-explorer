import { FileText, Plus, Trash2, Upload } from 'lucide-react';
import { useRef } from 'react';
import React, { useState } from 'react';

import { BpmnProcess } from '../../types';
import RopaSelector from './RopaSelector';

interface ProcessListProps {
  processes: BpmnProcess[];
  activeProcessId: string | null;
  activeProcess: BpmnProcess | null;
  onCreateProcess: () => void;
  onImportProcess: (xml: string, name: string) => void;
  onLoadProcess: (processId: string) => void;
  onDeleteProcess: (processId: string) => void;
  onUpdateProcessName: (processId: string, name: string) => void;
  onRopaRefChange: (ropaRef: string | undefined) => void;
}

const ProcessList: React.FC<ProcessListProps> = ({
  processes,
  activeProcessId,
  activeProcess,
  onCreateProcess,
  onImportProcess,
  onLoadProcess,
  onDeleteProcess,
  onUpdateProcessName,
  onRopaRefChange,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const xml = ev.target?.result as string;
      const match = xml.match(/<(?:bpmn:)?process[^>]+name="([^"]+)"/);
      const name = match?.[1] ?? file.name.replace(/\.bpmn$/i, '');
      onImportProcess(xml, name);
    };
    reader.readAsText(file);
    // Reset so the same file can be re-imported if needed
    e.target.value = '';
  };

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
        <h2 className="text-sm font-semibold text-slate-700">PROCESSES</h2>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".bpmn"
            className="hidden"
            onChange={handleFileChange}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-2 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
            title="Import .bpmn file"
          >
            <Upload size={16} />
          </button>
          <button
            onClick={onCreateProcess}
            className="p-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
            title="Create New Process"
          >
            <Plus size={16} />
          </button>
        </div>
      </div>
      {/* Process List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {(() => {
          if (processes.length === 0) {
            return (
              <div className="text-center py-8">
                <FileText size={48} className="mx-auto text-slate-300 mb-2" />
                <p className="text-sm text-slate-400">No processes yet</p>
              </div>
            );
          }

          const shells = processes.filter((p) => p.processRole === 'shell');
          const standaloneAndUnclassified = processes.filter(
            (p) => !p.processRole || p.processRole === 'standalone'
          );

          const getSubprocesses = (shell: BpmnProcess) =>
            processes.filter(
              (p) => p.processRole === 'subprocess' && p.calledElement === shell.bpmnProcessId
            );

          const renderCard = (process: BpmnProcess, indented = false) => (
            <div
              key={process.id}
              className={`p-3 rounded-lg border transition-all cursor-pointer ${indented ? 'ml-4' : ''} ${
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
                    <div className="flex items-center gap-2 flex-wrap">
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
                      {process.processRole === 'shell' && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 font-medium">
                          SHELL
                        </span>
                      )}
                      {process.processRole === 'subprocess' && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-teal-100 text-teal-700 font-medium">
                          SUB
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
                  disabled={process.status === 'example'}
                  title={process.status === 'example' ? 'Cannot delete example' : 'Delete'}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          );
          return (
            <div className="space-y-2">
              {shells.map((shell) => (
                <div key={shell.id}>
                  {renderCard(shell)}
                  {getSubprocesses(shell).map((sub) => (
                    <div key={sub.id} className="flex items-start gap-1 mt-1">
                      <div className="mt-3 ml-2 text-slate-300 select-none">└</div>
                      <div className="flex-1">{renderCard(sub, true)}</div>
                    </div>
                  ))}
                </div>
              ))}
              {standaloneAndUnclassified.map((p) => renderCard(p))}
            </div>
          );
        })()}
      </div>
      {activeProcess && (
        <div className="border-t border-slate-200 bg-slate-50 shrink-0">
          <RopaSelector
            bpmnProcessId={activeProcess.bpmnProcessId ?? ''}
            currentRopaRef={activeProcess.xml.match(/ronl:ropaRef="([^"]+)"/)?.[1]}
            onRopaRefChange={onRopaRefChange}
          />
        </div>
      )}{' '}
    </div>
  );
};

export default ProcessList;
