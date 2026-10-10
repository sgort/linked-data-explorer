/**
 * Reads a BPMN document the way RBA's parseSwimlane reads it for phases
 * (ronl-business-api packages/backend/src/rip-swimlane/bpmn-swimlane.ts):
 * only the FIRST <process>, only its DIRECT children of the counted kinds,
 * attributes by local name (namespace prefix ignored), blank as absent.
 */

/** RBA's KINDS allowlist. boundaryEvent is not counted, nor anything nested in a subProcess. */
export const COUNTED_KINDS: ReadonlySet<string> = new Set([
  'startEvent',
  'endEvent',
  'userTask',
  'manualTask',
  'scriptTask',
  'businessRuleTask',
  'receiveTask',
  'callActivity',
  'subProcess',
  'intermediateCatchEvent',
  'intermediateThrowEvent',
  'serviceTask',
  'sendTask',
  'exclusiveGateway',
  'inclusiveGateway',
  'eventBasedGateway',
  'parallelGateway',
]);

export interface PhaseNode {
  id: string;
  kind: string;
  phase?: string;
  awbPhase?: string;
}

export interface PhaseFlow {
  id: string;
  from: string;
  to: string;
}

/** A phase marker on an element RBA does not count (e.g. a boundary event). */
export interface IgnoredMarker {
  id: string;
  kind: string;
}

export interface PhaseGraph {
  phases?: string;
  phaseLabel?: string;
  nodes: PhaseNode[];
  flows: PhaseFlow[];
  outgoingOrder: Map<string, string[]>;
  ignoredMarkers: IgnoredMarker[];
}

const emptyGraph = (): PhaseGraph => ({
  nodes: [],
  flows: [],
  outgoingOrder: new Map(),
  ignoredMarkers: [],
});

/** An attribute by local name, ignoring its namespace; blank counts as absent. */
function attr(el: Element, local: string): string | undefined {
  for (const a of Array.from(el.attributes)) {
    if (a.localName === local) {
      const v = a.value.trim();
      return v === '' ? undefined : v;
    }
  }
  return undefined;
}

const children = (el: Element): Element[] => Array.from(el.children);

export function graphFromXml(xml: string): PhaseGraph {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const root = doc.documentElement;
  if (!root || root.getElementsByTagName('parsererror').length > 0) return emptyGraph();
  const process = children(root).find((c) => c.localName === 'process');
  if (!process) return emptyGraph();

  const graph = emptyGraph();
  for (const el of children(process)) {
    const kind = el.localName;
    const id = el.getAttribute('id') ?? '';
    if (kind === 'sequenceFlow') {
      graph.flows.push({
        id,
        from: el.getAttribute('sourceRef') ?? '',
        to: el.getAttribute('targetRef') ?? '',
      });
      continue;
    }
    const phase = attr(el, 'phase');
    const awbPhase = attr(el, 'awbPhase');
    if (!COUNTED_KINDS.has(kind)) {
      if (phase !== undefined || awbPhase !== undefined) graph.ignoredMarkers.push({ id, kind });
      continue;
    }
    graph.nodes.push({
      id,
      kind,
      ...(phase !== undefined ? { phase } : {}),
      ...(awbPhase !== undefined ? { awbPhase } : {}),
    });
    const declared = children(el)
      .filter((c) => c.localName === 'outgoing')
      .map((c) => (c.textContent ?? '').trim());
    if (declared.length > 0) graph.outgoingOrder.set(id, declared);
  }

  // RBA builds its node list kind by kind, in KINDS order, and that order
  // decides the seed without a start event and the walk over nodes no start
  // event reaches. A stable sort keeps document order within each kind.
  const kindOrder = [...COUNTED_KINDS];
  graph.nodes.sort((a, b) => kindOrder.indexOf(a.kind) - kindOrder.indexOf(b.kind));

  const phases = attr(process, 'phases');
  const phaseLabel = attr(process, 'phaseLabel');
  return {
    ...graph,
    ...(phases !== undefined ? { phases } : {}),
    ...(phaseLabel !== undefined ? { phaseLabel } : {}),
  };
}
