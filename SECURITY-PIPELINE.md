# Supply-chain posture of this pipeline

What CI downloads and executes, how each of those things is pinned, and — the
part that matters — what is **not** pinned and why.

This is a state document. It describes the pipeline as it stands, not the work
that produced it; the reasoning behind the gate lives in
[`docs/the-gate-has-teeth.md`](docs/the-gate-has-teeth.md).

Applies to the `acc` branch. `main` is promoted from `acc` and inherits this
once promoted; until then production workflows on `main` still resolve floating
tags.

## The rule

> Nothing downloaded or executed by a pipeline may float.

No `latest`, no empty version, no mutable tag. Every reference resolves to a
specific immutable object — a commit hash, a digest, a checksum — so that what
ran yesterday is byte-identical to what runs today, and a compromised upstream
release cannot reach this repository merely by being published.

## What is pinned

Every action reference in all eight workflows is a 40-character commit hash with
its human-readable version in a trailing comment. The comment is not decoration:
a digest nobody can read is a pin nobody will maintain, and Renovate moves the
two together.

| Action                         | Pinned at                                  | Version          |
| ------------------------------ | ------------------------------------------ | ---------------- |
| `actions/checkout`             | `3d3c42e5aac5ba805825da76410c181273ba90b1` | v7.0.1           |
| `actions/setup-node`           | `820762786026740c76f36085b0efc47a31fe5020` | v7.0.0           |
| `Azure/static-web-apps-deploy` | `4d27395796ac319302594769cfe812bd207490b1` | v1 (branch head) |
| `azure/webapps-deploy`         | `02a81bead70021f5284939794bcec79c271ab383` | v3.0.8           |
| `zizmorcore/zizmor-action`     | `cc914d7f3750a2d13d75c7f184a1060aa0e9d482` | v0.6.4           |

`zizmor 1.29.0` reports **0 findings** across all eight workflows.

**Tools pinned outside `uses:`.** Three tools are pinned by a version argument or
input rather than by a `uses:` digest. None appears in the table above, which
lists actions only — `check-supply-chain` matches rows by action and digest. Two
of them Renovate cannot see, so they are bumped by hand; zizmor it maintains,
through the action's input (see §4).

| Tool     | Pin                                                | Where         | Maintained by                                |
| -------- | -------------------------------------------------- | ------------- | -------------------------------------------- |
| zizmor   | `version: '1.29.0'` input to `zizmor-action`       | `zizmor.yml`  | Renovate, as `ghcr.io/zizmorcore/zizmor`, §4 |
| renovate | `npx --package renovate@44.50.3` for the validator | `zizmor.yml`  | by hand                                      |
| semgrep  | `pip install semgrep==1.176.1` into a venv         | `semgrep.yml` | by hand                                      |

`semgrep.yml` is the Semgrep Code and Supply Chain scan. Supply Chain covers the
`package-lock.json` tree, which nothing above does: this page pins what the
pipeline _executes_, and the lockfile's integrity hashes pin what `npm ci`
_installs_, but neither says whether an installed version is vulnerable.

Node dependencies install through `npm ci` in the frontend and backend build
jobs, which installs the lockfile exactly and fails rather than resolving
anything fresh. One deploy step is an exception — see below.

## What is not pinned

Recording these honestly is the point. An exception you have written down is a
known risk; an exception you have not is a false sense of coverage.

### 1. `mcr.microsoft.com/appsvc/staticappsclient:stable`

`Azure/static-web-apps-deploy` is a Docker action, and at the exact commit we
pin it to, its `Dockerfile` reads:

```
FROM mcr.microsoft.com/appsvc/staticappsclient:stable
```

So pinning the action pins the _wrapper_, not the image that actually runs. The
`stable` tag is mutable and Microsoft-controlled; every deployment pulls whatever
it points at that day. There is no input to override it, and forking the action
to pin the digest would mean owning Microsoft's deployment client — a larger and
worse-understood risk than the one it removes.

**Four of the six deployment workflows sit behind this.** It is the single
largest unpinned surface in the repository and it is not closeable from here.

What it can reach was narrowed in #119. The two frontend workflows used to hand
it the **build** — Oryx ran `npm install` inside this container, on a Node
version it chose itself — so the shipped bundle came from a floating image.
They now build on the runner from `npm ci` and pass `skip_app_build: true`, so
the container only uploads `packages/frontend/dist`. It still runs, unpinned,
on every deploy; it no longer decides what is in the artifact. The two
`ropa-site` workflows are unchanged — see §5.

### 2. ~~`npm install --production --omit=dev` in the backend deploy step~~ — closed in #119

Both backend workflows built with `npm ci`, then assembled a `deploy/` folder and
ran a **second, lockfile-less install** inside it. `npm install` in a folder
without a lockfile resolves ranges fresh at deploy time, so the code shipped to
Azure could contain dependency versions that no build step ever saw and no
lockfile records.

This section once proposed copying the workspace lockfile into `deploy/` and
running `npm ci --omit=dev` there. That doesn't work in this monorepo: the only
lockfile is the root one, and it describes every workspace. What the workflows do
instead is run `npm ci --omit=dev --workspace=@linked-data-explorer/backend` in a
staging copy that holds the root `package.json` and `package-lock.json` plus the
backend's manifest, then copy the resulting `node_modules` into `deploy/`.
Measured before it landed: 349 packages, every one at the root lockfile's
version and integrity hash.

The step fails if a production dependency is installed un-hoisted, under
`packages/backend/node_modules`, because the copy would not carry it. On the ACC
workflow it runs on pull requests too, so a lockfile that can't produce the
artifact fails before the merge.

### 3. Node — pinned now, recorded here for its history

This section used to record `'22'` and `'20'` as floating majors. They were
pinned to exact literals in August 2026 — `22.23.2` for the backend, `20.20.2`
for the frontend — which then drifted apart by hand (#113). Since #119 all four
deploy workflows read one exact version from `.nvmrc`, maintained by Renovate's
`nvm` manager. The frontend moved from 20 to 22 in the same change, because that
is when its pin started to decide what ships: before, Oryx built the bundle on
22.22.0 regardless.

`zizmor.yml` keeps its own literal, `24.21.0`, deliberately: its
`renovate-config-validator` step needs Node 24.

**The App Service host runtime cannot be pinned exactly, and that is now a
decision rather than an omission.** `az webapp list-runtimes --os linux`
returns, for Node, exactly `NODE|22-lts`, `NODE|24-lts` and `NODE|26` —
major-level only. There is no exact version, no digest, and no setting that
takes one, so "pin at the highest precision the platform allows" is satisfied
by naming the major and nothing more.

What remains reachable is keeping that major in step with `.nvmrc`'s, and
**the ordering is part of the pin**: switch the App Service first, then merge
the `.nvmrc` bump. No pull-request check runs against an App Service, so
nothing enforces this.

`ronl-linkeddata-backend-acc` moved to `NODE|24-lts` on 23 September, ahead of
#80; `ronl-linkeddata-backend-prod` is still `NODE|22-lts` and coherent with
the artifact it runs, and moves with the promotion that carries a Node 24
build.

**And the ordering alone is not enough here**, because this backend ships a
native module. `libxmljs2` builds against NAN rather than N-API, so its
`xmljs.node` is bound to `NODE_MODULE_VERSION` — 127 on Node 22, 137 on Node 24. Between switching the runtime and deploying an artifact rebuilt on the new
major, the binary does not match the host; the same is true in reverse if the
merge comes first. That is not merely an interruption: on 23 September the
deploy reported success — health, `build.sha`, the shape layers and
`/v1/dmns` all green — while DMN validation returned `BASE-ERR` for every
user. The deploy workflows now POST a minimal DMN to `/v1/dmns/validate` after
the build check and fail on that signature, because the build-time
`require('libxmljs2')` assertion runs on the runner and proves only that the
binary matches the Node that built it.

### 4. `zizmor-action`'s `version: '1.29.0'` input

The action itself is hash-pinned, and this input pins the zizmor binary it
fetches — so nothing floats. Renovate maintains the input too, although this
section said otherwise until September 2026. Its `github-actions` manager maps
`zizmor-action` to the Docker image `ghcr.io/zizmorcore/zizmor`
(`known-actions.ts` in Renovate), and the Dependency Dashboard (#36) lists
`ghcr.io/zizmorcore/zizmor 1.29.0` with an update to 1.30.1 pending.

Two things follow:

- **The action and the input move together.** `zizmor-action` runs only the
  zizmor versions in its own digest table: 1.30.1 is in v0.6.4's table and not
  in v0.6.3's. Here the two normally arrive in one pull request, because the
  `github actions` group collects minor, patch and digest updates for every
  `github-actions` dependency, the zizmor image included. Normally, not always:
  each update clears the 14-day cooldown on its own clock, and zizmor is
  published before the action release that adds it (1.30.1 six minutes before
  v0.6.4). If the image update reaches the group branch first, the audit fails
  at "Run zizmor" until the action update joins it. Do not merge the group in
  that state. A major zizmor release is separate again: it waits for Dependency
  Dashboard approval on its own, and then the `zizmor-action` bump has to merge
  first.
- **The zizmor rows on this page are updated by hand, on that pull request's
  branch.** `check-supply-chain` verifies `uses:` pins only, so nothing fails
  when the tool row or the `zizmor 1.29.0` line above goes stale.

### 5. `ropa-site` builds inside Azure

`packages/ropa-site` has no `package.json` — it is `index.html` and a
`staticwebapp.config.json`. The workflows set no `skip_app_build`, so Azure's
Oryx builder inspects it, finds nothing to build, and uploads it as-is. The
build environment is Microsoft's and unpinnable, but with no dependency manifest
there is nothing for it to resolve. Worth stating precisely, because
"unpinned build environment" and "unpinned dependencies" are not the same claim.

### 6. The runner image: `ubuntu-24.04`, a version label, not a digest

Every job ran on `ubuntu-latest` until #119, a label GitHub moves to a new
Ubuntu release on its own schedule. Every job now names `ubuntu-24.04`, so a
change of OS release arrives as a diff in this repository rather than a
silent change under all twelve jobs at once. ICTU recommendation 2.

That pins the **release**, not the image. GitHub rebuilds `ubuntu-24.04` about
weekly with new preinstalled tools and security updates, and a hosted runner
cannot be pinned to a digest. What the jobs depend on is pinned separately
anyway: Node through `.nvmrc`, actions by digest, and npm packages by the
lockfile. So the weekly rebuild changes the environment around the build, not
the inputs to it.

Renovate's `github-actions` manager reads a versioned `runs-on` label as a
`github-runner` dependency (its `github-runners` datasource), which it could not
do for `ubuntu-latest`. So a newer Ubuntu release should arrive as a Renovate
update rather than by hand. Confirm on the Dependency Dashboard (#36) that
`ubuntu-24.04` is listed before relying on that.

## Dependency audit, daily

Every gate above runs on a commit. A new advisory lands against code that has
not changed, so a pipeline that only reacts to commits never sees it — and
Dependabot alerts watch the default branch, `acc`, not the `main` that
production deploys from. ICTU recommendation 10, tracked in #119.

`.github/workflows/dependency-audit.yml` runs at 05:17 UTC daily, and on
demand. It audits **both `acc` and `main`**, reading each branch's lockfile
with `npm audit --package-lock-only`, so it installs nothing.

|                           |                                                                             |
| ------------------------- | --------------------------------------------------------------------------- |
| Fails on                  | a **high or critical** advisory in **production** dependencies              |
| Reports but does not fail | moderate and low advisories, and everything dev-only                        |
| Where it reports          | the run's step summary, and one tracking issue it opens, updates and closes |
| Node                      | an exact literal, not `.nvmrc` — it audits a branch that need not carry one |

**It counts advisories, not packages.** `npm audit` reports one entry per
affected package, so one advisory on a widely-used package looks like dozens of
findings: on 24 September 2026 linked-data-explorer's 28 "moderate" entries were
three advisories, 24 of them the same `@tiptap/core` reached through its
extensions. `scripts/audit-tree.mjs` groups by advisory before reporting.
A number that overstates the problem gets ignored, which is the failure mode a
daily audit exists to avoid.

**A run that cannot audit exits 2, and is treated like a finding.** A tool that
fails to run must not report a clean tree — the same rule `--no-suppress-errors`
enforces for Semgrep.

## Version currency

All seven `actions/checkout` references now pin **v7.0.1**, converged in
[#66](https://github.com/sgort/linked-data-explorer/pull/66). Until then four of
them — the `ropa-site` workflows — sat at v3.7.0, four majors behind, while the
other three were on v4.4.0.

That gap is the point worth keeping: pinned is not the same as current. A hash
freezes a version in place, including an old one, and nothing about the pin
itself complains as it ages. Renovate raises these as upgrades under the 14-day
cooldown, which is the intended way for them to move — deliberately, in a
reviewable pull request, rather than silently on the next run.

## How the pins stay current

Pinning without automated updates decays into an unpatched tree, which is worse
than floating. `renovate.json` supplies the other half:

- **`helpers:pinGitHubActionDigests`** — anything reintroduced as a tag gets
  pinned back to a hash.
- **`minimumReleaseAge: "14 days"` with `internalChecksFilter: "strict"`** — a
  cooldown, not a security control. A compromised release is usually yanked
  within days; waiting two weeks means this repository never installs it.
  `strict` makes Renovate hold the pull request back rather than raise it and
  annotate it as pending.
- **`vulnerabilityAlerts` with `minimumReleaseAge: null`** — the fast lane. A
  fix for a known advisory must not wait out the cooldown.
- **`.npmrc` with `min-release-age=14`** — the same cooldown, applied by npm
  itself, since #119. Renovate's `minimumReleaseAge` covers only the updates
  Renovate proposes. Lock-file maintenance hands the refresh to npm, which is
  where the transitive tree moves, and Renovate documents that its own cooldown
  cannot apply there. For its own update pull requests Renovate uses whichever
  cutoff is stricter, and if npm answers `ETARGET` on a security fix it retries
  without the cutoff. Two limits, both measured: `npm ci` ignores the setting on
  purpose, and npm older than 11.10 ignores it without a warning. The second
  covers Node 22's bundled npm 10, so `scripts/check-deps.sh` warns about it at
  dev-server start and push.
- **Three workspace groups** — `backend`, `frontend`, `ropa-site`. An update
  that breaks one deployable should not be entangled with the other two.
- **`Azure/static-web-apps-deploy` disabled.** It is pinned to the newest commit
  on the `v1` _branch_; the `v1` _tag_ has not moved since 2021. Renovate
  resolves `@v1` to the tag, so leaving it enabled would raise a pull request
  "updating" the pin backwards by four years.

## Keeping this register true

The table above is the only part of this document a machine now reads.
`scripts/check-supply-chain.mjs` compares it with the workflows on every audit
run — digests, versions, and multiplicities — and separately resolves each
digest against the GitHub API to confirm it is the version its comment claims.
zizmor cannot do the second part: it validates that a `uses:` names a
40-character SHA, not that the SHA is the right one, so a wrong or hostile
digest carrying a plausible `# v4.4.0` comment passes zizmor, Prettier and
review alike.

**Renovate does not maintain this table.** It rewrites workflow pins and their
version comments together, honestly and correctly, and never touches this file.
That means an action-bump pull request leaves the register describing a policy
the workflows no longer follow — the drift this check exists to catch, arriving
by the most routine route there is.

So: **when a Renovate pull request bumps an action, update this table on that
pull request's branch, before merging it.** Not afterwards. The check runs on
the pull request, so a register fixed after the merge leaves the check red for
the entire life of every such pull request — and makes the step impossible to
promote to blocking, because no Renovate bump could ever show a green result to
merge on.

Verified rather than assumed, and this table is the proof. When
[#66](https://github.com/sgort/linked-data-explorer/pull/66) was raised
(`actions/checkout` → v7.0.1) the check reported

```
[register] actions/checkout: workflow pins 3d3c42e5aac5… (v7.0.1) but
           SECURITY-PIPELINE.md records only 11d5960a3267… (v4.4.0), a37ce9120846… (v3.7.0)
```

while pin truth passed — Renovate's digest and its rewritten comment agreed with
each other and with GitHub. The check was right and the register was stale. The
row above was updated on that pull request's branch, which is the habit this
section describes, and the check went green before it merged.

**The step blocks.** It was introduced non-blocking in
[#77](https://github.com/sgort/linked-data-explorer/pull/77) and promoted in
[#81](https://github.com/sgort/linked-data-explorer/pull/81), once the habit
above had been exercised twice —
[#66](https://github.com/sgort/linked-data-explorer/pull/66)
(`actions/checkout` → v7.0.1, which also collapsed a two-digest split pin) and
[#67](https://github.com/sgort/linked-data-explorer/pull/67)
(`actions/setup-node` → v7.0.0). Both went green on the branch and merged green.

So an action bump that leaves this table behind now **fails the audit**. That is
the intended cost: the register is part of the policy, and a register describing
workflows that have moved on is not documentation, it is a claim that is no
longer true.

If the GitHub API ever fails the gate through an outage or a rate limit, add
`--offline` rather than restoring `continue-on-error` — it keeps the register
half blocking and drops only the network-dependent half.

An action may legitimately hold **more than one row**. Until #66 this table
carried two for `actions/checkout` — v4.4.0 in three workflows, v3.7.0 in four,
mid-upgrade — and the check matches rows by digest precisely so a split pin
stays expressible. Do not collapse such rows to tidy the table: an action at two
digests is two distinct things to verify, and keying by action alone is the bug
that had to be fixed upstream in
[ttl-editor#86](https://github.com/sgort/ttl-editor/pull/86) before this
repository could adopt the check at all.

When workflows converge, the surplus row goes with them, as it did here. A
leftover row is reported as a note rather than a finding, so the check says so
without failing.

## How the rule is enforced

`.github/workflows/zizmor.yml` runs `zizmor` on every pull request and push to
`acc` and `main`, under `.github/zizmor.yml`, which sets `unpinned-uses` to
`hash-pin` for **`'*'`** — no exemption for first-party `actions/*`.

The audit workflow deliberately has **no `paths:` filter**. Every other workflow
here is path-filtered; filtering this one would let a pull request skip the gate
by touching nothing the filter watches.

Two rulesets make the gate binding rather than advisory — a branch that
reintroduces a floating tag cannot merge. That includes releases: `/bump-release`
was rewritten to land through a pull request for exactly this reason.

### What the rulesets require

A ruleset is GitHub state, not a file: nothing in a diff records it, and nothing
here is enforced by being written down. It is written down because otherwise the
only account of what gates `acc` and `main` lives in a settings page nobody reads
until something is already stuck.

| Ruleset                 | Id         | Ref               | Required checks                                                                      | Merge methods |
| ----------------------- | ---------- | ----------------- | ------------------------------------------------------------------------------------ | ------------- |
| `acc supply-chain gate` | `21794157` | `refs/heads/acc`  | `audit`, `scan`, `deploy`, `Build and Deploy Frontend`, `Build and Deploy ROPA Site` | merge only    |
| `main promotion gate`   | `22630654` | `refs/heads/main` | `audit`, `scan`                                                                      | merge only    |

`audit` is `zizmor.yml`; `scan` is `semgrep.yml`, added to both on 2026-09-11.
Both workflows trigger on `pull_request` with no branch or path filter, which is
what makes them safe to require: neither can go missing on any base.

The three build checks on `acc` were added for #119, so a red build or test run
blocks a merge — a dependency pull request above all. They are the jobs of
`azure-backend-acc.yml`, `azure-frontend-acc.yml` and `azure-ropa-site-acc.yml`,
whose `pull_request` triggers used to be path-filtered. A workflow its trigger
filters out reports no check, and a required check that never reports blocks
forever, so the filter moved into a `changes` job in each workflow (#184): the
build job is skipped on an unrelated pull request, and a skipped job counts as
passed. If `changes` fails, the build runs anyway. Two things follow:

- **Required checks match by job name.** Both deploy jobs used to be called
  `Build and Deploy Job`; they were renamed so each can be required on its own.
  Rename one of these jobs and the ruleset waits for a name that no longer
  reports. Update the ruleset in the same change.

  The two PRODUCTION site workflows carried the same collision until #210 and
  are now `Build and Deploy Production Frontend` and `Build and Deploy
Production ROPA Site`. Nothing requires them today -- `main` asks for
  `audit` and `scan` only -- so this changes no ruleset. It is a
  precondition: while both answered to one name they could not be required,
  referenced or told apart in a check list, and a promotion pull request showed
  two identical rows.

- **`main` requires `audit` and `scan` only, deliberately.** The backend
  production workflow has no `pull_request` trigger (#46), and promotion carries
  commits that already passed these checks on `acc`.

  The two site production workflows DO have one, on `main`. So a promotion pull
  request builds them and deploys a preview to the production Static Web App --
  environment `209` on `ropa-flevoland-prod` during the v2026.09.6 promotion,
  with `default` still serving `main`.

  **That is kept deliberately** (#210, decided 24 September 2026). A promotion
  pull request produces a preview of the PRODUCTION site, built from `acc`,
  before anything is promoted -- so the real thing can be looked at rather than
  inferred from an acceptance build. That is the point, and it is why these two
  workflows carry a trigger the backend does not.

  What it costs, so nobody discovers it as a surprise:

  - a public URL on the production resource, serving unreleased code, for as
    long as the pull request is open;
  - an environment slot on the production app -- the same ceiling
    `check-previews` exists for in `ronl-business-api`, and this repository
    still has no such check;
  - the `close_pull_request_job` is what removes it, so a pull request that
    closes without that job running leaves the preview behind. GitHub does not
    run `pull_request` workflows while a pull request has a merge conflict,
    closing included -- which is exactly how eight previews leaked in
    `ronl-business-api` on 12 September 2026.

  **The backend deliberately does NOT have this**, and that asymmetry is the
  decision rather than an oversight: a preview SITE is a page to look at, while
  a preview BACKEND on production would be a second live API against production
  data. The trigger belongs on one and not the other.

### Promotion runs the three production deploys in order

Until #210 each production workflow triggered itself on a push to `main` with
its own `paths:` filter, and the three raced. On the v2026.09.6 promotion the
ROPA site **finished deploying to production before the backend had started
building** — so for several minutes production served new pages against the
previous API. Nothing broke, and nothing would have caught it either: three
green checks is exactly what that failure looks like.

`promote-to-production.yml` is now the only thing a push to `main` starts. It
calls the three deploys as reusable workflows, backend first, then the two
sites together:

```
changes ──▶ backend ──┬──▶ frontend
                      └──▶ ropa-site
```

- **The backend goes first and alone.** A site calling an API older than itself
  is the failure worth preventing. Two sites deploying at once is not — neither
  depends on the other, so the promotion is no slower than it was, only ordered.
- **A failed backend stops both sites.** If the new API did not reach
  production, nothing written against it should start serving.
- **A skipped backend does not.** Each site waits for the backend to _reach a
  result_, checked against `["success","skipped"]` rather than `!= 'failure'`,
  and then decides on its own changes. `!cancelled()` is what lets a job
  evaluate its condition at all once a dependency skipped; without it GitHub
  skips the dependent regardless of what the condition says.

**The path filters had to leave the triggers.** A filter per workflow cannot
express "the sites wait for the backend", and a filter on the promotion workflow
would stop the decision itself from running. They live in
`scripts/promotion-targets.mjs`, which answers for all three in one place and
writes `backend`, `frontend` and `ropa_site` to `GITHUB_OUTPUT`.

That script is the only thing standing between a promotion and a deploy that
silently does not happen, so it is a module with `scripts/promotion-targets.test.mjs`
beside it rather than a `run:` block — 24 checks, run by `npm run test:scripts`
and by the promotion's own `changes` job _before_ it is used. Four of those
checks are a drift guard: the two site workflows still carry their path lists on
the `pull_request` trigger that builds the production preview, and the test
fails if those lists and the script's patterns stop agreeing. Without it a
promotion could preview a site it then declines to deploy.

**It fails safe towards deploying everything.** A promotion whose range cannot
be read is not a promotion that changed nothing. Three cases reach that path —
a `workflow_dispatch`, which carries no `before`; a first push or force-push,
whose `before` is all zeros; and a `before` this clone cannot resolve — and all
three deploy all three targets. A redeployed unchanged app costs five minutes;
a skipped changed one leaves production on the wrong code with a green
promotion to say otherwise. For the same reason the `if` on each deploy runs it
when `changes` did **not** succeed as well as when it said `true`.

**Three things this changed inside the called workflows**, each of which would
have been a silent misfire:

- **`github.event_name` is the CALLER's event.** Both site workflows gated
  their deploy job on `github.event_name == 'push'`, which is true for a
  promotion started by a push and false for one started by `workflow_dispatch` —
  the deploy would have been skipped outright. The condition is now phrased as
  an exclusion: everything except a pull request being closed.
- **`github.workflow` is the CALLER's name.** The concurrency groups used it, so
  all three deploys would have shared one group and queued behind each other.
  Each group now names its own app.
- **Secrets do not cross into a called workflow.** Each is declared under
  `workflow_call` and passed by name from the promotion — not `secrets:
inherit`, which would hand each deploy every secret the repository has.
  `secrets.GITHUB_TOKEN` is the exception; it is available without passing.

`workflow_dispatch` on the promotion takes a `dry_run` input, defaulting to
**true**, so a manual dispatch errs towards saying what it would do. The three
calls are resolved when the run is parsed, before any job starts, so a dry run
still fails loudly on a bad reference, a missing secret or an unsatisfiable
`needs` graph — it just deploys nothing.

The three deploy workflows keep their own `workflow_dispatch` (backend) and
`pull_request` (the two sites) triggers. The preview a promotion pull request
builds is **not** part of the sequence and is unaffected by it: different
trigger, different concurrency group, and it runs before the promotion exists.

`ronl-business-api` solved the same problem the same way in its own #177, and
the shape comes from there — including `$/` rather than `./` for the workflow
references. GitHub's self-repository syntax resolves against this repository at
this commit; the workspace-relative form resolves against the runner's
filesystem, so it can pick up something an earlier step wrote there, and
zizmor's self-repository audit flags it.

**The two rulesets differ in one parameter, deliberately.**
`require_extra_approval_for_unattributed_changes` is `true` on `acc` and `false`
on `main`. The `main` ruleset was created without it, GitHub stored it as `true`,
and with zero required approvals and no second maintainer to give one, that
would have deadlocked the very promotion the ruleset exists to protect. Rewrite
either ruleset from a template and this is the line that drifts back.

Worth knowing before it bites:

- **`bypass_actors` is empty on both.** There is no administrator override. If
  semgrep.dev is unreachable or `SEMGREP_APP_TOKEN` is revoked, merges to `acc`
  **and to `main`** stop until a ruleset is edited — for this repository that
  includes promotion to production.
- **No forks today.** A pull request from a fork would carry no secret, so `scan`
  could not start and would block it. See ttl-editor#128 for the fork-safe
  shape, should that ever change.
