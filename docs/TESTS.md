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

No full coverage report has been generated yet for either package. `npm
test` (root `package.json`'s `"test": "npm run test --workspaces
--if-present"`) always prints both packages' current per-file tables:
`packages/backend`'s `"test": "jest --coverage"` and
`packages/frontend`'s `"test": "vitest run --coverage"`, both matching
`ronl-business-api`'s conventions exactly. Of the sixteen files tested so
far across both packages, all but `health.routes.ts` (89.74%) and
`logoResolver.ts` (98.18%) — each with one documented, effectively-
unreachable defensive branch — are at 100% line + branch coverage. Still
a small slice of the ~12,371-line backend and ~22,684-line frontend — a
repo-wide number is premature until the remaining P3 routes and P5/P6
frontend phases are further along, same reasoning the CPSV Editor's guide
used.

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
