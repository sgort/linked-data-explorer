# Design: Mandatory organization/tenantId at BPMN deploy time, with repo sync

> **Rolled back (2026-08-12):** the "repo sync" half of this design —
> `config.repoRoot`, `writeDeployedBundleToRepo`, and the route's
> `repoSync` response field — was implemented, individually task-reviewed,
> and then removed after the final whole-branch review found an
> unauthenticated path-traversal vulnerability: `organization`,
> `deploymentName`, and every form/document/subprocess filename in the
> deploy request body flowed unsanitized into a filesystem path, with no
> auth in front of the route at all. Made worse by `config.repoRoot`
> resolving to filesystem root under the real Azure deployment layout
> (the shipped app root is `dist/`, not the full repo checkout), the
> reachable write target included the running application's own served
> files — an unauthenticated remote-code-execution path on acc/prod. This
> was a genuine gap in the design below, not an implementation error: the
> design never considered that `organization`/`definitionKey`/filenames
> are user-editable BPMN values reaching a filesystem write, or that
> `packages/backend`'s deployed root differs from its local dev layout.
>
> The **mandatory organization/tenantId** half of this design (Sections
> 1-2 below) had no such issue and shipped as designed — it's a pure
> client+server validation and an Operaton API parameter, no filesystem
> access. Section 3 ("Successful deploy writes the bundle to the repo")
> is kept below as the historical record of what was designed and why it
> was reverted, not as a description of current behavior. A repo-sync
> mechanism may be revisited later, but next time needs an explicit
> threat model for attacker-controlled path segments and a route
> authentication story — neither existed for this branch.

## Problem

`linked-data-explorer` (LDE) is the single source of truth for deployment
artifacts (BPMN processes, Camunda Forms, document templates) organized by
tenant, managed via the BPMN Modeler's Deploy button. `ronl-business-api`
(the consuming app) already enforces tenant isolation at two levels: request
time (`tenantMiddleware`, gating on the authenticated user's `tenantId`) and
process-instance level (every Operaton process instance is tagged with a
`municipality` process variable, filtered on when querying). Neither of
those touches deployment time.

Every BPMN/form/document asset in LDE already carries an `organization`
field (a `ronl:organization="..."` XML attribute, persisted to Postgres,
edited via the `OrganizationSelector` component already wired into
`ProcessList`/`FormList`/`DocumentList`) — but it's purely descriptive
metadata today. `BpmnCanvas.tsx`'s `handleDeploy` never reads it, the
deploy request body never carries it, and `operatonService.deployProcess`'s
Operaton `FormData` never sets the `tenant-id` multipart field Operaton's
own `/deployment/create` endpoint natively supports. A process can be
deployed with `organization` completely unset, and even when set, Operaton
never finds out — the deployed process definition carries no engine-level
tenant tag at all.

Separately, `examples/organizations/<tenant>/...` directories exist in
*two* repos today (LDE and `ronl-business-api`), manually curated and
already drifting. There is no automated sync between what's actually
deployed to Operaton, what Postgres has stored, and what's on disk in
either repo.

This piece of work closes both gaps for the deploy path specifically:
organization becomes mandatory (client- and server-validated) at deploy
time, actually reaches Operaton's `tenant-id`, and a successful deploy
writes the exact deployed bundle to a standardized path in LDE's own repo
working tree — establishing repo ↔ Postgres ↔ Operaton as a genuine
(one-way, deploy-triggered) sync rather than three independently-drifting
copies.

## Design

### 1. `organization` becomes mandatory at deploy time (client + server)

Mirrors the existing `boardOwner` pattern in `BpmnCanvas.tsx`'s
`handleDeploy` exactly — `boardOwner` is already deploy-blocking
(`if (!boardOwner) { ...error...; return; }`) while staying optional at
draft/save time; `organization` gets the identical treatment:

- **Extraction**: read `organization` from the BPMN XML's
  `ronl:organization="..."` attribute, the same regex-on-XML approach
  `deriveBoardOwnerFromXml` already uses for board ownership (and the same
  attribute `BpmnModeler.tsx` already reads/writes via
  `xml.match(/ronl:organization="([^"]+)"/)`).
- **Client-side block**: in `handleDeploy`, before the fetch, if
  `organization` is falsy, `setDeployResult({ success: false, message:
  'Set an organization in the sidebar — organization is required before
  deploying.' })` and return — no request is sent.
- **Modal visibility**: show the extracted `organization` read-only in the
  Deploy modal's resource summary (the box currently ending in `6
  resource(s) · 9 resource(s) · process key: RipPhase1Process`), so it's
  visibly confirmed before the user clicks Deploy — no new picker UI
  needed, since it's already set via the persistent sidebar
  `OrganizationSelector`.
- **Request body**: `organization` added alongside the existing
  `boardOwner` field in the POST body to `/api/dmns/process/deploy`.
- **Server-side validation**: `POST /api/dmns/process/deploy` (in
  `dmn.routes.ts`) validates `organization` is present, returning the same
  `400 { code: 'INVALID_INPUT' }` shape already used for the existing
  `bpmnXml`/`deploymentName` required-field checks. Client-side validation
  is a UX convenience, not the enforcement boundary.

### 2. `organization` reaches Operaton's native `tenant-id`

`operatonService.deployProcess` gains an `organization` parameter (same
position/style as the existing `boardOwner` parameter) and adds one line
to the `FormData` assembly, alongside the existing `deployment-name`:

```ts
formData.append('tenant-id', organization);
```

This is Operaton's own built-in multi-tenancy field — the deployed process
definition (and everything in that deployment) is now genuinely
tenant-scoped at the engine level, distinct from and complementary to
`ronl-business-api`'s existing `municipality` process-*variable*
convention (which scopes individual *instances* for querying, not the
*definition* itself).

### 3. Successful deploy writes the bundle to the repo

A new function — placed in `assets.service.ts` (already the
file-persistence-concern module, keeping `operaton.service.ts` scoped to
Operaton HTTP communication only) — runs *after* `deployProcess` resolves
successfully, called from the `/process/deploy` route handler:

```ts
export async function writeDeployedBundleToRepo(params: {
  organization: string;
  definitionKey: string;
  bpmnXml: string;
  subProcesses: { filename: string; xml: string }[];
  forms: { id: string; schema: Record<string, unknown> }[];
  documents: { id: string; template: Record<string, unknown> }[];
}): Promise<{ written: boolean; path: string; error?: string }>
```

Writes to `deployed/<organization>/<definitionKey>/` relative to the repo
root, resolved via a new `config.repoRoot` entry in `utils/config.ts`:
defaults to `path.resolve(__dirname, '../../../../')` from
`assets.service.ts`'s own location (`packages/backend/src/services/` is
four directories below the repo root — services → src → backend →
packages → root; the compiled `dist/services/` output sits at the same
depth, so this holds whether running from source or the build), and is
overridable via a `REPO_ROOT` env var for deployment topologies where that
relative assumption doesn't hold.

- `<definitionKey>.bpmn` — the main process XML, exactly as deployed
  (post board-owner/organization tagging, matching what Operaton actually
  received).
- `<subProcessFilename>.bpmn` for each subprocess, using the same
  filenames already computed in `handleDeploy`/`deployProcess`.
- `<formId>.form` for each referenced form, `JSON.stringify(schema, null,
  2)` (pretty-printed — this file is meant to be read/diffed by humans in
  the repo, unlike the compact JSON Operaton receives over the wire).
- `<documentId>.document` for each referenced document template, same
  pretty-printing.

This is a **literal mirror of the deployed bundle** — same filenames, same
content — so `deployed/<organization>/<definitionKey>/` always reflects
exactly what's live in Operaton as of the last successful deploy, once a
human commits the resulting working-tree change.

**Write-only.** No `git add`/`commit`/`push` — a human reviews and commits
the resulting file changes the same way they review any other code change.
This function only touches the filesystem.

**Failure handling**: if the write fails (permission error, no writable
checkout in whatever environment the backend happens to run in, etc.), log
a warning via the existing `logger` and include a non-fatal note in the
deploy response — the Operaton deployment already succeeded by this point
and is the critical outcome; a filesystem hiccup on the secondary
repo-sync step must not make an otherwise-successful deploy look like it
failed. The route handler's success response gains an optional field:

```ts
{
  success: true,
  data: {
    deploymentId: string,
    resourceCount: number,
    repoSync?: { written: boolean; path: string; error?: string },
  },
}
```

## Out of scope

- **DB `NOT NULL` on `organization`** — stays nullable in Postgres and in
  the BPMN XML at draft/save time. Mandatory is enforced specifically at
  deploy time (client + server), matching the existing `boardOwner`
  precedent exactly. "Ungrouped" WIP drafting remains a legitimate state.
- **The `RipPhase1Process` → `RipR21Process` rename** — separate, next
  sub-project. Will be the first real process deployed through this new
  mandatory-organization + repo-sync flow, serving as its concrete proof
  case. Blocked on the user manually clearing the current live acc
  instances first (already done as of this writing — see conversation).
- **Removing `ronl-business-api`'s redundant `examples/organizations/`
  copies** — separate follow-up, once this sync mechanism ships and
  proves out in practice.
- **Auto-commit or auto-push** — explicitly decided against; every write
  stays in the working tree until a human commits it.
- **Any change to `ronl-business-api`** — this entire piece of work is
  contained within `linked-data-explorer`. `RIP_PHASE_KEYS` and the other
  `ronl-business-api` references to `RipPhase1Process` are untouched here;
  they're in scope for the next sub-project (the rename).

## Testing

- **`operaton.service.ts`**: `deployProcess`'s existing test coverage
  extended to assert the `FormData` includes `tenant-id` set to the passed
  `organization` value, alongside the existing `deployment-name`/board-tag
  assertions.
- **`dmn.routes.ts`**: `POST /process/deploy` gains a test asserting
  `400 INVALID_INPUT` when `organization` is missing/empty, mirroring the
  existing `bpmnXml required`/`deploymentName required` tests.
- **`assets.service.ts`**: `writeDeployedBundleToRepo` gets its own test(s)
  — writes the expected files with the expected content/filenames to a
  temp directory (not the real repo tree), and returns `{ written: false,
  error: ... }` without throwing when the target path isn't writable.
- **`BpmnCanvas.tsx`**: `handleDeploy` test coverage extended to assert the
  deploy is blocked (no fetch call made) when `organization` is unset on
  the XML, mirroring the existing `boardOwner`-missing test if one exists,
  or added fresh alongside it.
