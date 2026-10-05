#!/usr/bin/env node
/**
 * check-rip-bpmn-copies.mjs — the twelve RIP BPMNs exist three times.
 *
 * THE GAP THIS CLOSES. `examples/organizations/flevoland/rip-phase-NN/` is the
 * source of truth for the twelve RIP phase models. Two more copies live
 * downstream of it:
 *
 *   1. `e2e-fixtures/flevoland/` — what the E2E suite deploys (R2.1, R2.2)
 *   2. ronl-business-api's `packages/backend/src/rip-swimlane/__fixtures__/`
 *      — parser fixtures pinning swimlane parsing against real files
 *
 * Both are kept current by hand: a `cp` loop written down in
 * ronl-business-api's docs/superpowers/plans/2026-09-03-rip-phase-swimlane-
 * derivation.md, and nothing at all for the e2e-fixtures side. So an edit to a
 * phase model propagates only if whoever made it remembered, and drift is
 * silent — the parser tests keep passing against a stale file, and the E2E
 * suite keeps deploying one. The first hint is a swimlane that disagrees with
 * the process someone is actually running.
 *
 * That is not hypothetical. R2.2's "Opstellen concept VO" produces an
 * Ontwerptoelichting AND an Objectenboom; only the first was modelled, the
 * second sat in the manifest as an authored template no BPMN referenced, and
 * nothing noticed until someone read the manifest against the BPMN by hand.
 *
 * WHAT IS ENFORCED HERE, AND WHY IN TWO DIFFERENT WAYS.
 *
 *   - The e2e-fixtures copies are compared byte for byte against their source.
 *     Both live in this repository, so the real files can be read and there is
 *     no reason to settle for anything weaker.
 *
 *   - The authoring files are checked against recorded sha256 fingerprints in
 *     rip-bpmn-fingerprints.json. That file is committed identically in BOTH
 *     repositories, which is what lets ronl-business-api enforce the same
 *     thing in ITS ci without checking this repository out — neither repo's ci
 *     can see the other. A changed fingerprint here means the downstream
 *     copies are now stale, and says so.
 *
 * So: editing a phase model fails this check until the fingerprints are
 * regenerated, and regenerating them is the moment you are told to refresh
 * ronl-business-api. Three copies, one ritual, and the ritual cannot be
 * half-done without a red check.
 *
 * `--write` regenerates the fingerprints and refreshes the e2e-fixtures copies
 * from source. Exit 0 when every copy agrees, 1 otherwise; a failure names the
 * file and the command that fixes it, because a check that only says "a rule
 * was broken" makes the reader guess at the fix.
 */

import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";

const AUTHORING = "examples/organizations/flevoland";
const E2E_FIXTURES = "e2e-fixtures/flevoland";
const FINGERPRINTS = "rip-bpmn-fingerprints.json";

const write = process.argv.includes("--write");

const sha256 = (path) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");

/** Every RIP phase model, as {name, path}, ordered by phase. */
function authoringModels() {
  const found = [];
  for (const dir of readdirSync(AUTHORING)) {
    if (!/^rip-phase-\d\d$/.test(dir)) continue;
    for (const file of readdirSync(join(AUTHORING, dir))) {
      if (/^RipR\d\dProcess\.bpmn$/.test(file)) {
        found.push({ name: file, path: join(AUTHORING, dir, file) });
      }
    }
  }
  return found.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Models outside the RIP ladder that ronl-business-api ALSO keeps as parser
 * fixtures, under rip-swimlane/__fixtures__/declared/: the processes that
 * declare their own phases (ronl:phases). They were copied byte for byte and
 * then checked by nothing, so drift would have gone unnoticed (RBA #312 item
 * 3). Fingerprinting them here puts them under the same contract as the
 * ladder. Listed by hand because they share no naming scheme; the key is the
 * fixture's file name downstream, and `source` tells the other side where to
 * find it.
 */
const DECLARED_PHASE_MODELS = [
  {
    name: "GedelegeerdBesluitProcess.bpmn",
    path: "packages/frontend/public/examples/flevoland/besluitvorming-gedelegeerd/GedelegeerdBesluitProcess.bpmn",
  },
  {
    name: "ManagementCapacityClaimProcess.bpmn",
    path: "examples/organizations/flevoland/HR-capacity/ManagementCapacityClaimProcess.bpmn",
  },
];

const ripModels = authoringModels();
const models = [...ripModels, ...DECLARED_PHASE_MODELS];
if (ripModels.length === 0) {
  console.error(`No RIP phase models found under ${AUTHORING}/rip-phase-NN/.`);
  process.exit(1);
}
// A moved or renamed declared-phase model must fail by name, not as an ENOENT
// from the hashing below.
const missing = DECLARED_PHASE_MODELS.filter((m) => !existsSync(m.path));
if (missing.length > 0) {
  console.error(
    `Declared-phase model(s) not found; update DECLARED_PHASE_MODELS:\n` +
      missing.map((m) => `  - ${m.path}`).join("\n"),
  );
  process.exit(1);
}

if (write) {
  const fingerprints = Object.fromEntries(
    models.map((m) => [
      m.name,
      { source: m.path.replace(/\\/g, "/"), sha256: sha256(m.path) },
    ]),
  );
  writeFileSync(FINGERPRINTS, `${JSON.stringify(fingerprints, null, 2)}\n`);
  console.log(`Wrote ${FINGERPRINTS} (${models.length} models).`);

  let copied = 0;
  for (const m of models) {
    const target = join(E2E_FIXTURES, m.name);
    if (!existsSync(target)) continue; // only R2.1 and R2.2 are E2E fixtures
    copyFileSync(m.path, target);
    copied += 1;
  }
  console.log(
    `Refreshed ${copied} e2e-fixtures cop${copied === 1 ? "y" : "ies"}.`,
  );
  console.log(
    "\nNow refresh ronl-business-api, which cannot see this repository from its ci:\n" +
      "  cd ../ronl-business-api && npm run check-swimlane-fixtures -- --sync",
  );
  process.exit(0);
}

const problems = [];

// ── the e2e-fixtures copies, compared against the real source ──────────────
for (const m of models) {
  const copy = join(E2E_FIXTURES, m.name);
  if (!existsSync(copy)) continue;
  if (readFileSync(copy).equals(readFileSync(m.path))) continue;
  problems.push(
    `- ${copy} differs from its source ${m.path}\n` +
      `    The source of truth is the authoring copy. If the change belongs, run:\n` +
      `      node scripts/check-rip-bpmn-copies.mjs --write`,
  );
}

// ── the authoring files, against the fingerprints both repos share ─────────
if (!existsSync(FINGERPRINTS)) {
  problems.push(
    `- ${FINGERPRINTS} is missing. Create it with:\n` +
      `      node scripts/check-rip-bpmn-copies.mjs --write`,
  );
} else {
  const recorded = JSON.parse(readFileSync(FINGERPRINTS, "utf8"));
  for (const m of models) {
    const entry = recorded[m.name];
    if (!entry) {
      problems.push(
        `- ${m.name} has no entry in ${FINGERPRINTS} (a new phase model?)`,
      );
      continue;
    }
    const actual = sha256(m.path);
    if (actual !== entry.sha256) {
      problems.push(
        `- ${m.path} has changed since the fingerprints were recorded.\n` +
          `    Downstream copies are now stale: e2e-fixtures here, and\n` +
          `    ronl-business-api's rip-swimlane/__fixtures__. Regenerate and refresh:\n` +
          `      node scripts/check-rip-bpmn-copies.mjs --write`,
      );
    }
  }
  for (const name of Object.keys(recorded)) {
    if (!models.some((m) => m.name === name)) {
      problems.push(
        `- ${FINGERPRINTS} still lists ${name}, which no longer exists.`,
      );
    }
  }
}

if (problems.length > 0) {
  console.error(
    `\nRIP BPMN copies are out of step with their source:\n\n${problems.join("\n\n")}\n`,
  );
  process.exit(1);
}

const e2eCount = models.filter((m) =>
  existsSync(join(E2E_FIXTURES, basename(m.name))),
).length;
console.log(
  `✓ ${ripModels.length} RIP phase models and ${DECLARED_PHASE_MODELS.length} declared-phase models fingerprinted, ${e2eCount} e2e-fixtures copies identical to source.`,
);
