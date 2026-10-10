/* eslint-disable @typescript-eslint/no-explicit-any */
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import React, { useEffect, useState } from 'react';

import { PhaseView } from '../../utils/phases/assignPhases';
import {
  applyPhaseUpdates,
  ModdleUpdate,
  planClearCodes,
  planRenameCode,
  ProcessTarget,
} from '../../utils/phases/phaseCommands';
import {
  AWB_PHASES,
  cleanPhaseName,
  codeFromName,
  DEFAULT_PHASE_LABEL,
  isValidPhaseCode,
  parseDeclaredPhases,
  Phase,
  Scheme,
  serializePhases,
} from '../../utils/phases/phaseSet';

interface ProcessPhasesEditorProps {
  target: ProcessTarget;
  /** The counted nodes (markerTargets), whose markers follow a rename or removal. */
  nodes: any[];
  commandStack: any;
  view: PhaseView;
  schemeIntent?: Scheme | 'none';
  onSchemeIntent: (scheme: Scheme | 'none' | undefined) => void;
  note?: string;
  /** False for a pool other than the one RBA reads. */
  readByRba?: boolean;
}

/**
 * The phases a process moves through, for RBA's caseworker stepper (#242).
 * Shown in the properties panel when the process itself is selected. Every
 * change is one `ronl.phases.update` command, so one undo step.
 */
const ProcessPhasesEditor: React.FC<ProcessPhasesEditorProps> = ({
  target,
  nodes,
  commandStack,
  view,
  schemeIntent,
  onSchemeIntent,
  note,
  readByRba = true,
}) => {
  const readPhases = (): Phase[] =>
    parseDeclaredPhases(
      target.moddleElement.get('ronl:phases'),
      target.moddleElement.get('ronl:phaseLabel')
    ).set?.phases ?? [];
  const readLabel = (): string =>
    target.moddleElement.get('ronl:phaseLabel') ?? DEFAULT_PHASE_LABEL;

  const [phases, setPhases] = useState<Phase[]>(readPhases);
  const [codeDrafts, setCodeDrafts] = useState<string[]>(() => readPhases().map((p) => p.code));
  const [label, setLabel] = useState<string>(readLabel);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);

  // A change elsewhere (undo, the canvas) refreshes the view; re-read then.
  useEffect(() => {
    const next = readPhases();
    setPhases(next);
    setCodeDrafts(next.map((p) => p.code));
    setLabel(readLabel());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.moddleElement, view]);

  const scheme: Scheme | 'none' = schemeIntent ?? view.scheme;

  const processUpdate = (properties: Record<string, string | undefined>): ModdleUpdate => ({
    element: target.element,
    moddleElement: target.moddleElement,
    properties,
  });

  const writePhases = (next: Phase[], extra: ModdleUpdate[] = []) => {
    setPhases(next);
    setCodeDrafts(next.map((p) => p.code));
    applyPhaseUpdates(commandStack, [
      processUpdate({ 'ronl:phases': next.length > 0 ? serializePhases(next) : undefined }),
      ...extra,
    ]);
  };

  const chooseScheme = (next: Scheme | 'none') => {
    if (next === scheme) return;
    const updates: ModdleUpdate[] = [];
    if (scheme === 'declared') {
      // To None the phase list and label go and the markers stay (the deploy
      // checks report them). To Awb the markers go too: RBA would read the
      // Awb markers and these would only be noise.
      const markers = next === 'awb' ? planClearCodes(nodes, 'ronl:phase', 'all') : [];
      const question =
        next === 'awb'
          ? 'Switching removes this process\'s own phases and every "start of phase" marker that uses them. Continue?'
          : "Switching removes this process's own phases. Nodes keep their markers until you remove them. Continue?";
      if ((phases.length > 0 || markers.length > 0) && !window.confirm(question)) return;
      if (phases.length > 0 || target.moddleElement.get('ronl:phaseLabel') !== undefined) {
        updates.push(processUpdate({ 'ronl:phases': undefined, 'ronl:phaseLabel': undefined }));
      }
      updates.push(...markers);
    }
    if (scheme === 'awb') {
      const markers = planClearCodes(nodes, 'ronl:awbPhase', 'all');
      if (
        markers.length > 0 &&
        !window.confirm(
          'Switching removes every Awb "start of phase" marker in this process. Continue?'
        )
      ) {
        return;
      }
      updates.push(...markers);
    }
    applyPhaseUpdates(commandStack, updates);
    onSchemeIntent(next);
  };

  const addPhase = () => {
    const name = cleanPhaseName(newName);
    if (name === '') return;
    const code = codeFromName(
      name,
      phases.map((p) => p.code)
    );
    setNewName('');
    writePhases([...phases, { code, name }]);
  };

  const commitCode = (index: number) => {
    const draft = codeDrafts[index];
    const old = phases[index].code;
    if (draft === old) return;
    if (!isValidPhaseCode(draft)) {
      setError('A code may not be empty or contain ":" or ";".');
      return;
    }
    if (phases.some((p, i) => i !== index && p.code === draft)) {
      setError(`Code "${draft}" is already used by another phase.`);
      return;
    }
    setError(null);
    const next = phases.map((p, i) => (i === index ? { ...p, code: draft } : p));
    writePhases(next, planRenameCode(nodes, old, draft));
  };

  const commitName = (index: number, value: string) => {
    const name = cleanPhaseName(value);
    if (name === '' || name === phases[index].name) return;
    writePhases(phases.map((p, i) => (i === index ? { ...p, name } : p)));
  };

  const move = (index: number, delta: number) => {
    const next = [...phases];
    const [moved] = next.splice(index, 1);
    next.splice(index + delta, 0, moved);
    writePhases(next);
  };

  const remove = (index: number) => {
    const phase = phases[index];
    if (!window.confirm(`Remove phase "${phase.name}"? Nodes that start it lose their marker.`)) {
      return;
    }
    writePhases(
      phases.filter((_, i) => i !== index),
      planClearCodes(nodes, 'ronl:phase', new Set([phase.code]))
    );
  };

  const commitLabel = () => {
    const value = label.trim();
    applyPhaseUpdates(commandStack, [
      processUpdate({
        'ronl:phaseLabel': value === '' || value === DEFAULT_PHASE_LABEL ? undefined : value,
      }),
    ]);
  };

  if (!readByRba) {
    return (
      <div className="p-3 bg-white border-t border-slate-200">
        <div className="text-xs font-medium text-slate-700 mb-2">Phases (RBA stepper)</div>
        <div className="text-xs text-slate-500">
          RBA reads only the first process of this collaboration, so this pool has no stepper. Set
          phases on the first pool.
        </div>
      </div>
    );
  }

  const radio = (value: Scheme | 'none', text: string) => (
    <label className="flex items-center gap-2 text-xs text-slate-700">
      <input
        type="radio"
        name="phase-scheme"
        checked={scheme === value}
        onChange={() => chooseScheme(value)}
      />
      {text}
    </label>
  );

  return (
    <div className="p-3 bg-white border-t border-slate-200">
      <div className="text-xs font-medium text-slate-700 mb-2">Phases (RBA stepper)</div>
      {note && <div className="text-[11px] text-slate-500 mb-2">{note}</div>}
      <div className="space-y-1 mb-3">
        {radio('none', 'None')}
        {radio('declared', 'Own phases')}
        {radio('awb', 'Awb phases')}
      </div>

      {scheme === 'awb' && (
        <ul className="text-xs text-slate-600 space-y-0.5">
          {AWB_PHASES.map((p) => (
            <li key={p.code}>{`${p.code} · ${p.name}`}</li>
          ))}
        </ul>
      )}

      {scheme === 'declared' && (
        <div className="space-y-2">
          {phases.map((p, i) => (
            <div key={`${p.code}-${i}`} className="flex items-center gap-1">
              <span className="w-5 text-[11px] text-slate-400">{i + 1}</span>
              <input
                // Keyed by the name: a name changed outside this field (an
                // undo, a reload) replaces the field instead of leaving it stale.
                key={p.name}
                className="flex-1 min-w-0 px-2 py-1 border border-slate-300 rounded text-xs"
                defaultValue={p.name}
                aria-label={`Name of phase ${i + 1}`}
                onBlur={(e) => commitName(i, e.target.value)}
              />
              <input
                className="w-24 px-2 py-1 border border-slate-300 rounded text-xs font-mono"
                value={codeDrafts[i] ?? ''}
                aria-label={`Code of phase ${i + 1}`}
                onChange={(e) =>
                  setCodeDrafts(codeDrafts.map((c, j) => (j === i ? e.target.value : c)))
                }
                onBlur={() => commitCode(i)}
              />
              <button
                type="button"
                aria-label="Move up"
                disabled={i === 0}
                onClick={() => move(i, -1)}
                className="p-1 disabled:opacity-30"
              >
                <ArrowUp size={12} />
              </button>
              <button
                type="button"
                aria-label="Move down"
                disabled={i === phases.length - 1}
                onClick={() => move(i, 1)}
                className="p-1 disabled:opacity-30"
              >
                <ArrowDown size={12} />
              </button>
              <button
                type="button"
                aria-label="Remove"
                onClick={() => remove(i)}
                className="p-1 text-slate-400 hover:text-red-600"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
          {error && <div className="text-[11px] text-red-600">{error}</div>}
          <div className="flex items-center gap-1">
            <input
              className="flex-1 px-2 py-1 border border-slate-300 rounded text-xs"
              placeholder="New phase name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addPhase()}
            />
            <button
              type="button"
              onClick={addPhase}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-slate-100 rounded hover:bg-slate-200"
            >
              <Plus size={12} /> Add phase
            </button>
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-700">
            Label
            <input
              className="w-24 px-2 py-1 border border-slate-300 rounded text-xs"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onBlur={commitLabel}
            />
          </label>
        </div>
      )}
    </div>
  );
};

export default ProcessPhasesEditor;
