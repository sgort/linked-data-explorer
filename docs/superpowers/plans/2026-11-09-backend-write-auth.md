# Sign-in for the backend's state-changing operations: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the LDE backend's state-changing routes behind the `ronl` realm role `lde-author`. Give the LDE frontend and ttl-editor a sign-in with locked actions. Remove the eDOCS write routes. Add an anonymous `TestOnly` test deploy on localhost and ACC.

**Architecture:**
- The backend checks Keycloak access tokens with `jsonwebtoken` and `jwks-rsa`, following RBA's `jwt.middleware.ts`. It uses two middlewares: `requireAuthor` and `optionalAuthor`. They sit on the route definitions, so the `/api/*` aliases are covered too.
- Both SPAs get a small `keycloak-js` module, a two-entry Sign in menu and a `LockedAction` button. Each SPA asks the backend whether test deploys are on.
- A Keycloak setup script in RBA creates the role and clients on each tier.

**Tech Stack:**
- Express 4, Jest and supertest (LDE backend).
- React 19, Vite and Vitest (LDE frontend, TypeScript; ttl-editor, JSX).
- Playwright (ttl-editor e2e).
- `keycloak-js`, `jsonwebtoken`, `jwks-rsa`.
- Bash with `curl` and `jq` (RBA's Keycloak scripts).

**Spec:** `docs/superpowers/specs/2026-11-09-backend-write-auth-design.md`

## Branches and repositories

| Repo | Branch | Tasks |
| --- | --- | --- |
| linked-data-explorer | `feat/163-write-auth` (exists, holds the spec) | 1–9, 13 |
| ttl-editor | `feat/163-sign-in` (create from `acc`) | 10–12 |
| ronl-business-api | `feat/163-lde-keycloak-clients` (create from `acc`) | 14 |

Each repo's branch is created in its main checkout, with no worktrees. Before every commit, check the branch with `git branch --show-current`. Commits are made only after the owner says yes. Never push to, merge into or commit onto `acc` or `main`. Never start, stop or restart a dev server. Never bypass a hook.

## Global Constraints

- Realm `ronl`. Role **`lde-author`** (one role for every closed route).
- Keycloak per tier:
  - localhost: `http://localhost:8080`
  - ACC: `https://acc.keycloak.open-regels.nl`
  - PROD: `https://keycloak.open-regels.nl`
- Client IDs:
  - `linked-data-explorer` and `ttl-editor`: public, standard flow, PKCE S256, exact redirect URIs and web origins per tier, no direct-access grants.
  - `lde-e2e`: confidential, direct-access grants, localhost and ACC only.
- Sign in has exactly two entries:
  - "Flevoland-account": `idpHint: 'entra-flevoland'`.
  - "Medewerker": `loginHint: '__medewerker__'`.
  - The page with no hint is never used.
- Answers:
  - 401 `UNAUTHENTICATED`: no token or an invalid one.
  - 403 `FORBIDDEN`: valid token without `lde-author`.
  - 409 `TEST_DEPLOY_KEY_EXISTS`.
  - 429 `TEST_DEPLOY_RATE_LIMITED`.
  - All of them as problem details through `sendProblem`.
- Test deploy:
  - tenant **`TestOnly`**;
  - only when `TEST_DEPLOY_ENABLED=true` (localhost and ACC; off by default, so off on PROD);
  - refused when a key exists outside `TestOnly`; a key that exists only under `TestOnly` deploys again as a new version;
  - each deployment removed **48 hours** after its own deploy time;
  - at most **10 per hour per client address**.
- A locked action is a disabled button with a lock icon and a hint next to it:
  - signed out: "Sign in to <verb>";
  - signed in without the role: "You need permission to <verb>".
- Signed-out Save in LDE keeps the item in this browser with the notice "Saved in this browser. Sign in to save it to the shared library." It survives a reload.
- Library versions, matching RBA: `jsonwebtoken` ^9.0.3, `jwks-rsa` ^3.2.2, `@types/jsonwebtoken` ^9.0.10, `keycloak-js` ^23.0.4.
- Pull-request previews do not sign in. Their hostnames are never added to Keycloak or CORS.

## Review Focus

1. **A token that expires mid-session.** The user was signed in, the token has lapsed, and they click Deploy. Expected: the SPA refreshes the token before the call (`updateToken(30)`); if that fails, the user sees the sign-in hint, not a raw 401. *Test:* Task 7, `authHeaders` refresh test, plus Task 8's 401 mapping test.
2. **The client address behind Azure.** App Service passes `X-Forwarded-For` as `ip:port`. Expected: the rate limit counts per IP, not per port, and per real client, not per proxy. *Test:* Task 5, `clientAddress` unit tests.
3. **A DMN whose decision IDs are namespaced or that holds several decisions** (a DRD). Expected: every `<decision id>` is checked, whatever the namespace prefix (`dmn:decision`, `decision`). *Test:* Task 5, `extractDecisionKeys` tests.
4. **A deprecated alias.** `DELETE /api/cache/clear` and `POST /api/dmns/process/deploy` (still called by the LDE frontend) must answer 401 signed out, just like `/v1`. *Test:* Task 3's mount-wide table.
5. **An item saved signed out, then the same ID saved by someone else on the server.** Expected: after hydration the server copy wins, and the local-only copy is dropped, not duplicated. *Test:* Task 9's hydrate-merge test.

---

## LDE backend

### Task 1: Configuration and dependencies

**Files:**
- Modify: `packages/backend/package.json` (add `jsonwebtoken`, `jwks-rsa`, dev `@types/jsonwebtoken`)
- Modify: `packages/backend/src/utils/config.ts`
- Modify: `packages/backend/.env.example` (or the repo's example env file; add the four variables with comments)
- Test: `packages/backend/src/utils/config.test.ts`

**Interfaces:**
- Produces:
  - `config.auth: { keycloakUrl: string; realm: string; clients: string[]; role: 'lde-author' }`
    - `keycloakUrl` comes from `KEYCLOAK_URL`, default `http://localhost:8080`, with any trailing `/` stripped.
    - `realm` comes from `KEYCLOAK_REALM`, default `ronl`.
    - `clients` comes from `AUTH_CLIENTS` (comma-separated), default `linked-data-explorer,ttl-editor,lde-e2e`.
  - `config.testDeploy: { enabled: boolean; tenantId: 'TestOnly'; ttlHours: 48; maxPerHour: 10 }`
    - `enabled` is `process.env.TEST_DEPLOY_ENABLED === 'true'`.

- [ ] **Step 1: Write failing tests** in `config.test.ts`, following its existing env-reset pattern:
  - `auth defaults`: no env, so `config.auth` equals `{ keycloakUrl: 'http://localhost:8080', realm: 'ronl', clients: ['linked-data-explorer','ttl-editor','lde-e2e'], role: 'lde-author' }`.
  - `KEYCLOAK_URL trailing slash is stripped`: `https://acc.keycloak.open-regels.nl/` becomes `https://acc.keycloak.open-regels.nl`.
  - `testDeploy is off unless TEST_DEPLOY_ENABLED is exactly "true"`: unset gives false, `'1'` gives false, `'true'` gives true. Also `tenantId === 'TestOnly'`, `ttlHours === 48`, `maxPerHour === 10`.
  - `KEYCLOAK_URL is required on ACC and PROD`: `DEPLOYMENT_ENV=acc` without `KEYCLOAK_URL` makes `validateConfig` report `auth.keycloakUrl` missing. For this, `keycloakUrl` keeps an empty default when `displayEnv` is ACC or PROD, mirroring the existing Operaton credential rule.
- [ ] **Step 2: Run** `npm test --workspace=packages/backend -- src/utils/config.test.ts`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** the two config blocks and the `validateConfig` rule. Run `npm install jsonwebtoken@^9.0.3 jwks-rsa@^3.2.2 --workspace=packages/backend` and `npm install -D @types/jsonwebtoken@^9.0.10 --workspace=packages/backend`.
- [ ] **Step 4: Run** the same test file. Expected: PASS. Then `npm run typecheck --workspace=packages/backend`: clean.
- [ ] **Step 5: Commit** (after the owner's go-ahead): `feat(backend): configuration for sign-in and test deploys (#163)`.

### Task 2: Token check middleware

**Files:**
- Create: `packages/backend/src/middleware/auth.middleware.ts`
- Modify: `packages/backend/src/utils/problem.ts`. Add these to `CODE_TITLES`:
  - `UNAUTHENTICATED: 'Sign-in required'`
  - `FORBIDDEN: 'Permission required'`
  - `TEST_DEPLOY_KEY_EXISTS: 'Decision key already in use'`
  - `TEST_DEPLOY_RATE_LIMITED: 'Too many test deploys'`
- Test: `packages/backend/src/middleware/auth.middleware.test.ts`

**Interfaces:**
- Consumes: `config.auth` (Task 1).
- Produces:
  - `export interface AuthUser { sub: string; username?: string; name?: string; roles: string[] }`
  - `export function createAuth(opts: { getKey: jwt.GetPublicKeyOrSecret; issuer: string; clients: string[]; role: string }): { requireAuthor: RequestHandler; optionalAuthor: RequestHandler }`
  - `export const requireAuthor: RequestHandler` and `export const optionalAuthor: RequestHandler`, built from `config.auth`:
    - `jwks-rsa` with `jwksUri = ${keycloakUrl}/realms/${realm}/protocol/openid-connect/certs`, `cache: true`, `rateLimit: true`;
    - `issuer = ${keycloakUrl}/realms/${realm}`;
    - algorithms `['RS256']`.
  - On success both set `res.locals.user: AuthUser`.
  - `requireAuthor`:
    - no `Authorization: Bearer …` gives 401 `UNAUTHENTICATED`;
    - a bad signature, wrong issuer, expired token, or `azp` not in `clients` gives 401 `UNAUTHENTICATED`;
    - `lde-author` missing from `realm_access.roles` gives 403 `FORBIDDEN`.
  - `optionalAuthor`:
    - no `Authorization` header: `next()` with no `res.locals.user`;
    - header present: the same as `requireAuthor`. A bad token is 401, never treated as anonymous.

- [ ] **Step 1: Write failing tests.** Generate an RSA key pair with `crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })`. Sign tokens with `jsonwebtoken`, `iss = 'http://kc/realms/ronl'`, and pass `getKey` returning the public key. Mount a probe route `app.post('/x', requireAuthor, (_q, r) => r.json(r.locals.user))`. Cases:
  - no header: 401, `body.code === 'UNAUTHENTICATED'`;
  - `Authorization: Basic abc`: 401;
  - token signed with another key: 401;
  - `iss` `http://kc/realms/other`: 401;
  - expired (`exp` in the past): 401;
  - `azp: 'ronl-business-api'`: 401;
  - `azp: 'ttl-editor'`, roles `['pa-author']`: 403, `code === 'FORBIDDEN'`;
  - `azp: 'ttl-editor'`, roles `['lde-author']`, `preferred_username: 'x'`: 200, body `{ sub, username: 'x', roles: ['lde-author'] }`;
  - `optionalAuthor`, no header: handler sees `res.locals.user === undefined`, 200;
  - `optionalAuthor`, bad token: 401.
- [ ] **Step 2: Run** `npm test --workspace=packages/backend -- src/middleware/auth.middleware.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `createAuth`, using `jwt.verify(token, getKey, { issuer, algorithms: ['RS256'] }, cb)`. Then add the two default instances.
- [ ] **Step 4: Run** the test. Expected: PASS. Then `npm run lint --workspace=packages/backend`: clean.
- [ ] **Step 5: Commit**: `feat(backend): Keycloak token check for lde-author (#163)`.

### Task 3: Close the state-changing routes

**Files:**
- Modify:
  - `src/routes/assets.routes.ts` (lines 140, 171, 182, 268, 284, 307, 323);
  - `src/routes/ropa.routes.ts` (128, 144);
  - `src/routes/cache.routes.ts` (48);
  - `src/routes/triplydb.routes.ts` (133);
  - `src/routes/dmn.routes.ts` (172 `/drd/deploy`, 237 `/process/deploy`; `/deploy` at 430 gets `requireAuthor` for now, and Task 5 swaps it for `optionalAuthor`).
- Modify: each router's existing test file (`assets.routes.test.ts`, `assets.routes.no-pool.test.ts`, `ropa.routes.test.ts`, `ropa.routes.no-pool.test.ts`, `cache.routes.test.ts`, `triplydb.routes.test.ts`, `dmn.routes.test.ts`). Add `jest.mock('../middleware/auth.middleware', …)` with pass-through `requireAuthor` and `optionalAuthor`, so their existing behaviour tests keep testing behaviour.
- Modify: `packages/backend/openapi/openapi.yaml` (and `openapi.v2.yaml` where these paths appear):
  - add `components.securitySchemes.bearerAuth` (`type: http, scheme: bearer, bearerFormat: JWT`);
  - add `security: [{ bearerAuth: [] }]` and `401`/`403` responses on each closed operation.
- Create: `src/routes/write-auth.test.ts`

**Interfaces:**
- Consumes: `requireAuthor` (Task 2).

- [ ] **Step 0: Check for other callers.** Search `C:\Users\gorts01\Development\{cprmv,editor,iou-architectuur,ronl-business-api}` (excluding `node_modules`) for every closed path in the table below. A caller other than the LDE frontend, ttl-editor or the fixtures script: stop and report it before continuing.
- [ ] **Step 1: Write the failing test.** `write-auth.test.ts` mounts the real `routes` (`src/routes/index.ts`) on an express app with `express.json()`. It mocks only `../services/*` modules that open connections at import, following `index.test.ts`. It uses no token. `it.each` over this table expects **401** and `body.code === 'UNAUTHENTICATED'`:
  - `POST /v1/assets/bpmn`, `DELETE /v1/assets/bpmn/x`, `PATCH /v1/assets/bpmn/x/deploy`
  - `POST /v1/assets/forms`, `DELETE /v1/assets/forms/x`, `POST /v1/assets/documents`, `DELETE /v1/assets/documents/x`
  - `POST /v1/assets/ropa`, `DELETE /v1/assets/ropa/x`
  - `DELETE /v1/cache/clear`, `DELETE /api/cache/clear`
  - `POST /v1/triplydb/update-service`, `POST /api/triplydb/update-service`
  - `POST /v1/dmns/drd/deploy`, `POST /v1/dmns/process/deploy`, `POST /api/dmns/process/deploy`, `POST /api/dmns/drd/deploy`

  A second `it.each` expects these **not** to be 401: `GET /v1/assets/bpmn`, `POST /v1/dmns/validate` (with a body), `POST /v1/shacl/validate`, `POST /v1/chains/execute`, `POST /v1/triplydb/query`.
- [ ] **Step 2: Run** `npm test --workspace=packages/backend -- src/routes/write-auth.test.ts`. Expected: the first table FAILS.
- [ ] **Step 3: Implement** by adding `requireAuthor` as the first handler on each listed route. Add the mocks to the existing router tests. Update the OpenAPI source, then `npm run build:openapi --workspace=packages/backend`.
- [ ] **Step 4: Run** `npm test --workspace=packages/backend` (the full suite, including `src/openapi` coverage) and `npm run lint:openapi --workspace=packages/backend`. Expected: all pass.
- [ ] **Step 5: Commit**: `feat(backend): require lde-author on state-changing routes (#163)`.

### Task 4: Remove the eDOCS write routes

**Files:**
- Modify: `src/routes/edocs.routes.ts`. Keep only `GET /status`. Remove `POST /workspaces/ensure`, `POST /documents`, and `GET /workspaces/:workspaceId/documents`.
- Modify: `src/routes/edocs.routes.test.ts`. Remove those cases, and add one asserting `POST /v1/edocs/documents` answers 404.
- Modify: `src/utils/problem.ts`. Remove `EDOCS_WORKSPACE_FAILED`, `EDOCS_UPLOAD_FAILED` and `EDOCS_DOCUMENTS_FAILED` if nothing else uses them (`grep` first).
- Modify: `openapi/openapi.yaml`. Remove the three paths at about lines 4998–5300, and any schemas only they used.
- Unchanged: `edocs.service.ts` and `externalTaskWorker.service.ts`.

- [ ] **Step 1:** Change `edocs.routes.test.ts` as above. Run it; expected: the new 404 test FAILS.
- [ ] **Step 2:** Remove the routes, codes and spec paths. Rebuild the OpenAPI.
- [ ] **Step 3: Run** the full backend suite and `lint:openapi`. Expected: pass. The worker tests still pass.
- [ ] **Step 4: Commit**: `refactor(backend): remove the unused eDOCS write routes (#163)`.

### Task 5: Anonymous test deploy

**Files:**
- Create: `src/services/testDeploy.service.ts`, `src/services/testDeploy.service.test.ts`
- Modify: `src/services/operaton.service.ts` (+ its test)
- Modify: `src/routes/dmn.routes.ts` (`/deploy`, `/evaluate/:decisionKey`, new `GET /deploy/options`) + `dmn.routes.test.ts`
- Modify: `src/index.ts`: start the sweep after `listen`, beside `externalTaskWorker.start()`.
- Modify: `openapi/openapi.yaml`:
  - `/dmns/deploy`: `security: [{}, {bearerAuth: []}]`, plus 409 and 429;
  - the `tenantId` query parameter on evaluate;
  - the new `/dmns/deploy/options`.

**Interfaces:**
- Consumes: `config.testDeploy` (Task 1), `optionalAuthor` (Task 2).
- Produces:
  - In `operatonService`:
    - `deployDrd(xml, name, filename, tenantId?: string)` appends `tenant-id` only when `tenantId` is given;
    - `evaluateRaw(key, vars, tenantId?: string)` uses `/decision-definition/key/{key}/tenant-id/{tenantId}/evaluate` when given, with both segments through `engineSegment`;
    - `findDecisionTenants(key: string): Promise<Array<string | null>>` calls `GET /decision-definition?key=` and returns each result's `tenantId`;
    - `listDeployments(q: { tenantId: string; before: Date }): Promise<Array<{ id: string; deploymentTime: string }>>` calls `GET /deployment?tenantIdIn=&before=`;
    - `deleteDeployment(id: string): Promise<void>` calls `DELETE /deployment/{id}?cascade=true`.
  - In `testDeploy.service.ts`:
    - `extractDecisionKeys(xml: string): string[]` returns the `id` of every `decision` element, any namespace prefix, in document order;
    - `findBlockingKey(keys: string[]): Promise<string | null>` returns the first key with a tenant other than `TestOnly` (including `null`, meaning untenanted);
    - `clientAddress(req: Request): string` takes the first `X-Forwarded-For` entry with any `:port` stripped (IPv6 in brackets kept intact), else `req.socket.remoteAddress`;
    - `takeRateSlot(address: string, now?: Date): boolean` keeps an in-memory sliding hour, `maxPerHour` 10;
    - `sweepTestDeployments(now?: Date): Promise<number>` deletes `TestOnly` deployments older than `ttlHours` and returns the count;
    - `startTestDeployCleanup(): void` is a no-op unless enabled; otherwise it sweeps once and then every hour (`unref()` the timer) and logs the number removed.
  - Routes:
    - `GET /v1/dmns/deploy/options` (open) returns `{ success: true, data: { testDeploy: { enabled, tenantId: 'TestOnly', ttlHours: 48 } } }`;
    - `POST /v1/dmns/deploy` returns `data: { deploymentId, tenantId?: 'TestOnly', expiresAt?: ISO string }`.

Behaviour of `POST /v1/dmns/deploy`, in order:
1. Run `optionalAuthor`.
2. With a user: run the current behaviour, untenanted.
3. Without a user and with the setting off: 401 `UNAUTHENTICATED`.
4. Without a user and with the setting on:
   1. Validate the input (the existing 400s).
   2. If `takeRateSlot(clientAddress(req))` is false: 429.
   3. Run `extractDecisionKeys`. If there are none: 400 `INVALID_INPUT` "no decision found".
   4. If `findBlockingKey` returns a key: 409 `TEST_DEPLOY_KEY_EXISTS`, with detail `` `Decision key "${key}" already exists in the engine` ``.
   5. Otherwise run `deployDrd(..., 'TestOnly')` and answer with `tenantId` and `expiresAt = deployTime + 48h`.

On `POST /v1/dmns/evaluate/:decisionKey`, the `?tenantId=` parameter:
- absent: today's behaviour;
- `TestOnly`: use the tenant path;
- any other value: 400 `INVALID_PARAM`.

- [ ] **Step 1: Write failing tests.**
  - `extractDecisionKeys`:
    - `<definitions><decision id="a"/></definitions>` gives `['a']`;
    - a `dmn:` prefixed DRD with decisions `a`, `b` gives `['a','b']`;
    - no decision gives `[]`.
  - `findBlockingKey`, with `findDecisionTenants` mocked:
    - `[]` gives `null`;
    - `['TestOnly']` gives `null`;
    - `[null]` gives the key;
    - `['TestOnly','Flevoland']` gives the key.
  - `clientAddress`:
    - `X-Forwarded-For: 203.0.113.7:51234, 10.0.0.1` gives `203.0.113.7`;
    - `[2001:db8::1]:443` gives `2001:db8::1`;
    - no header gives the socket address.
  - `takeRateSlot`: the 10th call in an hour is true, the 11th false; true again after 61 minutes (pass `now`).
  - `sweepTestDeployments`: `listDeployments` is called with `tenantId 'TestOnly'` and `before = now − 48h`; `deleteDeployment` is called per ID; it returns the count.
  - `dmn.routes.test.ts`, with the real `optionalAuthor` replaced by a mock that reads a test header:
    - signed out, enabled, free key: 200, `deployDrd` called with tenant `'TestOnly'`, `data.tenantId === 'TestOnly'`;
    - signed out, key untenanted: 409, `code 'TEST_DEPLOY_KEY_EXISTS'`, the detail contains the key, `deployDrd` not called;
    - signed out, key only under TestOnly: 200;
    - signed out, setting off: 401;
    - signed in: 200, `deployDrd` called without a tenant;
    - evaluate `?tenantId=TestOnly`: `evaluateRaw` gets the tenant;
    - `?tenantId=Flevoland`: 400;
    - `GET /deploy/options` returns the `testDeploy` object.
  - `operaton.service.test.ts`:
    - the tenant path in `evaluateRaw`;
    - the `tenant-id` field in `deployDrd` only when given;
    - the URLs of the three new methods.
- [ ] **Step 2: Run** the three test files. Expected: FAIL.
- [ ] **Step 3: Implement** using `fast-xml-parser` (already a dependency) with `removeNSPrefix: true` for `extractDecisionKeys`.
- [ ] **Step 4: Run** the full backend suite, `lint:openapi` and `typecheck`. Expected: pass.
- [ ] **Step 5: Verify against Operaton 1.0.0.** In RBA, start the 1.0.0 test harness the way `deployment/vm/operaton/test/` describes. This is a test container, not a dev server; ask the owner first if it is not already up. Repeat the spec's three probes there (tenant evaluate path, list by key with `tenantId`, `GET /deployment?tenantIdIn=TestOnly&before=`, then cascade delete). Record the outcome in the commit message body. If 1.0.0 differs, stop and report.
- [ ] **Step 6: Commit**: `feat(backend): anonymous TestOnly test deploy on O/T/A (#163)`.

### Task 6: Fixtures script signs in

**Files:**
- Modify: `scripts/deploy-e2e-fixtures.mjs`

**Interfaces:**
- Produces: `async function getE2eToken(): Promise<string>`.
  - It POSTs to `${KEYCLOAK_URL}/realms/ronl/protocol/openid-connect/token` with `grant_type=password`, `client_id=lde-e2e`, `client_secret=$LDE_E2E_CLIENT_SECRET`, `username=$LDE_E2E_USERNAME` (default `lde-e2e`), `password=$LDE_E2E_PASSWORD`, and `scope=openid`.
  - `KEYCLOAK_URL` defaults to `http://localhost:8080`.
  - A missing secret or password calls `fail()` with the variable names. It never prints their values.
- `ldeRequest` sends `Authorization: Bearer <token>` (fetched once, lazily) on every non-GET request.

- [ ] **Step 1:** Implement, and update the script's header comment to list the three variables.
- [ ] **Step 2: Verify** with `node --check scripts/deploy-e2e-fixtures.mjs`. Run without `LDE_E2E_PASSWORD`; expected: it exits 1 naming `LDE_E2E_PASSWORD`. The full run waits for Task 14 on localhost, and the owner runs it.
- [ ] **Step 3: Commit**: `feat(scripts): e2e fixtures deploy with the lde-e2e account (#163)`.

## LDE frontend

### Task 7: Sign-in module and components

**Files:**
- Modify:
  - `packages/frontend/package.json` (`keycloak-js` ^23.0.4);
  - `.env.development` (`VITE_KEYCLOAK_URL=http://localhost:8080`), `.env.acceptance` (`https://acc.keycloak.open-regels.nl`), `.env.production` (`https://keycloak.open-regels.nl`), and `.env.test` if present;
  - `src/vite-env.d.ts`.
- Modify: `vite/cspPlugin.ts` and its test. Change the signature to `buildCspConfig(apiBaseUrl: string, keycloakUrl: string)` and `cspPlugin(apiBaseUrl, keycloakUrl)`. Add the Keycloak origin to `connect-src`. The call site in `vite.config.ts` passes `env.VITE_KEYCLOAK_URL`.
- Create: `src/services/auth.ts`, `src/services/auth.test.ts`
- Create: `src/hooks/useAuth.ts`
- Create: `src/components/common/SignInMenu.tsx`, `src/components/common/LockedAction.tsx`, plus tests
- Modify: `src/App.tsx`. Render `<SignInMenu/>` at the right end of the `<header>` (line ~364), and call `initAuth()` once at startup.

**Interfaces:**
- Produces:
  - In `auth.ts`:
    - `type AuthState = { ready: boolean; signedIn: boolean; isAuthor: boolean; name?: string }`
    - `initAuth(): Promise<void>` calls `keycloak.init({ pkceMethod: 'S256', checkLoginIframe: false, onLoad: wasSignedIn ? 'check-sso' : undefined })`. The flag `localStorage['lde.auth.wasSignedIn']` is set after a sign-in and cleared on sign-out. So a visitor who never signed in is never redirected.
    - `signIn(route: 'flevoland' | 'medewerker'): Promise<void>`, with the hints from Global Constraints and `redirectUri: window.location.href`.
    - `signOut(): Promise<void>` returns to `window.location.origin`.
    - `getAuthState(): AuthState` and `subscribe(fn: () => void): () => void`.
    - `authHeaders(): Promise<Record<string, string>>` returns `{}` when signed out. Signed in, it calls `updateToken(30)` and returns `{ Authorization: 'Bearer …' }`. If the refresh fails, it marks the user signed out, notifies subscribers and returns `{}`.
    - `isAuthor` is true when the token's `realm_access.roles` includes `lde-author`.
    - The Keycloak instance uses `{ url: VITE_KEYCLOAK_URL, realm: 'ronl', clientId: 'linked-data-explorer' }`.
  - `useAuth(): AuthState`, via `useSyncExternalStore(subscribe, getAuthState)`.
  - `<SignInMenu/>`: signed out, a "Sign in" button opening two items, "Flevoland-account" and "Medewerker"; signed in, the name and "Sign out".
  - `<LockedAction verb="deploy" onClick={…} disabled?={…} className?={…}>{children}</LockedAction>`:
    - `!signedIn`: a disabled button with a lucide `Lock` icon and the text "Sign in to deploy" beside it;
    - `signedIn && !isAuthor`: the same with "You need permission to deploy";
    - otherwise the normal button.

- [ ] **Step 1: Write failing tests**, with `keycloak-js` mocked as a class whose `init`, `login`, `logout` and `updateToken` are `vi.fn`:
  - `signIn('flevoland')` calls `login` with `idpHint: 'entra-flevoland'`;
  - `signIn('medewerker')` calls it with `loginHint: '__medewerker__'`;
  - `initAuth` without the flag passes `onLoad: undefined`, and with the flag `'check-sso'`;
  - `authHeaders` signed out gives `{}`; signed in gives a Bearer header; when `updateToken` rejects it gives `{}` and the state becomes `signedIn: false`;
  - `isAuthor` follows `realm_access.roles`;
  - `LockedAction` renders the three states with the exact hint texts;
  - `SignInMenu` shows both entries;
  - `buildCspConfig('https://api.x', 'https://kc.x')` has `connect-src 'self' https://api.x https://kc.x`.
- [ ] **Step 2: Run** `npm test --workspace=packages/frontend -- src/services/auth.test.ts src/components/common vite/cspPlugin.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the frontend suite, `typecheck` and `lint`. Expected: pass.
- [ ] **Step 5: Commit**: `feat(frontend): sign in with the ronl realm (#163)`.

### Task 8: Lock the actions and send the token

**Files:**
- Modify:
  - `src/components/BpmnModeler/BpmnCanvas.tsx` (Deploy, fetch at ~794);
  - `src/components/ChainBuilder/ChainConfig.tsx` (deploy at ~185);
  - `src/App.tsx` (cache clear at ~170 and its button);
  - `src/services/ropaService.ts` (POST at 34, DELETE at 45);
  - the RoPA editor's Save/Delete buttons in `src/components/RopaEditor/`.
- Create: `src/utils/authProblem.ts`
- Tests: the existing tests of each touched component or service.

**Interfaces:**
- Consumes: `authHeaders`, `useAuth`, `LockedAction` (Task 7).
- Produces: `authProblemMessage(status: number, verb: string): string | null`. It returns "Sign in to <verb>" for 401, "You need permission to <verb>" for 403, else `null`. Callers show it in place of the raw error.

- [ ] **Step 1: Write failing tests**:
  - `BpmnCanvas`: signed out, the Deploy button is disabled and "Sign in to deploy" is visible; as author, the deploy fetch carries `Authorization`.
  - Same for the ChainConfig deploy ("Sign in to deploy").
  - The cache refresh ("Sign in to refresh the cache").
  - RoPA Save/Delete ("Sign in to save" / "Sign in to delete"); `ropaService` sends the header.
  - A 401 answer to an author's deploy shows "Sign in to deploy".
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement.** Merge `await authHeaders()` into each write fetch's headers. Wrap each button in `LockedAction`.
- [ ] **Step 4: Run** the frontend suite, typecheck and lint. Expected: pass.
- [ ] **Step 5: Commit**: `feat(frontend): lock deploy, cache refresh and RoPA writes when signed out (#163)`.

### Task 9: Local-only save for BPMN, forms and document templates

**Files:**
- Modify: `src/services/bpmnService.ts`, `src/services/formService.ts`, `src/services/documentService.ts` + their tests
- Modify: the library list and save-notice UI in `src/components/BpmnModeler/`, `src/components/FormEditor/` and `src/components/DocumentComposer/` (the components that call these services' save/delete)

**Interfaces:**
- Consumes: `getAuthState`, `authHeaders` (Task 7).
- Produces:
  - Each stored item type gains `localOnly?: true`.
  - Save, when `!getAuthState().isAuthor`: write to localStorage with `localOnly: true`, skip the backend, and return `{ saved: true, localOnly: true }`. `bpmnService.saveProcessDetailed`'s `SaveOutcome` gains `localOnly?: boolean`.
  - Save as author: send the header, and on success clear `localOnly`.
  - `hydrateFromServer()`: `merged = [...examples, ...serverItems, ...local.filter(i => i.localOnly && !serverIds.has(i.id))]`.
  - Delete, when `!isAuthor`: only for `localOnly` items, local removal with no fetch. For a shared item the UI disables Delete through `LockedAction` ("Sign in to delete").

- [ ] **Step 1: Write failing tests** per service:
  - a signed-out save does not fetch and stores `localOnly: true`;
  - hydrate keeps a local-only item;
  - hydrate drops a local-only item whose ID the server returns (the server copy wins: Review Focus 5);
  - an author save sends `Authorization` and stores no `localOnly`;
  - a signed-out delete of a local-only item does not fetch.
  - UI: after a signed-out save the notice reads exactly "Saved in this browser. Sign in to save it to the shared library."; the item shows the marker "only in this browser".
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the frontend suite, typecheck and lint. Expected: pass.
- [ ] **Step 5: Commit**: `feat(frontend): keep signed-out saves in this browser (#163)`.

## ttl-editor (branch `feat/163-sign-in`)

### Task 10: Sign-in module and components

**Files:**
- Modify: `package.json` (`keycloak-js` ^23.0.4), `.env.development`, `.env.acceptance`, `.env.production`, `.env.example` (`VITE_KEYCLOAK_URL`, values as in Task 7)
- Create: `src/utils/auth.js`, `src/utils/auth.test.js`, `src/hooks/useAuth.js`, `src/components/SignInMenu.jsx`, `src/components/LockedAction.jsx` (+ tests)
- Modify: `src/App.jsx`. Put `<SignInMenu/>` in the top bar beside the Publish button (~line 1152), and call `initAuth()` once.

**Interfaces:** the same API as Task 7, in JavaScript. Differences:
- the client ID is `ttl-editor`;
- the localStorage flag is `ttl.auth.wasSignedIn`;
- hint texts and menu labels are identical.

- [ ] **Step 1:** Write the same failing tests as Task 7 Step 1 (minus CSP; ttl-editor has none).
- [ ] **Step 2: Run** `npx vitest run src/utils/auth.test.js src/components/SignInMenu src/components/LockedAction`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm run test:ci` and `npm run lint`. Expected: pass.
- [ ] **Step 5: Commit**: `feat: sign in with the ronl realm (#163 in linked-data-explorer)`.

### Task 11: DMN tab deploy, test deploy and Publish

**Files:**
- Modify: `src/components/tabs/DMNTab.jsx`:
  - `handleDeployDMN` (~678), the deploy button (~1389);
  - the evaluate fetch (~737);
  - a fetch of `GET /v1/dmns/deploy/options` when the tab mounts.
- Modify: `src/App.jsx`. Wrap the Publish button (~1152) in `LockedAction verb="publish"`.
- Modify: `src/utils/triplydbHelper.js`. The `update-service` call (~195) sends `await authHeaders()`.
- Tests: `DMNTab.test.jsx` (or a new `DMNTab.signin.test.jsx`), `App.publish.test.jsx`, `triplydbHelper.test.js`

**Interfaces:**
- Consumes: `useAuth`, `authHeaders`, `LockedAction` (Task 10); backend `GET /v1/dmns/deploy/options`, the 409/429 answers, and `data.tenantId` (Task 5).

Deploy button states:

| State | Button | Text under it |
| --- | --- | --- |
| author | "Deploy to Operaton" (today's behaviour, with header) | none |
| not author, `testDeploy.enabled` | "Test deploy to Operaton" | "Deploys to the test tenant TestOnly, removed automatically after 48 hours. Refused if a decision key already exists in the engine." |
| not author, not enabled (or options failed to load) | `LockedAction verb="deploy"` | none |

- After a test deploy, `deploymentStatus.data.tenantId === 'TestOnly'`, and every evaluate call adds `?tenantId=TestOnly`.
- A 409 shows the backend's `detail`.
- A 429 shows "Too many test deploys from this address; try again later."
- The success line for a test deploy reads "Test deploy — ID: <8 chars>…, removed after 48 hours".

- [ ] **Step 1: Write failing tests** covering:
  - each of the three button states;
  - a test deploy's evaluate URL containing `tenantId=TestOnly`;
  - the 409 detail shown;
  - the author's deploy fetch carrying `Authorization`;
  - Publish locked when signed out ("Sign in to publish");
  - `update-service` sending the header.
- [ ] **Step 2: Run** `npm run test:p6` and `npx vitest run App.publish triplydbHelper`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm run test:ci` and `npm run lint`. Expected: pass.
- [ ] **Step 5: Commit**: `feat: deploy, test deploy and publish follow sign-in (#163 in linked-data-explorer)`.

### Task 12: e2e journeys sign in

**Files:**
- Create: `e2e/signIn.js`
- Modify: `e2e/authoring-journey.spec.js`, `e2e/normbedragen-journey.spec.js`, `e2e/round-trip-journey.spec.js`; the README or header comment in `e2e/stack.js` that lists the e2e environment variables

**Interfaces:**
- Produces: `export async function signIn(page)`.
  - It clicks "Sign in", then "Medewerker".
  - On the Keycloak page it fills `#username` with `process.env.E2E_LDE_USERNAME ?? 'lde-e2e'` and `#password` with `process.env.E2E_LDE_PASSWORD`, then submits.
  - It waits until the app shows the signed-in name.
  - A missing `E2E_LDE_PASSWORD` throws `'E2E_LDE_PASSWORD is not set'`.

- [ ] **Step 1:** Implement `signIn`. Call it in each journey after the app loads and before the DMN step.
- [ ] **Step 2: Verify** with `npx playwright test --list`: the three journeys are listed. The real run is the owner's, against whatever stack is running, after Task 14 on localhost. Hand the command `E2E_LDE_PASSWORD=… npm run test:e2e` to the owner, expecting all journeys green.
- [ ] **Step 3: Commit**: `test(e2e): sign in as lde-e2e before deploying (#163 in linked-data-explorer)`.

## Rollout

### Task 13 (LDE): Rollout notes

**Files:**
- Create: `docs/sign-in-rollout.md` in linked-data-explorer, on `feat/163-write-auth`

Contents, as numbered steps for the owner:
1. Run Task 14's script against ACC Keycloak with the ACC origins.
2. Assign `lde-author` to the owner and colleagues on ACC (a brokered user signs in once first).
3. Set the LDE ACC App Service settings `KEYCLOAK_URL` and `TEST_DEPLOY_ENABLED=true`. Use the hand-over script pattern from CLAUDE.md, check whether the app restarted, and verify with `GET /v1/dmns/deploy/options`.
4. Put the e2e secrets (`LDE_E2E_CLIENT_SECRET`, `E2E_LDE_PASSWORD`) where the e2e runs read them, never in a repo.
5. Merge the three PRs. LDE and ttl-editor ship in the same release, so no frontend is live without sign-in while the backend checks tokens.
6. Run the checks below on ACC.
7. Do the same on PROD:
   - without `--with-e2e`;
   - with `TEST_DEPLOY_ENABLED` unset;
   - with the roles assigned.

Checks:
- `curl -X POST <acc-backend>/v1/dmns/drd/deploy` answers 401;
- `GET /v1/dmns/deploy/options` shows `enabled: true` on ACC and `false` on PROD;
- a signed-in deploy from ttl-editor works;
- a signed-out test deploy works and appears under `TestOnly`.

- [ ] **Step 1:** Write the file. **Step 2: Commit**: `docs: sign-in rollout steps (#163)`.

## ronl-business-api (branch `feat/163-lde-keycloak-clients`)

### Task 14: Keycloak setup script

**Files:**
- Create: `scripts/keycloak-add-lde-clients.sh`, `scripts/keycloak-lde-clients.json` (in ronl-business-api)

This follows `scripts/keycloak-add-rip-roles.sh` and `keycloak-add-entra-idp.sh`: admin token via `curl`, `jq`, idempotent create-or-update, and `--dry-run`. Per those scripts' "WHY NOT A REALM IMPORT", `config/keycloak/ronl-realm.json` is **not** changed. A fresh local Keycloak gets these by running the script, just as the Entra provider does.

**Interfaces:**
- Environment variables:
  - `KEYCLOAK_URL` (required), `REALM` (default `ronl`), `ADMIN_USER`, `ADMIN_REALM`, `ADMIN_PASSWORD` (prompted);
  - `LDE_ORIGIN` and `TTL_ORIGIN` (required, exact origins, e.g. `http://localhost:3000` and `http://localhost:3002`);
  - with `--with-e2e`: `LDE_E2E_PASSWORD` (prompted).
- Effects:
  - Realm role `lde-author`.
  - Public clients `linked-data-explorer` and `ttl-editor`:
    - `standardFlowEnabled: true`, `directAccessGrantsEnabled: false`, `implicitFlowEnabled: false`;
    - `attributes."pkce.code.challenge.method": "S256"`;
    - `redirectUris: ["<origin>/*"]`, `webOrigins: ["<origin>"]`, `post.logout.redirect.uris: "<origin>/*"`.
  - With `--with-e2e`:
    - a confidential client `lde-e2e` with direct-access grants and no standard flow; its secret is printed once, the only output that contains a secret;
    - a user `lde-e2e` with `lde-author` and a non-temporary password from `LDE_E2E_PASSWORD`.
  - `--with-e2e` is refused when `KEYCLOAK_URL` is `https://keycloak.open-regels.nl` (PROD).
  - Re-running updates in place and never duplicates.

- [ ] **Step 1:** Write the script and JSON.
- [ ] **Step 2: Verify** with `bash -n` and `--dry-run` (prints the requests with secrets redacted). Hand the local run to the owner, and confirm on localhost:8080:
  - `--with-e2e` against localhost, then a password grant for `lde-e2e` returns a token whose `realm_access.roles` contains `lde-author` and whose `azp` is `lde-e2e`;
  - running it twice shows no duplicates.
- [ ] **Step 3: Commit**: `feat(keycloak): script for the LDE and ttl-editor clients and lde-author (#163 in linked-data-explorer)`.

## After all tasks

- Owner's acceptance on localhost, after running Task 14 locally:
  - LDE: signed out, Deploy is locked and Save says "Saved in this browser…"; signed in via Medewerker as a user with the role, Deploy works.
  - ttl-editor: signed out, "Test deploy to Operaton" works and evaluates; deploying again works; a key that exists untenanted gives 409; Publish is locked.
  - LDE `npm run e2e:deploy-fixtures` (via RBA) with the three variables.
  - ttl-editor e2e.
- Then three PRs (LDE, ttl-editor, RBA). The owner merges them.
