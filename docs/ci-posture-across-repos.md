# CI posture across the three applications

Where the CPSV Editor (`ttl-editor`), Linked Data Explorer (`linked-data-explorer`)
and RONL Business API (`ronl-business-api`) stand on three mechanisms that were
rolled out across all of them in September 2026 — build provenance, supply-chain
verification, and a per-file test-coverage floor.

Verified against each repository's `acc` at the heads below, not written from
memory.

| repository           | `acc` at  |
| -------------------- | --------- |
| ttl-editor           | `6e8e019` |
| linked-data-explorer | `36c4246` |
| ronl-business-api    | `04e38c8` |

---

## Summary

|                               | ttl-editor           | linked-data-explorer | ronl-business-api       |
| ----------------------------- | -------------------- | -------------------- | ----------------------- |
| **Build id in the changelog** | ✅                   | ✅                   | ✅                      |
| **check-supply-chain**        | ✅ blocking          | ✅ blocking          | ⚠️ non-blocking         |
| **Per-file 80% branch floor** | ✅ native thresholds | ✅ native thresholds | ✅ native thresholds    |
| **Formatting checked in CI**  | ✅                   | ✅                   | —                       |
| **Tests run before merge**    | ✅                   | ✅                   | ⚠️ frontend only        |
| **Mirror in sync**            | ✅                   | ✅                   | ⚠️ both branches differ |

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
by eye rather than inferred from a green workflow.

Two things that repository's run adds to ttl-editor's:

- **The pair is what makes it a build id.** `007b350` is the merge commit of the
  promotion pull request, and `#39` is the run that built it. A redeploy of that
  same commit would produce `#40` — which is the whole reason the run number is
  carried alongside the SHA rather than the SHA alone.
- **Reading the changelog is the check; a green deploy is not.** The workflow
  succeeds identically whether the `env:` block reached the artifact or not. That
  is the same asymmetry as ttl-editor's `output_location`: the failure mode is a
  successful-looking deploy of something wrong.

**Still wired and unexercised in the third.** RONL Business API carries the block
in its production workflow and has not run it. Worth one glance at the changelog
on its first production release.

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

### A ruleset scoped to one branch gates one branch

Worth stating because it is easy to read a repository as protected when only half
of it is. ttl-editor's `acc supply-chain gate` ruleset applies to `refs/heads/acc`
and nothing else. `main` has branch protection — a pull request is required — but
**zero required approvals and no required status checks at all**. So on the
promotion pull request, `audit` and the production build ran and reported, and
neither could have blocked the merge.

That is defensible: `main` is promoted from `acc`, and those commits already
passed the gate on their own `acc` pull request. But the promotion pull request is
the one carrying a build-system change into production, and it is gated by nobody.
Read the checks there rather than trusting the button.

The same question is worth asking of the other two: a ruleset naming one branch
says nothing about any other.

**Linked Data Explorer was asked, and had the same hole.** Its only ruleset was
`acc supply-chain gate`, `include: ["refs/heads/acc"]`, `exclude: []`. `main` had
nothing at all — not even the pull request ttl-editor's `main` requires. Anyone
could have pushed to it directly, or squashed a promotion and orphaned every SHA
cited across all seventy-five changelog entries.

Closed on 2026-09-09 with a `main promotion gate` ruleset created **before** the
promotion pull request was opened, mirroring the `acc` one: `deletion`,
`non_fast_forward`, `pull_request` with `allowed_merge_methods: ["merge"]`, and
`required_status_checks: [audit]` with `strict: false`.

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

ttl-editor and Linked Data Explorer check formatting in CI. RONL Business API
enforces `check-format` by a pre-push hook alone, so there the rule holds on a
developer's machine and not on the shared branch.

That gap is not theoretical: a Prettier 3.7 → 3.9 upgrade changed how short union
types are formatted, and five files nobody had touched began failing
`prettier --check` the moment the upgrade merged — **with every CI check green**.
The symptom would have been the next person's `git push` failing on files they had
never opened.

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

| repository           | `acc`                    | `main`                   |
| -------------------- | ------------------------ | ------------------------ |
| ttl-editor           | ✅ `6e8e019` both        | ✅ `bbda389` both        |
| linked-data-explorer | ✅ `36c4246` both        | ✅ `007b350` both        |
| ronl-business-api    | ⚠️ `04e38c8` / `66940d9` | ⚠️ `d6a3cee` / `53a4c0a` |

RONL Business API disagrees on **both** branches. Which side is ahead is not
knowable from `ls-remote` alone and is not guessed here; it needs the audit
below.

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

Nothing in place did, and nothing added since does. The mirror has no CI, so the
only signal available is comparison, and the cheapest form is the `ls-remote`
table above — four seconds, no clone, safe to run anywhere. Worth running at each
release rather than discovering the answer six months later.

---

## 6. Open work

| repository           | issue | what                                                                                   |
| -------------------- | ----- | -------------------------------------------------------------------------------------- |
| ronl-business-api    | #83   | promote check-supply-chain from non-blocking to blocking                               |
| ronl-business-api    | #84   | `@ronl/shared` has no test runner, so logic placed there escapes the floor             |
| ronl-business-api    | #85   | an unreachable `PHASE_NOT_MODELLED` branch keeps three tests permanently skipped       |
| ronl-business-api    | #87   | the backend runs no tests on a pull request, so its branch floor is retrospective      |
| linked-data-explorer | —     | `GraphView.tsx` at 82.26%: one branch of slack, behind a d3 harness                    |
| ttl-editor           | —     | three files sit within one branch of the floor, with no ratchet left to absorb a slip  |
| ronl-business-api    | —     | production build id wired but unexercised; the other two have now run theirs           |
| ttl-editor           | —     | `main` has no required status checks, so the promotion PR is gated by nobody           |
| ronl-business-api    | —     | both `acc` and `main` differ between GitHub and GitLab; unaudited                      |
| linked-data-explorer | #80   | Node 24 bump sets `engines.node >=24.20.0` but pins `24.19.0` in all four workflows    |
| linked-data-explorer | —     | changelog entry `1.9.12` still carries the legacy `Latest` status, now visible in prod |

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

The two new Linked Data Explorer rows are both things noticed while doing
something else. **#80** would have CI running a Node older than the `engines`
floor it declares in the same pull request; npm only warns without
`engine-strict`, which is why its build is green, and it wants resolving on its
own branch rather than on a release cut. The `1.9.12` row is cosmetic — a legacy
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
