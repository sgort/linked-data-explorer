# Test suite — Linked Data Explorer

Modeled on the CPSV Editor's `docs/TESTS.md` and, more directly, on
`ronl-business-api`'s `docs/TESTS.md` — this backend's shape (Express
routes, service-layer modules, external HTTP calls) is much closer to that
one. For the strategy, sequencing, and remaining backlog, see
[`TESTING-GUIDE.md`](./TESTING-GUIDE.md).

## Running the tests

```bash
# From the repo root — runs every workspace's test script (currently just
# the backend; frontend has none yet, skipped via --if-present)
npm run test

# Backend only
npm test --workspace=@linked-data-explorer/backend

# Watch mode / coverage
npm run test:watch --workspace=@linked-data-explorer/backend
npm run test:coverage --workspace=@linked-data-explorer/backend
```

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

No full coverage report has been generated yet — the four files tested so
far (`etag.ts`, `errors.ts`, `error.middleware.ts`, `version.middleware.ts`)
are each at 100% line + branch coverage, but that's a small slice of the
~12,371-line backend and ~22,684-line frontend. Run
`npm run test:coverage --workspace=@linked-data-explorer/backend` for the
current per-file breakdown; a repo-wide number is premature until P2/P3
(backend services + routes) are further along, same reasoning the CPSV
Editor's guide used.

## Adding tests

Test files are colocated with the source they cover (`foo.ts` →
`foo.test.ts`). `packages/backend/jest.config.js`'s `collectCoverageFrom`
reports every non-excluded `src/**/*.ts` file, so an untested file shows up
as 0% rather than being silently omitted — mirroring
`ronl-business-api`'s coverage philosophy exactly.
