# Lockfile Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** A pull request that changes `package-lock.json` gets a CI comment
listing what the lockfile change contains, and a required check that fails on a
non-npmjs origin or a missing integrity — in linked-data-explorer (LDE),
ttl-editor (TTL) and ronl-business-api (RBA).

**Architecture:** One dependency-free Node script, `scripts/lockfile-diff.mjs`,
compares a base and a head lockfile as data and renders a Markdown report. Two
jobs in each repository's `zizmor.yml`: `lockfile-review` (required, read-only,
runs the script) and `lockfile-review-comment` (write token, no checkout, posts
the sticky comment).

**Tech Stack:** Node 24 built-ins (`node:fs`, `node:url`, `node:child_process`
in the test), GitHub Actions, `gh api`.

**Spec:** `docs/superpowers/specs/2026-10-05-lockfile-review-design.md` — read it
first; this plan argues from it.

## Global Constraints

- Lockfiles are read as data. The script never runs npm, never installs.
- Only `lockfileVersion` 3 is accepted; anything else exits 2.
- Exit codes: 0 nothing blocking · 1 a blocking finding · 2 unusable input
  (never read as clean).
- Blocking rules only: `resolved` not starting with
  `https://registry.npmjs.org/`; missing `integrity`. Over the whole head
  lockfile.
- Excluded from every rule: the root entry, workspace entries
  (`packages/…` keys), `link: true` entries, and — for the two blocking rules —
  `inBundle: true` entries.
- Comment marker, first line of every report: `<!-- lockfile-review -->`.
- GitHub comment limit: 65,536 characters.
- Initial allow-list: `MIT`, `ISC`, `Apache-2.0`, `BSD-2-Clause`,
  `BSD-3-Clause`, `BlueOak-1.0.0`, `0BSD`, `MIT-0`, `Unlicense`, `CC0-1.0`,
  `Python-2.0`, `CC-BY-4.0`.
- Workflow pins, reused (no new actions):
  `actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1`,
  `actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0`;
  Node `24.21.0`.
- Required check name: `lockfile-review`, on the `acc` ruleset only.
- Repository rules (CLAUDE.md): work on a feature branch; **ask the user before
  every commit**; hand over the acceptance command and wait for "green"; never
  `--no-verify`; never merge to `acc`/`main` locally; no Claude attribution in
  commits, pull requests or files.
- Ruleset changes on `acc` in LDE, TTL and RBA are approved for this work only,
  and only after that repository's job has reported on `acc`.

## Review Focus

- **A dependency with `inBundle: true`** (no `resolved`, no `integrity`, by
  npm's design) must not fail the check → pinned in Task 2.
- **A lockfile with merge-conflict markers, or written by an older npm**
  (`lockfileVersion` 2) must exit 2, never report "no findings" → pinned in
  Task 3.
- **A deduplication or hoisting reshuffle** — a newer copy removed, every copy
  on several major lines going up, or npm hoisting an existing older copy to
  the root — is an update, never a downgrade → pinned in Task 1 (four checks,
  from cases found replaying #230 and #251).
- **Lock-file maintenance with hundreds of moves** must still post a comment
  under GitHub's limit, pointing to the full report → pinned in Task 3.
- **A look-alike origin** (`https://registry.npmjs.org.evil.example/…`) must
  block exactly like any other foreign origin → pinned in Task 2.

---

## File structure

| File                                   | Responsibility                                | Repos                   |
| -------------------------------------- | --------------------------------------------- | ----------------------- |
| `scripts/lockfile-diff.mjs`            | parse, model, diff, rules, render, CLI        | all three, same content |
| `scripts/lockfile-diff.test.mjs`       | self-contained test, prints a PASS count      | all three, same content |
| `lockfile-review.json`                 | per-repository allow-list                     | all three               |
| `.github/workflows/zizmor.yml`         | the two jobs                                  | all three               |
| `SECURITY-PIPELINE.md`                 | pin register counts (RBA only records counts) | RBA                     |
| `docs/ICTU-dependencies-assessment.md` | R9 update note                                | LDE                     |
| `docs/ci-posture-across-repos.md`      | archive entry; ruleset rows                   | LDE                     |

The script is one file on purpose: `write-sbom.mjs` and `audit-tree.mjs` set
the pattern, and a single file is what gets copied between repositories.

Formatting: keep lines ≤ 80 characters, single quotes, no trailing commas in
multi-line calls where avoidable. Each repository's formatter may still rewrap;
if it does, accept its output and say "identical apart from formatting" in that
repository's commit, as was done for `write-sbom.mjs` in TTL.

---

### Task 1: Parse, model and diff (LDE)

**Files:**

- Create: `scripts/lockfile-diff.mjs`
- Create: `scripts/lockfile-diff.test.mjs`

**Interfaces:**

- Produces: `InputError`; `REGISTRY`; `parseLockfile(text, label) → doc`;
  `installedEntries(doc) → [key, entry][]`; `nameOf(key) → string`;
  `licenceOf(entry) → string|null`; `compareVersions(a, b) → -1|0|1`;
  `collectPackages(doc) → Map<name, {versions: string[], dev: boolean,
paths: {[installPath]: version}, optional: boolean,
licences: (string|null)[], installScript: boolean}>`;
  `diffPackages(base, head) → {added, removed, updated}` where `added` and
  `removed` items are `{name, ...record}` and `updated` items are
  `{name, from: string[], to: string[], dev, optional, downgrade: boolean}`.

- [ ] **Step 1: Write the test harness and the Task 1 checks**

Create `scripts/lockfile-diff.test.mjs`:

```js
// Tests for lockfile-diff.mjs. Self-contained, like the other scripts/*.test.mjs:
// no test runner, prints a PASS count, exits 1 on any failure. Runs in the
// workflow that uses the script (zizmor.yml, job lockfile-review).
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import * as L from "./lockfile-diff.mjs";

// fileURLToPath, not .pathname: on Windows .pathname is '/C:/…' and is not a
// usable path (see promotion-targets.test.mjs).
const SCRIPT = fileURLToPath(new URL("./lockfile-diff.mjs", import.meta.url));

let passed = 0;
const failures = [];
function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed += 1;
  else failures.push(`${label}\n    expected ${e}\n    actual   ${a}`);
}
function throws(label, fn, ErrorClass, pattern) {
  try {
    fn();
    failures.push(`${label}\n    expected a throw, got none`);
  } catch (err) {
    if (err instanceof ErrorClass && pattern.test(err.message)) passed += 1;
    else failures.push(`${label}\n    threw ${err.name}: ${err.message}`);
  }
}

const reg = (name, version) =>
  `https://registry.npmjs.org/${name}/-/${name.split("/").pop()}-${version}.tgz`;
function pkg(name, version, extra = {}) {
  return {
    version,
    resolved: reg(name, version),
    integrity: `sha512-${name}-${version}`,
    license: "MIT",
    ...extra,
  };
}
function lock(entries) {
  return {
    name: "fixture",
    lockfileVersion: 3,
    requires: true,
    packages: { "": { name: "fixture" }, ...entries },
  };
}
const nm = (name) => `node_modules/${name}`;

// ── Task 1: parse, model, diff ───────────────────────────────────────────────

throws(
  "rejects invalid JSON",
  () => L.parseLockfile("{", "base"),
  L.InputError,
  /not valid JSON/,
);
throws(
  "rejects lockfileVersion 2",
  () =>
    L.parseLockfile(JSON.stringify({ lockfileVersion: 2, packages: {} }), "b"),
  L.InputError,
  /lockfileVersion 3/,
);
throws(
  "rejects a lockfile without packages",
  () => L.parseLockfile(JSON.stringify({ lockfileVersion: 3 }), "b"),
  L.InputError,
  /packages/,
);

const ws = lock({
  "packages/backend": { name: "@x/backend", version: "1.0.0" },
  [nm("@x/backend")]: { resolved: "packages/backend", link: true },
  [nm("a")]: pkg("a", "1.0.0"),
  "packages/backend/node_modules/b": pkg("b", "2.0.0"),
});
check(
  "installed entries skip the root, workspaces and links",
  L.installedEntries(ws).map(([k]) => k),
  [nm("a"), "packages/backend/node_modules/b"],
);
check(
  "nameOf takes the last node_modules segment",
  L.nameOf("node_modules/a/node_modules/@s/b"),
  "@s/b",
);
check("licenceOf reads SPDX text", L.licenceOf({ license: "MIT" }), "MIT");
check(
  "licenceOf reads the legacy object form",
  L.licenceOf({ license: { type: "ISC" } }),
  "ISC",
);
check("licenceOf answers null when none is recorded", L.licenceOf({}), null);

check(
  "versions order numerically, not as text",
  ["1.10.0", "1.9.0", "1.2.3"].sort(L.compareVersions),
  ["1.2.3", "1.9.0", "1.10.0"],
);
check(
  "a release sorts above its prereleases",
  ["1.0.0", "1.0.0-rc.2", "1.0.0-rc.10"].sort(L.compareVersions),
  ["1.0.0-rc.2", "1.0.0-rc.10", "1.0.0"],
);
check(
  "build metadata is ignored",
  L.compareVersions("1.0.0+build.5", "1.0.0"),
  0,
);

const many = L.collectPackages(
  lock({
    [nm("a")]: pkg("a", "2.0.0"),
    [nm("b/node_modules/a")]: pkg("a", "1.0.0", { dev: true }),
    [nm("d")]: pkg("d", "1.0.0", { dev: true }),
    [nm("o")]: pkg("o", "1.0.0", { optional: true, hasInstallScript: true }),
  }),
);
check(
  "a name collects every installed version, sorted",
  many.get("a").versions,
  ["1.0.0", "2.0.0"],
);
check(
  "a name is runtime when any install is runtime",
  many.get("a").dev,
  false,
);
check("a name is dev only when every install is dev", many.get("d").dev, true);
check(
  "optional is reported for runtime packages",
  many.get("o").optional,
  true,
);
check("install scripts are collected", many.get("o").installScript, true);

const base1 = L.collectPackages(
  lock({
    [nm("a")]: pkg("a", "1.0.0"),
    [nm("gone")]: pkg("gone", "1.0.0"),
    [nm("down")]: pkg("down", "2.0.0"),
    [nm("same")]: pkg("same", "1.0.0"),
    [nm("dup")]: pkg("dup", "1.0.0"),
    [nm("x/node_modules/dup")]: pkg("dup", "2.0.0"),
  }),
);
const head1 = L.collectPackages(
  lock({
    [nm("a")]: pkg("a", "1.1.0"),
    [nm("new")]: pkg("new", "0.1.0", { dev: true }),
    [nm("down")]: pkg("down", "1.5.0"),
    [nm("y/node_modules/same")]: pkg("same", "1.0.0"),
    [nm("dup")]: pkg("dup", "2.0.0"),
  }),
);
const d1 = L.diffPackages(base1, head1);
check(
  "added names",
  d1.added.map((p) => p.name),
  ["new"],
);
check(
  "removed names",
  d1.removed.map((p) => p.name),
  ["gone"],
);
check(
  "updated names, with from, to and downgrade",
  d1.updated.map((p) => [p.name, p.from, p.to, p.downgrade]),
  [
    ["a", ["1.0.0"], ["1.1.0"], false],
    ["down", ["2.0.0"], ["1.5.0"], true],
    ["dup", ["1.0.0", "2.0.0"], ["2.0.0"], false],
  ],
);
check(
  "a hoisting move is not a change",
  d1.updated.some((p) => p.name === "same"),
  false,
);
const d1b = L.diffPackages(
  L.collectPackages(
    lock({
      [nm("agent")]: pkg("agent", "6.0.2"),
      [nm("x/node_modules/agent")]: pkg("agent", "7.1.4"),
      [nm("mid")]: pkg("mid", "1.0.0"),
      [nm("y/node_modules/mid")]: pkg("mid", "3.0.0"),
    }),
  ),
  L.collectPackages(
    lock({
      [nm("agent")]: pkg("agent", "6.0.2"),
      [nm("mid")]: pkg("mid", "1.0.0"),
      [nm("y/node_modules/mid")]: pkg("mid", "2.0.0"),
    }),
  ),
);
check(
  "losing the newer copy is an update, not a downgrade",
  d1b.updated.map((p) => [p.name, p.downgrade]),
  [
    ["agent", false],
    ["mid", true],
  ],
);
const d1c = L.diffPackages(
  L.collectPackages(
    lock({
      [nm("brace")]: pkg("brace", "1.1.18"),
      [nm("c/node_modules/brace")]: pkg("brace", "5.0.9"),
    }),
  ),
  L.collectPackages(
    lock({
      [nm("brace")]: pkg("brace", "1.1.21"),
      [nm("c/node_modules/brace")]: pkg("brace", "5.0.12"),
    }),
  ),
);
check(
  "every copy going up on several major lines is no downgrade",
  d1c.updated.map((p) => [p.name, p.downgrade]),
  [["brace", false]],
);
const d1d = L.diffPackages(
  L.collectPackages(
    lock({
      [nm("tf")]: pkg("tf", "5.9.0"),
      [nm("j/node_modules/tf")]: pkg("tf", "0.21.3"),
    }),
  ),
  L.collectPackages(
    lock({
      [nm("tf")]: pkg("tf", "0.21.3"),
      [nm("m/node_modules/tf")]: pkg("tf", "5.10.0"),
    }),
  ),
);
check(
  "hoisting an existing older copy to the root is no downgrade",
  d1d.updated.map((p) => [p.name, p.downgrade]),
  [["tf", false]],
);

// ── summary (later tasks insert their checks ABOVE this line) ───────────────
if (failures.length) {
  console.error(
    `FAIL: ${failures.length} of ${passed + failures.length} checks\n`,
  );
  for (const f of failures) console.error(`  ✗ ${f}\n`);
  process.exit(1);
}
console.log(`PASS: ${passed} checks`);
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node scripts/lockfile-diff.test.mjs`
Expected: an import error — `Cannot find module …/lockfile-diff.mjs`.

- [ ] **Step 3: Write the Task 1 part of the script**

Create `scripts/lockfile-diff.mjs`:

```js
#!/usr/bin/env node
/**
 * lockfile-diff.mjs — what a package-lock.json change actually contains.
 *
 * A dependency pull request shows its reviewer the direct change
 * (`prettier ^3.9.7 → ^3.9.8`). What moves is the lockfile, and nobody reads
 * a lockfile diff: a new transitive package, a new origin, a downgrade, a
 * licence change, a new install script. This compares two lockfiles as data
 * and says which of those happened (ICTU recommendation 9;
 * sgort/linked-data-explorer#248).
 *
 * Reads the lockfiles only: it never runs npm and never installs, like the
 * daily audit (--package-lock-only) and the release SBOM.
 *
 * The same file in linked-data-explorer, ttl-editor and ronl-business-api;
 * each repository's policy is lockfile-review.json at its root.
 *
 * Usage:
 *   node scripts/lockfile-diff.mjs <base-lockfile> <head-lockfile>
 *     [--config lockfile-review.json] [--out report.md] [--comment comment.md]
 *
 * Exit: 0 nothing blocking, 1 a blocking finding, 2 a lockfile or the config
 * could not be used — which must never read as clean.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const REGISTRY = "https://registry.npmjs.org/";
const NODE_MODULES = "node_modules/";

/** Input this cannot use: exit 2, never "clean". */
export class InputError extends Error {}

/** Only lockfileVersion 3 records every field read here. */
export function parseLockfile(text, label) {
  let doc;
  try {
    doc = JSON.parse(text);
  } catch (err) {
    throw new InputError(`${label} is not valid JSON: ${err.message}`);
  }
  if (doc?.lockfileVersion !== 3) {
    const found = doc?.lockfileVersion ?? "none";
    throw new InputError(`${label} must be lockfileVersion 3 (found ${found})`);
  }
  if (!doc.packages || typeof doc.packages !== "object") {
    throw new InputError(`${label} has no "packages" map`);
  }
  return doc;
}

/**
 * Installed packages, as [key, entry]. Skipped: the root (""), workspace
 * entries ("packages/backend") and the links npm makes to them
 * ("node_modules/@x/backend", link: true). Those carry no integrity and a
 * resolved inside the repository, so counting them would fail every
 * workspace repository on the origin and integrity rules.
 */
export function installedEntries(doc) {
  return Object.entries(doc.packages).filter(
    ([key, entry]) => key.includes(NODE_MODULES) && !entry.link,
  );
}

/** "node_modules/a/node_modules/@s/b" -> "@s/b" */
export function nameOf(key) {
  return key.slice(key.lastIndexOf(NODE_MODULES) + NODE_MODULES.length);
}

/** SPDX text, the legacy { type } object, or null when none is recorded. */
export function licenceOf(entry) {
  const l = entry.license;
  if (typeof l === "string" && l.trim()) return l.trim();
  if (l && typeof l === "object" && typeof l.type === "string") return l.type;
  return null;
}

/** Semver order without a dependency; build metadata ignored. */
export function compareVersions(a, b) {
  const split = (v) => {
    const core = String(v).split("+")[0];
    const i = core.indexOf("-");
    return i < 0 ? [core, ""] : [core.slice(0, i), core.slice(i + 1)];
  };
  const [coreA, preA] = split(a);
  const [coreB, preB] = split(b);
  const na = coreA.split(".").map(Number);
  const nb = coreB.split(".").map(Number);
  for (let i = 0; i < Math.max(na.length, nb.length); i += 1) {
    const d = (na[i] ?? 0) - (nb[i] ?? 0);
    if (Number.isNaN(d)) return String(a).localeCompare(String(b));
    if (d !== 0) return Math.sign(d);
  }
  if (preA === preB) return 0;
  if (!preA) return 1;
  if (!preB) return -1;
  return Math.sign(preA.localeCompare(preB, undefined, { numeric: true }));
}

/**
 * One record per package name across every path it is installed at, so a
 * hoisting move is not a change. dev only when every install is dev;
 * optional only for runtime names whose every install is optional.
 */
export function collectPackages(doc) {
  const acc = new Map();
  for (const [key, entry] of installedEntries(doc)) {
    const name = nameOf(key);
    const rec = acc.get(name) ?? {
      versions: new Set(),
      paths: {},
      dev: true,
      optional: true,
      licences: new Set(),
      installScript: false,
    };
    if (entry.version) {
      rec.versions.add(entry.version);
      rec.paths[key] = entry.version;
    }
    rec.dev &&= entry.dev === true;
    rec.optional &&= entry.optional === true;
    rec.licences.add(licenceOf(entry));
    rec.installScript ||= entry.hasInstallScript === true;
    acc.set(name, rec);
  }
  const byText = (x, y) => String(x).localeCompare(String(y));
  const out = new Map();
  for (const [name, rec] of acc) {
    out.set(name, {
      versions: [...rec.versions].sort(compareVersions),
      paths: rec.paths,
      dev: rec.dev,
      optional: !rec.dev && rec.optional,
      licences: [...rec.licences].sort(byText),
      installScript: rec.installScript,
    });
  }
  return out;
}

/** Added, removed and updated names; an update can be a downgrade. */
export function diffPackages(base, head) {
  const added = [];
  const removed = [];
  const updated = [];
  for (const [name, h] of head) {
    const b = base.get(name);
    if (!b) {
      added.push({ name, ...h });
      continue;
    }
    if (b.versions.join() === h.versions.join()) continue;
    // A downgrade is a consumer moving back: an install path now holding an
    // older version that is NEW to the tree, or a single-version package
    // going down (it may have been hoisted). Version SETS cannot say it, and
    // replaying #230/#251 showed three ways to be wrong: losing a newer copy
    // (agent-base), every copy on several major lines going up
    // (brace-expansion), and npm hoisting an existing older copy to the root
    // (type-fest 0.21.3, already installed elsewhere).
    const samePathDown = Object.entries(h.paths).some(
      ([key, v]) =>
        b.paths[key] &&
        !b.versions.includes(v) &&
        compareVersions(v, b.paths[key]) < 0,
    );
    const singleDown =
      b.versions.length === 1 &&
      h.versions.length === 1 &&
      compareVersions(h.versions[0], b.versions[0]) < 0;
    const downgrade = samePathDown || singleDown;
    updated.push({
      name,
      from: b.versions,
      to: h.versions,
      dev: h.dev,
      optional: h.optional,
      downgrade,
    });
  }
  for (const [name, b] of base) {
    if (!head.has(name)) removed.push({ name, ...b });
  }
  const byName = (x, y) => x.name.localeCompare(y.name);
  return {
    added: added.sort(byName),
    removed: removed.sort(byName),
    updated: updated.sort(byName),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node scripts/lockfile-diff.test.mjs`
Expected: `PASS: 23 checks`

---

### Task 2: Blocking rules, licences and install scripts (LDE)

**Files:**

- Modify: `scripts/lockfile-diff.mjs` (append after `diffPackages`)
- Modify: `scripts/lockfile-diff.test.mjs` (insert above the summary line)

**Interfaces:**

- Consumes: `installedEntries`, `REGISTRY`, `diffPackages` result, the
  `collectPackages` record shape (Task 1).
- Produces: `blockingFindings(doc) → {rule: 'origin'|'integrity', key, detail}[]`;
  `licenceAllowed(expression|null, allow: Set<string>) → boolean`;
  `reviewFindings(base, head, diff, allow) → {licenceChanges: {name, from, to}[],
licenceNotAllowed: {name, licences, dev}[], installScripts: {name, versions,
dev, isNew}[], downgrades: updated[]}`;
  `parseConfig(text, label) → {allow: Set<string>}`.

- [ ] **Step 1: Add the Task 2 checks**

Insert above `// ── summary` in `scripts/lockfile-diff.test.mjs`:

```js
// ── Task 2: blocking rules, licences, install scripts ───────────────────────

const bad = lock({
  [nm("ok")]: pkg("ok", "1.0.0"),
  [nm("git")]: pkg("git", "1.0.0", {
    resolved: "git+ssh://git@github.com/x/git.git#abc",
  }),
  [nm("tarball")]: pkg("tarball", "1.0.0", {
    resolved: "https://evil.example/tarball-1.0.0.tgz",
  }),
  [nm("lookalike")]: pkg("lookalike", "1.0.0", {
    resolved: "https://registry.npmjs.org.evil.example/l-1.0.0.tgz",
  }),
  [nm("noresolved")]: pkg("noresolved", "1.0.0", { resolved: undefined }),
  [nm("nohash")]: pkg("nohash", "1.0.0", { integrity: undefined }),
  [nm("ok/node_modules/bundled")]: {
    version: "1.0.0",
    inBundle: true,
    license: "MIT",
  },
  "packages/w": { name: "w", version: "1.0.0" },
  [nm("w")]: { resolved: "packages/w", link: true },
});
check(
  "blocking findings name each rule and package; bundles, workspaces and links pass",
  L.blockingFindings(bad).map((f) => `${f.rule} ${f.key}`),
  [
    "origin node_modules/git",
    "origin node_modules/tarball",
    "origin node_modules/lookalike",
    "origin node_modules/noresolved",
    "integrity node_modules/nohash",
  ],
);

const allow = new Set(["MIT", "Apache-2.0", "CC0-1.0"]);
check("a plain allowed id", L.licenceAllowed("MIT", allow), true);
check(
  "OR is allowed when either side is",
  L.licenceAllowed("(MIT OR GPL-3.0-or-later)", allow),
  true,
);
check("AND needs both sides", L.licenceAllowed("(MIT AND Zlib)", allow), false);
check(
  "AND binds tighter than OR",
  L.licenceAllowed("GPL-2.0 OR MIT AND CC0-1.0", allow),
  true,
);
check(
  "a custom licence is not allowed",
  L.licenceAllowed("SEE LICENSE IN LICENSE", allow),
  false,
);
check("no licence is not allowed", L.licenceAllowed(null, allow), false);

const base2 = L.collectPackages(
  lock({
    [nm("relicensed")]: pkg("relicensed", "1.0.0"),
    [nm("script")]: pkg("script", "1.0.0"),
    [nm("kept")]: pkg("kept", "1.0.0", { hasInstallScript: true }),
  }),
);
const head2 = L.collectPackages(
  lock({
    [nm("relicensed")]: pkg("relicensed", "1.1.0", { license: "BUSL-1.1" }),
    [nm("script")]: pkg("script", "1.0.1", { hasInstallScript: true }),
    [nm("kept")]: pkg("kept", "1.0.1", { hasInstallScript: true }),
    [nm("mpl")]: pkg("mpl", "1.0.0", { license: "MPL-2.0" }),
    [nm("legacy")]: pkg("legacy", "1.0.0", { license: { type: "MIT" } }),
    [nm("unlicensed")]: pkg("unlicensed", "1.0.0", {
      license: undefined,
      hasInstallScript: true,
    }),
  }),
);
const r2 = L.reviewFindings(base2, head2, L.diffPackages(base2, head2), allow);
check(
  "licence changes",
  r2.licenceChanges.map((c) => [c.name, c.from, c.to]),
  [["relicensed", ["MIT"], ["BUSL-1.1"]]],
);
const lost = (licences) =>
  L.collectPackages(
    lock(
      Object.fromEntries(
        licences.map((l, i) => [
          nm(`${"z/node_modules/".repeat(i)}mp`),
          pkg("mp", `1.${i}.0`, { license: l }),
        ]),
      ),
    ),
  );
const baseLost = lost(["BlueOak-1.0.0", "ISC"]);
const headLost = lost(["BlueOak-1.0.0"]);
check(
  "losing a licence with a removed copy is not a change",
  L.reviewFindings(
    baseLost,
    headLost,
    L.diffPackages(baseLost, headLost),
    allow,
  ).licenceChanges,
  [],
);
check(
  "new packages off the allow-list, including none recorded",
  r2.licenceNotAllowed.map((p) => p.name),
  ["mpl", "unlicensed"],
);
check(
  "install scripts: newly added, or on a new package; not an existing one",
  r2.installScripts.map((p) => [p.name, p.isNew]),
  [
    ["script", false],
    ["unlicensed", true],
  ],
);

check(
  "config yields the allow-list",
  [...L.parseConfig('{"allowLicenses":["MIT"]}', "cfg").allow],
  ["MIT"],
);
throws(
  "config without allowLicenses is refused",
  () => L.parseConfig("{}", "cfg"),
  L.InputError,
  /allowLicenses/,
);
throws(
  "config that is not JSON is refused",
  () => L.parseConfig("{", "cfg"),
  L.InputError,
  /not valid JSON/,
);
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node scripts/lockfile-diff.test.mjs`
Expected: `TypeError: L.blockingFindings is not a function`

- [ ] **Step 3: Append the Task 2 functions to the script**

Append to `scripts/lockfile-diff.mjs` (after `diffPackages`):

```js
/**
 * The two rules that fail the check, over the whole head lockfile: a bad
 * entry fails however it arrived. A bundled dependency (inBundle) ships
 * inside its parent's tarball, which carries the integrity; npm records
 * neither resolved nor integrity for it.
 */
export function blockingFindings(doc) {
  const findings = [];
  for (const [key, entry] of installedEntries(doc)) {
    if (entry.inBundle) continue;
    const from = entry.resolved;
    if (typeof from !== "string" || !from.startsWith(REGISTRY)) {
      const detail = from
        ? `resolved from ${from}`
        : "no resolved origin recorded";
      findings.push({ rule: "origin", key, detail });
    }
    if (!entry.integrity) {
      findings.push({ rule: "integrity", key, detail: "no integrity hash" });
    }
  }
  return findings;
}

/** SPDX, simply: AND binds tighter than OR; parentheses ignored. */
export function licenceAllowed(expression, allow) {
  if (!expression) return false;
  const terms = expression.replace(/[()]/g, " ").split(/\s+OR\s+/i);
  return terms.some((term) =>
    term.split(/\s+AND\s+/i).every((id) => allow.has(id.trim())),
  );
}

/**
 * Review prompts, never blocking: licence changes, new packages whose
 * licence the allow-list does not allow, install scripts that are new, and
 * downgrades. Licence and script findings consider only what changed, so
 * the accepted tree does not repeat in every report.
 */
export function reviewFindings(base, head, diff, allow) {
  const byName = (x, y) => x.name.localeCompare(y.name);
  const licenceChanges = [];
  const installScripts = [];
  for (const [name, h] of head) {
    const b = base.get(name);
    // A change is a licence the name did not have before. Losing one, when
    // a copy under it is removed, needs no review (minipass in #251).
    if (b && h.licences.some((l) => !b.licences.includes(l))) {
      licenceChanges.push({ name, from: b.licences, to: h.licences });
    }
    if (h.installScript && !b?.installScript) {
      installScripts.push({
        name,
        versions: h.versions,
        dev: h.dev,
        isNew: !b,
      });
    }
  }
  const licenceNotAllowed = diff.added
    .filter((p) => !p.licences.every((l) => licenceAllowed(l, allow)))
    .map((p) => ({ name: p.name, licences: p.licences, dev: p.dev }));
  return {
    licenceChanges: licenceChanges.sort(byName),
    licenceNotAllowed: licenceNotAllowed.sort(byName),
    installScripts: installScripts.sort(byName),
    downgrades: diff.updated.filter((u) => u.downgrade),
  };
}

/** lockfile-review.json: { "allowLicenses": [SPDX ids] }. */
export function parseConfig(text, label) {
  let doc;
  try {
    doc = JSON.parse(text);
  } catch (err) {
    throw new InputError(`${label} is not valid JSON: ${err.message}`);
  }
  const list = doc?.allowLicenses;
  if (!Array.isArray(list) || !list.every((l) => typeof l === "string")) {
    throw new InputError(
      `${label} needs "allowLicenses": an array of SPDX ids`,
    );
  }
  return { allow: new Set(list) };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node scripts/lockfile-diff.test.mjs`
Expected: `PASS: 37 checks`

---

### Task 3: Report, annotations and command line (LDE)

**Files:**

- Modify: `scripts/lockfile-diff.mjs` (append at the end)
- Modify: `scripts/lockfile-diff.test.mjs` (insert above the summary line)

**Interfaces:**

- Consumes: everything from Tasks 1–2.
- Produces: `MARKER`, `COMMENT_LIMIT`;
  `renderReport({blocking, diff, review}) → string`;
  `truncateForComment(report) → string`;
  `annotations(blocking) → string[]`; the CLI contract (arguments, files,
  exit codes) the workflow uses in Task 5.

- [ ] **Step 1: Add the Task 3 checks**

Insert above `// ── summary`:

```js
// ── Task 3: report, annotations, command line ───────────────────────────────

// d1 (Task 1) carries the downgrade; r2 (Task 2) carries the licence findings.
const review3 = { ...r2, downgrades: d1.updated.filter((u) => u.downgrade) };
const rep = L.renderReport({
  blocking: L.blockingFindings(bad),
  diff: d1,
  review: review3,
});
check("the report starts with the marker", rep.startsWith(L.MARKER), true);
check(
  "a blocking report says the check fails",
  /\*\*✗ 5 blocking findings\*\* — the check fails/.test(rep),
  true,
);
check("blocking findings are listed", rep.includes("`node_modules/git`"), true);
check(
  "downgrades are called out",
  rep.includes("#### Downgrades") && rep.includes("`down`"),
  true,
);
check("new licences off the list are called out", rep.includes("`mpl`"), true);
check(
  "the change lists sit in collapsible sections",
  rep.includes("<details>"),
  true,
);
const empty = { added: [], removed: [], updated: [] };
const none = {
  licenceChanges: [],
  licenceNotAllowed: [],
  installScripts: [],
  downgrades: [],
};
const clean = L.renderReport({ blocking: [], diff: empty, review: none });
check("a clean report says so", clean.includes("✓ No blocking findings"), true);

const long = `${L.MARKER}\n${"- a line of a long report\n".repeat(5000)}`;
const cut = L.truncateForComment(long);
check(
  "a long report is cut to fit a comment",
  cut.length <= L.COMMENT_LIMIT,
  true,
);
check("the cut says where the rest is", cut.includes("job summary"), true);
check("a short report is left alone", L.truncateForComment("short"), "short");

check(
  "annotations escape newlines and percent signs",
  L.annotations([{ rule: "origin", key: "node_modules/x", detail: "a%b\nc" }]),
  ["::error title=lockfile-review origin::node_modules/x: a%25b%0Ac"],
);

const dir = mkdtempSync(join(tmpdir(), "lockfile-diff-"));
const write = (name, data) => {
  const p = join(dir, name);
  writeFileSync(p, typeof data === "string" ? data : JSON.stringify(data));
  return p;
};
const run = (...args) => {
  try {
    execFileSync(process.execPath, [SCRIPT, ...args], {
      stdio: "pipe",
      env: { ...process.env, GITHUB_ACTIONS: "" },
    });
    return 0;
  } catch (err) {
    return err.status;
  }
};
const cfg = write("cfg.json", { allowLicenses: ["MIT"] });
const okBase = write("base.json", lock({ [nm("a")]: pkg("a", "1.0.0") }));
const okHead = write("head.json", lock({ [nm("a")]: pkg("a", "1.0.1") }));
const outFile = join(dir, "out.md");
const commentFile = join(dir, "comment.md");
check(
  "exit 0 when nothing blocks",
  run(
    okBase,
    okHead,
    "--config",
    cfg,
    "--out",
    outFile,
    "--comment",
    commentFile,
  ),
  0,
);
check(
  "--out holds the report",
  readFileSync(outFile, "utf8").startsWith(L.MARKER),
  true,
);
check("--comment holds the comment", existsSync(commentFile), true);
check(
  "exit 1 on a blocking finding",
  run(okBase, write("bad.json", bad), "--config", cfg, "--out", outFile),
  1,
);
check(
  "exit 2 on a lockfile with conflict markers",
  run(okBase, write("broken.json", "<<<<<<< HEAD\n{}"), "--config", cfg),
  2,
);
check(
  "exit 2 on lockfileVersion 2",
  run(
    okBase,
    write("v2.json", { lockfileVersion: 2, packages: {} }),
    "--config",
    cfg,
  ),
  2,
);
check(
  "exit 2 without a config",
  run(okBase, okHead, "--config", join(dir, "missing.json")),
  2,
);
check("exit 2 on wrong arguments", run(okBase), 2);
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node scripts/lockfile-diff.test.mjs`
Expected: `TypeError: L.renderReport is not a function`

- [ ] **Step 3: Append the Task 3 code to the script**

Append to the end of `scripts/lockfile-diff.mjs`:

```js
export const MARKER = "<!-- lockfile-review -->";
export const COMMENT_LIMIT = 65536;

const code = (s) => `\`${s}\``;
const versions = (v) => (v.length ? v.map(code).join(", ") : "—");
const licences = (l) =>
  l.map((x) => (x === null ? "_none recorded_" : code(x))).join(", ");
const kind = (p) =>
  p.dev ? "dev" : p.optional ? "runtime (optional)" : "runtime";
const runtimeFirst = (x, y) =>
  Number(x.dev) - Number(y.dev) || x.name.localeCompare(y.name);
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

function details(summary, lines) {
  if (!lines.length) return [];
  return [
    "<details>",
    `<summary>${summary}</summary>`,
    "",
    ...lines,
    "",
    "</details>",
    "",
  ];
}

function list(title, lines) {
  return lines.length ? [`#### ${title}`, "", ...lines, ""] : [];
}

/** The Markdown report: verdict, blocking findings, prompts, then changes. */
export function renderReport({ blocking, diff, review }) {
  const runtime = (items) => items.filter((p) => !p.dev).length;
  const verdict = blocking.length
    ? `**✗ ${plural(blocking.length, "blocking finding")}** — the check fails.`
    : "**✓ No blocking findings.**";
  const counts = [
    `${diff.added.length} added (${runtime(diff.added)} runtime)`,
    `${diff.removed.length} removed (${runtime(diff.removed)} runtime)`,
    `${diff.updated.length} updated (${runtime(diff.updated)} runtime)`,
    `${review.downgrades.length} downgraded`,
  ].join(" · ");
  return [
    MARKER,
    "### Lockfile review",
    "",
    verdict,
    "",
    `${counts}.`,
    "",
    ...list(
      "Blocking",
      blocking.map((b) => `- **${b.rule}** ${code(b.key)}: ${b.detail}`),
    ),
    ...list(
      "Downgrades",
      review.downgrades.map(
        (u) =>
          `- ${code(u.name)} ${versions(u.from)} → ${versions(u.to)} — ${kind(u)}`,
      ),
    ),
    ...list(
      "Licence changes",
      review.licenceChanges.map(
        (c) => `- ${code(c.name)} ${licences(c.from)} → ${licences(c.to)}`,
      ),
    ),
    ...list(
      "New packages with a licence not on the allow-list",
      review.licenceNotAllowed.map(
        (p) => `- ${code(p.name)} ${licences(p.licences)} — ${kind(p)}`,
      ),
    ),
    ...list(
      "New install scripts",
      review.installScripts.map(
        (p) =>
          `- ${code(p.name)} ${versions(p.versions)} — ${kind(p)}, ` +
          (p.isNew ? "new package" : "script newly added"),
      ),
    ),
    ...details(
      `Added (${diff.added.length})`,
      [...diff.added]
        .sort(runtimeFirst)
        .map(
          (p) =>
            `- ${code(p.name)} ${versions(p.versions)} — ${kind(p)} — ` +
            licences(p.licences),
        ),
    ),
    ...details(
      `Removed (${diff.removed.length})`,
      [...diff.removed]
        .sort(runtimeFirst)
        .map((p) => `- ${code(p.name)} ${versions(p.versions)} — ${kind(p)}`),
    ),
    ...details(
      `Updated (${diff.updated.length})`,
      [...diff.updated]
        .sort(runtimeFirst)
        .map(
          (u) =>
            `- ${code(u.name)} ${versions(u.from)} → ${versions(u.to)} — ` +
            kind(u) +
            (u.downgrade ? " — **downgrade**" : ""),
        ),
    ),
  ].join("\n");
}

/** Fits a GitHub comment; the job summary keeps the whole report. */
export function truncateForComment(report) {
  if (report.length <= COMMENT_LIMIT) return report;
  const note =
    "\n\n_Cut to fit a GitHub comment. The full report is in " +
    "the `lockfile-review` job summary._\n";
  const room = report.slice(0, COMMENT_LIMIT - note.length);
  return room.slice(0, room.lastIndexOf("\n")) + note;
}

/** One ::error line per blocking finding, escaped as Actions requires. */
export function annotations(blocking) {
  const escape = (s) =>
    s.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
  return blocking.map(
    (b) =>
      `::error title=lockfile-review ${b.rule}::${escape(`${b.key}: ${b.detail}`)}`,
  );
}

function main(argv) {
  const args = argv.slice(2);
  const option = (name) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const positional = args.filter(
    (a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")),
  );
  if (positional.length !== 2) {
    throw new InputError(
      "usage: lockfile-diff.mjs <base-lockfile> <head-lockfile> " +
        "[--config file] [--out file] [--comment file]",
    );
  }
  const read = (path, label) => {
    try {
      return readFileSync(path, "utf8");
    } catch (err) {
      throw new InputError(`cannot read ${label} ${path}: ${err.code}`);
    }
  };
  const configPath = option("--config") ?? "lockfile-review.json";
  const config = parseConfig(read(configPath, "config"), configPath);
  const [basePath, headPath] = positional;
  const baseDoc = parseLockfile(read(basePath, "base lockfile"), basePath);
  const headDoc = parseLockfile(read(headPath, "head lockfile"), headPath);
  const base = collectPackages(baseDoc);
  const head = collectPackages(headDoc);
  const diff = diffPackages(base, head);
  const review = reviewFindings(base, head, diff, config.allow);
  const blocking = blockingFindings(headDoc);
  const report = renderReport({ blocking, diff, review });
  const out = option("--out");
  if (out) writeFileSync(out, report);
  else process.stdout.write(`${report}\n`);
  const comment = option("--comment");
  if (comment) writeFileSync(comment, truncateForComment(report));
  if (process.env.GITHUB_ACTIONS === "true") {
    for (const line of annotations(blocking)) console.log(line);
  }
  return blocking.length ? 1 : 0;
}

const invoked =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invoked) {
  try {
    process.exitCode = main(process.argv);
  } catch (err) {
    // Anything unexpected is exit 2 as well: a crash must not read as clean.
    console.error(
      `lockfile-diff: ${err instanceof InputError ? err.message : err.stack}`,
    );
    process.exitCode = 2;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node scripts/lockfile-diff.test.mjs`
Expected: `PASS: 56 checks`

- [ ] **Step 5: Stage, and ask the user before committing**

```bash
git add scripts/lockfile-diff.mjs scripts/lockfile-diff.test.mjs
git status --short
```

Hand over: `node scripts/lockfile-diff.test.mjs` (expected `PASS: 56 checks`).
Ask the user to commit. Proposed message:
`feat(scripts): lockfile-diff, what a package-lock.json change contains (#248)`.

---

### Task 4: Allow-list, and a replay against real history (LDE)

**Files:**

- Create: `lockfile-review.json`

**Interfaces:**

- Consumes: the CLI contract from Task 3.
- Produces: the config file the workflow passes with `--config`.

- [ ] **Step 1: Create the allow-list**

Create `lockfile-review.json`:

```json
{
  "$comment": "Read by scripts/lockfile-diff.mjs (#248). A NEW package whose licence this list does not allow is a review prompt in the lockfile-review comment, not a failure. The initial list is the permissive set already present in the tree on 5 October 2026; MPL-2.0 and custom licences (bpmn.io's 'SEE LICENSE IN LICENSE') are left off on purpose, so a new one gets looked at.",
  "allowLicenses": [
    "MIT",
    "ISC",
    "Apache-2.0",
    "BSD-2-Clause",
    "BSD-3-Clause",
    "BlueOak-1.0.0",
    "0BSD",
    "MIT-0",
    "Unlicense",
    "CC0-1.0",
    "Python-2.0",
    "CC-BY-4.0"
  ]
}
```

- [ ] **Step 2: Replay lock-file maintenance #230**

```bash
T=$(mktemp -d)
git show cc2b1df^1:package-lock.json > "$T/230-base.json"
git show cc2b1df:package-lock.json > "$T/230-head.json"
node scripts/lockfile-diff.mjs "$T/230-base.json" "$T/230-head.json" --out "$T/230.md" --comment "$T/230-comment.md"; echo "exit $?"
wc -c "$T/230.md" "$T/230-comment.md"
```

`cc2b1df` is the merge of #230; its first parent is the previous `acc`, so
`^1` is the right base (checked while writing this plan).
Expected: `exit 0`, `0 added · 0 removed · 77 updated (21 runtime) · 0
downgraded`, no Blocking section.

- [ ] **Step 3: Replay the libxmljs2 override #251**

```bash
git show be5bc99^1:package-lock.json > "$T/251-base.json"
git show be5bc99:package-lock.json > "$T/251-head.json"
node scripts/lockfile-diff.mjs "$T/251-base.json" "$T/251-head.json" --out "$T/251.md"; echo "exit $?"
```

Expected: `exit 0`, `34 removed · 20 updated · 0 downgraded`; `node-gyp`
`11.5.0 → 13.0.2`, `make-fetch-happen` and `http-cache-semantics` among the
removed. Both replays were run while writing this plan, and they shaped the
downgrade and licence-change rules: the spec's first rule reported five
"downgrades" and a licence change here that were only removed copies.

- [ ] **Step 4: Check the current tree is clean against itself**

```bash
node scripts/lockfile-diff.mjs package-lock.json package-lock.json; echo "exit $?"
```

Expected: `**✓ No blocking findings.**`, `0 added … 0 updated`, `exit 0` —
proves no entry in today's tree trips the blocking rules.

- [ ] **Step 5: Show the user both reports before going further**

Print `$T/230.md` and `$T/251.md` in full and ask whether the report reads well.
Apply wording changes they ask for in `renderReport`, re-run Task 3's test.

---

### Task 5: The two jobs, and the documents (LDE)

**Files:**

- Modify: `.github/workflows/zizmor.yml` (append two jobs after `audit`)
- Modify: `docs/ICTU-dependencies-assessment.md` (§9)
- Modify: `docs/ci-posture-across-repos.md` (archive entry)

**Interfaces:**

- Consumes: `node scripts/lockfile-diff.test.mjs`; the CLI with `--config
lockfile-review.json --out <file> --comment <file>`; exit codes.
- Produces: check run `lockfile-review` (required in Task 6); job outputs
  `changed` (`'true'|'false'`) and `report` (comment text).

- [ ] **Step 1: Append the jobs to `.github/workflows/zizmor.yml`**

Append at the end of the file (after the `audit` job's last step):

```yaml
# What a dependency pull request's lockfile change contains (#248, ICTU R9).
# A reviewer is shown `prettier ^3.9.7 -> ^3.9.8`; what moves is
# package-lock.json, and nobody reads that diff. Required on acc: it runs
# on every pull request, because this workflow has no paths filter, and
# succeeds at once when the lockfile is unchanged -- so it can be required
# without the never-reports trap.
#
# Two jobs, for the trust boundary: this one runs code from the head ref
# (the script and the lockfile) with a READ-ONLY token; the comment job
# holds the write token and runs no repository code at all.
lockfile-review:
  name: lockfile-review
  if: github.event_name == 'pull_request'
  runs-on: ubuntu-24.04
  permissions:
    contents: read
  outputs:
    changed: ${{ steps.diff.outputs.changed }}
    report: ${{ steps.diff.outputs.report }}
  steps:
    - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      with:
        persist-credentials: false
    - name: Set up Node
      uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
      with:
        node-version: "24.21.0"
    - name: Test the lockfile diff
      # Tested where it runs, like promotion-targets.test.mjs.
      run: node scripts/lockfile-diff.test.mjs
    - name: Compare package-lock.json with the base
      id: diff
      env:
        BASE_SHA: ${{ github.event.pull_request.base.sha }}
      run: |
        git fetch --no-tags --depth=1 origin "$BASE_SHA"
        if git diff --quiet "$BASE_SHA" HEAD -- package-lock.json; then
          echo "changed=false" >> "$GITHUB_OUTPUT"
          echo "package-lock.json is unchanged by this pull request." >> "$GITHUB_STEP_SUMMARY"
          exit 0
        fi
        echo "changed=true" >> "$GITHUB_OUTPUT"
        git show "$BASE_SHA:package-lock.json" > "$RUNNER_TEMP/base-lock.json"
        status=0
        node scripts/lockfile-diff.mjs "$RUNNER_TEMP/base-lock.json" package-lock.json \
          --config lockfile-review.json \
          --out "$RUNNER_TEMP/report.md" --comment "$RUNNER_TEMP/comment.md" || status=$?
        if [ -f "$RUNNER_TEMP/report.md" ]; then
          cat "$RUNNER_TEMP/report.md" >> "$GITHUB_STEP_SUMMARY"
        fi
        if [ -f "$RUNNER_TEMP/comment.md" ]; then
          # A delimiter per run, so no report content can end the value early.
          delim="EOF_$(openssl rand -hex 16)"
          { echo "report<<$delim"; cat "$RUNNER_TEMP/comment.md"; echo; echo "$delim"; } >> "$GITHUB_OUTPUT"
        fi
        exit "$status"

lockfile-review-comment:
  name: lockfile-review-comment
  needs: lockfile-review
  # always(): a red check still gets the comment that says why. Same-repo
  # branches only: a fork's token is read-only, and its summary suffices.
  if: >-
    always() && github.event_name == 'pull_request' &&
    needs.lockfile-review.outputs.changed == 'true' &&
    github.event.pull_request.head.repo.full_name == github.repository
  runs-on: ubuntu-24.04
  permissions:
    pull-requests: write
  steps:
    - name: Post or update the lockfile review comment
      # No checkout: this job runs no repository code. The report arrives
      # through env, never ${{ }} inside the script (template injection).
      env:
        GH_TOKEN: ${{ github.token }}
        REPO: ${{ github.repository }}
        PR: ${{ github.event.pull_request.number }}
        REPORT: ${{ needs.lockfile-review.outputs.report }}
      run: |
        marker='<!-- lockfile-review -->'
        id=$(gh api --paginate "repos/$REPO/issues/$PR/comments" \
          --jq ".[] | select(.user.login == \"github-actions[bot]\" and (.body | startswith(\"$marker\"))) | .id" | head -n1)
        if [ -n "$id" ]; then
          gh api --method PATCH "repos/$REPO/issues/comments/$id" -f body="$REPORT" > /dev/null
        else
          gh api --method POST "repos/$REPO/issues/$PR/comments" -f body="$REPORT" > /dev/null
        fi
```

- [ ] **Step 2: Validate the workflow locally**

```bash
node -e "require('yaml')" 2>/dev/null && node -e "const y=require('yaml');y.parse(require('fs').readFileSync('.github/workflows/zizmor.yml','utf8'));console.log('yaml ok')" || python -c "import yaml;yaml.safe_load(open('.github/workflows/zizmor.yml'));print('yaml ok')"
npm run check-supply-chain -- --offline
npm run check-format
```

Expected: `yaml ok`; `check-supply-chain` agrees (no new pins, LDE's register
records digests, not counts); `check-format` clean. zizmor itself runs on the
pull request (`audit` job).

- [ ] **Step 3: Add the R9 update note**

In `docs/ICTU-dependencies-assessment.md` §9, replace the paragraph

```
No repository has tooling for the transitive review the guideline describes: new
runtime dependencies, new origins, downgrades, or licence changes in a lockfile
diff.
```

with

```
No repository had tooling for the transitive review the guideline describes: new
runtime dependencies, new origins, downgrades, or licence changes in a lockfile
diff.

**Update, October 2026 (#248):** a `lockfile-review` check now does. On every
pull request that changes `package-lock.json` it posts a comment listing added,
removed, updated and downgraded packages, licence changes, new packages whose
licence is not on the repository's allow-list (`lockfile-review.json`), and new
install scripts — read from the two lockfiles, nothing installed. It fails, and
is required on `acc`, only for a `resolved` origin outside
`https://registry.npmjs.org/` or a missing `integrity`. The scores in this
document are still those of 13 September.
```

- [ ] **Step 4: Add the posture archive entry**

In `docs/ci-posture-across-repos.md`, directly under
`## Archive: what changed, by date` and its introduction, insert a new entry
above the newest one, dated the day the LDE pull request is opened:

```
### What changed on <DATE>

Additions only; the heads in the table at the top are unchanged. A
`lockfile-review` job in `zizmor.yml` shows reviewers what a dependency pull
request's lockfile change contains — added, removed, updated and downgraded
packages, licence changes, licences off the allow-list, new install scripts —
as a comment, and fails on a non-npmjs origin or a missing `integrity`
([#248](https://github.com/sgort/linked-data-explorer/issues/248)). A second
job holds the write token for the comment and runs no repository code. In
Linked Data Explorer first; ttl-editor and RONL Business API follow, and each
`acc` ruleset requires the check once it has reported there.
```

Replace `<DATE>` with the actual date, e.g. `7 October 2026`. Then run
`npx --prefix packages/frontend prettier --write` on both documents.

- [ ] **Step 5: Stage, and ask the user before committing**

```bash
git add lockfile-review.json .github/workflows/zizmor.yml docs/ICTU-dependencies-assessment.md docs/ci-posture-across-repos.md docs/superpowers/plans/2026-10-06-lockfile-review.md
git status --short
```

Hand over: `node scripts/lockfile-diff.test.mjs && npm run check-format && npm run check-supply-chain -- --offline`.
Ask the user to commit. Proposed message:
`ci: lockfile-review on dependency pull requests (#248)`.
Then, on approval: push `feat/lockfile-review`, open the pull request against
`acc` ("Part of #248"; body lists the two jobs, the trust boundary, the replay
results from Task 4, and that the ruleset change follows the merge). The
pull request's own run must show `lockfile-review` green with "package-lock.json
is unchanged" in its summary, and no comment job.

---

### Task 6: Require the check on LDE's `acc` (after the merge)

**Files:** none (GitHub ruleset). Approved by the user for this work.

- [ ] **Step 1: Confirm the job has reported on `acc`**

After the user reports the merge:

```bash
gh run list -R sgort/linked-data-explorer --branch acc --workflow zizmor.yml --limit 3 --json headSha,conclusion
gh pr list -R sgort/linked-data-explorer --state open --json number,title | head
```

`lockfile-review` only runs on pull requests, so confirm it from the merged
pull request's checks:
`gh pr checks <merged-pr-number> -R sgort/linked-data-explorer | grep lockfile-review`
Expected: `lockfile-review  pass`.

- [ ] **Step 2: Read the `acc` ruleset**

```bash
gh api repos/sgort/linked-data-explorer/rulesets --jq '.[] | "\(.id) \(.name) \(.target)"'
gh api repos/sgort/linked-data-explorer/rulesets/21794157 > "$TMP/lde-acc-before.json"
jq '.rules[] | select(.type=="required_status_checks") | .parameters.required_status_checks' "$TMP/lde-acc-before.json"
```

Use the id that targets `acc` if it is not `21794157`. Keep the "before" file.

- [ ] **Step 3: Add `lockfile-review`, with the same integration as `audit`**

```bash
jq '{name, target, enforcement, conditions, bypass_actors,
     rules: [.rules[] | if .type == "required_status_checks"
       then .parameters.required_status_checks +=
         [(.parameters.required_status_checks[] | select(.context == "audit")
           | .context = "lockfile-review")]
       else . end]}' "$TMP/lde-acc-before.json" > "$TMP/lde-acc-after.json"
diff <(jq -S . "$TMP/lde-acc-before.json") <(jq -S . "$TMP/lde-acc-after.json")
gh api --method PUT repos/sgort/linked-data-explorer/rulesets/21794157 --input "$TMP/lde-acc-after.json" > /dev/null
```

Expected `diff`: one added `{ "context": "lockfile-review", "integration_id": … }`
(plus the read-only fields the PUT body omits).

- [ ] **Step 4: Confirm with a read**

```bash
gh api repos/sgort/linked-data-explorer/rulesets/21794157 --jq '.rules[] | select(.type=="required_status_checks") | [.parameters.required_status_checks[].context]'
```

Expected: the previous contexts plus `"lockfile-review"`.

---

### Task 7: Port to ttl-editor

**Files:**

- Create: `scripts/lockfile-diff.mjs`, `scripts/lockfile-diff.test.mjs`
  (copied from LDE `acc`), `lockfile-review.json`
- Modify: `.github/workflows/zizmor.yml` (append the two jobs after the job
  `zizmor:` named `audit`)

- [ ] **Step 1: Branch from an up-to-date `acc`**

```bash
git -C ../ttl-editor switch acc && git -C ../ttl-editor pull --ff-only
git -C ../ttl-editor switch -c feat/lockfile-review
git -C ../ttl-editor branch --show-current
```

- [ ] **Step 2: Copy the script, the test and the allow-list from LDE**

```bash
cp scripts/lockfile-diff.mjs scripts/lockfile-diff.test.mjs ../ttl-editor/scripts/
cp lockfile-review.json ../ttl-editor/lockfile-review.json
node ../ttl-editor/scripts/lockfile-diff.test.mjs
```

Expected: `PASS: 56 checks`. In `../ttl-editor/lockfile-review.json`, change
the `$comment` date clause only if TTL's tree differs (it holds MPL-2.0
`lightningcss`, already accepted: MPL-2.0 stays off the list).

- [ ] **Step 3: Append the two jobs**

Append to `../ttl-editor/.github/workflows/zizmor.yml` exactly the YAML block
from Task 5 Step 1 (both jobs, with their comment block). TTL's register lists
digests without counts, so `SECURITY-PIPELINE.md` needs no change.

- [ ] **Step 4: Check the clean tree and the repository's own gates**

```bash
cd ../ttl-editor
node scripts/lockfile-diff.mjs package-lock.json package-lock.json | head -8
npm run check-format
npm run check-supply-chain -- --offline
```

Expected: `✓ No blocking findings`; format and supply chain clean. If the
formatter rewraps the two scripts, accept it and note "identical to LDE's apart
from formatting" in the commit.

- [ ] **Step 5: Stage, ask, then push and open the pull request**

```bash
git add scripts/lockfile-diff.mjs scripts/lockfile-diff.test.mjs lockfile-review.json .github/workflows/zizmor.yml
git status --short
```

Ask the user to commit: `ci: lockfile-review on dependency pull requests
(sgort/linked-data-explorer#248)`. On approval, push and open the pull request
against `acc` ("Part of sgort/linked-data-explorer#248").

- [ ] **Step 6: After the merge, require the check on TTL's `acc`**

Repeat Task 6 Steps 1–4 with `-R sgort/ttl-editor`, ruleset id `21728745`
(verify with the listing). TTL's `audit` check is the job `zizmor` named
`audit`; the jq filter matches on `context == "audit"`, which is right.

---

### Task 8: Port to ronl-business-api

**Files:**

- Create: `scripts/lockfile-diff.mjs`, `scripts/lockfile-diff.test.mjs`,
  `lockfile-review.json`
- Modify: `.github/workflows/zizmor.yml` (append after the `audit` job)
- Modify: `SECURITY-PIPELINE.md` (pin counts)

- [ ] **Step 1: Branch from an up-to-date `acc`**

```bash
git -C ../ronl-business-api switch acc && git -C ../ronl-business-api pull --ff-only
git -C ../ronl-business-api switch -c feat/lockfile-review
git -C ../ronl-business-api branch --show-current
```

- [ ] **Step 2: Copy, and run the test**

```bash
cp scripts/lockfile-diff.mjs scripts/lockfile-diff.test.mjs ../ronl-business-api/scripts/
cp lockfile-review.json ../ronl-business-api/lockfile-review.json
node ../ronl-business-api/scripts/lockfile-diff.test.mjs
```

Expected: `PASS: 56 checks`.

- [ ] **Step 3: Append the two jobs**

Append the YAML block from Task 5 Step 1 to
`../ronl-business-api/.github/workflows/zizmor.yml`.

- [ ] **Step 4: Update the pin counts in RBA's register**

The new job adds one `actions/checkout` and one `actions/setup-node`. In
`../ronl-business-api/SECURITY-PIPELINE.md`, change

```
| `actions/checkout` (×13)
| `actions/setup-node` (×11)
```

to `(×14)` and `(×12)`, keeping each row's column padding. Verify the counts
against the workflows first:

```bash
grep -rh "uses: actions/checkout@" ../ronl-business-api/.github/workflows/ | wc -l
grep -rh "uses: actions/setup-node@" ../ronl-business-api/.github/workflows/ | wc -l
```

Expected: `14` and `12`.

- [ ] **Step 5: Check the clean tree and the repository's gates**

```bash
cd ../ronl-business-api
node scripts/lockfile-diff.mjs package-lock.json package-lock.json | head -8
npm run check-format
npm run check-supply-chain -- --offline
```

Expected: `✓ No blocking findings` (RBA's six entries without `integrity` are
workspace entries and are excluded); format clean; supply chain agrees,
counts included.

- [ ] **Step 6: Stage, ask, push, open the pull request**

```bash
git add scripts/lockfile-diff.mjs scripts/lockfile-diff.test.mjs lockfile-review.json .github/workflows/zizmor.yml SECURITY-PIPELINE.md
git status --short
```

Ask the user to commit: `ci: lockfile-review on dependency pull requests
(sgort/linked-data-explorer#248)`. On approval, push and open the pull request
against `acc`.

- [ ] **Step 7: After the merge, require the check on RBA's `acc`**

Repeat Task 6 Steps 1–4 with `-R sgort/ronl-business-api`, ruleset id
`21741898` (verify with the listing).

---

### Task 9: Close out

**Files:**

- Modify: `docs/ci-posture-across-repos.md` (three `acc` ruleset rows)

- [ ] **Step 1: Add `lockfile-review` to the three `acc` ruleset rows**

In each repository's table, the `` `acc` ruleset `` row lists the required
checks; add `` `lockfile-review` `` to each and re-run Prettier on the file.
Branch `docs/lockfile-review-rulesets` from `acc` in LDE.

- [ ] **Step 2: Tick #248's checklist**

```bash
gh issue view 248 -R sgort/linked-data-explorer --json body --jq .body > "$TMP/248.md"
sed -i 's/^- \[ \] packages \*\*added\*\*/- [x] packages **added**/; s/^- \[ \] \*\*downgrades\*\*/- [x] **downgrades**/; s/^- \[ \] any `resolved`/- [x] any `resolved`/; s/^- \[ \] \*\*licence\*\*/- [x] **licence**/; s/^- \[ \] new or changed \*\*install scripts\*\*/- [x] new or changed **install scripts**/; s/^- \[ \] \*\*LDE\*\*/- [x] **LDE**/; s/^- \[ \] \*\*TTL\*\*/- [x] **TTL**/; s/^- \[ \] \*\*RBA\*\*/- [x] **RBA**/' "$TMP/248.md"
grep -c '^- \[x\]' "$TMP/248.md"
gh issue edit 248 -R sgort/linked-data-explorer --body-file "$TMP/248.md"
```

Expected count: `8`.

- [ ] **Step 3: Stage the document, ask, and close the issue with its pull request**

Ask the user to commit `docs: lockfile-review required on acc in all three`,
open the pull request with "Closes #248", and do the housekeeping after its
merge.
