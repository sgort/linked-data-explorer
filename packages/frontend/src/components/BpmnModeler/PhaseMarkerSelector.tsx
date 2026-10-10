/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';

import { PhaseView } from '../../utils/phases/assignPhases';
import { applyPhaseUpdates, isCountedNode } from '../../utils/phases/phaseCommands';
import { AWB_PHASE_SET, phaseCodeLabel, PhaseSet, Scheme } from '../../utils/phases/phaseSet';

interface PhaseMarkerSelectorProps {
  element: any;
  commandStack: any;
  view: PhaseView;
  schemeIntent?: Scheme | 'none';
}

/**
 * Which phase a node starts, for RBA's caseworker stepper (#242). Mirrors
 * DocumentTemplateSelector: rendered into the properties panel below the
 * other selectors. "(erft over)" removes the marker, so the node inherits.
 */
const PhaseMarkerSelector: React.FC<PhaseMarkerSelectorProps> = ({
  element,
  commandStack,
  view,
  schemeIntent,
}) => {
  const scheme = schemeIntent ?? view.scheme;
  const set: PhaseSet | undefined =
    scheme === 'declared' ? view.set : scheme === 'awb' ? AWB_PHASE_SET : undefined;

  const box = (children: React.ReactNode) => (
    <div className="p-3 bg-white border-t border-slate-200">
      <label className="block text-xs font-medium text-slate-700 mb-2">Start van fase</label>
      {children}
    </div>
  );

  if (!isCountedNode(element)) {
    return box(
      <div className="text-xs text-slate-500">
        Dit element telt niet mee voor de fasen: RBA telt alleen elementen direct in het proces.
      </div>
    );
  }
  if (!set) {
    return box(<div className="text-xs text-slate-500">Stel eerst fasen in op het proces</div>);
  }

  const attr = scheme === 'declared' ? 'ronl:phase' : 'ronl:awbPhase';
  const current = (element.businessObject.get(attr) as string | undefined) ?? '';
  const assignment = view.byNode.get(element.id);

  const status = (() => {
    if (current !== '') return null;
    if (!assignment) return 'Geen fase: ligt vóór de eerste fasemarkering';
    const phase = set.phases.find((p) => p.code === assignment.code);
    const label = phaseCodeLabel(set, assignment.code);
    // Declared labels read mid-sentence ("Erft fase 2 …"); Awb labels are names ("Erft Archiefwet …").
    const ref = scheme === 'declared' ? label.charAt(0).toLowerCase() + label.slice(1) : label;
    return `Erft ${ref} (${phase?.name ?? assignment.code}) over`;
  })();

  const choose = (code: string) =>
    applyPhaseUpdates(commandStack, [
      {
        element,
        moddleElement: element.businessObject,
        properties: { [attr]: code === '' ? undefined : code },
      },
    ]);

  return box(
    <>
      <select
        value={current}
        onChange={(e) => choose(e.target.value)}
        className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm bg-white"
      >
        <option value="">(erft over)</option>
        {set.phases.map((p) => (
          <option key={p.code} value={p.code}>
            {`${phaseCodeLabel(set, p.code)} · ${p.name}`}
          </option>
        ))}
      </select>
      {status && <div className="mt-2 text-xs text-slate-500">{status}</div>}
    </>
  );
};

export default PhaseMarkerSelector;
