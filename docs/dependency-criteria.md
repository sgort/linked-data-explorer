# Dependency criteria

When a package may become a dependency, and how to check once a quarter that
each one still deserves to be. ICTU recommendations 1 and 11 in
[`ICTU-dependencies-guideline.md`](ICTU-dependencies-guideline.md); #250.

This document applies to **linked-data-explorer**, **ttl-editor** and
**ronl-business-api**. It lives here, and the other two link to it. Its
criteria are the same two times they are applied: before a package is added
(R1) and every quarter after (R11), so the two cannot drift apart.

They apply to **direct** dependencies, production and dev alike: build and
test tooling runs on the runners and on our workstations. Transitive packages
are covered by the lockfile review (R9, #248) and the daily audit (R10).

---

## The criteria

Each has a signal that can be measured, and a judgement only a person can
make. The measurable part is what the lockfile review and the quarterly
review check for you; the judgement is yours, written down in the dependency
register (see _Adding a dependency_).

### 1. Maintained

- **Signal:** a release in the last 12 months; not deprecated on npm; its
  repository not archived.
- **Fails outright:** deprecated, or archived. Replace it, or record why it
  stays (see _Outcomes_).
- **Judgement:** no release in a year is not by itself abandonment. A small,
  finished package (`@types/*` for a stable API, a single-purpose utility) can
  be done. Look for the reason: open issues and pull requests answered or not,
  security advisories fixed or not, commits on the default branch.

### 2. Maintainers

- **Signal:** more than one npm maintainer, or a repository owned by an
  organisation.
- **Judgement:** a single maintainer is common and not a failure, but it is a
  bus factor of one. Say why this package is worth it, and what we would do if
  it stopped (fork, vendor, replace).

### 3. Licence

- **Signal:** the licence is on the allow-list in `lockfile-review.json` (the
  same list the lockfile review uses for new transitive packages, #248).
- **Judgement:** anything else is looked at, not refused: MPL-2.0 and custom
  licences such as bpmn.io's `SEE LICENSE IN LICENSE` are deliberately left off
  the list so that each one gets read. If it is acceptable, say why in the
  package's register entry (`holds: false`, with the reason it stays); add it
  to the allow-list only when it should pass without a look from then on.

### 4. Release policy

- Semver kept: breaking changes come in majors, with release notes that say so.
- A `0.x` package may break on any minor. Pin it to the minor and treat every
  minor as a major (ronl-business-api already does, sgort/ronl-business-api#142;
  #138 here).
- Majors are adopted as recommendation 7 says: assess the risk, wait for a
  patch release when the major is large.

### 5. Footprint

- **Install scripts:** a `preinstall`/`install`/`postinstall` runs code on every
  machine and runner that installs it. The lockfile review flags a new one; the
  quarterly review lists them.
- **Native builds:** a package that compiles (node-gyp, prebuilt binaries)
  ties us to a toolchain and to its maintainer keeping up with Node.
  `libxmljs2` is the case in point: last published June 2025, it pins an old
  `node-gyp` (#240).
- **Transitive weight:** what it brings with it. Check the "Added" list of the
  lockfile review on the pull request that adds it.

### 6. Needed

- Could an existing dependency do it? Could a few lines of our own?
- Is it actually imported? `keycloak-connect` in ronl-business-api was
  declared, never imported, and brought 43 packages
  (sgort/ronl-business-api#204).

---

## Adding a dependency (R1)

A new direct dependency needs a written assessment before it can merge. The
assessment lives in `dependency-register.json` at the root of the repository,
and the `lockfile-review` check fails the pull request until it is there and
agrees with the evidence. Until November 2026 the `lockfile-review` comment
showed a checklist instead; seven dependencies arrived across the three
repositories with not one box ticked, because nothing made the boxes matter.

"New" means new **to that manifest**: a package that is direct in a workspace's
`package.json` (any of `dependencies`, `devDependencies`,
`optionalDependencies`, `peerDependencies`) where that workspace did not have
it before. A package already used in another workspace still needs its own
entry, because where it runs is part of the assessment. Moving it between
fields of the same manifest is not an addition.

### What to do

1. Check the package against the criteria above **before** opening the pull
   request, at the version the lockfile will install.
2. In the **same** pull request, add one entry to `dependency-register.json`
   per package and manifest: `name`, `manifest` (for example
   `packages/backend`, or `(root)` for the root `package.json`, as the
   `lockfile-review` comment names it), `field`, `added` (date and pull
   request), `assessed` (date and version), the six `criteria`, an `outcome`
   and `"status": "assessed"`. Each criterion is
   `{ "holds": true | false, "why": "…" }`.
3. Say `holds: false` where a criterion does not hold, and say why. `needed`
   always needs a why, whether it holds or not.
4. The outcome is `keep` or `replace`. `replace` needs `followUp`: the number
   of an open issue for the replacement. A `keep` that falls short somewhere
   (what the quarterly review calls _accept_) is a `keep` whose `holds: false`
   reasons say why it stays and what would change that; give it a `followUp`
   too when there is something to do later.

The entry is reviewed as part of the diff, and stays in git under its author's
name, which is where an auditor finds it.

### What the check reads

The gate does not take the entry's word for what can be measured. For every new
direct dependency it asks the npm registry and the GitHub API, and reads the
lockfile, the same way the quarterly review does:

| criterion          | the signal the check reads                                                                                                                                                                                            |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Maintained**     | a release (of any version) in the last 12 months; not deprecated; a GitHub repository that was checked and is not archived                                                                                            |
| **Maintainers**    | more than one npm maintainer, or a repository owned by an organisation                                                                                                                                                |
| **Licence**        | the registry's licence is on the allow-list in `lockfile-review.json`                                                                                                                                                 |
| **Release policy** | none: a judgement                                                                                                                                                                                                     |
| **Footprint**      | no install script in the package or in anything it pulls in through `dependencies` and `optionalDependencies`, resolved the way Node resolves them (nested `node_modules` first); `peerDependencies` are not followed |
| **Needed**         | none: a judgement                                                                                                                                                                                                     |

So `tsx`, which has no install script itself, fails the footprint signal: it
brings its own `esbuild` (`node_modules/tsx/node_modules/esbuild`), which has
one. Optional dependencies count even when they install only on one platform
(`fsevents`, macOS only, has an install script), which errs on the side of
flagging. Peers do not count: a peer is the host a package plugs into (vite for
a vite plugin), installed for the host, not for the plugin.

A repository that could not be checked (none recorded, or one GitHub answers
404 or 410 for) fails the maintained signal: a repository nobody could look at
is not read as maintained. Any other failure to reach the registry or
GitHub fails the check as "could not run", never as clean.

The `lockfile-review` comment shows, per new dependency, the locked version,
the repository, and a table with the evidence for each criterion next to what
the entry says and the verdict, so a reviewer reads both side by side.

### What makes it fail

The pull request fails `lockfile-review` when, for any new direct dependency:

1. **There is no entry**, or the entry is malformed.
2. **The entry contradicts the evidence**: it says a criterion holds where the
   signal above says it does not. Saying `holds: false` where the signal is
   fine is allowed: the signal is the floor, not the whole judgement.
3. **The package is deprecated, or its repository archived**, and the outcome
   is not `replace` with an open follow-up. That fails outright, as the
   criteria say.
4. **A reason is missing or empty**: every `holds: false`, and `needed`
   always, needs a why of at least 40 characters, and no two whys in one entry
   may be the same. A sentence, not a tick.
5. **The version is not the one assessed**: the locked version has a different
   major than `assessed.version`. A new major is a new assessment.
6. **An issue it cites is not open**: the `followUp`, or an override's issue.
   A pull request's number does not count: GitHub numbers issues and pull
   requests together, and a pull request is not where an assessment waits.

The check can still be satisfied by an honest-looking sentence that is wrong.
Reading the sentences is the reviewer's job; what the check guarantees is that
there is one, pinned to a version and consistent with the evidence.

Two limits are known. The job runs the pull request's own copy of
`scripts/dependency-gate.mjs`, and the rulesets require no approvals, so a pull
request that edits the gate can weaken it for itself: a change under
`scripts/` deserves the same reading as the register. And a lockfile entry
hand-marked `"inBundle": true` is treated as shipped inside its parent, so it
skips the origin and integrity checks and the cooldown; npm writes that flag
itself only for bundled dependencies, so it is worth a look in a lockfile diff.

A pull request that changes only the register, with the lockfile untouched,
gets its shape checked (the same check fails on a malformed register on every
pull request), but not its evidence: that is gathered when the lockfile
changes, which is when a dependency is added.

### Too young: the cooldown

The same check fails a pull request whose lockfile adds or changes any package
version, direct or transitive, published less than `minReleaseAgeDays`
(14, in `lockfile-review.json`) before the run. It is the same cooldown that
Renovate and npm apply, checked on whatever wrote the lockfile.

### When it cannot wait

**A person's urgent fix** goes through a committed record, never a label or a
bypass:

- a new dependency with no time for an assessment gets an entry with
  `"status": "override"` and `"override": { "reason": "…", "issue": N }`, where
  `N` is an open issue for the assessment to follow. The check then asks only
  that the issue is open (and the major, if a version is given), passes, and
  warns in the comment. Replace the override with an assessment as soon as
  the fix is in;
- a version younger than the cooldown gets an entry in the register's
  `cooldownOverrides` list: `{ "package", "version", "reason", "issue" }`,
  with an open issue.

**Renovate's security updates** pass automatically, because they skip the
cooldown on purpose (`vulnerabilityAlerts` in `renovate.json`), and a commit on
Renovate's branch would stop it rebasing the fix. All three conditions are
needed: the pull request's author is `renovate[bot]`, it carries the
`security` label, **and** the pull request's history shows `renovate[bot]`
adding that label. The check asks the GitHub API for the labels and that
history when it runs, not the event that started it: Renovate adds the label
just after opening the pull request, so the workflow also runs when a label is
added or removed. A person adding the label does not count, nor can a person be
the author, and Renovate's routine updates do not carry the label. Any failure
to ask the API fails the check as "could not run". Young versions are then
logged instead of
blocked, in a _Cooldown exceptions_ section of the `lockfile-review` comment
and the job summary (package, version, publish date, age). A new direct
dependency in such a pull request passes with a warning that it is still to
assess; write its entry afterwards.

## Quarterly review (R11)

`.github/workflows/dependency-review.yml` runs on the second day of January,
April, July and October, and can be run by hand. It reads every direct
dependency from `package-lock.json`, asks the npm registry and the GitHub API
for the signals above, and opens an issue named
**Quarterly dependency review — YYYY-Qn**:

- **Failing:** deprecated or archived, or the evidence could not be gathered.
- **To judge:** no release in 12 months or more, one maintainer without an
  organisation, a licence not on the allow-list, or a signal that could not be
  checked.
- **Register: still open:** every register entry on `override` (an
  assessment still owed), every `replace` with its follow-up issue, and every
  `cooldownOverrides` entry. Each stays on this list until the register no
  longer holds it open.
- **Renovate security exceptions, YYYY-Qn:** the Renovate pull requests
  labelled `security` merged in the quarter that has just ended (the review
  runs on its second day), which may have skipped the cooldown or added a
  dependency still to assess. Check each one's _Cooldown exceptions_ in its
  `lockfile-review` comment, and write any missing register entry.
- **All direct dependencies**, production first, in a collapsed table.

For every package under _Failing_ and _To judge_, record one outcome in the
issue:

| outcome     | when                                                    | record                               |
| ----------- | ------------------------------------------------------- | ------------------------------------ |
| **keep**    | on a closer look the criteria hold well enough          | one sentence saying why              |
| **replace** | it should go: a successor, our own code, or dropping it | an issue for the replacement, linked |
| **accept**  | it falls short, and we keep it anyway for now           | the reason, and what would change it |

Close the issue when every flagged package has an outcome. A package accepted
last quarter comes up again this quarter: the reason is re-read, not carried
forward unread.

The review can run locally:
`GITHUB_TOKEN=$(gh auth token) node scripts/dependency-review.mjs`.
