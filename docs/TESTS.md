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

### `packages/frontend/src/components/ChainBuilder/*` — P6.4

**102 tests across 13 files · `jsdom` · first library-coupled phase (`@dnd-kit/core`/`sortable`/`utilities`)**

The largest P6 directory by file count (13 files, ~3,558 lines). `@dnd-kit`
turned out not to need any special test setup — `useDraggable` (`DmnList`)
and `useSortable`/`useDroppable` (`ChainComposer`) both render fine with no
`DndContext`/`SortableContext` wrapper in the test, since dnd-kit's context
hooks fall back to sane defaults when no provider is present. Files were
tackled smallest/simplest first, same ordering principle as every prior
phase:

- `ExecutionProgress.test.tsx` (2), `VendorBadge.test.tsx` (5),
  `ValidationBadge.test.tsx` (5) — small presentational badges/progress
  list. Locale-formatted dates (`toLocaleDateString('nl-NL', …)`) render
  without the period after the abbreviated month in this environment's
  ICU data (`5 mrt 2026`, not `5 mrt. 2026`) — asserted with a tolerant
  regex rather than hard-coding either punctuation.
- `ChainResults.test.tsx` (7), `InputForm.test.tsx` (9) — execution-result
  display (success/failure, output truncation with a "show more" toggle,
  collapsible steps, clipboard copy) and the dynamic per-type input form
  (Boolean/Integer/Double/Date/String fields; "Fill with test data"
  prefers each input's own `testValue` over `getCombinedTestData()` —
  `../../utils/testData` mocked to verify the fallback is skipped when
  unnecessary).
- `SemanticView.test.tsx` (4), `TestCasePanel.test.tsx` (9) — `global.fetch`
  mocked directly for the two semantic-analysis endpoints; `testCaseStorage`
  service mocked for the save/load/delete test-case flow, including the
  save-modal's required-name validation and the delete confirmation gate.
- `VendorModal.test.tsx` (7), `ExportChain.test.tsx` (8) — `global.fetch`
  mocked for the vendor lookup modal; `../../utils/exportService`'s two
  named exports (`exportChain`, `validateChainForExport`) mocked outright
  rather than exercised for real, since that module's DOM/Blob/JSZip
  internals are the deliberately-deferred piece from P4 — this keeps
  `ExportChain`'s own button-disabled-state/modal/format-selection logic
  under test without pulling in that unrelated debt.
- `DmnList.test.tsx` (8), `ChainComposer.test.tsx` (10) — the two
  `@dnd-kit`-coupled panels. `VendorModal` is mocked out of both (already
  covered on its own) to isolate the list/composer's own search-filtering,
  used/DRD/vendor-badge display, and remove/clear wiring.
- `ChainConfig.test.tsx` (16) — the largest single panel: the empty-chain
  template browser (predefined vs. user templates, category filtering,
  delete-with-confirm) and the populated-chain view (collapsible validation
  section, wired `TestCasePanel`/`InputForm`/`ExecutionProgress`/
  `ChainResults`/`ExportChain` — all five mocked as stubs here since each
  has its own dedicated test file — Execute/Save button enablement, and the
  save-template modal's sequential vs. DRD-deploy paths, including a failed
  deploy keeping the modal open with the server's error). jsdom doesn't
  implement `Element.scrollTo`, called by an effect that scrolls to the
  execution area — stubbed with `Element.prototype.scrollTo = vi.fn()`.
- `ChainBuilder.test.tsx` (13) — the top-level orchestrator. `DmnList`,
  `ChainComposer`, `ChainConfig`, and `SemanticView` are all mocked as
  minimal stubs (each already covered by its own file) that expose the
  callback props (`onLoadPreset`, `onRemoveDmn`, `onClearChain`,
  `onInputChange`, `onExecute`) as clickable test buttons, so the
  orchestrator's own state machine can be driven without a real DOM drag.
  Covers: loading `availableDmns`/semantic links on mount (and degrading to
  empty on fetch failure); tab switching to Semantic Analysis; loading a
  sequential preset (sets the chain + `defaultInputs`) and a DRD preset
  (synthesizes a `DmnModel` from `drdEntryPointId`/`drdOutputs` and points
  the chain at it); `validateChain`'s core outcome (a chain whose inputs are
  all satisfied validates, one with a missing input does not); removing a
  DMN or clearing the chain resets inputs/results/the loaded template;
  executing without a valid chain alerts instead of calling the backend;
  executing a valid chain posts to `/api/chains/execute` and stores the
  result; a failed execution alerts with the server's error message.
  **Deliberately not covered**: the actual `@dnd-kit` pointer-drag
  interaction (`handleDragStart`/`handleDragEnd`, driven by dnd-kit's own
  sensors) — simulating a real drag gesture in jsdom is high-effort and
  low-value here, since `handleDragEnd`'s own branching logic (add-to-chain
  vs. reorder) is plain array logic exercised indirectly through the
  preset-loading and remove/clear tests above; same "critical interactions,
  not exhaustive" call as the DsoExplorer debounce dropdown.

### `packages/frontend/src/components/FormEditor/*` — P6.5

**36 tests across 3 files · `jsdom` · `@bpmn-io/form-js` mocked outright**

First full embedded-editor library phase. `FormCanvas.tsx` instantiates
`new FormJsEditor({ container })` directly and drives it imperatively
(`importSchema`/`saveSchema`/`on`/`off`/`destroy`) — exercising the real
library in jsdom would mean a full canvas-editor mount (SVG/diagram-js
internals), so `@bpmn-io/form-js` is mocked outright with a small fake
class exposing the same four methods `FormCanvas` actually calls. The two
CSS imports (`form-js.css`, `form-js-editor.css`) are mocked to empty
modules too, since Vitest's CSS handling doesn't need to run for a
component that never really mounts the library.

- `FormList.test.tsx` (14 tests) — no third-party coupling; same
  pure-presentational shape as `RopaList`/`DmnList`, one step up in size.
  Empty/no-match states, organization grouping (ungrouped last) with
  collapse/expand, status badges (EXAMPLE/WIP/DSO), select/delete (with the
  readonly-disables-delete case), double-click-to-rename (blocked for
  readonly forms), the toolbar search, `.form` file import via a real
  `File`/`FileReader` (`userEvent.upload`) — including the language
  inferred from the JSON payload winning over the filename suffix, and an
  invalid JSON file alerting instead of crashing — and the footer
  language/organization selectors only appearing once a form is active.
- `FormCanvas.test.tsx` (8 tests) — using a `vi.hoisted` instance registry
  so each test can grab the live mock editor and drive its `emit('changed')`
  callback: schema import on mount, Save disabled until either the editor
  reports a change or `hasFooterChanges` is true, Save calling `onSave`
  with the saved schema and resetting the dirty flag (with a second edit
  after save re-arming it), Export building a `.form` blob download with
  the effective language/organization stamped in as wrapper metadata
  (`URL.createObjectURL`/`<a>.click()`/`URL.revokeObjectURL` all
  mocked/spied), Close, and the editor's `destroy()` firing on unmount.
- `FormEditor.test.tsx` (14 tests) — the orchestrator. `FormService` and
  `../../utils/exampleVersions` are mocked outright; `FormList`/`FormCanvas`
  are replaced with minimal stubs (both already covered on their own) that
  expose their callback props as clickable test buttons, same pattern as
  the `ChainBuilder.test.tsx` orchestrator. Covers: loading forms on mount
  then hydrating from the server; the "no form selected" placeholder;
  seeding a stale example form (`getStoredVersion` mocked to report exactly
  one of the ~17 example ids as outdated, so only that one triggers a real
  `fetch` + `FormService.saveForm` + `setStoredVersion`) — this needed
  `EXAMPLE_VERSIONS` mocked as a `Proxy` returning a constant so the
  seeding `if (stored >= EXAMPLE_VERSIONS[id])` guard behaves for every
  example id without hand-listing all of them; create/import/load/save/
  rename/delete wiring; the example-form delete guard (alerts, no
  `deleteForm` call); and the unsaved-changes confirm gate on both
  switching forms and closing the canvas (skipped entirely when there are
  no pending changes, shown and honored/declined otherwise). One fixture
  bug caught while writing this: chaining `getForms.mockReturnValueOnce(...)`
  twice broke, because `FormService.getForms()` is called as a `useState`
  initializer argument on **every** render (not just the first, even
  though only the first render's value is used) — exhausting a two-call
  queue crashed on a later render with `forms` being `undefined`. Fixed by
  using a single persistent `mockReturnValue` instead.

### `packages/frontend/src/components/BpmnModeler/*` — P6.6

**78 tests across 9 files · `jsdom` · `bpmn-js/lib/Modeler` + `bpmn-js-properties-panel` mocked outright**

The full canvas-editor phase — larger surface than P6.5's embedded form
editor, since `BpmnCanvas.tsx` (956 lines, the biggest file in the app)
both drives `bpmn-js` imperatively **and** injects React components
(`DmnTemplateSelector`/`FormTemplateSelector`/`DocumentTemplateSelector`)
into the library's own properties-panel DOM via `ReactDOM.createRoot`, on
top of a full deploy-to-Operaton modal (resource discovery, board-owner
derivation, language-mismatch detection). Tackled smallest/least-coupled
first:

- Five small selectors with no third-party coupling —
  `FormTemplateSelector.test.tsx` (4), `RopaSelector.test.tsx` (6),
  `DocumentTemplateSelector.test.tsx` (5), `DsoActiviteitSelector.test.tsx`
  (6), `DmnTemplateSelector.test.tsx` (7) — each mocking its one backing
  service/storage call and asserting the `modeling.updateProperties(...)`
  payload it writes back to the (plain object, not real bpmn-js) `element`
  it's given.
- `BpmnProperties.test.tsx` (5) — pure presentational, no coupling.
  Confirmed a real controlled-input quirk while writing this: since the
  `name` field's `value` prop never changes in these tests (the component
  doesn't hold its own state, it's fully prop-driven), typing one character
  into an existing value re-renders the _same_ prop value each keystroke,
  so the `onUpdateElement` call after typing `'x'` into a `"Task"`-valued
  field fires with `{ name: 'Taskx' }`, not `{ name: 'x' }` — asserted
  against that actual behavior rather than an assumption about how
  controlled inputs "should" work here.
- `ProcessList.test.tsx` (12) — no third-party coupling; the same
  shell/subprocess-nesting-by-organization shape as `FormList`/`RopaList`,
  plus orphan-subprocess handling (calledElement pointing at a shell not
  present in the current filtered bucket) and `.bpmn` file import with
  process-name extraction from the XML. `RopaSelector`/`DsoActiviteitSelector`
  are mocked here (both already covered on their own).
- `BpmnCanvas.test.tsx` (17) — the real `bpmn-js` coupling.
  `bpmn-js/lib/Modeler` is replaced with a small fake class (canvas/
  eventBus/overlays/elementRegistry/propertiesPanel/modeling, each just
  enough surface for what this component actually calls), built inside a
  `vi.hoisted` block so the class exists before the hoisted `vi.mock`
  factory needs it. The fake `propertiesPanel.attachTo()` creates a real
  `.bio-properties-panel-scroll-container` div — the same CSS-class
  selector `BpmnCanvas.tsx` queries via `document.querySelector` before
  injecting a selector component — so the DMN/Form/Document selector
  injection logic (mocked as stubs here, each already covered on its own)
  can be exercised end-to-end through a simulated `eventBus.emit('selection
.changed', ...)`. Manually dispatching bpmn-js's own events outside of
  `userEvent` needed each `emit(...)` wrapped in `@testing-library/react`'s
  `act()` — without it, React's state update from the event handler hadn't
  committed yet by the time the very next synchronous assertion ran,
  producing flaky "element still there" failures. Covers: XML import on
  mount, Save/Export/Close, zoom controls, element-type-driven selector
  injection (`BusinessRuleTask` → DMN selector, `UserTask` → Form + Document
  selectors, `StartEvent` → Form selector only, anything else → no
  selector), and the full deploy modal (resource discovery from matched
  form/document refs, the `ronl:ropaRef`-missing warning, board-owner
  auto-detection from `candidateGroups` with deploy blocked until one is
  picked, and both the success and failure deploy-endpoint responses).
  One real (pre-existing, unrelated) quirk surfaced here rather than
  "fixed": `handleOpenDeployModal`'s `doc.querySelector('process')` never
  matches a namespace-prefixed `<bpmn:process>` element under jsdom's XML
  parser — a bare CSS type selector only matches the null namespace,
  regardless of whether the `bpmn:` prefix's namespace is declared — so the
  component's own `?? 'process'` fallback always wins for XML shaped like
  real bpmn-js output, and the deploy modal's "process key" is therefore
  always the literal string `"process"` rather than the actual process id.
  The test asserts this actual (fallback) behavior and documents it here
  rather than silently working around it, since fixing it isn't in scope
  for a test-writing pass.
- `BpmnModeler.test.tsx` (16) — the top-level orchestrator, same
  "mock the already-tested children as clickable stubs" pattern as
  `ChainBuilder.test.tsx`/`FormEditor.test.tsx`. `ProcessList` and
  `BpmnCanvas` are both replaced with stubs exposing their callback props;
  `../../utils/bpmnTemplates`'s two XML constants are replaced with tiny
  placeholders (the real file is confirmed-static template data, same
  treatment as P4's `bpmnTemplates.ts` deferral). Covers: loading + server-
  hydrating on mount; seeding exactly one of the seven versioned example
  processes when `getStoredVersion` reports it stale; create/import/load/
  save/rename/delete wiring; the shell→subprocess language/organization
  propagation on save (a shell's own language/org always overwrites its
  linked, non-readonly subprocesses'); the RoPA/DSO/language/organization
  footer-draft plumbing and its effect on `hasFooterChanges`; and the
  unsaved-changes confirm gate on both switching processes and closing.

  72.02%/60-69% branch coverage across the three biggest files
  (`BpmnCanvas.tsx`, `BpmnModeler.tsx`, `ProcessList.tsx`) — deliberately not
  chased further: the six other versioned example-seeding blocks in
  `BpmnModeler.tsx` all share the exact shape already proven once, and
  several `BpmnCanvas.tsx` branches (overlay badge refresh internals, the
  background PATCH after a successful deploy, every deploy-resource-warning
  combination) are lower-value repeats of patterns already covered, per the
  same "critical interactions, not exhaustive" scoping the rest of P6 has
  used throughout.

### `packages/frontend/src/components/DocumentComposer/*` — P6.7

**74 tests across 9 files · `jsdom` · `@tiptap/react` exercised for real, `@dnd-kit` exercised for real where possible**

The heaviest remaining directory — both `@tiptap/react` and `@dnd-kit`
coupling together — tackled smallest/least-coupled first, same ordering
discipline as every prior P6.x phase:

- `DocumentList.test.tsx` (14) — no third-party coupling; the same
  org-grouped-list shape as `FormList`/`ProcessList`/`RopaList`, plus
  `.document` file import via a real `File`/`FileReader` (language inferred
  from filename) and invalid-JSON import alerts.
- `BindingPanel.test.tsx` (8) — mocks `fetchVariableHints`. Covers
  process-key-gated variable discovery, clickable hint chips that prefill
  the add-binding form, bare-placeholder auto-wrapping in `{{ }}` on Add,
  and binding list/delete.
- `ContentLibrary.test.tsx` (2) and `AssetLibrary.test.tsx` (5) — trivial
  static block-type palette, and an image-only-filtering asset picker
  (mocks `fetchAssets`) respectively.
- `BlockItem.test.tsx` (7) — mocks `./TextBlockEditor` as a stub. Covers
  every `BlockType` rendering (text/image/variable/separator/spacer),
  delete wiring, and readonly hiding the drag-handle/delete.
- `ZonePanel.test.tsx` (6) — mocks `./BlockItem` as a stub. Covers block
  count display, empty-zone placeholder, delete wiring, and header-click
  collapse toggling.
- `TextBlockEditor.test.tsx` (6) — **exercises real `@tiptap/react`/
  ProseMirror**, unlike `bpmn-js`/`@bpmn-io/form-js` in P6.5/P6.6 (both
  canvas/SVG-heavy and mocked outright there); ProseMirror is DOM/
  `contenteditable`-based and works fine under jsdom once two gaps are
  polyfilled locally in the test file (not globally in `setup.ts`, to avoid
  affecting unrelated tests): `Range.prototype.getClientRects`/
  `getBoundingClientRect` (called by `EditorView.scrollToSelection()` on
  every transaction) and `document.elementFromPoint` (called by
  ProseMirror's mousedown handler via `posAtCoords()`). One query fix:
  `data-placeholder` lives on the empty paragraph node inside `.ProseMirror`,
  not on `.ProseMirror` itself. Covers toolbar/content rendering, placeholder
  text, readonly hiding the toolbar and setting `contenteditable="false"`,
  Bold-toggle active-state styling, and real typed text propagating to
  `onChange` as TipTap JSON.
- `DocumentCanvas.test.tsx` (12) — a discovery changed the approach here:
  `DocumentCanvas.tsx` has **no direct dnd-kit hook coupling** — it receives
  `dragEndEvent`/`dragOverEvent` as props, computed by the parent's
  `DndContext`, and does pure state-transition logic in a `useEffect` keyed
  on `[dragEndEvent]`. That meant the full drag-end resolution matrix could
  be tested by constructing fake `DragEndEvent` objects and driving the
  effect via `rerender()` with a new object reference — no dnd-kit gesture
  simulation needed at all (unlike `ChainBuilder.test.tsx`/P6.4, where that
  simulation was deliberately skipped). Covers toolbar wiring, all 6
  mandatory zones + the conditional annex zone, and every drop case:
  new-block-onto-zone (appends), no-op on an unrecognized drop target,
  ignored entirely when readonly, existing-block moved to a different
  zone's droppable (appended to the end), existing-block reordered within
  the same zone (via `arrayMove`), and existing-block moved to a specific
  position in a different zone.
- `DocumentComposer.test.tsx` (18) — the top-level orchestrator, same
  "mock the already-tested children as clickable stubs" pattern as
  `ChainBuilder.test.tsx`/`FormEditor.test.tsx`/`BpmnModeler.test.tsx`.
  `DocumentService` is mocked with an in-test mutable array backing
  `getTemplates`/`saveTemplate`/`getTemplate`/`deleteTemplate` for
  realistic stateful behavior across multiple calls within one test.
  Covers bootstrap default-template seeding (and not reseeding when
  already present); create/import/load/rename/delete CRUD, including the
  example-delete alert-without-deleting case and the dirty-load confirm
  gate; Save (merging pending footer-draft edits), Save As (`window.prompt`
  spied, including the cancelled-prompt no-op path), Export (`.document`
  blob download via `URL.createObjectURL`/`<a>.click()`/
  `URL.revokeObjectURL`), and Close's dirty-confirm gate; binding add/
  delete and process-key propagation; and the Content/Logos left-panel tab
  switch. One fixture-ordering bug caught while writing this: an early
  version of the "Save As does nothing when the prompt is cancelled" test
  seeded its store with only one template, not realizing the component's
  own bootstrap effect would then seed the two missing `DEFAULT_TEMPLATES`
  entries on mount — calling the mocked `saveTemplate` twice before the
  user ever clicked anything, which made `expect(saveTemplate).not
.toHaveBeenCalled()` fail regardless of whether the Save As cancel guard
  worked. Fixed by seeding the store with all defaults already present, the
  same baseline the other CRUD tests use.

See `TESTING-GUIDE.md`'s "P6 breakdown" table — remaining scope (`App.tsx`,
`Changelog.tsx` — P6.8) is not yet started.

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
`ronl-business-api`'s conventions exactly. As of P6.7: **109 backend
tests** across 14 suites, **526 frontend tests** across 57 files — 635
total. Every tested file across both packages is at or near 100% line +
branch coverage; the only files noticeably below that are
`health.routes.ts` (89.74%), the P5 service files (`bpmnService.ts`/
`documentService.ts`/`formService.ts` at ~92-94% branch, `dsoService.ts` at
~90%/72% branch, `templateService.ts` at ~91%/79% branch, the two storage
modules at ~84-90%), and the P6 files (`RopaEditor.tsx` at 93.33%/70%
branch, `RopaRecordEditor.tsx` at ~86%/81% branch, `DsoExplorer.tsx` at
72.02%/68.02% branch, `ChainConfig.tsx` at ~85%/81% branch, `ChainBuilder.tsx`
at ~78%/57% branch — mainly the un-simulated `@dnd-kit` drag-gesture
handlers — the `FormEditor` trio all around 90%/65-80% branch,
`BpmnCanvas.tsx`/`BpmnModeler.tsx`/`ProcessList.tsx` at ~70-86%/60-88%
branch, and the P6.7 `DocumentComposer` files at ~73-91%/62-89% branch,
`TextBlockEditor.tsx` lowest at ~68%/85% — the un-simulated portions of the
TipTap toolbar) — each gap is an uncovered defensive/edge branch or a
genuinely lower-value permutation (e.g. every disabled-state combination, a
debounced type-ahead dropdown, a real pointer-drag gesture, or one of six
near-identical example-seeding blocks already proven once), not an
untested code path. Still a meaningful slice of the ~12,371-line backend
and ~22,684-line frontend — a repo-wide number is premature until the
remaining backend route files and the rest of P6 (P6.8 — see
`TESTING-GUIDE.md`) are further along, same reasoning the CPSV Editor's
guide used.

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
