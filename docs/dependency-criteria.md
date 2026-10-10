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
review check for you; the judgement is yours.

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
  the list so that each one gets read. If it is acceptable, say why in the pull
  request; add it to the allow-list only when it should pass without a look
  from then on.

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

1. Check the package against the criteria above **before** opening the pull
   request.
2. Open the pull request. The `lockfile-review` comment lists every new direct
   dependency with a checklist of the criteria.
3. Tick what holds. For anything that does not, add a sentence to the pull
   request saying why the package is still the right choice.

The reviewer reads that checklist the way they read the rest of the lockfile
review. A new direct dependency with unticked boxes and no explanation is not
ready to merge.

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
- **All direct dependencies**, production first, in a collapsed table.

For every package under _Failing_ and _To judge_, record one outcome in the
issue:

| outcome     | when                                                   | record                                 |
| ----------- | ------------------------------------------------------ | -------------------------------------- |
| **keep**    | on a closer look the criteria hold well enough         | one sentence saying why                |
| **replace** | it should go: a successor, our own code, or dropping it | an issue for the replacement, linked  |
| **accept**  | it falls short, and we keep it anyway for now          | the reason, and what would change it   |

Close the issue when every flagged package has an outcome. A package accepted
last quarter comes up again this quarter: the reason is re-read, not carried
forward unread.

The review can run locally:
`GITHUB_TOKEN=$(gh auth token) node scripts/dependency-review.mjs`.
