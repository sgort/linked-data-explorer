// packages/frontend/vite/cspPlugin.ts
//
// Generates dist/staticwebapp.config.json at build time (#161): a
// Content-Security-Policy-Report-Only header (plus a Reporting-Endpoints
// pointer, and two small hardening headers) whose connect-src/report-uri
// admit the backend the build was configured for. Report-only, not
// enforcing, until the collector at POST /v1/csp-reports (backend) has run
// long enough to show nothing legitimate gets blocked.
//
// buildCspConfig() is the pure, unit-tested core. cspPlugin() wires it into
// Vite: it reads the resolved outDir from configResolved and writes the file
// in closeBundle, which only runs for `vite build` (apply: 'build').
//
// The backend origin is derived from VITE_API_BASE_URL for the build's mode
// (vite.config.ts passes it in via loadEnv), not from `import.meta.env`:
// this file runs in the Vite/Node build process, not in the bundle.

import { writeFileSync } from 'node:fs';
import path from 'node:path';

import type { Plugin } from 'vite';

export interface CspConfig {
  globalHeaders: Record<string, string>;
}

/**
 * Build the staticwebapp.config.json content for one backend origin.
 *
 * Fails loudly (throws) rather than returning a policy with a wrong or
 * missing origin, which would silently misreport what the app actually
 * contacts.
 */
export function buildCspConfig(apiBaseUrl: string): CspConfig {
  if (!apiBaseUrl) {
    throw new Error(
      'VITE_API_BASE_URL is required to build the Content-Security-Policy, and was empty.'
    );
  }

  let origin: string;
  try {
    origin = new URL(apiBaseUrl).origin;
  } catch {
    throw new Error(`VITE_API_BASE_URL is not a valid absolute URL: ${JSON.stringify(apiBaseUrl)}`);
  }

  const reportUri = `${origin}/v1/csp-reports`;

  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    // index.html still loads Inter from Google Fonts (a <link rel="stylesheet">
    // pointing at fonts.googleapis.com, which in turn points at
    // fonts.gstatic.com for the actual font files) — ruling on #161's "worth
    // deciding" item: keep the <link> (no visual change) rather than
    // self-host, so both origins are admitted here. Self-hosting the font
    // would remove the need for either.
    "style-src 'self' https://fonts.googleapis.com",
    // fonts.gstatic.com: the Google Fonts stylesheet above points here for
    // the actual Inter font files. data:: the bpmn-js icon font is inlined
    // into the built CSS as a data: URI (woff/truetype), not fetched.
    "font-src 'self' data: https://fonts.gstatic.com",
    // open-regels.triply.cc: logoResolver's fallback when an asset URL has
    // no version id yet. api.open-regels.triply.cc: the real, steady-state
    // logo source -- the backend's /v1/triplydb/assets normalises TriplyDB's
    // asset records to a versioned `versions[0].url` on that host, which
    // logoResolver then uses for <img src> as-is.
    "img-src 'self' data: https://open-regels.triply.cc https://api.open-regels.triply.cc",
    `connect-src 'self' ${origin}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    `report-uri ${reportUri}`,
    'report-to csp',
  ].join('; ');

  return {
    globalHeaders: {
      'Content-Security-Policy-Report-Only': csp,
      'Reporting-Endpoints': `csp="${reportUri}"`,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    },
  };
}

/**
 * Writes dist/staticwebapp.config.json from `apiBaseUrl` (the build mode's
 * resolved VITE_API_BASE_URL) once the bundle has been written.
 *
 * `apiBaseUrl` is read at build-config time (vite.config.ts) rather than
 * inside this plugin, so the same `loadEnv(mode, …)` call vite.config.ts
 * already needs for the rest of the config also drives this file — one
 * source of the resolved env, not two.
 */
export function cspPlugin(apiBaseUrl: string | undefined): Plugin {
  let outDir = 'dist';
  let root = process.cwd();

  return {
    name: 'linked-data-explorer:csp',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir;
      root = config.root;
    },
    closeBundle() {
      const config = buildCspConfig(apiBaseUrl ?? '');
      const target = path.isAbsolute(outDir) ? outDir : path.resolve(root, outDir);
      writeFileSync(
        path.join(target, 'staticwebapp.config.json'),
        `${JSON.stringify(config, null, 2)}\n`
      );
    },
  };
}
