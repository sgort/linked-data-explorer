# The error contract: problem details, body limits, and input validation (#131, #143, #150)

One pass over three issues that all change what an error response looks like. Doing them separately would write the same responses twice.

- **#131** — return RFC 9457 problem details instead of the `{ success: false, error: { code, message } }` envelope.
- **#143** — answer 400 for an unparsable body and 413 for an oversized one, instead of 500.
- **#150** — validate input on the Assets and ROPA routes, so bad input is a 400 rather than a 500 from the database.

## Order, and why it is not the obvious one

**#131 first, then #143, then #150.**

The investigation recommended the reverse, so that the smaller fixes settle which statuses exist before one mechanical conversion. Counting the work the other way round decides it: converting first means the ~46 response objects #143 adds and the 11 #150 changes are **born** in problem details. The reverse order writes them in the old envelope and converts them again.

Nothing forces the investigation's order: adding a response in the new shape is no harder than adding one in the old.

## What the ruleset actually demands

`adr-ruleset-2.2.1.yaml`, currently satisfied by two rules being switched off:

- `nlgov:use-problem-schema` — every 4xx and 5xx response's content is `application/problem+json`.
- `nlgov:problem-schema-members` — that schema requires `status`, `title` and `detail`.

**Extra members are allowed.** `code` survives as an extension, so the machine-readable identity each handler already sets is kept rather than discarded.

## The seven shapes today

|     | Shape                                                     | Where                                  | Fate                    |
| --- | --------------------------------------------------------- | -------------------------------------- | ----------------------- |
| A   | `{ success, error: { code, message } }`                   | most routes                            | becomes problem details |
| B   | `{ success, error: <string> }`                            | all of `/dso`, `/vendors`              | becomes problem details |
| C   | `{ success, error: <string>, status }`                    | `/triplydb`                            | becomes problem details |
| D   | `{ message }`, no `error` key                             | `POST /triplydb/test-connection`'s 503 | becomes problem details |
| E   | Operaton's own body, or `{ type: 'ProxyError', message }` | `POST /dmns/evaluate/{decisionKey}`    | **stays**               |
| F   | the failure nested at `data.error`                        | `POST /chains/execute`'s non-throw 500 | becomes problem details |
| G   | the health document plus an error                         | `GET /health`'s 503                    | **stays**               |

### The two that stay, and why

**E is a proxy.** That operation exists so a caller reads Operaton's raw response; the frontend checks its body for Operaton's own `RestException`. Rewriting it into our shape would make the proxy lie about what upstream said.

**G is a resource, not an explanation.** `/health`'s 503 body _is_ the health document — the same blocks a 200 carries, reporting which dependency is down. Replacing it with problem details would throw away the information the status exists to convey.

Both keep a narrowly scoped `.spectral.yaml` exception stating that reason.

## Decisions taken, to be recorded in the pull request

1. **`code` is kept** as an extension member alongside `status`, `title` and `detail`.
2. **`instance`** carries the request path, so a report names the call that produced it.
3. **A delete of a row that does not exist stays 200**, and the description says so. A user clearing something already gone should not be shown an error. #150 left this open per delete; this is the answer for all of them.
4. **Validation goes as deep as the database's own constraints and no deeper**: presence, type and enum mirroring `NOT NULL` and `CHECK`, plus a UUID shape check where the column is a UUID the route casts. XML and JSON blobs are checked for presence, not parsed — a BPMN that parses is not the API's promise to make.
5. **The two free-text lookups by process id are not validated.** Any string is a legitimate lookup; a miss is a 404 or an empty list, which is what they already answer.

## Phases

Each lands as its own commit. Route code, the document and the tests move together in every one, because the coverage test and the conformance assertions enforce that.

### Phase 1 — problem details (#131)

A shared helper that builds a problem response, wired through the global error handler and every route that answers an error itself. 117 of 184 documented responses change. The two exceptions above stay as they are, with their reasons.

Also fixes, as it goes, a bug the investigation found: the chain builder reads `data.error?.message` from a response that nests its message at `data.error`, so a failed chain execution has always shown "Unknown error".

Five frontend components read `error.message` and are updated with it. The other repository needs nothing: both its consumers read `success`/`data` or catch on status, and no test there asserts an error shape.

### Phase 2 — unparsable and oversized bodies (#143)

The global error handler currently loses body-parser's own `type` and `status`, so everything becomes 500. Restore them: 400 for a malformed body, 413 for one over the 10 MB limit. 23 operations parse a body and gain both responses.

### Phase 3 — input validation (#150)

The Assets and ROPA upserts validate what the columns require; `DELETE /assets/ropa/{id}` checks the id's shape rather than letting Postgres reject the cast. The eleven-operation grouped override comes out, in whole or in part — whatever remains keeps a reason that is still true.

### Phase 4 — record it

The design spec's error-format section, `info.description`, and the remaining exceptions. `use-problem-schema` and `problem-schema-members` are switched back on.

## Verification, every phase

From `packages/backend` unless noted:

- `npx jest --config jest.config.js --coverage=false`, and the frontend's `npx vitest run` where it is touched;
- `npm run lint:openapi`, plus Spectral at every severity;
- typecheck, lint and the formatter in both packages;
- the OpenAPI coverage test, which fails if the document and the routes disagree.

The user runs the full suite before the branch is pushed.

## Known risk

One consumer cannot be checked: `ropa.flevoland.nl` reads the public ROPA endpoint and is not reachable from here. Its success shape is unchanged; only error bodies move. Worth an announcement rather than a compatibility window, since no other consumer reads an error body at all.
