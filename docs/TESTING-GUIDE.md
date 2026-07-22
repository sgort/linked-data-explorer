# Testing Guide — Linked Data Explorer

Companion to the CPSV Editor's `docs/TESTING-GUIDE.md` and `docs/TESTS.md` —
same phased approach, same "document findings, don't silently patch them"
discipline — adapted for this repo's actual shape, which is genuinely
different: a real Express backend (already has Jest installed, zero tests)
alongside a Vite/React frontend (zero test tooling at all), plus a static
`ropa-site` with no code to test.

## Analysis

### Current state

- **`packages/backend`** (Express + TypeScript, 50 files, ~12,371 lines):
  Jest, `ts-jest`, `supertest`, and `@types/jest` are **already installed**
  (`test`/`test:watch`/`test:coverage` scripts exist), but there is
  **no `jest.config` file and zero test files**. Running `npm test` right
  now exits with code 1: `No tests found, exiting with code 1` (169 files
  checked, 0 matches) — the exact same "would be red in CI" finding the
  CPSV Editor's `App.test.js` stub was, just from the opposite direction
  (tooling ready, nothing written yet, rather than something stale).
  `packages/backend/src/routes/registry.ts` is already a self-maintaining
  single source of truth for route mounting + the root listing (confirmed
  while patching `bump-release.md` for this repo) — one less manual-sync
  concern than `ronl-business-api`'s equivalent `index.ts` endpoint map.
- **`packages/frontend`** (Vite + React + TypeScript, 78 files,
  ~22,684 lines): **no test tooling at all** — no Vitest, no
  `@testing-library/*`, no `msw`, no `test` script. Unlike the CPSV Editor,
  there is **no bundler migration to sequence around** — this app is
  already on Vite, so adding Vitest is a direct, one-step addition, not a
  "tests first, then migrate" phased concern.
  - `src/utils/` (7 files, 2,595 lines): pure-logic-leaning — `exportFormats.ts`,
    `exampleVersions.ts`, `testData.ts`, `logoResolver.ts`, `constants.ts`,
    `exportService.ts`, `bpmnTemplates.ts` (the two largest, `exportService.ts`
    and `bpmnTemplates.ts`, likely mix pure transforms with some DOM/library
    calls — worth checking function-by-function once in scope).
  - `src/services/` (11 files, 1,547 lines): network- and
    `localStorage`-touching — `ropaService`, `documentService`, `formService`,
    `bpmnService`, `assetService`, `sparqlService`, `templateService`,
    `dsoService` (API wrappers); `testCaseStorage`, `userTemplateStorage`
    (`localStorage`-backed); `defaultTestCases` (likely static data).
  - **No custom hooks anywhere** in the frontend (checked directly — no
    `export function use*` / `export const use*` outside `node_modules`).
    Unlike the CPSV Editor, there's no hooks phase to plan for here.
  - `src/components/` (8 feature directories: `BpmnModeler`, `ChainBuilder`,
    `common`, `DocumentComposer`, `DsoExplorer`, `FormEditor`, `RopaEditor`,
    `Tutorial`) plus `App.tsx` (838 lines) — untested, and the heaviest
    lift here: several components wrap third-party editor libraries
    (`bpmn-js`, `@tiptap/*`, `@dnd-kit/*`), which is exactly the kind of
    surface worth scoping carefully rather than reaching for exhaustive
    coverage.
  - `Changelog.tsx` already picked up real TypeScript interfaces during the
    `bump-release.md` CalVer/commits-format adoption (this session) but has
    no rendering tests of its own yet.
- **`packages/ropa-site`**: static HTML + a `staticwebapp.config.json`, no
  `package.json`, no code to test — confirmed out of scope, same conclusion
  as when it came up scoping `bump-release.md` (deploys via its own
  path-filtered workflow, never version-bumped, nothing here to unit test).
- **No CI test step anywhere.** None of the path-filtered Azure workflows
  (`azure-frontend-*`, `azure-backend-*`, `azure-ropa-site-*`) run `npm test`
  for either package — consistent with there being nothing to run yet, but
  worth a deliberate look once real coverage exists (see "Not in scope" at
  the end of `TESTS.md` once that file exists, mirroring the CPSV Editor's
  same deferral).
- **Husky hooks** (`pre-commit`: `lint-staged`; `pre-push`: `lint` +
  `check-format`) don't run tests either — same pattern as the CPSV Editor,
  not something this plan needs to change.

## Plan

### Backend: mirror `ronl-business-api`'s Jest conventions directly

This backend's shape (Express routes, service-layer modules, a Postgres
pool, external HTTP calls to Operaton/TriplyDB/SHACL validators) is far
closer to `ronl-business-api`'s backend than to anything in the CPSV
Editor. Rather than inventing new conventions, follow
`ronl-business-api/docs/TESTS.md`'s established pattern directly:

- **Unit-test services** with their real dependencies mocked (`axios`,
  `pg`, `n3`/`rdf-validate-shacl`, `sparql-http-client`) — one test file per
  service, colocated (`foo.service.ts` → `foo.service.test.ts`).
- **Route-level tests** with `supertest` + the service layer mocked —
  covering the happy path, validation/400s, and upstream-failure → 5xx
  mapping per route, the same shape `ronl-business-api`'s
  `pa.routes.test.ts` / `edocs.routes.test.ts` use.
- **Add a real `jest.config`** (currently absent — Jest's zero-config
  defaults happen to work for basic discovery, but an explicit `ts-jest`
  preset + `testEnvironment: 'node'` + `collectCoverageFrom` across
  `src/**/*.ts` is worth setting up deliberately rather than relying on
  defaults, matching `ronl-business-api`'s "untested files report as 0%,
  not omitted" coverage philosophy).
- **`utils/config.ts`-style artifacts**: if anything here self-runs on
  import (env validation, `dotenv`, a DB pool constructor) the way
  `ronl-business-api`'s `utils/config.ts` does, expect the same
  documented-artifact treatment (0% coverage, not a gap) rather than
  fighting it.

### Frontend: Vitest + RTL + jsdom + `msw`, no migration checkpoint needed

Since this frontend is already on Vite, there's no CRA-style "tests first,
then migrate" sequencing to plan around — the tooling bootstrap is a single
step:

- Add `vitest`, `@testing-library/react`, `@testing-library/jest-dom`,
  `@testing-library/user-event`, and `jsdom` as devDependencies.
- **Environment strategy**: default `vite.config.ts`'s `test.environment` to
  `'node'` (fast, correct for the `utils/`/most of `services/`) and use a
  per-file `// @vitest-environment jsdom` docblock for anything that needs
  the DOM — mirroring `ronl-business-api`'s established frontend
  convention exactly (that plan already worked out this exact tradeoff).
- **Network mocking: `msw`, not a plain `fetch` mock.** This is a real
  deviation from the CPSV Editor's P4 choice, and deliberately so: the
  CPSV Editor's network surface was two small helper files with one
  self-contained `fetch` call each. This frontend's `services/` directory
  is eight distinct API-wrapper modules across real, varied endpoints
  (ROPA, documents, forms, BPMN, assets, SPARQL, templates, DSO) — closer
  to the "larger surface" `msw` was always meant for. Reconsider per-file
  if a given service turns out to be a single trivial call, but default to
  `msw` here.
- `testCaseStorage.ts` / `userTemplateStorage.ts` (`localStorage`-backed):
  same pattern as the CPSV Editor's `triplydbHelper.js` persistence
  tests — jsdom's `localStorage` is real, no mocking needed, just clear it
  between tests.

### Component testing: scope to critical interactions, not exhaustive coverage

`components/` wraps several third-party editor libraries directly
(`bpmn-js`, `@tiptap/*`, `@dnd-kit/*`). Full behavioral coverage of, say,
`BpmnCanvas.tsx` would mean either mocking `bpmn-js` extensively or fighting
a real canvas library in jsdom — neither is good value early on. Same
discipline the CPSV Editor's guide already committed to for its own
components (P5): critical interactions only (a component renders without
crashing, a known prop drives known output, a callback fires on the
expected user action), not exhaustive branch coverage of every
library-wrapping component.

## Phased approach

| Phase  | Scope                                                                                                                                                                                                                                                                                                                                                                                    | Why this order                                                                                                                                                         |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P0** | Fix the "no tests found" red state: add `packages/backend/jest.config` (or equivalent config) and **at least one real test** so `npm test` exits 0 with actual assertions, not an empty pass.                                                                                                                                                                                            | Same discipline as the CPSV Editor's P0 (fix the red thing first) — here the "red" is emptiness rather than a stale stub, but the fix-first principle is the same.     |
| **P1** | Backend: unit-test the smallest, most self-contained service/utility files first (`utils/etag.ts`, `utils/errors.ts`, `middleware/error.middleware.ts`, `middleware/version.middleware.ts`) — pure or near-pure logic, highest value/lowest cost, same reasoning as the CPSV Editor's P1.                                                                                                | Establishes the Jest+ts-jest convention on easy, low-risk files before tackling services with real external dependencies.                                              |
| **P2** | Backend: unit-test the service layer with mocked dependencies — start with the smaller services (`ropa.service.ts`, `sparql.service.ts`, `assets.service.ts`, `vendor.service.ts`) before the largest (`sparql.service.ts` at 1,090 lines, `dmn-validation.service.ts` at 1,065, `operaton.service.ts` at 849, `dso.service.ts` at 668).                                                 | Mirrors `ronl-business-api`'s service-then-route layering; smaller files first to build the mocking conventions (axios, pg, n3) before the highest-effort files.       |
| **P3** | Backend: route-level `supertest` tests, service layer mocked — start with `health.routes.ts` (already the simplest, smallest route in the CPSV Editor's world too) and the smaller routes, working up to `dmn.routes.ts` (486 lines) and `triplydb.routes.ts` (516 lines).                                                                                                               | Same route-then-service pattern `ronl-business-api` used; needs P2's mocking conventions in place first.                                                               |
| **P4** | Frontend tooling bootstrap (Vitest + RTL + jsdom + `msw`) + `src/utils/` pure-logic tests (`exportFormats.ts`, `exampleVersions.ts`, `testData.ts`, `logoResolver.ts`; `constants.ts` likely skipped as static data, matching the CPSV Editor's `constants.js` call; `exportService.ts`/`bpmnTemplates.ts` triaged function-by-function for pure vs. DOM-touching pieces once in scope). | Highest-value, lowest-cost frontend layer — no tooling investment beyond the one-time bootstrap, same "pure logic first" principle as every prior phase in both repos. |
| **P5** | Frontend `src/services/` — `msw`-mocked network tests for the API wrappers, plain jsdom `localStorage` tests for `testCaseStorage.ts`/`userTemplateStorage.ts`.                                                                                                                                                                                                                          | The real "network-touching, larger surface" phase this repo's `msw` choice was made for.                                                                               |
| **P6** | Frontend components — critical-interaction-only tests for the 8 feature directories plus `App.tsx` and `Changelog.tsx`, roughly smallest/least-third-party-coupled first.                                                                                                                                                                                                                | Highest effort, most third-party-library coupling; last among unit-level work, same ordering principle as the CPSV Editor's DMNTab.jsx-last choice.                    |
| **P7** | Coverage report + CI wiring — generate a real `--coverage` run for both packages once P1–P6 are substantially through, then decide whether/how to add a (non-blocking, at first) test step to the path-filtered Azure workflows.                                                                                                                                                         | Deferred for the same reason the CPSV Editor deferred it: a coverage number this early would measure how little is covered, not how well the covered parts are tested. |

### Not in scope (deliberately deferred)

- **`ropa-site`** — static HTML, no `package.json`, nothing to unit test.
- **E2E/Playwright** — not planned here; if it comes up later, model it on
  `ronl-business-api`'s Phase-1 E2E plan (`docs/TESTING-FRONTEND-UI.md`)
  rather than reinventing one, given this ecosystem already has a working
  reference.
- **Blocking CI test gates** — same reasoning as both sibling repos: added
  only once coverage is meaningful, never as a side effect of this plan.
