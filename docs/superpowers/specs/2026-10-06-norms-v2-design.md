# `/v2/norms` — current norms by default, "valid on" date semantics

Date: 2026-10-06
Status: design, awaiting review

## Problem

Users of `GET /v1/norms` report two problems.

1. **They have to name a CPRMV version to get current data.** The default is
   `0.3.0` (`DEFAULT_CPRMV_VERSION`, `norms.service.ts`). The editor now
   publishes in `0.3.2` / `0.4.1`; the `0.3.0` namespace only holds the old
   2025-07-01 and 2026-01-01 periods. A bare request returns stale rules, and
   combined with a current date it returns nothing.
2. **`applicable_date` is an exact match on a period's start date.** The
   filter is `CONTAINS(STR(?ruleIdPath), "_<date>_")`. Asking for 2026-08-15
   returns an empty set; asking for 2026-07-01 returns only the rulesets whose
   period starts that day. The set of norms _in force_ on a date — rulesets
   whose current periods started on different dates — cannot be retrieved with
   any single request.

Observed on ACC and production, 6 October 2026:

| Request                                           | Result                                              |
| ------------------------------------------------- | --------------------------------------------------- |
| `/v1/norms`                                       | 147 rules, `0.3.0`, 2025-07-01 / 2026-01-01 periods |
| `?cprmv_version=0.4.1`                            | 76 rules, 7 rulesets                                |
| `?cprmv_version=0.4.1&applicable_date=2026-07-01` | 63 rules, 5 rulesets                                |
| `?cprmv_version=0.4.1&applicable_date=2026-08-15` | 0 rules                                             |

The expected answer for 2026-08-15 in `0.4.1` is all 76: BWBR0002471 (period
2026-02-21), BWBR0015711 (2026-01-01) and the five rulesets whose period starts
2026-07-01.

## Constraint: the v1 stability contract

`iou-architectuur/docs/{en,nl}/linked-data-explorer/reference/api-stability.md`
binds `/v1/norms`: only the `0.3.0` default is guaranteed, "a change that
altered the default version … would be released as `/v2/norms`", and changing
"the semantics of an existing field" is likewise a v2 change. Both fixes the
users ask for fall under that rule.

**Decision:** introduce `/v2/norms`. `/v1/norms` keeps its behaviour unchanged
and is deprecated per the contract's policy (at least 24 months to sunset).

## Goals

- A bare `GET /v2/norms` returns the norms in force today, in the newest
  CPRMV version.
- `GET /v2/norms?valid_on=YYYY-MM-DD` returns the norms in force on that date,
  mixing periods across rulesets.
- `/v1/norms` responses are byte-identical to today apart from the
  deprecation headers.

## Non-goals

- No change to the data model or to what the CPSV editor publishes.
- No end dates. The data has no `validUntil`; a period is in force until the
  same ruleset publishes a later one.
- No "all periods" mode in v2. History is reachable by asking for an earlier
  `valid_on`; consumers needing every period stay on v1 until its sunset.

## v2 request

`GET /v2/norms`, all parameters optional:

| Parameter       | Values                                       | Default                   |
| --------------- | -------------------------------------------- | ------------------------- |
| `valid_on`      | `YYYY-MM-DD`, a real calendar date, else 400 | today in Europe/Amsterdam |
| `cprmv_version` | `0.3.0`, `0.3.2`, `0.4.1`, else 400          | `0.4.1`                   |
| `rulesetid`     | `/^[A-Za-z0-9_-]+$/`, else 400               | none                      |
| `endpoint`      | as v1 (`refuseOptionalEndpoint`)             | configured endpoint       |

`valid_on` is a new name on purpose. The rule field `applicable_date` keeps
meaning "start of the period this rule belongs to"; a query parameter with the
same name but a different meaning would invite confusion. `applicable_date` is
not accepted on v2 (400 with a detail pointing to `valid_on`), so a consumer
porting a v1 URL gets told rather than silently ignored.

`valid_on` validation is stricter than v1's regex: `2026-02-30` is rejected.

The v2 default version is pinned to `0.4.1` in code (`DEFAULT_CPRMV_VERSION_V2`),
not derived from "the last key of the supported map", so adding a future version
to the supported set never changes the v2 default by accident.

## Selection: the norms in force on a date

For each `rulesetid` in the (optionally `rulesetid`-filtered) rule set:

1. Collect the distinct period dates — the `applicable_date` parsed from each
   rule's `ruleIdPath` (`RULE_ID_PATH_PATTERN`, as today).
2. Pick the latest period date `≤ valid_on`.
3. Keep every rule of that ruleset whose period date equals the picked one.

Rulesets whose periods all start after `valid_on` are absent from the response.
Rules whose `ruleIdPath` has no parseable date are excluded, as they are under
v1's date filter today.

A period starting exactly on `valid_on` is in force on `valid_on`.

The selection is done in TypeScript, after the rules query, by a pure function:

```ts
export function selectInForce(
  rules: PublishedRule[],
  validOn: string,
): PublishedRule[];
```

Rationale: the data is a few hundred rows; "latest per group ≤ date" is
awkward in SPARQL and trivial to unit-test in code; and the date is never
interpolated into a query string, which removes one injection surface.

## v2 response envelope

Same envelope as v1, with two changes:

- **`valid_on`** (new): the resolved date the response answers for, so a bare
  request states which day it used.
- **`dataset_versions`** is narrowed per ruleset to the records of the selected
  period: the entries whose `version` equals the picked period date. When none
  match (0.3.x non-primary rulesets carry `version: null`), it falls back to the
  `version: null` entries — the lookup rule the v1 contract already documents.
  For `0.4.1` the version _is_ the period date (`cprmv:validFrom`), so the match
  is always exact. `[0]` therefore means "the record in force", not "the newest
  record".

`total`, `aggregations.norms_per_rulesetid` and `rules` describe the selected
rules only. Rule objects are unchanged from v1 for the same `cprmv_version`.

## Caching

- ETag and `Last-Modified` are computed as in v1, from the narrowed
  `dataset_versions`, with the filter signature
  `{ endpoint, rulesetid, valid_on (resolved), cprmv_version, api: 'v2' }`.
  Including the resolved date makes the ETag change at midnight, which is
  correct: a new period can come into force without anything being
  republished. `api: 'v2'` keeps v1 and v2 ETags for otherwise equal inputs
  distinct.
- When `valid_on` was omitted, `Cache-Control` `max-age` is the lesser of the
  usual 3600 seconds and the seconds until the next Amsterdam midnight, so a
  shared cache cannot serve yesterday's answer to today's bare request. With an
  explicit `valid_on`, `max-age` stays 3600.
- v2 has no pre-query 304 short-circuit for `rulesetid` requests. Which period
  is selected is only known after the rules query (for 0.3.x the metadata
  cannot always tell), and the rules query is small. Conditional requests are
  still honoured after the query, as on v1's second path.
- The `no-cache` fallback for rulesets without metadata is unchanged.

## v1 deprecation

`/v1/norms` keeps its behaviour and gains, on every response (200, 304, 4xx,
5xx):

- `Deprecation: @<unix seconds>` (RFC 9745) — the v2 release date;
- `Sunset: <HTTP-date>` (RFC 8594) — 24 months after that date;
- `Link: </v2/norms>; rel="successor-version"`.

Both dates are constants in the route module (`NORMS_V1_DEPRECATED_AT`,
`NORMS_V1_SUNSET_AT`), set in the implementation PR to the planned release date
and that date plus 24 months, and recorded in the contract.

The existing `deprecationMiddleware` in `routes/index.ts` (for the `/api/*`
aliases) emits the older `Deprecation: true` form and no `Sunset`, so it is not
reused as is. A small `normsV1Deprecation` middleware is mounted with the v1
route.

## Code shape

- `services/norms.service.ts`
  - `selectInForce(rules, validOn)` — pure, exported.
  - `narrowDatasetVersions(datasetVersions, selectedPeriods)` — pure, exported.
  - `getNormsInForce(endpoint, { rulesetid, validOn }, cprmvVersion)` — composes
    `getAllNorms` (without a date filter), `selectInForce` and
    `narrowDatasetVersions`; recomputes `normsPerRulesetid`.
  - `DEFAULT_CPRMV_VERSION_V2 = '0.4.1'`.
  - `getAllNorms` and v1's SPARQL date filter stay as they are.
- `utils/amsterdamDate.ts` — `todayInAmsterdam(now?)` and
  `secondsUntilAmsterdamMidnight(now?)`, with an injectable clock for tests.
- `routes/norms.shared.ts` — what v1 and v2 share: parameter validation
  (rulesetid, cprmv_version), cache-header application, envelope serialisation
  (`dataset_versions` camelCase → snake_case). v1 is refactored onto it with no
  behaviour change.
- `routes/norms.v2.routes.ts` — the v2 handler.
- `routes/registry.ts` — a `/v2/norms` entry; the header comment no longer
  says "v1 topology". The root page lists both.
- OpenAPI — the existing document's `servers` are pinned to `/v1` and the
  coverage test pairs it with the registry. v2 gets its own document,
  `openapi/v2.yaml` (servers `…/v2`, the one `/norms` path, its schemas),
  built to `openapi/v2.json` and served at `/v2/openapi.json`. The v1
  `/norms` operation is marked `deprecated: true`. The coverage test is
  parameterised per major version, and `lint:openapi` lints both documents.
  The Spectral rules (`.spectral.yaml`) apply to both.

## Error handling

Unchanged conventions: invalid input → `400 INVALID_PARAM` problem response
(`sendProblem`); SPARQL failure → `500 QUERY_ERROR`; metadata query failure
degrades to `no-cache` without failing the request.

## Testing (TDD)

- `selectInForce`: mixed periods across rulesets (the 2026-08-15 case above);
  a ruleset with only future periods; `valid_on` exactly on a period start; the
  day before a period start; rules without a parseable date; a `rulesetid`
  with two periods both in the past (only the later one returned).
- `narrowDatasetVersions`: exact version match; null-version fallback;
  ruleset with no metadata stays absent.
- `amsterdamDate`: date rollover around 22:00/23:00 UTC in summer and winter
  time; seconds until midnight.
- v2 route: default version `0.4.1` and default date (fake clock); explicit
  `valid_on`; `valid_on` invalid shape and impossible date → 400;
  `applicable_date` on v2 → 400; envelope carries `valid_on`; ETag differs
  between two `valid_on` values and between v1 and v2; `max-age` capped when
  `valid_on` is omitted; 304 on matching `If-None-Match`.
- v1 route: the three deprecation headers on 200, 304 and 400; existing v1
  tests pass unchanged (behaviour preserved through the refactor).
- OpenAPI coverage and Spectral lint for both documents.

## Documentation

- `iou-architectuur` (separate PR): the stability contract, EN and NL, gets a
  v2 section — default version `0.4.1`, `valid_on` semantics, narrowed
  `dataset_versions`, the midnight cap — and the v1 section is marked
  deprecated with the sunset date. The LDE backend developer docs mention
  `/v2/norms`.
- LDE changelog entry for the release that ships v2.

## Delivery

- LDE: branch `feat/norms-v2` off `acc`, one PR.
- `iou-architectuur`: one docs PR, merged together with or after the LDE PR.
