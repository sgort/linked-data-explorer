// scripts/promotion-targets.mjs
//
// Which of the three production deploys does this promotion need?
//
// Until #210 each production workflow carried its own `paths:` filter on a
// push to main, and the three raced. They are now called in order by
// promote-to-production.yml, which means the filters had to move out of the
// triggers and into one place that answers for all three.
//
// That decision is the only thing standing between a promotion and a deploy
// that does not happen, so it is a module with a test beside it rather than a
// `run:` block: it can be exercised against a real commit range, and against
// the cases below, instead of only in anger.
//
// KEEP THE PATTERNS IN STEP WITH THE WORKFLOWS. Each mirrors the `paths:`
// filter its workflow used to carry on `push`. The two SITE workflows still
// carry those paths on their `pull_request` trigger -- that preview is
// deliberate (#210) -- so those filters remain the reference copy.
//
// Usage:
//   git diff --name-only --no-renames <before> <after> | node scripts/promotion-targets.mjs
//   node scripts/promotion-targets.mjs --all
//
//   --all  Report every target as needed, without reading stdin. Used by the
//          workflow's fail-safe: if the changed files cannot be determined, a
//          promotion must deploy everything rather than nothing. An answer
//          nobody could compute is not "no change".

import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

// Anchored deliberately. `package.json` here means the ROOT manifest; a
// workspace's own is matched through its `packages/<name>/` prefix.
//
// Renames: the caller is expected to feed BOTH names of a renamed file, which
// is what GitHub's own path filters do. `git diff --no-renames` does that.
export const TARGETS = [
  [
    'backend',
    /^(packages\/backend\/|\.github\/workflows\/azure-backend-production\.yml$|package-lock\.json$|package\.json$|\.nvmrc$)/,
  ],
  [
    'frontend',
    /^(packages\/frontend\/|\.github\/workflows\/azure-frontend-production\.yml$|package-lock\.json$|package\.json$|\.nvmrc$)/,
  ],
  [
    'ropa_site',
    /^(packages\/ropa-site\/|\.github\/workflows\/azure-ropa-site-prod\.yml$)/,
  ],
];

// promote-to-production.yml is deliberately absent from every pattern above.
// Each deploy workflow listed ITSELF so that a change to it got exercised by
// running it. The promotion workflow needs no such entry: it runs on every
// promotion already, so listing it would only mean that editing a comment in
// it redeployed all three.

/**
 * @param {string[]} files changed paths
 * @returns {Record<string, boolean>} one entry per target
 */
export function promotionTargets(files) {
  const result = {};
  for (const [name, pattern] of TARGETS) {
    result[name] = files.some((f) => pattern.test(f));
  }
  return result;
}

/** Every target, for the fail-safe path. */
export function allTargets() {
  return Object.fromEntries(TARGETS.map(([name]) => [name, true]));
}

function emit(result) {
  const lines = Object.entries(result).map(([k, v]) => `${k}=${v}`);
  for (const line of lines) console.log(line);
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, lines.join('\n') + '\n');
  }
}

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

// Direct invocation only. Importing this module must not run it, and must not
// THROW either -- scripts/dso-dossier.mjs built this URL by hand and blew up on
// `node -e "import(...)"`, where process.argv[1] is undefined. pathToFileURL
// also escapes a path this repository could plausibly sit under; hand-built
// `file://` + path does not.
const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  const arg = process.argv[2];
  if (arg === '--all') {
    emit(allTargets());
  } else if (arg) {
    console.error(`promotion-targets: unknown argument '${arg}' (expected --all or nothing)`);
    process.exit(2);
  } else {
    const files = readStdin()
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    emit(promotionTargets(files));
  }
}
