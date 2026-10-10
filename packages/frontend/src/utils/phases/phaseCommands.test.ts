import { describe, expect, test, vi } from 'vitest';

import {
  applyPhaseUpdates,
  firstProcess,
  isCountedNode,
  markerTargets,
  PHASE_COMMAND,
  planClearCodes,
  planRenameCode,
  processOf,
  registerPhaseCommand,
  resolveProcessTarget,
} from './phaseCommands';

const bo = (attrs: Record<string, string | undefined>, extra: Record<string, unknown> = {}) => ({
  get: (k: string) => attrs[k],
  ...extra,
});
const node = (
  id: string,
  type: string,
  attrs: Record<string, string | undefined> = {},
  parentType = 'bpmn:Process'
) => ({
  id,
  type,
  parent: { type: parentType },
  businessObject: bo(attrs),
});
const registry = (elements: unknown[]) => ({
  filter: (fn: (e: unknown) => boolean) => elements.filter(fn),
});

describe('registerPhaseCommand / applyPhaseUpdates', () => {
  test('one command carries every update, applied as nested moddle updates', () => {
    type Handler = {
      preExecute: (ctx: unknown) => void;
      execute: () => unknown;
      revert: () => unknown;
    };
    let handler: Handler | undefined;
    const commandStack = {
      registerHandler: vi.fn((name: string, HandlerClass: new () => Handler) => {
        expect(name).toBe(PHASE_COMMAND);
        handler = new HandlerClass();
      }),
      execute: vi.fn((_name: string, ctx: unknown) => handler!.preExecute(ctx)),
    };
    const modeling = { updateModdleProperties: vi.fn() };
    registerPhaseCommand(commandStack, modeling);

    const a = node('A', 'bpmn:UserTask');
    const b = node('B', 'bpmn:UserTask');
    applyPhaseUpdates(commandStack, [
      { element: a, moddleElement: a.businessObject, properties: { 'ronl:phase': 'x' } },
      { element: b, moddleElement: b.businessObject, properties: { 'ronl:phase': undefined } },
    ]);

    expect(commandStack.execute).toHaveBeenCalledTimes(1);
    expect(modeling.updateModdleProperties).toHaveBeenCalledTimes(2);
    expect(modeling.updateModdleProperties).toHaveBeenCalledWith(a, a.businessObject, {
      'ronl:phase': 'x',
    });
    // The handler itself changes nothing; undo reverts the nested commands.
    expect(handler!.execute()).toEqual([]);
    expect(handler!.revert()).toEqual([]);
  });

  test('registering twice registers once', () => {
    const commandStack = { registerHandler: vi.fn(), execute: vi.fn() };
    registerPhaseCommand(commandStack, {});
    registerPhaseCommand(commandStack, {});
    expect(commandStack.registerHandler).toHaveBeenCalledTimes(1);
  });

  test('no updates, no command', () => {
    const commandStack = { execute: vi.fn() };
    applyPhaseUpdates(commandStack, []);
    expect(commandStack.execute).not.toHaveBeenCalled();
  });
});

describe('resolveProcessTarget', () => {
  const processBo = bo({});
  const processRoot = { id: 'P', type: 'bpmn:Process', businessObject: processBo };

  test('the root process when nothing is selected', () => {
    expect(resolveProcessTarget(null, processRoot, registry([]))).toEqual({
      element: processRoot,
      moddleElement: processBo,
    });
  });

  test('a selected participant edits its own process', () => {
    const procA = bo({});
    const participant = {
      id: 'Part',
      type: 'bpmn:Participant',
      businessObject: bo({}, { processRef: procA }),
    };
    expect(
      resolveProcessTarget(participant, { type: 'bpmn:Collaboration' }, registry([participant]))
    ).toEqual({ element: participant, moddleElement: procA });
  });

  // Review focus 3: with nothing selected in a collaboration, the FIRST
  // participant's process is the one RBA reads.
  test('nothing selected in a collaboration: the first participant with a process', () => {
    const empty = { id: 'Pool0', type: 'bpmn:Participant', businessObject: bo({}, {}) };
    const procA = bo({});
    const first = {
      id: 'Pool1',
      type: 'bpmn:Participant',
      businessObject: bo({}, { processRef: procA }),
    };
    const second = {
      id: 'Pool2',
      type: 'bpmn:Participant',
      businessObject: bo({}, { processRef: bo({}) }),
    };
    expect(
      resolveProcessTarget(null, { type: 'bpmn:Collaboration' }, registry([empty, first, second]))
    ).toEqual({ element: first, moddleElement: procA });
  });

  test('a flow node is not a process target', () => {
    expect(resolveProcessTarget(node('T', 'bpmn:UserTask'), processRoot, registry([]))).toBeNull();
  });
});

describe('counted nodes', () => {
  test('a counted kind directly in the process, a participant or a lane counts', () => {
    expect(isCountedNode(node('T', 'bpmn:UserTask'))).toBe(true);
    expect(isCountedNode(node('G', 'bpmn:ExclusiveGateway', {}, 'bpmn:Participant'))).toBe(true);
    expect(isCountedNode(node('G', 'bpmn:ExclusiveGateway', {}, 'bpmn:Lane'))).toBe(true);
  });

  // Review focus 4: RBA never counts what sits inside an embedded subprocess.
  test('a node inside an embedded subprocess, a boundary event and a flow do not count', () => {
    expect(isCountedNode(node('Inner', 'bpmn:UserTask', {}, 'bpmn:SubProcess'))).toBe(false);
    expect(isCountedNode(node('B', 'bpmn:BoundaryEvent'))).toBe(false);
    expect(isCountedNode(node('F', 'bpmn:SequenceFlow'))).toBe(false);
  });

  test('markerTargets lists the counted nodes', () => {
    const t = node('T', 'bpmn:UserTask');
    const inner = node('Inner', 'bpmn:UserTask', {}, 'bpmn:SubProcess');
    expect(markerTargets(registry([t, inner]))).toEqual([t]);
  });
});

describe('planners', () => {
  const nodes = [
    node('A', 'bpmn:UserTask', { 'ronl:phase': 'old' }),
    node('B', 'bpmn:UserTask', { 'ronl:phase': 'keep' }),
    node('C', 'bpmn:UserTask', { 'ronl:awbPhase': '3' }),
  ];

  test('planRenameCode rewrites only the markers using the old code', () => {
    expect(planRenameCode(nodes, 'old', 'new')).toEqual([
      {
        element: nodes[0],
        moddleElement: nodes[0].businessObject,
        properties: { 'ronl:phase': 'new' },
      },
    ]);
  });

  test('planClearCodes clears the named codes, or every marker of an attribute', () => {
    expect(planClearCodes(nodes, 'ronl:phase', new Set(['keep']))).toEqual([
      {
        element: nodes[1],
        moddleElement: nodes[1].businessObject,
        properties: { 'ronl:phase': undefined },
      },
    ]);
    expect(planClearCodes(nodes, 'ronl:awbPhase', 'all')).toEqual([
      {
        element: nodes[2],
        moddleElement: nodes[2].businessObject,
        properties: { 'ronl:awbPhase': undefined },
      },
    ]);
  });
});

describe('one process per collaboration (RBA reads only the first)', () => {
  const procA = bo({});
  const procB = bo({});
  const definitions = { rootElements: [{ $type: 'bpmn:Collaboration' }, procA, procB] };
  Object.assign(procA, { $type: 'bpmn:Process' });
  Object.assign(procB, { $type: 'bpmn:Process' });
  const collaboration = { type: 'bpmn:Collaboration', businessObject: { $parent: definitions } };
  const poolA = {
    id: 'PoolA',
    type: 'bpmn:Participant',
    businessObject: bo({}, { processRef: procA }),
  };
  const poolB = {
    id: 'PoolB',
    type: 'bpmn:Participant',
    businessObject: bo({}, { processRef: procB }),
  };
  const inA = { ...node('A1', 'bpmn:UserTask', { 'ronl:phase': 'x' }), parent: poolA };
  const inB = { ...node('B1', 'bpmn:UserTask', { 'ronl:phase': 'x' }), parent: poolB };

  test('firstProcess is the first process in the definitions, not the first pool drawn', () => {
    expect(firstProcess(collaboration)).toBe(procA);
    const root = { type: 'bpmn:Process', businessObject: { $parent: { rootElements: [procB] } } };
    expect(firstProcess(root)).toBe(procB);
    expect(firstProcess(undefined)).toBeUndefined();
  });

  test('processOf names the process a node belongs to', () => {
    expect(processOf(inA)).toBe(procA);
    expect(processOf(inB)).toBe(procB);
    const laneNode = {
      ...node('L1', 'bpmn:UserTask'),
      parent: { type: 'bpmn:Lane', parent: poolB },
    };
    expect(processOf(laneNode)).toBe(procB);
    expect(processOf(node('Inner', 'bpmn:UserTask', {}, 'bpmn:SubProcess'))).toBeUndefined();
  });

  test('markerTargets lists only the nodes of the given process', () => {
    expect(markerTargets(registry([inA, inB]), procA)).toEqual([inA]);
  });

  test('nothing selected: the pool whose process RBA reads, wherever it is drawn', () => {
    expect(resolveProcessTarget(null, collaboration, registry([poolB, poolA]))).toEqual({
      element: poolA,
      moddleElement: procA,
    });
  });
});
