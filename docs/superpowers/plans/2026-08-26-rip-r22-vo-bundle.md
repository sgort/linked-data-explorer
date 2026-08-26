# RipR22Process (R2.2 — VO) Deploy Bundle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the R2.2 — VO swimlane spec into a bundle LDE can import and deploy: a four-lane BPMN process, nine Camunda forms, and five document templates, registered in `e2e-fixtures/manifest.json`.

**Architecture:** Artifacts are authored under `examples/organizations/flevoland/rip-phase-22/` and mirrored byte-for-byte into `e2e-fixtures/flevoland/`, which is what import and deploy actually read. A new parity test locks the two copies together so they cannot drift. The five existing tests in `packages/backend/src/e2e-fixtures.test.ts` pick the bundle up automatically once it appears in the manifest.

**Tech Stack:** BPMN 2.0 with `camunda:` extension attributes (Camunda Platform 7.21 / Operaton), Camunda form-js `schemaVersion: 16`, LDE `.document` templates with TipTap doc JSON, Jest (backend workspace).

**Spec:** `docs/superpowers/specs/2026-08-26-rip-r22-vo-bundle-design.md`

## Global Constraints

- **Process id:** `RipR22Process` — the `<bpmn:process id="…">` and the manifest's `processDefinitionKey` must match exactly, or fixture test 3 fails.
- **Task and lane names:** Dutch, verbatim from the PDF. **Form and document body copy:** English. (R2.1 is inconsistent here — `rip-intake.form` and `rip-approval.form` are English, `rip-overleg-vo.form` and `rip-planning.form` drifted to Dutch. New files follow the English majority.)
- **Form component types:** only `text`, `textarea`, `textfield`, `checkbox`, `datetime`, `select`, `radio`, `button`. These are the eight types R2.1 uses; `checklist` and others are untested in this stack.
- **Form envelope:** every `.form` carries `"e2eFixture": true`, `"schemaVersion": 16`, `"type": "default"`, `"executionPlatform": "Camunda Platform"`, `"executionPlatformVersion": "7.21.0"`, and an `"id"` equal to its `camunda:formRef`.
- **Document envelope:** every `.document` carries `"processKey": "RipR22Process"`, `"serviceId": "RipR22"`, `"schemaVersion": 1`, `"readonly": false`, `"status": "wip"`.
- **Zone keys:** exactly `letterhead`, `reference`, `body`, `closing`, `signOff`, `contactInformation`, `annex`. `signOff` and `contactInformation` are camelCase — the lowercase spellings silently drop their blocks (fixed for R2.1 in `49832d2`).
- **BPMN element order:** all `textAnnotation` and `association` elements come **after** every flow element. `tProcess` is an ordered sequence and Operaton rejects the deployment otherwise. Fixture test 4 guards this.
- **Mirroring:** every file created under `examples/organizations/flevoland/rip-phase-22/` is copied byte-identically into `e2e-fixtures/flevoland/`. Task 2 adds the test that enforces it.
- **Commits:** no `Co-Authored-By:` or `Claude-Session:` trailers.
- **Never** start, stop, or restart a dev server. Deploy verification is manual and belongs to the user.

---

## File Structure

**Renamed:**
- `examples/organizations/flevoland/rip-phase1-swimlanes/` → `examples/organizations/flevoland/rip-phase-21/` (16 files, contents untouched)

**Created — `examples/organizations/flevoland/rip-phase-22/` (15 files):**
- `RipR22Process.bpmn` — the process: 4 lanes, 9 user tasks, 5 parallel gateways, 1 start + 2 end events, 4 annotations
- 9 `.form` files — one per user task, bound by `camunda:formRef`
- 5 `.document` files — one per green "Format …" in the spec

**Created — `e2e-fixtures/flevoland/` (15 files):** byte-identical copies of the above.

**Created — test:**
- `packages/backend/src/example-fixture-parity.test.ts` — asserts the two copies of each mirrored bundle are identical

**Modified:**
- `e2e-fixtures/manifest.json` — new `RipR22Process` entry; `RipR21Process`'s `source` field repointed at the renamed directory
- `packages/frontend/src/changelog.json` — new entry (Task 6 only)

---

## Task 1: Rename R2.1's directory to `rip-phase-21`

**Files:**
- Rename: `examples/organizations/flevoland/rip-phase1-swimlanes/` → `examples/organizations/flevoland/rip-phase-21/`
- Modify: `e2e-fixtures/manifest.json` (the `RipR21Process` entry's `source` field)

**Interfaces:**
- Consumes: nothing.
- Produces: the directory path `examples/organizations/flevoland/rip-phase-21/`, which Task 2's parity test references by name.

- [ ] **Step 1: Confirm nothing resolves the old path at runtime**

Run:
```bash
grep -rn "rip-phase1-swimlanes" --include='*.ts' --include='*.tsx' --include='*.js' packages/*/src
```
Expected: no output. The only reference lives in `manifest.json` (descriptive prose) and in the gitignored `packages/frontend/dist/` build output. If this prints anything under `src/`, stop — the rename is not safe and the plan needs revisiting.

- [ ] **Step 2: Rename the directory**

```bash
git mv examples/organizations/flevoland/rip-phase1-swimlanes examples/organizations/flevoland/rip-phase-21
```

- [ ] **Step 3: Verify git recorded renames, not delete+add**

Run: `git status --porcelain`
Expected: 16 lines all beginning with `R ` (renamed). If they show as `D`/`A` pairs the content changed accidentally — investigate before continuing.

- [ ] **Step 4: Repoint the prose reference**

In `e2e-fixtures/manifest.json`, the `RipR21Process` entry's `source` field currently reads:

```
"merged from examples/organizations/flevoland/rip-phase1-swimlanes/ (BPMN + 5 forms + 3 documents) and examples/organizations/flevoland/rip-phase1/ (7 forms unchanged between drafts); renamed RipPhase1Process -> RipR21Process"
```

Replace with:

```
"authored in examples/organizations/flevoland/rip-phase-21/ (BPMN + 12 forms + 3 documents); process renamed RipPhase1Process -> RipR21Process, directory renamed rip-phase1-swimlanes -> rip-phase-21 once the competing rip-phase1/ draft was deleted"
```


- [ ] **Step 5: Run the fixture tests**

Run:
```bash
npm test --workspace=@linked-data-explorer/backend -- e2e-fixtures
```
Expected: 5 passed. These read `e2e-fixtures/` only, so they should be unaffected — this run proves the manifest edit did not break its JSON.

- [ ] **Step 6: Commit**

```bash
git add examples/organizations/flevoland e2e-fixtures/manifest.json packages/frontend/src/changelog.json
git commit -F - <<'MSG'
refactor: rename rip-phase1-swimlanes to rip-phase-21

The -swimlanes suffix distinguished this bundle from a competing
rip-phase1/ draft that b1b88a8 deleted, so it now distinguishes nothing,
and the directory name no longer matched the process it holds
(RipR21Process). Renaming it makes the incoming R2.2 bundle an obvious
sibling: rip-phase-21/ holds RipR21Process, rip-phase-22/ holds
RipR22Process.

Contents are untouched. The only two references to the old path were
descriptive prose - the source field of the RipR21Process manifest entry
and a changelog entry - and both are repointed here. Nothing resolves
this directory at runtime; the app serves examples from
packages/frontend/public/examples/, which has never held the RIP bundles.
MSG
```

---

## Task 2: Parity test locking `examples/` and `e2e-fixtures/` together

The bundle exists twice on disk by design — authored in `examples/`, imported from `e2e-fixtures/`. Nothing currently stops the copies drifting, and they already have: `49832d2` fixed the zone keys in the `e2e-fixtures/` copies only, and the `examples/` copies stayed broken until a separate manual re-paste in `44d1cb4`. This test closes that gap. It is an addition beyond the spec, justified by that history.

**Files:**
- Create: `packages/backend/src/example-fixture-parity.test.ts`

**Interfaces:**
- Consumes: `examples/organizations/flevoland/rip-phase-21/` from Task 1.
- Produces: the `MIRRORED_BUNDLES` array, which Tasks 3–5 extend with the `rip-phase-22` entry.

- [ ] **Step 1: Write the failing test**

Create `packages/backend/src/example-fixture-parity.test.ts`:

```typescript
import fs from 'fs';
import path from 'path';

const REPO_ROOT = path.join(__dirname, '..', '..', '..');
const EXAMPLES_ROOT = path.join(REPO_ROOT, 'examples', 'organizations');
const FIXTURES_ROOT = path.join(REPO_ROOT, 'e2e-fixtures');

/**
 * Bundles authored under examples/ and mirrored into e2e-fixtures/.
 * examples/ is where a bundle is written; e2e-fixtures/ is what LDE imports
 * and deploys. The two must stay byte-identical - 49832d2 fixed the document
 * zone keys in the fixtures copy alone and the examples copy stayed broken
 * until 44d1cb4 re-pasted it by hand.
 */
const MIRRORED_BUNDLES: Array<{ examples: string; fixtures: string }> = [
  { examples: 'flevoland/rip-phase-21', fixtures: 'flevoland' },
];

describe('examples/ and e2e-fixtures/ copies stay identical', () => {
  for (const bundle of MIRRORED_BUNDLES) {
    describe(bundle.examples, () => {
      const examplesDir = path.join(EXAMPLES_ROOT, ...bundle.examples.split('/'));

      it('has an examples directory with files in it', () => {
        expect(fs.existsSync(examplesDir)).toBe(true);
        expect(fs.readdirSync(examplesDir).length).toBeGreaterThan(0);
      });

      it('mirrors every file into e2e-fixtures byte for byte', () => {
        const files = fs
          .readdirSync(examplesDir)
          .filter((f) => fs.statSync(path.join(examplesDir, f)).isFile());

        const mismatches: string[] = [];
        for (const file of files) {
          const fixturePath = path.join(FIXTURES_ROOT, bundle.fixtures, file);
          if (!fs.existsSync(fixturePath)) {
            mismatches.push(`${file}: missing from e2e-fixtures/${bundle.fixtures}/`);
            continue;
          }
          const a = fs.readFileSync(path.join(examplesDir, file));
          const b = fs.readFileSync(fixturePath);
          if (!a.equals(b)) {
            mismatches.push(`${file}: content differs between examples/ and e2e-fixtures/`);
          }
        }

        expect(mismatches).toEqual([]);
      });
    });
  }
});
```

- [ ] **Step 2: Run it and confirm it passes against R2.1**

Run:
```bash
npm test --workspace=@linked-data-explorer/backend -- example-fixture-parity
```
Expected: 2 passed. All 16 R2.1 files are already identical, so a green run here proves the test reads the right paths rather than proving nothing.

- [ ] **Step 3: Prove the test actually fails when copies drift**

A test that has never gone red is not yet a test. Temporarily corrupt one copy:

```bash
printf '\n' >> e2e-fixtures/flevoland/rip-approval.form
npm test --workspace=@linked-data-explorer/backend -- example-fixture-parity
```
Expected: FAIL, with `rip-approval.form: content differs between examples/ and e2e-fixtures/` in the mismatch array.

- [ ] **Step 4: Restore the file and confirm green again**

```bash
git checkout -- e2e-fixtures/flevoland/rip-approval.form
npm test --workspace=@linked-data-explorer/backend -- example-fixture-parity
```
Expected: 2 passed, and `git status --porcelain` shows no modification to `rip-approval.form`.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/example-fixture-parity.test.ts
git commit -F - <<'MSG'
test: lock examples/ and e2e-fixtures/ bundle copies together

Each RIP bundle exists twice on disk: authored under examples/, imported
and deployed from e2e-fixtures/. Nothing stopped the two drifting, and
they have. 49832d2 repaired the document zone keys in the e2e-fixtures
copies only; the examples copies kept the dead "signoff" / "contactInfo"
keys until 44d1cb4 re-pasted them by hand. Anyone fixing one copy could
silently leave the other wrong again.

This asserts every file in a mirrored bundle is byte-identical to its
twin. New bundles opt in by adding an entry to MIRRORED_BUNDLES.
MSG
```

---

## Task 3: `RipR22Process.bpmn`

**Files:**
- Create: `examples/organizations/flevoland/rip-phase-22/RipR22Process.bpmn`
- Create: `e2e-fixtures/flevoland/RipR22Process.bpmn` (copy)
- Modify: `e2e-fixtures/manifest.json` (new entry)
- Modify: `packages/backend/src/example-fixture-parity.test.ts` (`MIRRORED_BUNDLES`)

**Interfaces:**
- Consumes: `MIRRORED_BUNDLES` from Task 2.
- Produces: the nine `camunda:formRef` values Task 4 creates files for, and the process key `RipR22Process` that Task 5's documents reference in `processKey`.

- [ ] **Step 1: Add the bundle to the parity test and the manifest, and watch both go red**

In `packages/backend/src/example-fixture-parity.test.ts`, extend `MIRRORED_BUNDLES`:

```typescript
const MIRRORED_BUNDLES: Array<{ examples: string; fixtures: string }> = [
  { examples: 'flevoland/rip-phase-21', fixtures: 'flevoland' },
  { examples: 'flevoland/rip-phase-22', fixtures: 'flevoland' },
];
```

In `e2e-fixtures/manifest.json`, append to the `flevoland` array (after the `RipR21Process` entry) the full entry from the spec's Section 5 — `processDefinitionKey`, `bpmn`, all nine `forms`, all five `documents`, and the `source` string. Copy it verbatim; later tasks create the files it names.

Run:
```bash
npm test --workspace=@linked-data-explorer/backend -- e2e-fixtures example-fixture-parity
```
Expected: FAIL. `e2e-fixtures` test 2 reports the fifteen declared files do not exist; the parity test reports the `rip-phase-22` examples directory is missing. This is the red state Tasks 3–5 drive to green.

- [ ] **Step 2: Author the BPMN**

Create `examples/organizations/flevoland/rip-phase-22/RipR22Process.bpmn`.

Open `examples/organizations/flevoland/rip-phase-21/RipR21Process.bpmn` alongside it and follow its structure exactly: the same XML declaration, the same `bpmn:definitions` namespace list (`xsi`, `bpmn`, `bpmndi`, `dc`, `di`, `camunda`, `ronl`), `exporter="Camunda Modeler"`, a `bpmn:collaboration` with one `bpmn:participant` pointing at the process, then the process with its `laneSet`, then the `bpmndi:BPMNDiagram`.

Header values specific to this file:

```xml
<bpmn:definitions ... id="Definitions_RipR22" targetNamespace="http://example.com/rip-phase-22" exporter="Camunda Modeler" exporterVersion="5.45.0">
  <bpmn:collaboration id="Collaboration_RipR22">
    <bpmn:participant id="Participant_RipR22" name="R2.2 - VO" processRef="RipR22Process" />
  </bpmn:collaboration>
  <bpmn:process id="RipR22Process" name="R2.2 - VO" isExecutable="true" camunda:historyTimeToLive="180">
```

**Lanes** — four, in this top-to-bottom order (matching the PDF):

| Lane id | `name` |
|---|---|
| `Lane_Projectleider` | `Projectleider` |
| `Lane_Ontwerper` | `Ontwerper` |
| `Lane_RIPteam_Aandrager_Adviseur` | `RIP-team, Aandrager, Adviseur` |
| `Lane_Omgevingsmanager` | `Omgevingsmanager` |

Each lane lists its members as `<bpmn:flowNodeRef>` children, exactly as R2.1 does.

**User tasks** — nine. Every one is a `<bpmn:userTask>` with `camunda:formRef`, `camunda:formRefBinding="latest"`, and `camunda:candidateGroups`; four of them additionally carry `ronl:documentRef` (see below the table):

| Task id | `name` | Lane | `camunda:formRef` | `camunda:candidateGroups` |
|---|---|---|---|---|
| `Task_UitvoerenConditionerendeOnderzoeken` | `Uitvoeren conditionerende onderzoeken` | `Lane_Projectleider` | `rip-conditionerende-onderzoeken` | `rip-projectleider` |
| `Task_OpstellenConceptVO` | `Opstellen concept VO` | `Lane_Ontwerper` | `rip-concept-vo` | `rip-ontwerper` |
| `Task_OpstellenDefinitiefVO` | `Opstellen definitief VO` | `Lane_Ontwerper` | `rip-definitief-vo` | `rip-ontwerper` |
| `Task_BesprekenConceptVO` | `Bespreken concept VO` | `Lane_RIPteam_Aandrager_Adviseur` | `rip-bespreken-concept-vo` | `rip-team,rip-aandrager,rip-adviseur` |
| `Task_BesprekenKlanteisenKL` | `Bespreken klanteisen en&#10;kabels en leidingen` | `Lane_RIPteam_Aandrager_Adviseur` | `rip-bespreken-klanteisen-kl` | `rip-team,rip-aandrager,rip-adviseur` |
| `Task_VerzamelenKlanteisen` | `Verzamelen klanteisen` | `Lane_Omgevingsmanager` | `rip-verzamelen-klanteisen` | `rip-omgevingsmanager` |
| `Task_InventariserenKabelsLeidingen` | `Inventariseren&#10;kabels en leidingen` | `Lane_Omgevingsmanager` | `rip-inventariseren-kabels-leidingen` | `rip-omgevingsmanager` |
| `Task_AanvragenRaamvergunning` | `Aanvragen raamvergunning` | `Lane_Omgevingsmanager` | `rip-aanvragen-raamvergunning` | `rip-omgevingsmanager` |
| `Task_TerugkoppelenKlanteisen` | `Terugkoppelen klanteisen` | `Lane_Omgevingsmanager` | `rip-terugkoppelen-klanteisen` | `rip-omgevingsmanager` |

`&#10;` is a literal line break in the rendered label — R2.1 uses it the same way for two-line task names.

**`ronl:documentRef`** — four of the nine tasks bind to the document template they produce, exactly as R2.1 does on `Task_AanvullenProjectplan2` (`ronl:documentRef="rip-intake-report"`), `Task_AanvullenProjectplan4` (`rip-pdp`) and `Task_UitvoerenPSU` (`rip-psu-report`). This is what renders the document badge on the task in the Modeler; without it Task 5's templates import but attach to nothing. The attribute is **single-valued** — `DocumentTemplateSelector.tsx` writes one id and `BpmnCanvas.tsx` reads a scalar — so only one template per task, and the value is the bare template id with **no `.document` suffix**:

| Task id | `ronl:documentRef` |
|---|---|
| `Task_VerzamelenKlanteisen` | `rip-kes` |
| `Task_OpstellenConceptVO` | `rip-ontwerptoelichting` |
| `Task_BesprekenConceptVO` | `rip-bevindingenformulier` |
| `Task_OpstellenDefinitiefVO` | `rip-hoeveelheidsbepaling` |

The fifth template, `rip-objectenboom`, is deliberately left unattached: it is the "Format objectenboom (Relatics)" artifact, maintained in Relatics rather than authored in this process. Do not attach it to any task.

**Events and gateways:**

| Element | Type | `name` |
|---|---|---|
| `StartEvent_R22` | `bpmn:startEvent` | `Start R2.2 - VO&#10;(vanuit R2.1)` |
| `Gateway_UitgangspuntenSplit` | `bpmn:parallelGateway` | *(none)* |
| `Gateway_UitgangspuntenJoin` | `bpmn:parallelGateway` | *(none)* |
| `Gateway_BesprekenSplit` | `bpmn:parallelGateway` | *(none)* |
| `Gateway_BesprekenJoin` | `bpmn:parallelGateway` | *(none)* |
| `Gateway_AfrondingSplit` | `bpmn:parallelGateway` | *(none)* |
| `EndEvent_KlanteisenTeruggekoppeld` | `bpmn:endEvent` | `Klanteisen teruggekoppeld` |
| `EndEvent_VOGereed` | `bpmn:endEvent` | `VO gereed&#10;→ R2.3 Opstellen VO-raming` |

**Sequence flows** — twenty-one. Give each an `id` of the form `Flow_<From>_<To>`:

| From | To |
|---|---|
| `StartEvent_R22` | `Gateway_UitgangspuntenSplit` |
| `Gateway_UitgangspuntenSplit` | `Task_UitvoerenConditionerendeOnderzoeken` |
| `Gateway_UitgangspuntenSplit` | `Task_OpstellenConceptVO` |
| `Gateway_UitgangspuntenSplit` | `Task_VerzamelenKlanteisen` |
| `Gateway_UitgangspuntenSplit` | `Task_InventariserenKabelsLeidingen` |
| `Gateway_UitgangspuntenSplit` | `Task_AanvragenRaamvergunning` |
| `Task_UitvoerenConditionerendeOnderzoeken` | `Gateway_UitgangspuntenJoin` |
| `Task_OpstellenConceptVO` | `Gateway_UitgangspuntenJoin` |
| `Task_VerzamelenKlanteisen` | `Gateway_UitgangspuntenJoin` |
| `Task_InventariserenKabelsLeidingen` | `Gateway_UitgangspuntenJoin` |
| `Task_AanvragenRaamvergunning` | `Gateway_UitgangspuntenJoin` |
| `Gateway_UitgangspuntenJoin` | `Gateway_BesprekenSplit` |
| `Gateway_BesprekenSplit` | `Task_BesprekenConceptVO` |
| `Gateway_BesprekenSplit` | `Task_BesprekenKlanteisenKL` |
| `Task_BesprekenConceptVO` | `Gateway_BesprekenJoin` |
| `Task_BesprekenKlanteisenKL` | `Gateway_BesprekenJoin` |
| `Gateway_BesprekenJoin` | `Gateway_AfrondingSplit` |
| `Gateway_AfrondingSplit` | `Task_TerugkoppelenKlanteisen` |
| `Gateway_AfrondingSplit` | `Task_OpstellenDefinitiefVO` |
| `Task_TerugkoppelenKlanteisen` | `EndEvent_KlanteisenTeruggekoppeld` |
| `Task_OpstellenDefinitiefVO` | `EndEvent_VOGereed` |

All five branches out of `Gateway_UitgangspuntenSplit` return to `Gateway_UitgangspuntenJoin`. The PDF does not draw it that way — it shows *Inventariseren kabels en leidingen* and *Aanvragen raamvergunning* leaving the pool into CO1 and JU3.5 and never returning. Modelled literally that is a five-way split with three returning branches, which deadlocks at the join and never completes. The hand-offs are annotations instead, so all five branches return. This divergence is deliberate and is recorded in the spec.

Every task and gateway needs matching `<bpmn:incoming>` / `<bpmn:outgoing>` children naming these flow ids.

**Annotations** — four, emitted **after every flow element**, each with an association:

| `textAnnotation` id | Text | Associated with |
|---|---|---|
| `Annotation_JU35` | `JU3.5 Aanvragen vergunning (Omgevingsloket)` | `Task_AanvragenRaamvergunning` |
| `Annotation_CO1_Knelpunten_KL` | `CO1. Uitvoeren knelpuntenanalyse` | `Task_InventariserenKabelsLeidingen` |
| `Annotation_CO1_Knelpunten_Bespreken` | `CO1. Uitvoeren knelpuntenanalyse` | `Task_BesprekenKlanteisenKL` |
| `Annotation_CO1_Netbeheerder` | `CO1. Voeren overleg netbeheerder` | `Task_OpstellenDefinitiefVO` |

Shape:

```xml
<bpmn:textAnnotation id="Annotation_JU35">
  <bpmn:text>JU3.5 Aanvragen vergunning (Omgevingsloket)</bpmn:text>
</bpmn:textAnnotation>
<bpmn:association id="Association_JU35" sourceRef="Task_AanvragenRaamvergunning" targetRef="Annotation_JU35" />
```

**Diagram section:** every element above needs a `bpmndi:BPMNShape` (or `BPMNEdge`) with `dc:Bounds` / `di:waypoint`. Lay the four lanes out top to bottom in the PDF's order and place tasks left to right in flow order, following R2.1's coordinate conventions (lane height ~180, task 100×80). Exact pixel values do not matter; what matters is that every `bpmnElement` referenced in the DI exists in the process, and every flow element has a shape — otherwise the diagram renders blank in LDE.

- [ ] **Step 3: Mirror into e2e-fixtures**

```bash
cp examples/organizations/flevoland/rip-phase-22/RipR22Process.bpmn e2e-fixtures/flevoland/RipR22Process.bpmn
```

- [ ] **Step 4: Run the fixture and parity tests**

Run:
```bash
npm test --workspace=@linked-data-explorer/backend -- e2e-fixtures example-fixture-parity
```
Expected: the parity tests pass (the one file is mirrored). The `e2e-fixtures` suite still fails test 2 on the fourteen missing forms and documents — that is correct at this stage. Tests 3 and 4 must now **pass**: test 3 confirms `<bpmn:process id="RipR22Process">` matches the manifest key, test 4 confirms the annotations follow the flow elements. If either of those fails, fix the BPMN before continuing.

- [ ] **Step 5: Validate the XML parses**

Run:
```bash
node -e "const x=require('fs').readFileSync('e2e-fixtures/flevoland/RipR22Process.bpmn','utf8'); const ids=[...x.matchAll(/\bid=\"([^\"]+)\"/g)].map(m=>m[1]); const dup=ids.filter((v,i)=>ids.indexOf(v)!==i); console.log('elements:',ids.length,'duplicate ids:',dup)"
```
Expected: a non-zero element count and `duplicate ids: []`. Duplicate ids are the most common hand-authoring mistake and Operaton rejects them at deploy time.

- [ ] **Step 6: Commit**

```bash
git add examples/organizations/flevoland/rip-phase-22/RipR22Process.bpmn \
        e2e-fixtures/flevoland/RipR22Process.bpmn \
        e2e-fixtures/manifest.json \
        packages/backend/src/example-fixture-parity.test.ts
git commit -F - <<'MSG'
feat: add RipR22Process (R2.2 - VO) process definition

Four lanes and nine user tasks from R2_2 - VO.pdf (rev. 21-11-2024),
picking up where RipR21Process's "Fase 1 voltooid -> R2.2" end event
left off.

All five branches of the opening parallel split rejoin the join
gateway. The PDF does not draw it that way - it shows Inventariseren
kabels en leidingen and Aanvragen raamvergunning leaving the pool into
CO1 and JU3.5 and never coming back, which as control flow deadlocks at
the join. Those hand-offs are textAnnotations instead: CO1 and JU3.5 do
not exist as fixtures, so a callActivity would dangle at deploy time and
fail the manifest's calledElement test. They are referenced by several
phases and belong in a shared bundle of their own.

The manifest entry declares the nine forms and five documents that
follow in subsequent commits, so the fixture suite's file-existence test
stays red until the bundle is complete.
MSG
```

---

## Task 4: The nine forms

**Files:**
- Create: nine `.form` files in `examples/organizations/flevoland/rip-phase-22/`
- Create: nine copies in `e2e-fixtures/flevoland/`

**Interfaces:**
- Consumes: the nine `camunda:formRef` values from Task 3.
- Produces: the process variable keys listed below. Task 5's document `bindings[]` reference `klanteisen`, `conditionerendeOnderzoeken`, `knelpuntenanalyse`, `conceptVoReferentie` and `voReferentie` from this set.

- [ ] **Step 1: Write the first form as the worked example**

Create `examples/organizations/flevoland/rip-phase-22/rip-conditionerende-onderzoeken.form`. Every other form in this task uses this exact envelope — only `id` and the `components` array change.

```json
{
  "e2eFixture": true,
  "schemaVersion": 16,
  "type": "default",
  "id": "rip-conditionerende-onderzoeken",
  "executionPlatform": "Camunda Platform",
  "executionPlatformVersion": "7.21.0",
  "components": [
    {
      "id": "Text_Header",
      "type": "text",
      "text": "# Conditioning studies"
    },
    {
      "id": "Text_Intro",
      "type": "text",
      "text": "Record which conditioning studies were carried out for this project and what they found. The design team needs these results before the draft VO can be finalised."
    },
    {
      "id": "Field_OnderzoekBodem",
      "type": "checkbox",
      "label": "Soil survey (bodemonderzoek) completed",
      "key": "conditionerendOnderzoekBodem"
    },
    {
      "id": "Field_OnderzoekArcheologie",
      "type": "checkbox",
      "label": "Archaeological survey completed",
      "key": "conditionerendOnderzoekArcheologie"
    },
    {
      "id": "Field_OnderzoekEcologie",
      "type": "checkbox",
      "label": "Ecological survey completed",
      "key": "conditionerendOnderzoekEcologie"
    },
    {
      "id": "Field_OnderzoekWater",
      "type": "checkbox",
      "label": "Water and soil balance study completed",
      "key": "conditionerendOnderzoekWater"
    },
    {
      "id": "Field_OnderzoekNge",
      "type": "checkbox",
      "label": "Unexploded ordnance (NGE) survey completed",
      "key": "conditionerendOnderzoekNge"
    },
    {
      "id": "Field_Bevindingen",
      "type": "textarea",
      "label": "Findings",
      "key": "conditionerendeOnderzoeken",
      "description": "Summarise what the studies found and any constraint this places on the design.",
      "validate": { "required": true }
    },
    {
      "id": "Field_Afgerond",
      "type": "datetime",
      "label": "Studies completed on",
      "key": "conditionerendeOnderzoekenAfgerond",
      "validate": { "required": true }
    },
    {
      "id": "Button_Submit",
      "type": "button",
      "label": "Submit",
      "action": "submit"
    }
  ]
}
```

- [ ] **Step 2: Write the remaining eight forms**

Same envelope, same `Text_Header` / `Text_Intro` / `Button_Submit` pattern. Field specs:

**`rip-concept-vo.form`** — header `# Draft preliminary design (concept VO)`

| Component id | type | label | key | required |
|---|---|---|---|---|
| `Field_ConceptVoReferentie` | textfield | Draft VO reference | `conceptVoReferentie` | yes |
| `Field_Ontwerptoelichting` | textarea | Design rationale | `ontwerptoelichtingSamenvatting` | yes |
| `Field_ObjectenboomReferentie` | textfield | Object tree reference (Relatics) | `objectenboomReferentie` | no |
| `Field_VariantenafwegingUitgevoerd` | checkbox | A variant trade-off (variantenafweging) was carried out | `variantenafwegingUitgevoerd` | no |
| `Field_LccRamingReferentie` | textfield | LCC estimate reference | `lccRamingReferentie` | no |

`Field_LccRamingReferentie` carries `"description": "Required only when a variant trade-off was carried out."` — this is how the spec's conditional "LCC-raming (indien variantenafweging)" is represented, rather than as a separate artifact.

**`rip-definitief-vo.form`** — header `# Final preliminary design (definitief VO)`

| Component id | type | label | key | required |
|---|---|---|---|---|
| `Field_VoReferentie` | textfield | Final VO reference | `voReferentie` | yes |
| `Field_HoeveelheidsbepalingReferentie` | textfield | Quantity determination reference | `hoeveelheidsbepalingReferentie` | yes |
| `Field_VerwerkteBevindingen` | textarea | How review findings were incorporated | `verwerkteBevindingen` | yes |
| `Field_VoVastgesteldOp` | datetime | VO adopted on | `voVastgesteldOp` | yes |

**`rip-bespreken-concept-vo.form`** — header `# Review meeting — draft VO`

| Component id | type | label | key | required |
|---|---|---|---|---|
| `Field_BesprekingDatum` | datetime | Meeting date and time | `conceptVoBesprekingDatum` | yes |
| `Field_Deelnemers` | textarea | Attendees | `conceptVoBesprekingDeelnemers` | yes |
| `Field_Bevindingen` | textarea | Findings | `conceptVoBevindingen` | yes |
| `Field_BevindingenformulierReferentie` | textfield | Findings form reference | `bevindingenformulierReferentie` | no |

**`rip-bespreken-klanteisen-kl.form`** — header `# Review meeting — client requirements, cables and pipes`

| Component id | type | label | key | required |
|---|---|---|---|---|
| `Field_BesprekingDatum` | datetime | Meeting date and time | `klanteisenBesprekingDatum` | yes |
| `Field_Deelnemers` | textarea | Attendees | `klanteisenBesprekingDeelnemers` | yes |
| `Field_KnelpuntCategorie` | select | Bottleneck category agreed | `knelpuntCategorie` | yes |
| `Field_Knelpuntenanalyse` | textarea | Bottleneck analysis | `knelpuntenanalyse` | yes |

`Field_KnelpuntCategorie` values:

```json
"values": [
  { "label": "Category 1 — no relocation needed", "value": "cat1" },
  { "label": "Category 2 — relocation within project scope", "value": "cat2" },
  { "label": "Category 3 — relocation requires a separate agreement", "value": "cat3" }
]
```

**`rip-verzamelen-klanteisen.form`** — header `# Collect client requirements (klanteisen)`

| Component id | type | label | key | required |
|---|---|---|---|---|
| `Field_Stakeholder` | textfield | Stakeholder | `klanteisStakeholder` | yes |
| `Field_Klanteisen` | textarea | Requirements | `klanteisen` | yes |
| `Field_KesReferentie` | textfield | KES reference | `kesReferentie` | yes |
| `Field_Prioriteit` | select | Priority | `klanteisPrioriteit` | no |

`Field_Prioriteit` values:

```json
"values": [
  { "label": "Must have", "value": "must" },
  { "label": "Should have", "value": "should" },
  { "label": "Could have", "value": "could" },
  { "label": "Won't have this phase", "value": "wont" }
]
```

**`rip-inventariseren-kabels-leidingen.form`** — header `# Inventory of cables and pipes`

| Component id | type | label | key | required |
|---|---|---|---|---|
| `Field_KlicMelding` | textfield | Klic notification reference | `klicMeldingReferentie` | yes |
| `Field_IassetGeraadpleegd` | checkbox | iAsset consulted | `iassetGeraadpleegd` | no |
| `Field_Bevindingen` | textarea | Cables and pipes found | `kabelsLeidingenBevindingen` | yes |
| `Field_NetbeheerderContact` | textfield | Network operator contact | `netbeheerderContact` | no |

`klicMeldingReferentie` is written **only here**. `rip-concept-vo.form` deliberately does not also collect it — two forms writing one process variable makes the last task to run silently win.

**`rip-aanvragen-raamvergunning.form`** — header `# Apply for framework permit (raamvergunning)`

| Component id | type | label | key | required |
|---|---|---|---|---|
| `Field_VergunningType` | select | Permit type | `raamvergunningType` | yes |
| `Field_IngediendOp` | datetime | Submitted on | `raamvergunningIngediendOp` | yes |
| `Field_OmgevingsloketReferentie` | textfield | Omgevingsloket reference | `omgevingsloketReferentie` | yes |
| `Field_Toelichting` | textarea | Notes | `raamvergunningToelichting` | no |

`Field_VergunningType` values:

```json
"values": [
  { "label": "Omgevingsvergunning", "value": "omgevingsvergunning" },
  { "label": "Watervergunning", "value": "watervergunning" },
  { "label": "Ontheffing", "value": "ontheffing" },
  { "label": "Other", "value": "overig" }
]
```

**`rip-terugkoppelen-klanteisen.form`** — header `# Feed back client requirements`

| Component id | type | label | key | required |
|---|---|---|---|---|
| `Field_Gehonoreerd` | textarea | Requirements honoured | `klanteisenGehonoreerd` | yes |
| `Field_Afgewezen` | textarea | Requirements declined, with reason | `klanteisenAfgewezen` | no |
| `Field_TeruggekoppeldOp` | datetime | Fed back to stakeholders on | `klanteisenTeruggekoppeldOp` | yes |

- [ ] **Step 3: Verify every form's `id` matches its `formRef`**

Run:
```bash
node -e "
const fs=require('fs'),p='examples/organizations/flevoland/rip-phase-22';
const bpmn=fs.readFileSync(p+'/RipR22Process.bpmn','utf8');
const refs=[...bpmn.matchAll(/camunda:formRef=\"([^\"]+)\"/g)].map(m=>m[1]).sort();
const ids=fs.readdirSync(p).filter(f=>f.endsWith('.form')).map(f=>JSON.parse(fs.readFileSync(p+'/'+f,'utf8')).id).sort();
console.log('refs   :',refs.join(','));
console.log('formIds:',ids.join(','));
console.log('match  :',JSON.stringify(refs)===JSON.stringify(ids));
"
```
Expected: `match : true` and nine entries in each list. A mismatch means a task would open a blank form at runtime.

- [ ] **Step 4: Mirror into e2e-fixtures**

```bash
cp examples/organizations/flevoland/rip-phase-22/*.form e2e-fixtures/flevoland/
```

- [ ] **Step 5: Run the tests**

Run:
```bash
npm test --workspace=@linked-data-explorer/backend -- e2e-fixtures example-fixture-parity
```
Expected: parity passes; the `e2e-fixtures` file-existence test still fails, now naming only the five missing `.document` files.

- [ ] **Step 6: Commit**

```bash
git add examples/organizations/flevoland/rip-phase-22 e2e-fixtures/flevoland
git commit -F - <<'MSG'
feat: add the nine R2.2 user task forms

One form per user task in RipR22Process, bound by camunda:formRef.
Field types stay inside the eight the R2.1 bundle already uses - text,
textarea, textfield, checkbox, datetime, select, radio, button - since
nothing else is exercised against this Camunda 7.21 stack.

The spec's conditional "LCC-raming (indien variantenafweging)" is a
checkbox plus a reference field on rip-concept-vo.form rather than an
artifact of its own; it only exists when a variant trade-off happened.

klicMeldingReferentie is collected only on
rip-inventariseren-kabels-leidingen.form. The concept VO task reads the
same information but does not also write it - two forms writing one
process variable means whichever task completes last silently wins.
MSG
```

---

## Task 5: The five document templates

**Files:**
- Create: five `.document` files in `examples/organizations/flevoland/rip-phase-22/`
- Create: five copies in `e2e-fixtures/flevoland/`

**Interfaces:**
- Consumes: process variable keys from Task 4; the process key `RipR22Process` from Task 3.
- Produces: the completed bundle — after this task the manifest declares nothing that does not exist.

- [ ] **Step 1: Write the first document as the worked example**

Create `examples/organizations/flevoland/rip-phase-22/rip-kes.document`. Open `examples/organizations/flevoland/rip-phase-21/rip-pdp.document` beside it — the zone and block structure is identical, only the copy differs.

The skeleton below is **annotated, not literal**: the `/* … */` notes are instructions, and JSON has no comments. Replace each one with the blocks it names before saving, or the file will not parse.

```json
{
  "id": "rip-kes",
  "name": "RIP — Client Requirements Specification (KES)",
  "description": "Format KES. Records the requirements collected from stakeholders during the VO phase, their priority, and how each was handled.",
  "processKey": "RipR22Process",
  "serviceId": "RipR22",
  "schemaVersion": 1,
  "readonly": false,
  "status": "wip",
  "createdAt": "2026-08-26T00:00:00.000Z",
  "updatedAt": "2026-08-26T00:00:00.000Z",
  "assets": [],
  "bindings": [
    { "id": "b1", "placeholder": "{{projectNumber}}", "variableKey": "projectNumber", "source": "process", "label": "Project number" },
    { "id": "b2", "placeholder": "{{projectName}}", "variableKey": "projectName", "source": "process", "label": "Project name" },
    { "id": "b3", "placeholder": "{{projectType}}", "variableKey": "projectType", "source": "process", "label": "Project type" },
    { "id": "b4", "placeholder": "{{klanteisen}}", "variableKey": "klanteisen", "source": "process", "label": "Client requirements" },
    { "id": "b5", "placeholder": "{{kesReferentie}}", "variableKey": "kesReferentie", "source": "process", "label": "KES reference" }
  ],
  "zones": {
    "letterhead": { "blocks": [ /* copy the letterhead block from rip-pdp.document verbatim - same province header */ ] },
    "reference": { "blocks": [ /* project number / name / date, using {{projectNumber}} and {{projectName}} */ ] },
    "body": { "blocks": [ /* see body copy below */ ] },
    "closing": { "blocks": [] },
    "signOff": { "blocks": [ /* copy the three signature lines from rip-pdp.document */ ] },
    "contactInformation": { "blocks": [] },
    "annex": { "blocks": [] }
  }
}
```

Blocks are TipTap doc JSON — `{ "id": "…", "type": "text", "label": "…", "content": { "type": "doc", "content": [ … ] } }`. Copy the exact shape from `rip-pdp.document`; do not invent a different block schema.

The `body` zone for `rip-kes` holds one block, `id: "kes1"`, `label: "Client requirements"`, whose content is a level-2 heading followed by two paragraphs:

> **Client requirements specification**
>
> This specification records every requirement raised by stakeholders during the VO phase of project {{projectNumber}} — {{projectName}}, together with its priority and how it was handled. It is maintained under reference {{kesReferentie}}.
>
> Requirements collected to date: {{klanteisen}}. Each is fed back to the stakeholder who raised it, whether or not it was honoured, once the design has been discussed.

Placeholders appear as plain text inside `{ "type": "text", "text": "…" }` nodes — the binding table maps them to process variables at render time.

- [ ] **Step 2: Write the remaining four documents**

Same envelope. `id`, `name`, `description`, `bindings` and body copy per this table; `letterhead` and `signOff` blocks are copied from `rip-pdp.document` in all five.

| File | `id` | `name` | Extra bindings beyond `projectNumber` / `projectName` / `projectType` | Body copy |
|---|---|---|---|---|
| `rip-ontwerptoelichting.document` | `rip-ontwerptoelichting` | `RIP — Design Rationale (Ontwerptoelichting)` | `{{vastgesteldProjectplan}}`, `{{conceptVoReferentie}}`, `{{voReferentie}}`, `{{conditionerendeOnderzoeken}}` | Heading "Design rationale"; paragraphs explaining the design choices behind the VO, the starting points adopted in the project plan, the constraints the conditioning studies imposed, and any variants considered |
| `rip-objectenboom.document` | `rip-objectenboom` | `RIP — Object Tree (Objectenboom)` | `{{objectenboomReferentie}}` | Heading "Object tree"; paragraph stating the decomposition is maintained in Relatics at `{{objectenboomReferentie}}` and this document records the subsystem-level snapshot agreed for the VO |
| `rip-bevindingenformulier.document` | `rip-bevindingenformulier` | `RIP — Review Findings Form (Bevindingenformulier)` | `{{conceptVoBevindingen}}`, `{{verwerkteBevindingen}}`, `{{knelpuntenanalyse}}` | Heading "Review findings"; a paragraph per finding recording what was raised on the draft VO, by whom, and how it was resolved, plus the bottleneck analysis agreed for cables and pipes |
| `rip-hoeveelheidsbepaling.document` | `rip-hoeveelheidsbepaling` | `RIP — Quantity Determination (Hoeveelheidsbepaling)` | `{{hoeveelheidsbepalingReferentie}}`, `{{voReferentie}}` | Heading "Quantity determination"; paragraph stating the quantities derive from the final VO and feed the R2.3 VO estimate |

`vastgesteldProjectplan` is the one binding no R2.2 form writes — the spec carries it in from R2.1 as the adopted project plan the VO starts from. Since chaining R2.1 to R2.2 at runtime is out of scope, it resolves to nothing until that separate change lands. Bind it anyway: the template is correct about where the value comes from, and an unbound placeholder would have to be added later by editing every copy of the document.

- [ ] **Step 3: Verify the envelope and zone keys on all five**

Run:
```bash
node -e "
const fs=require('fs'),p='examples/organizations/flevoland/rip-phase-22';
const want=['letterhead','reference','body','closing','signOff','contactInformation','annex'];
for(const f of fs.readdirSync(p).filter(f=>f.endsWith('.document'))){
  const d=JSON.parse(fs.readFileSync(p+'/'+f,'utf8'));
  const zones=Object.keys(d.zones);
  const missing=want.filter(z=>!zones.includes(z));
  const extra=zones.filter(z=>!want.includes(z));
  console.log(f, '| processKey:', d.processKey, '| serviceId:', d.serviceId, '| missing:', missing, '| extra:', extra);
}
"
```
Expected: five lines, each `processKey: RipR22Process`, `serviceId: RipR22`, `missing: []`, `extra: []`. Any `extra` naming `signoff` or `contactInfo` is the R2.1 bug reappearing — fix the spelling.

- [ ] **Step 4: Mirror into e2e-fixtures**

```bash
cp examples/organizations/flevoland/rip-phase-22/*.document e2e-fixtures/flevoland/
```

- [ ] **Step 5: Run the full fixture and parity suites — this is the green gate**

Run:
```bash
npm test --workspace=@linked-data-explorer/backend -- e2e-fixtures example-fixture-parity
```
Expected: **all 7 tests pass** (5 fixture + 2 parity). This is the first point at which the manifest declares nothing missing. If test 2 still names a file, the filename in the manifest and the file on disk disagree.

- [ ] **Step 6: Commit**

```bash
git add examples/organizations/flevoland/rip-phase-22 e2e-fixtures/flevoland
git commit -F - <<'MSG'
feat: add the five R2.2 document templates

One per green "Format ..." in R2_2 - VO.pdf: KES, Ontwerptoelichting,
Objectenboom, Bevindingenformulier and Hoeveelheidsbepaling. A Format in
the diagram and a .document in LDE are the same thing - a template with
bindings - so the mapping is direct, and the blue outputs beside them in
the spec are instances of these rather than artifacts of their own.

Zone keys are signOff and contactInformation, camelCase, from the start.
R2.1's templates shipped with "signoff" and "contactInfo", which are not
the keys DocumentZones declares, so their signature blocks never
rendered at all until 49832d2.

This completes the bundle: the manifest now declares nothing that does
not exist, and the fixture suite is green.
MSG
```

---

## Task 6: Changelog and full verification

**Files:**
- Modify: `packages/frontend/src/changelog.json`

**Interfaces:**
- Consumes: the complete bundle from Tasks 3–5.
- Produces: nothing downstream — this is the closing task.

- [ ] **Step 1: Add the changelog entry**

Open `packages/frontend/src/changelog.json` and follow the shape of the existing entries exactly (same keys, same date format, newest first). Add an entry recording: the R2.2 bundle (`RipR22Process`, nine forms, five documents), the `rip-phase1-swimlanes` → `rip-phase-21` rename, and the new `examples/` ↔ `e2e-fixtures/` parity test.

- [ ] **Step 2: Run the full backend suite**

Run:
```bash
npm test --workspace=@linked-data-explorer/backend
```
Expected: all suites pass. Use the workspace script, **not** a bare `npx jest` from the repo root — the root invocation ignores `packages/backend/jest.config.js` and can report a false pass.

- [ ] **Step 3: Run the full frontend suite**

Run:
```bash
npm test --workspace=@linked-data-explorer/frontend
```
Expected: all suites pass. `changelog.json` is imported by the frontend, so a malformed edit surfaces here.

- [ ] **Step 4: Lint and format**

Run:
```bash
npm run lint
npm run check-format
```
Expected: both clean across both workspaces. The pre-push hook runs these anyway, so a failure here blocks the push.

- [ ] **Step 5: Confirm the working tree holds what it should**

Run:
```bash
git status --porcelain
ls examples/organizations/flevoland/rip-phase-22 | wc -l
ls examples/organizations/flevoland/rip-phase-21 | wc -l
```
Expected: only `changelog.json` modified; `15` files in `rip-phase-22`; `16` in `rip-phase-21`.

- [ ] **Step 6: Commit**

```bash
git add packages/frontend/src/changelog.json
git commit -F - <<'MSG'
docs: changelog for the R2.2 - VO bundle

Records the RipR22Process bundle, the rip-phase1-swimlanes ->
rip-phase-21 rename, and the parity test now holding the examples/ and
e2e-fixtures/ copies of each bundle together.
MSG
```

- [ ] **Step 7: Hand off for deploy verification**

Do **not** start, restart, or drive a server. Report to the user that the bundle is ready and ask them to import `RipR22Process` in their running LDE and deploy it to Operaton, confirming that the diagram renders with four lanes, that each of the nine tasks opens its form, and that the five document templates appear with their signature blocks visible — the last being what the R2.1 zone-key bug broke.

---

## Notes for the executor

- **Where the bundle is read from.** `examples/` is where artifacts are authored; `e2e-fixtures/` plus `manifest.json` is what LDE actually imports and deploys. A file that exists only in `examples/` does nothing. The parity test from Task 2 fails loudly if you forget to mirror.
- **The manifest goes red on purpose.** Task 3 declares all fifteen files up front, so the file-existence test stays red through Tasks 3 and 4 and turns green only at the end of Task 5. A red run in the middle of this plan is the expected state, not a defect.
- **BPMN element order is not stylistic.** Annotations after flow elements, always. Operaton validates against the XSD at deploy time and rejects the entire deployment, not just the offending element.
- **Do not "fix" R2.1 while you are in there.** The rip-phase-21 files are correct as of `49832d2` and `44d1cb4`. Changes to them belong in their own commit with their own reasoning.
