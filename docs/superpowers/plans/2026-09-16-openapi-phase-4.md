# OpenAPI phase 4: Assets (#136)

Phase 4 of #129. Design: `docs/superpowers/specs/2026-09-15-openapi-description-design.md`.

Describes the 15 `/v1` operations of the two authenticated Assets mounts in `packages/backend/openapi/openapi.yaml`, and checks each one against real responses in its route test. No handler, service or middleware changes: the document describes what the handlers send today.

`openapi/pending.json` goes from 33 entries to 18, and `PENDING_CEILING` in `src/openapi/coverage.test.ts` with it. The two public mounts, `/ropa/public` and `/bundles/public`, were described in phase 1 and are untouched.

## Operations

| Mount             | Operations                                                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `/v1/assets`      | `GET`, `POST` and `DELETE /assets/bpmn`, `GET /assets/bpmn/by-bpmn-id/{bpmnProcessId}`, `PATCH /assets/bpmn/{id}/deploy` |
|                   | `GET`, `POST`, `DELETE /assets/forms`                                                                                    |
|                   | `GET`, `POST`, `DELETE /assets/documents`                                                                                |
| `/v1/assets/ropa` | `GET`, `POST`, `DELETE /assets/ropa`, `GET /assets/ropa/by-bpmn-id/{bpmnProcessId}`                                      |

## What both inventories found, and what it means for the document

**Nothing here answers 400.** No route validates its input. A missing field, a bad status value, even a non-UUID id all reach Postgres and come back as a 500 with an operation-specific code. The document says so rather than inventing a 400, and one grouped Spectral override records it for the eleven operations the rule covers: the four `POST`s and the seven operations that take a parameter. The four plain list reads take nothing, so the rule never fires for them.

**Every operation can answer 503.** A shared guard answers `DB_NOT_CONFIGURED` when the pool is null. Both mounts already have `no-pool` test files that exercise it.

**404 exists in exactly two places**, the two lookups by BPMN process id. Deleting a row that does not exist answers 200, because no handler checks first; the document must not claim otherwise.

**Three shapes need care:**

- The BPMN lookup by process id returns `{ id, bpmnProcessId, xml }`, a much narrower record than the list's fourteen-field one. Two schemas, not one.
- `schema`, `zones`, `bindings` and `assets` are JSONB columns. The driver returns parsed values, not strings, whatever the TypeScript comments say: free-form JSON in the document.
- The authenticated ROPA record is the phase 1 public record plus a required contact and schema version and an optional DPO contact, and its `status` is the open three-value set rather than the public read's pinned `active`. Both records stay, and the shared nested field schema is reused rather than copied.

**Dates** come back as ISO strings through `Date.toJSON`, and columns that are null are omitted rather than sent as null. Forms and documents take their timestamps from the caller; ROPA's come from the database.

## Tasks

Each task adds its operations and schemas to `openapi.yaml`, removes its entries from `pending.json`, lowers `PENDING_CEILING`, and adds a conformance `describe` block to the mount's tests. Each is reviewed before it is committed.

### Task 1 — `/assets/bpmn` (5 operations, ceiling 28)

Inventory: `inventory-assets-bpmn.md`. Covers the list, the upsert, the lookup by process id, the delete and the deploy mark. The test files need a documented app with `versionMiddleware` and, for the POST, `errorHandler`, which they do not have today. Cover the 200s, the one 404, a 500, a 503 and the malformed-body 500 (#143).

### Task 2 — `/assets/forms` and `/assets/documents` (6 operations, ceiling 22)

Inventory: `inventory-assets-ropa.md`. One schema per record type. Note that a form's response never carries the schema version its table holds, and that `readonly` is hardcoded rather than read from the database. Cover each 200, a 500, a 503, and the malformed-body 500.

### Task 3 — `/assets/ropa` (4 operations, ceiling 18)

Inventory: `inventory-assets-ropa.md`. Adds the authenticated `RopaRecord`, reusing the nested personal-data-field schema from phase 1. Cover the 200s, the 404 on the lookup, a 500, a 503, and the malformed-body 500.

### Task 4 — record the exceptions (no ceiling change)

Add a phase 4 paragraph to the design spec beside the phase 3 one, and the grouped override to `openapi/.spectral.yaml` with its shared reason, pointing at #150, the validation issue this phase opened.

## Constraints

- Describe, don't change: no handler, service or middleware edits.
- Spectral `files` pointers encode path braces as `%7B…%7D`.
- Error bodies stay as they are today; RFC 9457 is #131.
- Every operation with a request body also allows the `ErrorEnvelope` from a malformed body (#143).
- Values that come from data are plain strings, never enums. A value fixed by a TypeScript union or a database constraint at its own definition site may be an enum.
- A schema is only exercised if a fixture populates it: every array and optional field a task documents needs a fixture that fills it.

## Verification, per task

From `packages/backend`:

- `npm run lint:openapi` — no errors, no warnings.
- `npx jest --config jest.config.js <the task's test files> src/openapi --coverage=false`.
- `npm run typecheck` and `npm run lint`.
- `pending.json` shrinks by exactly the task's operations, and the ceiling matches its new length.

The full suite (`npm test --workspace=packages/backend`) is run by the user before the branch is pushed.
