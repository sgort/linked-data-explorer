# CI follow-ups

Work identified while enforcing the IOU supply-chain pinning policy and cutting
v2026.08.9 on 2026-08-29. None of it blocked that release; all of it is a real
gap that release exposed.

The pinning work itself is done and documented in
[`SECURITY-PIPELINE.md`](../../../SECURITY-PIPELINE.md) and
[`docs/the-gate-has-teeth.md`](../../the-gate-has-teeth.md). This file is for
what is still open, so those two stay descriptions of what exists rather than
lists of what does not.

---

## 1. `check-format` runs in no workflow

**Status:** open

`npm run check-format` is enforced only by the pre-push hook. No deploy
workflow runs it, and the audit gate runs zizmor and the Renovate config
validator. So the rule holds on a developer's machine and not on the shared
branch — which is the wrong way round.

This cost real time on 2026-08-29. PR #38 raised prettier `3.7.4` → `3.9.6` as
one of twenty-three backend dependency updates. 3.9 formats short union types
on a single line, so five files nobody had touched began failing
`prettier --check` the moment it merged. Every CI check was green. The symptom
would have been the next person's `git push` failing on files they had never
opened; it was caught only because the release verification happened to run
`check-format` by hand.

**Fix:** add a `check-format` step to the audit job, next to the Renovate config
validator. It needs no new action — the job already sets up Node 24 for the
validator — and it lands inside the existing required status check, so no
ruleset change.

**Caution:** it must be added in the same pull request as any reformat it
demands, or it fails on the branch that introduces it.

---

## 2. The backend runs no tests on a pull request

**Status:** open

`azure-backend-acc.yml` triggers on `push` only. The workflow does run
`npm ci`, lint, **1130 tests**, and a build before deploying — the tests are
there and they are good. They just run on the wrong side of the merge.

The consequence is that a backend change reaches `acc` with the single check
`audit`, which validates workflows and `renovate.json` and says nothing about
whether the code works. During this release that meant every backend dependency
update — axios, fast-xml-parser, and the twenty-three in #38 — had to be
verified by checking the branch out and running the suite by hand. That worked,
but it is a person remembering to do it, not a gate.

It also let a genuine defect sit on a pushed branch: `feature/rip-r21-signature-tag`
had been failing its own `example-fixture-parity` test since the ValidSign
commit, because the signature attribute was added to the `e2e-fixtures/` mirror
and not the `examples/` source. No pull request ever ran that test.

**Blast radius today is bounded**, which is why this is a follow-up and not an
incident: the deploy step sits _after_ `npm test` in the same job, so a failure
gives a red `acc` and **no deployment** — the App Service keeps running the
previous code.

**Fix:** add a `pull_request` trigger with the deploy step gated on
`github.event_name == 'push'`, so pull requests lint, test and build without
deploying. The frontend workflow already works this way; this is bringing the
backend into line with it, not inventing a pattern.

**Note:** the production workflow needs the same treatment or deliberate
exclusion — decide, do not let it drift.

---

## Not on this list

Recorded here so they are not re-raised as oversights:

- **The 9 remaining production advisories**, one critical (`tar`). All
  transitive. `npm audit fix` clears none of them — verified by dry run; every
  remaining fix needs a major bump of a parent, which it will not do without
  `--force`, and `lockFileMaintenance` has the same ceiling. This needs
  `npm overrides` or deliberate parent upgrades, and is its own piece of work
  rather than a CI follow-up.
- **`staticappsclient:stable`** and the backend deploy step's lockfile-less
  `npm install --production`. Both are recorded as honest exceptions in
  `SECURITY-PIPELINE.md`; the first is not closeable from this side.
- **`main` still resolves floating tags.** The pins protect acceptance until
  `acc` is promoted. True of `ttl-editor` and `ronl-business-api` too.
