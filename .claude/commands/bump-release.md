# bump-release

Cut a release: flip the current Upcoming changelog entry to Released, version
**only the package(s) the release actually changed**, and land the result on
`acc`. Handles both changelog entry shapes — the current per-commit format
(`format: 'commits'`, used by every new entry) and the legacy sections-based
format still carried by historical entries.

This is the same skill used in `ronl-business-api`, adapted for this repo's
shape: an npm workspaces monorepo with `packages/frontend` and
`packages/backend` (no `packages/shared`), plus `packages/ropa-site` — a
static site with **no `package.json`**, deployed by its own path-filtered
workflow but never version-bumped. The changelog lives in
`packages/frontend/src/changelog.json` (plain JSON, not a typed
`changelog-data.ts`) — `Changelog.tsx` renders both the legacy `sections`
shape and the new `commits` shape via a type-cast union at the import
boundary (JSON module imports don't support forward-declared shapes the
data doesn't have yet).

> Why scope matters: `azure-frontend-*.yml` and `azure-backend-*.yml` are
> path-filtered on `packages/frontend/**` / `packages/backend/**`. Bumping
> `packages/backend/package.json` on a frontend-only release doesn't itself
> trigger a deploy (deploys are path-filtered, not version-filtered) but it
> does make the backend's version lie about what it's actually running. So
> bump-release versions per scope, and the package versions are allowed to
> drift apart — root always tracks the overall released version.

> **No endpoint-map reconciliation step.** Unlike `ronl-business-api`, this
> backend's route list (`packages/backend/src/routes/registry.ts`) is
> already the single source of truth for both mounting and the root page —
> there's nothing to manually keep in sync.

## Versioning: CalVer `YYYY.MM.patch`

Released versions use CalVer, not SemVer — matching the Norm Editor's
convention (`scripts/generate-changelog.mjs`'s release-tagging scheme) and
the same adoption already done for the CPSV Editor:

- `2026.07.0` — first release cut in July 2026
- `2026.07.1` — a same-month follow-up release
- `2026.08.0` — the first release of the next month (patch resets to `0`)

To pick the next version: take the current date's `YYYY.MM`. If the most
recent **Released** entry in `changelog.json` already has that same
`YYYY.MM` prefix, increment its patch number by 1. Otherwise (first release
of a new month, or no prior release at all this month) use patch `0`. This
is a single, product-wide version sequence — it does not vary by `scope`;
a backend-only release and a frontend-only release still share the same
next-CalVer-in-sequence number.

Note this is a CalVer _string_ only — no git tags are created, and nothing
else about the release workflow changes (no `generate-changelog.mjs`, no
commit-message enforcement, no `versions.json`). Historical entries already
in `changelog.json` (SemVer strings like `1.9.13`, `1.9.12`) are left as-is;
only new entries going forward use CalVer.

## Repo-specific process constraints (apply throughout, not just here)

- **Branch off `acc` first.** Never implement directly on `acc` — create a
  feature branch (e.g. `feat/<short-name>`) before touching anything.
- **Do not commit until the user has accepted the change.** Implement,
  type-check, lint, format — then stop and hand off. Staging (`git add`) is
  fine; `git commit` is not, until the user has run their own acceptance
  test and explicitly approves (or explicitly asks you to commit).
- **Never use `@'...'@` for commit messages via the Bash tool.** That's
  PowerShell here-string syntax; in bash it concatenates a literal `@` onto
  the message. Use plain `-m` quoting, a bash heredoc (`git commit -F -
<<'EOF' … EOF`), or a temp file with `-F`. After committing, sanity-check
  `git log --oneline -1` — the subject must never be a bare `@`.
- **Run `npm run format` before staging.** Avoids lint-staged reformatting
  mid-commit.

## Entry shape

```jsonc
{
  "format": "commits",
  "version": "2026.07.0", // CalVer YYYY.MM.patch — see "Versioning" above
  "status": "Upcoming", // bump-release flips this to "Released"
  "date": "23 jul 2026",
  "scope": "frontend", // "frontend" | "backend" | "both"
  "commits": [
    {
      "sha": "abc1234",
      "author": "Steven Gort",
      "type": "feat", // feat | fix | test | docs | chore | refactor | ci | other
      "subject": "Clean, readable release-note header",
      "details": [
        "One or more body paragraphs, same technical depth as the commit message.",
      ],
    },
  ],
}
```

## Steps

### 0. Reconcile outstanding pull requests

Run this **before touching any version**. A pull request merged outside a
release entry ships silently and appears in no changelog, so the release
history stops being a record of what is actually deployed. This repository now
has Renovate raising dependency pull requests continuously, so the queue is
rarely empty.

```bash
gh pr list --state open --json number,title,author,files
```

Present the open pull requests and ask which are in scope: all, a subset, or
none. Out-of-scope ones stay open and are gathered by the next release. Then:

1. **Merge the in-scope ones before any version editing.** Dependency pull
   requests rewrite `package-lock.json` -- the same file step 4 edits. Bump the
   version first and the merge either conflicts or silently reverts it.
2. **Verify each dependency pull request locally before merging it.** The
   backend workflow is `push`-only, so a backend dependency change arrives on
   `acc` with **no** test run behind it; the only pull-request check is `audit`,
   which says nothing about whether the dependency broke anything. Run
   `npm ci && npm run lint && npm test && npm run build && npm run check-format`
   on the branch. `check-format` is not optional here: it runs in no workflow at
   all, only in the pre-push hook, so a formatting-tool upgrade that reformats
   existing files lands green and then fails the _next_ person's push. That is
   exactly what prettier 3.9.6 did on 2026-08-29.
3. **Re-check mergeability between merges** when several touch the same file.
   The `acc` ruleset does not require branches to be up to date, so merging one
   leaves the next based on a stale tree. Renovate rebases on conflict but not
   otherwise -- a stale branch that merges cleanly can still produce a lockfile
   npm will not accept. Trial-merge locally and run `npm ci` before trusting it.
4. **Say that each merge to `acc` triggers an acceptance deploy** when proposing
   to merge several.
5. **Bring the working branch up to date with `acc` afterwards** -- rebase if the
   branch is unpushed, merge if it is not. Only then compute the range in step 1.

### 1. Determine the released version and scope

- Read `packages/frontend/src/changelog.json`.
- The first entry in `versions` is the one being released — extract its
  `version` string. If an explicit version was passed as an argument, use
  that instead and find it in the array. If no version was passed and a new
  entry needs authoring, compute the next CalVer string per "Versioning"
  above.
- **If the first entry's `status` is already `Released` (or `Latest` — the
  pre-existing status label that historically marked "most recent", not a
  workflow state), there is no pending entry** — stop and author a new one
  first (see below) before continuing. Do not fabricate changelog content
  without confirming it with the user.

#### Authoring a new entry (when there is no pending one)

1. Find the commit range: `PREV=$(git log --grep='^chore: bump release' -n 1 --format=%H)`
   (may be empty the first time this runs — if so, use the branch's
   divergence from `acc`/`origin/acc` instead), then `git log $PREV..HEAD --no-merges --oneline`. Drop any commits already
   covered by an existing entry.

   **`--no-merges` is required.** Releases land through pull requests now, so
   every range contains merge commits, and a merge commit carries no content
   for a changelog.

   **Compute the range only after step 0 has brought the branch up to date.**
   Merging `acc` in can surface conflicts that need their own fix commits, and
   rebasing rewrites SHAs outright -- so a range captured earlier records hashes
   that no longer exist, and nothing downstream will catch it.

2. For each remaining commit, pull its real SHA (short form), author, and
   full subject + body: `git log -1 --format='%h|%an|%s%n%b' <sha>`. Derive
   `type` from the commit's conventional-commit prefix, falling back to
   `other`.
3. Write `subject` as a clean, readable release-note header (not required
   to be verbatim) and `details` as 1–3 paragraphs at the same technical
   depth as the commit body. Strip any `Co-Authored-By` / `Claude-Session`
   trailer lines.
4. Order `commits` **descending** — most recent first.
5. Determine `scope` per step 2 below. Set `status: "Upcoming"`.
6. **Show the drafted entry to the user and get confirmation before adding
   it to `changelog.json`.**

### 2. Cross-check scope against what actually changed

```bash
PREV=$(git log --grep='^chore: bump release' -n 1 --format=%H)
git diff --name-only "$PREV"..HEAD -- packages/
```

Map touched top-level dirs to a scope:

- only `packages/frontend/**` → `frontend`
- only `packages/backend/**` → `backend`
- both → `both`
- `packages/ropa-site/**` changes don't affect this decision — that
  package has no `package.json` and is never version-bumped; if a release
  touches only ropa-site, there is nothing to bump here (its own
  path-filtered workflow deploys it independently of any release cut).

If the declared `scope` doesn't cover what changed, **stop and warn** the
user with the specifics and ask how to proceed — same split-entry
resolution options as `ronl-business-api` (separate entry for unrelated
leftover work vs. widen scope to `both` for genuinely-combined changes).

### 3. Flip the released entry to Released

Set `"status": "Released"`. No separate color fields on the commit-format
shape — `Changelog.tsx` derives the badge/border color from the `status`
string itself. Do not add color keys to a commit-format entry.

### 4. Bump the in-scope package.json files and the lockfile

Set `"version"` by hand in each in-scope `package.json` **and** in the matching
entries of the root `package-lock.json`:

- `package.json` (repo root) — **always**
- `packages/frontend/package.json` — only if scope is `frontend` or `both`
- `packages/backend/package.json` — only if scope is `backend` or `both`
- `package-lock.json` — the top-level `version`, `packages[""].version`, and
  `packages["packages/<ws>"].version` for each workspace bumped above

Leave an out-of-scope package untouched — its version legitimately lags at the
last release that changed it, and that is true of its lockfile entry too.

**Do not use `npm version`.** It coerces its argument to strict SemVer, and a
zero-padded CalVer month is not a valid SemVer numeric identifier — so
`npm version 2026.08.3` silently writes **`2026.8.3`**, to every file it
touches. That was tried during the v2026.08.3 release and reverted. There is no
flag to disable the coercion. `npm pkg set version=...` preserves the string but
does not touch the lockfile, so it solves only half the problem.

**Why the lockfile is called out.** This step used to name only the
`package.json` files, so no release ever updated the lockfile. Through
v2026.08.2 it still recorded the root at `1.9.13` and `packages/backend` at
`0.1.0`, while every `package.json` in the repo had reached `2026.08.2`.

The drift is not fatal: `npm ci` validates dependency satisfiability, and the
root depends on its workspaces by path rather than by version range, so those
`version` fields are never checked — it exits 0 either way (verified against the
drifted state). But the lockfile is what CI installs from and what SBOM, audit
and provenance tooling reads, so all of it reported the wrong versions — and the
first plain `npm install` afterwards drops a spurious multi-version diff into
whatever unrelated commit follows. Re-run `npm ci --dry-run` after editing, to
confirm the lockfile still resolves.

### 5. Normalize formatting

```bash
npm run format
git add .
```

`npm run format` runs `--workspaces --if-present`. Skip only if it reports
no changes.

### 6. Report and hand off for acceptance

State: the version and scope, which package.json files were bumped (and
which were deliberately left behind), how many commits the entry covers.

**Stop here.** Do not commit — per this repo's standing rule, wait for the
user to accept the change (or explicitly ask you to commit). When they do,
commit message format: `chore: bump release to v<released-version>`, no
Co-Authored-By line, committed via bash heredoc or plain `-m` quoting
(never `@'...'@`).

### 7. Land the release through a pull request

`acc` is protected by the `acc supply-chain gate` ruleset, which requires a
pull request and a passing `audit` check. A locally created bump commit has
never been through CI, so **the old flow -- `git checkout acc` followed by
`git merge --ff-only` and a push -- is rejected outright.** Do not work around
it: the gate applies to releases like everything else, and bypassing a
verification gate is never a step in this task.

```bash
git push -u origin <working-branch>
gh pr create --base acc --title "chore: bump release to v<version>" --body "..."
```

- **Merge with a merge commit. Squash and rebase are disabled repo-wide.**
  The changelog entry names each commit by its SHA, and _both_ alternatives
  rewrite those hashes: squashing collapses the commits into one, and rebasing
  replays them as new commits -- deceptively, since it preserves the commit
  count while replacing every hash. Either leaves the entry pointing at commits
  that do not exist on `acc`.

  ```bash
  gh pr merge <n> --merge --delete-branch
  ```

  Rather than rely on anyone remembering that, this repository allows merge
  commits only (Settings -> General -> Pull Requests), and the ruleset pins
  `allowed_merge_methods` to `["merge"]` as well. GitHub's default button is
  otherwise "Squash and merge", so a single absent-minded click would orphan
  every SHA the entry cites.

  A side effect: Renovate's dependency pull requests land as merge commits too.
  That costs nothing -- `--no-merges` in step 1 excludes the merge commit, and
  the underlying update commit is what the entry should name anyway.

- Report the pull request URL and let the human merge it. The release is
  audited before it lands, which is the point of the change.
- **Merging the pull request pushes `acc`, which triggers the acceptance
  deploys.** There is no separate "ask whether to push" step any more --
  merging is the push.
- Afterwards, clean up and sync local:

  ```bash
  git checkout acc && git pull --ff-only
  git branch -d <working-branch>
  ```

  Use `-d`, not `-D` -- it only succeeds when the branch is fully merged. If it
  refuses, stop and investigate rather than forcing it.

- **Confirm the branch is gone from the remote too.** `gh pr merge
--delete-branch` removes both copies, and this repository has
  `delete_branch_on_merge` enabled so a merge through the GitHub UI does the
  same. But a release merged some other way leaves the remote branch behind:

  ```bash
  git fetch origin --prune
  git ls-remote --heads origin '<working-branch>'   # expect no output
  git push origin --delete <working-branch>          # only if it survived
  ```

  A stale merged branch is harmless alone. They accumulate, and each one makes
  it harder to see which branches are genuinely in flight -- which is the
  question step 0 has to answer at the next release.

### Why steps 0 and 7 changed

Through v2026.08.3 step 7 fast-forwarded `acc` locally and asked separately
about pushing. That stopped working on 2026-08-29 when `acc` gained a ruleset
requiring a pull request and a passing `audit` check -- enforcement introduced
by the supply-chain pinning work, documented in `docs/the-gate-has-teeth.md`.

Step 0 was added at the same time, for a different reason: enabling Renovate
meant dependency pull requests now arrive continuously, and the v2026.08.4
release had to reconcile five of them before it could compute a commit range
that stayed valid.
