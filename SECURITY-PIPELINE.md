# Supply-chain posture of this pipeline

What CI downloads and executes, how each of those things is pinned, and — the
part that matters — what is **not** pinned and why.

This is a state document. It describes the pipeline as it stands, not the work
that produced it; the reasoning behind the gate lives in
[`docs/the-gate-has-teeth.md`](docs/the-gate-has-teeth.md).

Applies to the `acc` branch. `main` is promoted from `acc` and inherits this
once promoted; until then production workflows on `main` still resolve floating
tags.

## The rule

> Nothing downloaded or executed by a pipeline may float.

No `latest`, no empty version, no mutable tag. Every reference resolves to a
specific immutable object — a commit hash, a digest, a checksum — so that what
ran yesterday is byte-identical to what runs today, and a compromised upstream
release cannot reach this repository merely by being published.

## What is pinned

Every action reference in all seven workflows is a 40-character commit hash with
its human-readable version in a trailing comment. The comment is not decoration:
a digest nobody can read is a pin nobody will maintain, and Renovate moves the
two together.

| Action                         | Pinned at                                  | Version          |
| ------------------------------ | ------------------------------------------ | ---------------- |
| `actions/checkout`             | `11d5960a326750d5838078e36cf38b85af677262` | v4.4.0           |
| `actions/checkout`             | `a37ce9120846195fa4ece8f58b268e6043cb2f26` | v3.7.0           |
| `actions/setup-node`           | `49933ea5288caeca8642d1e84afbd3f7d6820020` | v4.4.0           |
| `Azure/static-web-apps-deploy` | `4d27395796ac319302594769cfe812bd207490b1` | v1 (branch head) |
| `azure/webapps-deploy`         | `02a81bead70021f5284939794bcec79c271ab383` | v3.0.8           |
| `zizmorcore/zizmor-action`     | `3dc1ecc9bcb9e94e9b2c709687979e1298497054` | v0.6.2           |

`zizmor 1.29.0` reports **0 findings** across all seven workflows.

Node dependencies install through `npm ci` in the frontend and backend build
jobs, which installs the lockfile exactly and fails rather than resolving
anything fresh. One deploy step is an exception — see below.

## What is not pinned

Recording these honestly is the point. An exception you have written down is a
known risk; an exception you have not is a false sense of coverage.

### 1. `mcr.microsoft.com/appsvc/staticappsclient:stable`

`Azure/static-web-apps-deploy` is a Docker action, and at the exact commit we
pin it to, its `Dockerfile` reads:

```
FROM mcr.microsoft.com/appsvc/staticappsclient:stable
```

So pinning the action pins the _wrapper_, not the image that actually runs. The
`stable` tag is mutable and Microsoft-controlled; every deployment pulls whatever
it points at that day. There is no input to override it, and forking the action
to pin the digest would mean owning Microsoft's deployment client — a larger and
worse-understood risk than the one it removes.

**Four of the six deployment workflows sit behind this.** It is the single
largest unpinned surface in the repository and it is not closeable from here.

### 2. `npm install --production --omit=dev` in the backend deploy step

Both backend workflows build with `npm ci`, then assemble a `deploy/` folder and
run a **second, lockfile-less install** inside it:

- `azure-backend-acc.yml:95`
- `azure-backend-production.yml:86`

`npm ci` requires a lockfile and installs it exactly. `npm install` in a folder
without one resolves ranges fresh at deploy time — so the code shipped to Azure
can contain dependency versions that no build step ever saw and no lockfile
records. This is a real gap, inside the deploy path, and it is fixable: copying
the workspace lockfile into `deploy/` and using `npm ci --omit=dev` would close
it. Left alone deliberately, because the pinning work was scoped to be
behaviour-preserving.

### 3. `node-version` floats within a major

`'22'` in the backend workflows, `'20'` in the frontend. `setup-node` resolves
these to whatever patch the runner has cached. Pinning to an exact patch would
trade a small supply-chain surface for routine breakage as runners roll forward,
and the Node distribution is not the threat model this policy was written for.

### 4. `zizmor-action`'s `version: '1.29.0'` input

The action itself is hash-pinned, and this input pins the zizmor binary it
fetches — so nothing floats. But Renovate's `github-actions` manager does not
parse action _inputs_, only `uses:` lines, so this one number is maintained by
hand. If the audit ever needs a newer zizmor, someone must edit it.

### 5. `ropa-site` builds inside Azure

`packages/ropa-site` has no `package.json` — it is `index.html` and a
`staticwebapp.config.json`. The workflows set no `skip_app_build`, so Azure's
Oryx builder inspects it, finds nothing to build, and uploads it as-is. The
build environment is Microsoft's and unpinnable, but with no dependency manifest
there is nothing for it to resolve. Worth stating precisely, because
"unpinned build environment" and "unpinned dependencies" are not the same claim.

## Version currency

The four `ropa-site` action references pin `actions/checkout` at **v3.7.0**,
four majors behind. Pinned is not the same as current: a hash freezes a version
in place, including an old one. Renovate now raises these as upgrades under the
14-day cooldown, which is the intended way for them to move — deliberately, in a
reviewable pull request, rather than silently on the next run.

## How the pins stay current

Pinning without automated updates decays into an unpatched tree, which is worse
than floating. `renovate.json` supplies the other half:

- **`helpers:pinGitHubActionDigests`** — anything reintroduced as a tag gets
  pinned back to a hash.
- **`minimumReleaseAge: "14 days"` with `internalChecksFilter: "strict"`** — a
  cooldown, not a security control. A compromised release is usually yanked
  within days; waiting two weeks means this repository never installs it.
  `strict` makes Renovate hold the pull request back rather than raise it and
  annotate it as pending.
- **`vulnerabilityAlerts` with `minimumReleaseAge: null`** — the fast lane. A
  fix for a known advisory must not wait out the cooldown.
- **Three workspace groups** — `backend`, `frontend`, `ropa-site`. An update
  that breaks one deployable should not be entangled with the other two.
- **`Azure/static-web-apps-deploy` disabled.** It is pinned to the newest commit
  on the `v1` _branch_; the `v1` _tag_ has not moved since 2021. Renovate
  resolves `@v1` to the tag, so leaving it enabled would raise a pull request
  "updating" the pin backwards by four years.

## How the rule is enforced

`.github/workflows/zizmor.yml` runs `zizmor` on every pull request and push to
`acc` and `main`, under `.github/zizmor.yml`, which sets `unpinned-uses` to
`hash-pin` for **`'*'`** — no exemption for first-party `actions/*`.

The audit workflow deliberately has **no `paths:` filter**. Every other workflow
here is path-filtered; filtering this one would let a pull request skip the gate
by touching nothing the filter watches.

The `acc` ruleset requires a pull request and a passing `audit` check, so the
gate is not advisory — a branch that reintroduces a floating tag cannot merge.
That includes releases: `/bump-release` was rewritten to land through a pull
request for exactly this reason.
