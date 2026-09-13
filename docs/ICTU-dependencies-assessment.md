# ICTU dependency recommendations — assessment of the three applications

Scores for the CPSV Editor (`ttl-editor`), Linked Data Explorer
(`linked-data-explorer`) and RONL Business API (`ronl-business-api`) against the
eleven recommendations in [`ICTU-dependencies-guideline.md`](ICTU-dependencies-guideline.md).

Assessed on **13 September 2026**, against each repository's `acc`. Every score
below is derived from the repositories, their workflow logs and the GitHub API —
not from memory, and not from what the repositories are meant to do. Where a
recommendation is about a human practice that leaves no trace in a repository
(reading release notes, checking whether a project is maintained), it is scored
on the evidence that exists, and the absence of evidence is scored as absence.

| repository           | `acc` at  |
| -------------------- | --------- |
| ttl-editor           | `f7fe80f` |
| linked-data-explorer | `1babd54` |
| ronl-business-api    | `28e1a9e` |

---

## Scale

| score | meaning                                      |
| ----- | -------------------------------------------- |
| 0     | absent, or contradicted by the repository    |
| 1     | incidental only — no deliberate practice     |
| 2     | partly met, with large gaps                  |
| 3     | mostly met, with a clear gap                 |
| 4     | met, with a small gap                        |
| 5     | fully met, and enforced rather than intended |

## Scores

| #         | Recommendation                                              |  LDE   |  TTL   |  RBA   |
| --------- | ----------------------------------------------------------- | :----: | :----: | :----: |
| 1         | Vet maintenance before adding a dependency                  |   1    |   1    |   2    |
| 2         | No unpinned tags                                            |   2    |   2    |   2    |
| 3         | Pin at the highest precision, no ranges                     |   2    |   2    |   2    |
| 4         | Hash pins, lockfile in version control, `npm ci`            |   2    |   3    |   3    |
| 5         | Internal registry or proxy; verify where packages come from |   0    |   0    |   0    |
| 6         | Cooldown of at least 7 days, configured in the tools        |   3    |   3    |   3    |
| 7         | Assess the risk of a major; wait for a patch release        |   3    |   4    |   3    |
| 8         | Periodic, tool-driven updates                               |   4    |   5    |   3    |
| 9         | Updates through a reviewed MR, full pipeline, no automerge  |   3    |   3    |   2    |
| 10        | Daily audit or SBOM scan, including released versions       |   2    |   2    |   1    |
| 11        | Quarterly check that dependencies are still maintained      |   1    |   1    |   1    |
| **Total** | **of 55**                                                   | **23** | **26** | **22** |

None of the three is close to the guideline, and the ordering is less
interesting than the pattern: all three are strong where tooling does the work
(pinned actions, Renovate, cooldowns) and weak where the guideline asks for
infrastructure that does not exist here (#5), for monitoring on a schedule
(#10), or for a human process with a written trace (#1, #11).

---

## Evidence per recommendation

### 1 — Vet maintenance before adding a dependency

No repository documents criteria for choosing a dependency.

RBA's score rests on informal evidence only: four of its plans in
`docs/superpowers/` state explicitly that they add no new dependency, and one
design note (`2026-08-25-validsign-phase-approval-signing-design.md`) records why
`pdfkit` was chosen over `pdf-lib`. That reason is about fit, not maintenance —
it shows deliberation, not the check this recommendation asks for.

### 2 — No unpinned tags

Pinned in all three: every `uses:` reference (by digest, verified by a blocking
`check-supply-chain`), zizmor's `version: '1.29.0'`, Semgrep `1.176.1`, and the
`renovate@44.50.3` config validator.

Not pinned:

| where                               | LDE | TTL | RBA | notes                                                                            |
| ----------------------------------- | :-: | :-: | :-: | -------------------------------------------------------------------------------- |
| `runs-on: ubuntu-latest`            |  ✗  |  ✗  |  ✗  | every job, every workflow                                                        |
| `staticappsclient:stable` container |  ✗  |  ✗  |  ✗  | hardcoded inside `Azure/static-web-apps-deploy`; unreachable from our side       |
| … and it **builds** what ships      |  ✗  |  ✗  |  —  | RBA sets `skip_app_build: true`; see #4                                          |
| App Service runtime `NODE\|22-lts`  |  ✗  |  —  |  ✗  | backend host runtime floats within the major                                     |
| `:latest` container images          |  —  |  —  |  ✗  | `operaton:latest`, `alpine:latest` (local); `skosmos:latest` in `deployment/vm/` |

The second row matters more than it looks. In TTL and LDE's frontend the floating
container does not merely upload the site: it runs Oryx, and Oryx — not the
repository — chooses the toolchain. Both builds logged
`Oryx Version: 0.2.20260109.4` and `Downloading and extracting 'nodejs' version
'22.22.0'`. TTL's build also downloaded PHP 8.0.30 and Composer 2.6.2, which it
does not use. None of those versions is chosen by the repository.

### 3 — Pin at the highest precision, no ranges

All three are applications, not libraries, and nearly every version specifier is
a caret range:

| repository | caret | tilde | exact | other                                  |
| ---------- | :---: | :---: | :---: | -------------------------------------- |
| LDE        |  74   |   1   |   0   | —                                      |
| TTL        |  30   |   0   |   0   | —                                      |
| RBA        |  154  |   0   |   0   | 6 × `*` for its own workspace packages |

The committed lockfile hides this in CI. It does not hide it where a deploy runs
`npm install` without the lockfile — see #4 — and there the ranges decide what
ships.

Node: RBA pins an exact `22.22.0` in `.nvmrc`, read by every deploy workflow; LDE
pins exact literals per workflow (`20.20.2`, `22.23.2`, `24.19.0`, tracked in
[#113](https://github.com/sgort/linked-data-explorer/issues/113)); TTL requests
`'24'`, a major only. RBA's container images use `16-alpine`, `7-alpine` and
`23.0`.

### 4 — Hash pins, lockfile in version control, `npm ci`

Met in all three: action digests with version comments — the guideline's own
example, `actions/checkout@3d3c42…ba90b1 # v7.0.1`, is the pin all three
repositories carry — a committed `package-lock.json`, and `npm ci` for every CI
test run.

**What ships is weaker than what is tested**, and in a different way per
repository:

| deployable               | installed with                                                  | lockfile honoured?                                                      |
| ------------------------ | --------------------------------------------------------------- | ----------------------------------------------------------------------- |
| LDE backend (acc, prod)  | `npm install --production` in `deploy/`, `package.json` only    | **no — not copied**                                                     |
| LDE frontend (acc, prod) | Oryx `npm install` inside the SWA container                     | present, not enforced                                                   |
| TTL (acc, prod)          | Oryx `npm install` inside the SWA container                     | present, not enforced                                                   |
| RBA backend              | manual `deploy-backend-to-*.sh`, `npm install` without lockfile | **no** ([RBA#34](https://github.com/sgort/ronl-business-api/issues/34)) |
| RBA frontends (×3)       | `npm ci` on the runner, uploaded with `skip_app_build: true`    | yes                                                                     |

Established from the deploy logs, not from the workflow files alone:

- [LDE run 34612031473](https://github.com/sgort/linked-data-explorer/actions/runs/34612031473):
  the runner step `npm ci` installed 1,288 packages on Node **20.20.2** for lint
  and tests; the `Azure/static-web-apps-deploy` step then logged
  `Running 'npm install'` on Node **22.22.0**.
- [TTL run 34622800899](https://github.com/sgort/ttl-editor/actions/runs/34622800899):
  `npm ci` on Node **24** for tests; Oryx then `Running 'npm install'` on Node
  **22.22.0**, reporting `up to date, audited 542 packages`.

TTL's install matched its lockfile in that run. That is the likely outcome, not a
guaranteed one: where `package.json` and the lockfile disagree, `npm ci` fails and
`npm install` quietly re-resolves.

The second consequence is the one that decides #2 and #3 as well: **in TTL and
LDE's frontend, the code that passed the tests and the code that ships are built
on different Node versions**, and the shipped one is chosen by a floating
container. RBA had the same class of gap until its C7 alignment, and does not
have this instance of it because its frontends are built on the runner.

Also unhashed: `pip install semgrep==1.176.1` has no `--require-hashes`, and
`npx --package renovate@44.50.3` resolves by version only. RBA's container images
carry no digests.

### 5 — Internal registry or proxy; verify origin

| repository | resolved URLs in `package-lock.json` | `.npmrc` | signature or provenance check |
| ---------- | ------------------------------------ | -------- | ----------------------------- |
| LDE        | 1,337 × `https://registry.npmjs.org` | none     | none                          |
| TTL        | 567 × `https://registry.npmjs.org`   | none     | none                          |
| RBA        | 1,364 × `https://registry.npmjs.org` | none     | none                          |

Oryx additionally downloads its platforms from `oryx-cdn.microsoft.io`.

Scored 0 in all three because nothing here addresses it. It is also the
recommendation least fixable from inside a repository: it needs a registry or
proxy to exist first.

### 6 — Cooldown of at least 7 days, configured in the tools

All three set `minimumReleaseAge: "14 days"` with `internalChecksFilter: "strict"`,
and a `vulnerabilityAlerts` override (`minimumReleaseAge: null`) so security fixes
skip it — the exception the guideline allows.

The gap is the transitive tree, which is most of it (RBA: 1,266 npm dependencies).
Renovate's [minimum release age documentation](https://docs.renovatebot.com/key-concepts/minimum-release-age/)
marks `lockFileMaintenance` as **not** honouring `minimumReleaseAge` — "not
possible, as we delegate to the package manager" — and recommends configuring the
cooldown in the package manager as well. All three run lock-file maintenance
every Monday; none has a package-manager-level cooldown. So each weekly refresh
can pull a transitive version published that morning, and so can any `npm install`
a developer runs locally.

The guideline names `min-release-age` in `.npmrc`. Whether the npm bundled with
Node 22 — which LDE's backend and RBA build on — supports it has not been
verified, and should be before it is relied on.

### 7 — Assess the risk of a major; wait for a patch release

All three hold major updates behind Dependency Dashboard approval, so no major
arrives without a human choosing it. None has a rule that waits for the first or
second patch release of a new major.

TTL scores higher because it writes the assessment down: its `renovate.json`
defers Tailwind CSS 4 and ESLint 10 with reasons — ESLint 10 because three plugins
do not yet declare support and `npm` installs anyway with only a warning, so a v10
pull request would go green while broken. That is the assessment this
recommendation asks for. RBA has 31 majors queued behind the checkbox, none yet
assessed.

### 8 — Periodic, tool-driven updates

| repository | Renovate PRs merged, last 30 days | open | lock-file maintenance         |
| ---------- | :-------------------------------: | :--: | ----------------------------- |
| TTL        |                19                 |  2   | weekly                        |
| LDE        |                17                 |  5   | weekly                        |
| RBA        |                 7                 |  12  | weekly, **first run pending** |

RBA held a global `dependencyDashboardApproval` until 12 September 2026, which kept
most updates from being raised at all. Its configuration now matches the other
two; its cadence has not yet had time to.

### 9 — Updates through a reviewed MR, full pipeline, no automerge

Met in all three: no automerge anywhere, every update arrives as a pull request,
and merge commits are the only merge method.

Not enforced anywhere: that **the whole pipeline** succeeds. The rulesets require:

| repository | `acc`           | `main`                                                                                       |
| ---------- | --------------- | -------------------------------------------------------------------------------------------- |
| LDE        | `audit`, `scan` | `audit`, `scan`                                                                              |
| TTL        | `audit`, `scan` | — (no required checks, decided in [TTL#131](https://github.com/sgort/ttl-editor/issues/131)) |
| RBA        | `audit`         | `audit`                                                                                      |

No repository requires its build or test job. A red build on a dependency pull
request does not block its merge — RBA's axios security update (RBA#109) failed its
backend build and would have been mergeable. LDE and TTL at least require `scan`,
which catches newly known vulnerabilities at merge time; RBA runs it without
requiring it.

No repository has tooling for the transitive review the guideline describes: new
runtime dependencies, new origins, downgrades, or licence changes in a lockfile
diff.

### 10 — Daily audit or SBOM scan, including released versions

No workflow in any of the three has a `schedule:` trigger. There is no daily
`npm audit`, no SBOM, no Dependency-Track, and nothing scans the dependencies of
released versions. Semgrep Supply Chain runs only on push and pull request.

Dependabot alerts are enabled in all three, and are the only continuous
monitoring. They cover the default branch — `acc` — which is not what production
runs.

| repository | open alerts                                      | dismissed with a reason |
| ---------- | ------------------------------------------------ | :---------------------: |
| TTL        | 0                                                |            0            |
| LDE        | 3 (medium)                                       |            0            |
| RBA        | **154** — 2 critical, 54 high, 83 medium, 15 low |          **0**          |

The recommendation asks for each finding to be mitigated **or explicitly
accepted**. RBA has done neither for any of 154, the oldest open since 29 August 2026.

### 11 — Quarterly check that dependencies are still maintained

No repository has a periodic review, a document describing one, or an issue
recording one. Renovate's dependency dashboard does list deprecations — RBA's
flags `@types/uuid` — which is the whole of the credit here: a signal that nobody
is scheduled to read.

---

## Improvements, highest leverage first

1. **Build static web apps on the runner and deploy with `skip_app_build: true`**
   (TTL, LDE frontend). One change removes Oryx's `npm install`, makes the shipped
   build use the Node version the tests ran on, and takes the floating container
   out of the build path. Improves #2, #3 and #4 at once. RBA already does this.
2. **Deploy backends from the lockfile** — copy `package-lock.json` into the deploy
   package and run `npm ci --omit=dev` (LDE backend workflows; RBA deploy scripts,
   RBA#34). Improves #3 and #4.
3. **Add a package-manager cooldown** so lock-file maintenance and local installs
   respect it too (all three). Verify npm support first. Improves #6.
4. **Pin the runner image** — `ubuntu-24.04` instead of `ubuntu-latest` (all three).
   Improves #2.
5. **Add a daily scheduled dependency audit**, and triage open alerts to fixed or
   explicitly accepted — RBA's 154 after its first lock-file refresh, LDE's 3.
   Improves #10.
6. **Require the build and test checks** alongside `audit` (all three; RBA also
   `scan`). Improves #9.
7. **Review transitive changes on dependency pull requests** — new packages,
   downgrades, licence changes. Improves #9.
8. **Pin container images** by version and digest; remove `:latest` (RBA).
   Improves #2 and #4.
9. **Write down dependency-selection criteria and a quarterly maintenance review**
   (all three). Improves #1 and #11.
10. **Adopt a rule for majors**: wait for the first or second patch release unless
    there is a reason not to (all three). Improves #7.
11. **Decide on an internal registry or proxy and on provenance verification**
    (`npm audit signatures`) — an ICTU infrastructure question before it is a
    repository one. Improves #5.

## What was not verified

- Whether a human reads release notes or checks maintenance status before merging
  or adding a dependency. Nothing in the repositories records it either way, so
  #1, #9 and #11 score only what is recorded.
- Whether LDE's Oryx `npm install` reproduced its lockfile exactly. TTL's did in the
  run examined; LDE's log did not include the equivalent result line.
- Whether Semgrep Cloud re-evaluates a stored scan against newly published
  advisories between runs. Scored as not evidenced.
- Whether the npm version bundled with Node 22 supports the `.npmrc` cooldown the
  guideline names.

## How this was checked

- Rulesets and required checks: `gh api repos/<repo>/rulesets/<id>`.
- Workflow triggers, `runs-on`, Node versions, installs, `skip_app_build`: parsed
  from every workflow file with a YAML parser.
- Version specifiers: every `package.json`, per workspace.
- Registry origins: `resolved` URLs in each `package-lock.json`.
- Renovate policy: each `renovate.json`, loaded rather than read.
- Update activity and alerts: `gh pr list --author app/renovate` and
  `gh api repos/<repo>/dependabot/alerts`, paginated.
- What ships: the job logs of the two deploy runs linked under #4.
