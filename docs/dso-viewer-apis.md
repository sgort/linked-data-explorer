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

Six separate DSO APIs back the viewer. Base URLs are configured per environment in
`packages/backend/src/utils/config.ts` (`config.dso` = pre, `config.dsoProd` = prod)
and are overridable via environment variables.

| # | API | Purpose in LDE | Pre-production base URL | Env var |
|---|-----|----------------|--------------------------|---------|
| 1 | **Stelselcatalogus** `catalogus/api/opvragen/v3` | Concept/term lookup | `service.pre.omgevingswet.overheid.nl/publiek/catalogus/api/opvragen/v3` | `DSO_CATALOGUE_BASE_URL` |
| 2 | **RTR Gegevens** `toepasbare-regels/api/rtrgegevens/v2` | Activities (activiteiten) and their rule objects | `…/publiek/toepasbare-regels/api/rtrgegevens/v2` | `DSO_RTR_BASE_URL` |
| 3 | **Zoekinterface** `toepasbare-regels/api/zoekinterface/v2` | Werkzaamheden search + autocomplete | `…/publiek/toepasbare-regels/api/zoekinterface/v2` | `DSO_ZOEKINTERFACE_BASE_URL` |
| 4 | **Opvragen Werkzaamheden** `toepasbare-regels/api/opvragenwerkzaamheden/v1` | Versioned werkzaamheid detail | `…/publiek/toepasbare-regels/api/opvragenwerkzaamheden/v1` | `DSO_OPVRAGEN_WERKZAAMHEDEN_BASE_URL` |
| 5 | **Toepasbare Regels Uitvoeren Gegevens** `…/toepasbareregelsuitvoerengegevens/v1` | Rule metadata + STTR file download | `…/publiek/toepasbare-regels/api/toepasbareregelsuitvoerengegevens/v1` | `DSO_UITVOEREN_GEGEVENS_BASE_URL` |
| 6 | **Ozon Omgevingsdocumenten Presenteren v8** `omgevingsdocumenten/api/presenteren/v8` | Regelingen search, regeltekst annotation graph, document component text — backs the activity dossier (`docs/dso-activity-dossier.md`) | `…/publiek/omgevingsdocumenten/api/presenteren/v8` | `DSO_OZON_BASE_URL` |

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

**The selection is shared, not local.** `selectedUrn`, the active validity date,
the authority OIN and the authority level live in `DsoExplorer` rather than in
this tab, so the Quality Profile tab (§2.5) can read them. Switching tabs
preserves all four; changing Level or Authority, clicking Load, and closing the
detail panel still clear the selection. The detail panel also carries a
quality-profile teaser, which renders from the client cache only and never
triggers the dossier call on its own — see §2.5.

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
  `urn` / `datum` / `env` change, so the frontend itself never caches across
  navigations. The backend does, though: `dso.service.ts`'s `getActiviteit`
  (API 2's detail call, which every child request hits) is TTL-cached for 5
  minutes, so re-opening an activity you already visited within that window
  reuses the cached response rather than re-hitting the RTR. There is
  **still no concurrency cap**: navigating into a child issues its own
  1 + N fan-out regardless of how many requests are already in flight.

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

### 2.5 Quality Profile tab (`QualityProfileTab`)

The fourth tab. It shows the quality profile of the activity **currently
selected in the Activities tab**: how much of that activity's chain is readable
as it stands, and how much the dossier had to recover. The concepts behind the
numbers — the two axes, the three identifier classes, and why no single headline
grade is produced — are in
[`dso-activity-dossier.md` §8](dso-activity-dossier.md); this section covers only
how the tab is wired.

**Shared selection.** `selectedUrn`, the active validity date, the authority OIN
and the authority level live in `DsoExplorer`, not in `ActiviteitenTab`, so a tab
other than Activities can read the current selection. Switching tabs does not
clear it. Changing Level or Authority, clicking Load, and closing the detail
panel all still do. Returning to Activities restores the authority's filtered
list rather than resetting to the unfiltered date-based one.

**One call, lazily.** `getActiviteitDossier(urn, env, datum?, authority?)` →
`GET /v1/dso/activiteiten/:urn/dossier` → **APIs 2 + 5 + 6**. That single call
fans out across three upstream APIs, so it is the most expensive request the
viewer makes. It is issued only when the Quality Profile tab is active, cached
client-side by `env|datum|urn`, and never triggered merely by selecting an
activity. The `authority` parameter is sent as a bevoegd-gezag **code**
(`gm0995`), not an OIN — the backend matches it against `bevoegdGezag`.

**What it renders.** A context toolbar (activity, authority, `Compare with`,
`Dossier .md`), an activity summary card, one scorecard per rule set with the
decision and input tables behind them, the legal-source articles, and a footer
carrying the environment and validity date. Compare mode fetches a second
dossier — the same activity local name under another authority's prefix, using
*that* authority's code — and switches to a matrix that keeps the two side by
side. Conclusie and Indieningsvereisten are always separate columns; nothing is
averaged.

**Detail-panel teaser.** `ActivityDetailPanel` shows a two-row summary of the
same profile, and is the one place the two rule sets are summed — it is a
pointer into the tab, not a score. It renders from the client cache only, so
selecting an activity never triggers the expensive call.

**Markdown download.** The `Dossier .md` button renders the same Markdown as the
CLI. Both import `renderDossier` from `scripts/dossier-render.mjs`; a test
asserts the two references are the same function object, so the CLI output and
the download cannot drift apart.

### 2.6 BPMN modeler — DSO activity selector

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
| `/v1/dso/activiteiten/:urn/dossier` | GET | 2 RTR + 5 Uitvoeren Gegevens + 6 Ozon | Joins §2.3–§2.4's calls plus Ozon; see `docs/dso-activity-dossier.md` |
| `/v1/dso/regelingen/zoek` | POST | 6 Ozon | `POST /regelingen/_zoek` |
| `/v1/dso/regelingen/:id/annotaties` | GET | 6 Ozon | `GET /regelingen/{id}/regeltekstannotaties` |
| `/v1/dso/regelingen/:id/documentstructuur/:wId` | GET | 6 Ozon | `GET /regelingen/{id}/documentstructuur/{wId}` |

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
  issues `1 + N` RTR requests with no batching or concurrency limit (see §2.3).
  Each request is TTL-cached server-side for 5 minutes, so repeat fan-outs within
  that window are cheap, but the first fan-out for a given activity still costs
  `1 + N` upstream calls in one burst. It exists only to turn hrefs into readable
  names. If child counts grow or DSO rate limiting appears, a concurrency cap is
  the first thing to add.
- **The regeling lookup is per bestuurslaag, not omgevingsplan-only.** An
  omgevingsplan (`regelingtype_003`) is the gemeente instrument. Provincie
  publishes an Omgevingsverordening (`_004`), waterschap a
  Waterschapsverordening (`_005`), rijk an AMvB (`_001`). The dossier picks by
  the activity's `bestuursorgaan.bestuurslaag`, falling back to the authority
  code prefix. An earlier version hardcoded `_003`, so every provincie,
  waterschap and rijk activity silently reported "no omgevingsplan" — a failure
  that went unnoticed because nothing exercised those levels. See
  [`dso-activity-dossier.md` §2](dso-activity-dossier.md).
- **Taxonomy nodes have no rules of their own.** An activity with an empty
  `regelBeheerObjecten`, `toonbaar: false` and one or more
  `onderliggendeActiviteiten` is a grouping node; its children carry the rules.
  `nl.imow-mnre1034.activiteit.Rijksmonumentenactiviteit` → `RijksmonArchMonument`
  and `RijkmonMonument` is the clearest example. An empty dossier for such a URN
  is the correct answer, not a lookup failure.
- **A dossier can legitimately resolve three of four links.** Where no regeling
  annotates the activity, `legalSource.available` is false and
  `provenance.failures` records which regelingen were checked and found not to
  annotate it, separately from any that could not be fetched. The request is not
  rejected: a valid URN is not a malformed request.
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
| `packages/backend/src/services/dso.service.ts` | Outbound calls to APIs 1–5, STTR/DMN/form parsing |
| `packages/backend/src/services/ozon.service.ts` | Outbound calls to API 6 (Ozon Presenteren v8) |
| `packages/backend/src/services/dossier.service.ts` | The four-link join — the only place it lives |
| `packages/backend/src/services/quality.service.ts` | Dossier → quality profile. Pure, no I/O |
| `packages/backend/src/utils/ttl-cache.ts` | Shared TTL cache (activity detail, annotation graphs) |
| `packages/backend/src/routes/dso.routes.ts` | `/v1/dso` proxy endpoints |
| `packages/backend/src/routes/registry.ts` | Mounts the router at `/v1/dso` |
| `packages/frontend/src/services/dsoService.ts` | Typed client + HAL unwrapping + dossier cache |
| `packages/frontend/src/components/DsoExplorer/DsoExplorer.tsx` | The four tabs, shared selection, rules panel, CPSV handoff |
| `packages/frontend/src/components/DsoExplorer/QualityProfileTab.tsx` | The Quality Profile tab (§2.5) |
| `packages/frontend/src/components/DsoExplorer/shared.tsx` | `Section`, `TYPERING_META`, naming/tone tokens |
| `packages/frontend/src/components/BpmnModeler/DsoActiviteitSelector.tsx` | URN verification in the BPMN modeler |
| `scripts/dossier-render.mjs` | `renderDossier` — shared by the CLI and the browser download |
| `scripts/dso-dossier.mjs` | The `npm run dso:dossier` CLI |
