# Design: RipR22Process (R2.2 — VO) deploy bundle

## Problem

The RIP process library in this repo stops at phase R2.1. `RipR21Process` ends
on an event literally named `Fase 1 voltooid → R2.2`, and nothing picks that
thread up. The R2.2 phase is specified — as a swimlane diagram in
`examples/organizations/flevoland/rip-phases-left/R2 Planvoorbereiding/R2_2 - VO.pdf`
(last revised 21-11-2024) — but exists nowhere as a deployable artifact.

This design covers turning that PDF into a bundle LDE can import and deploy to
Operaton: a BPMN process, its user-task forms, and the document templates the
phase produces.

A second, smaller problem rides along. The directory holding R2.1 is named
`rip-phase1-swimlanes` — a name from a period when there were two competing
drafts (`rip-phase1/` and `rip-phase1-swimlanes/`) and the suffix was what told
them apart. The other draft was deleted in `b1b88a8`, so the suffix now
distinguishes nothing, and the directory name no longer matches the process it
holds (`RipR21Process`). Adding an R2.2 sibling is the moment to fix it, because
whatever we name the new directory sets the pattern.

## Design

### 1. Rename R2.1's directory to match its process

```
examples/organizations/flevoland/rip-phase1-swimlanes/  ->  rip-phase-21/
```

`git mv`, contents untouched. The name now tracks the process key
(`RipR21Process`), and the new bundle becomes an obvious sibling
(`rip-phase-22/` holding `RipR22Process`).

One reference to the old path exists, and it is descriptive prose rather than a
lookup: the `source` field of the `RipR21Process` entry in
`e2e-fixtures/manifest.json`. It gets updated so it does not point at a path
that no longer exists. `packages/frontend/src/changelog.json` mentions the
older `rip-phase1/` directory and the `RipPhase1Process` -> `RipR21Process`
rename, but only inside historical release entries, which describe what was
true when they were written and are not retro-edited. Nothing resolves this directory at runtime — the
app serves examples from `packages/frontend/public/examples/`, which has never
contained the RIP bundles.

### 2. `RipR22Process.bpmn`

New file at `examples/organizations/flevoland/rip-phase-22/RipR22Process.bpmn`,
with `<bpmn:process id="RipR22Process">`. Same skeleton as R2.1: a
`bpmn:collaboration` with one participant, a `laneSet`, and a full `bpmndi`
section so the diagram opens in Camunda Modeler and renders in LDE.

**Four lanes**, named exactly as the spec's swimlanes:

| Lane id | Name |
|---|---|
| `Lane_Projectleider` | Projectleider |
| `Lane_Ontwerper` | Ontwerper |
| `Lane_RIPteam_Aandrager_Adviseur` | RIP-team, Aandrager, Adviseur |
| `Lane_Omgevingsmanager` | Omgevingsmanager |

**Nine user tasks**, Dutch names verbatim from the PDF, each with
`camunda:formRef`, `camunda:formRefBinding="latest"` and
`camunda:candidateGroups`:

| Task id | Name | Lane | formRef | candidateGroups |
|---|---|---|---|---|
| `Task_UitvoerenConditionerendeOnderzoeken` | Uitvoeren conditionerende onderzoeken | Projectleider | `rip-conditionerende-onderzoeken` | `rip-projectleider` |
| `Task_OpstellenConceptVO` | Opstellen concept VO | Ontwerper | `rip-concept-vo` | `rip-ontwerper` |
| `Task_OpstellenDefinitiefVO` | Opstellen definitief VO | Ontwerper | `rip-definitief-vo` | `rip-ontwerper` |
| `Task_BesprekenConceptVO` | Bespreken concept VO | RIP-team, Aandrager, Adviseur | `rip-bespreken-concept-vo` | `rip-team,rip-aandrager,rip-adviseur` |
| `Task_BesprekenKlanteisenKL` | Bespreken klanteisen en kabels en leidingen | RIP-team, Aandrager, Adviseur | `rip-bespreken-klanteisen-kl` | `rip-team,rip-aandrager,rip-adviseur` |
| `Task_VerzamelenKlanteisen` | Verzamelen klanteisen | Omgevingsmanager | `rip-verzamelen-klanteisen` | `rip-omgevingsmanager` |
| `Task_InventariserenKabelsLeidingen` | Inventariseren kabels en leidingen | Omgevingsmanager | `rip-inventariseren-kabels-leidingen` | `rip-omgevingsmanager` |
| `Task_AanvragenRaamvergunning` | Aanvragen raamvergunning | Omgevingsmanager | `rip-aanvragen-raamvergunning` | `rip-omgevingsmanager` |
| `Task_TerugkoppelenKlanteisen` | Terugkoppelen klanteisen | Omgevingsmanager | `rip-terugkoppelen-klanteisen` | `rip-omgevingsmanager` |

`rip-ontwerper`, `rip-omgevingsmanager` and `rip-adviseur` are new groups;
`rip-projectleider`, `rip-team` and `rip-aandrager` already exist in R2.1.

Four of these tasks additionally carry `ronl:documentRef`, binding the task to
the document template it produces — the same wiring R2.1 uses on
`Task_AanvullenProjectplan2`, `Task_AanvullenProjectplan4` and
`Task_UitvoerenPSU`, and what renders the document badge on the task in the
Modeler. Without it the templates import but attach to nothing. The attribute
is **single-valued** — `DocumentTemplateSelector.tsx` writes one id and
`BpmnCanvas.tsx` reads a scalar — so exactly one template can hang off a task,
and the value is the bare template id with no `.document` suffix:

| Task id | `ronl:documentRef` |
|---|---|
| `Task_VerzamelenKlanteisen` | `rip-kes` |
| `Task_OpstellenConceptVO` | `rip-ontwerptoelichting` |
| `Task_BesprekenConceptVO` | `rip-bevindingenformulier` |
| `Task_OpstellenDefinitiefVO` | `rip-hoeveelheidsbepaling` |

`rip-objectenboom` is deliberately left unattached. `ronl:documentRef` is
single-valued, `Task_OpstellenConceptVO` produces both the Ontwerptoelichting
and the Objectenboom, and its one slot went to the Ontwerptoelichting; the
Objectenboom still ships and imports normally, it simply carries no task
badge. Note that its reference is additionally maintained in Relatics.

**Control flow — five parallel gateways**, mirroring the diagram's bars:

```
StartEvent_R22
  -> Gateway_UitgangspuntenSplit  (parallel, 5 outgoing)
       -> Task_UitvoerenConditionerendeOnderzoeken
       -> Task_OpstellenConceptVO
       -> Task_VerzamelenKlanteisen
       -> Task_InventariserenKabelsLeidingen
       -> Task_AanvragenRaamvergunning
  -> Gateway_UitgangspuntenJoin   (parallel, 5 incoming)
  -> Gateway_BesprekenSplit       (parallel, 2 outgoing)
       -> Task_BesprekenConceptVO
       -> Task_BesprekenKlanteisenKL
  -> Gateway_BesprekenJoin        (parallel, 2 incoming)
  -> Gateway_AfrondingSplit       (parallel, 2 outgoing)
       -> Task_TerugkoppelenKlanteisen  -> EndEvent_KlanteisenTeruggekoppeld
       -> Task_OpstellenDefinitiefVO    -> EndEvent_VOGereed
```

`StartEvent_R22` is named `Start R2.2 — VO (vanuit R2.1)`; `EndEvent_VOGereed`
is named `VO gereed → R2.3 Opstellen VO-raming`, echoing how R2.1's end event
names its successor. `EndEvent_KlanteisenTeruggekoppeld` is named
`Klanteisen teruggekoppeld`; it is a genuine second end event, since the spec
shows `Terugkoppelen klanteisen` terminating inside the pool rather than feeding
R2.3.

All five branches of the first split rejoin the join gateway. This is worth
stating because the PDF does not draw it that way: it shows
`Inventariseren kabels en leidingen` and `Aanvragen raamvergunning` running off
the bottom of the pool into CO1 and JU3.5 and never coming back. Modelled
literally, a five-way parallel split with three returning branches deadlocks at
the join and the process never completes. Since the cross-phase hand-offs are
annotations rather than control flow (below), all five branches return and the
process stays executable.

**Cross-phase references as annotations.** Four `bpmn:textAnnotation` elements
with `bpmn:association` to their source tasks:

| Annotation on | Text |
|---|---|
| `Task_AanvragenRaamvergunning` | JU3.5 Aanvragen vergunning (Omgevingsloket) |
| `Task_InventariserenKabelsLeidingen` | CO1. Uitvoeren knelpuntenanalyse |
| `Task_BesprekenKlanteisenKL` | CO1. Uitvoeren knelpuntenanalyse |
| `Task_OpstellenDefinitiefVO` | CO1. Voeren overleg netbeheerder |

These are documentation, not executable elements — the CO1 and JU3.5 processes
do not exist as fixtures, so a `callActivity` would dangle at deploy time and
break the manifest's `calledElement` test.

Annotations and associations are emitted **after every flow element**. BPMN 2.0's
`tProcess` is an ordered sequence (`laneSet*, flowElement*, artifact*, …`), so
once an artifact appears no further flow element may follow. Operaton validates
against the XSD and rejects the whole deployment otherwise. There is already a
regression test for exactly this in `e2e-fixtures.test.ts`.

### 3. Nine forms

Camunda form-js, `schemaVersion: 16`, `"e2eFixture": true`, `type: "default"`,
`executionPlatform: "Camunda Platform"` / `7.21.0`. Each file's `id` equals its
`formRef`, since that is what binds it to the task.

| File | Captures |
|---|---|
| `rip-conditionerende-onderzoeken.form` | which studies were run, findings, completion date |
| `rip-concept-vo.form` | concept VO reference, design rationale, whether a variant trade-off applies (drives the conditional LCC-raming) |
| `rip-definitief-vo.form` | final VO reference, quantity determination reference, sign-off |
| `rip-bespreken-concept-vo.form` | meeting date, attendees, findings recorded on the bevindingenformulier |
| `rip-bespreken-klanteisen-kl.form` | meeting date, attendees, bottleneck categories agreed |
| `rip-verzamelen-klanteisen.form` | requirement entries, source stakeholder, KES reference |
| `rip-inventariseren-kabels-leidingen.form` | Klic notification reference, iAsset lookup, cable/pipe findings |
| `rip-aanvragen-raamvergunning.form` | permit type, submission date, Omgevingsloket reference |
| `rip-terugkoppelen-klanteisen.form` | which requirements were honoured or declined, and the reason given |

Body copy is English, matching R2.1's forms; task and lane names stay Dutch,
also matching R2.1.

### 4. Five document templates

One per green "Format …" in the spec. A Format in the diagram and a `.document`
in LDE are the same thing — a template with bindings — so the mapping is direct.
The blue outputs beside them are instances of these templates, not separate
artifacts.

| File | `id` | Format in the spec |
|---|---|---|
| `rip-kes.document` | `rip-kes` | Format KES |
| `rip-ontwerptoelichting.document` | `rip-ontwerptoelichting` | Format Ontwerptoelichting |
| `rip-objectenboom.document` | `rip-objectenboom` | Format objectenboom (Relatics) |
| `rip-bevindingenformulier.document` | `rip-bevindingenformulier` | Format Bevindingenformulier |
| `rip-hoeveelheidsbepaling.document` | `rip-hoeveelheidsbepaling` | Format hoeveelheidsbepaling |

Each carries `processKey: "RipR22Process"`, `serviceId: "RipR22"`,
`schemaVersion: 1`, `readonly: false`, `status: "wip"`, and all seven zones —
with TipTap doc JSON blocks. `DocumentCanvas` renders by iterating `ZONE_ORDER`
(`letterhead`, `contactInformation`, `reference`, `body`, `closing`, `signOff`,
`annex`), not by the object's key order, so the new files follow R2.1's existing
key order for a smaller diff against its templates; only the key *names* matter.
Those are spelled `signOff` and `contactInformation`, matching
`packages/frontend/src/types/document.types.ts`. R2.1's templates shipped with
`signoff` and `contactInfo` and silently dropped their signature blocks for
months; `49832d2` fixed that, and these start correct.

`bindings[]` covers the variables the spec carries in from R2.1 and produces
within R2.2:

- from R2.1: `projectNumber`, `projectName`, `projectType`,
  `vastgesteldProjectplan` (Vastgesteld Projectplan — uitgangspunten VO)
- within R2.2: `klanteisen`, `conditionerendeOnderzoeken`, `knelpuntenanalyse`,
  `conceptVoReferentie`, `voReferentie`

### 5. Register as an importable fixture

The bundle is authored in `examples/`, but `examples/` is not what LDE imports.
Import and deploy read `e2e-fixtures/` plus `e2e-fixtures/manifest.json` — that
is how `RipR21Process` is wired today. So all 15 files are mirrored into
`e2e-fixtures/flevoland/`, and a new entry is appended to the `flevoland` array:

```json
{
  "processDefinitionKey": "RipR22Process",
  "bpmn": "RipR22Process.bpmn",
  "forms": [
    "rip-conditionerende-onderzoeken.form",
    "rip-concept-vo.form",
    "rip-definitief-vo.form",
    "rip-bespreken-concept-vo.form",
    "rip-bespreken-klanteisen-kl.form",
    "rip-verzamelen-klanteisen.form",
    "rip-inventariseren-kabels-leidingen.form",
    "rip-aanvragen-raamvergunning.form",
    "rip-terugkoppelen-klanteisen.form"
  ],
  "documents": [
    "rip-kes.document",
    "rip-ontwerptoelichting.document",
    "rip-objectenboom.document",
    "rip-bevindingenformulier.document",
    "rip-hoeveelheidsbepaling.document"
  ],
  "source": "authored in examples/organizations/flevoland/rip-phase-22/ from rip-phases-left/R2 Planvoorbereiding/R2_2 - VO.pdf (rev. 21-11-2024)"
}
```

No `subProcesses` — R2.2 has no call activities.

## Out of scope

- **R2.3, R2.4, R3–R6.** Their PDFs sit in `rip-phases-left/` and each gets its
  own bundle later. This design covers R2.2 only.
- **CO1 and JU3.5 as real processes.** They are referenced by R2.2 and by other
  phases, so they belong in a shared bundle of their own rather than being
  invented here from one phase's view of them.
- **LCC-raming as a separate artifact.** The spec marks it "indien
  variantenafweging" — conditional on a variant trade-off happening at all. It is
  a conditional field on `rip-concept-vo.form`, not a template.
- **Chaining R2.1 to R2.2 at runtime.** R2.1's end event names R2.2 but does not
  invoke it, and R2.2's start event is a plain start event. Making the phases
  actually hand off is a separate design touching both processes.
- **Seeding into `packages/frontend/public/examples/`.** The RIP bundles have
  never been served from there and this does not change that.

## Testing

The five tests in `packages/backend/src/e2e-fixtures.test.ts` pick up the new
manifest entry automatically and are the primary gate:

1. manifest parses as JSON
2. every declared file exists under its tenant directory
3. the BPMN's `<bpmn:process id>` matches the declared `processDefinitionKey`
4. artifacts follow all flow elements, as `tProcess` requires
5. `calledElement` references match nested `subProcess` keys (vacuous here — no
   call activities — but it runs)

Beyond that: `npm run lint` and `check-format` across both workspaces (the
pre-push hook runs these anyway), and the full backend suite via the workspace
script, not a bare `npx jest` from the root — the root invocation ignores
`packages/backend/jest.config.js` and can report a false pass.

Deploy verification is manual and belongs to the user: import the bundle in a
running LDE and deploy to Operaton. Nothing in this design starts, stops, or
drives a server.
