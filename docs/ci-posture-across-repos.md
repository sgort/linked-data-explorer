# CI posture across the three applications

Where the CPSV Editor (`ttl-editor`), Linked Data Explorer (`linked-data-explorer`)
and RONL Business API (`ronl-business-api`) stand on three mechanisms that were
rolled out across all of them in September 2026 — build provenance, supply-chain
verification, and a per-file test-coverage floor.

A **fourth** now exists in all three: a Semgrep scan covering the npm dependency
tree and the application code. ttl-editor and Linked Data Explorer require it to
merge; RONL Business API adopted it on 12 September 2026 and runs it as a
reporting check while its baseline is triaged — 435 findings at adoption, 25
since its first lock-file maintenance on 14 September, none blocking. It
is described under §2 rather than given a section of its own, because it is the
other half of the supply chain that `check-supply-chain` was never able to see.

A **fifth** exists in all three as of the same day, and is the only one that
cannot run in CI: `scripts/check-mirror.sh`, called at each release, compares the
GitLab mirror against GitHub and distinguishes _behind_ from _diverged_. §5
explains why a runner cannot do it.

A **sixth** runs outside CI as well, as of 14 September 2026:
`scripts/check-deps.sh`, which stops a dev server from starting on an install
that no longer matches `package-lock.json` and names `npm ci` as the fix. Since
the same evening it also runs first in all three pre-push hooks. §2 covers it with
the rest of the npm tree.

A **seventh** runs outside CI as well, in ttl-editor as of 15 September 2026 and
in RONL Business API as of 22 September: `scripts/check-previews.sh`, which lists
the preview environments Azure holds against the pull requests GitHub has open,
and prints a delete command for every orphan. §4 explains why a workflow alone
could not keep them clean. Linked Data Explorer still has none.

**This page is the single documented source for ttl-editor and Linked Data
Explorer.** Until 2026-09-11 each repository carried its own copy; the two had
drifted in both directions — each gaining sections the other lacked — so
ttl-editor's copy was deleted and its README now points here.

Verified against each repository's `acc` at the heads below, not written from
memory — rulesets read from the API, workflow triggers and steps parsed from the
YAML, thresholds read from the config that declares them, mirror state from
`ls-remote` against both remotes.

Revised **15 September 2026**: ttl-editor's and Linked Data Explorer's heads and
mirror state re-verified that day. RONL Business API's head, mirror state, Semgrep
counts, Static Web Apps plan and preview environments were re-verified the same
day, after its v2026.09.8 release. Other rows carry over unless §"What changed on
15 September 2026" says otherwise.

Previously revised **14 September 2026**: repository heads and mirror state
re-verified that day.

Previously revised **12 September 2026**, after RONL Business API promoted `acc` to
production for the first time since 17 July and then closed ten of the eleven
alignment items it had been carrying — the eleventh being out of scope rather
than skipped, and named in §"What changed" below. ttl-editor's and Linked Data
Explorer's rows were re-verified the same day.

| repository           | `acc` at  | `main` at |
| -------------------- | --------- | --------- |
| ttl-editor           | `4a20e91` | `e1c482e` |
| linked-data-explorer | `0a52f9d` | `01fcd67` |
| ronl-business-api    | `e187086` | `311d732` |

---

## Summary

|                               | ttl-editor            | linked-data-explorer      | ronl-business-api         |
| ----------------------------- | --------------------- | ------------------------- | ------------------------- |
| **Build id in the changelog** | ✅                    | ✅                        | ✅ exercised in PROD      |
| **check-supply-chain**        | ✅ blocking           | ✅ blocking               | ✅ blocking               |
| **Semgrep Code + SCA**        | ✅ required           | ✅ required               | ✅ required on `acc`, 25  |
| **Build checks required**     | ✅ `acc`, #119        | ✅ `acc`, #119            | ✅ `acc`, #119            |
| **Per-file 80% branch floor** | ✅ 1 runner           | ✅ 2 runners              | ✅ 5 runners              |
| **Formatting checked in CI**  | ✅                    | ✅                        | ✅                        |
| **Tests run before merge**    | ✅                    | ✅                        | ✅                        |
| **Renovate lock-file maint.** | ✅                    | ✅                        | ✅                        |
| **One Node version**          | ✅ single literal     | ✅ `.nvmrc`, one file     | ✅ `.nvmrc`, one file     |
| **`acc` ruleset**             | PR + `audit` + `scan` | + `deletion`, `non-ff`    | ✅ + `deletion`, `non-ff` |
| **`main` ruleset**            | ⚠️ classic, no checks | ✅ full, `audit` + `scan` | ✅ full, `audit`          |
| **Mirror checked at release** | ✅ `check-mirror`     | ✅ `check-mirror`         | ✅ `check-mirror`         |
| **Mirror in sync**            | ✅ both               | ✅ both                   | ✅ both                   |
| **Install checked at start**  | ✅ `start`            | ✅ `dev`, three scripts   | ✅ `dev`                  |
| **Install checked at push**   | ✅ pre-push           | ✅ pre-push               | ✅ pre-push               |
| **Orphaned previews checked** | ✅ `check-previews`   | ❌ none orphaned today    | ✅ `check-previews`       |

Nothing in that table is uniform by accident. Each application has a different
build shape, and the differences below are re-derived per repository rather than
copied.

### What changed on 23 September 2026

One day, and the first thing on this page that had never actually been run.

| repository        | change                                                                                                                                 | pull request                                                                                                             |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| ronl-business-api | **v2026.09.11 released and promoted** — the first promotion sequenced by a workflow rather than by hand                                | [#193](https://github.com/sgort/ronl-business-api/pull/193), [#194](https://github.com/sgort/ronl-business-api/pull/194) |
| ronl-business-api | the local dev stack's images pinned by tag and index digest; `docker:pinDigests` added; the App Service runtime decision recorded      | [#197](https://github.com/sgort/ronl-business-api/pull/197)                                                              |
| ronl-business-api | `/bump-release` runs the tests before it commits                                                                                       | [#190](https://github.com/sgort/ronl-business-api/pull/190)                                                              |
| ronl-business-api | the vestigial `KEYCLOAK_CLIENT_SECRET` deleted from the production App Service, once `main` carried the commit that stopped reading it | —                                                                                                                        |

**The promotion ordering worked, and here is the evidence rather than the
claim.** #177 replaced four racing deploy workflows with one sequenced
promotion, and until this date it had only ever been exercised as a dry run. The
first real promotion of `acc` to `main`:

```
changes           16:53:09 → 16:53:14
backend / build   16:53:18 → 17:00:09   6m51s
frontend          17:00:13 → 17:05:25
pa-demo           17:00:13 → 17:02:56
public-site       17:00:13 → 17:03:23
```

All three site jobs started **four seconds after the backend completed**. Under
the previous arrangement they would have started alongside it at 16:53:18 and
finished around 17:03 — roughly five minutes _before_ the backend they depend
on. The public site is the one that matters there: its build prerenders against
the live API, so that window is exactly where a 404 gets baked into the deployed
output rather than shown once.

Production reported `build.sha` matching the promoted commit, `run: 2` — the
second automated production backend deploy, and the first inside a sequenced
promotion. Every previous one was a script run from a laptop.

**The App Service runtime cannot be pinned, and that is now a decision rather
than an open question.** #119 asked to pin the floating `NODE|22-lts` exactly
where the platform allows, or record why not. `az webapp list-runtimes --os
linux` returns, for Node, exactly `NODE|22-lts`, `NODE|24-lts` and `NODE|26` —
major-level only, no exact version, no digest, no setting that takes one. All
four App Services across both repositories run `NODE|22-lts`.

What remains reachable is keeping the App Service's major in step with
`.nvmrc`'s, and **the ordering is part of the pin**: switch the App Service
first, then merge the `.nvmrc` bump. No pull-request check runs against an App
Service, so nothing enforces this and it has to be written where it gets read —
`SECURITY-PIPELINE.md` for RONL Business API, and this page and #119 for the
shared half. **That unblocks #80**, which has been held open since 19 September
for precisely this reason.

**The rule has an exception, and Linked Data Explorer is it.** `switch first,
then merge` is complete only for a pure-JavaScript backend. This repository's
ships `libxmljs2`, which builds against NAN rather than N-API, so its
`xmljs.node` is bound to `NODE_MODULE_VERSION` — 127 on Node 22, 137 on Node 24.
Between switching the runtime and deploying an artifact rebuilt on the new
major, the binary does not match the host and the backend will not start. The
same is true in reverse if the merge comes first.

What makes that worth writing down is not the interruption — these are sandbox
applications and an interruption costs nothing — but that **the deploy reports
success while the application will not start**. The workflow does assert the
binding loads:

```
node -e "require('./deploy/node_modules/libxmljs2')" && echo "libxmljs2 native binding loads"
```

and that assertion runs on the RUNNER. It proves the binary matches the Node the
runner built it with, which is exactly the axis that cannot see a runner-versus-host
mismatch. So the one check in the pipeline that looks like it covers this is the
reason the failure is quiet. Recovery is automatic — `.nvmrc` is in this
workflow's paths filter and its `changes` pattern since #186, so the merge fires
the deploy that rebuilds the binary — but someone watching a green run and a dead
application needs this paragraph to know why.

RONL Business API is unaffected: its backend has thirty runtime dependencies and
none are native. The two `.node` files in its tree, `@rollup/rollup-linux-x64-gnu`
and `@napi-rs/lzma`, are development-only and reach no deploy bundle.

**A floating tag is invisible to Renovate.** The container-image item on #119
split cleanly once the question became _does this repository apply the file?_
RONL Business API's `docker-compose.yml` — the local dev stack, applied from the
tree by developers — now pins all five images by tag and **index** digest, with
`docker:pinDigests` in `renovate.json` so they are maintained rather than merely
set. The same rule that file already stated for actions: pinning without
automated updates decays into an unpatched tree, which is worse than floating.

Two of those five were `:latest`, and that is the finding worth carrying to the
other two repositories. Renovate's docker-compose manager tracks a tag it can
compare; `:latest` gives it nothing, so `alpine:latest` and
`operaton/operaton:latest` appeared on no dashboard and in no pull request —
they were the only images in the tree that nothing was watching at all. The
three already on version tags were merely unpinned, which is a weaker problem.

The three compose files under `deployment/vm/` are deliberately **not** pinned,
and that is the more interesting half. Nothing in that repository applies them:
no workflow, no script reads them. A digest there would record a value no deploy
consults, against a host whose running image cannot be read from the repository
— a pin that cannot be verified is a pin that can be wrong with nothing saying
so. Same shape as the backend deploy before #35, which sat outside every gate on
the page describing it.

That became [ronl-business-api#196](https://github.com/sgort/ronl-business-api/issues/196),
a sub-issue of #119: bring the VM deployment under control first, pin second. Two
decisions narrowed it on the day it was opened. The VM's SSH is firewalled to a
single fixed IP address, so a GitHub-hosted runner cannot reach it at all — which
rules out lifting the existing hand-run script into a workflow, and points at the
VM reconciling the files itself rather than anything pushing to it. And the scope
is acceptance only, because the production side is being replaced by a new
supplier's infrastructure.

### What changed on 19–22 September 2026

Four days, and the end of two things this page had been describing as open since
it was written: a backend deployed by hand, and a production promotion that raced
itself.

| repository           | change                                                                                                                           | pull request                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| all three            | the 14-day package-manager cooldown, the `ubuntu-24.04` runner pin, build checks required on `acc`, and `.nvmrc` in every filter | RBA [#158](https://github.com/sgort/ronl-business-api/pull/158)–[#162](https://github.com/sgort/ronl-business-api/pull/162), LDE [#179](https://github.com/sgort/linked-data-explorer/pull/179)–[#186](https://github.com/sgort/linked-data-explorer/pull/186), TTL [#158](https://github.com/sgort/ttl-editor/pull/158)–[#163](https://github.com/sgort/ttl-editor/pull/163) |
| linked-data-explorer | the frontend builds on the runner; one exact `.nvmrc` for all four deploy workflows (closed #113)                                | [#179](https://github.com/sgort/linked-data-explorer/pull/179)                                                                                                                                                                                                                                                                                                                |
| linked-data-explorer | the backend deploy installs from the root lockfile                                                                               | [#181](https://github.com/sgort/linked-data-explorer/pull/181)                                                                                                                                                                                                                                                                                                                |
| ttl-editor           | both of those, in one pull request                                                                                               | [#160](https://github.com/sgort/ttl-editor/pull/160)                                                                                                                                                                                                                                                                                                                          |
| ronl-business-api    | the backend deploys from the workflow, over OIDC, from the lockfile (closed #34, #35, #129)                                      | [#176](https://github.com/sgort/ronl-business-api/pull/176)                                                                                                                                                                                                                                                                                                                   |
| ronl-business-api    | a preview environment is created only when a pull request asks for one                                                           | [#181](https://github.com/sgort/ronl-business-api/pull/181)                                                                                                                                                                                                                                                                                                                   |
| ronl-business-api    | a pull request's preview may call the acceptance backend, matched on its app's stable slug (closed #37)                          | [#184](https://github.com/sgort/ronl-business-api/pull/184)                                                                                                                                                                                                                                                                                                                   |
| ronl-business-api    | `check-previews`, ported from ttl-editor (closed #154)                                                                           | [#185](https://github.com/sgort/ronl-business-api/pull/185)                                                                                                                                                                                                                                                                                                                   |
| ronl-business-api    | a promotion is one ordered run instead of four racing ones (closed #177)                                                         | [#187](https://github.com/sgort/ronl-business-api/pull/187)                                                                                                                                                                                                                                                                                                                   |
| all three            | lock-file maintenance, merged one at a time with housekeeping between                                                            | RBA [#174](https://github.com/sgort/ronl-business-api/pull/174), LDE [#188](https://github.com/sgort/linked-data-explorer/pull/188), TTL [#164](https://github.com/sgort/ttl-editor/pull/164)                                                                                                                                                                                 |

**RONL Business API's backend is inside the gates at last.** Until 21 September it
was deployed by `deploy-backend-to-acc.sh` and `deploy-backend-to-prod.sh`, run by
hand from a local checkout — outside every gate on this page, and installing into a
`deploy/` directory that had a `package.json` and no lockfile, so
`npm install --production` re-resolved every caret range at deploy time. On
2026-08-29 an acceptance deploy shipped `@anthropic-ai/sdk` 42 minor versions and
`uuid` five majors ahead of anything a build had verified. #176 replaced both with a
workflow step: `npm ci --omit=dev --workspace=@ronl/backend` in a staging copy of
the root manifest and lockfile, `az webapp deploy` over an OIDC token, and a
post-deploy check that polls `/v1/health` until `build.sha` matches the commit. The
first unattended merge→deploy ran on 2026-09-20 and the sha matched. The scripts
remain as break-glass. Closed #34, #35 and #129 together — the three RBA rows §6
had carried longest.

**Four production workflows fired on the same push and nothing sequenced them.** A
promotion to RBA's `main` started the backend and three Static Web App deploys at
once. The backend job is the slowest of the four — it runs the full backend suite
before it packages anything, while a Static Web App deploy is a build and an
upload — so the frontends reliably finished FIRST, and a frontend calling a route
the deployed backend did not serve yet got a 404. On the public site that is worse
than transient: its build prerenders against the live API, so a prerender inside the
window bakes the failure into the deployed output. The manual answer had been to
disable the three site workflows before the merge and dispatch them by hand
afterwards, written down in that repository's `docs/promote-ACC-to-PROD.md`. #187
made the promotion one run: the four deploy workflows lost their `push` trigger and
became reusable workflows called in order by `promote-to-production.yml`, which
decides what changed from one script rather than from four `paths:` filters.

Worth noting for the other two: what made that affordable is that RBA's `main`
requires only `audit`, so no job name was load-bearing. A reusable workflow's check
reports as `<caller job> / <called job>`, which renames every required context.
RBA's `acc` was left alone for exactly that reason — its ruleset names four build
jobs — and Linked Data Explorer's `main` requires `audit` and `scan`, neither of
which is a deploy job, so the same move is open there.

**A preview cost more than it proved.** RBA #181 stopped creating a preview
environment unless a pull request is labelled `preview` and changes something other
than a manifest. The trigger was #154's finding that three Renovate security pull
requests had claimed eight environments on 12 September, all eight of which then
leaked; a dependency bump's preview renders the same pages as the last one, and the
build is what verifies it. #185 then ported ttl-editor's `check-previews` to find
the ones that leak anyway. It could not be copied byte for byte: ttl-editor derives
each app from its workflow's file name, which RBA's naming does not allow, so the
apps are found by `repositoryUrl` across every subscription — RBA's six span two of
them, and ttl-editor's script reads only the logged-in one.

**A check that cannot ask must not report success.** Writing #185 surfaced a shape
worth carrying into the other two. An expired Azure refresh token made
`az staticwebapp list` fail, and with stderr discarded it returned an empty list —
indistinguishable from a subscription holding no apps. The check was one step from
reporting "no orphans" against a stack it had never examined. So: the session is
proven with a real ARM call rather than `az account show`, which reads cached state
and succeeds against a token that expired days ago; a subscription that cannot be
read counts as unchecked and fails; and finding no apps at all fails too, because it
means nothing was compared. `check-mirror` already had that rule.

**The cooldown holds, and its status check says otherwise.** #119 left one thing to
confirm: that the next lock-file maintenance in each repository contains no version
younger than 14 days. Measured on 22 September against the npm registry's own
`time` map, across every version the three refreshes introduced — RBA 62 packages,
LDE 97, TTL 42 — **none was younger than 14 days**, and the youngest anywhere was
exactly 14 days old when Renovate wrote the branch on 21 September. So the control
works.

The status check does not say so. All three pull requests carried
`renovate/stability-days` as **pending**, reading "Updates have not met minimum
release age requirement", and all three were merged over it. That is consistent
with Renovate's documented behaviour — `lockFileMaintenance` does not honour
`minimumReleaseAge`, so the branch is flagged rather than evaluated — but the
practical effect is a red status on a branch that is in fact compliant. A gate that
is wrong in the safe direction still teaches people to merge past it, which is how
gates stop working. The measurement above is the thing to read; the status is not.

### What changed on 15 September 2026

All three repositories, and three findings about things no gate could see.

| repository           | change                                                                                          | pull request                                                                                                                                                                          |
| -------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ttl-editor           | the last four Semgrep findings answered in the source, not the dashboard                        | [#144](https://github.com/sgort/ttl-editor/pull/144)                                                                                                                                  |
| ttl-editor           | zizmor's `version` input recorded as Renovate-maintained, with the merge order it needs         | [#144](https://github.com/sgort/ttl-editor/pull/144)                                                                                                                                  |
| linked-data-explorer | the same correction; a Renovate group normally moves both together here                         | [#139](https://github.com/sgort/linked-data-explorer/pull/139)                                                                                                                        |
| ttl-editor           | lock-file maintenance exempt from the pull-request limits                                       | [#145](https://github.com/sgort/ttl-editor/pull/145)                                                                                                                                  |
| linked-data-explorer | the same, plus pre-1.0 minors held for approval and `engines` left alone                        | [#138](https://github.com/sgort/linked-data-explorer/pull/138)                                                                                                                        |
| ttl-editor           | v2026.09.5 released and promoted to production                                                  | [#146](https://github.com/sgort/ttl-editor/pull/146), [#147](https://github.com/sgort/ttl-editor/pull/147)                                                                            |
| ttl-editor           | previews closed by a workflow with no path filter; orphans checked at each release              | [#150](https://github.com/sgort/ttl-editor/pull/150)                                                                                                                                  |
| ronl-business-api    | three Renovate updates, rebased and merged one at a time; one backend runtime change, `pg` 8.23 | [#149](https://github.com/sgort/ronl-business-api/pull/149), [#147](https://github.com/sgort/ronl-business-api/pull/147), [#148](https://github.com/sgort/ronl-business-api/pull/148) |
| ronl-business-api    | v2026.09.8 released; the backend deployed to acceptance by the hand-run script                  | [#151](https://github.com/sgort/ronl-business-api/pull/151)                                                                                                                           |
| ronl-business-api    | `/bump-release` versions `packages/pa-cockpit`, left at 1.0.0 across 49 commits                 | [#153](https://github.com/sgort/ronl-business-api/pull/153)                                                                                                                           |

**Eight preview environments were still running for pull requests that had long
closed**, four on each ttl-editor app, and nothing reported them: they were found by
opening the Azure portal. There were two causes, and only one can be fixed inside a
workflow. §4 has both, under "A path filter also filters the close, and a
conflicted pull request closes silently". The same read of Azure found three more
on RONL Business API's acceptance app.

**zizmor's own version was never manual.** Both registers said Renovate could not
see the `version:` input to `zizmor-action`. Renovate maps that action to the
`ghcr.io/zizmorcore/zizmor` image, and had an update queued in both repositories.
§2 has what follows, under "What the register check cannot see".

**The Semgrep dashboard and the CLI counted different things.** ttl-editor's CLI
reported `Findings: 0` on every scan while the dashboard's scan list showed 4 Code
findings, because the list counts findings ignored in the dashboard and the CLI does
not. Moving those four into the source took the list to 0 on `acc` and `main`. §2
has the detail.

### What changed on 14 September 2026

One day across all three repositories, and three findings nobody had planned for.

| repository           | change                                                                                           | pull request                                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| ronl-business-api    | `deps:check` stops firing on every release bump, and names `npm ci`                              | [#128](https://github.com/sgort/ronl-business-api/pull/128)                                                              |
| ronl-business-api    | lock-file maintenance exempt from the pull-request limits, after its first Monday opened nothing | [#133](https://github.com/sgort/ronl-business-api/pull/133)                                                              |
| ronl-business-api    | the first lock-file maintenance: Semgrep 435 → 25, reachable Supply Chain 249 → 0                | [#134](https://github.com/sgort/ronl-business-api/pull/134)                                                              |
| ronl-business-api    | Prettier pinned to exactly 3.9.6, after that refresh failed `check-format`                       | [#135](https://github.com/sgort/ronl-business-api/pull/135)                                                              |
| ronl-business-api    | the lockfile check runs first in the pre-push hook                                               | [#137](https://github.com/sgort/ronl-business-api/pull/137)                                                              |
| ronl-business-api    | minor updates of pre-1.0 packages held for approval, after one required ESLint 9                 | [#142](https://github.com/sgort/ronl-business-api/pull/142)                                                              |
| ronl-business-api    | `engines` floors no longer raised to the newest release                                          | [#146](https://github.com/sgort/ronl-business-api/pull/146)                                                              |
| ronl-business-api    | Node pinned exactly everywhere in CI: the config validator on 24.20.0, `.nvmrc` on 22.23.2       | [#139](https://github.com/sgort/ronl-business-api/pull/139), [#144](https://github.com/sgort/ronl-business-api/pull/144) |
| linked-data-explorer | the lockfile check runs first in the pre-push hook                                               | [#127](https://github.com/sgort/linked-data-explorer/pull/127)                                                           |
| linked-data-explorer | the same check, new here                                                                         | [#121](https://github.com/sgort/linked-data-explorer/pull/121)                                                           |
| linked-data-explorer | Renovate's action bump, with the register moved on its own branch                                | [#104](https://github.com/sgort/linked-data-explorer/pull/104)                                                           |
| linked-data-explorer | SHACL shapes shipped to production; validation fails closed; both backend deploys gate on it     | [#123](https://github.com/sgort/linked-data-explorer/pull/123)                                                           |
| linked-data-explorer | that gate waits for the new build to answer                                                      | [#124](https://github.com/sgort/linked-data-explorer/pull/124)                                                           |
| linked-data-explorer | promoted to production, no release cut                                                           | [#125](https://github.com/sgort/linked-data-explorer/pull/125)                                                           |
| ttl-editor           | the same check, new here                                                                         | [#142](https://github.com/sgort/ttl-editor/pull/142)                                                                     |
| ttl-editor           | the lockfile check runs first in the pre-push hook                                               | [#143](https://github.com/sgort/ttl-editor/pull/143)                                                                     |
| ttl-editor           | Renovate's action bump, with the register moved on its own branch                                | [#141](https://github.com/sgort/ttl-editor/pull/141)                                                                     |
| ttl-editor           | the first scheduled lock-file maintenance, six packages                                          | [#140](https://github.com/sgort/ttl-editor/pull/140)                                                                     |

**Linked Data Explorer's production SHACL Validator had been checking nothing.**
Every file reported Valid with all three shape layers _Not loaded_; the same
file on acceptance was Invalid with 25 errors. Two faults had stacked: the shape
files were only ever copied into the acceptance deploy package, and a layer that
did not load counted as a layer with no errors. §4 has the workflow half, under
"A fix made in one environment's workflow is half a fix".

**The deploy check written for it failed its first run, on a sound deploy.** It
read the previous build, still answering after the deploy step had returned. §1
records why, under "A post-deploy check has to know which build answered", and
two issues track the exact fix: [linked-data-explorer#122](https://github.com/sgort/linked-data-explorer/issues/122) and
[ronl-business-api#129](https://github.com/sgort/ronl-business-api/issues/129).

**Nothing had checked a workstation's install against its lockfile**, in any of
the three. §2 has the measurement and the check, under "The tree on a
workstation".

**Holding majors behind approval never kept a slot for lock-file maintenance.**
RONL Business API's first scheduled refresh opened nothing: Renovate counts every
open Renovate pull request against the limit, security ones included, and seven
open security pull requests were already over it. §2 has the correction, under
"Renovate maintains dependencies, not the tree".

### What changed on 12 September 2026

RONL Business API worked from an eleven-item list and closed **ten** of them in a
day, in the order that made each one cheap — the eleventh being out of scope
rather than skipped. The list is reproduced here because the **shape** of the
work is the useful part, not the ticks: one item was passed over at the start and
only came back last, which is the failure mode worth remembering.

| item    |                                    | outcome                                                                  |
| ------- | ---------------------------------- | ------------------------------------------------------------------------ |
| **C1**  | `acc` ruleset: `deletion` + non-ff | ✅ closed last, a month after `main` got the same two rules              |
| **C2**  | Backend tests before merge         | ✅ `pull_request` trigger added, #87 closed                              |
| **C3**  | `check-supply-chain` blocking      | ✅ `continue-on-error` removed, #83 closed                               |
| **C4**  | Formatting checked in CI           | ✅ `npm ci` + `check-format` in the `audit` job                          |
| **C5**  | Semgrep Code + Supply Chain        | ✅ workflow + `.semgrepignore`; **`scan` deliberately not required yet** |
| **C6**  | Renovate lock-file maintenance     | ✅ plus majors-behind-approval replacing the global flag                 |
| **C7**  | One Node version                   | ✅ `.nvmrc` at an exact `22.22.0`, read by all eight deploy workflows    |
| **C8**  | Mirror in sync                     | ✅ `check-mirror` in **all three** repositories, called at each release  |
| **C9**  | Backend deploy in a workflow       | — out of scope, #34/#35 remain open                                      |
| **C10** | Branch-floor loose ends            | ✅ #84 and #85 closed                                                    |
| **C11** | Refresh `the-gate-has-teeth.md`    | ✅ three false claims corrected in place rather than deleted             |

**C1 was the item to notice, and it closed last.** Work started at C2 and only
came back to it at the end of the day, so for a month RONL Business API's two
rulesets differed in a way nobody had decided — `main` carrying `deletion` and
`non_fast_forward` from the day it was created during the promotion, `acc`
carrying neither. Both now have all four rules.

**They still differ in exactly one parameter, deliberately:**

|        | `require_extra_approval_for_unattributed_changes` |
| ------ | ------------------------------------------------- |
| `acc`  | `true`                                            |
| `main` | **`false`**                                       |

`main`'s was set false on purpose: its promotion carried commits under three
author identities against a ruleset requiring **zero** approvals, so the flag
would have demanded an approval nobody could give. Preserved rather than
harmonised when `acc` was updated, and now recorded in that repository's
`SECURITY-PIPELINE.md` and `the-gate-has-teeth.md` as well, so the next person to
compare them does not read it as drift.

**Classic branch protection reports `allow_force_pushes: true` on both branches,
and that is not a hole.** It never was for `main` either. The ruleset's
`non_fast_forward` is what refuses the push; the classic setting is a vestigial
second layer that the effective-rules view sees past.

That distinction is why this row was checked with
`gh api repos/…/rules/branches/<branch>`, which reports the **effective** rules
from every ruleset at once. Reading one ruleset, or the classic protection
endpoint alone, gives the wrong answer — an earlier draft of this very section
claimed `acc` "can still be deleted", which the effective view disproved:
deletion was already blocked, by the classic layer rather than the ruleset.

---

## 1. Build provenance — which build am I looking at?

### The problem

Every changelog shows a version. That version is authored by hand at release
time, so it identifies a **release**, not a **build** of it:

- acceptance and production can serve **different builds of the same version
  string**, because they deploy from different branches at different times;
- **redeploying unchanged code** produces a new artifact carrying the identical
  version;
- a release can be rebuilt after a workflow change or a re-run of a failed job.

So "which build am I looking at?" was unanswerable from the running application —
which matters whenever an environment misbehaves and the first question is
whether it is serving what you think.

### Two values, not one

| value      | answers                               |
| ---------- | ------------------------------------- |
| commit SHA | _what source was built?_              |
| run number | _which build of that source is this?_ |

The SHA alone is a **code id**: two deployments of the same commit share it. The
run number is what makes the pair unique per artifact. This is why a SHA without
a run number renders as untracked rather than shown.

### What it looks like

One small monospace line under the changelog heading:

```
build 570fd98 · #412
```

The full 40-character SHA is on the `title` attribute so it can be copied for a
lookup. With nothing injected it reads `local build` — never blank, never
resembling a deployed artifact when it is not one.

### Four decisions worth keeping

**A separate module, not logic in the component.** The fallback rules become
testable without rendering anything.

**The environment is read inside the function, never captured at module scope.**
A module-scope capture is evaluated once at import and cannot be stubbed per
test, leaving the fallback path untestable.

**Half-configured counts as untracked.** A run number with no SHA renders
`local build`, not `#412` — a run number with no commit behind it implies a
provenance the bundle does not have. Blank and whitespace-only values are treated
as absent, because Vite substitutes an empty string rather than `undefined` in
some configurations.

**Nothing is derived from git at build time.** No `git rev-parse` in a build
script. In two of the three applications the build runs inside a container where
neither `git` nor `.git` is guaranteed to exist, and a build id that silently
fails to resolve is worse than none — **it lies**.

### Where the three differ

|                       | ttl-editor           | linked-data-explorer  | ronl-business-api                         |
| --------------------- | -------------------- | --------------------- | ----------------------------------------- |
| language              | JavaScript           | TypeScript            | TypeScript                                |
| monorepo              | no                   | yes                   | yes                                       |
| changelog UI          | tab                  | full page             | lazily-loaded drawer                      |
| **who builds**        | Oryx (SWA container) | **the GitHub runner** | **the GitHub runner**                     |
| **`env:` belongs on** | the deploy step      | the **build** step    | the **build** step                        |
| string lands in       | —                    | main `index-*.js`     | a lazy `ChangelogPanelContent-*.js` chunk |

**The `env:` placement is the difference that matters**, and getting it wrong
produces a change that passes every test and puts nothing in the artifact.

RONL Business API builds on the runner: the workflow runs `npm run build:acc` as
its own step and passes `skip_app_build: true`, so the variables belong on that
step. Linked Data Explorer moved to the same shape under
[#119](https://github.com/sgort/linked-data-explorer/issues/119), and the
variables moved with the build. ttl-editor still hands the build to Oryx via
`app_build_command`, so there is no build step at all — the variables go on the
**deploy** step, which is where the Static Web Apps action picks up the runner
environment to forward into its container.

### `github.sha` on a pull request

On a pull request `github.sha` is the **merge commit GitHub synthesises**, not
the head of the branch. The SHA on a preview deployment therefore matches no
commit in the branch and cannot be found with `git log`. This is correct — that
synthesised commit is what got built. On a push it is the real commit.

Observed, not assumed:

|                      | preview (synthesised)  | after merge (real)     |
| -------------------- | ---------------------- | ---------------------- |
| ronl-business-api    | `build 1224298 · #265` | `build 66940d9 · #266` |
| linked-data-explorer | `build b669689 · #186` | `build 9db0ab3 · #188` |

### How to verify a change to this

A build-time injection is exactly the kind of change that passes unit tests and
ships an artifact containing nothing. Unit tests alone are insufficient:

```bash
# injected
VITE_BUILD_SHA=<40-char-sha> VITE_BUILD_RUN=412 npm run build:acc
grep -rl "<40-char-sha>" dist/        # expect a match

# clean
rm -rf dist && npm run build:acc
grep -rq "<sha-prefix>" dist/ && echo BAD || echo good
grep -rl "local build" dist/assets/   # expect a match
```

Grep the whole of `dist/`, not just `index.js` — in RONL Business API the
changelog is code-split, so the string lands in a separate chunk and grepping the
entry bundle looks exactly like failure. Confirm the chunk hash changes between
the two builds; if it does not, the second build did not run.

### Exercised, at last, in two of the three

**ttl-editor ran its production workflow on 2026-09-09** and the Changelog tab
renders a real build id. That was the first execution of any of these `env:`
blocks in production, and it is the only evidence that the placement is right:
until a workflow runs, a correctly-written block and an unreachable one look
identical.

It closes as a gap rather than as a formality, because the promotion that carried
it was also the Create React App to Vite cutover. `output_location` moved from
`build` to `dist` in the same commit as the build script, which is what the ACC
workflow's own comment insists on — a stale value there "uploads an empty
directory and reports SUCCESS". Promoting the migration in parts would have
separated them.

Verified in the order that distinguishes the failure modes: the build id first
(`local build` would mean the block never reached Oryx), then a hard refresh (the
lazy chunks 404 if `output_location` is wrong), then a DMN round trip against the
production backend.

**Linked Data Explorer followed the same day**, promoting `acc` to `main` and
publishing nineteen changelog entries at once — ten weeks, `1.9.9` to
`2026.09.2`. Its production changelog now reads `build 007b350 · #39`, confirmed
by eye rather than inferred from a green workflow. v2026.09.3, promoted on
2026-09-11, moved production to `build 35a44f8 · #41` — so far verified from the
deploy log's injected `VITE_BUILD_SHA` and `VITE_BUILD_RUN`, not yet by eye,
which by this section's own argument is the check that counts.

Two things that repository's run adds to ttl-editor's:

- **The pair is what makes it a build id.** `007b350` is the merge commit of the
  promotion pull request, and `#39` is the run that built it. A redeploy of that
  same commit would produce `#40` — which is the whole reason the run number is
  carried alongside the SHA rather than the SHA alone.
- **Reading the changelog is the check; a green deploy is not.** The workflow
  succeeds identically whether the `env:` block reached the artifact or not. That
  is the same asymmetry as ttl-editor's `output_location`: the failure mode is a
  successful-looking deploy of something wrong.

**Exercised in the third on 2026-09-12**, and in a fourth surface with it. RONL
Business API promoted `acc` to production for the first time since 17 July, and
its caseworker changelog now reads `build 04840ed · #12` — confirmed by eye, not
inferred from a green deploy. Its public site, which gained the same treatment in
the same release, reads `publiek.open-regels.nl · v2026.09.6 · build 04840ed · #2`
in its footer.

Two details that only a first run surfaces:

- **The same commit, two run numbers.** `#12` and `#2` are different workflows
  deploying the same merge commit, which is exactly why the run number is carried
  alongside the SHA: the pair identifies an artifact, the SHA alone identifies
  source that several artifacts share.
- **The public site's footer is client-rendered.** Its prerendered HTML carries the
  route's data but no footer at all, so grepping the served HTML for the build id
  finds nothing while the entry bundle contains it. Grep the bundle, or read the
  page in a browser; a prerendered-HTML grep is the wrong probe and reads as
  failure.

### A post-deploy check has to know which build answered

Everything above concerns the frontends. The backends report a **release**, not
a build: `/v1/health` returns the hand-authored `version` from `package.json`,
so every deploy between two releases answers with the same string. On
14 September Linked Data Explorer's acceptance backend reported `2026.09.4` with
an uptime placing its start after #121's deploy — the string the build before it
had reported too.

That stopped being academic the same day.
[linked-data-explorer#123](https://github.com/sgort/linked-data-explorer/pull/123) added a step to both backend
deploy workflows that fails unless `/v1/health` reports `shacl.complete: true`.
Its first run, on acceptance, failed a sound deploy:

| step                                                         | UTC      |
| ------------------------------------------------------------ | -------- |
| _Deploy to Azure Web App_ finished                           | 10:21:15 |
| _Health check_ passed                                        | 10:21:36 |
| SHACL check gave up: `shacl.complete` null, 3 attempts, 34 s | 10:22:10 |
| new build started (uptime 163 s at 10:25:07)                 | 10:22:24 |

`null` meant a response with no `shacl` block at all — **the previous build,
still answering.** The existing _Health check_ step had passed against it, and
always would: it asks for HTTP 200, which either build returns.
[linked-data-explorer#124](https://github.com/sgort/linked-data-explorer/pull/124) widened the wait to 12 attempts,
15 s apart. The production deploy then logged four
`Attempt n/12: shacl.complete is null` lines before
`✅ SHACL shape layers all loaded`, about a minute after Azure reported the deploy
done. The 34-second window would have failed production exactly as it failed
acceptance.

Two things to carry:

- **A deploy action returning is not the new build serving.** App Service kept
  the old process answering for a minute or more while the new one started. A
  check that runs straight after the deploy step is checking the old build,
  unless it can tell the two apart.
- **Waiting for a field is a proxy.** It works only while the old build lacks the
  field. The next deploy's old build has it, so a pass there proves nothing about
  which build answered — the acceptance redeploy of #124 passed on its first
  attempt, and cannot say which build it read. The exact form is a `build` block carrying the
  commit SHA, asserted against the SHA the workflow deployed:
  [linked-data-explorer#122](https://github.com/sgort/linked-data-explorer/issues/122) for the workflow-deployed
  backend, [ronl-business-api#129](https://github.com/sgort/ronl-business-api/issues/129) for the script-deployed
  one, which must also refuse to deploy a commit GitHub does not have.

---

## 2. Supply-chain verification — is the pin telling the truth?

### What zizmor cannot do

zizmor validates pin **format**: it confirms that a `uses:` names a 40-character
commit SHA. It cannot say the SHA is the **right** one. A wrong — or hostile —
digest carrying a plausible `# v7.0.1` comment passes zizmor, Prettier and human
review alike, because nothing re-resolves the reference.

`scripts/check-supply-chain.mjs` closes two gaps:

1. **Pin truth** — each digest is resolved against the GitHub API and compared
   with the version its trailing comment claims. The comment is not decorative:
   Renovate reads and rewrites it, and reviewers trust it. If comment and digest
   disagree, one of them is lying.
2. **Register agreement** — the `Pinned` table in `SECURITY-PIPELINE.md` is
   compared with the workflows: digests, versions, `(×N)` multiplicities, and the
   totals headline where one exists.

The script originates in ttl-editor and is copied verbatim into the other two.
All three run identical logic; the checkouts differ only in line endings.

### Where it runs

|                      | step present | blocking | pinned refs            |
| -------------------- | ------------ | -------- | ---------------------- |
| ttl-editor           | ✅           | ✅       | 11 across 3 workflows  |
| linked-data-explorer | ✅           | ✅       | 23 across 7 workflows  |
| ronl-business-api    | ✅           | ✅       | 31 across 10 workflows |

It is a **step in the existing `audit` job**, never a new job. The rulesets
require the status check named `audit` — the job, not any individual step — so a
step is covered automatically, whereas a new job would need adding to the ruleset
first and would silently not block until someone did.

### The habit this depends on

**Renovate does not maintain the register.** It rewrites workflow pins and their
version comments together, honestly and correctly, and never touches
`SECURITY-PIPELINE.md`. So every action-bump pull request leaves the register
describing a policy the workflows no longer follow.

That was predicted to be harmless, on the reasoning that Renovate moves digest
and comment together so pin truth still holds. **Pin truth does hold. Register
agreement does not.** Verified against a real Renovate pull request:

```
[register] actions/checkout: workflow pins 3d3c42e5aac5… (v7.0.1) but
           SECURITY-PIPELINE.md records only 11d5960a3267… (v4.4.0), a37ce9120846… (v3.7.0)
```

The check is right; the register is stale. The answer is a habit, recorded in
each `SECURITY-PIPELINE.md`:

> **When a Renovate pull request bumps an action, update the register on that
> pull request's branch, before merging it.**

Not afterwards. The check runs on the pull request, so a register fixed after the
merge leaves the check red for that pull request's whole life — and makes the
step impossible to promote to blocking, because no bump could ever present a
green result to merge on.

Exercised twice in Linked Data Explorer before that repository promoted its step
to blocking. In each case the register moved on the bump's branch, the check went
green there, and the pull request merged green.

A third time on 14 September, after it blocked: [linked-data-explorer#104](https://github.com/sgort/linked-data-explorer/pull/104)
moved `zizmorcore/zizmor-action`, and its `audit` failed on register agreement
alone — pin truth held. The row was updated on the bump's branch, the check went
green there, and it merged green. That is the habit working, and also the
reminder that it is still a habit: the row had to be written by hand.

A fourth time the same evening, in ttl-editor:
[ttl-editor#141](https://github.com/sgort/ttl-editor/pull/141) moved
`zizmorcore/zizmor-action` to v0.6.3, failed `audit` on register agreement alone,
and merged green once the row moved on its own branch.

### What the register check cannot see

`check-supply-chain` reads `uses:` lines. A pin that is not on a `uses:` line is
outside it, and one of those turned out to be maintained by Renovate while both
registers said it was not.

zizmor's version is the `version: '1.29.0'` **input** to `zizmor-action`. Both
registers recorded it as bumped by hand, on the reasoning that Renovate's
`github-actions` manager does not parse action inputs. For this action it does:
`known-actions.ts` in Renovate maps `zizmor-action` to the Docker image
`ghcr.io/zizmorcore/zizmor`, and both Dependency Dashboards listed
`ghcr.io/zizmorcore/zizmor 1.29.0` with 1.30.1 queued. Corrected in
[ttl-editor#144](https://github.com/sgort/ttl-editor/pull/144) and
[linked-data-explorer#139](https://github.com/sgort/linked-data-explorer/pull/139).
RONL Business API's register, checked on 15 September, makes the same claim, in
`SECURITY-PIPELINE.md` and in the comment above the input in `zizmor.yml`, and its
Dependency Dashboard lists the same `ghcr.io/zizmorcore/zizmor 1.29.0` with 1.30.1
queued. It is not corrected yet (§6).

The rule is the same in both repositories, and it plays out differently:

- **The action and the input must move together.** `zizmor-action` runs only the
  zizmor versions in its own digest table, and 1.30.1 is in v0.6.4's table, not
  v0.6.3's. A zizmor bump merged ahead of the action fails `audit` at "Run
  zizmor".
- **ttl-editor has no `github actions` group,** so the two arrive as separate pull
  requests, and the `zizmor-action` one has to merge first.
- **Linked Data Explorer groups them.** Its `github actions` group collects minor,
  patch and digest updates for every `github-actions` dependency, the zizmor image
  included, so both normally arrive together. Not always: each clears the 14-day
  cooldown on its own clock, and zizmor publishes before the action release that
  adds it — 1.30.1 six minutes before v0.6.4 — so a group branch can briefly hold
  the image update alone. A major zizmor release leaves the group to wait for
  approval, and then needs the action first, as in ttl-editor. RONL Business API
  has the same group, and behaves the same way.
- **The rows are still a hand step in both.** Nothing fails when the zizmor row
  goes stale, which is how both came to say "manual" with an update queued.

The cheap lesson: **read the Dependency Dashboard's detected dependencies before
recording that Renovate cannot see something.** That list shows what each manager
actually extracted, file by file.

### All three now block — and the last one is the clearest evidence why

RONL Business API adopted the check non-blocking and promoted it on 12 September
2026 ([#83](https://github.com/sgort/ronl-business-api/issues/83)). It was
waiting on one thing: evidence that the register gets updated on a bump's **own
branch** rather than after the merge — the habit §"The habit this depends on"
describes. Its own Renovate bump supplied it, and the same pull request supplied
the argument against waiting any longer.

**`continue-on-error` hides more than it looks like it hides.** It does not
merely keep the job green — it rewrites the **step's** reported conclusion too,
and the honest result (`outcome: failure`) is not exposed by the REST API at all.
Observed on that pull request, before its register was fixed:

```
job: audit
job conclusion: success
step: Verify pin truth and register agreement -> success
```

…while that same step's log read:

```
1 finding(s):
  [register] zizmorcore/zizmor-action: workflow pins cc914d7f3750… (v0.6.4)
             but SECURITY-PIPELINE.md records only 3dc1ecc9bcb9… (v0.6.2)
```

The checks list, the job and the step all said success. **Only the log told the
truth.**

A check nobody can see fail is not protecting anything; it is a check that has to
be _remembered_, which is the condition the registers drifted in to begin with.

**If the network half ever proves flaky, the remedy is `--offline`**, which keeps
register agreement blocking and drops only the half that resolves digests against
the GitHub API. Restoring `continue-on-error` is not a remedy — it restores the
invisibility above.

### A deploy credential can be wrong in a way nothing names

Not a pin problem, but it belongs beside them: it is how a credential reaches CI,
and the failure it produces points nowhere near the cause.

RONL Business API lost a production deploy to this on 2026-09-12. The documented
way to read a token out of Azure is `-o tsv`, and the documented way to set a
secret without it passing through shell history is to pipe into `gh secret set`.
Composing the two stores a **trailing newline**: 120 bytes where the key is 119.

Every build step then passes, and the Static Web Apps action fails with:

```
DeploymentId: 61da559c-1017-42cc-8ad9-24951f2932ce
An unknown exception has occurred
```

No mention of authentication, of the token, or of the target app — and the
DeploymentId printing first suggests the upload began and Azure failed, which
sends you to inspect the resource rather than the secret. Re-setting the same
value through `tr -d '\r\n'` fixed it with no other change.

The general shape is worth carrying: **a secret cannot be read back to be
checked.** Nothing in review, in the workflow, or in the run log can show that a
stored credential differs from the intended one by one invisible byte. Either
strip whitespace at the point of setting, or wrap it in a helper that always does
— documenting the trap is the weakest of the three.

### The dependency this accepts

Where the step blocks, a network call now sits inside a required job — a GitHub
API outage or rate limit can fail a gate unrelated to the change under review. It
is a handful of calls against a public API, deduplicated per action and version,
and transport failure is reported as a finding rather than passing quietly.

If it proves flaky, the answer is `--offline`, which keeps register agreement
blocking and drops only the network-dependent half. **Not `continue-on-error`**,
which reinstates the invisibility above.

### A shape worth knowing about

An action may legitimately be pinned at **more than one digest** — different
workflows mid-upgrade — and a good register records every one. The check matches
register rows by digest precisely so a split pin stays expressible. Keying by
action alone was a real defect: the second row overwrote the first and every
workflow on the other digest read as disagreeing. Do not collapse such rows to
tidy a table.

### The other supply chain: the npm tree

`check-supply-chain` verifies that **GitHub Actions** digest pins resolve to the
versions their comments claim. It says nothing about the packages in
`package-lock.json`. Neither does zizmor, nor the coverage floor. So across all
three applications, npm dependency vulnerabilities were remediated by Renovate
and verified by nobody — a bot being trusted rather than a gate being enforced,
and the difference only shows on the day the bot is wrong or stalled.

That sentence was written as if Renovate maintained the whole tree. **It
maintains direct dependencies.** The transitive tree moves only through
`lockFileMaintenance`, which `config:recommended` leaves disabled — and in Linked
Data Explorer the day the bot was wrong had already come and gone unnoticed. See
"Renovate maintains dependencies, not the tree" below.

ttl-editor closed that in September 2026 with a `Semgrep` workflow whose `scan`
job is a required check alongside `audit`. It runs Semgrep Code and Supply Chain
against an authenticated scan, reporting to the `sgort/ttl-editor` project in
Semgrep Cloud. Linked Data Explorer adopted the same workflow on 11 September
2026, ran it as a reporting check while the baseline was triaged, and required it
on both `acc` and `main` the same day — the difference from ttl-editor being that
its `main` was already gated.

**RONL Business API adopted the same workflow on 12 September 2026**, and is the
one place to look for what the first day actually costs: its first full scan
found **435 findings, none policy-blocking** — 249 reachable, 101 undetermined
and 69 unreachable Supply Chain findings across 1,266 npm dependencies, plus 16
Code findings. `scan` is deliberately **not** a required check there while that
baseline is triaged; promotion is a ruleset edit, reversible without touching the
file. Note the order that implies: lock-file maintenance first, since one refresh
closed 63 of 66 Supply Chain findings here, and triaging by hand before
refreshing would be work thrown away.

**It went that way.** RONL Business API's first lock-file maintenance
([ronl-business-api#134](https://github.com/sgort/ronl-business-api/pull/134), 14 September) took the scan on `acc` from 435
findings to **25**, with no manifest change:

|                            | before (`6fad207`) | after (`08116a3`) |
| -------------------------- | ------------------ | ----------------- |
| Supply Chain, reachable    | 249                | 0                 |
| Supply Chain, undetermined | 101                | 6                 |
| Supply Chain, unreachable  | 69                 | 3                 |
| Code                       | 16                 | 16                |

The same count stood on `e187086` on 15 September. Open Dependabot alerts went
from 154 to 7, and none of the seven can be closed by a routine update. The 16 Code
findings are untouched. `scan` was made a required check on `acc` on 19 September
2026, under #119, with the 25 still to triage: none is policy-blocking, so it
blocks only new blocking findings and a scan that cannot run.

Three things differed when it was ported to Linked Data Explorer, a monorepo:

- **One job still covers everything.** All three workspaces resolve through the
  single root `package-lock.json`, so Supply Chain reads one lockfile and there is
  no per-workspace fan-out to keep in step with the workspace list.
- **The same `examples/` trap, independently present.** A root `examples/` holds
  reference material, and `packages/frontend/public/examples/` is served — Vite
  copies `public/` into the build. The ignore rule is `/examples/`, anchored, for
  exactly the reason ttl-editor learned the hard way.
- **Its sibling workflows all cancel in progress unconditionally.** `semgrep.yml`
  uses their group key but cancels only on `pull_request`, because a cancelled
  push run leaves the Semgrep Cloud baseline half-written.
- **A `.semgrepignore` replaces Semgrep's built-in default ignore list; it does
  not extend it.** The defaults exclude `test/` and `tests/` directories, and
  the first version of this file silently brought 16 files under
  `packages/backend/tests/` and `packages/frontend/src/test/` back into scope.
  The finding count came out exactly as predicted either way, because none of
  them happened to trip a rule — only diffing the scanned file sets showed it.
  ttl-editor has no such directories today, so its file is unaffected, but it
  would be the day one is added.

Its first full scan in CI, on `4d4d46d`, found **76** findings, none blocking:
66 Supply Chain and 10 Code, after the `.semgrepignore` had taken out 6 in test
files and 4 under `examples/`. It closed the day at **4**:

| step                                                                                                     | findings | how                                                                                                                                                   |
| -------------------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| first full scan                                                                                          | 76       | 66 Supply Chain, 10 Code                                                                                                                              |
| lock-file maintenance ([linked-data-explorer#92](https://github.com/sgort/linked-data-explorer/pull/92)) | 13       | Supply Chain 66 → 3; one refresh, no manifest change                                                                                                  |
| triage hardening ([linked-data-explorer#95](https://github.com/sgort/linked-data-explorer/pull/95))      | 5        | Code 10 → 2: one fix retired a finding, seven carry a scoped `nosemgrep` with its reason, and a latent defect nobody had flagged was fixed on the way |
| last false positive, suppressed in code                                                                  | 4        | Code 2 → 1: `insecure-object-assign` given a scoped `nosemgrep` with its reason, rather than a dashboard ignore                                       |

The one Code finding left is a true positive — the Tailwind Play CDN running from
a third-party origin in production
([linked-data-explorer#96](https://github.com/sgort/linked-data-explorer/issues/96))
— and it will clear because the script is removed, not because anything is
suppressed.

**Every suppression here lives in the code, none in the dashboard.** All eight
false positives carry a scoped `nosemgrep` naming the single rule, on the single
line, with the reason directly above it: four `cors-permissive-express` on the
two deliberately public endpoints, three `detect-non-literal-regexp` on RegExps
whose interpolated name is now a closed TypeScript union, and one
`insecure-object-assign` whose only caller passes the literal
`{ lastRun: <timestamp> }`. The last was first proposed as a dashboard ignore and
moved into the code instead.

ttl-editor first made the other choice for four of its six, and it worked — those
dashboard ignores survived two line shifts without re-triage. The difference is
where the reasoning lives. A `nosemgrep` travels with the line, is visible in
review, and survives the Semgrep project being recreated. A dashboard ignore is
platform state: nobody reading the file can see it, and it is lost with the
project.

ttl-editor moved all four into the source on 15 September 2026
([ttl-editor#144](https://github.com/sgort/ttl-editor/pull/144)). Two were
`prototype-pollution-loop` in `iknowParser.js`, and each took a scoped
`nosemgrep`. The other two were `renovate-missing-minimum-release-age` on
`renovate.json`. That file is JSON and cannot carry a comment, and this page used to
cite it as the case with no alternative. It had one. The rule checks each
`packageRules` entry that matches by `matchPackageNames` on its own and ignores the
top-level `minimumReleaseAge`, so both major holds now state
`"minimumReleaseAge": "14 days"` themselves — the fix the rule asks for. Semgrep
closed those two as fixed, not muted.

**The dashboard and the CLI count different things.** Throughout, ttl-editor's CI
log read `Findings: 0 (0 blocking)` while the dashboard's scan list showed 4 Code
findings on every full scan of `acc`. The list counts findings ignored in the
dashboard, and the CLI's summary does not. After #144 the list reads 0 on `acc` and
on `main`. The findings API is what told the two apart: its `ignored_app` state held
exactly those four.

Each comment also says **when it stops being true**. `insecure-object-assign` is
safe because of its current caller, not because of the line, so its comment ends
"revisit if `updateTestCase` ever receives imported or URL-supplied data". The
same shape runs through this triage and ttl-editor's: safe because of today's
wiring, not because of the function. A suppression that states only why it is
fine today reads as settled long after it has stopped being so. The three Supply Chain findings
are bound by a tilde range in `express` (`qs`) and by a major version
(`@tiptap/core`), and cannot be closed by a refresh.

**Only CI's reachability can be trusted.** The local dry run reported every one
of the 66 as `reachable: false`, and this page repeated that as "all transitive
and unreachable". The CI scan classified the same 66 as **5 Reachable, 23
Undetermined and 38 Unreachable** — and the five reachable ones were all HIGH.
The local JSON's `reachable` field stayed `false` even where a reachability rule
existed, and the Pro engine was installed locally too, so that is not the
difference. Why the two disagree was not established. What was: a local
`--dry-run` is fine for Code findings and for checking what an ignore file
excludes, and not for deciding whether a Supply Chain finding matters.

#### Renovate maintains dependencies, not the tree

When Linked Data Explorer's `scan` first ran, `rollup` was still at 4.55.1, where
it had sat since January although 4.59.0 was published in February. Two separate
failures had stacked:

- **`lockFileMaintenance` was not enabled until 2026-08-29.** Before that, nothing
  refreshed a transitive dependency at all — Renovate's recommended preset leaves
  it off, and it only ever proposes the packages a manifest names.
- **Once enabled, it was starved.** `prConcurrentLimit: 5` was full of open
  feature bumps, two of them eleven days old, so all three lock-file-maintenance
  branches sat in the Dependency Dashboard as rate-limited. Nothing appeared until
  they were forced by hand.

When it finally ran, **one refresh closed 63 of 66 Supply Chain findings**,
including all five reachable ones, every fix inside a range the manifests already
declared. It arrived as three identical pull requests, because per-workspace
group rules without `matchUpdateTypes` catch lock-file maintenance too, and CI
built and tested none of them: all three acceptance workflows are path-filtered to
their own package, and the root `package-lock.json` is in none of those filters.
Both gaps are
[linked-data-explorer#97](https://github.com/sgort/linked-data-explorer/issues/97),
closed the same day:

- **The root `package-lock.json` and `package.json` are now in all four
  deploy workflows' filters**, acc and production, push and pull request. A
  lockfile-only change is built, tested and deployed like any other, and a
  lockfile-only promotion redeploys production instead of leaving it on the
  previous tree.
- **The per-workspace group rules list every update type except
  `lockFileMaintenance`**, so one refresh is one pull request. Lock-file
  maintenance's own default is `groupName: null`; the rules were overriding it.
- **Lock-file maintenance has `prPriority: 10`** — which turned out to be the
  weaker half. Priority only orders branches eligible in the same run, and
  lock-file maintenance is eligible only inside its Monday schedule. Within
  minutes of two Renovate pull requests being merged to free slots, an unrelated
  update took one and three more were queued for the other, all eligible any
  day. Priority alone would never have kept a slot for Monday.
- **Major updates now need Dependency Dashboard approval**, recorded at the time
  as what keeps it. It does not; see below. The queue competing with lock-file maintenance was almost entirely
  majors — `npm` 12 and two workspace major groups — which nobody merges on
  autopilot anyway. Behind approval they wait as checkboxes and hold no slot.
  `vulnerabilityAlerts` sets `dependencyDashboardApproval: false` explicitly, so
  a security fix that happens to be a major version never waits on a click.

Three things were observed rather than predicted once these landed:

- **The dashboard confirmed the grouping fix before any scheduled run did.** It
  listed one lock-file-maintenance entry where it had listed three, and the two
  workspace major groups moved under _Pending Approval_, holding no slot. The
  dashboard reflects the branches Renovate computes from the current config, so
  this is evidence rather than hope.
- **The widened filters worked in both directions on their first two pull
  requests.** A frontend-only dependency bump ran the backend job, and a
  backend-only bump ran the frontend build — each testing the app its shared
  lockfile could move, where the old filters would have tested one.
- **A pull request landed in the gap before the rule did.** `npm` 12, a major,
  was opened seven minutes before the approval rule merged and took the last
  free slot, putting the queue back at five of five. It was closed with that
  reason, leaving four of five and lock-file maintenance as the only update
  waiting. A rule that gates new pull requests does nothing for one already
  open.

**Approval alone did not keep the slot, and a scheduled run proved it.** RONL
Business API copied both safeguards, and its first scheduled lock-file maintenance,
on Monday 14 September, opened nothing; its Dependency Dashboard listed it as
rate-limited. Renovate's concurrent count includes every open Renovate pull
request, security ones included — only the limit check itself is skipped for
them — and seven open security pull requests exceeded the limit of 5 before any
routine update was counted. Linked Data Explorer's Monday window passed the same
way, and its dashboard listed the branch as rate-limited the next day. ttl-editor
got its refresh that Monday with one pull request open.

The fix in all three exempts that one branch: `prConcurrentLimit: 0` and
`prHourlyLimit: 0` on the lock-file maintenance rule. Renovate reads the limit per
branch from the upgrades inside it (`calcLimit`) and treats 0 as no limit, and the
branch holds exactly one upgrade, so nothing else inherits it
([ronl-business-api#133](https://github.com/sgort/ronl-business-api/pull/133),
[linked-data-explorer#138](https://github.com/sgort/linked-data-explorer/pull/138),
[ttl-editor#145](https://github.com/sgort/ttl-editor/pull/145)). Majors stay behind
approval, for their own reason.

Two more gaps in the same configuration surfaced in RONL Business API the same
evening, and neither is about the tree:

- **Below 1.0.0 a minor is a major in all but name.** Renovate classifies `0.4` →
  `0.5` as minor, so `eslint-plugin-react-refresh` 0.5, which requires ESLint 9
  and flat config, arrived as a routine update and failed `audit`, both previews
  and its lockfile update. It was closed, and minor updates of pre-1.0 packages
  now wait for approval ([ronl-business-api#142](https://github.com/sgort/ronl-business-api/pull/142)). Linked Data Explorer, with
  four direct pre-1.0 dependencies, took the same rule in #138; ttl-editor has none.
- **`rangeStrategy: bump` rewrites `engines` too.** A Node update raised
  `engines.node` to `>=22.23.2`, and another raised `engines.npm` to `>=10.9.9`,
  a floor no Node 22 release satisfies. Nothing enforces `engines`, so a raised
  floor only produces `EBADENGINE` warnings. `rangeStrategy: widen` for
  `engines` leaves a satisfied range alone ([ronl-business-api#146](https://github.com/sgort/ronl-business-api/pull/146)). Linked
  Data Explorer had already been raised to `>=10.9.9` and was restored in #138;
  ttl-editor has no `engines` field.

The cost of the first change is Static Web Apps previews: every lockfile pull
request now holds one on the acceptance app. That is affordable here and would
not be everywhere. Linked Data Explorer's frontend apps are on the **Standard**
plan, 10 staging environments per app, so `prConcurrentLimit: 5` leaves five for
people. ronl-business-api's acceptance frontend was on **Free**, 3 per app — the
ceiling five pull requests exhausted on 2026-08-28, and why its fix went the other
way: narrowing the filter, not widening it. It has since moved to Standard, read
from Azure on 15 September; its production frontend is still Free. **Check the plan before copying this
filter change**, and size the Renovate cap against the slots, not the other way
round.

**ttl-editor had no `lockFileMaintenance` at all**, and that turned out to be
the whole explanation for its seven residual Supply Chain findings, which
[ttl-editor#112](https://github.com/sgort/ttl-editor/issues/112) had put down
to needing an upstream release. It was checked before anything changed: in a
scratch worktree, an in-range refresh and a Semgrep scan predicted 7 → 0.
[ttl-editor#134](https://github.com/sgort/ttl-editor/pull/134) enabled it with the
same two safeguards as here — `prPriority`, and majors behind Dependency Dashboard
approval — and the first refresh,
[ttl-editor#135](https://github.com/sgort/ttl-editor/pull/135), delivered exactly
the predicted versions: 202 packages moved, none within the cooldown, `package.json`
untouched, scan on `acc` at 0. ttl-editor needed neither of this repository's
other two fixes: its deploy workflows filter with `paths-ignore` for documentation
only, so a lockfile change already builds and deploys, and as a single package it
has no group rules to multiply the pull request.

**The same check found that npm 10 cannot perform that refresh.** npm 10.9.4,
bundled with Node 22, crashes in its resolver — `Cannot read properties of null
(reading 'edgesOut')`, in `#loadPeerSet` while walking `vitest`'s optional peer
chain, `jsdom` to `canvas` — on both a from-scratch resolution and `npm update`.
npm 11.19.1 resolves the same tree cleanly, and so did Renovate. `npm ci` is
unaffected because it only installs from the lockfile, and CI runs Node 24, so
the failure lands only on a workstation running Node 22 that tries to add or
update a package. ttl-editor's README now says to use Node 24 / npm 11.

|                     |                                                                       |
| ------------------- | --------------------------------------------------------------------- |
| Workflow            | `.github/workflows/semgrep.yml`                                       |
| Job / check context | `scan`                                                                |
| Trigger             | `pull_request` unfiltered, `push` on `acc` and `main`                 |
| Scanner             | `semgrep==1.176.1`, hand-pinned, registered in `SECURITY-PIPELINE.md` |
| Auth                | `SEMGREP_APP_TOKEN` repository secret, Agent (CI) scope               |

#### Four decisions worth keeping

**A separate workflow, not a step in the audit job.** `audit` is already a
required check, so a step there would have been blocking from the day it merged.
A separate workflow reports on every pull request and gates nothing until its
job is added to the ruleset — which makes promotion a ruleset change, reversible
without touching the file. `continue-on-error` is the obvious alternative and is
the wrong tool for the reason §2 already records.

**The token is not optional.** Semgrep Supply Chain resolves only on an
authenticated scan. An unauthenticated `semgrep scan --config=p/…` gets the
open-source SAST rules and no SCA at all, which would omit the entire reason the
job exists.

**`--no-suppress-errors`.** By default `semgrep ci` prints _"there were errors
during analysis but Semgrep will succeed"_ and exits 0. That default is exactly
how a broken local install went unnoticed for weeks: the scan crashed on a
missing `git` binary and still reported success. In CI, a tool that cannot run is
a failure.

**`concurrency` cancels superseded pull-request runs but never a `push` run.**
The push runs on `acc` and `main` write the Semgrep Cloud baseline; cancelling
one leaves the dashboard describing a scan that never finished, with nothing
queued to correct it.

#### The finding count is not the measure

The triage that produced this gate
([ttl-editor#112](https://github.com/sgort/ttl-editor/issues/112)) opened by
reporting **36 findings**, closed at **7**, and reached **0** once its lockfile was
first refreshed. Almost none of that movement was
vulnerabilities being fixed:

|     |                                                                     |
| --- | ------------------------------------------------------------------- |
| 36  | scanned against a local checkout 51 commits behind `origin/acc`     |
| 17  | the real figure on the branch head — Renovate had already closed 19 |
| 14  | `examples/` excluded; reference material is not application code    |
| 16  | a new test file arrived carrying two more                           |
| 12  | test files taken out of Code scanning                               |
| 11  | after a fix, a suppression, and one finding that got worse first    |
| 7   | CI honours dashboard triage; a local `--dry-run` does not           |
| 0   | the lockfile finally refreshed — nothing had ever done so (#135)    |

Three lessons generalise beyond this repository, and are the reason this section
records the trajectory rather than only the endpoint:

**A scan run by hand is pinned to whatever is checked out.** Nothing in
`semgrep ci` output names the commit it describes. The first triage described a
lockfile drift that did not exist, because `node_modules` had been installed from
one ref and `package-lock.json` read from another. A scan in CI cannot make that
mistake, and that — not any individual finding — is what the gate buys.

**"The finding will go away" is a prediction, not a plan.** Three fixes were
justified partly on retiring a finding. None did. `prototype-pollution-loop`
matches the _shape_ of a loop, not whether its keys are guarded; one fix made its
own finding fire twice. Verify after, not before.

**Check the set, not the total.** A `.semgrepignore` entry of `examples/` rather
than `/examples/` silently dropped a served `.dmn` file from the scan, because
`.gitignore` syntax matches a directory of that name at any depth. Both counts
read 14. Only set-differencing the scanned file lists caught it.

#### What remains, and what it costs

Nothing remains. The last seven findings — `brace-expansion`, `picomatch` and
`postcss-selector-parser`, transitive and reached only through build and test
tooling — were first written off as closable only by an upstream release or an
`overrides` entry. That was wrong: each had a newer version inside the range
already declared, and nothing had moved them because ttl-editor had no
lock-file maintenance. Its first refresh
([ttl-editor#135](https://github.com/sgort/ttl-editor/pull/135)) took them to
1.1.18, 2.3.2 and 6.1.4 and the scan on `acc` to **0 findings**. See "Renovate
maintains dependencies, not the tree" below.

Two costs come with making it required, both accepted deliberately:

- **Forked pull requests cannot pass it.** Secrets are not passed to fork runs,
  so `semgrep ci` cannot start and `--no-suppress-errors` fails the step. The
  repository has one fork, which has opened a pull request before. Accepted
  because the maintainer knows its author;
  [#128](https://github.com/sgort/ttl-editor/issues/128) tracks removing the
  edge. **Any repository adopting this without that luxury should do #128
  first.**
- **`bypass_actors` is empty and semgrep.dev is a third-party dependency in the
  merge path.** If it is unreachable, or the token is revoked, merges to `acc`
  stop until the ruleset is edited. `check-supply-chain` accepted an analogous
  risk for the GitHub API — but the GitHub API is a dependency of the platform
  anyway, and semgrep.dev is not. That is a genuinely new class of outage.

#### The tree on a workstation: nothing checked the install

CI installs with `npm ci` everywhere, so the tree that passes the tests matches
the lockfile. The tree a developer runs had no such guarantee. `git merge
--ff-only` brings lockfile changes and installs nothing, so a dev server starts on
whatever was installed last — and every scan above describes the lockfile, not
that tree.

Measured on one workstation on 14 September, after routine fast-forwards,
excluding optional packages:

|                      | installed at a different version | missing |
| -------------------- | -------------------------------- | ------- |
| linked-data-explorer | 152                              | 95      |
| ttl-editor           | 53                               | 86      |

All three now check at dev-server start —
[ronl-business-api#128](https://github.com/sgort/ronl-business-api/pull/128),
[linked-data-explorer#121](https://github.com/sgort/linked-data-explorer/pull/121) and
[ttl-editor#142](https://github.com/sgort/ttl-editor/pull/142) — with the same `scripts/check-deps.sh`
comparing `package-lock.json` against a snapshot written after each install.

Since the evening of 14 September it also runs first in each repository's
pre-push hook ([ronl-business-api#137](https://github.com/sgort/ronl-business-api/pull/137),
[linked-data-explorer#127](https://github.com/sgort/linked-data-explorer/pull/127),
[ttl-editor#143](https://github.com/sgort/ttl-editor/pull/143)). A push starts no
dev server, and RONL Business API showed why that mattered: a clone still on
Prettier 3.8.1 after the lockfile moved to 3.9.6 failed `check-format` on seven
correctly formatted files, and nothing in the output said the install was the
cause.

Four details decided whether it works:

- **Compare parsed JSON, ignoring the repository's own versions.** RONL Business
  API's first version compared bytes, and refused to start the dev servers after
  every release: a bump rewrites the root and workspace `version` fields in the
  lockfile and nothing else. Those describe what the repository publishes, not
  what is installed. Third-party versions and dependency lists are still
  compared, and parsing makes line endings irrelevant.
- **Name `npm ci`, not `npm install`.** `npm install` re-resolves the caret
  ranges and, with no package-manager cooldown, can pull a transitive version
  published that morning — ICTU's recommendations 3, 4 and 6, assessed in
  [`ICTU-dependencies-assessment.md`](ICTU-dependencies-assessment.md). RONL
  Business API's check had named `npm install`.
- **Write the snapshot in Node where a container you do not own installs.** It
  runs as `postinstall`, and Oryx runs `npm install` for both Static Web Apps
  builds it owns — Linked Data Explorer's frontend and ttl-editor — so the
  script runs inside the `staticappsclient` container, as both repositories'
  pull-request deploy logs show. That container runs npm, so it runs node;
  nothing promises it a shell. RONL Business API builds on the runner and keeps
  a bash snapshot.
- **A root `prepare` runs where root devDependencies are absent.** Linked Data
  Explorer's backend workflows run `npm ci` with `working-directory:
packages/backend`, which skips the root devDependencies but still runs the root
  lifecycle scripts. #121's first version replaced `husky install || true` with a
  bare `husky`, on the claim that husky was present wherever it ran; the backend
  deploy on that pull request failed with `sh: 1: husky: not found`, exit 127.
  `prepare` is now `husky || true` — husky 9 exits 0 on every path once it runs,
  so the `|| true` can hide only its absence.

Like `check-mirror`, it runs where the state it describes exists — on the
developer's machine — and gates nothing in CI. The first start after each merge
asks for `npm ci` once, because no snapshot has been written before.

---

## 3. The per-file 80% branch floor

### Why per file, and why branches

**Per file**, because a project average lets a well-tested utility pay for an
untested component. The branches that matter are precisely the ones nobody has
exercised, and an average is designed to hide them.

**Branches**, because statement and line coverage largely restate "was this file
imported", and function coverage rewards splitting code into more functions. A
branch is a decision the code makes; an uncovered branch is a decision no test has
ever checked.

### Three mechanisms, one policy

|                      | mechanism                             | state                |
| -------------------- | ------------------------------------- | -------------------- |
| ttl-editor           | native thresholds in one runner       | clean, no exemptions |
| linked-data-explorer | native thresholds in both runners     | clean, no exemptions |
| ronl-business-api    | native thresholds in all five runners | clean, no exemptions |

All three are now native. That is new: until `bd71dd9`, ttl-editor carried a
custom script instead, and the reason it had to is the part worth keeping.

### Why one repository needed a script first

**Vitest cannot express a partial rollout of this policy.** Its `thresholds`
block accepts glob keys that look like per-file overrides, but they are
_additive_ rather than overriding — from Vitest's own source, "Global threshold
is for all files, even if they are included by glob patterns". So a file matching
`'src/App.jsx': { branches: 34 }` is still measured against the global 80 as
well, and the build fails anyway. `perFile: true` is all-or-nothing, and
ttl-editor was not at 80% everywhere.

`scripts/check-branch-coverage.mjs` carried the gap as a `DEBT` list that worked
as a ratchet, tightening from both ends: below its pin a file failed; more than
`RATCHET_SLACK` (10 points) above its pin it failed too, asking for the pin to be
raised, so an entry could not quietly become permanent; at or above the floor it
failed asking to be deleted; and naming a file that no longer existed failed as
well.

The script's own header set out that it was temporary and named its own deletion
as the last step of the work rather than an afterthought. That is what closed
[ttl-editor#103](https://github.com/sgort/ttl-editor/issues/103): `DMNTab.jsx`,
the largest file in the repository at 1855 lines, went from 45.73% to **98.34%**
branch coverage (415/422), the last `DEBT` entry went with it, and the script was
deleted in favour of four lines of config.

Three things from that run are worth carrying:

- **The ratchet's upper bound fired for real**, once, on the way: an increment
  took `DMNTab.jsx` from a pin of 30 to 45.73%, more than `RATCHET_SLACK` above
  it, and the gate failed naming the new pin value. A ratchet that only catches
  regressions decays into an exemption list; this one did not.
- **Measure in isolation _and_ in the full suite.** Both readings were identical
  here, which is what proves no other file's tests were propping the number up. A
  per-file floor read only from a full run cannot tell the difference.
- **The last few branches are usually unreachable, and that is the honest place
  to stop.** Seven remain, all guards the UI cannot reach — `if (!uploadedFile)`
  under a button that only renders once a file exists, and three of the same
  shape. Chasing them would mean testing through the component's internals, and
  the file already documents them as defensive dead code.

### A per-file floor has a load cost, and it lands somewhere else

Not a threshold mechanic, but it surfaced on the same change and would surface on
any repository pushed to this floor.

Bringing one file to 80% meant 56 new tests, 680 → 736. The suite then began
failing intermittently — **in unrelated files**, a different one each run, always
passing in isolation. Not a defect in the new tests and not a defect in the old
ones: Testing Library's `findBy*` gives up after one second by default, and under
coverage instrumentation with every file running in parallel, a control that
appears in tens of milliseconds on an idle machine can take longer than that on a
saturated one.

Measured rather than assumed, which is the only way to tell contention from a real
order dependency: three consecutive full runs clean with the new files moved
aside, one failure in three with them present.

Fixed at its own boundary — `asyncUtilTimeout: 5000` in the Testing Library setup,
`testTimeout: 15000` in the Vitest config, both commented as contention headroom.
**Not by serialising the suite**, which would diverge from CI, cost real time on
every run, and hide the order dependencies parallelism is good at exposing.
Raising a wait is not a defect mask: an element that is genuinely never rendered
still fails, only later.

Linked Data Explorer saw the same shape at a much smaller dose. Adding 31 tests
(1042 → 1073) produced exactly one parallel-only failure: a `ShaclValidator` test
timing out at the 5000 ms default in a full run, passing 37/37 in isolation, in a
file the change did not touch. It did not recur and no timeout was raised. Two
readings from that: **the effect is proportional to how loaded the run is, not to
how many tests you added** — 31 was enough to surface it once — and **a
parallel-only failure is not a finding until it fails in isolation**, which is the
check that separates contention from a real order dependency and costs one command.

### Runner mechanics

- **Jest** takes a **glob key** (`'./src/**/*.ts'`), which it applies to each
  matching file individually.
- **Vitest** takes `thresholds: { branches: 80, perFile: true }`. It reports
  "global threshold" in its failure message even in per-file mode — that is its
  wording, not a misconfiguration. Naming the file rather than reporting the
  package average is what demonstrates per-file behaviour.

### Branches only — measure before adding functions

A functions floor at 80 is **not** a safe companion setting. Measured in RONL
Business API at the time the floor landed, it would have failed **31 files**:

| workspace   | files below 80% functions |
| ----------- | ------------------------- |
| frontend    | 11                        |
| pa-cockpit  | 10                        |
| pa-demo     | 7                         |
| public-site | 3                         |
| backend     | 0                         |

`public-site/TopBar.tsx` is the illustration: **100% branches, 66% functions**.
The two are not interchangeable.

### Margins differ sharply

Both repositories using native thresholds were measured clean before enforcing —
but "clean" means different things:

|                               | files measured | lowest branch coverage     |
| ----------------------------- | -------------- | -------------------------- |
| ronl-business-api backend     | —              | comfortable                |
| linked-data-explorer backend  | 49             | `sparql.service.ts` 82.85% |
| linked-data-explorer frontend | 68             | `GraphView.tsx` 82.26%     |
| ttl-editor                    | 41             | `useDsoImport.js` 80.39%   |

The Linked Data Explorer frontend row is the one that moved. At `04cc38c` it read
**exactly 80.00%** — zero margin, the first uncovered branch added anywhere in that
file turning CI red — with thirteen more files between 80 and 85 behind it. At
`afb182e` the package average is **92.88%**, one file remains under 85, and none
under 82. What that took, and what it did _not_ take, is
[below](#buying-margin-and-how-to-tell-it-from-coverage-theatre).

Two corrections to the earlier reading, both worth more than the numbers:

- **The file was named wrong.** `CaseworkerCasePanel.tsx` does not exist in that
  repository and never has. The file at 80.00% was
  `ChainBuilder/TestCasePanel.tsx`. The wrong name reached a commit message, a
  config comment and this document, and survived all three because nobody
  re-derived it — in a document whose premise is that it was verified rather than
  remembered. It is fixed in the config comment; the commit message is already
  pushed and stays as it is.
- **"Files measured" counts files carrying at least one branch** — 68 of the 77 in
  the report. The earlier 64 is not reproducible under any rule found, and cannot
  be a real change: the work that closed the gap added no source files, so per-file
  branch counts are identical at both heads. Stating the rule is the fix.

ttl-editor is in the same position and arrived there differently. Its three lowest
files — `useDsoImport.js` 80.39% (41/51), `ConceptsTab.jsx` 80.56% (29/36),
`ChangelogTab.jsx` 80.70% (46/57) — are each **one uncovered branch** from
failing. While the ratchet existed those files were merely near the floor; now
that the pins are gone there is nothing to absorb a regression, and a single added
`?.` or `||` default in any of them turns CI red.

Worth noting what the branch column does _not_ see. `ConceptsTab.jsx` reads 80.56%
on branches and **71.62% on statements, 63.33% on functions**; `App.jsx` reads
81.48% / 71.65% / **53.70%**. The uncovered code there is largely branch-free —
whole handlers no test calls — so a branch floor steps straight over it. That is
the same asymmetry `public-site/TopBar.tsx` shows in the other direction, and the
reason a functions floor is a separate decision to be measured before it is
made.

### Buying margin, and how to tell it from coverage theatre

Linked Data Explorer's frontend closed its zero-margin gap at `afb182e`: twelve
files raised, package branches 90.59% → **92.88%**, files under 85% 14 → 1, tests
1042 → 1073. **No production code changed** — test files only, plus the config
comment.

| file                  | before | after      |     | file               | before | after      |
| --------------------- | ------ | ---------- | --- | ------------------ | ------ | ---------- |
| `TestCasePanel`       | 80.00  | **100.00** |     | `ChainConfig`      | 80.56  | **94.44**  |
| `ExportChain`         | 80.77  | **98.08**  |     | `FormList`         | 82.14  | **98.21**  |
| `userTemplateStorage` | 80.77  | **100.00** |     | `RopaRecordEditor` | 81.37  | **94.12**  |
| `SemanticView`        | 81.82  | **100.00** |     | `VendorModal`      | 84.78  | **100.00** |
| `VendorBadge`         | 84.62  | **100.00** |     | `TextBlockEditor`  | 85.00  | **90.00**  |
| `exampleVersions`     | 83.33  | **100.00** |     | `AssetLibrary`     | 80.95  | **85.71**  |

The interesting part is not the numbers. Writing tests _to raise a coverage
number_ is the failure mode this whole section exists to avoid, and three
mechanics kept it honest.

**Mutation-check every test, because a test written after the code cannot fail on
its own merits.** Tests written against code that already exists pass on the first
run, which proves nothing about whether they _can_ fail. Each new test therefore
had the branch it targets deliberately broken in the production file, and had to
fail — then the file was restored. Cheap to automate: a shell loop over `sed`
one-liners, one full file-scoped run each.

That caught **five tests passing vacuously**, which would otherwise have shipped as
coverage with no protection behind it:

- Two guard tests used a response fixture with no `data` field at all, so
  `data ?? []` and the real `success && Array.isArray(data)` guard behaved
  identically. The fixture had to carry a payload that _survives_ the guard's
  removal before the test could fail.
- Four component tests asserted "nothing was added" / "nothing was saved" — which
  stays true when the handler **throws** partway through. React surfaces an error
  thrown inside a click handler on `window`'s `error` event rather than rejecting
  the click, so an assertion on the DOM sees a successful no-op either way. The fix
  is a listener around the interaction that fails the test if anything was raised.

That second shape is the transferable one: **on any React codebase, "nothing
happened" is not a safe assertion** unless something is watching for the throw.

**Some branches are unreachable, and the honest move is to leave them.** Three
guards here sit behind a submit button already `disabled` on exactly the same
condition — `filename.trim() || chainName` under `disabled={!filename.trim()}`, and
two of the same shape. Covering them would mean invoking the handler directly,
which tests nothing a user can do. They are why two of the files above stop at
98.08 and 94.44 rather than 100. This is the same finding ttl-editor recorded
about `DMNTab.jsx`'s seven remaining guards, reached independently in a different
codebase and a different framework — **a per-file floor in the high nineties is
usually the ceiling, and the last few points are dead code asking to be
documented rather than tested.**

**Two more branches are covered but behaviour-preserving**, and the comments say
so rather than implying more: a pair of `if (!templates) return null` guards whose
removal only produces a throw the surrounding `try/catch` already swallows, and a
`?? ''` feeding an `Array.join` that coerces `undefined` anyway. Their mutations
survive by construction. They are worth keeping — they assert the returned
contract — but a reader deserves to know which mutations they do not catch.

**And one file was deliberately left at the bottom.** `GraphView.tsx` stays at
82.26% (51/62): all eleven uncovered branches are inside d3's force-simulation tick
and drag handlers — `d.x || 0` fallbacks that need a node at the origin, and
`if (!event.active)` guards that need synthesised `D3DragEvent`s. Reaching them
means standing up a d3 harness and asserting on d3's mechanics rather than on the
component. It has **one branch of slack**: a twelfth uncovered branch still reads
80.95% and passes; the thirteenth fails. `vite.config.ts` records that, so whoever
meets the floor there knows the answer is to test their new branch rather than
lower the threshold.

### How to verify a threshold actually bites

Do not trust a green run. Add a temporary file with a few uncovered branches and
confirm both that the run fails **and that it names the file**:

```
Jest:   ".../src/__threshold-probe.ts" coverage threshold for branches (80%) not met: 0%
Vitest: ERROR: Coverage for branches (0%) does not meet global threshold (80%) for src/__threshold-probe.ts
```

Naming the file is the part that matters — it proves the threshold is per-file
rather than being satisfied by a healthy package average.

---

## 4. What actually gates a merge

A threshold only means something where the tests run before the merge. This is
where the three diverge most, and where the remaining work is.

|                      | tests on a pull request                                                                  |
| -------------------- | ---------------------------------------------------------------------------------------- |
| ttl-editor           | ✅ both Static Web Apps workflows run `npm run test:ci` on `push` **and** `pull_request` |
| linked-data-explorer | ✅ backend and frontend, acc workflows                                                   |
| ronl-business-api    | ✅ all five workspaces, since 2026-09-12                                                 |

**RONL Business API's backend workflow used to trigger on `push` alone**
([ronl-business-api#87](https://github.com/sgort/ronl-business-api/issues/87),
closed 2026-09-12). Its 2008 tests ran only _after_ a merge, so its backend branch
threshold gated nothing on a pull request — it would fail on `acc`, after the
fact, rather than on the branch that caused it. The floor was real in four of its
five workspaces and retrospective in the fifth.

It proved itself immediately: an `axios` 1.18 security bump broke the backend
build on the pull request, with 1,859 tests passing and one suite failing to
compile on a widened header type. Before the trigger existed, that lands on `acc`.

This is the same gap Linked Data Explorer closed, where it had let a genuine
defect sit on a pushed branch for days because no pull request ever ran the test
that caught it.

The fix is not identical, though, and the difference is worth knowing before
copying one into the other. Linked Data Explorer's backend workflow **deploys to
Azure**, so its `pull_request` trigger had to come with six deploy-side steps
gated on the event — arranged as per-step conditions rather than a job split, so
the check name stays stable and no ruleset entry changes. RONL Business API's
backend workflow **does not deploy**: it ends at a deployment zip and an uploaded
artifact, with the real deploy being a manual script run from a clean `acc` after
the release pull request merges. Nothing in that job has an external side effect,
so there is nothing to gate — the change is the trigger alone.

### A ruleset scoped to one branch gates one branch

Worth stating because it is easy to read a repository as protected when only half
of it is. ttl-editor's `acc supply-chain gate` ruleset applies to `refs/heads/acc`
and nothing else, and requires two status checks there: `audit` (`zizmor.yml`) and,
since 11 September 2026, `scan` (`semgrep.yml`). `main` has branch protection — a
pull request is required — but **zero required approvals and no required status
checks at all**. So on the promotion pull request, `audit`, `scan` and the
production build ran and reported, and none of them could have blocked the merge.

That asymmetry widened rather than narrowed when `scan` was added: every control
ttl-editor has now gates its `acc`, and none gates its `main`. (Linked Data
Explorer is the opposite case — see below.)

In ttl-editor that is **decided, not merely defensible** — weighed on 11 September
2026 and deliberately kept. `main` is promoted from `acc`, and those commits
already passed `audit` and `scan` on their own `acc` pull request, so re-running
them adds latency without adding information about the code.

The argument against stands and is worth keeping in view: the promotion pull
request is the one carrying changes into production, and it is gated by nobody.
"Already checked on `acc`" is true of the commits, not of the merge — a promotion
can be opened from a stale `acc`, or carry a conflict resolution that appears in no
earlier pull request. Read the checks there rather than trusting the button.

If it is ever revisited, `audit` and `scan` are the two that could be required:
both trigger on `pull_request` unfiltered with no paths filter, so neither can go
missing on any base. **`Build and deploy PROD` cannot**, as things stand — its
`paths-ignore` means a documentation-only promotion never triggers it, and a
required check that never reports wedges the pull request permanently. That is the
same hole this document describes above, in the other dimension. Seventeen of the
v2026.09.3 promotion's 42 files matched that filter, so it is an ordinary case
rather than a corner one. The full analysis is in
[ttl-editor#131](https://github.com/sgort/ttl-editor/issues/131).

The same question is worth asking of the other two: a ruleset naming one branch
says nothing about any other.

**RONL Business API was asked on 2026-09-12, and answered the opposite way to
ttl-editor.** Its `main` had classic branch protection only: a pull request
required, **zero** required status checks, `allow_force_pushes: true` and
`enforce_admins: false` — so an administrator could push to it directly, and the
branch that deploys production was the least protected of the two. A
`main promotion gate` ruleset was created before the promotion pull request was
opened, mirroring the `acc` one: `deletion`, `non_fast_forward`, `pull_request`
with `allowed_merge_methods: ["merge"]`, and `required_status_checks: [audit]`,
with no bypass actors.

It proved itself on the pull request it existed for: `mergeStateStatus` read
`BLOCKED` while `audit` ran, then cleared. That is a gate demonstrating it bites
without anything being pushed to the branch to test it — the same argument this
page already makes against testing a ruleset by pushing.

Two parameters were set deliberately rather than by default, both for reasons
recorded above: `require_extra_approval_for_unattributed_changes: false`, because
the promotion carried three author identities and zero required approvals would
otherwise have deadlocked it; and `audit` as the **only** required check, because
every deploy workflow there is push-only and a required check that never reports
wedges the pull request permanently.

**Linked Data Explorer was asked, and had the same hole.** Its only ruleset was
`acc supply-chain gate`, `include: ["refs/heads/acc"]`, `exclude: []`. `main` had
nothing at all — not even the pull request ttl-editor's `main` requires. Anyone
could have pushed to it directly, or squashed a promotion and orphaned every SHA
cited across all seventy-five changelog entries.

Closed on 2026-09-09 with a `main promotion gate` ruleset created **before** the
promotion pull request was opened, mirroring the `acc` one: `deletion`,
`non_fast_forward`, `pull_request` with `allowed_merge_methods: ["merge"]`, and
`required_status_checks: [audit]` with `strict: false`. `scan` joined `audit` in
both rulesets on 2026-09-11; read back after writing, each ruleset changed in
that one field and no other.

Three things that were load-bearing, in the order they mattered:

- **Check the audit reaches the branch before requiring it.** A required check
  that no trigger produces blocks the pull request permanently. It works here
  only because `zizmor.yml` triggers on a bare `pull_request:` with no branch
  filter — a fix that landed in the same release, after branch-filtered audits
  had blocked four stacked pull requests. Requiring `audit` on `main` before that
  fix would have deadlocked the promotion.
- **Omitting a ruleset parameter is not the same as setting it false.** The
  create call left `require_extra_approval_for_unattributed_changes` out of the
  payload; GitHub stored it as **`true`**. With 206 commits across three author
  identities, zero required approvals and no second maintainer to approve, that
  would have deadlocked the very pull request the ruleset existed to protect —
  and it was invisible in the create response's shape. Caught by reading the
  stored ruleset back rather than trusting the write. Set it explicitly.
- **The promotion pull request is the proof, and it is free.** On opening, it
  reported `mergeStateStatus=BLOCKED` on the pending `audit`, then moved to
  `UNSTABLE` once that passed. That is a gate demonstrating it bites without
  anything being pushed. **Do not test a branch ruleset by pushing to the
  branch** — if it is misconfigured the push succeeds, and the test was the
  promotion.

The `acc` and `main` rulesets therefore differ by one parameter, deliberately.
Worth recording somewhere durable, or it reads as drift the next time someone
compares them.

**Production workflows are deliberately excluded from that treatment** in Linked
Data Explorer, on evidence rather than preference:

| environment  | protection rules                  |
| ------------ | --------------------------------- |
| `acceptance` | none                              |
| `production` | required reviewers, branch policy |

A `pull_request` trigger on a production workflow would make every pull request
to `main` wait on a human approval **before the tests could run** — an approval
gate in front of the check meant to inform it. `main` is promoted from `acc`, so
those commits already ran the full suite on their `acc` pull request.

**A protected environment protects the jobs that declare it, and no others.**
That table describes the environment; it does not describe what reaches
production. Of Linked Data Explorer's three production workflows, exactly one
names it:

| production workflow | declares `environment:` | on merge to `main` |
| ------------------- | ----------------------- | ------------------ |
| backend             | ✅ `production`         | waits for approval |
| frontend            | —                       | ships unattended   |
| ropa-site           | —                       | ships unattended   |

Confirmed on the 2026-09-09 promotion: the backend run paused and recorded
`approved by sgort`, while the other two deployed straight through. **The
asymmetry is deliberate here** — but "the production environment requires
reviewers" is a true sentence that describes one third of what deploys, and
reading it as coverage would be wrong.

### A workflow's own file in its `paths:` filter is a trigger

Predicted from the content path alone, ropa-site should not have deployed on that
promotion: `git diff main acc -- packages/ropa-site` was empty. It deployed
anyway, twice — once on the pull request, once on the merge.

Its filter has two entries, and the second is itself:

```yaml
paths:
  - "packages/ropa-site/**"
  - ".github/workflows/azure-ropa-site-prod.yml"
```

The workflow file had changed by 21 lines between the branches — pinning and
hardening from the supply-chain work — so the trigger matched. That second entry
is correct and worth keeping: a change to how a thing deploys should redeploy it.
But it means **a path-filtered workflow is not confined to its package**, and any
repository-wide sweep across workflow files rearms every filter that names its
own file.

The practical rule when predicting what a merge will deploy: read the whole
`paths:` list, not the entry that looks like the package.

### A path filter also filters the close, and a conflicted pull request closes silently

Static Web Apps give each pull request a preview environment, and a close job
deletes it when the pull request closes. On 15 September ttl-editor's acceptance
app held four previews for pull requests closed days or weeks earlier, and its
production app another four from pull requests merged between October 2025 and
February 2026. Each was a public URL serving old code, holding one of the ten
slots a Standard plan allows, and nothing reported any of them.

For the four on acceptance, the close job never ran, for two different reasons.
The detection was checked first against pull requests that did clean up (#126,
#140, #141 and #146), and it found their close runs.

- **The path filter.** ttl-editor's deploy workflows carry
  `paths-ignore: docs/**, .claude/**, **/*.md`, and a path filter applies to the
  `closed` event as much as to `opened`. #66 changed one file under `docs/`. Its
  preview was built before #65 added the filter; #65 merged at 14:31:02 UTC on
  4 September and #66 at 14:31:29. So #66's close matched only ignored paths, and
  the workflow holding the close job never started.
- **No test merge.** GitHub documents that `pull_request` workflows do not run
  while a pull request has a merge conflict. For #43, #45 and #123 no workflow of
  any kind ran at close, and GitHub's last recorded mergeability for each is
  `unknown`. #62 and #71 were closed unmerged the same day, are recorded as
  mergeable, and got their close runs. #45 conflicts with `acc` locally, but #43
  and #123 merge cleanly locally, so for those two the link is a correlation with
  GitHub's own verdict rather than a reproduced conflict. Who closed them made no
  difference.

The first cause is fixed in the workflow. Both close jobs moved into
`close-preview-environments.yml`, which triggers on `pull_request: closed` with
**no path filter**
([ttl-editor#150](https://github.com/sgort/ttl-editor/pull/150)). Closing an
environment that was never created succeeds and does nothing: #71's build failed
at `npm ci`, before anything deployed, and its close job still passed. So the
workflow runs on every close. Its first real run started three seconds after #150
merged, and deleted that pull request's own preview.

The second cause cannot be fixed in a workflow, because no workflow starts.
`pull_request_target` would start, but zizmor flags it as a dangerous trigger and
the Static Web Apps action's support for it is unverified. So it is caught from
outside. **`scripts/check-previews.sh`** lists the environments Azure holds for
each app against the pull requests GitHub has open, prints the
`az staticwebapp environment delete` command for each orphan, and deletes nothing.
It has the same shape as `check-mirror`: called from `/bump-release`, and runnable
as `npm run check-previews`.

**RONL Business API showed the same signature.** Read from Azure on 15 September,
`ronl-business-frontend-acc` held previews for #108, #109 and #112: three Renovate
security pull requests, autoclosed on 14 September, none with a mergeability
verdict on record. They were still there on 20 September, when a second read by
hand found eight across three apps. Those were deleted by hand, and the repository
gained its own `check-previews` on 22 September
([#185](https://github.com/sgort/ronl-business-api/pull/185)) so the next ones are
reported rather than stumbled on. [#181](https://github.com/sgort/ronl-business-api/pull/181)
also narrowed what gets created: a preview now needs the `preview` label and a
change to something other than a manifest. Linked Data Explorer's apps held none, and every
preview there belongs to an open pull request. Its close jobs still sit inside
path-filtered workflows, but its filters are allowlists, so a pull request that
got a preview matches the filter again when it closes. The conflict cause applies
there as much as anywhere.

### A fix made in one environment's workflow is half a fix

Linked Data Explorer's backend reads its SHACL shape files at runtime from
`packages/backend/shapes/`, and `tsc` emits only `dist/`, so the deploy package
needs them copied in. [`968b4a5`](https://github.com/sgort/linked-data-explorer/commit/968b4a5), on 4 June 2026, added
that copy to `azure-backend-acc.yml` and to no other workflow. The production
workflow never gained it. For three months the two differed in a step nobody had
decided, and nothing compared them: acceptance worked, so the feature worked.

It surfaced on 14 September, when the validator was tried in production: every file
Valid, every layer _Not loaded_. The service logged a warning per missing file,
and a unit test asserted `valid: true` for a missing layer — the fail-open was
pinned, not overlooked.

[linked-data-explorer#123](https://github.com/sgort/linked-data-explorer/pull/123) closed it at three points, each
catching a different failure:

- **The package, in both workflows.** After the copy, the files the service's
  layer list names must exist, or the step fails before anything deploys.
- **The service.** `valid` requires every layer to have loaded; the frontend
  shows _Not validated_, never _Valid_, for a clean result with a layer missing.
- **The running app.** `/v1/health` reports `shacl.complete` without changing
  `status` — a 503 would invite platform health probes to act on one feature —
  and both deploy workflows fail unless it reads `true`. §1 records what its
  first run taught.

The rule: **where acceptance and production have separate workflow files, a
change to one is a change to carry, not a fix.** Diff the pair whenever either
changes; the expected differences are few, and the missing copy would have been
one of the lines left over.

### A commit message can turn every gate off

GitHub Actions honours `[skip ci]`, `[ci skip]`, `[no ci]`, `[skip actions]` and
`[actions skip]` **anywhere in a commit message**, including in prose that is
merely discussing them. It does not distinguish a marker from a quotation.

Observed on a ttl-editor pull request whose commit message explained that two
files had come to exist on only one remote because they were originally committed
with such a marker — and quoted it. Every workflow was skipped:

```
gh pr checks 110       no checks reported
gh run list --branch   (empty)
mergeStateStatus       BLOCKED
```

**The failure mode is silence, not red.** `audit` is a required check under the
`acc` ruleset, so the pull request could never become mergeable, and there was no
failing run to explain why — the checks list was not failing, it was empty. That
is the same shape as the `continue-on-error` problem recorded above, approached
from the opposite direction: there a check ran and reported a success it had not
earned; here a required check never ran at all and reported nothing.

The fix was to describe the marker in words instead of containing one. Two
consequences to carry:

- **A skip marker in a merged commit can suppress the deploy on the branch it
  lands on**, not only the checks on the pull request. Had it survived, the same
  string could have skipped the acceptance deploy on the push to `acc`.
- **The marker is how the two remotes diverged in the first place**, which is the
  subject of the next section. It is a signal that something bypassed review
  rather than a convenience for a documentation-only change — `paths-ignore`
  expresses that intent without switching the gates off.

Note what limits the blast radius here, because it is a repository setting and not
a law. ttl-editor composes merge commits as `merge_commit_title=PR_TITLE` with
`merge_commit_message=BLANK`, so a pull request body never reaches the merge
commit — only the title does. A repository configured with `PR_BODY` instead would
let a marker quoted anywhere in a description suppress the deploy on the branch it
merges to. Check that setting before writing prose about skip markers in a pull
request, as this one does.

This section is itself the test case: it names all five markers in full, and it is
safe to do so because they sit in a file rather than in a commit message.

### Formatting

All three check formatting in CI. RONL Business API added `check-format` to its
`audit` job on 12 September (C4); until then its pre-push hook was the only
check, so the rule held on a developer's machine and not on the shared branch.

That gap is not theoretical: a Prettier 3.7 → 3.9 upgrade changed how short union
types are formatted, and five files nobody had touched began failing
`prettier --check` the moment the upgrade merged — **with every CI check green**.
The symptom would have been the next person's `git push` failing on files they had
never opened.

**RONL Business API's check caught the same class of change two days after it
landed, inside a refresh.** Its first lock-file maintenance ([ronl-business-api#134](https://github.com/sgort/ronl-business-api/pull/134))
moved Prettier from 3.8.1 to 3.9.6, which both `^3.1.1` declarations admit, and
failed `audit` at Check formatting on eight files it did not touch. The fix went
on `acc` rather than the Renovate branch, which Renovate rebuilds: Prettier pinned
to exactly 3.9.6 and the eight files reformatted ([ronl-business-api#135](https://github.com/sgort/ronl-business-api/pull/135)), so a
formatter change now arrives as its own pull request. One file never converged: an
indented code block inside a Markdown list item, which 3.9.6 re-indents on every
run. It became a fenced block.

Three mechanics matter if this is replicated:

- **Run the repository's own Prettier** (`npm ci` first), not a version named in
  the workflow. A second pinned version is a second thing to keep in step, which
  reintroduces exactly the drift the check exists to catch.
- **Match the command the pre-push hook runs**, whatever that is. In Linked Data
  Explorer that is a per-workspace fan-out, because Prettier resolves
  `.prettierignore` relative to the working directory and a root-level
  `prettier --check .` would silently check `dist/` and `coverage/`. ttl-editor is
  one package with one `.prettierignore`, so the root run _is_ the right command
  there. Copying either shape into the other repository would be wrong.
- **Put the step where every pull request reaches it.** ttl-editor's deploy
  workflows carry `paths-ignore: docs/**, **/*.md`, deliberately, so that a
  documentation change does not claim one of ten staging environments and return
  nothing for it. A formatting check placed there would therefore never see
  markdown — the files most likely to drift, since `lint-staged` only formats
  `src/**` and `package.json` on commit. It goes in the `audit` job instead, which
  has no path filter and is the required status check. That job had no `npm ci` at
  all before this: everything in it ran from `npx` or plain node.

---

## 5. The second remote

All three applications are mirrored to `git.open-regels.nl` as well as GitHub.
None of the mechanisms above knows that. Every gate in this document runs on
GitHub Actions, so the mirror is outside all of them — and a mirror nothing
checks is not a backup, it is a second place for content to be.

### Verified state

By `git ls-remote` against both remotes, which needs no local clone and touches
nothing:

| repository           | `acc`             | `main`            |
| -------------------- | ----------------- | ----------------- |
| ttl-editor           | ✅ `4a20e91` both | ✅ `e1c482e` both |
| linked-data-explorer | ✅ `0a52f9d` both | ✅ `01fcd67` both |
| ronl-business-api    | ✅ `e187086` both | ✅ `311d732` both |

All three rows were verified by `ls-remote` against both remotes on 15 September
2026, after each repository's last merge that day, and each was a fast-forward push
from GitHub's refs. The paragraphs below describe earlier passes.

Linked Data Explorer's row is as of 2026-09-11, and a tick here means synced at
the last check, not kept in sync. The mirror is pushed by hand, so every merge
leaves it behind until the next push. It had drifted again by then — `acc` 24
commits behind, `main` 17 — and was re-synced the same way as below: both sides
strict ancestors, so two plain fast-forwards from GitHub's refs.

RONL Business API's row is as of 2026-09-12, and it is the one that had never been
audited. The answer turned out to be the dull case rather than ttl-editor's: both
GitLab branches were **strict ancestors** — `acc` 8 commits behind, `main` 184 —
so each synced as a plain fast-forward from GitHub's refs, with no divergence, no
archive branch and no force. The `merge-base --is-ancestor` check below is what
established that before anything was pushed, and it is the whole difference
between this case and the surgery further down.

It drifted three more times the same day, as each promotion pull request merged,
and was pushed again each time. That is the point of the row: not "synced", but
"synced at the last check".

### Behind is not the same as diverged

Linked Data Explorer's mirror was stale too, and needed none of the surgery
below. On 2026-09-09 `gitlab/acc` sat 114 commits behind `origin/acc` and
`gitlab/main` 253 behind `origin/main` — **and zero ahead of either.** Both were
strict ancestors, so both synced as plain fast-forwards: no force, no archive
branch, no tree comparison, nothing at risk.

One command separates the two cases before anything is pushed:

```bash
git merge-base --is-ancestor gitlab/<branch> origin/<branch>
```

Ancestor means fast-forward, and the reconciliation is one push. Not an ancestor
means the mirror holds commits GitHub has never seen, and everything from "compare
trees" onward applies. Running that check first is what tells you which of the two
situations you are in; commit counts alone do not, because "253 behind" and "18
ahead and 306 behind" both read as "stale".

**Push the remote-tracking ref, not the local branch.** The obvious
`git push gitlab acc` pushes whatever the local branch happens to be, and local
branches drift. Here local `main` was still at a four-month-old merge node that
`origin/main` had never contained — `git push gitlab main` would have sent that
tree to the mirror. The safe form names the source explicitly:

```bash
git push gitlab origin/acc:refs/heads/acc
git push gitlab origin/main:refs/heads/main
```

That pushes exactly what GitHub has, regardless of the state of the clone doing
the pushing.

### What ttl-editor's divergence turned out to be

`gitlab/main` had not moved since **4 March 2026** while GitHub moved 306 commits
past it. It carried 18 commits GitHub had never seen. Seventeen were cross-remote
sync merges with no content of their own, and the eighteenth turned out to have
reached GitHub by another route.

But the trees disagreed by more than the commits did. Nine files existed on
`gitlab/main` and not on `origin/main`; seven were Create React App leftovers the
Vite migration had deliberately removed, and **two were example TTLs that existed
nowhere on GitHub at all** — not on `main`, not on `acc`. Both had originally been
committed with a CI-skip marker, which is how they came to be on one remote and
not the other without anything noticing.

**Compare trees, not commit counts.** "18 commits ahead" was almost entirely
noise; `git diff --name-status origin/main gitlab/main` filtered to additions is
what found the two files that mattered:

```bash
git diff --name-status origin/main gitlab/main | awk '$1=="A"{print $2}'
```

Then check each result against every branch on the other remote, not just the
matching one — the files were absent from `origin/main` _and_ `origin/acc`, and
checking only `main` would have understated it.

### Reconciling, in an order that matters

Once the content is safe, a stale mirror wants a reset rather than a merge: a
merge would drag seventeen contentless sync commits into the history permanently.
But "safe" has to be true on **both** remotes before the reset, and the obvious
order gets that wrong.

1. **Land the missing content on GitHub.** Cherry-pick the commit that recovers
   it, rather than merging the branch it sits on — that branch was based on the
   stale remote, so its tree carries the whole pre-migration world with it.
2. **Push `acc` to the mirror.** This is the step easy to skip. After step 1 the
   files were on GitHub, but on GitLab they still existed _only on the branch
   about to be overwritten_. Pushing `acc` first put them on `gitlab/acc`, so the
   reset could not remove them from GitLab entirely.
3. **Archive the ref being replaced.** `git push gitlab gitlab/main:refs/heads/archive/gitlab-main-<date>`.
   A force-push leaves the old head unreachable and eventually collectable; an
   archive branch costs nothing and makes the operation reversible.
4. **Reset with `--force-with-lease=main:<old-sha>`**, naming the SHA, so the push
   refuses if anything moved underneath.

Before step 4, confirm every file about to disappear has a successor. Seven did
here — `.eslintrc.json` → `eslint.config.mjs`, `public/index.html` → `index.html`,
`src/index.js` → `src/index.jsx`, and so on. That last one was a guess at
`src/main.jsx` first, and checking rather than assuming is the point: "successor
missing" is a reason to stop.

### What would have caught it earlier

Nothing in place did. Since 12 September 2026 something does, in all three
repositories: **`scripts/check-mirror.sh`**, wired into each repository's own
`/bump-release` step and runnable as `npm run check-mirror`.

It cannot run in CI, and that is a property of the mirror rather than a
shortcoming: the `gitlab` remote lives in `.git/config` and no tracked file names
the host, so an Actions runner has no such remote, no key for it and no route to
it. It runs where the push actually happens.

Two details carried straight from this section:

- **It prints the remote-tracking form**, `git push gitlab
origin/acc:refs/heads/acc`, never `git push gitlab acc` — the distinction that
  would otherwise have sent Linked Data Explorer's four-month-old local `main` to
  its mirror.
- **It separates behind from diverged** with `merge-base --is-ancestor`, which a
  commit count cannot: "253 behind" and "18 ahead and 306 behind" both read as
  "stale". Behind prints the fast-forward command; diverged refuses to suggest a
  push at all and points at the archive procedure above.

It never pushes. Writing to a shared remote stays a human's decision, so it
prints the command and exits non-zero. All four paths — match, behind, diverged,
missing — were exercised against a scratch bare repository standing in as a
mirror, rather than reasoned about.

**It closes the observation half, not the drift.** Nothing still keeps the mirror
synced _between_ releases; it drifts on every merge, and a release is simply the
point where that is now noticed rather than discovered six months later.

---

## 6. Open work

| repository                       | issue | what                                                                                                                                                                                                                           |
| -------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ronl-business-api                | —     | Semgrep `scan` is required on `acc` since #119; 25 findings still to triage after lock-file maintenance: 9 Supply Chain, none reachable, 16 Code                                                                               |
| linked-data-explorer             | —     | `GraphView.tsx` at 82.26%: one branch of slack, behind a d3 harness                                                                                                                                                            |
| ttl-editor                       | —     | three files sit within one branch of the floor, with no ratchet left to absorb a slip                                                                                                                                          |
| ttl-editor                       | #131  | `main` has no required status checks — decided and kept, not an oversight                                                                                                                                                      |
| ttl-editor                       | #128  | Semgrep `scan` cannot pass on a forked pull request; accepted, tracked                                                                                                                                                         |
| linked-data-explorer             | #97   | confirmed on 22 Sep: the refresh ran in all three and introduced no version younger than 14 days (201 packages measured). Remaining: `renovate/stability-days` reports the branch as held anyway, and all three merged over it |
| linked-data-explorer             | #119  | the gaps against ICTU's dependency guideline, tracked for all three repositories                                                                                                                                               |
| all three                        | —     | nothing keeps the mirrors synced _between_ releases; `check-mirror` only observes                                                                                                                                              |
| ronl-business-api                | #196  | the three `deployment/vm/` compose files carry unpinned tags, one of them `:latest`, and nothing in the repository applies them — so a digest there would be unverifiable. ACC only; production is being replaced              |
| ronl-business-api                | —     | only `main` was sequenced by #177; `acc`'s four deploy workflows still race a push, and its ruleset names four build jobs by name                                                                                              |
| linked-data-explorer             | —     | the same four-way race on a push to `main`; `main` requires `audit` and `scan`, neither a deploy job, so #177's shape is open here                                                                                             |
| linked-data-explorer             | #80   | unblocked 23 Sep: Azure offers major-level Node runtimes only, so an exact App Service pin is not available; the control is the ORDERING — switch both backends to the new major first, then merge. Nothing enforces it        |
| linked-data-explorer             | —     | changelog entry `1.9.12` still carries the legacy `Latest` status, now visible in prod                                                                                                                                         |
| linked-data-explorer             | —     | no `check-previews`, and close jobs still inside the deploy workflows; none orphaned today                                                                                                                                     |
| ttl-editor                       | #117  | a stale, conflicted Renovate pull request with a live preview, expected to orphan it on close for `check-previews` to catch                                                                                                    |
| ttl-editor, linked-data-explorer | —     | zizmor 1.30.1 and `zizmor-action` v0.6.4 due about 23 Sep: the action first in ttl-editor; the zizmor register rows by hand in both                                                                                            |
| ronl-business-api                | —     | 8 Dependabot alerts no routine update closes, from 7 on 14 Sep: `minimatch` (typescript-eslint 8), `react-router` ×2 (v7), `qs` ×2 (Express 5 or an override), `adm-zip` ×2 and `elliptic` (no fix)                            |

**Closed on 22 September 2026.** For RONL Business API, ten rows from the table
above: #34, #35 and #129 in one pull request
([#176](https://github.com/sgort/ronl-business-api/pull/176)), #37
([#184](https://github.com/sgort/ronl-business-api/pull/184)), #38 (with #35), #96
([#167](https://github.com/sgort/ronl-business-api/pull/167) — the setting turned
out to be vestigial, read nowhere, so it was removed rather than rotated), #97
([#173](https://github.com/sgort/ronl-business-api/pull/173)), #99
([#157](https://github.com/sgort/ronl-business-api/pull/157)), its three orphaned
previews (deleted by hand, with `check-previews` added in
[#185](https://github.com/sgort/ronl-business-api/pull/185)), and its register's
claim that zizmor's version is manual — the last of the three to be corrected. Two
more closed that no table here listed: #154 and #177. For Linked Data Explorer,
four: #113 ([#179](https://github.com/sgort/linked-data-explorer/pull/179)), #96
([#159](https://github.com/sgort/linked-data-explorer/pull/159)), #111 and #122.

**Closed on 15 September 2026**: ttl-editor's four Semgrep dashboard ignores, now in
the source ([ttl-editor#144](https://github.com/sgort/ttl-editor/pull/144)); both
registers' claim that zizmor's version is manual
([ttl-editor#144](https://github.com/sgort/ttl-editor/pull/144),
[linked-data-explorer#139](https://github.com/sgort/linked-data-explorer/pull/139));
lock-file maintenance exempted from the pull-request limits in both
([ttl-editor#145](https://github.com/sgort/ttl-editor/pull/145),
[linked-data-explorer#138](https://github.com/sgort/linked-data-explorer/pull/138));
and ttl-editor's orphaned previews, eight deleted by hand and the path-filter half
fixed in [ttl-editor#150](https://github.com/sgort/ttl-editor/pull/150). For RONL
Business API, `/bump-release` no longer leaves `packages/pa-cockpit` at 1.0.0
([ronl-business-api#153](https://github.com/sgort/ronl-business-api/pull/153)).

**Closed on 14 September 2026**, neither from this table: Linked Data Explorer's
production SHACL Validator reporting unchecked files as valid
([#123](https://github.com/sgort/linked-data-explorer/pull/123), [#124](https://github.com/sgort/linked-data-explorer/pull/124), promoted in
[#125](https://github.com/sgort/linked-data-explorer/pull/125)), and the unchecked workstation install in all three
([ronl-business-api#128](https://github.com/sgort/ronl-business-api/pull/128),
[linked-data-explorer#121](https://github.com/sgort/linked-data-explorer/pull/121),
[ttl-editor#142](https://github.com/sgort/ttl-editor/pull/142)). Both were found by using the thing, not by
auditing it. The same day closed four more for RONL Business API that no table
here listed: lock-file maintenance starved by the pull-request limits
([ronl-business-api#133](https://github.com/sgort/ronl-business-api/pull/133)), a tree nothing had refreshed ([ronl-business-api#134](https://github.com/sgort/ronl-business-api/pull/134)), pre-1.0
minors and `engines` floors arriving as routine updates ([ronl-business-api#142](https://github.com/sgort/ronl-business-api/pull/142),
[ronl-business-api#146](https://github.com/sgort/ronl-business-api/pull/146)), and the last floating Node version in CI
([ronl-business-api#139](https://github.com/sgort/ronl-business-api/pull/139)).

**Closed for RONL Business API on 2026-09-12**, in one pass: #83
(check-supply-chain promoted to blocking), #84 (`@ronl/shared` kept free of logic,
with a check that enforces it rather than a convention that asks), #85 (the
unreachable `PHASE_NOT_MODELLED` branch and its three permanently-skipped tests),
#87 (backend tests before merge) and #36 (one Node version, read from `.nvmrc`).
Its mirror row is narrowed rather than closed — see §5.

Two of the day's closures carry no issue number and would otherwise go
unrecorded: **C1**, which gave `acc` the `deletion` and `non_fast_forward` rules
`main` had carried since the promotion, and **C11**, which corrected three claims
in that repository's `the-gate-has-teeth.md` that its own gates had falsified.

**The first row is the one to read twice.** The Semgrep gap is deliberate — a
gate required before its baseline is triaged is a gate that gets bypassed — but
deliberate is not the same as done. One refresh took 435 findings to 25, and the
25 do not triage themselves.

The ruleset gap that sat above it closed the same day, last of the eleven. It is
worth remembering as a shape rather than a ticket: work that starts at item two
does not come back to item one on its own.

Closed since the previous revision: Linked Data Explorer's frontend zero-margin
entry, by
[linked-data-explorer#83](https://github.com/sgort/linked-data-explorer/pull/83).
`GraphView.tsx` replaces it as that repository's tightest file, but for a
different reason — not "nobody got to it yet" but "the branches are d3's", which
is a decision rather than a backlog item. Issue numbers are per repository
throughout this table; the `#83` in the first row is a different repository's.

Also closed for Linked Data Explorer: its unexercised production build id, its
unprotected `main`, and its stale mirror — all on 2026-09-09, in that order,
because each was a precondition for the next. Note the ttl-editor row above
survives that: closing the gap in one repository says nothing about the other,
which is the point of the row existing per repository rather than per mechanism.

**RONL Business API closed the same three on 2026-09-12**, in the same order and
for the same reason, plus
[ronl-business-api#71](https://github.com/sgort/ronl-business-api/issues/71) —
the promotion itself, which had been open since 3 September. Its `main` had gone
57 days without a deploy, so the three were not independent chores: the mirror
audit and the `main` ruleset both had to come first, and the build id could only
be exercised by the promotion they were protecting.

That repository's row above is therefore the mirror's standing gap rather than an
unaudited state. Worth keeping as a row: it drifted three times on the day of the
promotion alone, once per merged pull request, and each time someone had to
remember.

The two new Linked Data Explorer rows are both things noticed while doing
something else. **#80** would have CI running a Node older than the `engines`
floor it declares in the same pull request; npm only warns without
`engine-strict`, which is why its build is green, and it wants resolving on its
own branch rather than on a release cut. Its _other_ half — the App Service
running a different major than the build — was decided on 23 September and is no
longer a blocker, only an ordering. The `1.9.12` row is cosmetic — a legacy
status label from before `Released` was the convention — but it now renders a
"Latest" badge on a July entry sitting below `2026.09.2` in production.

On #84 specifically: `@ronl/shared` currently holds **no executable logic at
all** — types, constant seed data and re-exports. So nothing is escaping the
floor today, and adding a runner would measure an empty set. The recommendation
there is to keep the package declarations-only and enforce _that_, rather than
measure nothing and call it covered. A branching helper was already moved out of
that package once, after a passing test run concealed that its branches were never
counted.

---

## Adding a fourth application

1. **Confirm the bundler before writing anything.** `VITE_` and
   `import.meta.env` are Vite-specific; Create React App needs `REACT_APP_` and
   `process.env`, Next.js needs `NEXT_PUBLIC_`.
2. **Find out who builds** — the runner, or a container the deploy action owns.
   This decides which step the `env:` block belongs on and is the decision most
   likely to be wrong.
3. **Run `check-supply-chain` locally before wiring it into a gate.** Its
   assumptions hold for a register that pins each action once; a split pin or an
   annotated version cell needs the digest-matching behaviour.
4. **Measure the branch floor before enforcing it.** Native thresholds are
   all-or-nothing per file; a repository not yet at 80% everywhere needs the
   ratchet approach instead, and should treat that script as temporary from the
   day it is written. ttl-editor's carried one file and was deleted with it,
   which is the intended lifespan.
5. **Check where tests actually run.** A threshold enforced only after the merge
   is a report, not a gate.
6. **Prove each gate by making it fail**, and confirm the failure names the file
   or the action. A green run proves nothing about a check that is silently
   inert.
7. **Record the margin, not just the pass.** "Measured clean" and "measured clean
   with room" are different states, and only the second survives an unrelated
   change. Both repositories on native thresholds reached 80% with files at zero
   or one branch of slack, and in both the config comment is where that belongs.
8. **Check the second remote, if there is one.** Every gate here runs on GitHub
   Actions; a mirror is outside all of them. Compare trees rather than commit
   counts, and treat a CI-skip marker in the history as a likely cause.
9. **Mutation-check any test written to reach the floor.** A test written after
   the code passes immediately, which says nothing about whether it can fail.
   Break the branch it targets, watch that test fail, restore. This is the step
   that separates margin from theatre, and in Linked Data Explorer it caught five
   of thirty-one new tests asserting nothing.
10. **Enumerate every branch a ruleset does _not_ name.** Protection is scoped to
    the refs it includes and to nothing else, and `main` is the branch most likely
    to have been forgotten — it is also the one that deploys. Ask the same
    question of protected environments: they cover the jobs that declare them, not
    the workflows that deploy alongside.
11. **Read a ruleset back after writing it.** Omitted parameters are not
    false — GitHub fills them with its own defaults, and one of those defaults can
    require an approval nobody is able to give. The create response's shape does
    not show it; fetching the stored ruleset does.
12. **Predict what a merge deploys from the whole `paths:` list.** A workflow that
    names its own file in its filter fires when only that file changed, so a
    repository-wide pass over workflows rearms every such filter at once.
13. **Re-count the queue after a gating rule lands, not before.** A rule that
    holds new pull requests back leaves open ones where they are, and anything
    opened between writing it and merging it slips through. Count from the
    platform's own API — search can lag a close by seconds — and act on what is
    open then.
14. **Before enabling a refresh, run it once where you can see it fail.** An
    in-range lockfile refresh in a scratch worktree, then a scan, predicts the
    outcome and exercises the tool that has to do the work. It is how
    ttl-editor's 7 → 0 was known before any configuration changed, and how
    npm 10's resolver crash was found before it could surface as a failed
    Renovate pull request.
15. **Diff the acceptance and production workflows whenever either changes.**
    Two files deploying one application drift a step at a time, and acceptance
    working says nothing about production. Linked Data Explorer's production
    backend shipped without its SHACL shapes for three months that way.
16. **Make a post-deploy check identify the build that answered.** The deploy
    step returning does not mean the new build is serving; the old one can
    answer for a minute or more, and an HTTP 200 check passes against either.
    Assert the deployed commit where the application can report it.
17. **Check the install against the lockfile before a dev server starts.** A
    fast-forward moves the lockfile and installs nothing. Compare parsed JSON
    rather than bytes, name `npm ci`, and write the snapshot in Node wherever a
    container you do not own runs `postinstall`.
18. **Close preview environments from a workflow with no path filter, and look for
    orphans from outside.** A path filter applies to the `closed` event too, and
    GitHub starts no `pull_request` workflow for a pull request with a merge
    conflict, so a close job alone leaves previews behind. At each release, list
    what the platform actually holds against the open pull requests.
19. **Read the Dependency Dashboard before writing "Renovate cannot see it".** Its
    detected-dependencies list shows what each manager extracted, file by file.
    zizmor's version input was on it in two repositories whose registers said it
    was maintained by hand.
20. **Exempt lock-file maintenance from the pull-request limits.** Holding majors
    behind approval does not keep it a slot: Renovate counts every open Renovate
    pull request, security ones included, and the refresh is eligible only inside
    its schedule. `prConcurrentLimit: 0` and `prHourlyLimit: 0` on its own rule
    exempt that branch alone.
