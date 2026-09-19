# OpenAPI phase 3: Validation and Execution (#135)

Phase 3 of #129. Design: `docs/superpowers/specs/2026-09-15-openapi-description-design.md`.

Describes the nine `/v1` operations of the Validation and Execution mounts in `packages/backend/openapi/openapi.yaml`, and checks each one against real responses in its route test. No handler, service or middleware changes: the document describes what the handlers send today.

`openapi/pending.json` goes from 42 entries to 33, and `PENDING_CEILING` in `src/openapi/coverage.test.ts` with it.

## Operations

| Mount                  | Operation                               | 400 reachable                                |
| ---------------------- | --------------------------------------- | -------------------------------------------- |
| `/v1/shacl`            | `POST /shacl/validate`                  | yes — `content` missing or not a string      |
|                        | `POST /shacl/validate-merged`           | yes — same check                             |
| `/v1/chains/templates` | `GET /chains/templates`                 | no — unknown query values are ignored        |
|                        | `GET /chains/templates/{id}`            | no — an id resolves to 200 or 404            |
|                        | `GET /chains/templates/categories/list` | no — takes nothing                           |
|                        | `GET /chains/templates/tags/list`       | no — takes nothing                           |
| `/v1/chains`           | `GET /chains`                           | no — takes nothing                           |
|                        | `POST /chains/execute`                  | yes — `dmnIds` empty, `inputs` missing       |
| `/v1/process`          | `GET /process/{key}/variable-hints`     | no — the key is passed to Operaton unchecked |

## Tasks

Each task adds its operations and schemas to `openapi.yaml`, removes its entries from `pending.json`, lowers `PENDING_CEILING`, and adds a conformance `describe` block to the mount's route test. Each is reviewed before it is committed.

### Task 1 — `/shacl` and `/process` (3 operations, ceiling 39)

Inventory: `inventory-shacl-process.md`.

- `ShaclValidationResult` is the shared 200 payload of both SHACL operations: `valid`, `complete`, `parseError` (string or null), and `layers`, which is a **closed** three-key object (`cprmv`, `cpsv-ap`, `ronl-custom`), not a map. It is a different shape from the `/health` SHACL block, which is a map, so no reuse.
- `ShaclIssue`'s `code`, `message` and `location` come from the shape files and the parser: plain strings, never enums.
- `GET /process/{key}/variable-hints` answers `{ success, variables }` with **no `timestamp`**, so it is not the envelope every other 200 uses. Its 500 is `{ success: false, error: { code, message } }` with both values fixed in the handler; that body would satisfy the shared `ErrorEnvelope`, but its own schema pins the two fixed values with `const`, which the shared one cannot. `variables` may be empty.
- Both test files build a bare app today. Add a `makeDocumentedApp()` with `versionMiddleware` in each, as the `/cache` and `/triplydb` blocks do.
- Cover per mount: both SHACL operations' 200 and 400, one 500, and the malformed-body 500 (#143); the process operation's 200 (including an empty `variables`) and 500.

### Task 2 — `/chains/templates` (4 operations, ceiling 35)

Inventory: `inventory-chains-templates.md`.

- One `ChainTemplate` schema serves the list and the by-id read. `defaultInputs` is free-form.
- `type`, `category` and `complexity` are TypeScript unions fixed in the template definitions, not values from data, so they may be enums. Today's three templates exercise only part of each union; the schema follows the union, not the sample.
- The list operation reads three optional query strings, `category`, `tag` and `endpoint`, and never answers 400. There is no `complexity` or `search` filter: `complexity` is a template property only. The by-id read answers 404 with an `ErrorEnvelope` whose message contains the id.
- `categories/list` and `tags/list` answer `{ categories, total }` and `{ tags, total }`, arrays of plain strings with their count. They take nothing.
- Cover: 200 for all four, the 404, and at least one 500 (`QUERY_ERROR`).

### Task 3 — `/chains` (2 operations, ceiling 33)

Inventory: `inventory-chains-templates.md`.

- `GET /chains` returns chains grouped by their `from` model. That grouping exists only inside the handler, so it needs a fresh schema; the DMN schemas from phase 2 do not fit. Every value comes from SPARQL: plain strings.
- `POST /chains/execute` is the hard one. **Its 500 has two shapes**: the orchestrator resolving with `success: false` gives `{ success: false, data: { …, error: <string> } }`, while the orchestrator throwing gives the `ErrorEnvelope` with code `EXECUTION_ERROR`. A malformed body adds the `INTERNAL_ERROR` envelope (#143). The 500 needs all three as alternatives.
- The 200 payload carries `chainId`, `executionTime`, free-form `finalOutputs`, and `steps` only when the caller asks for them. A step that throws is never added to `steps`, so every step in a delivered response has its outputs and timings set, and the type's `error` field is unreachable. `OperatonDecisionResult` from phase 2 is the wrong shape here: these values are already unwrapped.
- Cover: 200 with and without steps, both 400 messages, both 500 shapes, and the malformed-body 500.

### Task 4 — record the exceptions in the spec (no ceiling change)

Add a phase 3 paragraph to the design spec next to the phase 2 one, naming each new `nlgov:problem-invalid-input` exception and its reason, and repeating each reason as a comment in `openapi/.spectral.yaml`. Expected exceptions: `GET /chains/templates`, `GET /chains/templates/{id}` and `GET /process/{key}/variable-hints` — each takes a parameter and none can answer 400. Operations that take no parameter at all need no exception; the lint run decides, and an exception is only added where the rule actually fires.

## Constraints

- Describe, don't change: no handler, service or middleware edits.
- Spectral `files` pointers encode path braces as `%7B…%7D`.
- Error bodies stay as they are today; RFC 9457 is #131.
- Every POST's 500 also allows the `ErrorEnvelope` from a malformed body (#143).
- Values that come from data are plain strings, never enums.

## Verification, per task

From `packages/backend`:

- `npm run lint:openapi` — no errors, no warnings.
- `npx jest --config jest.config.js <the task's test files> src/openapi --coverage=false`.
- `npm run typecheck` and `npm run lint`.
- `pending.json` shrinks by exactly the task's operations, and the ceiling matches its new length.

The full suite (`npm test --workspace=packages/backend`) is run by the user before the branch is pushed.
