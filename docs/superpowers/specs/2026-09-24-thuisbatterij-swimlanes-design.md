# Thuisbatterij subsidy processes in swimlanes — design

Date: 2026-09-24
Branch: `feat/thuisbatterij-swimlanes` (linked-data-explorer), companion
`fix/thuisbatterij-dutch-task-names` (ronl-business-api)

## Why

Since the RIPx.y deployment for the Infra-board, the application administrator
requires every process to be modelled in swimlanes. The Thuisbatterij subsidy
bundle predates that: its main process and its called decision subprocess have
no pool and no lanes. Nothing in LDE enforces the rule; it is an administrative
requirement, and the RIP bundles are the reference for how lanes are drawn.

## Source of truth

- `packages/frontend/public/examples/flevoland/ThuisbatterijSubsidieAanvraagProcess.bpmn` (main)
- `packages/frontend/public/examples/flevoland/ThuisbatterijSubsidieDecisionSubProcess.bpmn` (subprocess)

Their e2e copies in `e2e-fixtures/flevoland/` follow, as
`public-example-fixture-parity.test.ts` requires. The drifted pair in
`examples/organizations/flevoland/thuisbatterij/` (`-main.bpmn`,
`-subprocess.bpmn`) is **out of scope** and stays untouched.

## Decisions

| # | Decision |
|---|---|
| 1 | Hierarchy stays: two separately deployable processes, each with its **own pool and lanes**. The call activity remains. |
| 2 | Lanes are **Aanvrager, Behandelaar, Systeem**, top to bottom. A lane with no nodes is omitted. |
| 3 | User tasks keep `camunda:candidateGroups="caseworker"`. No new Keycloak role, board ownership unchanged (caseworker board). |
| 4 | In scope beyond lanes: **Dutch element names** in both processes, and a **real form for "Aanvullende gegevens opvragen"**. |
| 5 | The new form is **Dutch**, and the step stays **one user task with one form**. |
| 6 | ronl-business-api's Thuisbatterij journey gets a **companion PR** whose task-name regexes match both the old English and the new Dutch names. |
| 7 | The `changelog.json` entry is written by `/bump-release`, as for every other change in this repo. |

## Structure (both files)

Follows the RIP skeleton (`docs/superpowers/specs/2026-08-26-rip-r22-vo-bundle-design.md`):

- `bpmn:collaboration` with one `bpmn:participant`, whose `name` equals the
  process name and whose `processRef` points at the process.
- One `bpmn:laneSet` in `bpmn:process`, in the order the XSD's `tProcess`
  prescribes: `bpmn:documentation`, then `laneSet`, then flow elements (tasks,
  events, gateways, sequence flows), then artifacts (`textAnnotation`,
  `association`) last. Operaton validates against the XSD and rejects the
  deployment on a wrong order.
- Every flow node listed in exactly one lane via `bpmn:flowNodeRef`.
- `BPMNPlane bpmnElement` points at the collaboration; the participant and each
  lane get a `BPMNShape isHorizontal="true"`; the diagram is re-laid out so
  every node's bounds fall inside its lane.
- Ids: `Collaboration_Thuisbatterij_Main` / `Participant_Thuisbatterij_Main`,
  `Collaboration_Thuisbatterij_Sub` / `Participant_Thuisbatterij_Sub`,
  `LaneSet_Thuisbatterij_Main` / `_Sub`, lanes `Lane_Aanvrager`,
  `Lane_Behandelaar`, `Lane_Systeem` (lane ids are per-file, so reuse across
  the two files is fine). In the e2e subprocess copy the process key carries the
  `E2E` suffix as today; the collaboration and lane ids do not contain the key
  and need no suffix.

Lane assignment rule: user tasks and the call activity → Behandelaar; script
and DMN tasks → Systeem; a gateway → the lane of the step that sets the variable
it tests; events → the lane of the first/last actor.

### Main process

| Lane | Nodes |
|---|---|
| Aanvrager | `StartEvent_AWB` |
| Behandelaar | `Task_RequestMissingInfo`, `Gateway_StillIncomplete`, `Task_Phase45_Process` (call activity), `Task_Phase6_Notify` |
| Systeem | `Task_Phase1_Identity`, `Task_Phase2_Receipt`, `Task_Phase3_Completeness`, `Gateway_Complete`, `Task_RefuseToProcess`, `Gateway_Payment`, `Task_Phase7_Payment`, `Gateway_Chain`, `Task_Phase8_Forward`, `Task_ArchivesDMN`, `Task_ArchiveRecord`, `EndEvent_AWB` |

### Subprocess

| Lane | Nodes |
|---|---|
| Behandelaar | `Sub_CaseReview` |
| Systeem | `SubStart`, `Sub_PrepareDmnInput`, `Sub_AssessRight`, `Sub_InterpretRight`, `Sub_EligibleGateway`, `Sub_CalculateAmount`, `Sub_ExtractAmount`, `Sub_ResolveDecision`, `Sub_FinalGateway`, `Sub_SetGranted`, `Sub_SetRejected`, `SubEnd` |

No Aanvrager lane in the subprocess.

## Dutch names

Element ids do not change. Names already Dutch stay. Awb article references are
carried over verbatim.

| Element | New name |
|---|---|
| main process / pool | Subsidie Thuisbatterij Flevoland - Hoofdproces |
| `Task_Phase1_Identity` | Fase 1: Rechtsbetrekking vaststellen (identificatie) |
| `Task_Phase2_Receipt` | Fase 2: Ontvangstbevestiging aanvraag (Awb 4:1) |
| `Task_Phase3_Completeness` | Fase 3: Ontvankelijkheidstoets (Awb 2:3) |
| `Gateway_Complete` | Aanvraag volledig? |
| `Task_RequestMissingInfo` | Aanvullende gegevens opvragen (Awb 4:5) |
| `Gateway_StillIncomplete` | Aanvulling ontvangen? |
| `Task_RefuseToProcess` | Aanvraag buiten behandeling stellen (Awb 4:5 lid 2) |
| `Task_Phase45_Process` | Fase 4+5: Beoordeling recht en hoogte subsidie |
| `Task_Phase6_Notify` | Fase 6: Aanvrager informeren over besluit (Awb 3:6) |
| `Task_Phase7_Payment` | Fase 7: Subsidiebedrag uitbetalen |
| `Task_Phase8_Forward` | Fase 8: Subsidiebesluit registreren in ketenproces |
| `Task_ArchivesDMN` | Archivering: bewaar- en vernietigingstermijn (Archiefwet) |
| `Task_ArchiveRecord` | Dossier archiveren |
| `EndEvent_AWB` | Dossier gesloten |
| `Sub_CaseReview` | Beoordeling behandelaar: recht en hoogte subsidie |
| `Sub_ResolveDecision` | Definitief subsidiebesluit vaststellen |
| `Sub_SetGranted` | Besluitvariabelen zetten: Toegekend |
| `Sub_SetRejected` | Besluitvariabelen zetten: Afgewezen |

Participant names equal the process names; the subprocess keeps
"Thuisbatterijsubsidie - Beoordeling recht en hoogte".

## Unchanged

All scripts, sequence-flow conditions, `camunda:in`/`camunda:out`,
`decisionRefTenantId="${null}"`, `ronl:*` attributes, existing form references
and bindings, the English `bpmn:documentation` prose, the empty text annotation
in the main process, and the three existing forms (including the English notify
form).

## New form: `thuisbatterij-aanvullende-gegevens`

Pre-existing defect: `Task_RequestMissingInfo` points at
`embedded:deployment:awb-missing-info-form.html`, which exists nowhere, and
`supplementReceived` — tested by `Gateway_StillIncomplete` — is set by nothing
else. The incomplete-application path could not be completed.

File `thuisbatterij-aanvullende-gegevens.form`, form id identical, form-js
`schemaVersion` 19, same exporter/platform header as
`thuisbatterij-subsidie-review.form`. Components:

| Component | Key | Type | Notes |
|---|---|---|---|
| Header "Aanvullende gegevens opvragen (Awb 4:5)" + short instruction | — | text | |
| Dossiernummer | `dossierReference` | textfield | disabled |
| Datum ontvangst | `receiptDate` | textfield | disabled |
| Ontbrekende gegevens | `ontbrekendeGegevens` | textarea | required |
| Hersteltermijn tot | `hersteltermijnDatum` | datetime (date subtype) | required |
| Aanvulling binnen hersteltermijn ontvangen | `supplementReceived` | checkbox | boolean, so `${supplementReceived == true/false}` evaluates |
| Toelichting | `aanvullingToelichting` | textarea | optional |
| Verzenden | — | button (submit) | |

`Task_RequestMissingInfo` changes from `camunda:formKey=…` to
`camunda:formRef="thuisbatterij-aanvullende-gegevens"
camunda:formRefBinding="deployment"`, keeping `candidateGroups="caseworker"`.

Locations: `packages/frontend/public/examples/flevoland/` and
`e2e-fixtures/flevoland/` (identical except `"e2eFixture": true`).
`e2e-fixtures/manifest.json`: added to the Thuisbatterij main entry's `forms`.

The same dangling embedded form in `AwbShellProcess` and `AwbZorgtoeslagProcess`
is out of scope. A separate GitHub issue for it is proposed to the user, not
filed unasked.

## Seeding

- `packages/frontend/src/utils/exampleVersions.ts`:
  `example_thuisbatterij_aanvraag` 1 → 2 and `example_thuisbatterij_decision`
  1 → 2 (comment `v2: swimlanes + Dutch names`); new
  `example_thuisbatterij_missing_info: 1`.
- `packages/frontend/src/components/FormEditor/FormEditor.tsx`: new seed entry
  `example_thuisbatterij_missing_info`, path
  `/examples/flevoland/thuisbatterij-aanvullende-gegevens.form`,
  `language: 'nl'`, `organization: 'flevoland'`.
- `BpmnModeler.tsx` seed descriptions are unchanged.

## ronl-business-api companion

Branch `fix/thuisbatterij-dutch-task-names` off `acc`, file
`packages/frontend/e2e/thuisbatterij-journey.spec.ts`:

- line 85 → `/Case review: recht en hoogte subsidie|Beoordeling behandelaar: recht en hoogte subsidie/`
- line 97 → `/Phase 6: Notify applicant of decision|Fase 6: Aanvrager informeren over besluit/`
- the header comment's `"Case review"` updated to name both.

`openOwnTask` already accepts `string | RegExp`. `tenant-isolation.spec.ts`
matches the Zorgtoeslag process and is unaffected.

## Verification

- Structural check (script, not committed): every flow node in exactly one lane;
  every `flowNodeRef` resolves; every lane non-empty; every node's DI bounds
  inside its lane's bounds; child order inside `bpmn:process` is
  documentation → laneSet → flow elements → artifacts.
- Both BPMNs import in `bpmn-moddle` with zero warnings.
- Deploy test through **LDE's own deploy feature**: `POST
  http://localhost:3001/api/dmns/process/deploy`, the same call the Modeler's
  Deploy button makes (`BpmnCanvas.tsx` `handleDeploy`), against the running
  LDE backend and the local Operaton at `localhost:8081`. Neither is started,
  stopped or restarted.
  - What is deployed: the **e2e-fixtures** pair, because the local engine
    already runs that variant (`ThuisbatterijSubsidieAanvraagProcess` v3 calls
    `ThuisbatterijSubsidieDecisionSubProcessE2E` v2, tenant `flevoland`). The
    request body mirrors the Modeler's: `bpmnXml` = main, `subProcesses` = the
    E2E subprocess, `forms` = the four forms referenced by `camunda:formRef`,
    `documents` = `thuisbatterij_subsidie_beschikking`, `deploymentName` =
    `ThuisbatterijSubsidieAanvraagProcess`, `organization` = `flevoland`,
    `boardOwner` = `caseworker`.
  - DMNs are not redeployed: all four are already on the local engine
    untenanted, which is what `decisionRefTenantId="${null}"` resolves.
  - Operaton accepting the deployment covers the XSD element-order rule.
  - No input can make `AwbCompletenessCheck` return incomplete: it is hit
    policy FIRST on `productType`, and `Task_Phase1_Identity` always sets
    `productType="SubsidieThuisbatterijFlevoland"`, which matches a
    "complete" rule. That is a separate finding, not changed here. So start an
    instance (Operaton REST, tenant `flevoland`) directly at
    `Task_RequestMissingInfo` with `startInstructions`; confirm the
    "Aanvullende gegevens opvragen" task resolves the deployed form
    (`GET /task/{id}/deployed-form`); complete it with
    `supplementReceived=false`; confirm the process reaches
    `Task_Phase6_Notify`. The test instance is then deleted.
  - The new versions **stay deployed** and recorded, as after any Modeler
    deploy; they become the latest versions on the local engine, which is what
    the ronl-business-api journey will then run against.
- LDE suites (user runs): backend (incl. `public-example-fixture-parity`,
  `e2e-fixtures`, `e2e-fixture-decisions`), frontend, typecheck, lint.
- Visual check in the Modeler by the user after re-seed.
- ronl-business-api Thuisbatterij journey (user runs) after redeploying the
  fixtures.
