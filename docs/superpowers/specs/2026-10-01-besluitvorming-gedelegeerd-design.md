# Besluitvorming onder gedelegeerde bevoegdheid — design

Date: 2026-10-01
Branches: `feat/besluitvorming-gedelegeerd` (linked-data-explorer), companion
`feat/besluitvorming-gedelegeerd` (ronl-business-api)

## Why

A new example process, from the supplied diagram "Procesflow — Besluitvorming
onder gedelegeerde bevoegdheid (Gemeenten, Provincies en Nationale
Overheidsdiensten)". It covers how a medewerker prepares a decision under delegated authority,
has it reviewed, gets it signed or escalated, and has it registered and
archived.

The process follows the conventions of the Kapvergunning, Thuisbatterij,
Zorgtoeslag and HR capacity bundles: swimlanes, declared phases, and Dutch
names, forms and document. It is the first bundle to sign through ValidSign
from the caseworker dashboard. That turns RBA's signing, built for the
Infra-board's R2.1 phase, into a generic feature that any process configures
in its BPMN alone.

## Decisions

| # | Decision |
|---|---|
| 1 | **Runnable end to end** in ronl-business-api: deployable from LDE and clickable through in RBA. |
| 2 | **Tenant flevoland.** Files live in `packages/frontend/public/examples/flevoland/besluitvorming-gedelegeerd/`. |
| 3 | **All Dutch:** element names, lanes, phases, forms and document. |
| 4 | **The decision rules live in a DMN** (`GedelegeerdBesluitRoute`). It sits next to the process artifacts and is deployed once, without an Organization. The business rule task carries `decisionRefTenantId="${null}"`. |
| 5 | **Five new Keycloak roles**, one per human lane: `besluit-indiener`, `besluit-jurist`, `besluit-bestuursautoriteit`, `besluit-ondertekenaar`, `besluit-registratie`. |
| 6 | **Two test users**, as for HR capacity: `test-indiener-flevoland` (caseworker, besluit-indiener), and `test-besluit-flevoland` (caseworker plus the four other besluit roles). |
| 7 | **Verified by hand**, plus RBA parser tests. No e2e-fixtures copy and no Playwright journey yet. |
| 8 | **Signing is generic.** A task asks for a ValidSign signature with `ronl:signatureRef` alone. Every RBA task view honours it, and archive naming comes from the template and the case. R2.1 needs **no** backward compatibility: it is work in progress and untested with users, and its archived names may change. |
| 9 | **One form per user task**, so every task can be completed in RBA. |

## Flow

Six lanes, top to bottom. The Systeem lane holds the DMN step and the two
gateways that test its output, as in every earlier bundle.

```
Aanvrager/Indiener   Start → 1 Kies beslissingssjabloon → 2 Vul sjabloon in ──┐
Juridische Zaken                                  ┌── Advies en toetsing ◄──────┘
Aanvrager/Indiener                                └→ 4 Controleer voorwaarden
Systeem                                              → Beslisregels toepassen (DMN)
                                                     → ◇ Voorwaarden vervuld?
   nee ──────────────────────────────────────────────────────────────────┐
   ja → ◇ Formeel memorandum vereist?                                     │
        ja  → 5 Vul memorandum in (A) → Verstrek advies/akkoord (J)        │
                                         → ◇ Akkoord? nee ───────────────┤
                                                      ja ─┐              │
        nee ──────────────────────────────────────────────┤              │
Aanvrager/Indiener               6 Dien besluit in ◄──────┘  Escaleren ◄─┤
                                  voor ondertekening             │       │
Gemachtigde onderteken.          Onderteken (ValidSign)          │       │
                                  → ◇ Ondertekend? nee ──────────┼───────┘
Bevoegde bestuursautor.                  │ ja         Neem besluit ◄┘
Registratie & Beheer             Ontvang en registreer ◄────────┘
                                  → Archiveer → Einde
```

How the diagram's ambiguities are resolved:

- The jurist's "Verstrek advies / akkoord" sits on the memorandum path. A refusal there escalates, which is the diagram's upward arrow to "Escaleren".
- The toetsing outcome ("buiten gedelegeerde bevoegdheid") feeds the DMN, rather than jumping straight to "Neem besluit".
- A signer who declines sends the case to "Escaleren naar bevoegde bestuursautoriteit". With good criteria upstream (advies, voorwaarden, memorandum), a decline is an incident, not a correction round: the indiener records why in "Escaleren" and the bevoegde bestuursautoriteit decides. Looping back to "6 Dien in" would re-sign an unchanged document, since that form cannot edit the besluit. (Decided 2 October 2026, after review; the first version looped back.)
- Both endings, signed and decided by the authority, converge on "Ontvang en registreer".
- The "Sjablonenoverzicht" becomes the options in step 1's form, not a separate element.

### Elements

Process `GedelegeerdBesluitProcess`, named "Besluitvorming onder gedelegeerde
bevoegdheid", with `ronl:organization="flevoland"`, `ronl:language="nl"` and
`camunda:historyTimeToLive="365"`. A collaboration
`Collaboration_GedelegeerdBesluit` holds participant
`Participant_GedelegeerdBesluit`, which has the same name.

| Lane id | Name | Role |
|---|---|---|
| `Lane_Indiener` | Aanvrager / Indiener | `besluit-indiener` |
| `Lane_Juridisch` | Juridische Zaken / Compliance | `besluit-jurist` |
| `Lane_Systeem` | Systeem | — |
| `Lane_Bestuursautoriteit` | Bevoegde bestuursautoriteit | `besluit-bestuursautoriteit` |
| `Lane_Ondertekenaar` | Gemachtigde ondertekenaar | `besluit-ondertekenaar` |
| `Lane_Registratie` | Registratie & Beheer | `besluit-registratie` |

| Id | Type | Name | Lane | Form / attributes |
|---|---|---|---|---|
| `StartEvent_Besluit` | start | Besluit voorbereiden | Indiener | — |
| `Task_KiesSjabloon` | user | 1. Kies de juiste beslissingssjabloon | Indiener | `besluit-gb-sjabloon-kiezen` |
| `Task_VulSjabloonIn` | user | 2. Vul de sjabloon in | Indiener | `besluit-gb-sjabloon-invullen` |
| `Task_AdviesToetsing` | user | Advies en toetsing | Juridisch | `besluit-gb-advies-toetsing` |
| `Task_ControleerVoorwaarden` | user | 4. Controleer de voorwaarden voor gedelegeerde bevoegdheid | Indiener | `besluit-gb-voorwaarden` |
| `Task_Beslisregels` | business rule | Beslisregels toepassen | Systeem | `decisionRef="GedelegeerdBesluitRoute"`, `decisionRefTenantId="${null}"`, `resultVariable="besluitRoute"`, `mapDecisionResult="singleEntry"` |
| `Gateway_VoorwaardenVervuld` | exclusive | Zijn alle voorwaarden vervuld? | Systeem | `${besluitRoute == "escaleren"}` → Escaleren; `${besluitRoute != "escaleren"}` → memorandum gateway |
| `Gateway_Memorandum` | exclusive | Is een formeel memorandum vereist? | Systeem | `${besluitRoute == "memorandum"}` → Memorandum; `${besluitRoute == "ondertekenen"}` → Dien in |
| `Task_Memorandum` | user | 5. Vul het memorandum in | Indiener | `besluit-gb-memorandum` |
| `Task_AdviesAkkoord` | user | Verstrek advies / akkoord | Juridisch | `besluit-gb-akkoord` |
| `Gateway_Akkoord` | exclusive | Akkoord? | Juridisch | `${juridischAkkoord == "akkoord"}` → Dien in; `${juridischAkkoord == "niet-akkoord"}` → Escaleren |
| `Task_DienIn` | user | 6. Dien het besluit in voor ondertekening | Indiener | `besluit-gb-indienen` |
| `Task_Onderteken` | user | Onderteken het besluit | Ondertekenaar | `besluit-gb-ondertekenen` (fallback), `ronl:signatureRef="besluit-gb-besluit"` |
| `Gateway_Ondertekend` | exclusive | Ondertekend? | Ondertekenaar | `${approvalStatus == "approved"}` → Registreer; `${approvalStatus == "rejected"}` → Escaleren |
| `Task_Escaleren` | user | Escaleren naar bevoegde bestuursautoriteit | Indiener | `besluit-gb-escalatie` |
| `Task_NeemBesluit` | user | Neem besluit | Bestuursautoriteit | `besluit-gb-besluit-nemen`, `ronl:documentRef="besluit-gb-besluit"` |
| `Task_Registreer` | user | Ontvang en registreer | Registratie | `besluit-gb-registreren` |
| `Task_Archiveer` | user | Archiveer | Registratie | `besluit-gb-archiveren` |
| `EndEvent_Besluit` | end | Besluit gearchiveerd | Registratie | — |

Every user task has `camunda:formRefBinding="deployment"` and
`camunda:candidateGroups` set to its lane's role. A gateway sits in the lane
of the step that sets the variable it tests.

## Phases

The process declares its own phases, which RBA reads (sgort/ronl-business-api#298):
`ronl:phaseLabel="Fase"`, and
`ronl:phases="voorbereiding:Voorbereiding;toetsing:Advies en toetsing;memorandum:Memorandum;ondertekening:Ondertekening;escalatie:Escalatie;registratie:Registratie en archivering"`.

| # | Code | Marked on | Nodes that inherit it |
|---|---|---|---|
| 1 | `voorbereiding` | `StartEvent_Besluit` | steps 1 and 2 |
| 2 | `toetsing` | `Task_AdviesToetsing` | step 4, the DMN, both Systeem gateways |
| 3 | `memorandum` | `Task_Memorandum` | advies/akkoord, "Akkoord?" |
| 4 | `ondertekening` | `Task_DienIn` | Onderteken, "Ondertekend?" |
| 5 | `escalatie` | `Task_Escaleren` | Neem besluit |
| 6 | `registratie` | `Task_Registreer` | Archiveer, the end event |

Memorandum and Escalatie are optional branches, so a direct path skips them on
the stepper, as Awb's Betaling and HR's Heroverweging already do. A declined
signature moves forward into Escalatie; the process has no rework loop.

## Decision table: `GedelegeerdBesluitRoute`

File `gedelegeerd-besluit-route.dmn`, sitting next to the BPMN, with decision
id `GedelegeerdBesluitRoute`, hit policy FIRST and a single output `route`
(string). It implements the diagram's "Belangrijkste beslisregels".

| # | voorwaardenVervuld | binnenMandaat | politiekGevoelig | overwegingenDuidelijk | financieleGevolgen | route |
|---|---|---|---|---|---|---|
| 1 | `false` | – | – | – | – | `"escaleren"` |
| 2 | – | `false` | – | – | – | `"escaleren"` |
| 3 | – | – | `true` | – | – | `"escaleren"` |
| 4 | – | – | – | `false` | – | `"memorandum"` |
| 5 | – | – | – | – | `> 50000` | `"memorandum"` |
| 6 | – | – | – | – | – | `"ondertekenen"` |

Where the inputs come from:
- step 2 sets `financieleGevolgen`;
- the jurist sets `binnenMandaat` and `politiekGevoelig`;
- step 4 sets `voorwaardenVervuld` and `overwegingenDuidelijk`.

Rule annotations quote the diagram's wording. The table is deployed from LDE
without an Organization.

## Forms

These are form-js forms in Dutch, with schemaVersion and header taken from the
existing Dutch forms, and ids identical to their file names. Fields set earlier
are shown read-only where a later task needs them.

| Form | Task | Fields (key: type) |
|---|---|---|
| `besluit-gb-sjabloon-kiezen` | 1 | `besluitType`: select. Options: *standaard* "Standaardbesluit onder gedelegeerde bevoegdheid" (Besluittemplate), *motivering* "Besluit met motivering / nadere onderbouwing" (Besluit + Memorandum template), *financieel* "Financieel besluit > € 50.000" (Financieel memorandum template), *buiten-delegatie* "Besluit buiten delegatie" (Escalatie / indieningstemplate), *specifiek* "Overige specifieke besluiten" (Specialistische template). An explanatory text shows the sjablonentabel. |
| `besluit-gb-sjabloon-invullen` | 2 | `onderwerp`: textfield, required; `motivering`: textarea, required; `relevanteGegevens`: textarea; `financieleGevolgen`: number, € 0 by default; `bijlagen`: textarea; `voorgesteldBesluit`: textarea, required |
| `besluit-gb-advies-toetsing` | Advies en toetsing | read-only summary; `toetsWetgeving`, `toetsBeleid` and `toetsBegroting`: checkbox; `binnenMandaat`: checkbox, true by default; `politiekGevoelig`: checkbox, false by default; `advies`: textarea, required |
| `besluit-gb-voorwaarden` | 4 | read-only advice; `voorwaardenVervuld`: checkbox, false by default; `overwegingenDuidelijk`: checkbox, true by default |
| `besluit-gb-memorandum` | 5 | `aanleiding`, `overwegingen`, `risicos` and `financieleToelichting`: textarea, the first two required |
| `besluit-gb-akkoord` | Verstrek advies / akkoord | read-only memorandum; `juridischAkkoord`: radio, *akkoord* or *niet-akkoord*, a string, because form-js radios submit strings; `akkoordToelichting`: textarea |
| `besluit-gb-indienen` | 6 | `documentenCompleet`: checkbox, required; `ondertekenaar`: textfield |
| `besluit-gb-ondertekenen` | Onderteken (fallback) | `approvalStatus`: radio, *approved* "Ondertekend" or *rejected* "Niet ondertekend"; `ondertekenToelichting`: textarea |
| `besluit-gb-escalatie` | Escaleren | `escalatieReden`: textarea, required |
| `besluit-gb-besluit-nemen` | Neem besluit | read-only summary; `besluitUitkomst`: radio *genomen* or *afgewezen*; `besluitToelichting`: textarea |
| `besluit-gb-registreren` | Ontvang en registreer | `zaaknummer` and `kenmerk`: textfield, required; `documentenGekoppeld`: checkbox |
| `besluit-gb-archiveren` | Archiveer | `bewaartermijn`: select (5, 10 or 20 jaar, or permanent); `toegankelijkOpgeslagen`: checkbox, required |

The fallback signing form writes the same `approvalStatus` as ValidSign
completion does, so "Ondertekend?" works either way. This is the same pattern as
R2.1's `rip-approval`.

## Document: `besluit-gb-besluit`

The file is `besluit-gb-besluit.document`, named "Besluit onder gedelegeerde
bevoegdheid", with `language: nl`, `organization: flevoland`,
`processKey: GedelegeerdBesluitProcess` and the same zones as the existing
documents.

- **letterhead:** Provincie Flevoland.
- **reference:** `{{kenmerk}}` (falling back to the zaak), the datum, `{{onderwerp}}`.
- **body:** the title "Besluit onder gedelegeerde bevoegdheid", then the default
  text: *"Besluiten tot het aangaan, wijzigen, beëindigen verplichtingen d.m.v.
  opdrachtbon, -brief, overeenkomst of anderszins voor: het leveren van zaken,
  verrichten van diensten en uitvoeren van werken."* After that come
  `{{besluitType}}`, `{{voorgesteldBesluit}}`, `{{motivering}}` and
  `{{financieleGevolgen}}`.
- **closing:** a standard Dutch closing line with the bezwaar clause.
- **signOff:** "Namens deze, de gemachtigde ondertekenaar", with `{{ondertekenaar}}` and a signature line. ValidSign anchors its signature field on the first line of this zone.

Bindings are process variables: `onderwerp`, `besluitType`,
`voorgesteldBesluit`, `motivering`, `financieleGevolgen`, `kenmerk` and
`ondertekenaar`. The document is referenced by `ronl:signatureRef` on
Onderteken and by `ronl:documentRef` on Neem besluit. LDE bundles both
references into the deployment.

## LDE files and seeding

- **Folder** `packages/frontend/public/examples/flevoland/besluitvorming-gedelegeerd/`: `GedelegeerdBesluitProcess.bpmn`, `gedelegeerd-besluit-route.dmn`, the 12 `.form` files and `besluit-gb-besluit.document`.
- **`BpmnModeler.tsx`:** a seed entry `example_besluit_gb`, in Dutch, organization flevoland.
- **`FormEditor.tsx`:** 12 seed entries `example_besluit_gb_<form>`, in Dutch.
- **Document:** a seed for `besluit-gb-besluit`, through the existing `defaultTemplates.ts` mechanism.
- **`exampleVersions.ts`:** a version 1 for every new seed.
- **Not in `e2e-fixtures/`** (decision 7), so the fixture-parity tests are unaffected.

## ronl-business-api companion

### Roles and users

- **`config/keycloak/ronl-realm.json`:** the five realm roles, each with a Dutch description, and the two test users from decision 6, each with an email claim. ValidSign signs as the logged-in user and refuses one without an email.
- **Keycloak on ACC and PROD:** the realm is not re-imported there, so creating these roles and users is a manual step listed in the PR.
- **Backend:** no change. Task listing already maps candidateGroups one-to-one onto realm roles.

### Start entry

RBA processes start in one of two ways:

- **as requests**, initiated by citizens outside the dashboard (Kapvergunning, Thuisbatterij, Zorgtoeslag);
- **from the dashboard itself** (HR capacity).

This process belongs to the second kind: a medewerker prepares a decision. So
it gets a dashboard start entry: a caseworker mode item "Besluitvorming" →
"Besluit voorbereiden", with
`requiredRoles: ['besluit-indiener']`. Its section starts
`GedelegeerdBesluitProcess`, following `CapacityClaimSection` but in Dutch.
The first task then appears in the indiener's task list.

### Generic signing

1. **One rule for every task view.** `SigningPanel` moves from `InfraBoardDashboard/` to a shared `components/signing/`, behind a hook `useTaskSignature(taskId)`. The hook wraps `GET /v1/validsign/task/:taskId/spec` and reports whether signing is required, its status, and stub mode. Both task views that complete tasks use it:
   - the Infra-board's `ProjectDetail`;
   - the caseworker task detail in `TakenInbox`.

   Where signing is required, the panel replaces the form, with the form as fallback when the spec cannot be fetched. That is today's Infra-board behaviour, now applied everywhere.
2. **Archive naming from the template and the case.** `validsignCompletion.service.ts` no longer hard-codes "rip-pdp" and "Uitgangspunten VO-fase". With `reference` being the process business key (falling back to the package id):
   - files: `<templateId>-<reference>-signed.pdf` and `<templateId>-<reference>-evidence.pdf`;
   - titles: `<reference> — <template.name> (ondertekend) — getekend document` and `… — bewijsoverzicht`.

   R2.1's archived names change accordingly (decision 8).
3. **A fixed result contract.** Completion keeps writing `approvalStatus = approved | rejected` and the `validsign*` variables. `docs/VALIDSIGN.md` documents the generic contract:
   - `ronl:signatureRef` names a `.document` deployed with the process;
   - the document needs a `signOff` zone;
   - the task keeps a fallback form that also sets `approvalStatus`;
   - the archive naming above.

After this, a future process needs only `ronl:signatureRef` and a document
with a `signOff` zone. It needs no RBA code.

### Parser fixture

`GedelegeerdBesluitProcess.bpmn` goes in as
`packages/backend/src/rip-swimlane/__fixtures__/declared/`, with tests pinning:
- the six lanes and their candidateGroups;
- the six phases;
- every node's phase;
- the declined signature leading to Escaleren, and no back edge.

## Verification

- **LDE structural check** (script, not committed): every flow node in exactly one lane, inside its lane's bounds; element order valid; bpmn-moddle loads with zero warnings.
- **LDE suites** (run by the user): backend, frontend, typecheck, lint.
- **RBA:**
  - unit tests for the signing hook and both hosts;
  - the completion naming;
  - the parser fixture;
  - the full suites and the existing e2e journeys, run by the user. The R2.1 journey still signs through the moved panel.
- **Manual walk-through on local:**
  1. Deploy the DMN from LDE without an Organization.
  2. Deploy the process from the Modeler, which bundles the forms and the document.
  3. With ValidSign stub mode on, log in as `test-indiener-flevoland` and start "Besluit voorbereiden".
  4. Run the direct path through Onderteken (stub ceremony) to Archiveer, as `test-besluit-flevoland` for the other lanes.
  5. Run once with € 60.000, to take the memorandum path.
  6. Run once as politically sensitive, to take the escalation path.
  7. Check the stepper and the lane steps along the way.

## Out of scope

- An e2e-fixtures copy and a Playwright journey: they can follow once the process has settled.
- A **generic dashboard start** for processes started from the dashboard. Each such process (HR capacity, this one) still needs its own start section; that is worth a follow-up issue in the spirit of LDE #242. Citizen-initiated requests are unaffected.
- Authoring `ronl:signatureRef` in the Modeler's properties panel; that belongs with LDE #242.
- A signature by the bestuursautoriteit on the escalation path: the diagram has it decide, not sign.
