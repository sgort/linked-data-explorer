# The DSO activity dossier — method

How to turn an IMOW activity URN into a single answer to the question an
analyst actually asks: which article of which omgevingsplan makes this
activity permit-liable, what was annotated onto that article, and how do the
decision criteria and submission requirements follow from it. The worked
example throughout is `nl.imow-gm0995.activiteit.HoutopstandVellen` ("Boom
kappen of houtopstand vellen", gemeente Lelystad), rendered at
`docs/examples/dossier-houtopstandvellen-gm0995.md` on production DSO,
2026-09-22.

## 1. The four links

An activity dossier is four links assembled from three upstream APIs.

| # | Link | Upstream API | Worked example |
|---|---|---|---|
| 1 | Legal source | RTR Gegevens (`toepasbare-regels/api/rtrgegevens/v2`) + Ozon Presenteren v8 | 10 juridische regels reference the activity, 5 of them qualified `vergunningplicht`; article text retrieved for all 10 |
| 2 | Annotation | Ozon Omgevingsdocumenten Presenteren v8 | groep `kapactiviteit`, parent activity `nl.imow-gm0995.activiteit.OverigeAct` |
| 3 | Decision criteria | Toepasbare Regels Uitvoeren Gegevens (`…/toepasbareregelsuitvoerengegevens/v1`) | Conclusie, toepasbare regel `114233`, STTR v2, vanaf 30-07-2026 |
| 4 | Submission requirements | Toepasbare Regels Uitvoeren Gegevens | Indieningsvereisten, toepasbare regel `105947`, STTR v1, vanaf 12-12-2025 |

RTR supplies the activity's own record — its `bestuursorgaan`, its
`regelBeheerObjecten`, its geographic `locaties`. Uitvoeren Gegevens is the
API LDE already used for STTR/DMN/form-scaffold extraction on the executable
side. Ozon Presenteren is new: it is a **sixth** DSO API, alongside the five
LDE already proxied (Stelselcatalogus, RTR, Zoekinterface, Opvragen
Werkzaamheden, Uitvoeren Gegevens — see `docs/dso-viewer-apis.md`), and LDE
did not talk to it before this feature. No new provisioning was needed: the
existing production and pre-production `DSO_API_KEY` values already
authenticate against it, confirmed live during design.

Legal source and annotation are two sides of the same Ozon call — the
regeltekstannotaties graph carries both the juridische regels (link 1) and
the activity's own annotation record (link 2) — so in practice the dossier
makes one expensive Ozon call, not two.

## 2. The joins

Nothing above is free-standing; each link is found by following a reference
out of the previous one. Four joins, in the order the dossier performs them:

**Authority to regeling.** The activity's `bestuursorgaan` gives an
`organisatieType` and `organisatieCode` (`GM` + `0995`), concatenated and
lowercased to `gm0995` — the code Ozon's regelingen search expects. `POST
/regelingen/_zoek {"bevoegdGezag":["gm0995"]}` returns every regeling that
authority publishes; the dossier selects the one typed
`/join/id/stop/regelingtype_003` (Omgevingsplan) and discards the rest.
Lelystad has four regelingen — omgevingsplan, omgevingsvisie,
voorbereidingsbesluit, warmteprogramma — and only the first is in scope.

**Activity to article.** This is the join that does not exist where you would
expect it. A `regeltekst` in the annotation graph carries only its own
`identificatie` and a `wId` — **it does not reference any activity**. The
link lives solely on the other side: `regelsVoorIedereen[]`, each entry of
which carries `activiteitLocatieaanduidingen[]`, and each of those an
`activiteitRef`. The dossier filters `regelsVoorIedereen` for entries whose
`activiteitLocatieaanduidingen[].activiteitRef` equals the requested URN,
then follows each hit's `regeltekstRef` into `regelteksten[]` to get its
`wId`, and calls `GET /regelingen/{id}/documentstructuur/{wId}` for the
article text. Code that starts from a regeltekst and looks for its
activities will find nothing; the search has to start from
`regelsVoorIedereen`.

**Rule to executable rule set.** Independently of the two joins above, each
entry in the activity's own `regelBeheerObjecten` (from RTR) carries a
`functioneleStructuurRef`. `GET /toepasbareRegels?functioneleStructuurRef=…`
resolves that to a concrete `identifier` — the toepasbare-regel id the STTR
and DMN live under — grouped by `typering`: `Conclusie` for decision
criteria, `Indieningsvereisten` for submission requirements.

**Executable rule to DMN.** The toepasbare-regel `identifier` from the
previous join feeds the existing `/toepasbare-regels/:id/dmn` route, which
downloads the STTR XML and extracts and normalises the embedded DMN. The
dossier calls this route in-process rather than reimplementing STTR parsing,
which is also why the quality profile (§8) has to deal with
`normalizeDmnForOperaton`'s GUID rewriting — it is measuring exactly the DMN
this join produces.

None of the four joins is documented as a relationship in the OpenAPI specs
for these APIs; each was found by reading a real payload.

## 3. Running it

```
npm run dso:dossier -- --urn=<urn> [--env=prod] [--date=dd-MM-yyyy] [--authority=<code>] [--out=<path>]
```

| Flag | Meaning |
|---|---|
| `--urn` | Required. The IMOW activity URN, e.g. `nl.imow-gm0995.activiteit.HoutopstandVellen`. |
| `--env` | `pre` (default) or `prod`. Selects which DSO environment answers every call in the chain. |
| `--date` | Validity date, `dd-MM-yyyy` — the same wire format as every other DSO route's `datum` parameter. Omitted means "today" on both the RTR call and the rendered report. The dossier service converts internally to the ISO form Ozon's `geldigOp` expects; the CLI flag itself always takes dd-MM-yyyy. |
| `--authority` | Required only for a national (`mnre`) activity — see §6. The bevoegd-gezag code (e.g. `gm0995`) of the plan to scan for annotations. |
| `--out` | Write the rendered Markdown to a file instead of stdout. |

The script talks to `LDE_API_BASE_URL` (default `http://localhost:3001`) — it
is a client of the LDE backend's `GET /v1/dso/activiteiten/:urn/dossier`
route, nothing more. **It needs a backend that is already running.** It does
not start, stop or manage one: if the backend is unreachable it prints the
base URL it tried and exits, and the reader is expected to have their own
`npm run dev` (or equivalent) running first. This mirrors the constraint the
method doc itself was written under — the dossier used to generate the
worked example was pulled from a backend the operator started, never one the
tooling started for itself.

## 4. Quirks

Each of these cost a debugging cycle during design, and none of them is
visible from the OpenAPI spec for the APIs involved.

- **Slashes become underscores in path position.** Ozon expects a document
  identificatie such as `/akn/nl/act/gm0995/2020/omgevingsplan` written as
  `_akn_nl_act_gm0995_2020_omgevingsplan` when it appears in a URL path.
  Percent-encoding the slashes instead (`%2F`) does not produce a JSON error —
  it returns a Tomcat HTML 400 page. Prefer the HAL `_links` href the API
  itself returned over rebuilding a path by hand.
- **`Content-Crs` must be the full OGC URI.** Every Ozon call that accepts it
  rejects both `EPSG:28992` and `epsg:28992` with a 400 naming the header; only
  `http://www.opengis.net/def/crs/EPSG/0/28992` is accepted.
- **The annotations response is not a HAL collection.** `GET
  /regelingen/{id}/regeltekstannotaties` returns one object with sibling
  arrays — `activiteiten`, `regelteksten`, `regelsVoorIedereen`, `locaties`,
  `gebiedsaanwijzingen`, `omgevingsnormen` — with no `page` and no
  `_embedded`. Code written against the other five DSO APIs' paging shape
  will find nothing to page through.
- **v7 and v8 speak different error dialects for the same problem.** Ozon v7
  returns `BestaatNiet` for everything, including paths that exist in v8;
  v8 returns `VerkeerdVerzoek`. A `BestaatNiet` from v7 is not evidence that
  a resource is absent — it is at least as likely evidence that the base
  URL points at the wrong version.
- **GUIDs in DMN names carry either separator.** `normalizeDmnForOperaton`
  rewrites hyphens to underscores to make variable names FEEL-safe, so the
  same class of identifier appears in one DMN as `_6d45be8c-8010-4d11-…` and
  as `uitv__c7ef02b1_0f07_…`. A detector that only matches hyphens reports 0%
  opacity on a DMN that is in fact mostly opaque — the quality profile's GUID
  regex accepts `[-_]` between every group precisely because this was hit
  while measuring the worked example.
- **`uitv:vraagTekst` content is CDATA.** A naive `<[^>]+>` tag strip treats
  `<![CDATA[…]]>` as one long tag (there is no `>` before its own
  terminator) and deletes the question text along with the markup —
  silently producing an empty label and a falsely poor label-coverage score.
  Article text has the same shape and the same risk; both the script's
  renderer and the quality profile unwrap CDATA before stripping tags.

## 5. Environment and date are part of the answer

A toepasbare-regel `identifier` is not a stable identifier across
environments, and nothing about its shape warns you of that. For the worked
example, the Conclusie rule is `114233` (STTR v2) on production. The
*same number*, `85149`, exists on production too — but it is a `ws0656`
waterschap rule that has nothing to do with houtopstanden. On pre-production,
`85149` is in fact the Conclusie for this activity, at STTR v1. Reading an id
on one environment and using it against the other returns a real rule, just
the wrong one, silently.

The consequence for anyone using this method by hand, not only for the
dossier code: never carry a toepasbare-regel id, a regeling identificatie, or
any other DSO id across the `X-Dso-Env` boundary. Always resolve it fresh
from `functioneleStructuurRef` within the environment you are asking about.
This is also why the dossier's `provenance` block — and every rendered
report — states `env` and `datum` plainly rather than treating them as
incidental request parameters: they are part of what the answer means, not
just how it was fetched. The same activity differs in more than rule ids
between environments too — production has `beginDatum` 2024-01-01 and two
`locaties` for this activity; pre-production has 2022-05-14 and one.

## 6. Generalisation

Nothing about the joins in §2 is specific to Lelystad or to houtopstanden.

**Another municipality** is a different URN prefix — `nl.imow-gm####` for a
different `gm` code, or a different organisation type entirely. The
authority-to-regeling join derives its `bevoegdGezag` code by concatenating
`organisatieType` and `organisatieCode` and lowercasing the result; this is
the same derivation regardless of whether the type is `GM` (gemeente), `PV`
(provincie), `WS` (waterschap) or `MNRE` (rijk) — `gm0995`, `pv24`, `ws0650`,
`mnre1034` all come out of the identical code path. Nothing in the dossier
assembly is gemeente-specific; it was only ever exercised against Lelystad
because that is where the worked example lives.

**Another activity** is simply a different URN passed to the same command.

**National activities are the one case needing an extra parameter.** A
rijk (`mnre`) activity does not, by itself, say which plan annotates it — the
Lelystad omgevingsplan's own annotation graph contains both `nl.imow-gm0995`
*and* `nl.imow-mnre1034` activity namespaces, because national activities get
annotated into many municipal plans at once. For an `nl.imow-mnre####` URN
the dossier cannot guess which plan to scan, so it requires `--authority`
(the bevoegd-gezag code of the plan to read) and returns a 400 naming the
parameter if it is missing.

## 7. Edge cases

**Activities with no rule sets.** Parent/grouping activities such as
`nl.imow-gm0995.activiteit.OverigeAct` legitimately have an empty
`regelBeheerObjecten` array on the RTR. Legal source and annotation still
resolve normally; decision criteria and submission requirements are reported
as absent, not as an error. This is not a failure of the join — a parent
activity is not itself the executable unit, its children are.

**Authorities with no omgevingsplan.** Not every bevoegd gezag has a
regeling typed `regelingtype_003` at all. When none is found, the dossier
still returns the RTR-side data with the legal-source link marked
unavailable and the reason recorded in `provenance.failures`, rather than
failing the whole request.

**Tijdelijke delen are out of scope, deliberately.** Lelystad's omgevingsplan
lists four tijdelijke delen (`ws0650`, `pv24`, `mnre1034`), and it would be
easy to assume an activity's rules might live in one of them. They do not,
here: all 10 juridische regels for the worked example resolve inside the
`gm0995` regeling itself, including the bruidsschat-derived chapter 22 rules
(recognisable by the `wId` prefix `gm0995_1-0`). Tijdelijke delen carry
*other authorities'* rules that apply within the municipality's boundary —
that is a question about a *location* (which rules apply here, regardless of
whose activity), not about an *activity* (which rules apply to this
activity, regardless of where). The two questions are related but distinct,
and this method answers only the second. This is recorded here as a decision
made on purpose, not an oversight discovered later.

## 8. The quality profile

A dossier records what an activity *is*. It does not, on its own, say how
much of that record is actually readable — and across the chain, meaning and
identity are carried by different artefacts, not consistently by the same
one. The quality profile exists to make that visible, on two axes:

- **Legibility** — can a reader understand the artefact as it stands?
- **Recoverability** — if not, can the dossier resolve the meaning
  automatically, and from where?

Every identifier the profile looks at falls into one of three classes.
**Semantic** names carry their own meaning (`Boom kappen of houtopstand
vellen`). **Opaque but resolvable** names are GUIDs or codes with no meaning
of their own, but whose meaning exists elsewhere in the dossier and can be
followed to it. **Opaque and dangling** names have no resolution path
anywhere in the data the dossier collected. Collapsing these three into a
single "opaque = bad" count would erase exactly the distinction that
matters: an opaque-but-resolvable identifier is a design choice DSO makes
everywhere (stable ids instead of prose), while an opaque-and-dangling one is
a genuine data-quality defect worth reporting back to the authority.

This is also why the profile is deliberately never collapsed into one
headline grade. Its purpose is comparison — the same activity across
municipalities, or different activities within one — and a single number
would flatten precisely the differences a comparison needs to see.

The worked example makes the distinction concrete. Its Conclusie DMN has 7
decisions, of which only 3 are semantically named — 4 are opaque, such as
`_6d45be8c-8010-4d11-8775-487a28b88087_Niet van toepassing`, where only the
trailing suffix carries meaning. Its 5 decision inputs are opaque *without
exception* — all 5 follow the `uitv__<guid>` pattern with no semantic
naming at all. Read as bare XML, that decision layer looks close to
unreadable. But label coverage is 5 of 5: every one of those opaque inputs
carries a `uitv:vraagTekst` that spells out what it asks — "Gaat het om een
boom of houtopstand binnen de bebouwingscontour houtkap?" and similar — so
the *meaning* is fully recoverable even though the *identifier* is not. One
IMOW reference embedded in the DMN — the `gebiedengroep` for "bebouwingscontour,
houtkap" — resolves against the annotation layer with zero left dangling;
it is the same object the RTR lists under the activity's own `locaties`,
provably the same rule reached two different ways, which nothing in either
artefact says on its own. And legal traceability is 10 of 10: every one of
the 10 juridische regels traces through its `wId` to retrievable article
text — the legal half of the chain, unlike the executable half, is fully
legible on its own terms and needs no recovery at all.

That asymmetry — a legal source that is completely traceable sitting next to
a decision layer that is completely opaque and only readable through its
question labels — is exactly the kind of thing a single grade would hide.
Two activities could score identically on a blended number while meaning
completely different things about where their readability actually lives,
and where an authority publishing this data would need to improve it.
