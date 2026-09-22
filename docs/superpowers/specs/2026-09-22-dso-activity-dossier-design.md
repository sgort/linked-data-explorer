# DSO Activity Dossier — design

**Date:** 2026-09-22
**Status:** design approved, spec under review
**Worked example:** `nl.imow-gm0995.activiteit.HoutopstandVellen` ("Boom kappen of houtopstand vellen", gemeente Lelystad)

## Problem

LDE's DSO integration covers five upstream APIs. All five sit on the *executable* side
of the stelsel: the RTR's activity register, the werkzaamheden registry, the
Stelselcatalogus, and the toepasbare-regels that yield STTR, DMN and form scaffolds.

None of them answer the question an analyst actually asks about an activity:

> Which article of which omgevingsplan makes this activity permit-liable, what was
> annotated onto that article, and how do the decision criteria and submission
> requirements follow from it?

That chain — **legal source → annotation(s) → decision criteria → submission
requirements** — spans a sixth API that LDE does not proxy at all:
**Omgevingsdocumenten Presenteren** (Ozon), v8.5.2, 39 endpoints, at
`…/omgevingsdocumenten/api/presenteren/v8`. The existing production and
pre-production DSO keys already authenticate against it; nothing new needs
provisioning.

The result is that the juridical half of the chain is invisible to LDE, and each
analysis of an activity is done by hand against raw HAL payloads.

## Goals

1. Make the four-link chain retrievable for **any** IMOW activity URN, in either DSO
   environment, on any validity date, as a single call.
2. Produce a repeatable written analysis from that call, so the same work for another
   municipality or another activity is a parameter change and not a new investigation.
3. Add the Ozon proxy routes LDE is missing, in the style of the existing DSO proxy.
4. Give the repository one shared caching mechanism instead of a second hand-rolled
   one, and use it to remove the repeat cost from the existing child-activity fan-out.
5. Score each activity's **quality profile** — how much of its meaning is legible as it
   stands, and how much has to be recovered from elsewhere — so activities can be
   compared across municipalities and data-quality defects become visible.

Non-goals: a UI panel (the dossier object is designed to make one cheap later, but it
is not in this scope); writing to DSO; a concurrency cap on the fan-out (see Caching);
migrating `sparql.service.ts` onto the shared cache. No existing route changes its
contract — the activity-detail route gains caching behind an unchanged response shape.

## What was verified against production

Every claim below was confirmed by live calls to production DSO on 2026-09-22 for
`nl.imow-gm0995.activiteit.HoutopstandVellen`.

| Link | Verified result |
|---|---|
| Legal source | 10 juridische regels; 5 qualified `vergunningplicht`; articles in ch. 15.4 plus legacy 22.299. Article text returned as STOP/IMOP XML — art. 15.2 para 5: *"Het is verboden zonder omgevingsvergunning bomen te kappen of houtopstanden te vellen, als: …"* |
| Annotation | IMOW activity `groep` = `Kapactiviteit`, parent `OverigeAct`, symbol `vag104`; locatie refs = ambtsgebied + `gebiedengroep…` ("bebouwingscontour, houtkap") |
| Decision criteria | Conclusie, toepasbare regel **`114233`**, STTR versie **2**, vanaf 30-07-2026. DMN: 7 decisions, 5 inputs, 5 questions |
| Submission requirements | Indieningsvereisten, toepasbare regel **`105947`**, STTR versie 1, vanaf 12-12-2025, toestemming `Vergunning` / "Aanvraag vergunning" |

**Toepasbare-regel ids are environment-specific and are not stable identifiers.** The
same Conclusie is `114233` (STTR v2) on production and `85149` (STTR v1) on
pre-production. An id read from one environment returns a *different authority's rule*
in the other — during this analysis `85149` on production resolved to a `ws0656`
waterschap DMN. The dossier must therefore always resolve ids from
`functioneleStructuurRef` within the requested environment, and never carry an id
across environments. Test fixtures must record which environment they came from.

Three findings that justify assembling the links together rather than separately:

- The `gebiedengroep.180a63f795be43bf8683a480e75deb84` that the RTR added to the
  activity's `locaties` on **12-12-2025** is the same "bebouwingscontour, houtkap"
  that art. 15.10's annotation points at. The RTR shows *that* the activity was
  geographically refined; only the annotation layer explains *why*.
- Pre-production and production disagree for this activity: production has
  `beginDatum` 01-01-2024 and two locaties, pre-production has 14-05-2022 and one.
  Any dossier is therefore only meaningful with its environment and date attached.
- **The same `gebiedengroep` appears in all three layers.** The production Conclusie
  DMN embeds exactly one IMOW reference —
  `nl.imow-gm0995.gebiedengroep.180a63f795be43bf8683a480e75deb84` — and it is the same
  object that the RTR lists under `locaties` and that art. 15.10's annotation points
  at. Its readable name, "bebouwingscontour, houtkap", exists **only** in the
  annotation layer; the DMN carries the bare URN. The executable rule and the legal
  rule are provably the same rule, but nothing in either artefact says so on its own.
  Both the RTR locatie and the Indieningsvereisten rule carry `12-12-2025`, the date
  that refinement was published.

## Architecture

### Component boundaries

```
utils/ttl-cache.ts          new: the one caching mechanism (see Caching)

dossier.service.ts          assembles the four links (the only place the join lives)
  |- dso.service.ts         existing: RTR, Uitvoeren Gegevens   (+ cached detail lookup)
  |- ozon.service.ts        new: Presenteren v8 passthroughs
  |- utils/ttl-cache.ts

quality.service.ts          dossier -> quality profile (pure, no I/O)

dso.routes.ts               + 3 passthrough routes, + 1 composite route
scripts/dso-dossier.mjs     renders dossier + profile to Markdown
```

`dossier.service.ts` is the only unit that knows how the links join. `ozon.service.ts`
knows only how to talk to Presenteren. `quality.service.ts` takes a finished dossier
and returns a profile, touching no network. The script knows only how to render. Each
can be tested without the others: the join against recorded fixtures, the profile
against a dossier object literal, the script against a profile object literal.

### New configuration

`config.dso` and `config.dsoProd` each gain one field, following the existing
five-base-URL pattern exactly:

```
ozonBaseUrl: process.env.DSO_OZON_BASE_URL       // pre  → …/presenteren/v8
             process.env.DSO_OZON_BASE_URL_PROD  // prod → …/presenteren/v8
```

Both default to the Presenteren v8 base for their environment. Keys are reused —
`DSO_API_KEY` / `DSO_API_KEY_PROD` already work against Ozon, confirmed live. Added to
`.env.example` alongside the others.

### `dsoFetch` must be extended

The existing helper does GET with `Accept: application/hal+json` and nothing else.
Ozon needs two things it cannot currently do:

- **POST with a JSON body** (`/regelingen/_zoek`)
- **a `Content-Crs` header**, whose value must be the full OGC URI
  `http://www.opengis.net/def/crs/EPSG/0/28992`. `EPSG:28992` and `epsg:28992` are
  both rejected with a 400 naming the header.

Extend `dsoFetch` with an optional `{ method, body, headers }` argument, defaulting to
today's behaviour so no existing call site changes. Timeout, key attachment and error
handling stay as they are.

### New routes

| LDE route | Method | Upstream |
|---|---|---|
| `/v1/dso/regelingen/zoek` | POST | `POST /regelingen/_zoek` |
| `/v1/dso/regelingen/:id/annotaties` | GET | `GET /regelingen/{id}/regeltekstannotaties` |
| `/v1/dso/regelingen/:id/documentstructuur/:wId` | GET | `GET /regelingen/{id}/documentstructuur/{wId}` |
| `/v1/dso/activiteiten/:urn/dossier` | GET | *composite — see below* |

The three passthroughs return HAL verbatim inside the `{ success, data }` envelope and
follow the existing error contract: non-2xx becomes 502 carrying the upstream body,
upstream 404 passes through as 404, both as RFC 9457 problem details. Environment
selection uses the existing `X-Dso-Env` header / `?env=` parameter.

### The dossier assembly

`GET /v1/dso/activiteiten/:urn/dossier?env=&datum=&authority=`

Everything below is derivable from the URN alone, except in the national-activity case
noted under Edge cases.

1. **RTR** `GET /activiteiten/{urn}` → `bestuursorgaan` (→ `gm0995`),
   `regelBeheerObjecten`, `locaties`, parent link, werkzaamheden links.
2. **Ozon** `POST /regelingen/_zoek {"bevoegdGezag":["gm0995"]}` → the authority's
   regelingen; select the one typed `/join/id/stop/regelingtype_003` (Omgevingsplan).
3. **Ozon** `GET /regelingen/{id}/regeltekstannotaties` → the annotation graph. Join
   `regelsVoorIedereen[].activiteitLocatieaanduidingen[].activiteitRef === urn`, then
   follow each hit's `regeltekstRef` into `regelteksten[]` for its `wId`, and each
   `locatieRefs[]` into `locaties[]` for readable names. Take the IMOW activity record
   itself from `activiteiten[]` for `groep`, `symboolcodes` and parent ref.
4. **Ozon** `GET /regelingen/{id}/documentstructuur/{wId}` per distinct `wId` → the
   article text, as STOP/IMOP `Inhoud` XML in the `inhoud` field.
5. **Uitvoeren Gegevens** per `functioneleStructuurRef` from step 1 →
   `GET /toepasbareRegels?functioneleStructuurRef=…` → rule `identifier`,
   `sttrVersie`, `begindatum`, and the `sttrBestand` link, grouped by Conclusie
   (decision criteria) and Indieningsvereisten (submission requirements).

6. **Uitvoeren Gegevens** `GET /v1/dso/toepasbare-regels/{identifier}/dmn` per rule from
   step 5 → the normalised DMN, which the quality profile measures (decision and input
   naming, `vraagTekst` coverage, embedded IMOW refs).

**Step 6 uses the existing backend `/dmn` route, not the CPSV Editor deeplink.** The
deeplink (`?dsoImport=dmn&dmnId=…`) is a *human* handoff — it opens an editor for a
person to publish from, and is a cross-application contract for publishing rather than
an interface for analysis. The dossier needs the XML in-process, so it calls the route
that already returns it. This also means the profile measures exactly the DMN LDE
itself produces, `normalizeDmnForOperaton` included — which is why the underscore-GUID
trap below is the profile's problem and not an upstream one.

Steps 4, 5 and 6 fan out and run with `Promise.allSettled`, matching how the existing
child-activity fan-out degrades: a failed leg yields a null entry with a recorded
reason rather than failing the dossier. An activity with no `regelBeheerObjecten`
skips steps 5 and 6 entirely.

The response is a compact dossier object — the four links plus a `provenance` block
carrying `env`, `datum`, the resolved regeling identificatie, and a per-upstream-call
list of what was fetched and what failed.

### Caching

Two consumers need a cache, and the repository currently has no shared one to use.

**The existing pattern, and why it is not reused directly.** `sparql.service.ts`
hand-rolls a private `dmnCacheMap` — a `Map` with a 5-minute TTL — and exposes it
through `GET /v1/cache/stats` and `DELETE /v1/cache/clear`. It is a pattern, not a
component: it cannot be used from another service. Adding a second bespoke cache here
would put the repository on its way to a third.

So this work first extracts **`utils/ttl-cache.ts`**: a small generic TTL cache with
`get`/`set`/`clear` and a stats view, wired into the existing `/v1/cache/*` routes so
both caches are observable and clearable the same way. `sparql.service.ts` is left
alone — migrating it is not needed for this work and would widen the change for no
gain here.

**Consumer 1 — the DSO activity-detail lookup.** `GET /v1/dso/activiteiten/{urn}`,
cached on `(urn, datum, env)`, **TTL 5 minutes** to match the house default. This is
the dossier's step 1, and it is also what the DSO Explorer's child-activity fan-out
calls N times.

The fan-out (`DsoExplorer.tsx`) discards every resolved name on each effect run
(`setChildNames({})`) and re-fetches, so re-opening an activity, or walking
parent → child → back, pays the full `1 + N` cost again every time. Caching at the
backend rather than in component state fixes all of those, and survives page reloads
and multiple users.

*What this does not fix:* the cold first view. Opening an activity with 23 children is
still 24 simultaneous upstream requests, because every URN is a distinct cold key. The
documented fan-out problem is *"no cache and no concurrency cap"* — this addresses the
cache half only. **A concurrency cap is explicitly out of scope** and recorded as a
follow-up; it is a different fix with a different risk profile.

*Staleness is a real tradeoff, accepted deliberately.* Activity detail can now be up to
5 minutes stale, and DSO activity data does change — the `gebiedengroep` added to the
worked example on 12-12-2025 is exactly such a change. Five minutes is judged
acceptable for browsing, and `DELETE /v1/cache/clear` provides the escape hatch.

**Consumer 2 — the annotation graph.** Step 3 is the expensive one: the Lelystad
omgevingsplan's graph is **8.7 MB** (137 activiteiten, 1 845 regelteksten, 11 906
locaties). Without caching, every dossier for every Lelystad activity refetches all of
it. Cached on `(regelingIdentificatie, geldigOp, env)`, **TTL 15 minutes** — longer
than activity detail because it is far more expensive and changes only on publication
dates. What is cached is the *parsed and indexed* graph — three lookup maps (regeltekst
by id, locatie by id, activity-ref → juridische regels) — not the raw payload.

Neither cache is persistent. DSO data changes on publication dates, and a stale dossier
is worse than a slow one.

**Commit order.** The `ttl-cache` utility and the activity-detail caching land as the
first commit on this branch, before any dossier code. That commit is small,
self-contained, independently valuable, and reviewable on its own terms.

### Quality profile

A dossier records what an activity *is*. The quality profile scores how **legible** it
is — because across the chain, meaning and identity are carried by different things,
and often not by the same artefact.

The Conclusie DMN for the worked example, measured on production:

| Artefact | Semantic | Opaque | Note |
|---|---|---|---|
| Decisions | 3 / 7 | 4 / 7 (57%) | e.g. `_6d45be8c-8010-4d11-8775-487a28b88087_Niet van toepassing` — only the suffix means anything |
| Input data | 0 / 5 | 5 / 5 (100%) | all `uitv__<guid>` |
| Question labels | 5 / 5 present | — | meaning is fully recoverable from `uitv:vraagTekst` |
| IMOW refs | — | 1 | resolvable via the annotation layer, not from the DMN |

So identifiers fall into **three classes**, and a single "opaque = bad" number would
hide the distinction that matters:

1. **Semantic** — the name itself is meaningful (`Boom kappen of houtopstand vellen`).
2. **Opaque but resolvable** — meaning is recoverable elsewhere. The `gebiedengroep`
   URN resolves through the annotations to "bebouwingscontour, houtkap"; the input
   GUIDs resolve through their own `vraagTekst` to *"Gaat het om een boom of
   houtopstand binnen de bebouwingscontour houtkap?"*.
3. **Opaque and dangling** — a GUID with no resolution path anywhere in the data.

The profile therefore scores **two axes**, not one:

- **Legibility** — can a reader understand the artefact as it stands?
- **Recoverability** — if not, can the dossier resolve the meaning automatically, and
  from which source?

This framing is the justification for the feature rather than an addition to it. An
activity that is low-legibility but high-recoverability is precisely what the dossier
exists to repair. One that is low on both is a data-quality defect worth reporting back
to the authority — and that is the case the score must make visible.

Scored dimensions, all computed from the dossier object, each reported as a count with
its evidence rather than collapsed into a single grade:

| Dimension | Measures |
|---|---|
| Activity identity | is the URN's local name semantic or a GUID? |
| Decision naming | semantic / opaque / dangling split |
| Input naming | semantic / opaque / dangling split |
| Label coverage | inputs carrying a `vraagTekst` |
| Ref resolvability | IMOW refs resolved vs dangling |
| Legal traceability | juridische regels → resolved `wId` → retrievable article text |
| Cross-layer consistency | objects appearing in RTR *and* annotations *and* DMN |

A single headline grade per activity is deliberately **not** produced. The profile's
purpose is comparison — the same activity across municipalities, or across activities
within one — and a grade would flatten exactly the differences being compared.

The profile is computed in `quality.service.ts`, taking a dossier object and returning
a profile object. It performs no I/O, which keeps it trivially testable and keeps the
scoring rules in one readable place.

### Human cross-check links

Every rendered dossier carries the public RTR viewer link for each rule type, so a
reader can verify the analysis against the official viewer without reconstructing a
URL:

```
https://omgevingswet.overheid.nl/registratie-toepasbare-regels/id/<typering><urn>
e.g. …/id/Conclusienl.imow-gm0995.activiteit.HoutopstandVellen
```

The path segment is the `functioneleStructuurRef`'s trailing concept name, which the
RTR already supplies — it is not constructed by string-building from parts.

### Script and documentation

`npm run dso:dossier -- --urn=<urn> [--env=prod] [--date=YYYY-MM-DD] [--out=<path>]`

Calls the dossier endpoint on an already-running backend and renders Markdown with a
section per link, the provenance block, and the article texts with STOP/IMOP markup
reduced to readable text. The script does no joining of its own.

It never starts, stops or restarts a server: if the backend is not reachable it exits
with a message naming the expected base URL and stops. Base URL comes from
`LDE_API_BASE_URL`, defaulting to `http://localhost:3001`.

Committed alongside it:

- `docs/dso-activity-dossier.md` — the method: the data model, the joins, the quirks,
  the generalisation rules and the edge cases below.
- `docs/examples/dossier-houtopstandvellen-gm0995.md` — the worked example, generated
  by the script, stamped with env and date.

## Quirks the implementation must encode

These each cost a debugging cycle to find and are invisible from the OpenAPI spec:

- **Identificatie slashes become underscores in path position.**
  `/akn/nl/act/gm0995/2020/omgevingsplan` → `_akn_nl_act_gm0995_2020_omgevingsplan`.
  Percent-encoding the slashes returns a Tomcat HTML 400, not a JSON error. Always
  prefer the HAL `_links` href the API itself returned over rebuilding a URL.
- **`Content-Crs` must be the full OGC URI** (see above).
- **The annotations response is not HAL-paged** — no `page`, no `_embedded`. It is a
  single object with sibling arrays: `activiteiten`, `gebiedsaanwijzingen`, `locaties`,
  `omgevingsnormen`, `regelsVoorIedereen`, `regelteksten`. Code written against the
  other DSO endpoints' HAL shape will find nothing.
- **Regelteksten do not reference activities.** A `regeltekst` carries only
  `identificatie` and `wId`. The activity link exists solely on
  `regelsVoorIedereen[].activiteitLocatieaanduidingen[]`.
- **Ozon errors differ by version.** v7 returns `BestaatNiet` for everything, including
  paths that exist in v8; v8 returns `VerkeerdVerzoek`. A `BestaatNiet` is not
  evidence that a resource is absent if the base URL is wrong.
- **GUIDs in DMN names use either separator.** `normalizeDmnForOperaton` rewrites
  hyphens to underscores to make variable names FEEL-safe, so names arrive as both
  `_6d45be8c-8010-…` and `onderwerp_c7ef02b1_0f07_…`. A hyphen-only detector reports
  0% opacity on a DMN that is in fact mostly opaque — this was hit while writing this
  spec. The quality profile's detector must accept `[-_]` between GUID groups.
- **`uitv:vraagTekst` content is CDATA.** Stripping tags with a naive `<[^>]+>` replace
  eats the question text along with the markup, silently yielding empty labels and a
  falsely poor label-coverage score. Parse CDATA explicitly.

## Edge cases

- **Activity with no `regelBeheerObjecten`.** Parent activities such as
  `nl.imow-gm0995.activiteit.OverigeAct` have an empty array: legal source and
  annotations resolve, decision criteria and submission requirements are legitimately
  empty. The dossier reports them as absent, not as an error.
- **National activities annotated in a municipal plan.** The Lelystad omgevingsplan's
  annotations contain two activity namespaces — `nl.imow-gm0995` *and*
  `nl.imow-mnre1034`. So an activity's namespace does **not** by itself determine which
  regeling annotates it: a rijk activity may be annotated in many municipal plans. For
  a `nl.imow-mnre####` URN the dossier requires the `authority` parameter to say which
  plan to scan, and returns a 400 naming the parameter when it is missing.
- **Authorities with more than one regeling.** Lelystad has four (omgevingsplan,
  omgevingsvisie, voorbereidingsbesluit, warmteprogramma). Only `regelingtype_003` is
  scanned. If an authority has none, the dossier returns the RTR-side links with the
  legal-source link marked unavailable and the reason recorded.
- **Tijdelijke delen are out of scope for this chain.** The omgevingsplan lists four
  (`ws0650`, `pv24`, `mnre1034`), but all 10 juridische regels for the worked example
  resolve inside the `gm0995` regeling itself, including the bruidsschat-derived
  ch. 22 rules (`wId` prefix `gm0995_1-0`). Tijdelijke delen carry *other authorities'*
  rules that apply within the municipality — relevant to a location-based question,
  not to an activity-based one. The method doc states this so it is a decision on
  record rather than an omission.
- **Environment divergence.** Verified for this activity (see above). Env and date are
  mandatory in the provenance block and in every rendered report.

## Testing

- **`ozon.service.ts`** — unit tests per passthrough: URL construction including the
  underscore transform, the `Content-Crs` header value, POST body pass-through, and the
  502/404 error contract. Upstream `fetch` mocked, as in `dso.service.test.ts`.
- **`dossier.service.ts`** — the join tested against a trimmed recorded fixture of the
  real Lelystad response (a few hundred KB, not 8.7 MB), asserting the worked example's
  verified numbers: 10 juridische regels, 5 `vergunningplicht`, both toepasbare regel
  ids, the `Kapactiviteit` groep, the `gebiedengroep` locatie. Plus the edge cases:
  empty `regelBeheerObjecten`, missing regeling, a failing fan-out leg.
- **`dso.routes.ts`** — route-level tests in the existing file's style, including the
  OpenAPI `expectToMatchOperation` checks the other DSO routes use.
- **`utils/ttl-cache.ts`** — hit, miss, expiry at the TTL boundary, `clear` with and
  without a key, and the stats view. Clock is injected so expiry is tested without
  waiting.
- **Cached activity detail** — a second call for the same `(urn, datum, env)` makes no
  upstream request; a different `datum` or `env` does; `DELETE /v1/cache/clear` forces
  a refetch. One test asserts the response shape is byte-identical cached and uncached,
  since the route contract must not change.
- **Cached annotation graph** — two activities of the same authority share one
  annotation fetch.
- **`quality.service.ts`** — pure function, no I/O. Asserted against the worked
  example's measured production figures: 7 decisions (3 semantic / 4 opaque), 5 inputs
  (0 / 5), 5 of 5 labels present, 1 IMOW ref resolved, 10 juridische regels traced.
  Plus one test per identifier class, and a regression test that a GUID written with
  **underscore** separators is classified opaque — the detector bug this spec records.
- **Script** — rendering asserted against a dossier object literal; no network.

The OpenAPI specification under `packages/backend/openapi/` is updated for all four
routes, since the existing DSO route tests assert documentation conformance.

## Risks

- **The composite route is heavier than anything in the DSO proxy today.** It is the
  first route fanning out across three upstream APIs, and the first with a cache. It
  carries correspondingly more test weight; the join logic is deliberately isolated in
  one service so that weight lands in one place.
- **Ozon is a sixth upstream dependency** with its own availability and its own error
  dialect. Dossier legs fail independently and are reported in `provenance` rather
  than collapsing the response.
- **The 8.7 MB fetch is a real cost** even cached. If dossiers are later generated in
  bulk, the indexed graph — not the route — is the thing to persist.
- **Caching activity detail changes a live feature's behaviour.** It is the only part
  of this work that touches something users already rely on. The response shape is
  unchanged and the risk is bounded to 5 minutes of staleness with a documented clear
  endpoint, but it is the piece to review most carefully and the one most likely to
  want its TTL tuned after use.
