# CI posture across the three applications

Where the CPSV Editor (`ttl-editor`), Linked Data Explorer (`linked-data-explorer`)
and RONL Business API (`ronl-business-api`) stand on three mechanisms that were
rolled out across all of them in September 2026 — build provenance, supply-chain
verification, and a per-file test-coverage floor.

Verified against each repository's `acc` at the heads below, not written from
memory.

| repository           | `acc` at  |
| -------------------- | --------- |
| ttl-editor           | `09087a8` |
| linked-data-explorer | `04cc38c` |
| ronl-business-api    | `04e38c8` |

---

## Summary

|                               | ttl-editor                 | linked-data-explorer | ronl-business-api    |
| ----------------------------- | -------------------------- | -------------------- | -------------------- |
| **Build id in the changelog** | ✅                         | ✅                   | ✅                   |
| **check-supply-chain**        | ✅ blocking                | ✅ blocking          | ⚠️ non-blocking      |
| **Per-file 80% branch floor** | ✅ custom script + ratchet | ✅ native thresholds | ✅ native thresholds |
| **Formatting checked in CI**  | —                          | ✅                   | —                    |
| **Tests run before merge**    | ✅                         | ✅                   | ⚠️ frontend only     |

Nothing in that table is uniform by accident. Each application has a different
build shape, and the differences below are re-derived per repository rather than
copied.

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

|                       | ttl-editor           | linked-data-explorer | ronl-business-api                         |
| --------------------- | -------------------- | -------------------- | ----------------------------------------- |
| language              | JavaScript           | TypeScript           | TypeScript                                |
| monorepo              | no                   | yes                  | yes                                       |
| changelog UI          | tab                  | full page            | lazily-loaded drawer                      |
| **who builds**        | Oryx (SWA container) | Oryx (SWA container) | **the GitHub runner**                     |
| **`env:` belongs on** | the deploy step      | the deploy step      | the **build** step                        |
| string lands in       | —                    | main `index-*.js`    | a lazy `ChangelogPanelContent-*.js` chunk |

**The `env:` placement is the difference that matters**, and getting it wrong
produces a change that passes every test and puts nothing in the artifact.

RONL Business API builds on the runner: the workflow runs `npm run build:acc` as
its own step and passes `skip_app_build: true`, so the variables belong on that
step. The other two hand the build to Oryx via `app_build_command`, so there is
no build step at all — the variables go on the **deploy** step, which is where
the Static Web Apps action picks up the runner environment to forward into its
container.

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

### Known gap

**Production is wired everywhere and exercised nowhere.** All three applications
carry the `env:` block in their production workflows, and none of those workflows
has run since. Worth one glance at the changelog on each first production release.

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

|                      | step present | blocking  | pinned refs           |
| -------------------- | ------------ | --------- | --------------------- |
| ttl-editor           | ✅           | ✅        | 11 across 3 workflows |
| linked-data-explorer | ✅           | ✅        | 23 across 7 workflows |
| ronl-business-api    | ✅           | ⚠️ **no** | 30 across 9 workflows |

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

### Why one repository is still non-blocking

RONL Business API adopted the check non-blocking and has not yet promoted it.
This is tracked, and the reason to finish it is specific:

**`continue-on-error` hides more than it looks like it hides.** It does not
merely keep the job green — it rewrites the **step's** reported conclusion too,
and the honest result (`outcome: failure`) is not exposed by the REST API at all.
Observed on a real pull request:

```
job: audit
job conclusion: success
step: Verify pin truth and register agreement -> success
```

…while that same step's log read `1 finding(s)`. The checks list, the job and the
step all said success. **Only the log told the truth.**

A check nobody can see fail is not protecting anything; it is a check that has to
be _remembered_, which is the condition the registers drifted in to begin with.

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

|                      | mechanism                                                     | state                                  |
| -------------------- | ------------------------------------------------------------- | -------------------------------------- |
| ttl-editor           | `scripts/check-branch-coverage.mjs`, run by `npm run test:ci` | `FLOOR = 80`, one debt entry remaining |
| linked-data-explorer | native thresholds in both runners                             | clean, no exemptions                   |
| ronl-business-api    | native thresholds in all five runners                         | clean, no exemptions                   |

**ttl-editor needs the custom script because Vitest cannot express the policy.**
Its `thresholds` block accepts glob keys that look like per-file overrides, but
they are _additive_ rather than overriding — a file matching a glob is still
measured against the global threshold as well. So `perFile: true` is
all-or-nothing, and that repository is not yet at 80% everywhere.

The script carries a `DEBT` list that works as a ratchet, tightening from both
ends: below its pin a file fails; more than `RATCHET_SLACK` (10 points) above its
pin it also fails, asking for the pin to be raised, so an entry cannot quietly
become permanent; at or above the floor it fails asking to be deleted; and naming
a file that no longer exists fails too.

One entry remains — `DMNTab.jsx`, the largest file in that repository, needing
145 branches. Clearing it is what allows the script to be deleted in favour of
`thresholds: { branches: 80, perFile: true }`.

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

|                               | files measured | lowest branch coverage                       |
| ----------------------------- | -------------- | -------------------------------------------- |
| ronl-business-api backend     | —              | comfortable                                  |
| linked-data-explorer backend  | 49             | `sparql.service.ts` 82.85%                   |
| linked-data-explorer frontend | 64             | **`CaseworkerCasePanel.tsx` exactly 80.00%** |

Thresholds pass at `>= 80`, so that file is green with **zero margin**, and
thirteen more sit between 80 and 85. The first uncovered branch added to any of
them turns CI red on an otherwise unrelated change. That is the floor working, but
it is worth meeting in a config comment rather than in a surprising failure.

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
| ronl-business-api    | ⚠️ **frontend, pa-demo and public-site only**                                            |

**RONL Business API's backend workflow triggers on `push` alone**
([ronl-business-api#87](https://github.com/sgort/ronl-business-api/issues/87)).
Its 2008 tests run only _after_ a merge, so its backend branch threshold gates
nothing on a pull request — it would fail on `acc`, after the fact, rather than
on the branch that caused it. The floor is real in four of its five workspaces
and retrospective in the fifth.

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

### Formatting

Only Linked Data Explorer checks formatting in CI. Elsewhere `check-format` is
enforced by a pre-push hook alone, so the rule holds on a developer's machine and
not on the shared branch.

That gap is not theoretical: a Prettier 3.7 → 3.9 upgrade changed how short union
types are formatted, and five files nobody had touched began failing
`prettier --check` the moment the upgrade merged — **with every CI check green**.
The symptom would have been the next person's `git push` failing on files they had
never opened.

Two mechanics matter if this is replicated:

- **Run the repository's own Prettier** (`npm ci` first), not a version named in
  the workflow. A second pinned version is a second thing to keep in step, which
  reintroduces exactly the drift the check exists to catch.
- **Run the per-workspace fan-out**, not `prettier --check .` from the root.
  Prettier resolves `.prettierignore` relative to the working directory, so a
  root-level run would silently check `dist/` and `coverage/` and disagree with
  what the pre-push hook enforces.

---

## 5. Open work

| repository           | issue | what                                                                                   |
| -------------------- | ----- | -------------------------------------------------------------------------------------- |
| ttl-editor           | #103  | bring `DMNTab.jsx` to the floor (145 branches), then retire the custom coverage script |
| ronl-business-api    | #83   | promote check-supply-chain from non-blocking to blocking                               |
| ronl-business-api    | #84   | `@ronl/shared` has no test runner, so logic placed there escapes the floor             |
| ronl-business-api    | #85   | an unreachable `PHASE_NOT_MODELLED` branch keeps three tests permanently skipped       |
| ronl-business-api    | #87   | the backend runs no tests on a pull request, so its branch floor is retrospective      |
| linked-data-explorer | —     | `CaseworkerCasePanel.tsx` sits at exactly 80.00% with no margin                        |
| all three            | —     | production build ids are wired but unexercised                                         |

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
   ratchet approach instead.
5. **Check where tests actually run.** A threshold enforced only after the merge
   is a report, not a gate.
6. **Prove each gate by making it fail**, and confirm the failure names the file
   or the action. A green run proves nothing about a check that is silently
   inert.
