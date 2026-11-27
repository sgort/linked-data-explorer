# Dependency register gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new direct dependency (per manifest) or a too-young package version blocks `lockfile-review` until the repository's committed `dependency-register.json` records an evidence-consistent assessment or a logged override — in LDE first, then ttl-editor and RBA.

**Architecture:** `lockfile-diff.mjs` stays offline and synchronous; it only gets the per-manifest "new" rule and stops rendering checkboxes. A new shared script, `scripts/dependency-gate.mjs`, does the networked part (registry + GitHub, reusing `dependency-review.mjs`'s fetch helpers): it validates the register, checks each new dependency's entry against gathered evidence, and checks publish ages. It runs in the existing required `lockfile-review` job and appends its section to the same comment. `dependency-review.mjs` (quarterly) lists open overrides, `replace` outcomes and Renovate security exceptions.

**Tech Stack:** Node 24 ESM scripts with no dependencies, self-contained `*.test.mjs` (no runner: `check()`/`throws()`, PASS count, exit 1), GitHub Actions (`zizmor.yml`), npm registry and GitHub REST API.

**Spec:** `docs/superpowers/specs/2026-11-27-dependency-register-gate-design.md` (this repo). Companion: ronl-business-api `docs/superpowers/specs/2026-11-27-npm-cooldown-node-24-design.md` §6.2.

## Global Constraints

- Shared scripts (`lockfile-diff.mjs`, `dependency-gate.mjs`, `dependency-review.mjs` and their tests) are identical in LDE and RBA; ttl-editor differs only by its Prettier style (single quotes). Each copy's header names the LDE commit it was taken from.
- Exit codes everywhere: 0 clean, 1 blocking, 2 could not evaluate (network, parse, API) — never read as clean.
- Register: `dependency-register.json` at the repo root; root manifest is spelled `"(root)"` (as `directDependencies()` does); six criteria keys exactly `maintained`, `maintainers`, `licence`, `releasePolicy`, `footprint`, `needed`.
- A `why` is ≥ 40 characters and not identical to another `why` in the same entry; `needed` always has one; every `holds: false` has one.
- `lockfile-review.json` gains `"minReleaseAgeDays": 14`.
- Renovate security exemption: `PR_AUTHOR === "renovate[bot]"` **and** `"security"` ∈ PR labels — both, never one.
- Issues referenced by `followUp`, `override.issue`, `cooldownOverrides[].issue` must exist and be open.
- **No commits by implementers.** Each task ends with its files staged and a report; the controller asks the user before every commit (global CLAUDE.md). No Claude attribution in commits, PRs or files. Never `--no-verify`. Never start/stop dev servers. No pushes to `acc`/`main`; each repo gets one PR into `acc`, opened after the user's go-ahead.
- Workflow values reach scripts through `env:`, never `${{ }}` inside `run:` (zizmor template-injection rule).

## Review Focus

1. A lock-file maintenance PR changing hundreds of packages: one packument fetch per **name**, bounded concurrency (8, as `mapLimited`), retry 429/5xx up to 3 times, then exit 2 — test in Task 3 with a fake fetch that 429s twice then answers.
2. A package removed from one manifest and added to another in the same PR, or moved between fields of one manifest: only the new (name, manifest) pair needs an entry; a field move needs none — tests in Task 1.
3. A register entry for a scoped name (`@types/jsonwebtoken`) and a registry URL needing `%2f` — test in Task 3.
4. Lockfile entries with no registry version to age (`link: true` workspaces, `inBundle`, non-registry `resolved`): skipped by the cooldown check, never fetched — test in Task 3.
5. A malformed `dependency-register.json` on a PR that does not touch the lockfile: still fails (the register check runs before the early exit) — Task 4 workflow step plus a Task 2 parse test.

---

### Task 1: Per-manifest "new direct dependency" and no more checkboxes (LDE)

**Files:**
- Modify: `scripts/lockfile-diff.mjs:281-329` (DIRECT_FIELDS, `newDirectDependencies`), `:332-346` (`parseConfig`), `:388-430` (`renderReport` new-dependency section)
- Modify: `lockfile-review.json` (add `minReleaseAgeDays`)
- Test: `scripts/lockfile-diff.test.mjs`

**Interfaces:**
- Produces: `newDirectDependencies(baseDoc, headDoc) → Array<{name, manifest, field}>` (same shape, new rule); `parseConfig(text, label) → { allow: Set<string>, minReleaseAgeDays: number }`; `DIRECT_FIELDS` includes `"peerDependencies"`.

- [ ] **Step 1: Write failing tests** in `lockfile-diff.test.mjs`:
  - `new-direct: spread to another manifest` — base has `@axe-core/playwright` in `packages/public-site` devDependencies, head adds it to `packages/frontend` → `[{name:"@axe-core/playwright", manifest:"packages/frontend", field:"devDependencies"}]`.
  - `new-direct: field move in one manifest is not new` — `dependencies` → `devDependencies` in `packages/backend` → `[]`.
  - `new-direct: peerDependencies count` — head adds a peer → one entry, `field:"peerDependencies"`.
  - `config: minReleaseAgeDays read` → `14`; `config: missing minReleaseAgeDays` throws `InputError` /minReleaseAgeDays/; non-integer or < 0 throws.
  - `report: no checkboxes` — `renderReport({…, newDirect:[…]})` contains no `"- [ ]"` and contains `"dependency-register.json"`.
- [ ] **Step 2:** `node scripts/lockfile-diff.test.mjs` → the new checks FAIL.
- [ ] **Step 3: Implement.** Key the base set by `` `${name}\u0000${manifest}` `` across all fields; `parseConfig` requires integer `minReleaseAgeDays >= 0`; the report's section becomes a short list of `name in manifest (field)` plus one sentence: each needs an entry in `dependency-register.json`, checked by the dependency gate below (link `CRITERIA_URL`). Update the doc comment at `:313-316` with the reason (a new manifest changes where it runs; @axe-core/playwright, #413).
- [ ] **Step 4:** `node scripts/lockfile-diff.test.mjs` → PASS, 0 failures; `node scripts/lockfile-diff.mjs <scratch>/rba413-base.json <scratch>/rba413-head.json --config lockfile-review.json` (copies in the session scratchpad) now lists `@axe-core/playwright` in `packages/frontend`.
- [ ] **Step 5:** Stage; report to controller.

### Task 2: Register model and pure gate evaluation (LDE)

**Files:**
- Create: `scripts/dependency-gate.mjs` (pure part + CLI shell), `scripts/dependency-gate.test.mjs`

**Interfaces:**
- Consumes: `InputError`, `licenceAllowed`, `newDirectDependencies`, `collectPackages`, `diffPackages`, `parseLockfile`, `parseConfig` from `lockfile-diff.mjs`; `assess`-style signals from Task 3's evidence.
- Produces:
  - `parseRegister(text, label) → { dependencies: Entry[], cooldownOverrides: CooldownOverride[] }` — throws `InputError` naming the entry and field on any shape error (spec §4.1 shape; `status` ∈ `assessed|override`; `outcome` ∈ `keep|replace`; `replace` ⇒ integer `followUp`; `override` ⇒ `override.reason` + integer `override.issue`; duplicate (name, manifest) is an error).
  - `signalsFor(evidence, lockEntry, now, allow) → { maintained: string|null, maintainers: string|null, licence: string|null, footprint: string|null, fatal: string|null }` — a string is the reason the criterion cannot hold; `fatal` = deprecated or archived.
  - `evaluateNewDependency(dep, entry, signals, lockedVersion, ctx) → { blocking: string[], warnings: string[] }`; `ctx = { renovateSecurity: boolean, issueOpen: (n) => boolean }`.
  - `evaluateCooldown(changed, publishedAt, now, minDays, overrides, ctx) → { blocking, exceptions }` where `changed = [{name, version}]`, `publishedAt: Map<"name@version", ISOstring>`.
  - `renderGate({ rows, cooldown, renovateSecurity }) → string` (markdown section, heading `#### Dependency gate`).

- [ ] **Step 1: Write failing tests** (one `check` each):
  - `register: valid entry parses`; `register: duplicate (name, manifest)` throws /duplicate/; `register: replace without followUp` throws /followUp/; `register: malformed JSON` throws `InputError`.
  - `gate: missing entry` → blocking `/no entry in dependency-register.json/`.
  - `gate: holds true against a failing signal` — signals.maintainers = "one maintainer, no organisation", entry `maintainers:{holds:true}` → blocking `/maintainers/`.
  - `gate: needed without why` → blocking; `gate: why of 39 chars` → blocking; `gate: two identical whys` → blocking.
  - `gate: deprecated + keep` → blocking; `deprecated + replace + open followUp` → no blocking; `+ closed followUp` → blocking `/#\d+ is not open/`.
  - `gate: assessed major differs` — entry `assessed.version:"3.2.2"`, locked `4.1.0` → blocking `/major/`.
  - `gate: override with open issue` → no blocking, one warning `/override/`.
  - `gate: renovate security, no entry` → no blocking, warning `/still to assess/`.
  - `cooldown: 13-day-old version` → blocking; `14-day-old` → clean (boundary: age in ms ≥ `minDays * 86400000`).
  - `cooldown: young + renovateSecurity` → no blocking, one exception with name, version, published date, age in days.
  - `cooldown: young + matching cooldownOverride (open issue)` → no blocking, exception lists the issue; `+ closed issue` → blocking.
  - `render: names are code-escaped` — a name containing a backtick does not break the code span (reuse the `code()` escaping of `lockfile-diff.mjs`).
- [ ] **Step 2:** `node scripts/dependency-gate.test.mjs` → FAIL (module missing).
- [ ] **Step 3: Implement** the five functions. Signal mapping (spec §4.3 rule 3): no release ≥ 12 months or none recorded → `maintained`; `maintainers <= 1` and `orgOwned !== true` → `maintainers`; licence missing or not `licenceAllowed` → `licence`; `lockEntry.hasInstallScript` → `footprint`; `deprecated` or `archived === true` → `fatal`. Renovate security skips rules 1–6 for a missing entry (warn) but an entry that exists is still checked.
- [ ] **Step 4:** `node scripts/dependency-gate.test.mjs` → PASS.
- [ ] **Step 5:** Stage; report.

### Task 3: Evidence gathering and the CLI (LDE)

**Files:**
- Modify: `scripts/dependency-review.mjs:219-270` (export `fetchJson`, `gather`, `mapLimited`; add retry)
- Modify: `scripts/dependency-gate.mjs` (add `main`)
- Test: `scripts/dependency-gate.test.mjs`, `scripts/dependency-review.test.mjs`

**Interfaces:**
- Produces: `fetchJson(url, headers?, { fetchImpl = fetch, retries = 3 }?)` (retries 429/5xx with backoff, then throws); `gather(row, token, opts?)`; `mapLimited(items, limit, fn)`.
- CLI: `node scripts/dependency-gate.mjs <base-lockfile> <head-lockfile> [--config lockfile-review.json] [--register dependency-register.json] [--out file] [--comment file]`, and `node scripts/dependency-gate.mjs --check-register [--register file]` (offline: parse only, exit 0/2). Env: `GITHUB_TOKEN`, `GITHUB_REPOSITORY`, `PR_AUTHOR`, `PR_LABELS` (JSON array of names).

- [ ] **Step 1: Write failing tests:** `fetchJson retries 429 twice then succeeds` (fake `fetchImpl`); `fetchJson gives up after 3` throws; `changedVersions skips link/inBundle/non-registry entries` (export `changedVersions(baseDoc, headDoc) → [{name, version}]` from the gate, built on `collectPackages`/`diffPackages`: added versions + `to` versions not in `from`); `scoped name is %2f-encoded` (URL built by an exported `packumentUrl(name)`); CLI `--check-register` on a malformed file exits 2.
- [ ] **Step 2:** Run both test files → FAIL.
- [ ] **Step 3: Implement.** `main` fetches one packument per distinct name (union of new direct deps and changed versions) through `mapLimited(…, 8, …)`; GitHub repo data only for new direct deps; issue states via `GET repos/{GITHUB_REPOSITORY}/issues/{n}` for every referenced number; `renovateSecurity` from env. Any fetch failure → `InputError` path → exit 2 with `renderFailure`-style report written to `--out`/`--comment`. Exit 1 if any blocking.
- [ ] **Step 4:** Tests PASS. Live smoke (read-only, network): `node scripts/dependency-gate.mjs <scratch>/rba413-base.json <scratch>/rba413-head.json --register <scratch>/empty-register.json` → exit 1, blocking names `@axe-core/playwright` in `packages/frontend`.
- [ ] **Step 5:** Stage; report.

### Task 4: Workflow wiring and quarterly listing (LDE)

**Files:**
- Modify: `.github/workflows/zizmor.yml:257-309` (job `lockfile-review`)
- Modify: `.github/workflows/dependency-review.yml` (paths filter: add `scripts/dependency-gate.mjs`, `dependency-register.json`)
- Modify: `scripts/dependency-review.mjs` `renderReview` and `main` (register section)
- Test: `scripts/dependency-review.test.mjs`

**Interfaces:**
- Consumes: Task 3 CLI. Produces: `renderReview({ …, register, securityExceptions })` adds a section **"Register: still open"** listing entries with `status:"override"`, entries with `outcome:"replace"` (with `#followUp`), and `cooldownOverrides`; and **"Renovate security exceptions this quarter"** from `securityExceptions = [{number, title, mergedAt}]`.

- [ ] **Step 1: Failing tests** in `dependency-review.test.mjs`: `review lists open overrides`, `review lists replace outcomes with follow-up`, `review lists security exceptions`, `review without register says "no register entries open"`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement; `main` reads `dependency-register.json` if present (absent → empty) and, with a token, `GET search/issues?q=repo:{repo} is:pr is:merged label:security author:app/renovate merged:>={quarterStart}`.
- [ ] **Step 4: Workflow.** In `lockfile-review`: add `issues: read` and `pull-requests: read` permissions; a step **before** "Compare…" running `node scripts/dependency-gate.test.mjs` and `node scripts/dependency-gate.mjs --check-register`; in "Compare…", after `lockfile-diff.mjs`, run the gate with `--out "$RUNNER_TEMP/gate.md" --comment "$RUNNER_TEMP/gate-comment.md"`, append both to `report.md`/`comment.md` before they are emitted, and `exit` the larger of the two statuses. Env added to that step: `GITHUB_TOKEN: ${{ github.token }}`, `PR_AUTHOR: ${{ github.event.pull_request.user.login }}`, `PR_LABELS: ${{ toJSON(github.event.pull_request.labels.*.name) }}`. Keep `truncateForComment` applied to the combined comment.
- [ ] **Step 5: Verify:** tests PASS; `npx --no-install zizmor .github/workflows/zizmor.yml` if the repo's zizmor job has a local command (else rely on CI) → no new findings; `actionlint` if present.
- [ ] **Step 6:** Stage; report.

### Task 5: LDE register, retroactive entries, follow-up issues, docs

**Files:**
- Create: `dependency-register.json`
- Modify: `docs/dependency-criteria.md:85-94` ("Adding a dependency (R1)") and its "Quarterly review" section; `SECURITY-PIPELINE.md:279-280` → new subsection "New dependencies: the register gate"; `docs/ICTU-dependencies-assessment.md` only a pointer if it describes the checklist (L70-75).

- [ ] **Step 1: Issues (controller asks the user once before creating them):** in sgort/linked-data-explorer — "Replace jsonwebtoken and jwks-rsa with jose in the backend" (evidence: last release 2025-12-04, one publisher, no provenance; `jose` already in the tree via jwks-rsa); "keycloak-js 23.0.7: move with the Keycloak 26 server migration"; "limiter (via jwks-rsa) has no licence recorded" (#331).
- [ ] **Step 2: Entries** for `keycloak-js` (`packages/frontend`), `jsonwebtoken`, `jwks-rsa`, `@types/jsonwebtoken`, `tsx` (`packages/backend`), using the evidence and outcomes of spec §5 (added: PR #331 2026-11-12, tsx #354 2026-11-22; assessed 2026-11-27 at the locked versions 23.0.7, 9.0.3, 3.2.2, 9.0.10, 4.23.15). `jsonwebtoken`/`jwks-rsa` outcome `replace` with the new issue; keycloak-js `keep` with its follow-up.
- [ ] **Step 3: Verify the entries against the gate:** run `node scripts/dependency-gate.mjs <empty-lock> package-lock.json` (empty base `{"lockfileVersion":3,"packages":{}}` with only these five considered — add a `--only name@manifest,…` option only if needed; otherwise a throwaway base lockfile with the five removed from the manifests) → exit 0, no contradictions.
- [ ] **Step 4: Docs.** `dependency-criteria.md` R1 procedure becomes: add the entry in the same PR; what the gate checks (rules 1–6); the person's override; the Renovate-security automatic route; where the quarterly review lists them. Replace "tick what holds" everywhere. SECURITY-PIPELINE subsection: same in three paragraphs, linking the register.
- [ ] **Step 5:** `npx prettier --check` on changed md/json; `npm run test:scripts` → PASS. Stage; report. **Batch end:** controller hands the user `node scripts/lockfile-diff.test.mjs && node scripts/dependency-gate.test.mjs && node scripts/dependency-review.test.mjs` and waits for green, asks to commit, then asks to push the branch and open the LDE PR. Verification on the PR: the controller, with the user's go-ahead, opens a throwaway draft PR from a branch off this one that adds a dependency without an entry, confirms `lockfile-review` fails with the gate's message, then closes it and deletes the branch.

### Task 6: Port to ttl-editor

**Files:** `scripts/lockfile-diff.mjs`, `scripts/dependency-gate.mjs`, `scripts/dependency-review.mjs`, their tests, `lockfile-review.json`, `.github/workflows/zizmor.yml` (its `lockfile-review` job, ~`:264`), `.github/workflows/dependency-review.yml`, `dependency-register.json` (new), `docs/dependency-criteria.md`, `SECURITY-PIPELINE.md:241-242`.

- [ ] **Step 1:** Branch `feat/dependency-register-gate` from `origin/acc` in `C:\Users\gorts01\Development\ttl-editor`. Copy the merged LDE scripts, run the repo's Prettier on them, set each header's source commit.
- [ ] **Step 2:** Same workflow edits as Task 4 Step 4; tests PASS.
- [ ] **Step 3:** Register: `keycloak-js` in `(root)`, PR #239 2026-11-12, locked 23.0.7, `keep` with a ttl-editor follow-up issue mirroring LDE's (controller asks before creating). Verify with the gate as in Task 5 Step 3.
- [ ] **Step 4:** Docs as Task 5 Step 4. Stage; batch-end handoff as in Task 5 (user's green → ask commit → ask PR).

### Task 7: Port to ronl-business-api

**Files:** as Task 6, with RBA paths (`zizmor.yml:342-430`, `SECURITY-PIPELINE.md:139-161`); branch `feat/dependency-register-gate` from `origin/acc` (separate from `chore/node-24-npm-cooldown`).

- [ ] **Step 1:** Copy the LDE scripts byte-identical (RBA uses LDE's Prettier style); headers.
- [ ] **Step 2:** Workflow edits as Task 4 Step 4; tests PASS.
- [ ] **Step 3:** Register: `stylelint` `(root)` devDependencies (PR #376, 2026-10-12, locked 17.16.0, keep — footprint and release-policy sentences); `@axe-core/playwright` in `packages/public-site` (added 47fbd47, 2026-08-06; licence sentence restating #362's outcome) and `packages/frontend` (PR #413, 2026-11-03; same licence reasoning checked for the frontend: test-only, never shipped), locked 4.14.0. Follow-up issue (ask first): "svg-tags (via stylelint) has no licence recorded" (#376). Verify with the gate.
- [ ] **Step 4:** Docs. Stage; batch-end handoff (user runs `npm test` and the three script tests; green → ask commit → ask PR).

### Task 8: Final report

- [ ] Collect: PR URLs per repo; follow-up issues; what changed in ICTU R1 (all three) and why — proposed for the user to record in iou-architectuur `docs/data/ictu-assessments.yml` (not edited here); anything left open (RBA's unused `jose`, the keycloak/jose follow-ups). Delete `PROMPT.md` in RBA after the user confirms the task is done.
