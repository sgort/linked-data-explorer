import { ChevronDown, ChevronRight, FileText, Plus, Trash2, Upload } from 'lucide-react';
import { useMemo, useRef } from 'react';
import React, { useState } from 'react';

import { BpmnProcess } from '../../types';
import ArtefactListToolbar, {
  filterArtefacts,
  LanguageFilter,
} from '../common/ArtefactListToolbar';
import DsoActiviteitSelector from './DsoActiviteitSelector';
import RopaSelector from './RopaSelector';

/** Organization key used when a process has no `organization` set. */
const UNGROUPED = '__ungrouped__';

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
  onDsoActiviteitUrnChange: (urn: string | undefined) => void;
  onLanguageChange?: (language: string | undefined) => void;
  onOrganizationChange?: (organization: string | undefined) => void;
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
  onDsoActiviteitUrnChange,
  onLanguageChange: _onLanguageChange,
  onOrganizationChange: _onOrganizationChange,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [search, setSearch] = useState('');
  const [languageFilter, setLanguageFilter] = useState<LanguageFilter>('all');
  const [collapsedOrgs, setCollapsedOrgs] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  /** Filter + group processes by organization. Memoised against full inputs. */
  const { filtered, groups } = useMemo(() => {
    const filteredProcesses = filterArtefacts(processes, search, languageFilter, (p) => [
      p.bpmnProcessId ?? '',
    ]);

    // Group: key = organization || UNGROUPED
    const map = new Map<string, BpmnProcess[]>();
    for (const p of filteredProcesses) {
      const key = p.organization || UNGROUPED;
      const bucket = map.get(key);
      if (bucket) bucket.push(p);
      else map.set(key, [p]);
    }

    // Sort: real orgs alphabetically, ungrouped always last
    const orderedKeys = [...map.keys()]
      .filter((k) => k !== UNGROUPED)
      .sort((a, b) => a.localeCompare(b));
    if (map.has(UNGROUPED)) orderedKeys.push(UNGROUPED);

    return {
      filtered: filteredProcesses,
      groups: orderedKeys.map((k) => ({ key: k, items: map.get(k) ?? [] })),
    };
  }, [processes, search, languageFilter]);

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
        const xml = ev.target?.result as string;
        const match = xml.match(/<(?:bpmn:)?process[^>]+name="([^"]+)"/);
        const name = match?.[1] ?? file.name.replace(/\.bpmn$/i, '');
        onImportProcess(xml, name);
      };
      reader.readAsText(file);
    });
    // Reset so the same files can be re-imported if needed
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
            multiple
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
      {/* Toolbar */}
      <ArtefactListToolbar
        search={search}
        onSearchChange={setSearch}
        languageFilter={languageFilter}
        onLanguageFilterChange={setLanguageFilter}
        matchCount={filtered.length}
        totalCount={processes.length}
      />
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
          if (filtered.length === 0) {
            return (
              <div className="text-center py-8">
                <FileText size={48} className="mx-auto text-slate-300 mb-2" />
                <p className="text-sm text-slate-400">No processes match the current filters</p>
              </div>
            );
          }

          const getSubprocesses = (shell: BpmnProcess, bucket: BpmnProcess[]) =>
            bucket.filter(
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
            <div className="space-y-3">
              {groups.map(({ key, items }) => {
                const isCollapsed = collapsedOrgs.has(key);
                const label = key === UNGROUPED ? 'Ungrouped' : key;
                const shells = items.filter((p) => p.processRole === 'shell');
                const standaloneAndUnclassified = items.filter(
                  (p) => !p.processRole || p.processRole === 'standalone'
                );
                return (
                  <div key={key}>
                    {/* Group header */}
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
                    {/* Group body */}
                    {!isCollapsed && (
                      <div className="space-y-2">
                        {shells.map((shell) => (
                          <div key={shell.id}>
                            {renderCard(shell)}
                            {getSubprocesses(shell, items).map((sub) => (
                              <div key={sub.id} className="flex items-start gap-1 mt-1">
                                <div className="mt-3 ml-2 text-slate-300 select-none">└</div>
                                <div className="flex-1">{renderCard(sub, true)}</div>
                              </div>
                            ))}
                          </div>
                        ))}
                        {standaloneAndUnclassified.map((p) => renderCard(p))}
                      </div>
                    )}
                  </div>
                );
              })}
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
          <div className="border-t border-slate-200">
            <DsoActiviteitSelector
              bpmnProcessId={activeProcess.bpmnProcessId ?? ''}
              currentUrn={activeProcess.xml.match(/ronl:dsoActiviteitUrn="([^"]+)"/)?.[1]}
              onUrnChange={onDsoActiviteitUrnChange}
            />
          </div>
        </div>
      )}{' '}
    </div>
  );
};

export default ProcessList;
