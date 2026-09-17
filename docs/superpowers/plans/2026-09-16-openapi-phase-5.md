# OpenAPI phase 5: Integrations, and closing the pending list (#137)

Phase 5 of #129, the last one. Design: `docs/superpowers/specs/2026-09-15-openapi-description-design.md`.

Describes the 18 `/v1` Integrations operations in `packages/backend/openapi/openapi.yaml`, checks each against real responses in its route test, and then **removes the pending mechanism**: `openapi/pending.json` and `PENDING_CEILING` go, and `src/openapi/coverage.test.ts` keeps one rule — every served `/v1` operation is documented. No handler, service or middleware changes.

## Operations

| Mount         | Operations                                                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `/v1/dso`     | `GET /dso/activiteiten`, `POST /dso/activiteiten/oin`, `POST /dso/activiteiten/zoek`, `GET /dso/activiteiten/{urn}`            |
|               | `GET /dso/begrippen`                                                                                                           |
|               | `POST /dso/werkzaamheden/suggereer`, `POST /dso/werkzaamheden/zoek`, `GET /dso/werkzaamheden/{urn}`                            |
|               | `GET /dso/toepasbare-regels`, and its `{id}/dmn`, `{id}/form-scaffold` and `{id}/sttr` reads                                   |
| `/v1/edocs`   | `GET /edocs/status`, `POST /edocs/workspaces/ensure`, `POST /edocs/documents`, `GET /edocs/workspaces/{workspaceId}/documents` |
| `/v1/vendors` | `GET /vendors`, `GET /vendors/dmn/{identifier}`                                                                                |

## What the inventories found, and what it means for the document

**The issue expects 502s and 503s. Only one of those exists.** DSO answers **502** when its upstream call fails, and that is the only gateway status in the phase. There is no 503 anywhere. eDOCS and the vendor reads swallow every upstream or service failure into a fixed local 500. `GET /edocs/status` answers **200 with `status: "down"`** when the upstream is down, which is easy to get backwards.

**A second error shape.** DSO and the vendor reads answer `{ success: false, error: <string> }` — a bare string, not the `{ code, message }` of `ErrorEnvelope` and not `TriplyDbError`. Both mounts use the same shape, so it becomes **one shared schema**, not one per mount. The malformed-body 500 from the global handler is still `ErrorEnvelope`, so several operations carry both shapes at different statuses.

**Which failures are reachable where:**

- **400** on exactly three DSO operations (a missing `oin`, a missing `zoekterm`, and a missing or repeated `functioneleStructuurRef`) and on the two eDOCS `POST`s, which check their own fields.
- **404** on the six single-resource DSO reads only. The list and search operations flatten a miss into 502.
- **422** exactly once: the DMN read, when the upstream document has no definitions element.
- **No 404** for an unknown eDOCS workspace or vendor identifier — both answer 200 with an empty list.

**Two operations do not return JSON at all.** The STTR and DMN reads send XML with a `Content-Disposition` attachment header. The conformance helper already validates a non-JSON body through `res.text`, and real STTR files exist under `examples/organizations/flevoland/STTR/` if a realistic fixture is wanted.

**Upstream data is open.** Eight of the twelve DSO operations wrap whatever the upstream sent. Those payloads get a loose schema, not a hand-enumerated one. Dutch domain terms that look enumerable are plain strings; the one real enum is the form-scaffold field type, which the code itself decides.

**Doc drift to describe correctly:** the route comments say the default page size is 10; the running default is 20. The document follows the code.

**Test apps need work before they can check anything.** The eDOCS test app has no version middleware, and no DSO test app wires the error handler, so the malformed-body 500 cannot be exercised there yet. Several existing fixtures do not match the real types and should be rebuilt rather than reused.

## Tasks

Each task adds its operations and schemas, removes its entries from `pending.json`, lowers `PENDING_CEILING`, and adds conformance tests. Each is reviewed before it is committed.

### Task 1 — `/dso` activities, concepts and activity suggestions (8 operations, ceiling 10)

The four `activiteiten` operations, `begrippen`, and the three `werkzaamheden` operations. Introduces the shared bare-string error schema and the generic success wrapper. Cover each 200, all three 400s, a 404, a 502, and the malformed-body 500.

### Task 2 — `/dso/toepasbare-regels` (4 operations, ceiling 6)

The list and the three per-rule reads. This is where the XML responses and the single 422 live, and where the form-scaffold enum is decided. Cover each 200 including both XML bodies, the 400, a 404, the 422 and a 502.

### Task 3 — `/edocs` and `/vendors` (6 operations, ceiling 0)

Both eDOCS `POST`s' 400s, the status read's 200-when-down, the empty-list answers for unknown workspaces and vendors, and the vendor error shape. `pending.json` reaches zero here.

### Task 4 — remove the pending mechanism and record the phase

Delete `openapi/pending.json` and `PENDING_CEILING`, and reduce `src/openapi/coverage.test.ts` to the rule that every served `/v1` operation is documented, with its header comment rewritten to say so. Add the phase 5 paragraph to the design spec, including any new lint exception and its reason, and tick #129's acceptance criteria in the pull request.

## Constraints

- Describe, don't change: no handler, service or middleware edits.
- Spectral `files` pointers encode path braces as `%7B…%7D`.
- Error bodies stay as they are today; RFC 9457 is #131.
- Every operation with a request body also allows the `ErrorEnvelope` from a malformed body (#143).
- Values from upstream are plain strings, never enums, however enumerable they look. A value the code itself decides may be an enum.
- A schema is only exercised if a fixture populates it: every array and optional field a task documents needs a fixture that fills it, and at least one fixture per record type that omits every optional field.

## Verification, per task

From `packages/backend`:

- `npm run lint:openapi` — no findings at any severity.
- `npx jest --config jest.config.js <the task's test files> src/openapi --coverage=false`.
- `npm run typecheck` and `npm run lint`.
- The pending list shrinks by exactly the task's operations, and the ceiling matches — until Task 4 removes both.

The full suite (`npm test --workspace=packages/backend`) is run by the user before the branch is pushed.
