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

The file **is** a deployable DMN. "Extract DMN" returns the full `<dmn:definitions>` element as a standalone `.dmn` file, which can be imported into LDE or deployed to Operaton directly.

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
- Next: "Import into LDE" button to register the DMN as a new asset linked to the subprocess

**Step 4.2 — Form scaffold from indieningsvereisten STTR ✅ Done (v1.9.3)**

- Backend route `GET /v1/dso/toepasbare-regels/:id/form-scaffold`
- Parses `uitv:uitvoeringsregels` from `dmn:extensionElements`, maps questions to form-js field types
- ↓ Form scaffold button in the Applicable Rules panel (Indieningsvereisten entries only)
- Output is a ready-to-use form-js JSON schema
- Next: "Import into LDE" button to register the form as a new asset

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
| ↓ STTR download (conclusie + indieningsvereisten) | ✅ Live |
| ↓ Extract DMN (conclusie) | ✅ Live |
| ↓ Form scaffold (indieningsvereisten) | ✅ Live |
| Werkzaamheid keywords + logical relations | ⏳ Pending (`_expandScope` enum) |
| Works tab → Applicable Rules shortcut (Phase 2b) | ⏳ Pending |
| Rule type completeness check (Phase 2c) | ⏳ Pending |
| Import DMN into LDE from STTR | ⏳ Pending |
| Import form scaffold into LDE from STTR | ⏳ Pending |
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
