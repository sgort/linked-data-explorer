/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Writing phases through bpmn-js (#242).
 *
 * Every phase edit goes through ONE command, `ronl.phases.update`, whose
 * handler applies its updates as nested `updateModdleProperties` commands in
 * preExecute. diagram-js records nested commands under the outer one, so a
 * rename that touches eight markers is still a single undo step.
 *
 * `updateModdleProperties` (rather than `updateProperties`) because the
 * phase list lives on the PROCESS, while the element the user selects in a
 * collaboration is its PARTICIPANT.
 */

export type PhaseAttr = 'ronl:phase' | 'ronl:awbPhase';

export interface ModdleUpdate {
  element: any;
  moddleElement: any;
  properties: Record<string, string | undefined>;
}

export interface ProcessTarget {
  element: any;
  moddleElement: any;
}

export const PHASE_COMMAND = 'ronl.phases.update';

const registered = new WeakSet<object>();

export function registerPhaseCommand(commandStack: any, modeling: any): void {
  if (registered.has(commandStack)) return;
  registered.add(commandStack);
  class PhaseUpdateHandler {
    preExecute(context: { updates: ModdleUpdate[] }) {
      for (const u of context.updates) {
        modeling.updateModdleProperties(u.element, u.moddleElement, u.properties);
      }
    }
    execute() {
      return [];
    }
    revert() {
      return [];
    }
  }
  commandStack.registerHandler(PHASE_COMMAND, PhaseUpdateHandler);
}

export function applyPhaseUpdates(commandStack: any, updates: ModdleUpdate[]): void {
  if (updates.length === 0) return;
  commandStack.execute(PHASE_COMMAND, { updates });
}

/**
 * The process whose phases the process editor edits: the root process, the
 * selected participant's process, or, with nothing selected in a
 * collaboration, the first participant that has a process (the one RBA reads).
 */
export function resolveProcessTarget(
  selected: any | null,
  rootElement: any,
  elementRegistry: any
): ProcessTarget | null {
  if (selected && selected.type === 'bpmn:Participant') {
    const processRef = selected.businessObject.processRef;
    return processRef ? { element: selected, moddleElement: processRef } : null;
  }
  if (selected) return null;
  if (rootElement?.type === 'bpmn:Process') {
    return { element: rootElement, moddleElement: rootElement.businessObject };
  }
  const first = elementRegistry
    .filter((e: any) => e.type === 'bpmn:Participant')
    .find((p: any) => p.businessObject.processRef);
  return first ? { element: first, moddleElement: first.businessObject.processRef } : null;
}

/** bpmn-js types of RBA's counted kinds (see phaseGraph.ts COUNTED_KINDS). */
const COUNTED_TYPES = new Set([
  'bpmn:StartEvent',
  'bpmn:EndEvent',
  'bpmn:UserTask',
  'bpmn:ManualTask',
  'bpmn:ScriptTask',
  'bpmn:BusinessRuleTask',
  'bpmn:ReceiveTask',
  'bpmn:CallActivity',
  'bpmn:SubProcess',
  'bpmn:IntermediateCatchEvent',
  'bpmn:IntermediateThrowEvent',
  'bpmn:ServiceTask',
  'bpmn:SendTask',
  'bpmn:ExclusiveGateway',
  'bpmn:InclusiveGateway',
  'bpmn:EventBasedGateway',
  'bpmn:ParallelGateway',
]);

/**
 * Parents that keep a node a DIRECT child of the process in the XML. A lane
 * is not the XML parent of its nodes (lanes list flowNodeRefs), so it counts.
 */
const PROCESS_LEVEL_PARENTS = new Set(['bpmn:Process', 'bpmn:Participant', 'bpmn:Lane']);

export const isCountedNode = (element: any): boolean =>
  COUNTED_TYPES.has(element?.type) && PROCESS_LEVEL_PARENTS.has(element?.parent?.type);

export const markerTargets = (elementRegistry: any): any[] =>
  elementRegistry.filter((e: any) => isCountedNode(e));

export function planRenameCode(nodes: any[], from: string, to: string): ModdleUpdate[] {
  return nodes
    .filter((n) => n.businessObject.get('ronl:phase') === from)
    .map((n) => ({
      element: n,
      moddleElement: n.businessObject,
      properties: { 'ronl:phase': to },
    }));
}

export function planClearCodes(
  nodes: any[],
  attr: PhaseAttr,
  codes: ReadonlySet<string> | 'all'
): ModdleUpdate[] {
  return nodes
    .filter((n) => {
      const v = n.businessObject.get(attr);
      return v !== undefined && v !== '' && (codes === 'all' || codes.has(v));
    })
    .map((n) => ({
      element: n,
      moddleElement: n.businessObject,
      properties: { [attr]: undefined },
    }));
}
