# Outbound targets: validate what the backend is told to call (#142)

## Problem

Several backend routes send requests to a URL the caller supplies, some with a credential the caller supplies. None validates the URL, and the backend authenticates no caller, so anyone who can reach it can make it request any host — internal addresses and cloud metadata included — and read back the response or its error text. Two of those routes change remote state: `update-service` triggers a TriplyDB sync with a caller-supplied token, and `process/deploy` deploys to a caller-supplied Operaton.

#142 lists seven operations. The survey for this design found more: the chain, template, vendor and SHACL routes also take an `endpoint`.

## Decisions

Taken with the user on 18 September 2026.

1. **SPARQL endpoints stay open to public HTTPS hosts.** Typing an endpoint is a feature — the header input, the settings panel and "Add endpoint" all exist for it — so a host allowlist would remove it. Instead any `https:` host is accepted, and the address it resolves to must not be internal.
2. **Credential-carrying and state-changing targets are allowlisted.** TriplyDB calls that forward a token accept only `https:` hosts in `TRIPLYDB_ALLOWED_HOSTS`, defaulting to `api.open-regels.triply.cc`, the only TriplyDB host anything uses today.
3. **The Operaton deploy target is no longer the caller's to choose.** `process/deploy` always deploys to the configured `OPERATON_BASE_URL`, through the shared client.
4. **Inbound authorisation is split off.** Deciding who may call the state-changing routes means adding authentication to a backend that has none, which reaches the LDE frontend, ttl-editor and ronl-business-api. It gets its own issue; #142 records that.

### Operaton credentials

Operaton will require credentials soon. Decision 3 is what makes that safe: credentials live in the backend's App Service settings and never come from a browser. The shared client already sends `Authorization: Bearer <OPERATON_API_KEY>` when that setting is present (`operaton.service.ts:25`), so every Operaton call — deploy, DRD deploy, evaluate, XML fetch — follows one setting.

Operaton's built-in REST authentication is HTTP Basic. If that is what gets switched on, the shared client needs `OPERATON_USERNAME` and `OPERATON_PASSWORD` beside the API key. That is a change in one place and is **not** built in this pass, because the scheme is not yet known.

## Rules per kind of target

| Target                | Where                                                                                                                                                                                              | Rule                                              |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| SPARQL endpoint       | `GET /norms`, `GET /dmns`, `/dmns/semantic-equivalences`, `/dmns/enhanced-chain-links`, `/dmns/cycles`, `/dmns/{identifier}`; the chain, template, vendor and SHACL routes; `POST /triplydb/query` | `https:`, any host, resolving to a public address |
| TriplyDB with a token | `POST /triplydb/update-service`, `/list-graphs`, `/test-connection`                                                                                                                                | `https:`, host in `TRIPLYDB_ALLOWED_HOSTS`        |
| Operaton deploy       | `POST /dmns/process/deploy`                                                                                                                                                                        | no caller URL; the configured Operaton            |

Rejected targets answer **400** `INVALID_INPUT` in problem details, with a `detail` naming the field and why — "`endpoint` must use https", "`config.baseUrl` host example.org is not an allowed TriplyDB host", "`endpoint` resolves to a private address" — before any outbound request is made.

**`ALLOW_LOCAL_ENDPOINTS=true`** additionally admits `http:` and loopback and private targets, for a local Jena and a local Operaton. It is set in the local `.env` only and is off on ACC and PROD. It does not widen `TRIPLYDB_ALLOWED_HOSTS`.

"Internal" means: loopback (`127.0.0.0/8`, `::1`), private (`10/8`, `172.16/12`, `192.168/16`, `fc00::/7`), link-local and cloud metadata (`169.254/16`, `fe80::/10`), unspecified (`0.0.0.0`, `::`), carrier-grade NAT (`100.64/10`), and IPv4-mapped IPv6 forms of all of these.

## Architecture

Two checks, because one is not enough.

**At the route — `src/utils/outboundUrl.ts`.** Three functions, `checkSparqlEndpoint`, `checkTriplyDbBaseUrl` and `checkOperatonTarget`, each taking the raw value and returning either the parsed `URL` or a reason. They parse the URL and check scheme, credentials in the URL (refused), the host allowlist where one applies, and IP-literal hosts. Routes turn a reason into a 400 through the existing `sendProblem`. This is what gives the caller a clear answer.

**At connect — `src/utils/guardedAgent.ts`.** An `http.Agent` and `https.Agent` whose `lookup` resolves the name and refuses an internal address. This closes what the route check cannot see: a public name that resolves to an internal address, a name whose DNS answer changes between check and request, and a redirect to an internal host. A refusal here surfaces as a failed upstream call, which the routes already answer as an error.

Every client that goes to a caller-supplied host uses the guarded agent: the per-endpoint axios clients in `sparql.service.ts` and `norms.service.ts`, whatever client the chain, template, vendor and SHACL routes reach their endpoint through (the plan traces each), and the TriplyDB service. The three `fetch` calls in `triplydb.service.ts` move to axios so there is one mechanism to guard. The clients for configured hosts (Operaton, DSO) are left alone.

With `ALLOW_LOCAL_ENDPOINTS` on, the agent admits internal addresses as well, so local development keeps working end to end.

## Behaviour changes

### `POST /v1/dmns/process/deploy`

- Deploys through the shared Operaton client, which carries `OPERATON_API_KEY`.
- `operatonUsername` and `operatonPassword` are ignored and marked deprecated.
- `operatonUrl` equal to the configured base URL is accepted, so an unupdated frontend keeps working; any other value answers 400. Refused rather than ignored, so nobody believes they deployed somewhere they did not. Marked deprecated.
- The bundle record stores the configured Operaton URL, the one actually used.

### `GET /v1/triplydb/assets`

- The token is read from `Authorization: Bearer`. The `apiToken` query parameter is removed: no caller passes it. `logoResolver.ts` sends the header instead.
- `account` and `dataset` are URL-encoded before they go into the upstream path.

### TriplyDB routes with a token

- `update-service`, `list-graphs` and `test-connection` apply the allowlist.
- `test-connection` checks its required fields, which it does not today — `config: {}` currently fetches `undefined/datasets/undefined/undefined`.

### Frontend

- The deploy modal loses its Operaton URL, username and password fields — the two credential fields were never sent — and shows a read-only line naming the target.
- The "Local Jena" preset is shown only in development builds. On ACC and PROD it only ever reached the backend's own machine.
- Error text for a refused endpoint already arrives through `getProblemDetail`.

### Other callers

- **ttl-editor** reads `detail` for LDE errors from its own fix, done separately and before this lands, so a refused TriplyDB host shows its reason.
- **ronl-business-api** calls `GET /dmns?endpoint=` with the RONL TriplyDB endpoint, a public `https:` host: unaffected.

## Configuration

| Setting                  | Default                     | ACC / PROD                    |
| ------------------------ | --------------------------- | ----------------------------- |
| `TRIPLYDB_ALLOWED_HOSTS` | `api.open-regels.triply.cc` | leave unset (default applies) |
| `ALLOW_LOCAL_ENDPOINTS`  | `false`                     | leave unset                   |

Both go into `.env.example` with a comment. Because App Service settings are set by hand, the defaults are chosen so that ACC and PROD need no change.

## Documentation

- `openapi.yaml`: the new 400s on every affected operation; `process/deploy`'s deprecated fields; `/triplydb/assets`' header and the removed query parameter.
- `.spectral.yaml`: the `nlgov:problem-invalid-input` exceptions for `GET /dmns*` and `GET /norms` come out, since `endpoint` is now validated.
- #142: a comment recording the inbound-authorisation split, linking the new issue.

## Testing

- `outboundUrl.ts`: for each check, an allowed host, a disallowed host, `http:`, an IP literal in each internal range, userinfo in the URL, a malformed URL, and the effect of `ALLOW_LOCAL_ENDPOINTS`.
- `guardedAgent.ts`: a name resolving to a public address connects; one resolving to each internal range is refused; a redirect to an internal host is refused. DNS is stubbed, not live.
- Route tests: each affected operation answers 400 for a refused target and makes no outbound call; conformance assertions cover the new responses.
- `process/deploy`: a matching `operatonUrl` succeeds, a different one answers 400, credentials in the body are not used, and the recorded bundle carries the configured URL.
- Frontend: the deploy modal no longer renders the three fields; the Jena preset is absent outside development.
- Live, against the local stack with `ALLOW_LOCAL_ENDPOINTS` on and off.

## Out of scope

- Inbound authentication (its own issue).
- Basic credentials for Operaton, until the scheme is known.
- The browser SPARQL editor's `api.allorigins.win` fallback, which does not go through the backend.
