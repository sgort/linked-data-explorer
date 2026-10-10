/**
 * RBA's phase inheritance, ported line for line from
 * ronl-business-api packages/backend/src/rip-swimlane/bpmn-swimlane.ts
 * (findBackEdges, assignColumns, assignPhases). If the two ever disagree, RBA
 * is right: the stepper shows what RBA computes, and the canvas must match it.
 */
import { graphFromXml, PhaseFlow, PhaseGraph, PhaseNode } from './phaseGraph';
import { AWB_PHASE_SET, parseDeclaredPhases, PhaseSet, Scheme } from './phaseSet';

export interface PhaseAssignment {
  code: string;
  /** False where the node carries the marker itself. */
  inherited: boolean;
}

export interface UnknownMarker {
  id: string;
  code: string;
}

export interface PhaseView {
  /** declared: ronl:phases yields a set; awb: none, but an ronl:awbPhase marker exists; none otherwise. */
  scheme: Scheme | 'none';
  set?: PhaseSet;
  /** Empty when RBA would show no stepper (no valid marker). */
  byNode: Map<string, PhaseAssignment>;
  /** Markers RBA ignores: a code not in the active set, or a ronl:phase without declared phases. */
  unknownMarkers: UnknownMarker[];
  skippedEntries: string[];
}

export const EMPTY_PHASE_VIEW: PhaseView = {
  scheme: 'none',
  byNode: new Map(),
  unknownMarkers: [],
  skippedEntries: [],
};

/** RBA findBackEdges: iterative DFS in each node's declared outgoing order. */
export function findBackEdges(
  nodes: PhaseNode[],
  flows: PhaseFlow[],
  seeds: string[],
  order: Map<string, string[]>
): Set<string> {
  const byId = new Map<string, PhaseFlow>();
  const grouped = new Map<string, PhaseFlow[]>();
  for (const f of flows) {
    byId.set(f.id, f);
    grouped.set(f.from, [...(grouped.get(f.from) ?? []), f]);
  }
  const outgoing = new Map<string, PhaseFlow[]>();
  for (const [from, group] of grouped) {
    const seen = new Set<string>();
    const ordered: PhaseFlow[] = [];
    for (const flowId of order.get(from) ?? []) {
      const f = byId.get(flowId);
      if (f && f.from === from && !seen.has(flowId)) {
        ordered.push(f);
        seen.add(flowId);
      }
    }
    for (const f of group) {
      if (!seen.has(f.id)) {
        ordered.push(f);
        seen.add(f.id);
      }
    }
    outgoing.set(from, ordered);
  }

  const back = new Set<string>();
  const state = new Map<string, 'white' | 'grey' | 'black'>();
  for (const n of nodes) state.set(n.id, 'white');
  const visit = (root: string) => {
    const stack: Array<{ id: string; next: number }> = [{ id: root, next: 0 }];
    state.set(root, 'grey');
    while (stack.length) {
      const frame = stack[stack.length - 1];
      const edges = outgoing.get(frame.id) ?? [];
      if (frame.next >= edges.length) {
        state.set(frame.id, 'black');
        stack.pop();
        continue;
      }
      const f = edges[frame.next++];
      const s = state.get(f.to);
      if (s === 'grey') back.add(f.id);
      else if (s === 'white') {
        state.set(f.to, 'grey');
        stack.push({ id: f.to, next: 0 });
      }
    }
  };
  for (const seed of seeds) if (state.get(seed) === 'white') visit(seed);
  for (const n of nodes) if (state.get(n.id) === 'white') visit(n.id);
  return back;
}

/** RBA assignColumns: longest path over forward edges; every node starts at 0. */
function assignColumns(
  nodes: PhaseNode[],
  forward: PhaseFlow[],
  seeds: string[]
): Map<string, number> {
  const col = new Map<string, number>(nodes.map((n) => [n.id, 0]));
  if (seeds.length === 0) return col;
  let changed = true;
  let passes = 0;
  while (changed && passes < nodes.length + 1) {
    changed = false;
    passes += 1;
    for (const f of forward) {
      const from = col.get(f.from);
      const to = col.get(f.to);
      if (from === undefined || to === undefined) continue;
      if (to < from + 1) {
        col.set(f.to, from + 1);
        changed = true;
      }
    }
  }
  return col;
}

export function computePhaseView(graph: PhaseGraph): PhaseView {
  const parsed = parseDeclaredPhases(graph.phases, graph.phaseLabel);
  const hasAwbMarker = graph.nodes.some((n) => n.awbPhase !== undefined);
  const scheme: PhaseView['scheme'] = parsed.set ? 'declared' : hasAwbMarker ? 'awb' : 'none';
  const set = parsed.set ?? (scheme === 'awb' ? AWB_PHASE_SET : undefined);
  const base = { scheme, ...(set ? { set } : {}), skippedEntries: parsed.skipped };
  if (!set) {
    // No scheme: leftover ronl:phase markers (e.g. after switching a process
    // to "None") name phases the process no longer has. RBA ignores them.
    const leftovers = graph.nodes
      .filter((n): n is PhaseNode & { phase: string } => n.phase !== undefined)
      .map((n) => ({ id: n.id, code: n.phase }));
    return { ...base, byNode: new Map(), unknownMarkers: leftovers };
  }

  const markerOf = (n: PhaseNode) => (scheme === 'declared' ? n.phase : n.awbPhase);
  const explicit = new Map<string, string>();
  const unknownMarkers: UnknownMarker[] = [];
  for (const n of graph.nodes) {
    // ronl:phase markers in an Awb process name a phase the process does not
    // have; RBA ignores them, so they are reported like any unknown code.
    if (scheme === 'awb' && n.phase !== undefined) unknownMarkers.push({ id: n.id, code: n.phase });
    const marker = markerOf(n);
    if (marker === undefined) continue;
    if (set.phases.some((p) => p.code === marker)) explicit.set(n.id, marker);
    else unknownMarkers.push({ id: n.id, code: marker });
  }
  const byNode = new Map<string, PhaseAssignment>();
  if (explicit.size === 0) return { ...base, byNode, unknownMarkers };

  const starts = graph.nodes.filter((n) => n.kind === 'startEvent').map((n) => n.id);
  const seeds = starts.length > 0 ? starts : graph.nodes.slice(0, 1).map((n) => n.id);
  const backIds = findBackEdges(graph.nodes, graph.flows, seeds, graph.outgoingOrder);
  const forward = graph.flows.filter((f) => !backIds.has(f.id));
  const col = assignColumns(graph.nodes, forward, seeds);

  const order = (code: string) => set.phases.findIndex((p) => p.code === code);
  const preds = new Map<string, string[]>();
  for (const f of forward) preds.set(f.to, [...(preds.get(f.to) ?? []), f.from]);
  for (const n of [...graph.nodes].sort((a, b) => (col.get(a.id) ?? 0) - (col.get(b.id) ?? 0))) {
    const own = explicit.get(n.id);
    if (own) {
      byNode.set(n.id, { code: own, inherited: false });
      continue;
    }
    let latest: string | undefined;
    for (const p of preds.get(n.id) ?? []) {
      const phase = byNode.get(p)?.code;
      if (phase && (latest === undefined || order(phase) > order(latest))) latest = phase;
    }
    if (latest) byNode.set(n.id, { code: latest, inherited: true });
  }
  return { ...base, byNode, unknownMarkers };
}

export const phaseViewFromXml = (xml: string): PhaseView => computePhaseView(graphFromXml(xml));
