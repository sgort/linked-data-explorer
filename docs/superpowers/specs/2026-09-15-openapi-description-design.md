# Design: an OpenAPI description for the backend (#129)

## Problem

The backend advertises an OpenAPI description that does not exist. `GET /v1/health` and the root endpoint both return `"documentation": "/v1/openapi.json"`, and the root HTML page renders it as a link, but no route serves that path. It answers 404.

That leaves two gaps:

- **Compliance.** The Dutch Government API Design Rules (ADR) require the contract to be published as OpenAPI at `openapi.json` within the API's base path (`/core/publish-openapi`). `health.routes.ts` already cites the ADR rules it follows. The `documentation` pointer exists to satisfy this rule and currently only appears to.
- **Contract.** Clients learn request and response shapes by reading the code, and nothing catches a response shape drifting.

## What exists today

Measured on `acc` at 5530720, 15 September 2026.

- **Routes.** 16 `/v1` mounts in `packages/backend/src/routes/registry.ts`, served by 65 handlers across 16 route files. The registry already drives both mounting (`routes/index.ts`) and the root page (`utils/rootViews.ts`).
- **Legacy aliases.** Seven `/api/*` aliases are hand-mounted in `routes/index.ts` and deliberately excluded from the registry.
  - `dmn-xml.routes.ts` is mounted separately on the app at `/api/dmns`.
  - It duplicates `GET /v1/dmns/:identifier/xml`, which already exists in `dmn.routes.ts`. See #132.
- **No schema or validation library.** Handlers read `req.query`, `req.params` and `req.body` directly. Only `shacl.routes.ts` types its response (`ShaclValidationResult`).
- **Error bodies are an ad-hoc envelope.**
  - The envelope is `{ success: false, error: { code, message, details? }, timestamp? }`.
  - It appears 98 times in the routes (26 × 400, 6 × 404, 52 × 500, 6 × 502, 3 × 503) and in the global `notFoundHandler` and `errorHandler`.
  - One DMN evaluate failure returns a third shape, `{ type: 'ProxyError', message }`.
  - No response is `application/problem+json`.
- **No precedent in the sibling repositories.** Neither `ronl-business-api` nor `ttl-editor` serves an OpenAPI document.

## Decisions

Each was put to the product owner as a choice. The rejected options are recorded so the reasoning survives.

1. **Written by hand, kept true by tests.**
   - A single `openapi.yaml`, with real responses validated against it in the existing route tests.
   - _Rejected: schema-first (zod + zod-to-openapi)._ Strongest drift protection, but it rewrites all 16 route files and adds runtime dependencies.
   - _Rejected: JSDoc annotations (swagger-jsdoc)._ A comment can disagree with its handler as easily as a separate file can, so it needs the same tests anyway.
2. **Delivered in phases, as sub-issues of #129.**
   - A foundation phase, then one phase per group of registry categories.
   - _Rejected: all 65 handlers in one PR._ Too large to review, and schema mistakes are hard to spot in bulk.
   - _Rejected: every path now with loose schemas._ The first document would say little.
3. **The document describes errors as they are.**
   - Linting uses the ADR 2.2.1 ruleset. Its two problem-details rules were turned off until #131 moved every error response to problem details; they now gate. Section C records the one remaining global exception, for the calendar version string.
   - _Rejected: migrating to problem+json first._ It is a breaking change and would delay the document considerably.
   - _Rejected: generic `spectral:oas` linting only._ ADR compliance, the reason for #129, would go unchecked.
4. **`/v1` only.**
   - The ADR rules require the major version in the server URL (`/core/uri-version`), and the aliases are already excluded from the registry on purpose.
   - The DMN XML download needs no special handling, because `/v1/dmns/{identifier}/xml` already exists.
   - An earlier draft proposed a sub-issue to create that route. It was dropped once the route was found.
5. **JSON only, no viewer.**
   - All-origin CORS on `/v1/openapi.json` lets any OpenAPI viewer load the document, so no UI assets or CSP changes are needed.
   - A viewer can be its own issue later.

## Design

### A. The document and how it is served

**Source.** `packages/backend/openapi/openapi.yaml`, OpenAPI **3.1.0**.

- 3.1 schema objects are JSON Schema 2020-12, which lets section B validate responses with a stock validator.
- Paths are relative to the server: `/health`, not `/v1/health`.
- `servers` lists only `https://acc.backend.linkeddata.open-regels.nl/v1` and `https://backend.linkeddata.open-regels.nl/v1`. The ADR rules require both the version segment (`nlgov:include-major-version-in-uri`) and HTTPS (`nlgov:servers-use-https`), so no local `http://` server is listed.
- `info.contact`: name `Steven Gort`, email `steven.gort@ictu.nl`, url `https://iou-architectuur.open-regels.nl/`. This satisfies `/core/doc-openapi-contact`, which asks for a name, URL and email and advises against generic addresses.
- **Tags mirror the registry's categories**, in the registry's own order, so an operation's tag is the group the root page already shows it under — except health checks, which are grouped under _Health & monitoring_ regardless of which registry category their mount lives in. Each phase declares the tags its mounts need: phase 1 declared _Health & monitoring_, _Discovery_ and _Assets_, and phase 3 added _Validation_ and _Execution_. A phase never invents a tag the registry does not have.

**Build.** `packages/backend/scripts/build-openapi.cjs` parses the YAML and writes `openapi/openapi.json`, through a temporary file renamed into place so a concurrent reader never sees half-written JSON.

- It sets `info.version` from `package.json`, so the document and the `API-Version` header cannot disagree.
- It runs before `build` and `dev`.
- `openapi/openapi.json` is gitignored: a generated file that is also committed is a second copy waiting to drift.
- The runtime reads JSON, so the YAML parser stays a dev dependency.

**Route.** `GET /v1/openapi.json`.

- The file is read once, on first request, from `<package root>/openapi/openapi.json`. That is `packages/backend/` locally and `deploy/` in the artifact, the same relative step that already resolves `package.json`, `build-info.json` and `shapes/`.
- Served as `application/json`. The global version middleware adds `API-Version`.
- A registry entry under _Discovery_ ("OpenAPI 3.1 description of this API") makes the root page list it.
- The path is added to `PUBLIC_MOUNTS` in `utils/publicPaths.ts`, because `/core/publish-openapi` requires CORS open to all origins. The file header's reasoning still holds: the data is public and read-only.

**Artifact.** Both backend deploy workflows' _Prepare deployment package_ step copies the built `openapi/openapi.json` into `deploy/openapi/`. The step fails if `deploy/openapi/openapi.json` is missing or empty, mirroring the existing SHACL shapes check.

### B. Keeping the document true

**Coverage test.**

- It derives the served operations from `routeRegistry`: for each mount, it walks the router's Express stack and collects method + path, with the mount prefix stripped of `/v1` and `:param` rewritten to `{param}`. The result is compared with the document's operations.
- The test fails when a served operation is not documented, or a documented operation is not served.
- **While the description was being written**, operations not yet described were listed in `openapi/pending.json`, and a ceiling on that list's length, lowered by each phase, failed the test if an entry was added. The remaining work stayed visible, and the list could only shrink. Phase 5 (#137) emptied it, and the same change deleted the file, the ceiling and the four checks that existed only to police them. What is left is the rule those checks were building towards: a route cannot be served undocumented, and the document cannot describe a route that is not served.
- Root `README.md`'s "Adding or changing a backend route" section walks a contributor through satisfying this gate — document the operation, add a conformance assertion per status, and the commands to run before opening a pull request.

**Response conformance.** A test helper, `expectToMatchOperation(res, method, path)`:

- finds the operation in the parsed document;
- selects the response for `res.status`, falling back to `default`;
- checks the content type;
- validates the body with `Ajv2020` + `ajv-formats` against the schema, with `#/components` references resolved;
- asserts the `API-Version` header on 2xx responses.

Route tests call it for every documented operation, so a handler change that alters a response shape fails its own test.

Neither helper ships. `npm run build` compiles with `tsconfig.build.json`, which excludes `src/**/testing/**`. An ESLint `no-restricted-imports` rule stops non-test code importing them, because the exclusion alone would not: `tsc` follows imports and would compile an imported helper back into `dist`.

### C. Linting

**Ruleset.** The ADR 2.2.1 Spectral ruleset is vendored as `openapi/adr-ruleset-2.2.1.yaml`.

- Its header records the source URL (`https://gitdocumentatie.logius.nl/publicatie/api/adr/2.2.1/media/linter.yaml`), the fetch date and the file's sha256.
- It is vendored rather than fetched in CI. A live URL would let the gate change without a commit, which is exactly what pinning exists to prevent. The unversioned URL shows the risk: on 15 September 2026 `https://static.developer.overheid.nl/adr/ruleset.yaml` redirected (301) to the **2.1.0** ruleset, not 2.2.1.

**Local config.** `openapi/.spectral.yaml` extends the vendored ruleset and turns off one rule globally: `nlgov:semver`, which requires `info.version` to be strict semver.

Two more were off until #131 landed: `nlgov:use-problem-schema`, which requires `application/problem+json` on 4xx and 5xx, and `nlgov:problem-schema-members`, which requires `status`, `title` and `detail`. Both now gate every error response except two, each exempted at the one response it concerns. `POST /dmns/evaluate/{decisionKey}` forwards Operaton's own error body, since that proxy exists so callers can read Operaton's raw response; rewriting it would make the proxy misreport what upstream said. `GET /health`'s 503 body is the health document itself, reporting which dependency is down; a problem response would discard the information the status exists to convey. Removing either exemption makes exactly that response fail, and nothing else.

`nlgov:semver` carries its own reason: the release version is calendar-based, `YYYY.MM.N` with a zero-padded month (`2026.09.4`), which is not valid semver. `info.version` is the same string the `API-Version` header sends, and rewriting it in the document would make the two disagree. This exception was found while planning #133 and approved on 15 September 2026. Every other rule gates.

`nlgov:problem-invalid-input` stays on. It requires a documented 400 on every POST/PUT/PATCH and on every parameterised GET/DELETE. Where a handler genuinely cannot return 400, the phase that documents it adds a per-path override with its reason next to it, never a global one. Documenting a 400 the API does not return would break the principle behind decision 3.

Phase 2 (#134) applied that allowance to seven operations that never answer 400: `DELETE /cache/clear` and six `GET /dmns` reads. `POST /dmns/evaluate/{decisionKey}` was first given the same exception, but documents a 400 instead, because it passes Operaton's 400 through. At most, the six reads take an optional unvalidated `endpoint` (every read except `GET /dmns/{identifier}/xml`), a `refresh` flag (`GET /dmns` only), and a path identifier (`GET /dmns/{identifier}` and `GET /dmns/{identifier}/xml`). It also turned off `nlgov:query-keys-camel-case` for `GET /norms` alone, whose `applicable_date` and `cprmv_version` parameters are snake_case: renaming them would break existing callers. That exception was approved on 15 September 2026. Validating `endpoint` (#142) would let the exceptions on `GET /dmns`, `GET /dmns/semantic-equivalences`, `GET /dmns/enhanced-chain-links`, `GET /dmns/cycles` and `GET /dmns/{identifier}` be removed; `GET /dmns/{identifier}/xml` takes no `endpoint` and keeps its exception regardless.

Phase 3 (#135) added three more exceptions, each to a read whose inputs cannot be invalid. `GET /process/{key}/variable-hints` passes its path key straight to Operaton without checking it, and an empty key does not match the route at all. `GET /chains/templates` takes three free-text filters (`category`, `tag` and `endpoint`) and `GET /chains/templates/{id}` a path id: an unmatched value gives an empty list or a 404, never a 400. Those exceptions were approved on 16 September 2026. The phase's six other operations need none: both `/shacl` validations and `POST /chains/execute` document the 400 they really answer, and `GET /chains`, `GET /chains/templates/categories/list` and `GET /chains/templates/tags/list` take no parameter at all, so the rule does not apply to them.

Phase 4 (#136) needed one exception covering eleven operations, and took it as a single grouped override rather than eleven repetitions of the same sentence, because they share one cause: the Assets operations validate nothing. A request body goes straight into an upsert and a path id straight into a query, so a missing field, an unknown status or a malformed id comes back as a 500 from the database instead of a 400. That is a defect in the API, not a property worth preserving, and #150 records it along with the deletes that answer 200 for a row that does not exist. The four plain list reads take no parameter and need no exception. That grouping was approved on 16 September 2026.

The override did not disappear when the error contract landed; it shrank, and its reason changed. #143 made a malformed body a 400, so every operation that takes a body can now answer one, and the four `POST`s and the deploy `PATCH` left the list. #150 then added real input validation, and `DELETE /assets/ropa/{id}` left too, since it now rejects an id that is not a UUID. Five entries remain, for a reason that is a design choice rather than a defect: the two lookups by process id take free text, where any string is a legitimate key, and the three deletes key on text columns, where no id is malformed and a delete of a missing row answers 200 by decision.

Phase 5 (#137) added one grouped override for twelve Integrations operations, following phase 4's shape. Nine are DSO: four list and search operations that forward every parameter to the upstream API unvalidated, two URN reads where even a malformed path segment ends in the same 502 as any other upstream failure, and three per-rule reads whose opaque id is passed on as given, so a miss is a 404. Three are eDOCS and vendor reads whose only inputs are an unvalidated path id or a free-text endpoint, and which answer an empty list rather than a 400. The rest of the phase needs no exception: three DSO operations and the two eDOCS `POST`s validate their own input and document the 400 they answer, and `GET /edocs/status` takes no parameter at all. Approved on 17 September 2026. Unlike phase 4's override, this one records how these proxies are built rather than a defect: an exception here disappears only if the API starts validating what it forwards. Two entries did leave it when #143 landed — the DSO list-search and work-item-search `POST`s — because a malformed body now answers 400 on every operation that takes one; ten remain.

**CI.** A `lint:openapi` script builds the document and runs Spectral against the built `openapi/openapi.json` with that config. It lints the JSON rather than the YAML because the YAML deliberately has no `info.version`.

- Both backend workflows run it directly after _Run linter_, so on `acc` it gates pull requests.
- It is a `run:` step, not a new `uses:`, so `SECURITY-PIPELINE.md`'s action register and `scripts/check-supply-chain.mjs` are unaffected.

**Dev dependencies.** All pinned exactly and dev-only, so none reach the artifact (_Prepare deployment package_ installs with `--omit=dev`).

| Package                   | Version | Released   | Why this version                                                             |
| ------------------------- | ------- | ---------- | ---------------------------------------------------------------------------- |
| `@stoplight/spectral-cli` | 6.16.3  | 2026-08-03 | Latest; past Renovate's 14-day `minimumReleaseAge`                           |
| `ajv`                     | 8.20.0  | 2026-04-24 | Latest; provides `Ajv2020`                                                   |
| `ajv-formats`             | 3.0.1   | 2024-03-30 | Latest; same organisation as Ajv                                             |
| `yaml`                    | 2.9.0   | 2026-05-11 | 2.9.1 (2026-09-11) was inside the cooldown; 2.9.0 is already in the lockfile |

Maintenance was checked per ICTU guideline recommendation 1: all four have releases within the last year or a stable major, several maintainers, and permissive licences (Apache-2.0, MIT, ISC).

A `--dry-run` install measured **117 added packages**, almost all transitive dependencies of Spectral. Recommendation 9 asks for explicit attention to new build dependencies. They are locked by `package-lock.json` and installed with `npm ci`, and none are shipped.

One of them, `@scarf/scarf` 1.4.0 (required by five `@stoplight/spectral-*` packages), runs a `postinstall` that reports every install to scarf.sh. It is turned off with `"scarfSettings": { "enabled": false }` in the root, backend and frontend `package.json`. Scarf reads the setting from the directory npm is invoked in, and installs run from both the repository root and `packages/backend`. Found in the final review of #133.

### D. Phases

| Sub-issue | Phase                                                                                     | Operations |
| --------- | ----------------------------------------------------------------------------------------- | ---------- |
| #133      | Foundation (sections A–C) + `/health`, `/openapi.json`, `/ropa/public`, `/bundles/public` | 4          |
| #134      | Health & monitoring and Discovery: `cache`, `dmns`, `triplydb`, `norms`                   | 20         |
| #135      | Validation and Execution: `shacl`, `chains/templates`, `chains`, `process`                | 9          |
| #136      | Assets: `assets`, `assets/ropa`                                                           | 15         |
| #137      | Integrations: `edocs`, `dso`, `vendors`; empties `pending.json`                           | 18         |

**66 operations**: the 65 existing handlers plus the new `/openapi.json`. All five phases landed, and #137 emptied the pending list and then removed it, so the coverage test now simply requires every served operation to be documented.

**Related, deliberately not sub-issues:**

- **#131.** Return RFC 9457 problem details from every error response. A breaking change that #129's acceptance criteria did not need. Landed together with #143 and #150, as one pass over the error contract: the two global overrides came out, and the two pass-throughs described under section C are the only responses exempted.
- **#132.** Fetch DMN XML from `/v1` in the frontend (`utils/exportService.ts` still calls `/api/dmns/.../xml`) and remove the duplicate `dmn-xml.routes.ts`. Its presence currently suppresses the deprecation headers on that legacy path.

## Testing

- **Phase 1.** Unit tests for the coverage test's route extraction, including `:param` rewriting, the `/v1` prefix and nested mounts like `/v1/chains/templates`. `expectToMatchOperation` needs a failing case for a wrong status, a wrong content type and a schema violation, so it cannot pass vacuously. A route test proves `/v1/openapi.json` sends `Access-Control-Allow-Origin: *`.
- **Every phase.** The documented operations' route tests validate at least one success and one error response per mount. `npm run lint:openapi` and the full backend suite pass, with the per-file 80% branch floor.
- **After each ACC deploy.** `https://acc.backend.linkeddata.open-regels.nl/v1/openapi.json` is served, and its `info.version` equals `/v1/health`'s `version`.

## Out of scope

- A human-readable documentation viewer (decision 5).
- The `/api/*` legacy aliases (decision 4).
- Request validation at runtime. The document describes what handlers accept; enforcing it is a separate change.
- `ronl-business-api`, which has no OpenAPI document either and needs its own issue in that repository.
