// scripts/dso-dossier.mjs
// Renders an activity dossier to Markdown.
//
// Usage: npm run dso:dossier -- --urn=<urn> [--env=prod] [--date=dd-MM-yyyy] [--authority=<code>] [--out=<path>]
//
// Requires an already-running backend. This script never starts, stops or
// restarts a server.

import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

import { renderDossier } from './dossier-render.mjs';

const BASE = process.env.LDE_API_BASE_URL ?? 'http://localhost:3001';

// The rendering logic itself lives in dossier-render.mjs, shared with the
// frontend's "Dossier .md" download button — see that file's header. Re-export
// it so `node scripts/dso-dossier.test.mjs` (which imports `renderDossier`
// from *this* file) keeps working unchanged.
export { renderDossier };

async function main() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((a) => {
      const [k, ...rest] = a.replace(/^--/, '').split('=');
      return [k, rest.join('=')];
    })
  );

  if (!args.urn) {
    console.error(
      'Usage: npm run dso:dossier -- --urn=<urn> [--env=prod] [--date=dd-MM-yyyy] [--authority=<code>] [--out=<path>]'
    );
    process.exit(2);
  }

  const params = new URLSearchParams();
  if (args.date) params.set('datum', args.date);
  if (args.authority) params.set('authority', args.authority);
  const url = `${BASE}/v1/dso/activiteiten/${encodeURIComponent(args.urn)}/dossier?${params}`;

  let res;
  try {
    res = await fetch(url, { headers: { 'X-Dso-Env': args.env === 'prod' ? 'prod' : 'pre' } });
  } catch {
    console.error(
      `Cannot reach the LDE backend at ${BASE}. Start it yourself, or set LDE_API_BASE_URL. This script does not manage servers.`
    );
    process.exit(1);
  }

  if (!res.ok) {
    console.error(`Backend answered ${res.status}: ${await res.text()}`);
    process.exit(1);
  }

  const { data } = await res.json();
  const md = renderDossier(data);

  if (args.out) {
    fs.writeFileSync(args.out, md, 'utf8');
    console.log(`Written to ${args.out}`);
  } else {
    console.log(md);
  }
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  await main();
}
