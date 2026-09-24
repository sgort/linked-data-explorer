# Thuisbatterij swimlanes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the Thuisbatterij main process and its called decision subprocess into a pool with Aanvrager / Behandelaar / Systeem lanes, translate their English names to Dutch, and give "Aanvullende gegevens opvragen" a real deployable form.

**Architecture:** Two throwaway Node scripts in the session scratchpad do the XML work deterministically: `gen-lanes.mjs` transforms each public-examples BPMN in place (renames, form swap, collaboration, laneSet, a fully regenerated diagram from an explicit layout table), and `derive-e2e.mjs` produces the e2e-fixtures copies from the public ones by applying exactly the four sanctioned parity differences. A third script, `check-lanes.mjs`, is the structural test and runs red before and green after. Seeding, manifest and the companion e2e regex are small hand edits.

**Tech Stack:** BPMN 2.0 XML (Operaton / camunda namespace), form-js schemaVersion 19, Node 24 ESM scripts, libxmljs2 0.37 and bpmn-moddle 10.2 from the repo's `node_modules`, Jest (backend), Vitest (frontend), Playwright (ronl-business-api e2e).

**Spec:** `docs/superpowers/specs/2026-09-24-thuisbatterij-swimlanes-design.md`

## Global Constraints

- Branch `feat/thuisbatterij-swimlanes` in linked-data-explorer; companion branch `fix/thuisbatterij-dutch-task-names` off `acc` in ronl-business-api. Check `git branch --show-current` before every commit.
- **Ask the user before every `git commit`.** Stage, report what is staged, stop. No commit trailers or any attribution to Claude.
- Never `--no-verify`, `SKIP=`, `HUSKY=0`. A failing hook is reported, not bypassed.
- Never start, stop or restart the LDE backend (`:3001`), the frontend, or Operaton (`:8081`). Use them as they are.
- Deploy only through LDE: `POST http://localhost:3001/api/dmns/process/deploy`.
- Source of truth: `packages/frontend/public/examples/flevoland/`. `examples/organizations/flevoland/thuisbatterij/` is not touched.
- Element ids never change. Only `name` attributes listed in the rename table change.
- `bpmn:process` child order: `documentation`, `extensionElements`, `laneSet`, flow elements, artifacts (`textAnnotation`, `association`) last.
- Lanes top to bottom: `Lane_Aanvrager` "Aanvrager", `Lane_Behandelaar` "Behandelaar", `Lane_Systeem` "Systeem"; empty lanes omitted (the subprocess has no Aanvrager lane).
- `candidateGroups="caseworker"` everywhere it is today; no new roles.
- New form id and file stem: `thuisbatterij-aanvullende-gegevens`; Dutch text.
- Files are LF, UTF-8, no BOM.

## Review Focus

1. **The incomplete-application path is unreachable in a normal run.** `AwbCompletenessCheck` is hit policy FIRST on `productType`, and `Task_Phase1_Identity` always sets `productType="SubsidieThuisbatterijFlevoland"`, which matches a "complete" rule. The engine test (Task 5) therefore starts the instance *at* `Task_RequestMissingInfo` with `startInstructions`; report this finding to the user, do not "fix" the DMN or the script.
2. **A checkbox left unticked must still route.** `Gateway_StillIncomplete` tests `${supplementReceived == true}` / `== false`; if the form submitted no value the gateway would throw "no outgoing sequence flow". The form gives the checkbox `defaultValue: false`, and Task 5 completes the task with `supplementReceived=false` explicitly *and* checks the variable afterwards.
3. **Parity drift between public and e2e copies.** A hand edit to one copy fails `public-example-fixture-parity`. The e2e copies are only ever produced by `derive-e2e.mjs` from the public copies (Task 4), and the parity test is run in Task 4.
4. **Stale localStorage in the Modeler.** Without version bumps users keep the old, lane-less copy. Task 4 bumps both process seeds and adds the new form seed; the user's visual check (Task 6) confirms the Modeler shows lanes after reload.
5. **The deployed form must resolve inside its deployment.** `formRefBinding="deployment"` only works if the form is in the same deployment as the BPMN. Task 5 checks `GET /task/{id}/deployed-form` returns the new form's id.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `packages/frontend/public/examples/flevoland/ThuisbatterijSubsidieAanvraagProcess.bpmn` | modify (generated) | main process: pool, lanes, Dutch names, form swap, new diagram |
| `packages/frontend/public/examples/flevoland/ThuisbatterijSubsidieDecisionSubProcess.bpmn` | modify (generated) | subprocess: pool, lanes, Dutch names, new diagram |
| `packages/frontend/public/examples/flevoland/thuisbatterij-aanvullende-gegevens.form` | create | the missing-information form |
| `e2e-fixtures/flevoland/ThuisbatterijSubsidieAanvraagProcess.bpmn` | modify (derived) | e2e copy of main |
| `e2e-fixtures/flevoland/ThuisbatterijSubsidieDecisionSubProcessE2E.bpmn` | modify (derived) | e2e copy of subprocess |
| `e2e-fixtures/flevoland/thuisbatterij-aanvullende-gegevens.form` | create | e2e copy of the form (+ `"e2eFixture": true`) |
| `e2e-fixtures/manifest.json` | modify | list the new form under the Thuisbatterij main entry |
| `packages/frontend/src/utils/exampleVersions.ts` | modify | bump two process seeds, add form seed |
| `packages/frontend/src/components/FormEditor/FormEditor.tsx` | modify | seed entry for the new form |
| ronl-business-api `packages/frontend/e2e/thuisbatterij-journey.spec.ts` | modify | task-name regexes accept English and Dutch |
| scratchpad `check-lanes.mjs`, `moddle-check.mjs`, `gen-lanes.mjs`, `derive-e2e.mjs`, `deploy-body.mjs` | create, never committed | tooling |

Scratchpad directory, referred to as `$S` below:
`C:/Users/gorts01/AppData/Local/Temp/claude/C--Users-gorts01-Development-linked-data-explorer/7dae2657-2b2c-4e2b-bbb3-aa6cac480215/scratchpad`
Repo root, referred to as `$R`: `C:/Users/gorts01/Development/linked-data-explorer`.
Public examples, `$P` = `$R/packages/frontend/public/examples/flevoland`; fixtures, `$F` = `$R/e2e-fixtures/flevoland`.

---

### Task 1: Structural checks (the failing test)

**Files:**
- Create: `$S/check-lanes.mjs`
- Create: `$S/moddle-check.mjs`

**Interfaces:**
- Produces: `node $S/check-lanes.mjs <bpmn>...` → prints `OK <file>` per file, or `FAIL <file>` plus one line per problem; exit code 1 if any file fails. `node $S/moddle-check.mjs <bpmn>...` → prints `OK <file>` or the moddle warnings; exit 1 on any warning or error.

- [ ] **Step 1: Write `check-lanes.mjs`**

```js
// Structural lane check for a BPMN file. Not committed.
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire('C:/Users/gorts01/Development/linked-data-explorer/package.json');
const libxmljs = require('libxmljs2');
const NS = {
  bpmn: 'http://www.omg.org/spec/BPMN/20100524/MODEL',
  bpmndi: 'http://www.omg.org/spec/BPMN/20100524/DI',
  dc: 'http://www.omg.org/spec/DD/20100524/DC',
};
const NON_NODE = new Set([
  'documentation', 'extensionElements', 'laneSet', 'sequenceFlow',
  'textAnnotation', 'association', 'group',
]);
const RANK = (name) =>
  name === 'documentation' ? 0
  : name === 'extensionElements' ? 1
  : name === 'laneSet' ? 2
  : ['textAnnotation', 'association', 'group'].includes(name) ? 4
  : 3;

function bounds(doc, id) {
  const b = doc.get(`//bpmndi:BPMNShape[@bpmnElement="${id}"]/dc:Bounds`, NS);
  if (!b) return null;
  const n = (a) => Number(b.attr(a).value());
  return { x: n('x'), y: n('y'), w: n('width'), h: n('height') };
}
const inside = (a, b) =>
  a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h;

let failed = false;
for (const file of process.argv.slice(2)) {
  const errs = [];
  const doc = libxmljs.parseXml(fs.readFileSync(file, 'utf8'));
  const proc = doc.get('//bpmn:process', NS);
  const pid = proc.attr('id').value();

  let last = -1;
  for (const c of proc.childNodes()) {
    if (c.type() !== 'element') continue;
    const r = RANK(c.name());
    if (r < last) errs.push(`order: <${c.name()}> appears after a later-ranked element`);
    last = Math.max(last, r);
  }

  const collab = doc.get('//bpmn:collaboration', NS);
  if (!collab) errs.push('no bpmn:collaboration');
  const part = doc.get(`//bpmn:participant[@processRef="${pid}"]`, NS);
  if (!part) errs.push(`no participant with processRef="${pid}"`);
  const plane = doc.get('//bpmndi:BPMNPlane', NS);
  if (collab && plane.attr('bpmnElement').value() !== collab.attr('id').value())
    errs.push('BPMNPlane does not point at the collaboration');

  const nodes = proc.childNodes()
    .filter((c) => c.type() === 'element' && !NON_NODE.has(c.name()))
    .map((c) => c.attr('id').value());
  const lanes = doc.find('//bpmn:laneSet/bpmn:lane', NS);
  if (lanes.length === 0) errs.push('no lanes');
  const seen = new Map();
  const partB = part && bounds(doc, part.attr('id').value());
  if (part && !partB) errs.push('participant has no DI shape');
  for (const lane of lanes) {
    const lid = lane.attr('id').value();
    const refs = lane.find('bpmn:flowNodeRef', NS).map((r) => r.text());
    if (refs.length === 0) errs.push(`lane ${lid} is empty`);
    const lb = bounds(doc, lid);
    if (!lb) errs.push(`lane ${lid} has no DI shape`);
    else if (partB && !inside(lb, partB)) errs.push(`lane ${lid} outside the pool`);
    for (const ref of refs) {
      if (!nodes.includes(ref)) errs.push(`lane ${lid} references unknown ${ref}`);
      seen.set(ref, (seen.get(ref) ?? 0) + 1);
      const nb = bounds(doc, ref);
      if (!nb) errs.push(`${ref} has no DI shape`);
      else if (lb && !inside(nb, lb)) errs.push(`${ref} is drawn outside lane ${lid}`);
    }
  }
  for (const n of nodes) {
    const k = seen.get(n) ?? 0;
    if (k !== 1) errs.push(`${n} is in ${k} lanes (must be exactly 1)`);
  }
  for (const f of proc.find('bpmn:sequenceFlow', NS)) {
    const fid = f.attr('id').value();
    const e = doc.get(`//bpmndi:BPMNEdge[@bpmnElement="${fid}"]`, NS);
    if (!e || e.find('*[local-name()="waypoint"]').length < 2) errs.push(`${fid} has no edge`);
  }

  if (errs.length) {
    failed = true;
    console.log(`FAIL ${file}`);
    for (const e of errs) console.log(`  - ${e}`);
  } else console.log(`OK ${file}`);
}
process.exit(failed ? 1 : 0);
```

- [ ] **Step 2: Write `moddle-check.mjs`**

```js
// Round-trip import through bpmn-moddle; any warning fails. Not committed.
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const { default: BpmnModdle } = await import(
  pathToFileURL('C:/Users/gorts01/Development/linked-data-explorer/node_modules/bpmn-moddle/dist/index.js').href
);
let failed = false;
for (const file of process.argv.slice(2)) {
  const moddle = new BpmnModdle();
  try {
    const { warnings } = await moddle.fromXML(fs.readFileSync(file, 'utf8'));
    if (warnings.length) {
      failed = true;
      console.log(`FAIL ${file}`);
      for (const w of warnings) console.log(`  - ${w.message}`);
    } else console.log(`OK ${file}`);
  } catch (err) {
    failed = true;
    console.log(`FAIL ${file}: ${err.message}`);
  }
}
process.exit(failed ? 1 : 0);
```

- [ ] **Step 3: Run both against the current files**

```bash
cd $R
node $S/check-lanes.mjs $P/ThuisbatterijSubsidieAanvraagProcess.bpmn $P/ThuisbatterijSubsidieDecisionSubProcess.bpmn
node $S/moddle-check.mjs $P/ThuisbatterijSubsidieAanvraagProcess.bpmn $P/ThuisbatterijSubsidieDecisionSubProcess.bpmn
```

Expected: `check-lanes` prints `FAIL` for both files with `no bpmn:collaboration`, `no lanes`, and one "is in 0 lanes" line per node; exit 1. `moddle-check` prints `OK` for both (the current files are valid, just lane-less). If `moddle-check` already fails, stop and report: the baseline is not clean.

No commit: nothing in the repo changed.

---

### Task 2: Lane generator, main process

**Files:**
- Create: `$S/gen-lanes.mjs`
- Modify (generated): `$P/ThuisbatterijSubsidieAanvraagProcess.bpmn`

**Interfaces:**
- Consumes: `check-lanes.mjs`, `moddle-check.mjs` (Task 1).
- Produces: `node $S/gen-lanes.mjs <main|sub> <file>` rewrites `<file>` in place; refuses (exit 1) if the file already has a `laneSet`, if any flow node or sequence flow lacks a layout entry, or if any layout entry has no element.

- [ ] **Step 1: Write `gen-lanes.mjs`** (both layouts; Task 3 only runs it)

```js
// Adds pool + lanes + Dutch names + a regenerated diagram. Not committed.
import fs from 'node:fs';

const T = { w: 160, h: 80 }; // main task size
const TS = { w: 150, h: 80 }; // sub task size

const LAYOUTS = {
  main: {
    processId: 'ThuisbatterijSubsidieAanvraagProcess',
    collab: 'Collaboration_Thuisbatterij_Main',
    participant: 'Participant_Thuisbatterij_Main',
    laneSet: 'LaneSet_Thuisbatterij_Main',
    task: T,
    pool: { x: 100, y: 60, w: 2600, h: 720 },
    lanes: [
      { id: 'Lane_Aanvrager', name: 'Aanvrager', y: 60, h: 140 },
      { id: 'Lane_Behandelaar', name: 'Behandelaar', y: 200, h: 200 },
      { id: 'Lane_Systeem', name: 'Systeem', y: 400, h: 380 },
    ],
    // id: [lane, centerX, centerY]
    nodes: {
      StartEvent_AWB: ['Lane_Aanvrager', 190, 130],
      Task_Phase1_Identity: ['Lane_Systeem', 330, 580],
      Task_Phase2_Receipt: ['Lane_Systeem', 530, 580],
      Task_Phase3_Completeness: ['Lane_Systeem', 730, 580],
      Gateway_Complete: ['Lane_Systeem', 900, 580],
      Task_RequestMissingInfo: ['Lane_Behandelaar', 900, 300],
      Gateway_StillIncomplete: ['Lane_Behandelaar', 1080, 300],
      Task_Phase45_Process: ['Lane_Behandelaar', 1260, 300],
      Task_Phase6_Notify: ['Lane_Behandelaar', 1460, 300],
      Task_RefuseToProcess: ['Lane_Systeem', 1460, 700],
      Gateway_Payment: ['Lane_Systeem', 1640, 580],
      Task_Phase7_Payment: ['Lane_Systeem', 1800, 460],
      Gateway_Chain: ['Lane_Systeem', 1960, 580],
      Task_Phase8_Forward: ['Lane_Systeem', 2120, 700],
      Task_ArchivesDMN: ['Lane_Systeem', 2280, 580],
      Task_ArchiveRecord: ['Lane_Systeem', 2480, 580],
      EndEvent_AWB: ['Lane_Systeem', 2620, 580],
    },
    flows: {
      Flow_Start_Phase1: [[190, 148], [190, 580], [250, 580]],
      Flow_Phase1_Phase2: [[410, 580], [450, 580]],
      Flow_Phase2_Phase3: [[610, 580], [650, 580]],
      Flow_Phase3_Gateway: [[810, 580], [875, 580]],
      Flow_Complete_Yes: [[925, 580], [1260, 580], [1260, 340]],
      Flow_Complete_No: [[900, 555], [900, 340]],
      Flow_MissingInfo_Recheck: [[980, 300], [1055, 300]],
      Flow_Recheck_Process: [[1105, 300], [1180, 300]],
      Flow_Recheck_Refuse: [[1080, 325], [1080, 700], [1380, 700]],
      Flow_Refuse_Notify: [[1460, 660], [1460, 340]],
      Flow_Phase45_Phase6: [[1340, 300], [1380, 300]],
      Flow_Phase6_PaymentGateway: [[1540, 300], [1580, 300], [1580, 580], [1615, 580]],
      Flow_Payment_Yes: [[1640, 555], [1640, 460], [1720, 460]],
      Flow_Payment_No: [[1665, 580], [1935, 580]],
      Flow_PaymentTask_Chain: [[1880, 460], [1960, 460], [1960, 555]],
      Flow_Chain_Yes: [[1960, 605], [1960, 700], [2040, 700]],
      Flow_Chain_No: [[1985, 580], [2200, 580]],
      Flow_ChainTask_Archives: [[2200, 700], [2280, 700], [2280, 620]],
      Flow_ArchivesDMN_Record: [[2360, 580], [2400, 580]],
      Flow_Archive_End: [[2560, 580], [2602, 580]],
    },
    extraShapes: [{ id: 'TextAnnotation_1vi8fv8', x: 240, y: 80, w: 100, h: 30 }],
    extraEdges: [{ id: 'Association_0ya7r6h', points: [[205, 120], [240, 95]] }],
    renames: {
      ThuisbatterijSubsidieAanvraagProcess: 'Subsidie Thuisbatterij Flevoland - Hoofdproces',
      Task_Phase1_Identity: 'Fase 1: Rechtsbetrekking vaststellen (identificatie)',
      Task_Phase2_Receipt: 'Fase 2: Ontvangstbevestiging aanvraag (Awb 4:1)',
      Task_Phase3_Completeness: 'Fase 3: Ontvankelijkheidstoets (Awb 2:3)',
      Gateway_Complete: 'Aanvraag volledig?',
      Task_RequestMissingInfo: 'Aanvullende gegevens opvragen (Awb 4:5)',
      Gateway_StillIncomplete: 'Aanvulling ontvangen?',
      Task_RefuseToProcess: 'Aanvraag buiten behandeling stellen (Awb 4:5 lid 2)',
      Task_Phase45_Process: 'Fase 4+5: Beoordeling recht en hoogte subsidie',
      Task_Phase6_Notify: 'Fase 6: Aanvrager informeren over besluit (Awb 3:6)',
      Task_Phase7_Payment: 'Fase 7: Subsidiebedrag uitbetalen',
      Task_Phase8_Forward: 'Fase 8: Subsidiebesluit registreren in ketenproces',
      Task_ArchivesDMN: 'Archivering: bewaar- en vernietigingstermijn (Archiefwet)',
      Task_ArchiveRecord: 'Dossier archiveren',
      EndEvent_AWB: 'Dossier gesloten',
    },
    formSwap: true,
  },
  sub: {
    processId: 'ThuisbatterijSubsidieDecisionSubProcess',
    collab: 'Collaboration_Thuisbatterij_Sub',
    participant: 'Participant_Thuisbatterij_Sub',
    laneSet: 'LaneSet_Thuisbatterij_Sub',
    task: TS,
    pool: { x: 100, y: 60, w: 1820, h: 480 },
    lanes: [
      { id: 'Lane_Behandelaar', name: 'Behandelaar', y: 60, h: 160 },
      { id: 'Lane_Systeem', name: 'Systeem', y: 220, h: 320 },
    ],
    nodes: {
      SubStart: ['Lane_Systeem', 160, 320],
      Sub_PrepareDmnInput: ['Lane_Systeem', 300, 320],
      Sub_AssessRight: ['Lane_Systeem', 490, 320],
      Sub_InterpretRight: ['Lane_Systeem', 680, 320],
      Sub_EligibleGateway: ['Lane_Systeem', 840, 320],
      Sub_CalculateAmount: ['Lane_Systeem', 1000, 320],
      Sub_ExtractAmount: ['Lane_Systeem', 1190, 320],
      Sub_CaseReview: ['Lane_Behandelaar', 1190, 140],
      Sub_ResolveDecision: ['Lane_Systeem', 1380, 320],
      Sub_FinalGateway: ['Lane_Systeem', 1530, 320],
      Sub_SetGranted: ['Lane_Systeem', 1690, 320],
      Sub_SetRejected: ['Lane_Systeem', 1690, 460],
      SubEnd: ['Lane_Systeem', 1860, 320],
    },
    flows: {
      Flow_Sub_Start_Prepare: [[178, 320], [225, 320]],
      Flow_Sub_Prepare_AssessRight: [[375, 320], [415, 320]],
      Flow_Sub_AssessRight_Interpret: [[565, 320], [605, 320]],
      Flow_Sub_Interpret_Eligible: [[755, 320], [815, 320]],
      Flow_Sub_Eligible_No: [[840, 295], [840, 140], [1115, 140]],
      Flow_1ecxeub: [[865, 320], [925, 320]],
      Flow_Sub_Amount_Extract: [[1075, 320], [1115, 320]],
      Flow_Sub_Amount_Review: [[1190, 280], [1190, 180]],
      Flow_Sub_Review_Resolve: [[1265, 140], [1380, 140], [1380, 280]],
      Flow_Sub_Resolve_Gateway: [[1455, 320], [1505, 320]],
      Flow_Sub_Final_Yes: [[1555, 320], [1615, 320]],
      Flow_Sub_Final_No: [[1530, 345], [1530, 460], [1615, 460]],
      Flow_Sub_Granted_End: [[1765, 320], [1842, 320]],
      Flow_Sub_Rejected_End: [[1765, 460], [1860, 460], [1860, 338]],
    },
    extraShapes: [],
    extraEdges: [],
    renames: {
      Sub_CaseReview: 'Beoordeling behandelaar: recht en hoogte subsidie',
      Sub_ResolveDecision: 'Definitief subsidiebesluit vaststellen',
      Sub_SetGranted: 'Besluitvariabelen zetten: Toegekend',
      Sub_SetRejected: 'Besluitvariabelen zetten: Afgewezen',
    },
    formSwap: false,
  },
};

const OLD_FORM = 'camunda:formKey="embedded:deployment:awb-missing-info-form.html"';
const NEW_FORM =
  'camunda:formRef="thuisbatterij-aanvullende-gegevens" camunda:formRefBinding="deployment"';
const NODE_RE =
  /<bpmn:(startEvent|endEvent|scriptTask|userTask|businessRuleTask|callActivity|exclusiveGateway|serviceTask|task) id="([^"]+)"/g;
const esc = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const die = (m) => { console.error(`gen-lanes: ${m}`); process.exit(1); };

const [which, file] = process.argv.slice(2);
const L = LAYOUTS[which] ?? die(`unknown layout "${which}"`);
let xml = fs.readFileSync(file, 'utf8');
if (xml.includes('\r\n')) die('file has CRLF line endings; expected LF');
if (xml.includes('<bpmn:laneSet')) die('file already has a laneSet');

// 1. names
for (const [id, name] of Object.entries(L.renames)) {
  const re = new RegExp(`(<bpmn:\\w+ id="${id}" name=")[^"]*(")`);
  if (!re.test(xml)) die(`rename: no element with id ${id}`);
  xml = xml.replace(re, `$1${esc(name)}$2`);
}

// 2. missing-info form
if (L.formSwap) {
  if (!xml.includes(OLD_FORM)) die('form swap: embedded formKey not found');
  xml = xml.replace(OLD_FORM, NEW_FORM);
}

// 3. every flow node and flow has a layout entry, and vice versa
const kinds = new Map([...xml.matchAll(NODE_RE)].map((m) => [m[2], m[1]]));
const flowIds = [...xml.matchAll(/<bpmn:sequenceFlow id="([^"]+)"/g)].map((m) => m[1]);
for (const id of kinds.keys()) if (!L.nodes[id]) die(`no layout for node ${id}`);
for (const id of Object.keys(L.nodes)) if (!kinds.has(id)) die(`layout node ${id} not in file`);
for (const id of flowIds) if (!L.flows[id]) die(`no waypoints for flow ${id}`);
for (const id of Object.keys(L.flows)) if (!flowIds.includes(id)) die(`layout flow ${id} not in file`);

// 4. collaboration before the process
const procName = xml.match(new RegExp(`<bpmn:process id="${L.processId}" name="([^"]*)"`))?.[1]
  ?? die('process element not found');
const collab =
  `  <bpmn:collaboration id="${L.collab}">\n` +
  `    <bpmn:participant id="${L.participant}" name="${procName}" processRef="${L.processId}" />\n` +
  `  </bpmn:collaboration>\n`;
const pIdx = xml.indexOf('  <bpmn:process ');
xml = xml.slice(0, pIdx) + collab + xml.slice(pIdx);

// 5. laneSet before the first flow element (the start event in both files)
const laneXml = L.lanes.map((lane) => {
  const refs = Object.entries(L.nodes).filter(([, n]) => n[0] === lane.id).map(([id]) => id);
  if (refs.length === 0) die(`lane ${lane.id} would be empty`);
  return `      <bpmn:lane id="${lane.id}" name="${lane.name}">\n` +
    refs.map((r) => `        <bpmn:flowNodeRef>${r}</bpmn:flowNodeRef>\n`).join('') +
    `      </bpmn:lane>\n`;
}).join('');
const sIdx = xml.indexOf('    <bpmn:startEvent ');
if (sIdx < 0) die('start event not found');
xml = xml.slice(0, sIdx) + `    <bpmn:laneSet id="${L.laneSet}">\n${laneXml}    </bpmn:laneSet>\n` + xml.slice(sIdx);

// 6. regenerate the diagram
const diagramId = xml.match(/<bpmndi:BPMNDiagram id="([^"]+)"/)?.[1] ?? die('no BPMNDiagram');
const planeId = xml.match(/<bpmndi:BPMNPlane id="([^"]+)"/)?.[1] ?? die('no BPMNPlane');
const size = (id) => {
  const k = kinds.get(id);
  if (k === 'startEvent' || k === 'endEvent') return { w: 36, h: 36 };
  if (k === 'exclusiveGateway') return { w: 50, h: 50 };
  return L.task;
};
const shape = (id, x, y, w, h, extra = '') =>
  `      <bpmndi:BPMNShape id="${id}_di" bpmnElement="${id}"${extra}>\n` +
  `        <dc:Bounds x="${x}" y="${y}" width="${w}" height="${h}" />\n` +
  `      </bpmndi:BPMNShape>\n`;
const edge = (id, pts) =>
  `      <bpmndi:BPMNEdge id="${id}_di" bpmnElement="${id}">\n` +
  pts.map(([x, y]) => `        <di:waypoint x="${x}" y="${y}" />\n`).join('') +
  `      </bpmndi:BPMNEdge>\n`;
const LANE_X = L.pool.x + 30;
const LANE_W = L.pool.w - 30;
let di = shape(L.participant, L.pool.x, L.pool.y, L.pool.w, L.pool.h, ' isHorizontal="true"');
for (const lane of L.lanes) di += shape(lane.id, LANE_X, lane.y, LANE_W, lane.h, ' isHorizontal="true"');
for (const [id, [, cx, cy]] of Object.entries(L.nodes)) {
  const { w, h } = size(id);
  const extra = kinds.get(id) === 'exclusiveGateway' ? ' isMarkerVisible="true"' : '';
  di += shape(id, cx - w / 2, cy - h / 2, w, h, extra);
}
for (const [id, pts] of Object.entries(L.flows)) di += edge(id, pts);
for (const s of L.extraShapes) di += shape(s.id, s.x, s.y, s.w, s.h);
for (const e of L.extraEdges) di += edge(e.id, e.points);
const diagram =
  `  <bpmndi:BPMNDiagram id="${diagramId}">\n` +
  `    <bpmndi:BPMNPlane id="${planeId}" bpmnElement="${L.collab}">\n${di}` +
  `    </bpmndi:BPMNPlane>\n  </bpmndi:BPMNDiagram>\n`;
const dStart = xml.indexOf('  <bpmndi:BPMNDiagram');
const dEnd = xml.indexOf('</bpmndi:BPMNDiagram>') + '</bpmndi:BPMNDiagram>'.length + 1;
xml = xml.slice(0, dStart) + diagram + xml.slice(dEnd);

fs.writeFileSync(file, xml);
console.log(`gen-lanes: wrote ${file}`);
```

- [ ] **Step 2: Run the generator on the main process**

```bash
cd $R
node $S/gen-lanes.mjs main $P/ThuisbatterijSubsidieAanvraagProcess.bpmn
```

Expected: `gen-lanes: wrote …ThuisbatterijSubsidieAanvraagProcess.bpmn`. Any `gen-lanes:` error means the file does not match the layout table: fix the table, `git checkout -- $P/ThuisbatterijSubsidieAanvraagProcess.bpmn`, run again.

- [ ] **Step 3: Run the checks**

```bash
node $S/check-lanes.mjs $P/ThuisbatterijSubsidieAanvraagProcess.bpmn
node $S/moddle-check.mjs $P/ThuisbatterijSubsidieAanvraagProcess.bpmn
```

Expected: `OK` from both, exit 0.

- [ ] **Step 4: Review the diff for unintended change**

```bash
git diff --stat -- $P/ThuisbatterijSubsidieAanvraagProcess.bpmn
git diff -- $P/ThuisbatterijSubsidieAanvraagProcess.bpmn | grep -E '^[-+] ' | grep -vE 'BPMN(Shape|Edge|Label)|dc:Bounds|di:waypoint|/bpmndi:|bpmn:lane|flowNodeRef|laneSet|collaboration|participant' 
```

Expected: the only remaining `-`/`+` lines are the `name="…"` changes from the rename table and the `formKey` → `formRef` swap on `Task_RequestMissingInfo`. Scripts, conditions, `camunda:in/out`, `decisionRefTenantId` and `ronl:*` lines must not appear.

No commit yet: the parity test would fail until Task 4 regenerates the fixtures.

---

### Task 3: Subprocess

**Files:**
- Modify (generated): `$P/ThuisbatterijSubsidieDecisionSubProcess.bpmn`

**Interfaces:**
- Consumes: `gen-lanes.mjs` layout `sub` (Task 2), checks (Task 1).

- [ ] **Step 1: Confirm it fails the check first**

```bash
cd $R
node $S/check-lanes.mjs $P/ThuisbatterijSubsidieDecisionSubProcess.bpmn
```

Expected: `FAIL` (no collaboration, no lanes).

- [ ] **Step 2: Generate**

```bash
node $S/gen-lanes.mjs sub $P/ThuisbatterijSubsidieDecisionSubProcess.bpmn
```

Expected: `gen-lanes: wrote …`.

- [ ] **Step 3: Check**

```bash
node $S/check-lanes.mjs $P/ThuisbatterijSubsidieDecisionSubProcess.bpmn
node $S/moddle-check.mjs $P/ThuisbatterijSubsidieDecisionSubProcess.bpmn
```

Expected: `OK` from both.

- [ ] **Step 4: Review the diff**

```bash
git diff -- $P/ThuisbatterijSubsidieDecisionSubProcess.bpmn | grep -E '^[-+] ' | grep -vE 'BPMN(Shape|Edge|Label)|dc:Bounds|di:waypoint|/bpmndi:|bpmn:lane|flowNodeRef|laneSet|collaboration|participant'
```

Expected: only the four `name="…"` changes (`Sub_CaseReview`, `Sub_ResolveDecision`, `Sub_SetGranted`, `Sub_SetRejected`).

---

### Task 4: Form, e2e copies, manifest, seeding

**Files:**
- Create: `$P/thuisbatterij-aanvullende-gegevens.form`
- Create: `$F/thuisbatterij-aanvullende-gegevens.form`
- Create: `$S/derive-e2e.mjs`
- Modify (derived): `$F/ThuisbatterijSubsidieAanvraagProcess.bpmn`, `$F/ThuisbatterijSubsidieDecisionSubProcessE2E.bpmn`
- Modify: `$R/e2e-fixtures/manifest.json` (Thuisbatterij main entry `forms`, around line 114)
- Modify: `$R/packages/frontend/src/utils/exampleVersions.ts:26-27,39`
- Modify: `$R/packages/frontend/src/components/FormEditor/FormEditor.tsx` (after the `example_thuisbatterij_notify_applicant` entry, ~line 64)
- Test: `$R/packages/backend/src/public-example-fixture-parity.test.ts`, `$R/packages/backend/src/e2e-fixtures.test.ts`, `$R/packages/backend/src/e2e-fixture-decisions.test.ts` (existing)

**Interfaces:**
- Consumes: the generated public BPMNs (Tasks 2–3).
- Produces: form id `thuisbatterij-aanvullende-gegevens`; process variables `ontbrekendeGegevens` (string), `hersteltermijnDatum` (ISO date string), `supplementReceived` (boolean), `aanvullingToelichting` (string); seed id `example_thuisbatterij_missing_info`.

- [ ] **Step 1: Capture the pre-existing E2E annotation blocks** (the derive script reuses their exact text)

```bash
cd $R
git show HEAD:e2e-fixtures/flevoland/ThuisbatterijSubsidieAanvraagProcess.bpmn > $S/e2e-main.orig.bpmn
git show HEAD:e2e-fixtures/flevoland/ThuisbatterijSubsidieDecisionSubProcessE2E.bpmn > $S/e2e-sub.orig.bpmn
grep -c 'Annotation_E2EFixture' $S/e2e-main.orig.bpmn $S/e2e-sub.orig.bpmn
```

Expected: `3` for each (textAnnotation, association sourceRef, DI shape).

- [ ] **Step 2: Write `derive-e2e.mjs`**

```js
// Derive an e2e-fixtures BPMN from its public-examples source. Not committed.
// Applies exactly the parity test's sanctioned differences 3 and 4.
import fs from 'node:fs';

const [src, orig, out, startId, ax, ay, sx, sy] = process.argv.slice(2);
const KEY = 'ThuisbatterijSubsidieDecisionSubProcess';
const die = (m) => { console.error(`derive-e2e: ${m}`); process.exit(1); };

let xml = fs.readFileSync(src, 'utf8');
if (xml.includes(`${KEY}E2E`)) die('source already carries the E2E suffix');
xml = xml.split(KEY).join(`${KEY}E2E`);

const o = fs.readFileSync(orig, 'utf8');
const ann = o.match(/ {4}<bpmn:textAnnotation id="Annotation_E2EFixture">[\s\S]*?<\/bpmn:textAnnotation>\n/)?.[0]
  ?? die('annotation block not found in original');
const assoc =
  `    <bpmn:association id="Association_E2EFixture" sourceRef="Annotation_E2EFixture" targetRef="${startId}" />\n`;
const pEnd = xml.indexOf('  </bpmn:process>');
xml = xml.slice(0, pEnd) + ann + assoc + xml.slice(pEnd);

const planeOpen = xml.match(/ {4}<bpmndi:BPMNPlane [^>]*>\n/)?.[0] ?? die('no plane');
const x = Number(ax), y = Number(ay);
const di =
  `      <bpmndi:BPMNShape id="Annotation_E2EFixture_di" bpmnElement="Annotation_E2EFixture">\n` +
  `        <dc:Bounds x="${x}" y="${y}" width="320" height="100" />\n` +
  `      </bpmndi:BPMNShape>\n` +
  `      <bpmndi:BPMNEdge id="Association_E2EFixture_di" bpmnElement="Association_E2EFixture">\n` +
  `        <di:waypoint x="${x + 60}" y="${y + 100}" />\n` +
  `        <di:waypoint x="${sx}" y="${sy}" />\n` +
  `      </bpmndi:BPMNEdge>\n`;
const i = xml.indexOf(planeOpen) + planeOpen.length;
xml = xml.slice(0, i) + di + xml.slice(i);

fs.writeFileSync(out, xml);
console.log(`derive-e2e: wrote ${out}`);
```

- [ ] **Step 3: Derive both fixture BPMNs**

Main start event top is (190, 112); subprocess start event top is (160, 302). The annotation sits above the pool at y = -70.

```bash
node $S/derive-e2e.mjs $P/ThuisbatterijSubsidieAanvraagProcess.bpmn $S/e2e-main.orig.bpmn $F/ThuisbatterijSubsidieAanvraagProcess.bpmn StartEvent_AWB 240 -70 190 112
node $S/derive-e2e.mjs $P/ThuisbatterijSubsidieDecisionSubProcess.bpmn $S/e2e-sub.orig.bpmn $F/ThuisbatterijSubsidieDecisionSubProcessE2E.bpmn SubStart 240 -70 160 302
node $S/check-lanes.mjs $F/ThuisbatterijSubsidieAanvraagProcess.bpmn $F/ThuisbatterijSubsidieDecisionSubProcessE2E.bpmn
node $S/moddle-check.mjs $F/ThuisbatterijSubsidieAanvraagProcess.bpmn $F/ThuisbatterijSubsidieDecisionSubProcessE2E.bpmn
grep -n 'calledElement\|<bpmn:process id' $F/ThuisbatterijSubsidieAanvraagProcess.bpmn $F/ThuisbatterijSubsidieDecisionSubProcessE2E.bpmn
```

Expected: two `wrote` lines; `OK` ×2 from each check; `calledElement="ThuisbatterijSubsidieDecisionSubProcessE2E"` and `<bpmn:process id="ThuisbatterijSubsidieDecisionSubProcessE2E"`.

- [ ] **Step 4: Run the fixture tests — they must fail on the missing form**

Add the form to the manifest first (so the test has something to miss). In `e2e-fixtures/manifest.json`, the Thuisbatterij main entry's `forms` becomes:

```json
      "forms": [
        "recht-en-hoogte-subsidie-thuisbatterij.form",
        "awb-notify-applicant-thuisbatterij.form",
        "thuisbatterij-aanvullende-gegevens.form"
      ],
```

```bash
cd $R/packages/backend
npx jest --config jest.config.js src/e2e-fixtures.test.ts src/public-example-fixture-parity.test.ts src/e2e-fixture-decisions.test.ts --coverage=false
```

Expected: FAIL in `every declared file exists under its tenant directory` (the form file does not exist yet). Parity and decision tests PASS (the BPMN pairs already agree).

- [ ] **Step 5: Write the public form** `$P/thuisbatterij-aanvullende-gegevens.form`

```json
{
  "components": [
    {
      "text": "# Aanvullende gegevens opvragen (Awb 4:5)\nDe aanvraag is niet volledig. Leg vast welke gegevens ontbreken en tot wanneer de aanvrager deze kan aanvullen. Registreer daarna of de aanvulling binnen de hersteltermijn is ontvangen.",
      "id": "Field_001_tbag",
      "type": "text",
      "layout": { "row": "Row_001_tbag", "columns": null }
    },
    {
      "label": "Dossiernummer",
      "id": "Field_002_tbag",
      "key": "dossierReference",
      "type": "textfield",
      "layout": { "row": "Row_002_tbag", "columns": 8 },
      "disabled": true
    },
    {
      "label": "Datum ontvangst",
      "id": "Field_003_tbag",
      "key": "receiptDate",
      "type": "textfield",
      "layout": { "row": "Row_002_tbag", "columns": 8 },
      "disabled": true
    },
    {
      "label": "Ontbrekende gegevens",
      "id": "Field_004_tbag",
      "key": "ontbrekendeGegevens",
      "type": "textarea",
      "layout": { "row": "Row_003_tbag", "columns": null },
      "validate": { "required": true }
    },
    {
      "subtype": "date",
      "dateLabel": "Hersteltermijn tot",
      "id": "Field_005_tbag",
      "key": "hersteltermijnDatum",
      "type": "datetime",
      "layout": { "row": "Row_004_tbag", "columns": 8 },
      "validate": { "required": true }
    },
    {
      "label": "Aanvulling binnen hersteltermijn ontvangen",
      "id": "Field_006_tbag",
      "key": "supplementReceived",
      "type": "checkbox",
      "defaultValue": false,
      "layout": { "row": "Row_005_tbag", "columns": null }
    },
    {
      "label": "Toelichting",
      "id": "Field_007_tbag",
      "key": "aanvullingToelichting",
      "type": "textarea",
      "layout": { "row": "Row_006_tbag", "columns": null }
    },
    {
      "action": "submit",
      "label": "Verzenden",
      "id": "Field_008_tbag",
      "type": "button",
      "layout": { "row": "Row_007_tbag", "columns": null }
    }
  ],
  "id": "thuisbatterij-aanvullende-gegevens",
  "type": "default",
  "exporter": {
    "name": "Camunda Modeler",
    "version": "5.43.1"
  },
  "schemaVersion": 19,
  "executionPlatform": "Camunda Platform",
  "executionPlatformVersion": "7.21.0"
}
```

- [ ] **Step 6: Write the fixture copy** — identical, plus the marker as the first key (same place as `thuisbatterij-subsidie-review.form` in e2e-fixtures):

```bash
cd $R
node -e "const fs=require('fs');const s=fs.readFileSync(process.argv[1],'utf8');if(!s.startsWith('{\n'))throw new Error('unexpected start');fs.writeFileSync(process.argv[2],'{\n  \"e2eFixture\": true,'+s.slice(1));" $P/thuisbatterij-aanvullende-gegevens.form $F/thuisbatterij-aanvullende-gegevens.form
diff $P/thuisbatterij-aanvullende-gegevens.form $F/thuisbatterij-aanvullende-gegevens.form
```

Expected diff: exactly `1a2 > "e2eFixture": true,`.

- [ ] **Step 7: Seed versions** — in `packages/frontend/src/utils/exampleVersions.ts` replace

```ts
  example_thuisbatterij_aanvraag: 1,
  example_thuisbatterij_decision: 1,
```

with

```ts
  example_thuisbatterij_aanvraag: 2, // v2: swimlanes + Dutch names
  example_thuisbatterij_decision: 2, // v2: swimlanes + Dutch names
```

and replace

```ts
  example_thuisbatterij_notify_applicant: 1,
```

with

```ts
  example_thuisbatterij_notify_applicant: 1,
  example_thuisbatterij_missing_info: 1,
```

- [ ] **Step 8: Form seed** — in `packages/frontend/src/components/FormEditor/FormEditor.tsx`, directly after the `example_thuisbatterij_notify_applicant` object, insert:

```ts
  {
    id: 'example_thuisbatterij_missing_info',
    name: 'Thuisbatterij Aanvullende Gegevens (Example)',
    description:
      'Caseworker form for requesting missing information on a Thuisbatterij subsidy application (Awb 4:5)',
    path: '/examples/flevoland/thuisbatterij-aanvullende-gegevens.form',
    language: 'nl',
    organization: 'flevoland',
  },
```

No other registration is needed: `FormEditor.tsx:232-249` loops over every `EXAMPLE_FORMS` entry and re-fetches it when `getStoredVersion(def.id) < EXAMPLE_VERSIONS[def.id]` (verified 2026-09-24).

- [ ] **Step 9: Re-run the fixture tests**

```bash
cd $R/packages/backend
npx jest --config jest.config.js src/e2e-fixtures.test.ts src/public-example-fixture-parity.test.ts src/e2e-fixture-decisions.test.ts --coverage=false
```

Expected: all PASS.

- [ ] **Step 10: Typecheck, lint, format check on touched TS**

```bash
cd $R
npm run typecheck
npx eslint packages/frontend/src/utils/exampleVersions.ts packages/frontend/src/components/FormEditor/FormEditor.tsx
npx prettier --check packages/frontend/src/utils/exampleVersions.ts packages/frontend/src/components/FormEditor/FormEditor.tsx e2e-fixtures/manifest.json $P/thuisbatterij-aanvullende-gegevens.form $F/thuisbatterij-aanvullende-gegevens.form
```

Expected: no errors. If prettier wants to reformat the `.form` JSON, apply `prettier --write` to **both** copies and re-run Step 9 (parity must hold).

- [ ] **Step 11: Stage and ask the user for the commit**

```bash
git branch --show-current   # must print feat/thuisbatterij-swimlanes
git add docs/superpowers/specs/2026-09-24-thuisbatterij-swimlanes-design.md docs/superpowers/plans/2026-09-24-thuisbatterij-swimlanes.md \
  packages/frontend/public/examples/flevoland/ThuisbatterijSubsidieAanvraagProcess.bpmn \
  packages/frontend/public/examples/flevoland/ThuisbatterijSubsidieDecisionSubProcess.bpmn \
  packages/frontend/public/examples/flevoland/thuisbatterij-aanvullende-gegevens.form \
  e2e-fixtures/flevoland/ThuisbatterijSubsidieAanvraagProcess.bpmn \
  e2e-fixtures/flevoland/ThuisbatterijSubsidieDecisionSubProcessE2E.bpmn \
  e2e-fixtures/flevoland/thuisbatterij-aanvullende-gegevens.form \
  e2e-fixtures/manifest.json \
  packages/frontend/src/utils/exampleVersions.ts \
  packages/frontend/src/components/FormEditor/FormEditor.tsx
git status --short
```

Report what is staged and **stop for the user's go-ahead**. Proposed message:

```
feat(examples): Thuisbatterij processes in swimlanes, with Dutch names and a missing-info form

Both processes get a pool and Aanvrager/Behandelaar/Systeem lanes, as the
RIPx.y processes have. Element ids are unchanged; names become Dutch.
"Aanvullende gegevens opvragen" pointed at an embedded HTML form that never
existed, so nothing could set supplementReceived; it now uses a deployable
form-js form. Seeds bumped so the Modeler replaces cached copies.
```

---

### Task 5: Deploy through LDE and exercise the new form on local Operaton

**Files:**
- Create: `$S/deploy-body.mjs` (not committed)

**Interfaces:**
- Consumes: the fixture BPMNs and forms (Task 4), the fixture `thuisbatterij_subsidie_beschikking.document`.
- Produces: a new Operaton deployment (tenant `flevoland`) and a recorded LDE bundle; left in place.

- [ ] **Step 1: Pre-flight (read only)**

```bash
curl -s -o /dev/null -w "LDE %{http_code}\n" http://localhost:3001/api/health
curl -s "http://localhost:8081/engine-rest/process-definition?key=ThuisbatterijSubsidieAanvraagProcess&latestVersion=true&tenantIdIn=flevoland" | grep -oE '"version":[0-9]+'
for k in AwbCompletenessCheck ArchivesActRetention RechtOpSubsidieThuisbatterij BehaalbareHoogteSubsidie; do curl -s "http://localhost:8081/engine-rest/decision-definition?key=$k&withoutTenantId=true" | grep -q '"id"' && echo "$k ok" || echo "$k MISSING"; done
```

Expected: `LDE 200`; a current version (3 on 2026-09-24); four `ok`. Anything else: stop and report; do not start or restart services, do not deploy DMNs.

- [ ] **Step 2: Build the request body** — `deploy-body.mjs` mirrors `BpmnCanvas.tsx` `handleDeploy`:

```js
// Builds the /api/dmns/process/deploy body from the e2e fixtures. Not committed.
import fs from 'node:fs';
const F = 'C:/Users/gorts01/Development/linked-data-explorer/e2e-fixtures/flevoland';
const read = (f) => fs.readFileSync(`${F}/${f}`, 'utf8');
const bpmnXml = read('ThuisbatterijSubsidieAanvraagProcess.bpmn');
const subXml = read('ThuisbatterijSubsidieDecisionSubProcessE2E.bpmn');
const refs = (x) => [...x.matchAll(/camunda:formRef="([^"]+)"/g)].map((m) => m[1]);
const formIds = [...new Set([...refs(bpmnXml), ...refs(subXml)])];
const forms = formIds.map((id) => ({ id, schema: JSON.parse(read(`${id}.form`)) }));
const docId = 'thuisbatterij_subsidie_beschikking';
const body = {
  bpmnXml,
  deploymentName: 'ThuisbatterijSubsidieAanvraagProcess',
  forms,
  documents: [{ id: docId, template: JSON.parse(read(`${docId}.document`)) }],
  subProcesses: [{ filename: 'ThuisbatterijSubsidieDecisionSubProcessE2E.bpmn', xml: subXml }],
  boardOwner: 'caseworker',
  organization: 'flevoland',
};
if (forms.length !== 4) throw new Error(`expected 4 forms, got ${formIds.join(', ')}`);
fs.writeFileSync(process.argv[2], JSON.stringify(body));
console.log('forms:', formIds.join(', '));
```

```bash
node $S/deploy-body.mjs $S/deploy-body.json
```

Expected: `forms: recht-en-hoogte-subsidie-thuisbatterij, thuisbatterij-aanvullende-gegevens, awb-notify-applicant-thuisbatterij, thuisbatterij-subsidie-review` (order may differ).

- [ ] **Step 3: Deploy**

```bash
curl -s -X POST http://localhost:3001/api/dmns/process/deploy -H 'Content-Type: application/json' --data-binary @$S/deploy-body.json | tee $S/deploy-result.json
```

Expected: `"success":true`, a `deploymentId`, and `"bundleRecorded":true`. A 4xx/5xx or an Operaton parse error: stop, report it verbatim, and fix the XML (then redo Tasks 2–4 checks).

- [ ] **Step 4: Confirm the new versions and their lanes**

```bash
curl -s "http://localhost:8081/engine-rest/process-definition?key=ThuisbatterijSubsidieAanvraagProcess&latestVersion=true&tenantIdIn=flevoland" | grep -oE '"(id|version|deploymentId)":"?[^,"]*'
curl -s "http://localhost:8081/engine-rest/process-definition?key=ThuisbatterijSubsidieDecisionSubProcessE2E&latestVersion=true&tenantIdIn=flevoland" | grep -oE '"(id|version)":"?[^,"]*'
```

Expected: main version one higher than in Step 1, same `deploymentId` as Step 3; subprocess version incremented.

- [ ] **Step 5: Start an instance at the missing-info task** (the DMN never routes there; see Review Focus 1)

```bash
curl -s -X POST "http://localhost:8081/engine-rest/process-definition/key/ThuisbatterijSubsidieAanvraagProcess/tenant-id/flevoland/start" \
  -H 'Content-Type: application/json' \
  -d '{"businessKey":"lanes-verify-2026-09-24","skipCustomListeners":true,"startInstructions":[{"type":"startBeforeActivity","activityId":"Task_RequestMissingInfo"}],"variables":{"dossierReference":{"value":"TB-FL-VERIFY","type":"String"},"receiptDate":{"value":"2026-09-24T10:00:00Z","type":"String"}}}' | tee $S/start.json | grep -oE '"id":"[^"]+"' | head -1
```

Expected: an instance id. Then:

```bash
PI=$(grep -oE '"id":"[^"]+"' $S/start.json | head -1 | cut -d'"' -f4)
TASK=$(curl -s "http://localhost:8081/engine-rest/task?processInstanceId=$PI" | grep -oE '"id":"[^"]+"' | head -1 | cut -d'"' -f4)
curl -s "http://localhost:8081/engine-rest/task/$TASK" | grep -oE '"(name|taskDefinitionKey)":"[^"]+"'
curl -s "http://localhost:8081/engine-rest/task/$TASK/deployed-form" | grep -oE '"id": *"thuisbatterij-aanvullende-gegevens"'
```

Expected: `taskDefinitionKey":"Task_RequestMissingInfo"`, `name":"Aanvullende gegevens opvragen (Awb 4:5)"`, and the form id line.

- [ ] **Step 6: Complete with `supplementReceived=false` and follow the route**

```bash
curl -s -o /dev/null -w "complete %{http_code}\n" -X POST "http://localhost:8081/engine-rest/task/$TASK/complete" -H 'Content-Type: application/json' \
  -d '{"variables":{"ontbrekendeGegevens":{"value":"Energierekening ontbreekt","type":"String"},"hersteltermijnDatum":{"value":"2026-10-08","type":"String"},"supplementReceived":{"value":false,"type":"Boolean"},"aanvullingToelichting":{"value":"Verificatie swimlanes","type":"String"}}}'
curl -s "http://localhost:8081/engine-rest/task?processInstanceId=$PI" | grep -oE '"(taskDefinitionKey|name)":"[^"]+"'
curl -s "http://localhost:8081/engine-rest/history/activity-instance?processInstanceId=$PI&sortBy=startTime&sortOrder=asc" | grep -oE '"activityId":"[^"]+"'
curl -s "http://localhost:8081/engine-rest/process-instance/$PI/variables/status" | grep -oE '"value":"[^"]+"'
```

Expected: `complete 204`; the open task is `Task_Phase6_Notify` named `Fase 6: Aanvrager informeren over besluit (Awb 3:6)`; history shows `Task_RequestMissingInfo`, `Gateway_StillIncomplete`, `Task_RefuseToProcess`, `Task_Phase6_Notify`; `status` is `Niet ontvankelijk`.

- [ ] **Step 7: Remove the test instance only**

```bash
curl -s -o /dev/null -w "delete %{http_code}\n" -X DELETE "http://localhost:8081/engine-rest/process-instance/$PI?skipCustomListeners=true"
```

Expected: `delete 204`. The deployment and the LDE record stay.

No commit: nothing in the repo changed.

---

### Task 6: User acceptance on LDE

- [ ] **Step 1: Hand off the full suites** — ask the user to run, and wait for their "green":

```bash
cd C:/Users/gorts01/Development/linked-data-explorer
npm run typecheck
npm run lint
npm test
```

Expected: all green. A failure that appears only in the full parallel run is re-run in isolation before it is treated as a finding.

- [ ] **Step 2: Hand off the visual check** — ask the user to reload the Modeler (the version bumps re-seed), open "Subsidie Thuisbatterij Flevoland (Example)" and "Thuisbatterijsubsidie — Beoordeling recht en hoogte (Example)", and confirm: pool, three / two lanes in the right order, every node inside its lane, Dutch labels readable, the one crossing at `Flow_Recheck_Refuse` × `Flow_Complete_Yes` acceptable. Also ask them to open the new form in the Form editor.

Fixes from this step go back to the layout table in `gen-lanes.mjs`. The generator needs the lane-less originals, which `acc` always has, whatever has been staged or committed since:

```bash
cd $R
git show acc:packages/frontend/public/examples/flevoland/ThuisbatterijSubsidieAanvraagProcess.bpmn > $P/ThuisbatterijSubsidieAanvraagProcess.bpmn
git show acc:packages/frontend/public/examples/flevoland/ThuisbatterijSubsidieDecisionSubProcess.bpmn > $P/ThuisbatterijSubsidieDecisionSubProcess.bpmn
```

Then rerun Task 2 Step 2, Task 3 Step 2, Task 4 Step 3 and Step 9, and ask again for the commit (a follow-up commit if Task 4's is already in).

---

### Task 7: ronl-business-api companion

**Files:**
- Modify: `C:/Users/gorts01/Development/ronl-business-api/packages/frontend/e2e/thuisbatterij-journey.spec.ts:11,85,97`

**Interfaces:**
- Consumes: the Dutch task names from the rename table: `Beoordeling behandelaar: recht en hoogte subsidie`, `Fase 6: Aanvrager informeren over besluit`.

- [ ] **Step 1: Branch** (standalone command, then verify)

```bash
cd C:/Users/gorts01/Development/ronl-business-api
git status --short
git switch acc
git pull --ff-only origin acc
```

```bash
git switch -c fix/thuisbatterij-dutch-task-names
```

```bash
git branch --show-current
```

Expected: clean tree first; last command prints `fix/thuisbatterij-dutch-task-names`. A dirty tree: stop and ask.

- [ ] **Step 2: Edit the spec**

Line 85:

```ts
  await openOwnTask(
    caseworkerPage,
    /Case review: recht en hoogte subsidie|Beoordeling behandelaar: recht en hoogte subsidie/,
    ownInstances
  );
```

Line 97:

```ts
  await openOwnTask(
    caseworkerPage,
    /Phase 6: Notify applicant of decision|Fase 6: Aanvrager informeren over besluit/,
    ownInstances
  );
```

Line 11: change `raises a "Case review" task for` to `raises a "Case review" (Dutch: "Beoordeling behandelaar") task for`, keeping the rest of the comment.

- [ ] **Step 3: Typecheck and lint the file**

```bash
npx prettier --check packages/frontend/e2e/thuisbatterij-journey.spec.ts
npx eslint packages/frontend/e2e/thuisbatterij-journey.spec.ts
npm run typecheck --workspace=packages/frontend
```

Expected: clean. (Check `packages/frontend/package.json` has `typecheck`; if the workspace name differs, use the name from that file.)

- [ ] **Step 4: Hand off the journey** — the local engine now runs the new definitions (Task 5), so ask the user to run the Thuisbatterij journey with their usual e2e command and report green. Do not start servers for it.

- [ ] **Step 5: Stage and ask for the commit**

```bash
git add packages/frontend/e2e/thuisbatterij-journey.spec.ts
git status --short
```

Proposed message:

```
test(e2e): match the Thuisbatterij tasks by their Dutch names as well

linked-data-explorer renames "Case review: recht en hoogte subsidie" and
"Phase 6: Notify applicant of decision" in the Thuisbatterij processes. The
journey accepts both names so it passes on engines still running the old
definitions and on those running the new ones.
```

---

### Task 8: Pull requests (after the user's go-ahead)

- [ ] **Step 1:** With the user's approval, push `feat/thuisbatterij-swimlanes` and open a PR to `acc` in linked-data-explorer; body summarises the spec, lists the verification done (Tasks 1–5 output, user's green), mentions the unreachable-path finding, and links #205. No attribution lines.
- [ ] **Step 2:** With the user's approval, push `fix/thuisbatterij-dutch-task-names` and open a PR to `acc` in ronl-business-api, linking the LDE PR.
- [ ] **Step 3:** Ask whether to file the separate issue for the dangling `awb-missing-info-form.html` in `AwbShellProcess` and `AwbZorgtoeslagProcess`, and whether to file one for the unreachable incomplete path in Thuisbatterij (Review Focus 1).

Never merge either PR unless the user asks for that specific PR.
