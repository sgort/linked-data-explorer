# DSO Viewer — API Reference

How the LDE DSO Viewer (`DsoExplorer`) talks to the Digitaal Stelsel Omgevingswet.

The frontend never calls DSO directly. Every request goes through the LDE backend,
which mounts its DSO proxy at `/v1/dso` (`packages/backend/src/routes/registry.ts`)
and attaches the `x-api-key` credential server-side. This keeps the DSO key out of
the browser and lets a single `X-Dso-Env` header switch the whole viewer between the
pre-production and production stelsel.

**Call path:** `DsoExplorer.tsx` → `dsoService.ts` (frontend) → `LDE /v1/dso/*` →
`dso.service.ts` (backend) → DSO API.

---

## 1. Upstream DSO APIs

Five separate DSO APIs back the viewer. Base URLs are configured per environment in
`packages/backend/src/utils/config.ts` (`config.dso` = pre, `config.dsoProd` = prod)
and are overridable via environment variables.

| # | API | Purpose in LDE | Pre-production base URL | Env var |
|---|-----|----------------|--------------------------|---------|
| 1 | **Stelselcatalogus** `catalogus/api/opvragen/v3` | Concept/term lookup | `service.pre.omgevingswet.overheid.nl/publiek/catalogus/api/opvragen/v3` | `DSO_CATALOGUE_BASE_URL` |
| 2 | **RTR Gegevens** `toepasbare-regels/api/rtrgegevens/v2` | Activities (activiteiten) and their rule objects | `…/publiek/toepasbare-regels/api/rtrgegevens/v2` | `DSO_RTR_BASE_URL` |
| 3 | **Zoekinterface** `toepasbare-regels/api/zoekinterface/v2` | Werkzaamheden search + autocomplete | `…/publiek/toepasbare-regels/api/zoekinterface/v2` | `DSO_ZOEKINTERFACE_BASE_URL` |
| 4 | **Opvragen Werkzaamheden** `toepasbare-regels/api/opvragenwerkzaamheden/v1` | Versioned werkzaamheid detail | `…/publiek/toepasbare-regels/api/opvragenwerkzaamheden/v1` | `DSO_OPVRAGEN_WERKZAAMHEDEN_BASE_URL` |
| 5 | **Toepasbare Regels Uitvoeren Gegevens** `…/toepasbareregelsuitvoerengegevens/v1` | Rule metadata + STTR file download | `…/publiek/toepasbare-regels/api/toepasbareregelsuitvoerengegevens/v1` | `DSO_UITVOEREN_GEGEVENS_BASE_URL` |

Production URLs are the same paths on `service.omgevingswet.overheid.nl` (no `.pre`),
selected with the `_PROD` suffixed variables plus `DSO_API_KEY_PROD`.

**Transport conventions**
- Auth: `x-api-key: <DSO_API_KEY>` on every request.
- `Accept: application/hal+json` (except STTR downloads → `application/xml`, and
  `_suggereer` → `application/json`).
- Timeout: `DSO_TIMEOUT`, default 15 000 ms, enforced with `AbortController`.
- Errors: any non-2xx from DSO becomes a `502` from LDE with the upstream body in the
  message; a `404` in that message is passed through as `404`.
- Responses are HAL and returned **verbatim** inside LDE's `{ success, data }` envelope —
  the frontend unwraps `_embedded.*` and `_links.next` itself.

---

## 2. Features → APIs

### 2.1 Concepts tab (`BegrippenTab`)

Free-text search over the Stelselcatalogus, paged 20 at a time.

| Layer | Call |
|-------|------|
| UI | `searchBegrippen(term, page, env)` |
| LDE | `GET /v1/dso/begrippen?zoekTerm&geldigOp&page&pageSize` |
| DSO | **API 1** `GET /begrippen?zoekTerm&geldigOp&page&pageSize` |

Results read from `_embedded.begrippen`; `geldigOp` (validity date, `YYYY-MM-dd`)
is supported by the backend but not currently exposed in the UI.

### 2.2 Werkzaamheden tab (`WerkzaamhedenTab`)

Three calls: type-ahead suggestions, the search itself, and version detail when a
result is expanded.

| Function | LDE endpoint | DSO call |
|----------|--------------|----------|
| Autocomplete | `POST /v1/dso/werkzaamheden/suggereer` | **API 3** `POST /werkzaamheden/_suggereer` — body `{ zoekterm }` |
| Search | `POST /v1/dso/werkzaamheden/zoek` | **API 3** `POST /werkzaamheden/_zoek?page&pageSize` |
| Detail | `GET /v1/dso/werkzaamheden/:urn` | **API 4** `GET /werkzaamheden/{urn}?pageSize=100` |

Note the split: search and suggest hit the *Zoekinterface* (API 3), while the detail
view — which returns the full `_embedded.werkzaamheidversies` list with `trefwoorden`
and `logischeRelaties` — hits *Opvragen Werkzaamheden* (API 4). Suggestion failures
degrade silently to an empty list rather than surfacing an error.

### 2.3 Activities tab (`ActiviteitenTab`)

Two load modes, both against the RTR:

**Mode A — by date (default).** Lists all activities valid on a date, paged 20.

| Layer | Call |
|-------|------|
| UI | `getActiviteiten(datum, page, env)` |
| LDE | `GET /v1/dso/activiteiten?datum&page&pageSize` |
| DSO | **API 2** `GET /activiteiten?datum&page&pageSize` |

**Mode B — by authority (location presets).** Clicking a preset loads that
authority's complete activity set in one call (`pageSize=200`), so the name filter
can run client-side.

| Layer | Call |
|-------|------|
| UI | `getActiviteitenByOin(oin, env, datum)` |
| LDE | `POST /v1/dso/activiteiten/oin` — body `{ oin, datum }` |
| DSO | **API 2** `POST /activiteiten/_zoek?page=1&pageSize=200` — body `{ datum, bestuursorgaan: { oin } }` |

Presets are hard-coded in `LOCATION_PRESETS`: Lelystad `00000001005024249000`,
Flevoland `00000001006203243000`, Ede `00000001001104524000`, Gelderland
`00000001001825100000`. The OIN→name map exists because the RTR only returns the
authority code (e.g. `GM0995`), never a readable name.

**Detail.** Selecting an activity fetches:

| Layer | Call |
|-------|------|
| UI | `getActiviteitDetail(urn, datum, env)` |
| LDE | `GET /v1/dso/activiteiten/:urn?datum` |
| DSO | **API 2** `GET /activiteiten/{urn}?datum` |

The detail response carries `regelBeheerObjecten` (which unlocks §2.4) and
`_links.onderliggendeActiviteiten` — a list of HAL hrefs and nothing else.

**Child-activity fan-out (1 + N requests).** Because the RTR returns bare hrefs
for children, with no `omschrijving`, the panel cannot label them without asking
the API about each one individually. So as soon as the parent resolves,
`ActivityDetailPanel` fires **one additional activity-detail request per child,
all in parallel**, purely to read each child's name:

```
GET /v1/dso/activiteiten/{parent-urn}       ->  1 request
  |- GET /v1/dso/activiteiten/{child-1}     -+
  |- GET /v1/dso/activiteiten/{child-2}      |-  N requests, fired together
  |- ...                                    -+
```

Every one of these is the same endpoint chain as the parent — LDE
`GET /v1/dso/activiteiten/:urn` → **API 2** `GET /activiteiten/{urn}?datum` — so a
single click costs `1 + N` upstream RTR calls. N is whatever the parent declares:
an activity such as *Bedrijfsactiviteiten* with 23 children means 24 requests to
render one detail panel.

Behaviour worth knowing:

- The fan-out uses `Promise.allSettled`, so one failing child never breaks the
  panel or the other lookups.
- Children that resolve render as a named blue link; children that fail, or that
  return no `omschrijving`, fall back to the raw URN — still clickable, just
  unlabelled. This is why a panel can show a mix of names and URNs.
- The `Child activities (N)` heading counts the *href list*, not the resolved
  names, so the count stays correct even when some lookups fail.
- Each child request inherits the parent's `datum` and `env`.
- Names live in local component state, cleared and re-fetched on every
  `urn` / `datum` / `env` change. There is **no cache and no concurrency cap**:
  navigating into a child issues its own fan-out, and re-opening an activity you
  already visited fetches everything again.

Dates in the UI are ISO (`YYYY-MM-DD`) and converted to the DSO's `dd-MM-yyyy` before
being sent; when omitted, the backend defaults to today.

### 2.4 Applicable rules panel (`regelBeheerObjecten`)

For each rule object on a selected activity, the panel resolves its
`functioneleStructuurRef` to concrete rule files. Rule objects are typed
`Conclusie` (decision criteria), `Indieningsvereisten` (submission requirements) or
`Maatregelen` (measures) — the API returns capitalised forms, and the UI accepts both
cases.

| Layer | Call |
|-------|------|
| UI | `fetchToepasbareRegels(functioneleStructuurRef, env)` |
| LDE | `GET /v1/dso/toepasbare-regels?functioneleStructuurRef=…` |
| DSO | **API 5** `GET /toepasbareRegels?functioneleStructuurRef=…` |

Each returned `identifier` then drives three download/extract actions — all three hit
the *same* upstream endpoint and differ only in what LDE does with the XML:

**DSO call (shared):** **API 5** `GET /toepasbareRegels/{id}/sttrBestand` → raw STTR XML.

| Action | LDE endpoint | Server-side processing |
|--------|--------------|------------------------|
| Download STTR | `GET /v1/dso/toepasbare-regels/:id/sttr` | none — XML passed through as an attachment |
| Extract DMN | `GET /v1/dso/toepasbare-regels/:id/dmn` | `extractDmnFromSttr` — pulls the embedded `<definitions>` and normalises it for Operaton |
| Form scaffold | `GET /v1/dso/toepasbare-regels/:id/form-scaffold?formId` | `extractFormScaffoldFromSttr` — parses `uitv:uitvoeringsregels` into a form-js schema |

**DMN normalisation** (`normalizeDmnForOperaton`) applies five fixes that make
Sogelink STTR Builder output both deployable and evaluatable: DMN 1.2 → 1.3
namespaces; injected `id` on `<input>`/`<inputExpression>`; FEEL-safe `<variable>`
names with rewritten `<inputExpression>` references; `typeRef` on untyped outputs
(BIZ-004); and `camunda:historyTimeToLive="180"` per decision.

**Form scaffold** maps STTR question types to form-js fields — `boolean` → checkbox,
`list` → select (options from `uitv:optie`), `number` → number, `inter:inputType=textarea`
→ textarea, otherwise textfield. `uitv:bijlage` becomes a labelled placeholder
textfield; `uitv:geoVerwijzing` is skipped as unrepresentable. The scaffold can be
downloaded as JSON or imported straight into the LDE Form Editor (stamped with
`executionPlatform: Camunda Platform 7.21.0` and `status: 'dso'`).

**DMN publish handoff.** LDE has no local DMN store, so the extracted DMN is handed to
the CPSV Editor by deep-link: `<VITE_CPSV_EDITOR_URL>/?dsoImport=dmn&dmnId=<id>&env=<pre|prod>`
plus activity metadata. Only identifiers travel in the URL — the CPSV Editor fetches
the XML itself from `GET /v1/dso/toepasbare-regels/{dmnId}/dmn?env=<env>` on this same
backend, so this LDE endpoint is a **cross-application contract**, not just internal.

### 2.5 BPMN modeler — DSO activity selector

Outside the viewer proper, `DsoActiviteitSelector` verifies a manually entered
activity URN when linking a BPMN process to a DSO activity. It reuses
`getActiviteitDetail` → `GET /v1/dso/activiteiten/:urn` → **API 2**, always against
the `pre` environment (no `env` argument is passed).

---

## 3. Endpoint map (complete)

| LDE endpoint | Method | DSO API | Upstream call |
|--------------|--------|---------|---------------|
| `/v1/dso/begrippen` | GET | 1 Catalogus | `GET /begrippen` |
| `/v1/dso/activiteiten` | GET | 2 RTR | `GET /activiteiten` |
| `/v1/dso/activiteiten/:urn` | GET | 2 RTR | `GET /activiteiten/{urn}` |
| `/v1/dso/activiteiten/oin` | POST | 2 RTR | `POST /activiteiten/_zoek` (bestuursorgaan) |
| `/v1/dso/activiteiten/zoek` | POST | 2 RTR | `POST /activiteiten/_zoek` (date + geometry) |
| `/v1/dso/werkzaamheden/zoek` | POST | 3 Zoekinterface | `POST /werkzaamheden/_zoek` |
| `/v1/dso/werkzaamheden/suggereer` | POST | 3 Zoekinterface | `POST /werkzaamheden/_suggereer` |
| `/v1/dso/werkzaamheden/:urn` | GET | 4 Opvragen Werkzaamheden | `GET /werkzaamheden/{urn}` |
| `/v1/dso/toepasbare-regels` | GET | 5 Uitvoeren Gegevens | `GET /toepasbareRegels` |
| `/v1/dso/toepasbare-regels/:id/sttr` | GET | 5 Uitvoeren Gegevens | `GET /toepasbareRegels/{id}/sttrBestand` |
| `/v1/dso/toepasbare-regels/:id/dmn` | GET | 5 Uitvoeren Gegevens | `GET /toepasbareRegels/{id}/sttrBestand` + DMN extraction |
| `/v1/dso/toepasbare-regels/:id/form-scaffold` | GET | 5 Uitvoeren Gegevens | `GET /toepasbareRegels/{id}/sttrBestand` + form-js scaffold |

Every endpoint accepts the environment via `X-Dso-Env: prod` header or `?env=prod`
query parameter (header takes precedence); anything else falls back to `pre`.

---

## 4. Notes and loose ends

- **Environment selection** is a user setting: `App.tsx` keeps `dsoEnv` in
  `localStorage` under `lde_dso_env` and passes it down. The viewer header shows a
  `pre-production` / `production` badge.
- **Geo search is not wired up.** `POST /v1/dso/activiteiten/zoek` supports a
  WGS84 point (`geometrie` + `crs=epsg:4326`) and is implemented and tested end to
  end in both the backend and `dsoService.ts`, but no UI calls it — the Activities
  tab uses date and OIN modes only. It is ready for a map/point-selection feature.
- **The child fan-out is the viewer's heaviest interaction.** Opening one activity
  issues `1 + N` RTR requests with no batching, caching or concurrency limit
  (see §2.3). It exists only to turn hrefs into readable names. If child counts
  grow or DSO rate limiting appears, this is the first thing to memoise.
- **Timeout on production requests** uses `config.dso.timeout`; `config.dsoProd` has
  no `timeout` field of its own, so both environments share the pre-production value.
- **Doc drift:** the route comments for `/begrippen` and `/activiteiten` say the
  `pageSize` default is 10, while `dso.service.ts` defaults to 20
  (`DEFAULT_PAGE_SIZE`). The frontend always sends an explicit `pageSize`, so this
  only affects direct API consumers.

---

## 5. Source files

| File | Role |
|------|------|
| `packages/backend/src/utils/config.ts` | Base URLs, API keys, timeout (pre + prod) |
| `packages/backend/src/services/dso.service.ts` | All outbound DSO calls, STTR/DMN/form parsing |
| `packages/backend/src/routes/dso.routes.ts` | `/v1/dso` proxy endpoints |
| `packages/backend/src/routes/registry.ts` | Mounts the router at `/v1/dso` |
| `packages/frontend/src/services/dsoService.ts` | Typed client + HAL unwrapping |
| `packages/frontend/src/components/DsoExplorer/DsoExplorer.tsx` | The three tabs, rules panel, CPSV handoff |
| `packages/frontend/src/components/BpmnModeler/DsoActiviteitSelector.tsx` | URN verification in the BPMN modeler |
