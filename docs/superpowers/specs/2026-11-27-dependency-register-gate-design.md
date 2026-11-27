# A new direct dependency cannot merge without its assessment — design

Date: 2026-11-27 · Repositories: sgort/linked-data-explorer (LDE, owns the
shared scripts and `docs/dependency-criteria.md`, #250), sgort/ttl-editor (CPSV
Editor), sgort/ronl-business-api (RBA) · Base branch: `acc` in all three
Companion design: ronl-business-api
`docs/superpowers/specs/2026-11-27-npm-cooldown-node-24-design.md` (its §6.2
cooldown check is built here, in the shared script).

## 1. Intent

ICTU recommendation 1 asks that a dependency is vetted before it is added. Since
10 October 2026 the `lockfile-review` comment has shown a five-box checklist for
each new direct dependency. Seven have arrived since; none had a box ticked.
The checklist is advice. The aim: **a new direct dependency blocks the merge
until a recorded assessment exists, in a form a person cannot satisfy by
clicking**, identically in all three repositories, with a documented and logged
way through for an urgent security fix. And the seven get their assessment
after the fact, where an auditor will find it.

## 2. What is true today (evidence)

### 2.1 The checklist cannot block

- The job: `lockfile-review` in `.github/workflows/zizmor.yml` (LDE `:257`,
  ttl-editor `:264`, RBA `:342`); `on: pull_request` with no paths filter
  (LDE `:12-18`, "Deliberately NO paths filter").
- It runs `node scripts/lockfile-diff.mjs <base> package-lock.json --config
  lockfile-review.json …` (RBA `:383-385`).
- The exit status is decided by `return blocking.length ? 1 : 0;`
  (`scripts/lockfile-diff.mjs:577`). Blocking means only `origin` and `integrity`
  (`:217-233`). New direct dependencies never change it.
- `lockfile-review` **is** a required check on `acc` in all three repos
  (rulesets: RBA 21741898, LDE 21794157, ttl-editor 21728745), and every ruleset
  requires 0 approvals. So a required check exists to hang the gate on, and no
  human review is guaranteed.
- The checklist (`lockfile-diff.mjs:411-430`, boxes at `:422-426`) folds the
  criteria's "Release policy" and "Footprint" into one box: 5 boxes, where
  `docs/dependency-criteria.md:24-79` has six criteria.
- Ticks would not survive: the comment job PATCHes the bot comment with a fresh
  render on every push (RBA `zizmor.yml:425-426`).
- `docs/dependency-criteria.md:85-94` (R1 procedure): "A new direct dependency
  with unticked boxes and no explanation is not ready to merge." Nothing enforces
  it.

### 2.2 The seven, confirmed against the PR comments

| Package | Repo · manifest · field | PR (merged) | Comment |
|---|---|---|---|
| stylelint | RBA · root · devDependencies | #376 (12 Oct) — issue #374 | ronl-business-api/pull/376#issuecomment-6125361906 |
| keycloak-js | LDE · packages/frontend · dependencies | #331 (12 Nov) — issue #163 | linked-data-explorer/pull/331#issuecomment-6818082589 |
| jsonwebtoken, jwks-rsa | LDE · packages/backend · dependencies | #331 | same |
| @types/jsonwebtoken | LDE · packages/backend · devDependencies | #331 | same |
| keycloak-js | ttl-editor · root · dependencies | #239 (12 Nov) | ttl-editor/pull/239#issuecomment-6818083630 |
| tsx | LDE · packages/backend · devDependencies | #354 (22 Nov) | linked-data-explorer/pull/354#issuecomment-7077516560 |

Corrections to the prompt: #374 and #163 are issues; the PRs are #376 and #331;
both sign-in PRs merged on 12 Nov (9/10 Nov are commit dates). Zero `[x]`, zero
reviews on all four PRs. Two licence flags in the same comments were never
answered: `svg-tags` (no licence recorded, dev, #376) and `limiter` (no licence
recorded, runtime, #331). A scripted walk of every `package.json` on `acc` since
10 Oct finds no other new direct dependency in the three repos except the next.

### 2.3 Why `@axe-core/playwright` (RBA frontend, PR #413 for issue #409) got no checklist

Not a paths filter and not a parsing bug. `newDirectDependencies()` skips any
name that is direct **anywhere** in the base: `lockfile-diff.mjs:322`
`if (base.has(name)) continue;`, documented at `:313-316` ("A package already
direct elsewhere in the repository was vetted when it arrived"). `packages/public-site`
has declared it since 47fbd47 (2026-08-06). Reproduced with the PR's base and head
lockfiles: "0 added … 0 updated", no new-dependency section. The rule is wrong in
kind: a package spreading to a new workspace changes where it runs (here from
public-site to frontend), and the earlier assessment's reasons may not carry —
#362's outcome for this package, "keep: MPL-2.0, but dev-only and never
distributed", was never re-checked for the frontend. It is fixed in this design
(§4.2). Also outside the check today: `peerDependencies` (`DIRECT_FIELDS`,
`:281-285`).

### 2.4 Shared scripts

`lockfile-diff.mjs`, `dependency-review.mjs`, their tests and
`dependency-review.yml` are byte-identical in LDE and RBA and differ only by
Prettier style in ttl-editor. They are copied by hand (header `:15-16`); there
is no sync or drift check. `lockfile-review.json` holds each repo's policy
(allow-list at LDE `:3-16`, identical in all three).

`dependency-review.mjs` (quarterly R11 review) already gathers the evidence this
gate needs, from the registry and the GitHub API: `evidenceFrom()` `:77`,
`assess()` `:114-139` (deprecated `:118`, archived `:119`, no release in 12 months
`:122-123`, `maintainers <= 1` unless an Organization owns the repo `:128-133`,
licence `:135-136`), `githubRepo()` `:66`.

## 3. Approaches

| | How it blocks | Trade-off |
|---|---|---|
| (A) Assessment block in the PR body | `lockfile-review` fails until the body has a filled block per new dependency | Lives per PR; an auditor must search PRs; editing a body re-runs nothing without a re-trigger; a filled block costs one keystroke per box. |
| **(B) A committed register checked by the gate** — **chosen** | `lockfile-review` fails until every new direct dependency has a register entry that the gate checks against registry evidence | One file per repo an auditor opens; reviewed as a diff; history in git. Needs network in the PR job (already used by the quarterly review). |

The user chose (B) on 2026-11-27.

## 4. Design

### 4.1 The register: `dependency-register.json`, one per repository

At the repository root, next to `lockfile-review.json` (same kind of thing: a
policy file the shared scripts read). JSON because the scripts run on plain Node
with no dependencies; a `$comment` points to `docs/dependency-criteria.md`.
*My call:* JSON over YAML/Markdown for that reason; the supply-chain page links
to it as "the dependency register".

One entry per **(package, manifest)**:

```json
{
  "name": "jsonwebtoken",
  "manifest": "packages/backend",
  "field": "dependencies",
  "added": { "date": "2026-11-12", "pr": 331 },
  "assessed": { "date": "2026-11-27", "version": "9.0.3" },
  "criteria": {
    "maintained":    { "holds": false, "why": "…" },
    "maintainers":   { "holds": true },
    "licence":       { "holds": true },
    "releasePolicy": { "holds": false, "why": "…" },
    "footprint":     { "holds": true },
    "needed":        { "holds": true, "why": "…" }
  },
  "outcome": "keep" | "replace",
  "followUp": 123,
  "status": "assessed" | "override",
  "override": { "reason": "…", "issue": 124 }
}
```

Six criteria, the six of `docs/dependency-criteria.md` (release policy and
footprint become separate again). `outcome: "replace"` requires `followUp` (an
issue number).

### 4.2 Which dependencies are "new" — fixing the blind spot

`newDirectDependencies()` keys on **(name, manifest)**: a package is new when it
is direct in a manifest of head and in no field of **that** manifest in base.
Moving between fields of the same manifest is still not an addition (the reason
at `:315-316` holds for that). `peerDependencies` join `DIRECT_FIELDS`. The
`@axe-core/playwright` case (public-site → frontend) now needs an entry.

### 4.3 The gate — what fails, and why a click cannot pass it

A new step in the `lockfile-review` job (the existing required check; no ruleset
change), run when the lockfile changed (the job already exits early when it did
not, RBA `:368-372`). For each new (name, manifest):

1. **An entry exists** in head's `dependency-register.json`, valid against the
   shape above. Missing or malformed → blocking.
2. **Evidence is gathered by the gate, not typed by a person**: the same
   `evidenceFrom()`/`assess()` signals the quarterly review uses, for the
   *locked* version, plus `hasInstallScript` and the transitive count from the
   lockfile. These are rendered into the comment next to the entry.
3. **The entry cannot contradict the evidence**: if a signal fails for a
   criterion (deprecated/archived/no release in 12 months → `maintained`;
   one maintainer and no organisation → `maintainers`; licence not on the
   allow-list → `licence`; install script or native build → `footprint`), that
   criterion must be `holds: false` with a `why`. Deprecated or archived →
   blocking outright, as the criteria say ("Fails outright", `:24-33`), unless
   `outcome: "replace"` with an open `followUp`.
4. **Judgement always needs words**: `needed` always requires a `why` (no
   registry signal can answer it), and every `holds: false` requires a `why`.
   A `why` must be at least one sentence of substance (*my call:* ≥ 40
   characters, and not identical to another `why` in the same entry).
5. **The version is the one assessed**: `assessed.version` must have the same
   major as the locked version (a later major is a new assessment, which is what
   recommendation 7's assessment asks for anyway).
6. **`followUp` and `override.issue` exist and are open** (GitHub API, the same
   read-only token the quarterly review uses).

What this does not stop: a person writing an honest-looking but false sentence.
That is review's job; the gate guarantees there is a written, version-pinned,
evidence-consistent claim in git, under the author's name, for every dependency.

Network errors, registry 404s, or GitHub API failures → exit 2, "never reads as
clean", like the script's existing input errors (`:526-533`, `:587-589`).

### 4.4 The override for an urgent security fix

`"status": "override"` with `override.reason` and `override.issue` (an open
issue titled for the assessment to follow). The gate checks only rules 1, 5
(when a version is given) and 6, passes, and prints a warning section in the
comment naming the override. Logged three ways: the register diff in the PR,
the issue, and the quarterly `dependency-review.mjs` run, which lists every
register entry still on `override` until it is replaced by an assessment.
Documented in `docs/dependency-criteria.md`. No label a person can set and no
ruleset bypass: a person's route through the gate leaves a committed record;
Renovate's security PRs are the one automatic route (§4.5), logged by the gate.

### 4.5 The cooldown check (companion design §6.2)

Same job, same script: every package version added or changed in the lockfile
diff must have been published at least `minReleaseAgeDays` (new key in
`lockfile-review.json`, 14) before the run, using the registry's `time` field.
Younger → blocking. Two ways through, decided by the user on 2026-11-27:

- **Renovate's security pull requests, automatically.** When the PR's author is
  `renovate[bot]` **and** it carries the `security` label (set by
  `renovate.json` `vulnerabilityAlerts.labels`), young versions do not block.
  Neither condition alone suffices: a person can add the label but cannot be the
  author, and Renovate's routine PRs do not carry the label. The gate writes the
  record itself — a "Cooldown exceptions" section in the PR comment and the job
  summary, listing package, version, publish date and age — and the quarterly
  `dependency-review.mjs` run lists the merged ones of its quarter (found via
  the PR comments' marker, or `gh pr list --label security --author
  app/renovate`). Why: these PRs skip the cooldown on purpose (`renovate.json`
  `vulnerabilityAlerts`, `minimumReleaseAge: null`), and requiring a commit on
  Renovate's branch would stop Renovate rebasing it and delay exactly the fixes
  that must not wait. The author comes from the `pull_request` event; the
  label is checked at run time through the API, not the payload: Renovate
  adds labels in a second call after it opens the PR (LDE #364: opened
  16:51:22Z, labelled 16:51:23Z), so the `opened` payload has none. The
  route holds only when the PR's issue events show `security` applied **by
  `renovate[bot]`** and the label is still on the PR — a person adding the
  label does not count. The workflow also runs on `labeled`/`unlabeled`.
  (Amended 2026-11-27 after the whole-branch review.)
- **A person's urgent fix: a committed override**, recorded in the register's
  `cooldownOverrides` list (`{ "package", "version", "reason", "issue" }`, open
  issue required), so it is written down rather than waved through.

The same automatic exemption applies to rule 1–6 of §4.3 for a Renovate security
PR that introduces a new direct dependency (a `replacement` update): it passes,
warns, and the quarterly review lists it as an entry still to assess. *My call*,
for the same reason.
This is what lets the RBA design claim that *every* path into the lockfile
honours the cooldown, whatever npm wrote it.

### 4.6 The comment

The "New direct dependencies" section changes from a checklist to a table per
dependency: the gathered evidence, the register's verdict per criterion, and a
✗ with the reason for each rule in §4.3 that fails. No checkboxes — there is
nothing left to tick in the comment.

### 4.7 Rollout and sharing

1. **LDE PR** — script changes (`lockfile-diff.mjs` imports the evidence
   functions from `dependency-review.mjs` rather than copying them), tests in
   `lockfile-diff.test.mjs` for every rule in §4.3 and for §4.2/§4.5,
   `lockfile-review.json` gains `minReleaseAgeDays`, the job gains
   `GITHUB_TOKEN` (contents/issues read), `dependency-review.mjs` lists open
   overrides, `docs/dependency-criteria.md` describes the gate, `SECURITY-PIPELINE.md`
   gets a "New dependencies: the register gate" subsection, and LDE's register
   with its five retroactive entries (§5).
2. **ttl-editor PR** — the same scripts (Prettier-formatted to its style, as
   today), job change, docs, register with keycloak-js.
3. **RBA PR** — same, register with stylelint and @axe-core/playwright (both
   manifests: public-site and frontend; the public-site entry records #362's
   outcome).

The register gate itself does not depend on the RBA Node 24 change; the RBA PR
of this design can land before or after it. *My call:* no automated drift check
between the copies (not asked for); each copy's header names the LDE commit it
was taken from, so drift is visible.

## 5. The retroactive assessments

Recorded as the first entries of each repo's register, from evidence gathered on
2026-11-27 (registry + GitHub, the sources `dependency-review.mjs` uses):

| Package | Verdicts needing a sentence | Proposed outcome |
|---|---|---|
| stylelint (RBA) | footprint: 58 packages only it pulls in; release policy: no SECURITY.md | keep |
| @axe-core/playwright (RBA public-site, frontend) | licence MPL-2.0 (and axe-core): test-only, unmodified, never shipped | keep (re-states #362 for both manifests) |
| keycloak-js (LDE, ttl-editor) | maintained/release policy: locked 23.0.7 is a frozen line (last release Feb 2024), held to match the Keycloak 23 server (RBA `docs/promote-ACC-to-PROD.md:1306-1308`); no provenance | keep; follow-up issue to move with the Keycloak 26 server migration |
| jsonwebtoken (LDE) | maintained: last release 2025-12-04, low activity on a security path; one npm publisher; no provenance/security policy; needed: `jose` covers it | **replace**: follow-up issue, move verification to `jose` |
| jwks-rsa (LDE) | needed: `jose`'s `createRemoteJWKSet` covers it (it already pulls `jose` in) | **replace**, same follow-up |
| @types/jsonwebtoken (LDE) | maintained: no release in 17 months — the types-for-a-stable-API case | keep until the `jose` move removes it |
| tsx (LDE) | maintainers: one, user-owned; footprint: own esbuild with an install script; needed: native type stripping blocked by extensionless CJS imports | keep (dev-only) |

Also opened as follow-up issues, outside the register: the unanswered licence
flags `svg-tags` (RBA) and `limiter` (LDE). Noticed and only reported: RBA's
backend declares `jose ^5.10.0` with no import (`packages/backend/package.json:58`).

## 6. Goals, non-goals, anti-goals

- **Goals:** the seven recorded; the gate live in all three; criteria doc and
  each supply-chain page describe it; R1 can move.
- **Non-goals:** assessing the hundreds of existing direct dependencies (the
  quarterly review covers them); requiring approvals in the rulesets; replacing
  `jsonwebtoken`/`jwks-rsa` in this work (a follow-up issue).
- **Anti-goals:** a gate that a checkbox, or a label a person sets, satisfies; a gate that passes
  when the registry is unreachable; a way through that leaves no committed record.

## 7. Left to the builder

- Exact JSON validation code and messages; the comment's table layout.
- How `lockfile-diff.mjs` and `dependency-review.mjs` share the evidence
  functions (import vs. a third shared module), provided all three repos stay
  identical.
- Rate-limit handling for registry/GitHub calls. Few for the new-dependency
  rules; the cooldown check needs one packument per changed package, which is
  hundreds on a lock-file maintenance PR — fetch once per name, bounded
  concurrency, retry on 429/5xx, and exit 2 (never clean) when it still fails.

## 8. Done when

- Each repo has `dependency-register.json` with its retroactive entries, and the
  follow-up issues exist.
- In each repo, a test PR that adds a dependency without an entry fails
  `lockfile-review`; with a contradicting entry fails; with a valid entry passes;
  with an override passes and warns; a too-young version fails.
- `docs/dependency-criteria.md` (LDE, and its copies) and each repo's
  `SECURITY-PIPELINE.md` describe the gate and the override.
