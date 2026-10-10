# Modeler phase editing — design (#242)

Status: approved in conversation on 10 October 2026; this document is the
written spec for review.

## Goal

A process modelled entirely in the LDE BPMN Modeler gets ronl-business-api's
caseworker phase stepper after deploy, with no RBA change and no hand-edited
XML. Today the phase attributes are typed into the XML by hand (`0ab32d3` for
the Awb bundles, #241 for the HR capacity claim); the Modeler can neither read
nor set them.

## The format (fixed by RBA)

RBA's `assignPhases` (`ronl-business-api/packages/backend/src/rip-swimlane/bpmn-swimlane.ts`)
is the reference. A process uses one of two schemes, never both.

- **Declared phases.** On `<bpmn:process>`:
  - `ronl:phases="code:Name;code:Name;…"`. Entries are separated by `;` and
    split at their first `:` (a name may contain `:`); both parts are trimmed.
    An entry with an empty code or name, or repeating an earlier code, is
    skipped. No entry left means no declared set.
  - `ronl:phaseLabel`, optional, default `Fase`.
  - On flow nodes, `ronl:phase="code"` marks the node that **starts** a phase.
- **Awb.** No declaration; `ronl:awbPhase` on the phase-start nodes, with a
  code from RBA's table (`packages/shared/src/awb-phases.ts`): `1`
  Rechtsbetrekking, `2` Ontvangst, `3` Ontvankelijkheid, `4+5` Behandeling en
  besluit, `6` Bekendmaking, `7` Betaling, `8` Ketenproces, `archivering`
  Archivering. RBA uses the Awb table only when `ronl:phases` is absent.
- **Inheritance.** Only direct children of the first `<process>` of these kinds
  count: start/end events, user, manual, script, business-rule, receive,
  service and send tasks, call activities, subprocesses (as one node),
  intermediate catch/throw events, and exclusive, inclusive, event-based and
  parallel gateways. Boundary events do not. Back edges (rework loops) are
  found by a depth-first search from the start events (or the first node),
  walking outgoing flows in declared `<bpmn:outgoing>` order. Nodes are
  visited in longest-path column order over forward edges. A node's own
  marker wins; otherwise it takes the **latest** phase among its forward
  predecessors; a node with no phased predecessor stays unassigned. A marker
  whose code is not in the set is ignored. No markers at all means no stepper.

Phases on a collaboration or participant are out of scope: RBA reads only
`<bpmn:process>`.

## Design

### 1. Descriptor and phase core

**`ronlModdleDescriptor.json`** gains two mixins (String, `isAttr`):

- `PhasesMixin` extends `bpmn:Process`: `phases`, `phaseLabel`.
- `PhaseMarkerMixin` extends `bpmn:FlowNode`: `phase`, `awbPhase`.

`FlowNode` is wider than RBA's allowlist on purpose: one mixin instead of one
per type; markers on kinds RBA ignores are reported by the pre-deploy checks
(section 4). Once registered, bpmn-js reads and writes them as properties
rather than parking them in `$attrs`.

**Round-trip requirement.** Importing and exporting through bpmn-moddle keeps
every phase attribute on the same element with the same value, for
`GedelegeerdBesluitProcess.bpmn`, `ManagementCapacityClaimProcess.bpmn` and
`AwbShellProcess.bpmn`. The whole file need not be byte-identical (bpmn-js
already reformats on save).

**Phase core, `packages/frontend/src/utils/phases/`**: pure TypeScript, no
bpmn-js dependency.

| File | Contents |
|---|---|
| `phaseSet.ts` | `parseDeclaredPhases(phases, label)` with RBA's parsing rules; `serializePhases(list)`, its inverse; `AWB_PHASES` (copied from RBA's table, with a comment naming the source); `codeFromName(name, taken)`: lower case, diacritics stripped, non-alphanumerics to `-`, numeric suffix for uniqueness |
| `phaseGraph.ts` | `graphFromXml(xml)`: `DOMParser`, first `<process>`, RBA's node kinds as direct children, flows in declared `outgoing` order, markers read with the namespace prefix ignored and blank treated as absent |
| `assignPhases.ts` | `findBackEdges` (iterative DFS), column assignment (longest-path relaxation over forward edges), `assignPhases` returning per node `{ code, inherited }` or nothing, plus the active scheme and phase list |

### 2. Editors

**Process level — `ProcessPhasesEditor.tsx`.** Mounted in the properties panel
when the selection is the process itself: nothing selected (the root) or a
participant (its `processRef`). Today nothing is mounted for those; the mount
uses the id prefix `phase-process-custom-`, added to `cleanupReactRoots`.

- A scheme choice:
  - **None**: no stepper; switching to it clears `phases` and `phaseLabel`.
    Markers stay; the checks warn about them.
  - **Own phases**: rows of name, code (generated from the name, editable,
    unique) and up/down/remove; "Add phase"; a "Label" field, default `Fase`.
  - **Awb phases**: clears `ronl:phases`; shows the eight Awb codes read-only.
- **The scheme is read from the XML**: declared when `ronl:phases` yields a
  set, Awb when there is none but at least one `ronl:awbPhase` marker, None
  otherwise. Awb has no attribute of its own, so choosing **Awb phases** on a
  process without Awb markers writes nothing; `BpmnCanvas` keeps that choice
  as a session-only `schemeIntent`, so the node picker offers the Awb codes.
  The first Awb marker makes the scheme visible in the XML, and from then on
  it is derived like the others. Reopening an Awb process that has no markers
  shows None, which is also what RBA sees.
- Every change is `modeling.updateProperties(processElement, …)`: one undo
  step, live on the canvas. `ronl:phaseLabel` is written only when it differs
  from `Fase`, so an untouched process gains no attribute.
- Switching between declared and Awb while markers of the other scheme exist
  asks for confirmation, then removes those markers in the same compound
  command.
- Renaming a code rewrites every node's `ronl:phase` that used it, in the same
  command. Removing a phase asks first, then clears its markers.

**Node level — `PhaseMarkerSelector.tsx`.** Mounted (prefix
`phase-node-custom-`) for the node kinds RBA counts, below the existing
selectors; modelled on `DocumentTemplateSelector`.

- Without a scheme on the process (from the XML or the session's
  `schemeIntent`): a one-line hint, "Set phases on the process first".
- Otherwise a dropdown: "(erft over)" plus the declared phases ("Fase 2 ·
  Toetsing") or the Awb codes ("Fase 3 · Ontvankelijkheid"). Picking writes
  `ronl:phase` (declared) or `ronl:awbPhase` (Awb); "(erft over)" removes it.
- Below it, what the node resolves to, from the phase core: "Erft fase 2
  (Toetsing) over" or "Geen fase: ligt vóór de eerste fasemarkering".

### 3. Canvas and data flow

- After import and on every `commandStack.changed`, a run debounced at 150 ms:
  `modeler.saveXML()` → `graphFromXml` → `assignPhases`. A newer change cancels
  a pending run. The result (`phaseView`: per-node assignment, scheme, phase
  list) is `BpmnCanvas` state, passed to the node picker and the overlay.
- `refreshPhaseOverlays` adds overlays of type `phase-marker`, beside the
  existing DMN/form/document badges:
  - a node that starts a phase: a solid badge with number and code
    (`2 · toetsing`, or `Fase 3` for Awb), top left;
  - a node that inherits: a lighter, outlined badge with the number only;
  - unassigned nodes, processes without a scheme, and schemes without
    markers: no badge.
  - Each phase has a colour from a small fixed palette by index; the tooltip
    gives the full name. CSS lives in `BpmnModeler.css`.
- `BpmnCanvas.tsx` only wires: the recompute, the overlay refresh, mounting and
  cleaning up the two editors, and the process/participant selection case. The
  logic stays in `utils/phases/` and the components in their own files.
- **Errors.** A failed `saveXML` or parse (typically mid-edit) keeps the last
  good `phaseView` and badges, logged once at debug level. Malformed
  `ronl:phases` entries are skipped as RBA skips them; the checks name them.

### 4. Pre-deploy checks

`utils/phases/phaseChecks.ts`: `checkPhases(xml)` on the XML
`handleOpenDeployModal` already serialises, returning
`{ severity: 'error' | 'warning', code, message }[]`, shown in the deploy
dialog's existing amber (warning) and red (blocking) styles.

| Severity | Finding |
|---|---|
| Error (Deploy disabled) | `ronl:phases` declared and any `ronl:awbPhase` marker present |
| Warning | A scheme is set (declared, or Awb through markers) but no node is marked: no stepper |
| Warning | A marker names a code the process did not declare: ignored by RBA |
| Warning | A declared phase that no node falls into after inheritance: its step never lights up |
| Warning | Skipped entries in `ronl:phases` (empty code or name, duplicate code) |
| Warning | A marker on a node kind RBA does not count (e.g. a boundary event): no effect |

Checks cover the process being deployed only; each subprocess is checked when
it is deployed itself. "Awb chosen" is detected as RBA detects it: no
`ronl:phases` and at least one `ronl:awbPhase` marker.

## Testing

All Vitest; `// @vitest-environment jsdom` where `DOMParser` or React is
needed.

- **Phase core**: parsing (including `:` inside a name, duplicates, blanks),
  `serializePhases` round trip, `AWB_PHASES`, `codeFromName`; `findBackEdges`,
  columns and `assignPhases` on RBA's own `bpmn-swimlane` test cases
  re-expressed; `graphFromXml` on the three example shapes.
- **Parity with RBA**: the per-node phases of `GedelegeerdBesluitProcess.bpmn`
  and `ManagementCapacityClaimProcess.bpmn` are captured once from RBA's
  parser and pinned; `assignPhases` must produce the same.
- **Round-trip**: bpmn-moddle import/export of the three examples keeps every
  phase attribute.
- **`phaseChecks`**: one case per finding, and a clean process with none.
- **Editors** (RTL + userEvent, `modeling` mocked as in the selector tests):
  add, rename (re-codes markers), reorder, remove (clears markers), label,
  scheme switch with confirmation and marker clean-up; the picker's options
  per scheme, writing and removing a marker, the "resolves to" line.
- **`BpmnCanvas`** (existing mocked bpmn-js): root/participant selection
  mounts the process editor, node selection mounts the picker,
  `commandStack.changed` produces solid and outlined badges, the deploy dialog
  shows the warnings and blocks on the error.

## Acceptance (from the issue)

1. A process modelled from scratch with UI-set phases shows the stepper in
   RBA's caseworker view after deploy, with no RBA change: covered by the
   parity tests, confirmed end to end by deploying such a process.
2. Opening and re-saving `ManagementCapacityClaimProcess.bpmn` and
   `AwbShellProcess.bpmn` keeps their phase attributes: the round-trip test.
3. Unit tests for the round trip, the phase-list editor, the node picker and
   each pre-deploy check: listed above.
4. The inheritance shown matches RBA's rule, back edges excluded: the parity
   tests.

## Out of scope

- Any change in ronl-business-api.
- Changing the Awb table.
- Phases on a collaboration or participant.
