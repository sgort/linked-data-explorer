# Signing in for the backend's state-changing operations — design (#163)

Status: approved in conversation on 9 November 2026; this document is the
written spec for review.

## Why

Since 7 November 2026 the Operaton engine on the VM requires a login
(ronl-business-api #415). Only the backends hold engine credentials, so the LDE
backend is now the one party that can deploy for a browser user. But the LDE
backend authenticates nobody: anyone who can reach it can deploy to the
shared engine, overwrite or delete stored BPMN processes, forms, document
templates and RoPA records, clear the cache, or trigger a TriplyDB service
sync. CORS only stops other web pages, not curl or scripts. #415's follow-up
list names these routes "the remaining way into the engine".

## Goal

Close the backend where it changes shared state, and make the LDE frontend and
ttl-editor show it: a signed-out user sees which actions need a sign-in, and a
signed-in user with the permission works as today.

Who may change state (owner's words): "basically me and my colleagues,
potentially a subset of senior RBA users."

## Non-goals

- No change to reading, validating, evaluating or searching. Those stay open to
  everyone, signed in or not.
- No per-route or per-organisation permissions. One permission covers every
  state-changing operation (owner's decision).
- No new login. It is the same Keycloak realm `ronl` as ronl-business-api
  (owner's decision).
- Not the separation of the ACC and PROD engines. That is the next item, after
  this one.
- No Operaton upgrade (#423) and no login throttling (#425).

## Anti-goals

- The existing public reads break: `/v1/ropa/public`, `/v1/bundles/public`,
  `/v1/openapi.json`, `GET /v1/dmns` as RBA calls it, the DMN `evaluate` and
  `validate` routes, SHACL validation, DSO searches, chain `execute`, TriplyDB
  `query`/`list-graphs`.
- A signed-out user can still change shared state through some other route,
  including a deprecated `/api/*` alias.
- A test deploy takes over or shadows a decision that someone else deployed.

## Decided

### 1. What gets closed (backend)

A request to any of these routes needs a valid `ronl` token carrying the realm
role `lde-author`. Without one the route answers **401** (no or invalid token).
A valid token without the role gets **403**. Both use the existing
problem-details format (`sendProblem`).

| Route | Today used by |
| --- | --- |
| `POST /v1/dmns/deploy` | ttl-editor DMN tab "Deploy to Operaton"; `scripts/deploy-e2e-fixtures.mjs` |
| `POST /v1/dmns/drd/deploy` | LDE Chain Builder deploy (`ChainConfig.tsx`) |
| `POST /v1/dmns/process/deploy` | LDE BPMN canvas Deploy (`BpmnCanvas.tsx`); fixtures script |
| `POST /v1/triplydb/update-service` | ttl-editor Publish (after its own direct TriplyDB upload) |
| `POST`, `DELETE /v1/assets/bpmn…`, `PATCH /v1/assets/bpmn/:id/deploy` | LDE BPMN library save/delete (`bpmnService.ts`) |
| `POST`, `DELETE /v1/assets/forms…`, `/v1/assets/documents…` | LDE form and document-template save/delete |
| `POST /v1/ropa`, `DELETE /v1/ropa/:id` | LDE RoPA editor |
| `DELETE /v1/cache/clear` | LDE cache refresh (`App.tsx`) |

The check must hold on **every mount** of these routers, including the
deprecated `/api/*` aliases in `src/routes/index.ts`. The LDE frontend still
calls `/api/cache/clear` and `/api/dmns/process/deploy`. So the check sits on
the routes themselves, not on the `/v1` mount.

Stay open, unchanged: `POST /v1/dmns/evaluate/:decisionKey`, `/v1/dmns/validate`,
`/v1/shacl/validate*`, `/v1/dso/*`, `/v1/chains/execute`,
`/v1/triplydb/query`, `/v1/triplydb/list-graphs`, `/v1/csp-reports`, and every
`GET`.

### 2. eDOCS write routes removed

`POST /v1/edocs/workspaces/ensure`, `POST /v1/edocs/documents`, and the
workspace-documents read in `edocs.routes.ts` are removed. `GET /v1/edocs/status`
stays. No client calls them: the external-task worker calls `edocsService`
directly, not through the routes, and LDE ACC/PROD run the service in stub
mode. The service itself and the worker are unchanged.

### 3. Token check (backend)

The check follows ronl-business-api's `packages/backend/src/auth/jwt.middleware.ts`:

- `jsonwebtoken` plus `jwks-rsa`;
- keys from `${KEYCLOAK_URL}/realms/ronl/protocol/openid-connect/certs`;
- the issuer is checked;
- the role is read from `realm_access.roles`.

The Keycloak URL comes from configuration per tier:

| Tier | Keycloak |
| --- | --- |
| localhost | `http://localhost:8080` (RBA's local Keycloak) |
| ACC | `https://acc.keycloak.open-regels.nl` |
| PROD | `https://keycloak.open-regels.nl` |

Accepted tokens are those issued to the LDE frontend's or ttl-editor's client,
plus the e2e client (see 6). This is checked through `azp`, or through an
audience mapper.

### 4. Sign-in in both apps (frontend)

- Both the LDE frontend and ttl-editor sign in with `keycloak-js`, as RBA's
  frontend does (`packages/frontend/src/services/keycloak.ts` in RBA).
- Each gets its own public client in realm `ronl` on each tier (proposed IDs
  `linked-data-explorer` and `ttl-editor`), with standard flow and PKCE, and
  exact redirect URIs and web origins for that tier's address. They do **not**
  reuse `ronl-business-api`, whose redirect URIs are `*`.
- Because the realm is shared, someone already signed in to RBA is signed in
  here without typing anything.
- Signing in is optional. The apps load and work signed out exactly as today,
  except for the locked actions.
- **Sign in** opens a small menu with two entries, the same two routes RBA's
  landing pages use (owner's decision):
  - **"Flevoland-account"**: `keycloak.login({ idpHint: 'entra-flevoland' })`.
    Keycloak goes straight to Entra (RBA's `FLEVOLAND_IDP` in
    `packages/frontend/src/services/identity-providers.ts`).
  - **"Medewerker"**: `keycloak.login({ loginHint: '__medewerker__' })`. The
    realm's login template (`keycloak-themes/ronl/login/login.ftl` in RBA)
    shows the employee page with the password form, and keeps the sentinel out
    of the username field.

  The citizen page with no hint is never used. Anyone who signed in there with
  DigiD would only ever get 403.

  Checked against the local Keycloak (localhost:8080) on 9 November 2026:
  - the medewerker hint gives the password form with the "Inloggen als
    medewerker" banner;
  - the Entra hint answers 303 to `/broker/entra-flevoland/login`.

  `lde-author` is assigned per user as a realm role. A brokered (Entra) user
  needs one sign-in first, so the account exists. The e2e user signs in
  through the Medewerker route.
- **Pull-request previews do not sign in** (owner's decision, a known limit).
  Their generated Static Web Apps hostnames are not registered as redirect
  URIs or CORS origins. On a preview, locked actions stay locked, and
  ttl-editor's anonymous test deploy still works against ACC.
- A **Sign in** button sits in the header. Signed in, the header shows the
  user's name and **Sign out**.
- Every call to a closed route sends `Authorization: Bearer <token>`, and the
  token is refreshed before it expires.
- The backend's CORS must allow the `Authorization` header from both apps'
  origins.

### 5. How a locked action looks (owner chose option A)

A locked action is a **disabled button with a lock icon and a "Sign in to …"
hint next to it**, so it is visible at a glance what is locked. The same
applies to a signed-in user without `lde-author`, with the hint "You need
permission to …".

- **LDE:**
  - Locked: BPMN canvas **Deploy**, Chain Builder **Deploy**, the cache
    refresh, RoPA **Save**/**Delete**.
  - The BPMN, form and document-template **Save** stays available. Signed out,
    it keeps the item in this browser (localStorage, as today) and skips the
    backend write. It shows "Saved in this browser. Sign in to save it to the
    shared library." (owner's decision):
    - Local-only items **survive a reload**. Today `hydrateFromServer()` in
      `bpmnService`, `formService` and `documentService` replaces the local
      cache with the examples plus the server's list. It must merge instead,
      keyed on id, and keep items marked "only in this browser".
    - Signed out, a local-only item can be deleted. **Delete** on a shared item
      is locked.
    - Signing in pushes nothing automatically. The user saves again to share an
      item.
- **ttl-editor:**
  - **Publish** is locked on every tier.
  - **Deploy to Operaton** is locked on PROD.
  - On localhost and ACC, signed out, it becomes **Test deploy to Operaton**
    (see 7).
  - Signed in with the role, Deploy and Publish work as today, untenanted as
    now.
- The backend's 401/403 is shown as a sign-in hint, not as a raw error. This
  covers, for example, a token that expired mid-session.

### 6. Dedicated e2e test account

- A user `lde-e2e` with role `lde-author`, in the `ronl` realm on localhost and
  ACC only, never on PROD.
- The ttl-editor e2e journeys that click "Deploy to Operaton"
  (`authoring-journey.spec.js`, `normbedragen-journey.spec.js`,
  `round-trip-journey.spec.js`) sign in as this user through the real Keycloak
  page.
- LDE's `scripts/deploy-e2e-fixtures.mjs` gets a token for the same user. RBA's
  `npm run e2e:deploy-fixtures` is only a shim that runs LDE's copy, so the
  token handling belongs in LDE.
- The password lives only in the e2e secrets and environment, never in a
  repository.
- The local realm import (`config/keycloak/ronl-realm.json` in RBA) gets the
  role, both app clients and the e2e user with a local-only password, so a
  fresh localhost works without manual Keycloak steps.

### 7. Anonymous test deploy (localhost and ACC only)

The owner's addition: a signed-out user on O/T/A can still try a DMN against
the engine.

- A backend setting switches it on. It is on for localhost and ACC, and off by
  default, so PROD has it off.
- With the setting on, `POST /v1/dmns/deploy` **without** a token deploys to
  tenant **`TestOnly`**. With a valid `lde-author` token it deploys untenanted,
  as today. With the setting off, no token means 401.
- **Refused if a decision key already exists outside `TestOnly`**, that is,
  untenanted or under any other tenant. The backend reads the decision keys
  from the DMN XML and asks the engine (`GET /decision-definition?key=<k>`,
  all tenants). If a key is found outside `TestOnly`, the answer is 409 with a
  problem detail naming the key. Both rules are the owner's.
- **A key that exists only under `TestOnly` may be deployed again**, whoever
  made the earlier copy. Operaton adds a new version, and the old copy stays
  until its own 48 hours are up, so fix-and-redeploy works. Evaluating through
  the tenant path uses the latest version.
- **Removed automatically after 48 hours**, counted per deployment from its own
  deploy time (owner's decision).
- The ttl-editor DMN tab tells the user both rules under the button. For a
  `TestOnly` deploy it evaluates through the tenant path (below).

Proven on the local engine (Operaton 2.1.5) on 9 November 2026:

- After a deploy under `TestOnly`, evaluating `/decision-definition/key/<k>/evaluate`
  (no tenant) answers **404 "no tenant-id"**. Only
  `/decision-definition/key/<k>/tenant-id/TestOnly/evaluate` answers 200. A
  test copy therefore never answers an untenanted (published) evaluate link.
- An untenanted deploy of the same key next to it works, and both are listed
  by `GET /decision-definition?key=<k>` with their `tenantId`.
- `GET /deployment?tenantIdIn=TestOnly` lists the deployments with their
  `deploymentTime`, and `DELETE /deployment/{id}?cascade=true` removes them
  (204).

The VM still runs **1.0.0**. The builder repeats these checks against the 1.0.0
test harness in RBA's `deployment/vm/operaton/test/` before relying on them.

So `POST /v1/dmns/evaluate/:decisionKey` (open) gets an optional tenant, for
example `?tenantId=TestOnly`, which uses the tenant path. Only `TestOnly` is
accepted, so the open route cannot be pointed at other tenants. The Caddy
allowlist already makes `…/tenant-id/<t>/evaluate` public.

## Left to the builder (marked as the designer's calls)

- **Cleanup mechanism.** My call: a periodic job in the LDE backend (hourly)
  that deletes, with `cascade=true`, every `TestOnly` deployment older than 48
  hours, and logs what it removed. It runs only where the test-deploy setting
  is on. Note that ACC and PROD share one engine today, so the ACC backend's
  sweep removes `TestOnly` deployments for both. That is harmless, because PROD
  never creates them.
- **Abuse limit.** My call: a modest per-address rate limit on anonymous test
  deploys, for example 10 per hour. LDE has no rate limiting yet. Mind
  App Service's proxy (`trust proxy`) when reading the client address.
- **Role name** `lde-author` and **client IDs** `linked-data-explorer` and
  `ttl-editor`: proposed by me, accepted by the owner for the role. The client
  IDs are free to change.
- **How the fixtures script gets its token.** My call: a small confidential
  client `lde-e2e` with direct-access grants, on localhost and ACC only, used
  with the `lde-e2e` user's password. The public app clients do not get
  direct-access grants.
- **Order of rollout.** My call:
  1. Keycloak clients, role and e2e user on ACC, done by the owner in the admin
     console.
  2. Frontends that sign in, plus the backend check, in one release, so no
     window exists where a frontend cannot deploy.
  3. The same on PROD, with the role assigned to the owner's colleagues.
- **Other callers.** Before closing anything, search the sibling repositories
  (`cprmv`, `editor`, `iou-architectuur`) for calls to the closed routes. The
  review did not get through that search.
- **How the role reaches the UI.** Reading `realm_access.roles` from the token
  in the SPA is fine for showing buttons. The backend remains the only
  enforcement.

## Documentation

The OpenAPI spec marks the closed routes with a bearer security scheme and
documents the 401/403/409 answers. The removed eDOCS routes leave the spec.
