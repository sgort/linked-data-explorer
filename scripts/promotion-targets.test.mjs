import { promotionTargets, allTargets, TARGETS } from './promotion-targets.mjs';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const checks = [];
const SCRIPT = new URL('./promotion-targets.mjs', import.meta.url).pathname;

/** promotionTargets(files) equals the expected map. */
function expect(label, files, expected) {
  const got = promotionTargets(files);
  const ok = Object.keys(expected).every((k) => got[k] === expected[k]);
  if (!ok) {
    console.error(`  ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(got)}`);
  }
  checks.push([label, ok]);
}

const NONE = { backend: false, frontend: false, ropa_site: false };

// --- Regression: importing must not throw when process.argv[1] is absent ---
//
// Same failure dso-dossier.mjs had. Observable only from a separate
// invocation, since this file always has a defined process.argv[1].
{
  const url = new URL('./promotion-targets.mjs', import.meta.url).href;
  let importSafe = true;
  try {
    execFileSync(process.execPath, ['-e', `import(${JSON.stringify(url)})`], { stdio: 'pipe' });
  } catch {
    importSafe = false;
  }
  checks.push(['importing the module does not throw when process.argv[1] is undefined', importSafe]);
}

// --- One package at a time ----------------------------------------------

expect('a backend source change needs the backend only', ['packages/backend/src/index.ts'], {
  ...NONE,
  backend: true,
});

expect('a frontend source change needs the frontend only', ['packages/frontend/src/App.tsx'], {
  ...NONE,
  frontend: true,
});

expect('a ropa-site change needs the ropa site only', ['packages/ropa-site/index.html'], {
  ...NONE,
  ropa_site: true,
});

// The release commit. packages/frontend/src/changelog.json is where every
// release lands, so a release that changes nothing else still redeploys the
// frontend -- and only the frontend.
expect(
  'a release-only commit needs the frontend, because the changelog lives there',
  ['packages/frontend/src/changelog.json'],
  { ...NONE, frontend: true },
);

// --- The shared roots ----------------------------------------------------

expect(
  'the root manifest needs backend and frontend, not the ropa site',
  ['package.json'],
  { backend: true, frontend: true, ropa_site: false },
);

expect('the lockfile needs backend and frontend', ['package-lock.json'], {
  backend: true,
  frontend: true,
  ropa_site: false,
});

expect('.nvmrc needs backend and frontend', ['.nvmrc'], {
  backend: true,
  frontend: true,
  ropa_site: false,
});

// --- Anchoring -----------------------------------------------------------
//
// The three that would quietly over-deploy if the patterns lost their `^`.

expect(
  "a workspace's own package.json is not the root manifest",
  ['packages/backend/package.json'],
  { ...NONE, backend: true },
);

expect(
  'a path that merely CONTAINS package.json is not the root manifest',
  ['docs/examples/package.json.md'],
  NONE,
);

expect(
  'packages/frontend-something is not packages/frontend',
  ['packages/frontend-experiments/x.ts'],
  NONE,
);

// --- Workflows -----------------------------------------------------------

expect(
  'each deploy workflow needs its own deploy',
  ['.github/workflows/azure-backend-production.yml'],
  { ...NONE, backend: true },
);

expect(
  'the ACC workflows need nothing -- this decides PRODUCTION',
  ['.github/workflows/azure-backend-acc.yml'],
  NONE,
);

expect(
  'the promotion workflow itself needs nothing; it already runs',
  ['.github/workflows/promote-to-production.yml'],
  NONE,
);

// --- Nothing, and everything --------------------------------------------

expect('a docs-only promotion deploys nothing', ['README.md', 'docs/ci-posture-across-repos.md'], NONE);

expect('no changed files at all deploys nothing', [], NONE);

expect('one commit can need all three', ['.nvmrc', 'packages/ropa-site/index.html'], {
  backend: true,
  frontend: true,
  ropa_site: true,
});

checks.push([
  'allTargets() reports every target as needed',
  Object.keys(allTargets()).length === TARGETS.length &&
    Object.values(allTargets()).every((v) => v === true),
]);

// --- Drift guard ---------------------------------------------------------
//
// The two SITE workflows still carry these paths on their `pull_request`
// trigger (the production preview, decided in #210). Those filters and the
// patterns above must agree, or a promotion will preview a site it then
// declines to deploy. This check is the only thing that notices.
{
  const SITES = [
    ['frontend', '.github/workflows/azure-frontend-production.yml'],
    ['ropa_site', '.github/workflows/azure-ropa-site-prod.yml'],
  ];
  for (const [target, workflow] of SITES) {
    const src = readFileSync(new URL(`../${workflow}`, import.meta.url), 'utf8');

    // The `paths:` list inside the `pull_request:` trigger, up to `jobs:`.
    const trigger = src.slice(src.indexOf('pull_request:'), src.indexOf('\njobs:'));
    const list = trigger.slice(trigger.indexOf('paths:'));
    const globs = [...list.matchAll(/^\s+- '([^']+)'$/gm)].map((m) => m[1]);

    // `packages/frontend/**` is satisfied by `packages/frontend/probe`;
    // `package.json` is satisfied by itself.
    const samples = globs.map((g) => (g.endsWith('/**') ? `${g.slice(0, -2)}probe` : g));

    const missed = samples.filter((s) => promotionTargets([s])[target] !== true);
    if (missed.length) {
      console.error(`  ${workflow}: pull_request paths the ${target} pattern misses:`, missed);
    }
    checks.push([
      `${workflow} pull_request paths agree with the ${target} pattern`,
      globs.length > 0 && missed.length === 0,
    ]);
  }
}

// --- The command line ----------------------------------------------------

/** Run the script, returning { status, stdout }. */
function run(args, stdin = '', env = {}) {
  try {
    const stdout = execFileSync(process.execPath, [SCRIPT, ...args], {
      input: stdin,
      encoding: 'utf8',
      // Capture stderr rather than inheriting it: the exit-2 case prints a
      // usage error, and a passing run of this file must print nothing that
      // looks like a failure.
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, GITHUB_OUTPUT: '', ...env },
    });
    return { status: 0, stdout };
  } catch (e) {
    return { status: e.status, stdout: e.stdout ?? '' };
  }
}

{
  const { status, stdout } = run([], 'packages/backend/src/index.ts\n\npackages/ropa-site/a.html\n');
  checks.push([
    'reads changed paths from stdin, ignoring blank lines',
    status === 0 &&
      stdout.includes('backend=true') &&
      stdout.includes('frontend=false') &&
      stdout.includes('ropa_site=true'),
  ]);
}

{
  const { status, stdout } = run(['--all']);
  checks.push([
    '--all reports every target without reading stdin',
    status === 0 && TARGETS.every(([n]) => stdout.includes(`${n}=true`)),
  ]);
}

{
  const { status } = run(['--every']);
  checks.push(['an unknown argument exits 2 rather than deploying nothing', status === 2]);
}

{
  const dir = mkdtempSync(join(tmpdir(), 'promotion-targets-'));
  const out = join(dir, 'github_output');
  writeFileSync(out, '');
  run([], 'packages/frontend/src/App.tsx\n', { GITHUB_OUTPUT: out });
  const written = readFileSync(out, 'utf8');
  checks.push([
    'appends every target to GITHUB_OUTPUT',
    written.includes('frontend=true') &&
      written.includes('backend=false') &&
      written.includes('ropa_site=false') &&
      written.endsWith('\n'),
  ]);
}

// ---------------------------------------------------------------------------

let failed = 0;
for (const [name, ok] of checks) {
  if (!ok) {
    console.error('FAIL:', name);
    failed++;
  }
}
if (failed) process.exit(1);
console.log(`PASS: ${checks.length} checks`);
