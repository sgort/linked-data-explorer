# DSO Integration — Phase Plan updated

## End goal

A **DSO-driven AWB process bundle**: given a location and a werkzaamheid, LDE produces a deployable Operaton package — BPMN subprocess + DMN + form schema + document template — all seeded from authoritative DSO source data rather than authored by hand.

---

## The data flow

```
Werkzaamheid (what someone wants to do)
    ↓  linked to
Activiteit (the legal activity at that location)
    ↓  has
Regelbeheerobjecten (RTR detail call)
    ├── indieningsvereisten  →  functioneleStructuurRef  →  STTR file  →  Form scaffold (form-js JSON)
    ├── conclusie            →  functioneleStructuurRef  →  STTR file  →  DMN decision model (.dmn)
    └── maatregelen          →  functioneleStructuurRef  →  STTR file  →  Document template scaffold
    ↓  governed by
BPMN subprocess (the AWB procedural shell, linked via ronl:dsoActiviteitUrn)
```

### The `functioneleStructuurRef` is the pivot

Every `regelBeheerobject` returned by the RTR activity detail call carries a `functioneleStructuurRef`. This URI is the key that links the RTR taxonomy to the STTR files in the Uitvoeren Gegevens API.

Two formats exist:

- **Zoekinterface** (werkzaamheid-level): `http://toepasbare-regels.omgevingswet.overheid.nl/werkzaamheden/id/concept/GebouwPlaatsen`
- **RTR detail** (regelBeheerobject-level): `http://toepasbare-regels.omgevingswet.overheid.nl/00000001005024249000/id/concept/Conclusienl.imow-gm0995.activiteit.HoutopstandVellen`

The authority-scoped RTR detail format is the one used for `GET /toepasbareRegels?functioneleStructuurRef=...`.

---

## APIs

### Integrated

| API | Version | Used for |
|---|---|---|
| RTR CRUD (raadplegen) | v2 | Activity list, detail, OIN-based browse via `_zoek` with `bestuursorgaan.oin` |
| Catalogus opvragen | v3 | Concepts search (Stelselcatalogus) |
| Zoekinterface | v2.2.3 | Werkzaamheden search + autocomplete, `functioneleStructuurRef` retrieval |
| Opvragen Werkzaamheden | v1 | Werkzaamheid version history |
| Uitvoeren Gegevens | v1 | STTR metadata + download by `functioneleStructuurRef`, DMN extraction, form scaffold |

### Pending

| API | Key capability |
|---|---|
| Samengestelde RTR services v2 | Rule type completeness check for werkzaamheid + location |

---

## STTR file format — confirmed from HoutopstandVellen (Lelystad)

The STTR files produced by the Sogelink STTR Builder have `<dmn:definitions>` as their root element. There is no outer `<sttr>` envelope. The DSO domain-specific content lives inside `<dmn:extensionElements>`.

### conclusie STTR (identifier 105946)

Root: `<dmn:definitions xmlns:dmn="..." ...>`

Content:
- `dmn:extensionElements`
  - `inter:regelgroepen` — named groups of questions
  - `uitv:uitvoeringsregels` — questionnaire questions (used to produce the DMN inputs)
  - `sttrbuilder:dependencyInformation` — decision paths and outcome descriptions
- `dmn:inputData` elements — one per `uitvoeringsregel`, typed (boolean, string, number)
- `dmn:decision` elements — full decision tables implementing the check logic

The file is **structurally** a DMN but is **not deployable as-extracted** — the Sogelink STTR Builder emits DMN 1.2 with `<input>` elements lacking ids, which Operaton refuses. "Extract DMN" returns the full `<dmn:definitions>` element normalized for Operaton (DMN 1.3 + input ids — see Phase 4.1); the deployer still adds `camunda:historyTimeToLive`.

### indieningsvereisten STTR (identifier 105947)

Root: `<dmn:definitions xmlns:dmn="..." ...>`

Content:
- `dmn:extensionElements`
  - `inter:regelgroepen` — named groups (e.g. Kappen, Eigendom, Algemene bijlagen)
  - `uitv:uitvoeringsregels` — questionnaire: `uitv:vraag` (question) or `uitv:bijlage` (attachment)
  - `sttrbuilder:dependencyInformation > sttrbuilder:formDependencyInformation` — conditional visibility rules

The questionnaire is extracted from `uitv:uitvoeringsregels`, not from the decision tables.

### Form scaffold mapping

| `uitv:gegevensType` | `inter:inputType` | form-js type |
|---|---|---|
| `boolean` | — | `checkbox` |
| `list` + `uitv:opties` | — | `select` with option values |
| `number` | — | `number` |
| `string` | `textarea` | `textarea` |
| `string` | `text` or absent | `textfield` |
| `uitv:bijlage` | — | `textfield` with `[Bijlage]` label prefix |
| `uitv:geoVerwijzing` | — | skipped (not representable in form-js) |

---

## Known API quirks

- **Uitvoeren Gegevens identifier type:** `identifier` is a number (e.g. `105946`), not a string. `begindatum` is lowercase `d`.
- **RTR typering casing:** the RTR API returns `"Conclusie"` and `"Indieningsvereisten"` (capitalised), not lowercase. All comparisons must be case-insensitive.
- **Opvragen Werkzaamheden `_expandScope`:** the spec documents `logischeRelaties` as valid but the runtime rejects it. Current workaround: call without expand — version history only, no keywords or logical relations.
- **RTR `_wijzigingen`:** is a delta sync endpoint, not a browse endpoint. Use `POST /activiteiten/_zoek` with `bestuursorgaan.oin` for OIN-based browsing.
- **Date format:** `dd-MM-yyyy` throughout.
- **STTR download:** the Uitvoeren Gegevens API path is `/toepasbareRegels/{identifier}/sttrBestand` (not `/sttr`).

---

## Phase plan

### Phase 1 — Navigate ✅ Done (v1.5.0 – v1.5.3)

- DSO Explorer panel: Concepts, Works, and Activities tabs
- Concepts: full-text search across the Stelselcatalogus
- Works: werkzaamheden search + autocomplete, version history, `functioneleStructuurRef` per result
- Activities: RTR list with OIN presets, date filtering, activity detail panel with child/parent navigation, rule types present badges
- DSO environment toggle (pre / prod) in Settings
- `ronl:dsoActiviteitUrn` moddleExtension on `bpmn:Process` with live RTR verification

### Phase 2 — Locate

**Step 2a — Applicable Rules panel in Activity Detail ✅ Done (v1.9.3)**

- For each `regelBeheerobject` with a `functioneleStructuurRef`, calls `GET /toepasbareRegels?functioneleStructuurRef=...` against the Uitvoeren Gegevens API
- Shows per rule entry: validity date (`begindatum`), STTR version (`sttrVersie`), numeric identifier
- Action buttons per entry (see Phase 4)
- Supported for `Conclusie` and `Indieningsvereisten`; `Maatregelen` displayed when present, no action buttons yet

**Step 2d — Activities tab name search (location-scoped) ✅ Done**

- Fixing a location preset (Lelystad / Flevoland) loads that authority's full activity set in one `activiteiten/_zoek` call (`pageSize=200`; the API caps `size` to the actual count — Lelystad 136, Flevoland 50)
- A name search box appears only when a location is fixed, live-filtering the loaded list by `omschrijving` (case-insensitive substring) — purely client-side, no extra API calls
- Solves the problem of finding e.g. `nl.imow-gm0995.activiteit.HoutopstandVellen` ("Boom kappen of houtopstand vellen") without walking the activity hierarchy
- Pagination arrows hidden in OIN mode (single full load); footer shows `N of M activities` when filtering
- The unscoped `/activiteiten` endpoint (date-only, large, paginated) is deliberately not wired to this search

**Step 2b — Works tab → Applicable Rules shortcut ⏳ Pending**

- Each werkzaamheid result carries its own `functioneleStructuurRef` — wire a "View applicable rules" action that queries the Uitvoeren Gegevens API without navigating through the activity hierarchy

**Step 2c — Rule type completeness check ⏳ Pending**

- `POST /regelbeheerobjectedtypen` (Samengestelde services) for a werkzaamheid + location: confirm which rule types are available before attempting generation

### Phase 3 — Map

- ✅ `ronl:dsoActiviteitUrn` on `bpmn:Process` — persisted in BPMN XML
- ✅ `DsoActiviteitSelector` in BPMN Modeler footer: paste URN, verify live, save
- ✅ BPMN shell/subprocess auto-detection on import and startup (v1.9.2)
- ✅ `TreeFellingPermitSubProcess` linked to `nl.imow-gm0995.activiteit.HoutopstandVellen`
- ⏳ Indieningsvereisten checklist in BPMN properties panel
- ⏳ Rule type coverage badges on subprocess element (✓ Form ✓ Decision ✓ Document)

### Phase 4 — Generate

**Step 4.1 — DMN from conclusie STTR ✅ Done (v1.9.3)**

- Backend route `GET /v1/dso/toepasbare-regels/:id/dmn`
- Extracts `<dmn:definitions>...</dmn:definitions>` from the STTR and returns it as a standalone `.dmn` file
- ↓ Extract DMN button in the Applicable Rules panel (Conclusie entries only)

**Operaton deploy + eval normalization (`normalizeDmnForOperaton` in `dso.service.ts`)** — verified against `operaton.open-regels.nl` (engine `1.0.0`). A raw STTR DMN both fails to *deploy* (`ENGINE-22004 Unable to transform DMN resource`) and, once deployable, fails to *evaluate*. Fixes and the LDE/CPSV split:

- ✅ **#1 DMN 1.2 → 1.3 (LDE):** the engine only transforms DMN 1.3, so the four spec namespaces `…/20180521/…` → `…/20191111/…` (incl. http→https). DSO target namespace untouched.
- ✅ **#2 Missing input ids (LDE):** STTR `<input>` / `<inputExpression>` have no `id` (rejected by the engine); a stable id is injected where absent.
- ⏳ **#3 `camunda:historyTimeToLive` (CPSV Editor):** this Operaton enforces HTTL at deploy. It is a deployment policy (TTL value is the org's choice), added by the deployer — the CPSV Editor — not by extraction.
- ✅ **#4 FEEL-safe variable names (LDE):** the STTR names variables with hyphenated GUIDs (`uitv__<guid>`) and spaces (`Boom kappen … _cross`). FEEL reads `-` as subtraction and spaces as separators, so the DMN deploys but **fails to evaluate** (`Exception while evaluating decision`). `sanitizeFeelNames` renames every `<variable>` name to a FEEL-safe identifier and rewrites the exact `<inputExpression>` references; rule logic and output value literals are untouched. This is also the root cause of the validator's INT-007 warnings.
- ✅ **BIZ-004 output typeRef (LDE):** untyped `<output>` columns get the type of their decision's result `<variable>` (default `string`).
- Ruled out (not causes of deploy failure): `outputLabel` on decisionTable.
- Verified: STTR 105946 → after #1+#2+#4+BIZ-004 (and #3 added at deploy) deploys all 7 decisions **and** the root decision evaluates with HTTP 200 (previously a 500 FEEL exception); a minimal `cleanVar` vs `uitv__…-…` test isolated hyphens as the eval breaker.
- **"Import into LDE" — decided: publish via the CPSV Editor → TriplyDB.** Unlike forms, DMNs have no local asset store: the DMN picker (`DmnTemplateSelector`) is populated from **TriplyDB via SPARQL** (`sparqlService.getAllDmns`) and DMN XML is fetched from **Operaton** by identifier; there is no `upsertDmn`/`POST /v1/dmns`. Rather than duplicate a publish pipeline in LDE, the extracted DMN is handed to the **CPSV Editor** (`ttl-editor`, separate codebase), which already (a) deploys DMN XML to Operaton (`/engine-rest/deployment/create`) and (b) publishes the DMN's RDF to the same TriplyDB graph LDE reads. Once published, the DMN appears in LDE's picker automatically — no LDE-side store required.
  - **RDF contract** a DMN must satisfy to appear in LDE (`sparql.service.ts` `getAllDmns` + `ttl-editor` `ttlGenerator.generateDmnSection`): a node `a cprmv:DecisionModel` with `dct:identifier` (→ `camunda:decisionRef`) and `dct:title` required; `cprmv:implements <cpsv:PublicService>`, `cprmv:deploymentId`, `cprmv:deployedAt` expected. Publishing is service-centric — the DMN rides along with a `cpsv:PublicService` definition.
  - **DSO → CPSV-AP mapping:** activity `omschrijving` → PublicService title; `bestuursorgaan` (via `authorityLabel`) → competent authority; primary decision key in the extracted DMN → `dct:identifier`; `functioneleStructuurRef` → provenance.

**Step 4.1b — DSO → CPSV Editor handoff deep-link ✅ Done (LDE side)**

- "Publish via CPSV Editor" button on Conclusie entries in the Applicable Rules panel, alongside ↓ Extract DMN
- Opens the CPSV Editor with a deep-link carrying identifiers + DSO metadata; the DMN XML is **not** in the URL — the CPSV Editor fetches it from the shared LDE backend
- **Deep-link contract** (the interface the CPSV Editor chat must implement):
  ```
  <VITE_CPSV_EDITOR_URL>/?dsoImport=dmn
      &dmnId=<toepasbareRegel identifier, e.g. 105946>
      &env=<pre|prod>
      &activityName=<omschrijving>
      &authority=<resolved authority label, e.g. Lelystad>
      &activityUrn=<nl.imow-…>
      &fsRef=<functioneleStructuurRef>
  ```
  - CPSV Editor fetches DMN XML from: `GET <backend>/v1/dso/toepasbare-regels/<dmnId>/dmn?env=<env>` (same backend both apps already share via `REACT_APP_BACKEND_URL` / `VITE_API_BASE_URL`)
  - `VITE_CPSV_EDITOR_URL` configured per environment (dev `http://localhost:3002`, acc `https://acc.cpsv-editor.open-regels.nl`, prod `https://cpsv-editor.open-regels.nl`)
- **Pending (CPSV Editor chat):** consume the `dsoImport=dmn` params — fetch the DMN, prefill DMNTab + Service/Organization tabs from the DSO metadata, then deploy + publish through the existing pipeline.

**Step 4.2 — Form scaffold from indieningsvereisten STTR ✅ Done (v1.9.3)**

- Backend route `GET /v1/dso/toepasbare-regels/:id/form-scaffold`
- Parses `uitv:uitvoeringsregels` from `dmn:extensionElements`, maps questions to form-js field types
- ↓ Form scaffold button in the Applicable Rules panel (Indieningsvereisten entries only)
- Output is a ready-to-use form-js JSON schema
- ✅ **"Import into LDE" button** — saves the scaffold straight into the LDE form store via `FormService.saveForm` (localStorage + `POST /v1/assets/forms`), stamped with the execution-platform metadata the editor/Operaton deploy expect. Appears in the Form Editor as a `wip` draft named `<activity> — Submission requirements`, tagged with the authority as organization. Unlike the DMN side, forms already have a local asset store, so no backend changes were needed.

**Step 4.3 — Document template from maatregelen STTR ⏳ Pending**

- Each `<maatregel>` element → beschikking document zone: `maatregeltekst` → label, `toelichting` → body
- Requires a `maatregelen` activity — none confirmed in the current test set

**Step 4.4 — BPMN subprocess scaffold ⏳ Pending**

- Generate complete subprocess XML wired to imported DMN, form, and document template via `ronl:` moddleExtensions

### Phase 5 — Deploy ⏳ Pending

- Wire subprocess into AWB shell as call activity
- Deploy bundle via existing LDE mechanism: BPMN + DMN + form + document template
- Process runnable in Operaton with DSO-authoritative rule content

---

## Current state — v1.9.3

| Capability | Status |
|---|---|
| DSO Concepts tab | ✅ Live |
| DSO Works tab — search + autocomplete + version history | ✅ Live |
| DSO Activities tab — list + OIN presets + date filter | ✅ Live |
| DSO Activity Detail panel | ✅ Live |
| DSO environment toggle (pre / prod) | ✅ Live |
| `ronl:dsoActiviteitUrn` on BPMN subprocess with live verification | ✅ Live |
| BPMN shell/subprocess auto-detection on import and startup | ✅ Live |
| Applicable Rules panel (Phase 2a) | ✅ Live |
| Activities tab name search (location-scoped, Phase 2d) | ✅ Live |
| ↓ STTR download (conclusie + indieningsvereisten) | ✅ Live |
| ↓ Extract DMN (conclusie) | ✅ Live |
| ↓ Form scaffold (indieningsvereisten) | ✅ Live |
| Werkzaamheid keywords + logical relations | ⏳ Pending (`_expandScope` enum) |
| Works tab → Applicable Rules shortcut (Phase 2b) | ⏳ Pending |
| Rule type completeness check (Phase 2c) | ⏳ Pending |
| Import form scaffold into LDE from STTR | ✅ Live |
| DMN → CPSV Editor publish handoff deep-link (Phase 4.1b, LDE side) | ✅ Live |
| DMN handoff consumed in CPSV Editor (fetch + prefill + publish) | ⏳ Pending (CPSV Editor chat) |
| Maatregelen → document template scaffold (Phase 4.3) | ⏳ Pending |
| BPMN subprocess scaffold (Phase 4.4) | ⏳ Pending |
| Deploy bundle to Operaton (Phase 5) | ⏳ Pending |

---

## Reference: HoutopstandVellen — confirmed working example

**Activity:** Boom kappen of houtopstand vellen · Gemeente Lelystad (GM0995)
**URN:** `nl.imow-gm0995.activiteit.HoutopstandVellen`
**OIN:** `00000001005024249000`
**Environment:** pre-production and production
**BPMN link:** `TreeFellingPermitSubProcess.bpmn` via `ronl:dsoActiviteitUrn`

| Rule type | `functioneleStructuurRef` | Uitvoeren Gegevens identifier |
|---|---|---|
| Conclusie | `http://toepasbare-regels.omgevingswet.overheid.nl/00000001005024249000/id/concept/Conclusienl.imow-gm0995.activiteit.HoutopstandVellen` | 105946 |
| Indieningsvereisten | `http://toepasbare-regels.omgevingswet.overheid.nl/00000001005024249000/id/concept/IndieningsvereistenVergunningnl.imow-gm0995.activiteit.HoutopstandVellen` | 105947 |

Generated artifacts committed to `examples/organizations/flevoland/STTR/`:

| File | Content |
|---|---|
| `sttr-105946.xml` | Raw STTR (conclusie) |
| `sttr-105947.xml` | Raw STTR (indieningsvereisten) |
| `decision-105946.dmn` | Extracted DMN — ready for import into LDE / Operaton |
| `form-scaffold-105947.json` | form-js schema — 10 fields (select, textarea, textfield, number, checkbox, bijlage) |

---

## Reference: other confirmed test activities

### "Bed & Breakfast starten" (Lelystad, production)

- **URN:** `nl.imow-gm0995.activiteit.a42ec23b8e4d464b8d32a1e88ac6d4cd`
- **Rule types:** Conclusie ✅ + Indieningsvereisten ✅
- **Note:** `toonbaar: false` — not visible in the public Omgevingsloket but fully queryable via the API
- **Conclusie `functioneleStructuurRef`:** `http://toepasbare-regels.omgevingswet.overheid.nl/00000001005024249000/id/concept/Conclusienl.imow-gm0995.activiteit.a42ec23b8e4d464b8d32a1e88ac6d4cd`
- **Indieningsvereisten `functioneleStructuurRef`:** `http://toepasbare-regels.omgevingswet.overheid.nl/00000001005024249000/id/concept/IndieningsvereistenVergunningnl.imow-gm0995.activiteit.a42ec23b8e4d464b8d32a1e88ac6d4cd`

### "Boom kappen" (Groningen, pre-production)

- **URN:** `nl.imow-gm0014.activiteit.1d52a3b09a7a4b2f846ae1e171f6678d`
- **Authority:** gemeente GM0014
- **Rule types:** Conclusie ✅
