// @vitest-environment jsdom
import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, test } from 'vitest';

import { phaseViewFromXml } from './assignPhases';
import { graphFromXml } from './phaseGraph';

const EXAMPLES = join(__dirname, '../../../public/examples/flevoland');

const proc = (attrs: string, body: string) => `<?xml version="1.0"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:ronl="http://ronl.nl/schema/1.0">
  <bpmn:process id="P" ${attrs}>${body}</bpmn:process>
</bpmn:definitions>`;

const phaseOf = (xml: string) =>
  Object.fromEntries(
    graphFromXml(xml).nodes.map((n) => [n.id, phaseViewFromXml(xml).byNode.get(n.id)?.code])
  );

describe('graphFromXml', () => {
  test('reads only counted node kinds that are direct children of the first process', () => {
    const g = graphFromXml(
      proc(
        '',
        `<bpmn:startEvent id="S"/>
         <bpmn:subProcess id="Sub"><bpmn:userTask id="Inner" ronl:phase="a"/></bpmn:subProcess>
         <bpmn:boundaryEvent id="B" attachedToRef="Sub" ronl:awbPhase="3"/>
         <bpmn:sequenceFlow id="F" sourceRef="S" targetRef="Sub"/>`
      )
    );
    expect(g.nodes.map((n) => n.id)).toEqual(['S', 'Sub']);
    expect(g.ignoredMarkers).toEqual([{ id: 'B', kind: 'boundaryEvent' }]);
    expect(g.flows).toEqual([{ id: 'F', from: 'S', to: 'Sub' }]);
  });

  test('reads markers by local name, with blank counting as absent', () => {
    const g = graphFromXml(
      `<?xml version="1.0"?><definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:x="http://ronl.nl/schema/1.0">
        <process id="P" x:phases="a:Alpha"><startEvent id="S" x:phase="a"/><userTask id="T" x:phase="  "/></process>
      </definitions>`
    );
    expect(g.phases).toBe('a:Alpha');
    expect(g.nodes).toEqual([
      { id: 'S', kind: 'startEvent', phase: 'a' },
      { id: 'T', kind: 'userTask' },
    ]);
  });

  test('keeps each node’s declared outgoing order', () => {
    const g = graphFromXml(
      proc(
        '',
        `<bpmn:exclusiveGateway id="G"><bpmn:outgoing>F2</bpmn:outgoing><bpmn:outgoing>F1</bpmn:outgoing></bpmn:exclusiveGateway>`
      )
    );
    expect(g.outgoingOrder.get('G')).toEqual(['F2', 'F1']);
  });

  test('yields an empty graph for a document without a process', () => {
    expect(graphFromXml('<definitions/>').nodes).toEqual([]);
  });
});

describe('computePhaseView — Awb (RBA cases)', () => {
  test('RBA: ignores a marker that is not a known Awb phase', () => {
    const xml = proc(
      '',
      `<bpmn:startEvent id="S" ronl:awbPhase="4 + 5"/>
       <bpmn:userTask id="T" ronl:awbPhase="9"/>
       <bpmn:userTask id="U" ronl:awbPhase=""/>
       <bpmn:sequenceFlow id="F" sourceRef="S" targetRef="T"/>
       <bpmn:sequenceFlow id="G" sourceRef="T" targetRef="U"/>`
    );
    expect(phaseOf(xml)).toEqual({ S: undefined, T: undefined, U: undefined });
    const view = phaseViewFromXml(xml);
    expect(view.scheme).toBe('awb');
    expect(view.unknownMarkers).toEqual([
      { id: 'S', code: '4 + 5' },
      { id: 'T', code: '9' },
    ]);
  });

  test('RBA: leaves an unmarked node without a marked predecessor unphased', () => {
    const xml = proc(
      '',
      `<bpmn:startEvent id="S"/>
       <bpmn:userTask id="T" ronl:awbPhase="2"/>
       <bpmn:sequenceFlow id="F" sourceRef="S" targetRef="T"/>`
    );
    expect(phaseOf(xml)).toEqual({ S: undefined, T: '2' });
  });

  test('RBA: takes the latest phase where branches join', () => {
    const xml = proc(
      '',
      `<bpmn:startEvent id="S" ronl:awbPhase="6"/>
       <bpmn:exclusiveGateway id="G" ronl:awbPhase="7"/>
       <bpmn:userTask id="J"/>
       <bpmn:sequenceFlow id="F1" sourceRef="S" targetRef="G"/>
       <bpmn:sequenceFlow id="F2" sourceRef="S" targetRef="J"/>
       <bpmn:sequenceFlow id="F3" sourceRef="G" targetRef="J"/>`
    );
    expect(phaseOf(xml).J).toBe('7');
    expect(phaseViewFromXml(xml).byNode.get('J')).toEqual({ code: '7', inherited: true });
  });

  test('RBA: does not let a rework loop pull an earlier node into a later phase', () => {
    const xml = proc(
      '',
      `<bpmn:startEvent id="S" ronl:awbPhase="1"><bpmn:outgoing>F1</bpmn:outgoing></bpmn:startEvent>
       <bpmn:userTask id="A"><bpmn:outgoing>F2</bpmn:outgoing></bpmn:userTask>
       <bpmn:userTask id="B" ronl:awbPhase="3"><bpmn:outgoing>F3</bpmn:outgoing></bpmn:userTask>
       <bpmn:exclusiveGateway id="G"><bpmn:outgoing>F4</bpmn:outgoing><bpmn:outgoing>F5</bpmn:outgoing></bpmn:exclusiveGateway>
       <bpmn:endEvent id="E"/>
       <bpmn:sequenceFlow id="F1" sourceRef="S" targetRef="A"/>
       <bpmn:sequenceFlow id="F2" sourceRef="A" targetRef="B"/>
       <bpmn:sequenceFlow id="F3" sourceRef="B" targetRef="G"/>
       <bpmn:sequenceFlow id="F4" sourceRef="G" targetRef="E"/>
       <bpmn:sequenceFlow id="F5" sourceRef="G" targetRef="A"/>`
    );
    expect(phaseOf(xml)).toEqual({ S: '1', A: '1', B: '3', G: '3', E: '3' });
  });

  test('no marker at all means no stepper: scheme none and nothing assigned', () => {
    const view = phaseViewFromXml(proc('', '<bpmn:startEvent id="S"/>'));
    expect(view.scheme).toBe('none');
    expect(view.byNode.size).toBe(0);
  });
});

describe('computePhaseView — declared (RBA cases)', () => {
  test('RBA: has no stepper when the process declares phases but marks no node', () => {
    const view = phaseViewFromXml(proc('ronl:phases="a:Alpha"', '<bpmn:startEvent id="S"/>'));
    expect(view.scheme).toBe('declared');
    expect(view.byNode.size).toBe(0);
  });

  test('RBA: ignores a ronl:phase code the process did not declare', () => {
    const xml = proc(
      'ronl:phases="a:Alpha"',
      `<bpmn:startEvent id="S" ronl:phase="a"/>
       <bpmn:userTask id="T" ronl:phase="zz"/>
       <bpmn:sequenceFlow id="F" sourceRef="S" targetRef="T"/>`
    );
    expect(phaseOf(xml)).toEqual({ S: 'a', T: 'a' });
    expect(phaseViewFromXml(xml).unknownMarkers).toEqual([{ id: 'T', code: 'zz' }]);
  });

  test('RBA: ignores ronl:awbPhase in a process that declares its own phases', () => {
    const xml = proc(
      'ronl:phases="a:Alpha;b:Beta"',
      `<bpmn:startEvent id="S" ronl:phase="a"/>
       <bpmn:userTask id="T" ronl:awbPhase="2"/>
       <bpmn:sequenceFlow id="F" sourceRef="S" targetRef="T"/>`
    );
    expect(phaseViewFromXml(xml).scheme).toBe('declared');
    expect(phaseOf(xml)).toEqual({ S: 'a', T: 'a' });
  });

  test('RBA: ignores ronl:phase in a process without declared phases, and reports it', () => {
    const view = phaseViewFromXml(proc('', '<bpmn:startEvent id="S" ronl:phase="1"/>'));
    expect(view.scheme).toBe('none');
    expect(view.byNode.size).toBe(0);
    expect(view.unknownMarkers).toEqual([{ id: 'S', code: '1' }]);
  });

  test('reports ronl:phase markers left in an Awb process', () => {
    const view = phaseViewFromXml(
      proc('', '<bpmn:startEvent id="S" ronl:awbPhase="1" ronl:phase="old"/>')
    );
    expect(view.scheme).toBe('awb');
    expect(view.unknownMarkers).toEqual([{ id: 'S', code: 'old' }]);
  });

  test('RBA: inherits declared phases the way Awb phases inherit: latest at a join', () => {
    const xml = proc(
      'ronl:phases="a:Alpha;b:Beta;c:Gamma"',
      `<bpmn:startEvent id="S" ronl:phase="a"/>
       <bpmn:exclusiveGateway id="G" ronl:phase="c"/>
       <bpmn:userTask id="J"/>
       <bpmn:sequenceFlow id="F1" sourceRef="S" targetRef="G"/>
       <bpmn:sequenceFlow id="F2" sourceRef="S" targetRef="J"/>
       <bpmn:sequenceFlow id="F3" sourceRef="G" targetRef="J"/>`
    );
    expect(phaseOf(xml).J).toBe('c');
  });

  // RBA builds its node list per element kind, in KINDS order, not in
  // document order; that order decides the DFS over unreachable nodes.
  test('RBA: a loop the start event never reaches is walked in KINDS order', () => {
    const xml = proc(
      'ronl:phases="a:Alpha;b:Beta"',
      `<bpmn:startEvent id="S" ronl:phase="a"/>
       <bpmn:serviceTask id="N1"/>
       <bpmn:userTask id="N2" ronl:phase="b"/>
       <bpmn:sequenceFlow id="F1" sourceRef="N1" targetRef="N2"/>
       <bpmn:sequenceFlow id="F2" sourceRef="N2" targetRef="N1"/>`
    );
    expect(phaseOf(xml)).toEqual({ S: 'a', N2: 'b', N1: 'b' });
  });

  test('reports the entries RBA skips', () => {
    const view = phaseViewFromXml(
      proc('ronl:phases="a:Alpha;b;a:Again"', '<bpmn:startEvent id="S" ronl:phase="a"/>')
    );
    expect(view.skippedEntries).toEqual(['b', 'a:Again']);
  });
});

describe('parity with RBA on the declared-phase examples', () => {
  test('HR capacity claim (RBA bpmn-swimlane.test.ts, declared/ManagementCapacityClaimProcess)', () => {
    const xml = readFileSync(
      join(EXAMPLES, 'HR-capacity/ManagementCapacityClaimProcess.bpmn'),
      'utf8'
    );
    expect(phaseOf(xml)).toEqual({
      StartEvent_CapacityClaim: 'intake',
      Task_ConsultAndClassify: 'intake',
      Gateway_RequestType: 'claim',
      Task_PrepareStaffingClaim: 'claim',
      Task_PrepareHiringClaim: 'claim',
      Gateway_MergePrepare: 'claim',
      Task_DetermineRouting: 'routering',
      Task_SubmitToBoardAgenda: 'agenda',
      Task_BoardDecision: 'besluit',
      Gateway_BoardDecision: 'besluit',
      Task_ReconsiderationMeeting: 'heroverweging',
      Gateway_ReconsiderationOutcome: 'heroverweging',
      EndEvent_Withdrawn: 'heroverweging',
      Task_ResetClaimFields: 'heroverweging',
      Gateway_DecisionRoute: 'overdracht',
      Task_HandoverToRecruitment: 'overdracht',
      Task_HandoverToProcurement: 'overdracht',
      Gateway_MergeHandover: 'reservering',
      Task_RegisterReservation: 'reservering',
      EndEvent_ClaimCompleted: 'reservering',
    });
  });

  test('Besluitvorming (RBA bpmn-swimlane.test.ts, declared/GedelegeerdBesluitProcess)', () => {
    const xml = readFileSync(
      join(EXAMPLES, 'besluitvorming-gedelegeerd/GedelegeerdBesluitProcess.bpmn'),
      'utf8'
    );
    expect(phaseOf(xml)).toEqual({
      StartEvent_Besluit: 'voorbereiding',
      Task_KiesSjabloon: 'voorbereiding',
      Task_VulSjabloonIn: 'voorbereiding',
      Task_AdviesToetsing: 'toetsing',
      Task_ControleerVoorwaarden: 'toetsing',
      Task_Beslisregels: 'toetsing',
      Gateway_VoorwaardenVervuld: 'toetsing',
      Gateway_Memorandum: 'toetsing',
      Task_Memorandum: 'memorandum',
      Task_AdviesAkkoord: 'memorandum',
      Gateway_Akkoord: 'memorandum',
      Task_DienIn: 'ondertekening',
      Task_Onderteken: 'ondertekening',
      Gateway_Ondertekend: 'ondertekening',
      Task_Escaleren: 'escalatie',
      Task_NeemBesluit: 'escalatie',
      Task_Registreer: 'registratie',
      Task_Archiveer: 'registratie',
      EndEvent_Besluit: 'registratie',
    });
  });

  test('every node of the Awb shell example is in an Awb phase (RBA: fully phased)', () => {
    const xml = readFileSync(join(EXAMPLES, 'AwbShellProcess.bpmn'), 'utf8');
    const unphased = Object.entries(phaseOf(xml)).filter(([, code]) => code === undefined);
    expect(unphased).toEqual([]);
  });
});
