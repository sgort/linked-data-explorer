# Test suite — Linked Data Explorer

Modeled on the CPSV Editor's `docs/TESTS.md` and, more directly, on
`ronl-business-api`'s `docs/TESTS.md` — this backend's shape (Express
routes, service-layer modules, external HTTP calls) is much closer to that
one. For the strategy, sequencing, and remaining backlog, see
[`TESTING-GUIDE.md`](./TESTING-GUIDE.md).

## Running the tests

```bash
# From the repo root — runs every workspace's test script
npm run test

# Backend only
npm test --workspace=@linked-data-explorer/backend
npm run test:watch --workspace=@linked-data-explorer/backend

# Frontend only (Vitest)
npm test --workspace=@linked-data-explorer/frontend
npm run test:watch --workspace=@linked-data-explorer/frontend
```

**Use `--workspace=` (singular, with `=`, and the exact `name` from that
package's `package.json`)** — not `--workspaces` (plural) or a bare folder
name like `frontend`. Either of those gets treated by npm as extra
arguments and forwarded straight through to the underlying `jest`/`vitest`
command, which then reads them as a test-name filter matching nothing —
producing a confusing "No tests found" / "0 matches" failure on **both**
packages that has nothing to do with the actual test suites.

## Test files

### `packages/backend/src/utils/etag.test.ts` — P0

**11 tests · pure unit · 100% coverage**

Covers `computeNormsEtag` (deterministic hashing; a dataset version change
changes the hash, a title-only change does not — title is informational,
not part of cache identity; filter-parameter changes change the hash; an
explicit `undefined` filter value hashes identically to an absent key;
`rulesetid` key order doesn't affect the hash; a `null` version is
distinct from a real one) and `computeLastModified` (null on an empty
input map; picks the latest `publishedAt` across multiple rulesets).

This was the first test file this repo has ever had — `npm test`
previously exited 1 with `No tests found, exiting with code 1` despite
Jest/ts-jest/supertest already being installed. Writing it required first
adding `packages/backend/jest.config.js` (none existed) and surfaced two
real, previously-latent tooling gaps (see "Bugs found and fixed" below).

### `packages/backend/src/utils/errors.test.ts` — P1

**23 tests · pure unit · 100% line + branch coverage**

Covers every exported type guard and error-normalization helper: `isError`,
`hasMessage`, `isAxiosError`, `getErrorMessage` (Error / Axios-shaped /
plain-object / string / null-undefined / unrecognized-object / circular-
reference inputs), `getErrorDetails` (including the Axios-before-generic-
Error branch ordering, and both the "is a real Error instance" and "is
just Axios-shaped, not actually an Error" cases for the stack field),
`toError` (preserves vs. creates, with/without a context prefix), and
`logError` (error vs. warn level, with additional context merged in).

### `packages/backend/src/middleware/error.middleware.test.ts` — P1

**5 tests · unit · mocked `../utils/logger`**

`logger.ts` self-executes real winston transports (Console + two File
transports) and a `mkdirSync('logs')` side effect on import — mocked via
`jest.mock('../utils/logger')` so this test never touches the filesystem
or a real logging pipeline. Covers `errorHandler` (production hides the
real error message behind a generic one; non-production surfaces it;
stack details only in development; a non-`Error` thrown value like a
plain string is handled) and `notFoundHandler` (404 with method+path in
the message).

### `packages/backend/src/middleware/version.middleware.test.ts` — P1

**3 tests · pure unit**

Covers `versionMiddleware` (sets `API-Version` from `package.json`, calls
`next()`) and `deprecationMiddleware` (sets `Deprecation` + `Link` headers
for the given successor path; confirms each call returns an independent
middleware function, not a shared closure).

### `packages/backend/src/services/ropa.service.test.ts` + `ropa.service.no-pool.test.ts` — P2

**15 tests · unit · mocked `../db/pool`, 100% coverage**

Covers every CRUD function (`listRopa`, `getRopaById`,
`getRopaByBpmnProcessId`, `upsertRopa`, `deleteRopa`, `listPublicRopa`)
against a mocked `pg` pool — including `upsertRopa`'s transaction (`BEGIN`
→ insert → delete-then-reinsert fields → `COMMIT`, and `ROLLBACK` +
rethrow on failure) and `listPublicRopa`'s field-stripping (no
`schemaVersion`/`controllerContact`/`dpoContact` in the public shape). The
"pool is `null`" (DB-not-configured) branches are covered in a **separate**
file with its own single static mock — `jest.doMock` inside
`isolateModulesAsync` didn't reliably override this file's top-level
`jest.mock('../db/pool', ...)` for a fresh import, so splitting into two
files was simpler and more reliable than fighting that.

### `packages/backend/src/services/vendor.service.test.ts` — P2

**18 tests · unit · mocked `./sparql.service`, `axios`, `../utils/logger` · 100% coverage**

Covers `getAllVendorServices` (mapping SPARQL bindings, deduplication by
vendor URI, the `'Unknown Vendor'` fallback, error propagation) and
`getVendorServicesForDmn` (matching by `basedOnIdentifier`, exact
`basedOn`, or a `/{dmnId}/dmn` suffix). The private `resolveVendorLogo`
method is exercised indirectly through `getAllVendorServices`'s
`providerLogo` binding, covering all four logo-path shapes: a complete
TriplyDB versioned URL (returned as-is, no HTTP call), an external
non-TriplyDB URL (same), an incomplete TriplyDB URL (resolved via one
`axios.get` to the assets API), and the edge cases (no extractable
filename, unresolvable endpoint, no matching asset, and the assets API
call itself failing — each degrades to `undefined` rather than throwing).

### `packages/backend/src/services/assets.service.test.ts` + `assets.service.no-pool.test.ts` — P2

**17 tests · unit · mocked `../db/pool`, 100% coverage**

Covers every BPMN/form/document CRUD function plus `listPublicBundles`
(the aggregated shell+subprocess+forms+documents query — asserts the
mapped shape including `null → undefined` translation for
`operaton_url`/`operaton_deployment_id`) and `markDeployed`'s
`COALESCE($6, board_owner)` parameter handling. Same "pool is `null`"
split-file pattern as `ropa.service`.

### `packages/backend/src/routes/*.routes.test.ts` — P3

**15 tests · route integration · `supertest` against a fresh `express()` app per file · service layer mocked**

Five of the smallest routes, each mounted in isolation (`app.use('/path',
theRouter)`) rather than the full `index.ts` app, so no unrelated
middleware or config runs:

| Route file                | Mocks                     | Covers                                                                                                                                                          |
| ------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ropa.public.routes.ts`   | `ropa.service`            | Public ROPA list, `organisation` query param forwarding, 500 on service failure                                                                                 |
| `assets.public.routes.ts` | `assets.service`          | Public bundle list, 500 on service failure                                                                                                                      |
| `process.routes.ts`       | `operaton.service`        | Variable hints for a process key, 500 with a generic message on failure                                                                                         |
| `dmn-xml.routes.ts`       | `operaton.service`        | XML content-type/disposition headers, 404 when not found, 500 with the real message, and the non-`Error`-rejection "Unknown error" fallback                     |
| `health.routes.ts`        | `sparql.service`, `axios` | 200 healthy (both deps up); 503 degraded for TriplyDB down (both the reported-down and the thrown-exception cases), Operaton unreachable, and both down at once |

`health.routes.ts`'s outermost `catch` block (wrapping the two already-caught
inner health checks) is left uncovered — reaching it would mean `res.json`
itself throwing, the same kind of defensive, effectively-unreachable branch
`ronl-business-api`'s coverage table documents rather than forces.

---

### Frontend tooling bootstrap — P4

Vitest + `@testing-library/react`/`jest-dom`/`user-event` + `jsdom` + `msw`
added as devDependencies (versions resolved fresh against this workspace's
existing Vite 6 / React 19, not copied verbatim from `ronl-business-api`'s
older pins). `vite.config.ts`'s `defineConfig` now comes from
`vitest/config` instead of `vite` (needed for the `test` field's typing);
`test.environment` defaults to `'node'`, with a per-file
`// @vitest-environment jsdom` docblock for anything that needs the DOM —
same convention as `ronl-business-api`'s frontend. `src/test/setup.ts`
imports `@testing-library/jest-dom/vitest`. Test files import
`describe`/`test`/`expect`/`vi` explicitly from `'vitest'` rather than
relying on the `globals: true` config option for ambient globals —
matching what `ronl-business-api`'s own test files actually do, not just
what their config technically allows.

`packages/frontend/package.json` gets `"test": "vitest run --coverage"` and
`"test:watch": "vitest"`, matching `ronl-business-api`'s frontend exactly.

### `packages/frontend/src/utils/exportFormats.test.ts` — P4

**7 tests · pure unit · 100% coverage**

Covers `getAvailableFormats`, `getFormatById` (known id, unknown id → null),
and `generateFilename` (chain-name sanitization, extension from the format
definition, throws on an unknown format).

### `packages/frontend/src/utils/exampleVersions.test.ts` — P4

**7 tests · unit · `jsdom` (real `localStorage`) · 100% lines**

Covers `getStoredVersion` (never-seeded → 0, a stored value, recovery from
invalid stored JSON) and `setStoredVersion` (persists without clobbering
other entries, overwrites an existing entry, silently tolerates
already-invalid stored JSON).

### `packages/frontend/src/utils/testData.test.ts` — P4

**11 tests · pure unit · `../testData.json` mocked via `vi.mock`**

The real `testData.json` is mocked with a small controlled fixture rather
than asserted against production content, for isolation from a dataset
that changes independently of this test. Covers `getCombinedTestData`
(merges inputs across DMNs, replaces `dagVanAanvraag` with a faked "today"
via `vi.setSystemTime`, ignores unknown DMN ids), `getScenarioData`
(named scenario, fallback to `defaultInputs`, unknown DMN → null),
`getTemplateData`, `getAvailableScenarios`, and `getAvailableTemplates`.

### `packages/frontend/src/utils/logoResolver.test.ts` — P4

**14 tests · unit · mocked `global.fetch` · 98.18% coverage**

Covers `resolveLogo`'s branches (no path → null; a complete TriplyDB
versioned URL and a non-TriplyDB external URL both returned as-is with no
fetch; an incomplete TriplyDB URL and a bare relative path both resolved
via one `fetch` call to the assets API; no matching asset; an unparseable
endpoint; the assets fetch itself failing or returning non-ok — each
degrades to `null`), the in-memory per-endpoint cache (a second call
within the TTL doesn't re-fetch), `clearLogoCache` (per-endpoint and
clear-all), and `prefetchLogos` (warms the cache for a later `resolveLogo`
call). The one uncovered line is `parseEndpoint`'s `catch` block —
`String.match()` never actually throws, so it's unreachable through any
real input, the same kind of defensive residue as `health.routes.ts`'s
outer catch.

### Deliberately deferred from P4: `exportService.ts`, `bpmnTemplates.ts`

`exportService.ts` only exports `exportChain` and `validateChainForExport`
— every other function (`downloadBlob`, `exportToJson`, `exportToBpmn`,
`escapeXml`, `generateReadme`) is private and reachable only through
`exportChain`, which does real DOM manipulation
(`document.createElement`/`URL.createObjectURL`, not implemented by jsdom
out of the box) plus `JSZip` archive building for the "package" format.
That's a real testing investment — jsdom + Blob/URL polyfills + JSZip
mocking — not the quick pure-logic pass the rest of P4 was, so it's
deferred to a dedicated pass (naturally alongside P5's `msw` setup, since
`exportChain` may also need network mocking). `bpmnTemplates.ts` is
confirmed to be almost entirely static XML template string constants (no
real functions) — same "skip, it's data" treatment as `constants.ts`.

### `packages/frontend/src/services/documentService.test.ts`, `bpmnService.test.ts`, `formService.test.ts` — P5

**27 tests (9 each) · `jsdom` · mocked via `msw`**

All three services share the same shape: CRUD over `localStorage` plus a
fire-and-forget background sync POST/DELETE to the backend. Each file
covers: empty-state reads, save creates vs. updates-in-place (no
duplicate), the background POST firing (and its readonly-skip case),
delete removing the record locally while firing a background DELETE, and
`hydrateFromServer` merging local readonly examples with server data (with
a fallback-to-local-on-failure case). `documentService.test.ts`
additionally covers "does not throw when the background save fails", since
its save path doesn't await the network call.

### `packages/frontend/src/services/ropaService.test.ts` — P5

**9 tests · unit · mocked via `msw`**

Covers `listRopa`, `getRopaByBpmnProcessId` (found / 404 → null /
URL-encoding), `upsertRopa`, and `deleteRopa` — each including its `HTTP
<status>` throw-on-failure branch. The URL-encoding test asserts against
the raw `request.url` rather than the handler's `params.id`, since msw's
path-param matcher auto-decodes for handler convenience — checking the
decoded param would give a false pass even if `encodeURIComponent` were
removed from the call site.

### `packages/frontend/src/services/assetService.test.ts` — P5

**9 tests · unit · mocked via `msw`**

Covers `fetchAssets` (success, an unparseable endpoint short-circuits
without fetching, non-ok response, fetch failure, the in-memory TTL cache
hitting on a second call, `forceRefresh` bypassing it) and
`fetchVariableHints` (success, non-ok, fetch failure). `fetchAssets` caches
per-endpoint in a module-level `Map` with no exported reset hook; rather
than reset it between tests, each test uses a distinct dataset name via an
`endpointFor()` helper so cache entries never collide — this was a real
cross-test-pollution bug found while first writing this file (four tests
failed sharing one endpoint before the helper was introduced).

### `packages/frontend/src/services/templateService.test.ts` — P5

**9 tests · unit · mocked via `msw`**

Covers `getAllTemplates` (success, endpoint query-param forwarding,
`success: false` → `[]`, request failure → `[]` not a throw),
`getTemplatesByCategory` (category filter + query param, failure → `[]`),
and `getTemplateById` (found, `success: false` → null, failure → null).

### `packages/frontend/src/services/sparqlService.test.ts` — P5

**8 tests · unit · mocked `global.fetch` directly (no `msw`)**

Covers `executeSparqlQuery`'s direct POST path (form-urlencoded body, JSON
vs. raw-text error messages on a non-ok response) and its CORS-proxy
fallback: a remote (non-localhost) endpoint auto-retries via the
`allorigins` proxy on a `TypeError` network failure; a localhost endpoint
does not retry, surfacing a Jena Fuseki/TripleDB-specific hint instead;
proxy-unreachable and empty-proxy-content are distinct thrown errors; a
non-network-shaped error rethrows unchanged. Uses raw `global.fetch`
mocking rather than `msw` here, since the fallback logic itself branches on
whether the thrown error is a network-failure `TypeError` — easier to
construct directly than through msw's response layer.

### `packages/frontend/src/services/dsoService.test.ts` — P5

**23 tests · unit · mocked via `msw`**

The largest and most varied P5 file. Covers the pure URN/URL helpers
(`urnFromHref` extraction, URL-decoding, non-matching passthrough;
`sttrDownloadUrl`/`dmnDownloadUrl` environment-suffix behavior) plus every
HAL-envelope-parsing endpoint (`searchBegrippen`, `getActiviteitenByOin`,
`zoekActiviteiten`, `getActiviteiten`, `zoekWerkzaamheden`,
`suggereerWerkzaamheden`, `getWerkzaamheidDetail`, `getActiviteitDetail`,
`fetchToepasbareRegels`, `fetchFormScaffold`) — each asserting the
`_embedded`/`_links.next`/`page` HAL-shape parsing, the fallback to `[]` /
a default page when those keys are absent, and the `HTTP <status>` /
`DSO request failed` error branches.

### `packages/frontend/src/services/testCaseStorage.test.ts`, `userTemplateStorage.test.ts`, `defaultTestCases.test.ts` — P5

**28 tests combined · `jsdom` · pure `localStorage`, no network**

`testCaseStorage`/`userTemplateStorage` are near-identical
localStorage-backed CRUD stores — no `msw` involved, no network calls at
all here. Covers empty-state reads, recovery from invalid stored JSON,
create/update/delete against a suite keyed by chain id (DMN-order-
independent for `testCaseStorage`), per-endpoint isolation, and
export/import round-tripping (including invalid-JSON import leaving
storage untouched). `defaultTestCases.test.ts` covers
`initializeDefaultTestCases` seeding every template's test cases on a
fresh endpoint idempotently (no duplication on a second call), and
`getTemplateTestCases` returning `[]` for an unknown template id or before
seeding.

---

### `packages/frontend/src/components/common/*` — P6.0

**20 tests · `jsdom` · `@testing-library/react` + `user-event`**

First slice of P6 (frontend components) — `components/common` was picked
first as the smallest, least third-party-coupled feature directory (no
`bpmn-js`/`@tiptap/*`/`@dnd-kit/*` involved), to establish the RTL rendering
pattern before tackling the editor-wrapping directories. Per the guide's
"critical interactions only" scoping: renders with expected content, prop-
driven display changes, and callback firing on user interaction — not
exhaustive branch coverage.

- `LanguageSelector.test.tsx` (5 tests) — every language option rendered,
  the "matches every filter" hint shown only when unset, `onLanguageChange`
  called with the selected code and with `undefined` when cleared back to
  the default option, `disabled` prop reaching the `<select>`.
- `OrganizationSelector.test.tsx` (5 tests) — same shape for the
  organization free-text input. Note: an `<input list="...">` paired with a
  `<datalist>` has an implicit ARIA role of **`combobox`**, not `textbox` —
  `getByRole('textbox')` silently finds nothing; this was caught immediately
  by all five assertions failing, not a subtle one to miss.
- `ArtefactListToolbar.test.tsx` (10 tests) — the component itself (search
  value + match/total count display, the clear button appearing only with a
  non-empty search, the language-filter select firing `onLanguageFilterChange`)
  plus the colocated pure `filterArtefacts` helper (language filter incl.
  `'none'`/`'all'`, case-insensitive name/description search, the optional
  `extraSearchKeys` callback, and combining both filters).

See [`TESTING-GUIDE.md`](./TESTING-GUIDE.md)'s "P6 breakdown" table for the
full P6.0–P6.8 ordering (coupling-severity groups first, size ascending
within each group) worked out once this phase actually started.

### `packages/frontend/src/components/Tutorial/Tutorial.test.tsx` — P6.1

**9 tests · `jsdom` · `tutorial.json` mocked via `vi.mock`**

No third-party coupling — picked as the smallest remaining P6.1 target.
`tutorial.json` is mocked with a small two-tutorial, two-glossary-term
fixture (one tutorial deliberately using an unrecognized `difficulty` and
`iconColor` value) rather than asserted against the real ~5-tutorial
content, for isolation from a dataset that changes independently of this
test. Covers: title/subtitle + every Quick Links entry rendering; the
first tutorial expanded by default; clicking a collapsed tutorial's header
opens it and collapses the previously-open one; clicking the currently
open one's header closes it; a Quick Links button expands its tutorial;
the Quick Links glossary button and the main Glossary header button both
open the glossary (two separate code paths — `Element.prototype
.scrollIntoView` is stubbed globally since jsdom doesn't implement it);
unknown `difficulty`/`iconColor` values fall back to the default styling
without crashing; a step with empty `details`/`tip` renders without those
optional sections. 100% line coverage; one uncovered branch (closing the
glossary via the Quick Links button rather than the main header, i.e. the
`if (!showGlossary)` guard's `false` arm) — a real but low-value branch to
chase further given the "critical interactions, not exhaustive coverage"
scoping this phase committed to.

### `packages/frontend/src/components/RopaEditor/*` — P6.2

**60 tests · `jsdom` · `RopaService`/`BpmnService`/`FormService` mocked via `vi.mock`, `global.fetch` mocked directly**

No third-party coupling — plain CRUD/data-editing forms, same shape as the
P5 services' data models, one step up in size from `Tutorial`.

- `RopaList.test.tsx` (6 tests) — pure presentational component, no
  services involved: loading/empty states, shell records rendered with
  subprocess records indented beneath them, clicking a card selects it,
  clicking the delete icon deletes without also selecting (`e.stopPropagation()`),
  the "New RoPA record" button.
- `RopaEditor.test.tsx` (6 tests) — the container: loads the list on mount,
  selecting a record opens the editor for it, "New RoPA record" opens a
  blank editor, saving reloads the list and re-selects the saved record by
  its returned id, deleting asks for `window.confirm` and does nothing when
  cancelled, deleting the active record clears the selection once
  confirmed. Two elements can share the same text once the editor is open
  (the sidebar card title and the editor's own heading both render the
  record's `title`) — tests scope queries to the sidebar's DOM subtree
  (`within(card)`) or use `getAllByText(...)[0]` rather than a bare
  `getByText`, to avoid an "multiple elements found" false ambiguity.
- `RopaRecordEditor.test.tsx` (21 tests, the largest single component test
  file so far) — the four-tab record editor: blank-record defaults vs. an
  existing record's stored values; tab navigation (Record / Personal Data
  Fields / BPMN Link / Status); Record-tab editing (title propagates to the
  header, the third-country-transfers checkbox reveals its details
  textarea); the legal-basis SPARQL lookup (`global.fetch` mocked
  directly — success populates a picklist and picking an entry fills
  `legalBasisUri`/`legalBasisLabel`, an empty result set shows "No legal
  resources found", a non-ok response surfaces `HTTP <status>`); the
  "Hydrate from forms" flow (disabled without a `bpmnProcessId`; reads the
  linked `BpmnService` process's `camunda:formRef` ids, cross-references
  `FormService.getForms()`, and appends only components with a `key` not
  already present); editing a hydrated field row's label/category/special-
  category checkbox; removing a field row; the BPMN Link tab (reads the
  current `ronl:ropaRef` from the matching process XML on tab open; writing
  the link adds both the `xmlns:ronl` declaration when missing and the
  `ronl:ropaRef` attribute; removing the link strips it); the Status tab
  (Draft/Archived apply immediately, Active requires `window.confirm` and
  only applies when accepted); Save (calls `onSave` with the current
  record, surfaces the error message on a rejected save) and Cancel.

Two rounds of query-ambiguity fixes were needed while writing this file —
worth noting since they'll recur in the remaining P6 phases: (1) a fixture
field value (`'Belastingdienst'`) that happened to match two different
inputs at once, fixed by asserting a value unique to the field under test
instead; (2) after picking a legal-basis lookup result, the newly-filled
`legalBasisLabel` input's value coincidentally equalled the record's
`title`, so `getByDisplayValue` matched both — fixed by querying via the
`legalBasisLabel` input's own placeholder instead of its value.

### `packages/frontend/src/components/DsoExplorer/DsoExplorer.test.tsx` — P6.3

**21 tests · `jsdom` · `dsoService` mocked via `vi.mock` + `vi.importActual` (pure helpers kept real), `FormService` mocked**

No third-party coupling, but the largest single-file component tested so
far (1,464 lines, one default export covering three tabs — Concepts,
Works, Activities — each with its own search/pagination/master-detail
logic, plus nested non-exported components like `ApplicableRuleRow` and
the two detail panels that can only be reached, and thus only tested,
through the full `DsoExplorer` tree since nothing but the default export
is exported from the file). `dsoService` is mocked with
`vi.importActual` merged in so the pure helpers (`urnFromHref`,
`sttrDownloadUrl`, `dmnDownloadUrl`) stay real — only the network-calling
exports are replaced — while `FormService.saveForm` is mocked outright.

- **Shell** — defaults to the Concepts tab, the env badge (pre-production
  vs. production), and tab switching between all three.
- **Concepts tab** — loads on mount, renders/empty/error states, search
  (typed term + button, and Enter-to-search), pagination (prev disabled on
  page 1, next disabled without `hasNext`, next advances the page).
- **Works tab** — loads on mount, empty state, selecting a result opens the
  `WerkzaamheidDetailPanel` (fetches version history), pagination.
- **Activities tab** — loads on mount; a location preset (`Lelystad`)
  switches to OIN mode and reveals the client-side name filter; the name
  filter narrows results without a new network call; pasting a URN and
  pressing Enter opens `ActivityDetailPanel` directly without going through
  the list; selecting an activity shows authority/validity/refinable/rule-
  type sections; a `conclusie`-typed applicable rule offers STTR/Extract
  DMN/"Publish via CPSV Editor" links; an `indieningsvereisten` rule's
  "Import into LDE" calls `FormService.saveForm` and flips its button to
  "Imported"; child activities can be navigated into, updating the detail
  panel's `getActiviteitDetail` call to the child's URN.

Two DOM-query lessons surfaced here, worth carrying into the rest of P6:
(1) a plain `<label>` with no `htmlFor` doesn't associate with its input,
so `getByLabelText` finds nothing — use `getByText` for the label itself
instead; (2) text split across sibling elements (e.g. `Refinable:
<strong>Yes</strong>` — two separate text nodes) doesn't match a single
`getByText` string — either scope the query to the specific element
(`{ selector: 'strong' }`) or match on the substring that is actually one
node.

72.02%/68.02% line/branch coverage — deliberately not chased further:
uncovered paths are the werkzaamheden-tab type-ahead suggestions dropdown
(debounced via a real 300ms `setTimeout`, not exercised here), the
werkzaamheden/activiteiten error branches (already proven once each on the
Concepts tab, same code shape), and a few secondary pagination/no-results
message variants — all real but lower-value repeats of patterns already
covered elsewhere in this file, consistent with the "critical
interactions, not exhaustive coverage" scoping this phase committed to.

See `TESTING-GUIDE.md`'s "P6 breakdown" table — remaining scope
(`ChainBuilder`, `FormEditor`, `BpmnModeler`, `DocumentComposer`,
`App.tsx`, `Changelog.tsx` — P6.4 through P6.8) is not yet started.

---

## Bugs found and fixed

Both were found while getting the very first test file working — latent
because this repo had zero test files until now, so neither had ever been
exercised.

### `tsconfig.eslint.json` silently excluded every test file from linting

It `extends: "./tsconfig.json"` without overriding the base config's
`"exclude": [..., "**/*.test.ts", "**/*.spec.ts"]`. TypeScript's `exclude`
applies on top of a child config's own `include` unless explicitly
overridden, so ESLint's type-aware parser (`parserOptions.project`) could
never see a `.test.ts` file — `eslint .` failed with a parsing error the
moment the first test file existed. Fixed by adding `"exclude": []` to
`tsconfig.eslint.json`, leaving the production-build `tsconfig.json`
untouched (test files still correctly excluded from `tsc`'s `dist/`
output).

### `.gitignore`'s blanket `*.js` rule also blocked `jest.config.js`

The rule's comment says "TypeScript compiled output," but `*.js` matches
any JavaScript file anywhere in the repo — including a brand-new,
hand-authored `jest.config.js`, which could never be `git add`ed. (This
didn't affect `eslint.config.js` in either package, since those files were
already tracked before the ignore rule existed — `.gitignore` has no
effect on files already under version control.) Fixed with a scoped
`!packages/backend/jest.config.js` exception, matching the exact pattern
this repo's `.gitignore` already uses for a hand-authored `.d.ts` file.

---

## Coverage

`npm test` (root `package.json`'s `"test": "npm run test --workspaces
--if-present"`) always prints both packages' current per-file tables:
`packages/backend`'s `"test": "jest --coverage"` and
`packages/frontend`'s `"test": "vitest run --coverage"`, both matching
`ronl-business-api`'s conventions exactly. As of P6.3: **109 backend
tests** across 14 suites, **236 frontend tests** across 23 files — 345
total. Every tested file across both packages is at or near 100% line +
branch coverage; the only files noticeably below that are
`health.routes.ts` (89.74%), the P5 service files (`bpmnService.ts`/
`documentService.ts`/`formService.ts` at ~92-94% branch, `dsoService.ts` at
~90%/71% branch, `templateService.ts` at ~91%/79% branch, the two storage
modules at ~84-90%), and the P6 files (`RopaEditor.tsx` at 93.33%/70%
branch, `RopaRecordEditor.tsx` at ~86%/81% branch, `DsoExplorer.tsx` at
72.02%/68.02% branch — the largest component tested so far, one file with
three full tabs) — each gap is an uncovered defensive/edge branch or a
genuinely lower-value permutation (e.g. every disabled-state combination,
or a debounced type-ahead dropdown), not an untested code path. Still a
small slice of the ~12,371-line backend and ~22,684-line frontend — a
repo-wide number is premature until the remaining backend route files and
the rest of P6 (P6.4 through P6.8 — see `TESTING-GUIDE.md`) are further
along, same reasoning the CPSV Editor's guide used.

## Adding tests

Test files are colocated with the source they cover (`foo.ts` →
`foo.test.ts`). Both `packages/backend/jest.config.js`'s
`collectCoverageFrom` and `packages/frontend/vite.config.ts`'s
`test.coverage.include` report every non-excluded source file, so an
untested file shows up as 0% rather than being silently omitted —
mirroring `ronl-business-api`'s coverage philosophy exactly. On the
frontend, add `// @vitest-environment jsdom` as the first line of a test
file only when it actually touches the DOM/`localStorage` — the config
default is `'node'` for speed.
