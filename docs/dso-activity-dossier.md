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
authority publishes, and the dossier then has to pick the right one.

**Which regeling depends on the bestuurslaag.** An omgevingsplan is the
gemeente's instrument; the other levels each have their own, and looking for
an omgevingsplan anywhere else finds nothing. Verified against production:

| Bestuurslaag | Core instrument | `regelingtype` |
|---|---|---|
| gemeente | Omgevingsplan | `/join/id/stop/regelingtype_003` |
| provincie | Omgevingsverordening | `/join/id/stop/regelingtype_004` |
| waterschap | Waterschapsverordening | `/join/id/stop/regelingtype_005` |
| rijk | AMvB | `/join/id/stop/regelingtype_001` |

The level comes from `bestuursorgaan.bestuurslaag`, which the RTR does supply,
falling back to the authority code's prefix (`gm` / `pv` / `ws` / `mnre`) when
it is absent. An explicit `--authority` overrides the code, and the level then
follows that authority's own prefix.

Lelystad publishes four regelingen — omgevingsplan, omgevingsvisie,
voorbereidingsbesluit, warmteprogramma — and only the omgevingsplan is in
scope. Selection is by type code, never by position or title.

**An authority can publish several regelingen of the right type.** The Rijk
publishes two AMvBs: `/akn/nl/act/mnre1034/2020/regOW01` (Omgevingswet) and
`/akn/nl/act/mnre1034/2021/OOWATRXX1` (Aansluitdocument Rijk). The dossier
tries them in order and keeps the first that actually annotates the requested
activity, capping the attempts at three — each annotation graph can be several
megabytes, so this is a bounded probe, not a sweep. Whichever was used is
recorded in `provenance`; if none matched, so is that, along with which were
checked and which could not be fetched.

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
| `--authority` | Optional override. The bevoegd-gezag code (e.g. `gm0995`) of the regeling to scan for annotations, instead of the one derived from the activity's own `bestuursorgaan`. Useful for a national activity that is annotated into a specific municipal plan — see §6. Never required. |
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

**National activities work like any other, with one wrinkle.** A rijk
(`mnre`) URN resolves through the same chain: its `bestuurslaag` is `rijk`,
so the dossier looks in the Rijk's AMvBs rather than in an omgevingsplan.

The wrinkle is that a national activity can *also* be annotated into
municipal plans — Lelystad's own annotation graph carries both
`nl.imow-gm0995` and `nl.imow-mnre1034` namespaces, because national
activities get annotated into many plans at once. So for a national activity
there is no single correct answer to "which plan annotates it"; there are
potentially hundreds. `--authority` exists for that case: it says *scan this
authority's regeling instead of the one I would derive*.

**It is not required, and its absence is not an error.** An earlier version
of this service rejected every `mnre` URN without `--authority` with a 400.
That was wrong twice over. It blocked activities that need no authority at
all — `nl.imow-mnre1034.activiteit.RijksmonArchMonument` carries its own
Conclusie and Indieningsvereisten and scores 23 of 23 decisions semantic —
and the advice it gave was itself false, since no municipality can supply a
national activity's own legal source. A request naming a valid URN is not
malformed, so it no longer answers 400; an unresolvable legal source is
reported as unavailable with the reason, and the other three links are
returned.

## 7. Edge cases

**Activities with no rule sets — taxonomy nodes.** Parent/grouping
activities legitimately have an empty `regelBeheerObjecten` array on the RTR.
Legal source and annotation still resolve normally; decision criteria and
submission requirements are reported as absent, not as an error. This is not
a failure of the join — a parent activity is not itself the executable unit,
its children are.

Three signals together identify one: no `regelBeheerObjecten`,
`toonbaar: false`, and one or more `onderliggendeActiviteiten`.
`nl.imow-mnre1034.activiteit.Rijksmonumentenactiviteit` is the clearest
example — it has no rules of its own and two children,
`RijksmonArchMonument` and `RijkmonMonument`, which carry a Conclusie and
Indieningsvereisten each. Loading the parent and finding nothing is the
correct answer; the rules are one level down. `nl.imow-gm0995.activiteit.OverigeAct`
is the same shape at gemeente level.

The dossier carries these children as `childActivityUrns` — the RTR's own
`_links.onderliggendeActiviteiten` from step 1, so this costs no extra
upstream call. The Quality Profile tab surfaces them as links when both rule
sets are null and the list is non-empty, so an otherwise-empty dossier points
a reader at where the activity's rules actually are, rather than leaving them
with two "Not present for this activity." cards and nothing else.

**Authorities with no regeling of the expected type.** Not every bevoegd
gezag publishes the instrument its level implies. When none is found, the
dossier still returns the RTR-side data with the legal-source link marked
unavailable and the reason recorded in `provenance.failures`, rather than
failing the whole request.

**A legal source that cannot be reached at all.** Some activities resolve
three links and not the fourth, and that is a real answer rather than a bug.
`nl.imow-mnre1034.activiteit.RijksmonArchMonument` returns its Conclusie
(`88073`) and Indieningsvereisten (`86071`), but neither of the Rijk's two
AMvBs annotates it — its legal source lives somewhere this method does not
reach. The dossier says so explicitly:

```
2 regeling(en) of type /join/id/stop/regelingtype_001 for mnre1034 were tried
for nl.imow-mnre1034.activiteit.RijksmonArchMonument — 2 checked and do not
annotate it: /akn/nl/act/mnre1034/2020/regOW01, /akn/nl/act/mnre1034/2021/OOWATRXX1
```

That wording is deliberate. A regeling that was fetched and found not to
annotate the activity is reported separately from one that could not be
fetched at all, and a fetch failure names the candidate it came from. The
reader can tell *we looked in the right places and it is not there* from *we
could not look* — a distinction an empty legal source alone would hide, and
the thing that makes a partial dossier trustworthy rather than merely
incomplete.

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

**The profile is measured per rule set, not once per activity.** An activity
can carry two DMNs — Conclusie (decision criteria) and Indieningsvereisten
(submission requirements) — and they are measured independently:
`qualityProfile.ruleSets.conclusie` and `.indieningsvereisten`, each either
`null` (that rule set, or its DMN, is absent) or an object carrying that
DMN's own `decisionNaming`, `inputNaming`, `labelCoverage` and
`refResolvability`. Only `activityIdentity`, `legalTraceability` and
`crossLayerConsistency` stay activity-level — the last of these because a
shared IMOW reference can equally well be embedded in either rule set's
decision logic, so cross-layer consistency considers refs from **both**
DMNs, unioned, while still requiring the same ref to appear in all three
layers (DMN, annotation-resolved, RTR `locaties`).

**The naming-split counts are evidence, not just totals.** Reporting "3/7
semantic, 4 opaque" says how much of a DMN is readable but not *which* items
scored how — for a municipality being shown this about its own data, that is
exactly the part that needs to be auditable. `decisionNaming.items` and
`inputNaming.items` carry one entry per decision/input: its `name`, its
`class` (`semantic` / `opaque-resolvable` / `opaque-dangling`), and — for
inputs — the `question` it resolved, or `null`. A question resolves through
the DMN's own structure: an `<dmn:inputData>` carries a
`<uitv:uitvoeringsregelRef href="#UitvIdxxxx"/>` inside its
`<dmn:extensionElements>`, and the matching `<uitv:uitvoeringsregel
id="UitvIdxxxx">` elsewhere in the document contains the `<uitv:vraagTekst>`.
This is also what fixed a defect in `labelCoverage`: it used to count every
`vraagTekst` found anywhere in the document against `inputs.total`, which
could exceed it — a DMN's questionnaire can carry more entries than the
current inputs actually reference, so the old count could read, say, 7
questions against 5 inputs. `labelCoverage.withQuestion` now counts inputs
that resolved *their own* question through `uitvoeringsregelRef`, which by
construction can never exceed `labelCoverage.inputs`.

The two worked examples make the distinction concrete, and were chosen
because they contrast rather than agree.

**`docs/examples/dossier-houtopstandvellen-gm0995.md`** (Lelystad). Its
Conclusie DMN has 7 decisions, of which only 3 are semantically named — 4 are
opaque, such as `_6d45be8c-8010-4d11-8775-487a28b88087_Niet van
toepassing`, where only the trailing suffix carries meaning. Its 5 decision
inputs are opaque *without exception* — all 5 follow the `uitv__<guid>`
pattern with no semantic naming at all, e.g.
`uitv__864933e7-4ea9-45a2-ae17-d8b1a4df34d7`. Read as bare XML, that
decision layer looks close to unreadable. But label coverage is 5 of 5:
every one of those opaque inputs resolves a `uitv:vraagTekst` that spells
out what it asks — `uitv__864933e7-…` resolves to "Gaat het om een
aangewezen bijzondere boom of plant?", and the other four resolve four
different questions in turn — so the *meaning* is fully recoverable even
though the *identifier* is not. One IMOW reference embedded in the Conclusie
DMN — the `gebiedengroep` for "bebouwingscontour, houtkap" — resolves
against the annotation layer with zero left dangling; it is the same object
the RTR lists under the activity's own `locaties`, provably the same rule
reached two different ways, which nothing in either artefact says on its
own. And legal traceability is 10 of 10: every one of the 10 juridische
regels traces through its `wId` to retrievable article text — the legal half
of the chain, unlike the executable half, is fully legible on its own terms
and needs no recovery at all.

**`docs/examples/dossier-houtopstandvellen-gm1708.md`** (Steenwijkerland),
the same activity type, on the same axes, scores the opposite way. Its
Conclusie DMN has 4 decisions and 8 inputs, and every single one of them is
semantically named — `situatie boom`, `omtrek boom kappen`, `beschermd stads
dorpgezicht` and the rest — with `situatie boom` itself resolving to "Staat
de boom die u gaat kappen in een houtwal, houtsingel, laanbeplanting of
bosperceel?". Nothing here needs recovering: the identifiers already carry
the meaning the Lelystad DMN had to recover through label coverage. Its
Indieningsvereisten rule set tells a third story on its own axis: 2
decisions and 6 inputs, all semantically named, but label coverage is only 3
of 6 — three of those inputs (all `BIJLAGEN - …` attachment requirements)
carry no question at all, which is not a defect; an attachment requirement
has nothing to ask.

That range — a Conclusie that is completely opaque and only readable through
its question labels, sitting next to one that needed no recovery at all, and
an Indieningsvereisten whose semantic names still leave a third of its
inputs' *purpose* unstated — is exactly the kind of thing a single grade, or
a single activity-wide number, would hide. Two activities could score
identically on a blended figure while meaning completely different things
about where their readability actually lives, and where an authority
publishing this data would need to improve it.
