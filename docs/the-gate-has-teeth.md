# The gate has teeth

How the IOU supply-chain pinning policy was applied to the Linked Data Explorer,
and — more usefully — what was different here from the two repositories that went
first.

`ttl-editor` and `ronl-business-api` each carry a document with this name. This
one deliberately does not restate what they say. The policy, the rationale for
hash-pinning, the cooldown, and the ruleset mechanics are settled and identical;
read `ttl-editor`'s copy for those. What follows is what this repository taught
us, and what a fourth repository should expect to differ again.

The resulting state — every pin, and every honest exception — is
[`SECURITY-PIPELINE.md`](../SECURITY-PIPELINE.md).

## The shape of this repository

Three deployables, not one:

| Workspace            | acc                       | production                      | Deployed by     |
| -------------------- | ------------------------- | ------------------------------- | --------------- |
| `packages/backend`   | `azure-backend-acc.yml`   | `azure-backend-production.yml`  | App Service     |
| `packages/frontend`  | `azure-frontend-acc.yml`  | `azure-frontend-production.yml` | Static Web Apps |
| `packages/ropa-site` | `azure-ropa-site-acc.yml` | `azure-ropa-site-prod.yml`      | Static Web Apps |

Six deployment workflows plus the audit. `ttl-editor` had two. That difference is
not just arithmetic: it is the reason `renovate.json` groups dependencies per
workspace, so a breaking update to one deployable is not entangled with the other
two in a single pull request.

Result: **40 zizmor findings to 0**, twenty action references pinned.

## What was already right here

Two things this repository had that the others did not, both of which meant less
work rather than more.

**`pull_request` was already path-filtered.** In `ronl-business-api`, every pull
request to `acc` deployed all three sites, each holding a Static Web Apps staging
environment against a per-app ceiling of three — five open pull requests
exhausted it on 2026-08-28, and fixing that became follow-up item 5. Here, all
four Static Web Apps workflows already filtered `pull_request` on the same paths
as `push`. The problem never existed.

It is worth saying plainly that I reported the opposite at first. My survey
grepped the trigger blocks with `head -8`, which truncated inside
`pull_request:` and showed only its `branches:`. The filter was there the whole
time; the tool cut it off. A survey that truncates is not a survey, and a finding
derived from one is not a finding.

**The backend deploys with `azure/webapps-deploy@v3` and a publish profile, and
it works.** This matters outside this repository. `ronl-business-api`'s follow-up
item 2 records a _hypothesis_ that its backend cannot deploy from CI because
App Service disables SCM basic authentication by default. This repository does
exactly that, successfully, against the same subscription — so the hypothesis is
wrong as stated. Whatever blocks `ronl-business-api` is per-App-Service
configuration, not a platform default. That item needs correcting there.

## What was different, and cost something

### The self-reference asymmetry

Every workflow now lists its own file in its `paths:`, matching the convention
the backend workflows already followed:

```yaml
paths:
  - "packages/frontend/**"
  - ".github/workflows/azure-frontend-acc.yml"
```

Without it, a pull request that changes only a workflow does not run that
workflow — so the pinning pull request itself would have modified six deploy
pipelines and exercised none of them.

The script that applied this added the self-reference to `push` only. Because
`pull_request` already had its own `paths:` block, the mirroring branch that
would have handled it was correctly skipped — and the asymmetry that left behind
was worse than either state alone: `push` would deploy on merge, `pull_request`
would not deploy on the pull request. The change would have gone in untested and
landed straight on `acc`.

The lesson is narrow and worth keeping: **a filter is two lists, and a change to
one of them is not a change.** Both halves now carry the self-reference.

### Concurrency, applied before it broke anything

All six deployment workflows gained:

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: true # false on the two production workflows
```

This is the _corrected_ key from `ronl-business-api`, adopted here without the
intervening incident. Keyed on `github.ref` alone, the `pull_request(closed)`
teardown and the `push` deploy that a merge fires simultaneously land in the same
group and cancel each other at random — which there skipped two acceptance
deploys and stranded a preview environment before anyone noticed.

Production queues rather than cancels: interrupting a live production deployment
to start another is worse than waiting for it.

Note that this is the _GitHub_ concurrency layer. Azure cancels overlapping
deployments to a single Static Web Apps environment on its own, and reports
`Deployment Canceled` on a job that did nothing wrong. Both layers exist; a green
`concurrency:` block is not evidence that Azure is not also cancelling something.

### `staticappsclient:stable` is the real ceiling here

Four of six deployment workflows go through `Azure/static-web-apps-deploy`, a
Docker action whose image is `mcr.microsoft.com/appsvc/staticappsclient:stable` —
a mutable tag, pulled fresh on every deployment, with no input to override it.

Pinning the action pins the wrapper, not what runs. With four workflows behind
it, this is the largest unpinned surface in the repository, and it is larger here
than in `ttl-editor` simply because there is more of it. It is not closeable from
this side, so it is recorded rather than solved.

Verified against the Dockerfile at the exact commit we pin, not carried over from
the earlier repository — the same action can change its base image between
commits, and an exception inherited without checking is an assumption.

## Sequence

The order below is not incidental. Pinning without Renovate decays into an
unpatched tree; a ruleset before a green audit blocks every pull request
including the one that fixes it.

1. Pin all twenty action references; add `persist-credentials: false`,
   workflow- and job-level `permissions:`, `concurrency:`, and the `paths:`
   self-references. Verify locally: `uvx zizmor@1.29.0 .github/workflows/`.
2. Add `.github/zizmor.yml` (policy) and `.github/workflows/zizmor.yml` (gate).
3. Add `renovate.json`.
4. Merge to `acc`. Only now enable the Renovate App — it reads `renovate.json`
   from the default branch, so enabling it earlier onboards with defaults.
5. Enable Dependabot alerts.
6. Add the `acc` ruleset requiring a pull request and a passing `audit` check.
   Last, once `audit` has actually reported green at least once.
7. Repository settings: merge commits only, `delete_branch_on_merge`.

## Two things not to repeat

**Do not set `token: ''` on the zizmor action.** It reads as sound
least-privilege hardening and it is not; `--gh-token` is env-backed and clap
rejects a set-but-empty value before any audit runs, even with
`online-audits: false`:

```
error: invalid value '' for '--gh-token <GH_TOKEN>': GitHub token cannot be empty
```

That broke the gate on its first run in `ttl-editor`. The default is correct.

**Do not measure the baseline with a different zizmor than the gate runs.**
zizmor 1.29.0 no longer exempts `actions/*` from `unpinned-uses`; an older local
binary reports a much smaller number and makes the work look finished.

## Still open

`main` is untouched. Production workflows on `main` still resolve floating tags
until `acc` is promoted — the pins described here protect acceptance, not yet
production. The same is true of `ttl-editor` and `ronl-business-api`.
