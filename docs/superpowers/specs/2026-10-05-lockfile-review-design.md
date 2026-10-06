# Lockfile review on dependency pull requests — design

Issue: [#248](https://github.com/sgort/linked-data-explorer/issues/248) (ICTU
recommendation R9). Applies to linked-data-explorer (LDE), ttl-editor (TTL) and
ronl-business-api (RBA). Design agreed 5 October 2026, section by section.

## Goal

A pull request that changes `package-lock.json` shows its reviewer what the
lockfile change actually contains — the transitive moves, not only the direct
`^a → ^b` — in a comment posted by CI. Two unambiguous rules fail the check; the
rest is a review prompt.

## Decisions

| question                   | decision                                                                                           |
| -------------------------- | -------------------------------------------------------------------------------------------------- |
| tool                       | our own script, read from the lockfiles (not `actions/dependency-review-action`)                   |
| where the reviewer sees it | one sticky PR comment, updated on every push; job summary as well                                  |
| what fails                 | a `resolved` origin outside `https://registry.npmjs.org/`, a missing `integrity`                   |
| what only reports          | added, removed, updated, downgrades, licence changes, licences off the allow-list, install scripts |
| gating                     | its own job, `lockfile-review`, required on `acc` in all three repositories                        |
| vulnerabilities            | out of scope: the daily audit (#220) and Dependabot cover them                                     |

## 1. `scripts/lockfile-diff.mjs`

Byte-identical in the three repositories, like `scripts/write-sbom.mjs`. Node
built-ins only; never runs npm, never installs.

**Interface.** `node scripts/lockfile-diff.mjs <base-lockfile> <head-lockfile>
[--config lockfile-review.json] [--out report.md]`. Exit 0: nothing blocking.
Exit 1: a blocking finding. Exit 2: a lockfile unreadable or not
`lockfileVersion` 3 — never to be read as clean (the `audit-tree.mjs`
convention).

**Entries.** Only `node_modules/…` keys. Skipped: workspace entries (`packages/…`
keys) and `link: true` entries. In LDE these are the only entries without
`integrity` or with a non-npmjs `resolved` (surveyed 5 October 2026); RBA has six
such workspace entries, TTL none.

**Identity.** A package is its name — the last `node_modules/` segment — with the
**set** of versions installed under it. Comparing per name, not per path, keeps
hoisting moves out of the report.

**Runtime or dev.** Dev-only when every install of the name has `dev: true`;
otherwise runtime, labelled optional where `optional: true`.

**Findings.**

| finding             | rule                                                                                                                       | blocks           |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| added               | names in head, not in base, with versions                                                                                  | no               |
| removed             | names in base, not in head                                                                                                 | no               |
| updated             | names in both whose version sets differ (`a → b`)                                                                          | no               |
| downgrade           | an install path whose head version is older than its base version and new to the tree, or a single-version name going down | no (highlighted) |
| origin              | any head entry whose `resolved` does not start with `https://registry.npmjs.org/`                                          | **yes**          |
| integrity           | any head entry without `integrity`                                                                                         | **yes**          |
| licence change      | a name that gains a licence it did not have in base (losing one with a removed copy is not a change)                       | no               |
| licence not allowed | an **added** name whose licence the allow-list does not allow, or that has none                                            | no               |
| install script      | a name with `hasInstallScript` in head that is new, or had none in base                                                    | no               |

The two blocking rules apply to the **whole** head lockfile: all three trees are
clean today once workspace entries are excluded, and a bad entry should fail
however it arrived. Licence and install-script findings consider only what
changed, so the accepted tree (the bpmn.io licence on `bpmn-js` and
`@bpmn-io/form-js*`, MPL-2.0 on TTL's `lightningcss`) does not repeat in every
report.

**Why those two rules read the paths.** Replaying #230 and #251 while writing
the plan (6 October 2026) showed that comparing version **sets** misreads npm:
losing a newer copy (`agent-base` in #251), every copy on several major lines
going up (`brace-expansion` in #230) and hoisting an existing older copy to
the root (`type-fest` in #230) all looked like downgrades, and a removed copy
looked like a licence change (`minipass`). The rules above report none of
those and still catch a consumer moving back.

**Allow-list.** Per repository, in `lockfile-review.json` at the root:
`{ "allowLicenses": [...] }`. Policy data may differ between repositories while
the script stays identical. SPDX expressions are read simply: `A OR B` is
allowed when either is, `A AND B` when both are; parentheses are tolerated. A
missing `license` field is "none recorded". Initial list — the permissive set
present in the three trees today: `MIT`, `ISC`, `Apache-2.0`, `BSD-2-Clause`,
`BSD-3-Clause`, `BlueOak-1.0.0`, `0BSD`, `MIT-0`, `Unlicense`, `CC0-1.0`,
`Python-2.0`, `CC-BY-4.0`. MPL-2.0 and "SEE LICENSE IN …" stay off it: a new
package under either is a review prompt.

**Report.** Markdown beginning with the marker `<!-- lockfile-review -->`; a
headline with counts and the verdict; blocking findings first; long lists in
`<details>`. Cut, with a pointer to the job summary, if it would exceed GitHub's
65,536-character comment limit.

**Test.** `scripts/lockfile-diff.test.mjs`, in the style of the existing
`scripts/*.test.mjs` (self-contained, prints a PASS count, `fileURLToPath` for
paths). Small handcrafted lockfiles cover every row of the findings table, the
workspace/link exclusions, SPDX `OR`/`AND`, and exit code 2. Like
`promotion-targets.test.mjs`, it runs in the workflow that uses the script.

## 2. Workflow

Two jobs added to each repository's existing `zizmor.yml` ("Supply-chain
audit"), which already runs on every pull request with no `paths` or `branches`
filter — the property that lets a check in it be required. Both jobs run only on
`pull_request` (`if: github.event_name == 'pull_request'`); the workflow default
stays read-only.

**Job `lockfile-review`** — the required check; `contents: read`.

1. Checkout of the merge commit, `persist-credentials: false`.
2. Node `24.21.0`, the literal the other tooling jobs pin. No `npm ci`.
3. `node scripts/lockfile-diff.test.mjs` — the script is tested where it runs.
4. Fetch `github.event.pull_request.base.sha` with `--depth=1`. If
   `git diff --quiet <base> HEAD -- package-lock.json`, write "lockfile
   unchanged" to the job summary, set `changed=false`, and succeed.
5. Otherwise `git show <base>:package-lock.json` to a temporary file, run the
   script with `--out`, append the report to `$GITHUB_STEP_SUMMARY`, and expose
   it as a job output (no artifact, so no new third-party action to pin and
   register). Exit with the script's code.
   - The **script** prints one `::error::` line per blocking finding when
     `GITHUB_ACTIONS` is set, so the annotations come from the same code as the
     verdict.
   - The multi-line output is written to `$GITHUB_OUTPUT` with a delimiter
     generated per run (`report<<EOF_<random>`), so no report content can end
     the value early.

Values from the event (`base.sha`) reach `run:` through `env:`, not `${{ }}`
interpolation.

**Job `lockfile-review-comment`** — `needs: lockfile-review`; `if: always()` and
`changed == 'true'` and the head repository is this repository;
`pull-requests: write`; **no checkout**.

- The report arrives through `env:` from the job output, never interpolated
  into the script (zizmor's template-injection rule).
- Finds the comment by `github-actions[bot]` carrying the marker
  (`gh api --paginate repos/$REPO/issues/$PR/comments`), then `PATCH`es it or
  `POST`s a new one.
- Not required: a failed comment never blocks a merge; the summary holds the
  report regardless. Fork pull requests get a read-only token and keep the
  summary only.

**Trust boundary.** Head-ref code — the script and the lockfile — runs only in
the read-only job. The job holding a write token runs no repository code and
treats the report as opaque text.

**Lifecycle.** One comment per PR, rewritten on every push, Renovate's rebases
included. If a later push removes the lockfile change, the last report stays;
deleting it is out of scope.

## 3. Rollout, testing, documentation

**Order.** LDE, then TTL and RBA as two ports (identical script and test; each
its own `lockfile-review.json` and jobs).

**Required check — after each merge.** Per repository: merge the pull request so
the job exists and has reported on `acc`; then add `lockfile-review` to the
`acc` ruleset (read it, add the context, `PUT` the full ruleset back, confirm
with a read). `main` is unchanged: lockfile changes reach it only through
promotions of work reviewed on `acc`. The user approved these three ruleset
changes for this work.

**Testing before each pull request.**

- The unit test, green.
- A replay against real history in LDE: lock-file maintenance #230 (`cc2b1df`
  against its first parent) and the libxmljs2 override #251. Expected: many
  transitive moves, no blocking finding, a readable report — shown to the user
  before the first pull request opens.
- A handcrafted lockfile with a non-npmjs `resolved` and a missing `integrity`:
  exit 1, both named.
- The workflow's own pull request exercises the unchanged fast path; the next
  Renovate pull request is the first real run.

**Documentation.** `docs/ICTU-dependencies-assessment.md`: the R9 row.
`docs/ci-posture-across-repos.md`: an archive entry, and `lockfile-review` in
each `acc` ruleset row once required. #248's per-repository checklist ticked as
each lands; the issue closes with the last repository and its ruleset.

## Out of scope

Vulnerability findings; blocking on licences or install scripts before the
allow-list has proved itself; deleting a stale comment; the `main` rulesets.
