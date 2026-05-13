// packages/backend/src/utils/rootView.ts
// Content-negotiated root handler. Browsers (Accept: text/html) get a rendered
// HTML landing page; programmatic clients (curl, fetch with no Accept header,
// Accept: */*, Accept: application/json) get JSON. Both views are derived from
// the shared route registry so the topology is described in exactly one place.

import { Request, Response } from 'express';
import { routeRegistry, type RouteCategory } from '../routes/registry';
import { config } from './config';
import packageJson from '../../package.json';

// Stable group order on the root page. Categories not listed here render after
// the listed ones in registry order.
const CATEGORY_ORDER: ReadonlyArray<RouteCategory> = [
    'Health & monitoring',
    'Discovery',
    'Execution',
    'Assets',
    'Integrations',
];

interface RootEndpoint {
    mount: string;
    summary: string;
    publicCors: boolean;
}

interface RootPayload {
    name: string;
    version: string;
    environment: string;
    status: 'running';
    documentation: string;
    health: string;
    endpoints: Record<string, RootEndpoint[]>;
    legacy: Record<string, string>;
}

/**
 * Build the payload object shared by HTML and JSON renderings. Centralising the
 * data shape ensures both views always describe the same set of endpoints.
 */
function buildPayload(): RootPayload {
    const endpoints: RootPayload['endpoints'] = {};

    // Seed groups in the preferred order; unknown categories appended later.
    for (const cat of CATEGORY_ORDER) {
        endpoints[cat] = [];
    }
    for (const route of routeRegistry) {
        const list = endpoints[route.category] ?? (endpoints[route.category] = []);
        list.push({
            mount: route.mount,
            summary: route.summary,
            publicCors: route.publicCors === true,
        });
    }
    // Drop any seeded-but-empty groups (e.g. a category with no routes yet).
    for (const cat of Object.keys(endpoints)) {
        if (endpoints[cat].length === 0) delete endpoints[cat];
    }

    return {
        name: 'Linked Data Explorer Backend',
        version: packageJson.version,
        environment: config.displayEnv,
        status: 'running',
        documentation: '/v1/openapi.json',
        health: '/v1/health',
        endpoints,
        // Hand-listed legacy aliases. The /api/* routes are deprecated and
        // intentionally not in the registry — keeping them visible here so clients
        // polling the root can still discover the migration path.
        legacy: {
            health: '/api/health (deprecated)',
            dmns: '/api/dmns (deprecated)',
            cache: '/api/cache (deprecated)',
            'chains/templates': '/api/chains/templates (deprecated)',
            chains: '/api/chains (deprecated)',
            triplydb: '/api/triplydb (deprecated)',
            vendors: '/api/vendors (deprecated)',
        },
    };
}

// Minimal HTML escaper. Registry strings are author-controlled, but the
// principle of "never interpolate untrusted data into HTML without escaping"
// is cheap to uphold and protects against future drift (e.g. if a route
// summary ever pulls from a config source).
function escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function renderHtml(payload: RootPayload): string {
    const groups = Object.entries(payload.endpoints)
        .map(([category, routes]) => {
            const items = routes
                .map((r) => {
                    const badge = r.publicCors
                        ? `<span class="badge">public · open CORS</span>`
                        : '';
                    return (
                        `        <li>` +
                        `<div class="path"><code>${escapeHtml(r.mount)}</code>${badge}</div>` +
                        `<span class="summary">${escapeHtml(r.summary)}</span>` +
                        `</li>`
                    );
                })
                .join('\n');
            return (
                `    <section>\n` +
                `      <h2>${escapeHtml(category)}</h2>\n` +
                `      <ul>\n${items}\n      </ul>\n` +
                `    </section>`
            );
        })
        .join('\n');

    const legacyRows = Object.entries(payload.legacy)
        .map(([key, value]) => {
            const path = value.replace(' (deprecated)', '');
            return (
                `        <li>` +
                `<div class="path"><code>${escapeHtml(path)}</code></div>` +
                `<span class="summary">replaced by <code>/v1/${escapeHtml(key)}</code></span>` +
                `</li>`
            );
        })
        .join('\n');

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(payload.name)} · v${escapeHtml(payload.version)}</title>
  <style>
    :root {
      --fg: #1a1a1a;
      --fg-muted: #555;
      --bg: #fafafa;
      --accent: #4a3aa8;
      --border: #e5e5e5;
      --code-bg: #f0eef9;
      --badge-bg: #e8f5e9;
      --badge-fg: #2e7d32;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      color: var(--fg);
      background: var(--bg);
      margin: 0;
      padding: 2rem 1.5rem;
      line-height: 1.5;
    }
    main { max-width: 880px; margin: 0 auto; }
    header { border-bottom: 1px solid var(--border); padding-bottom: 1.25rem; margin-bottom: 1.5rem; }
    h1 { margin: 0 0 .25rem; font-size: 1.6rem; }
    .meta { color: var(--fg-muted); font-size: .9rem; }
    .meta a { color: var(--accent); text-decoration: none; }
    .meta a:hover { text-decoration: underline; }
    h2 { font-size: 1.05rem; margin: 1.75rem 0 .5rem; color: var(--fg); }
    ul { list-style: none; padding: 0; margin: 0; }
    li {
      padding: .55rem 0;
      border-bottom: 1px solid var(--border);
      display: grid;
      grid-template-columns: minmax(220px, auto) 1fr;
      gap: 1rem;
      align-items: baseline;
    }
    li:last-child { border-bottom: none; }
    code {
      background: var(--code-bg);
      color: var(--accent);
      padding: .15rem .45rem;
      border-radius: 4px;
      font-size: .9rem;
      font-family: 'SF Mono', 'Cascadia Code', Menlo, Consolas, monospace;
    }
    .summary { color: var(--fg-muted); font-size: .92rem; }
    .summary code { background: transparent; padding: 0; }
    .path {
      display: flex;
      flex-direction: column;
      gap: .25rem;
      align-items: flex-start;
    }
    .badge {
      display: inline-block;
      background: var(--badge-bg);
      color: var(--badge-fg);
      font-size: .7rem;
      padding: .1rem .4rem;
      border-radius: 3px;
    }
    .legacy { margin-top: 2rem; padding-top: 1.25rem; border-top: 1px solid var(--border); }
    .legacy h2 { color: var(--fg-muted); }
    .legacy code { background: #f5f5f5; color: var(--fg-muted); }
    footer {
      margin-top: 2.5rem;
      padding-top: 1rem;
      border-top: 1px solid var(--border);
      color: var(--fg-muted);
      font-size: .85rem;
    }
    footer a { color: var(--accent); text-decoration: none; }
    footer a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>${escapeHtml(payload.name)}</h1>
      <p class="meta">
        Version <strong>${escapeHtml(payload.version)}</strong> ·
        Environment <strong>${escapeHtml(payload.environment)}</strong> ·
        <a href="${escapeHtml(payload.health)}">Health check</a> ·
        <a href="${escapeHtml(payload.documentation)}">OpenAPI</a>
        <span>(planned, v0.5.0)</span>
      </p>
    </header>
${groups}
    <section class="legacy">
      <h2>Legacy /api/* (deprecated)</h2>
      <ul>
${legacyRows}
      </ul>
    </section>
    <footer>
      Linked Data Explorer · part of the <a href="https://open-regels.nl">RONL</a> ecosystem · EUPL-1.2
    </footer>
  </main>
</body>
</html>`;
}

/**
 * Content-negotiated root handler.
 *
 * Routing logic via req.accepts(['json', 'html']):
 *  - Browsers send `Accept: text/html,...,application/json;q=0.9,...,* / *`
 *    with q-values → 'html' wins on quality, returns the rendered page.
 *  - curl (default `Accept: * / *`) → both types match at equal q; the first in
 *    the array argument wins the tie. We pass 'json' first, so curl gets JSON.
 *  - `Accept: application/json` → only 'json' matches, returns JSON.
 *
 * The JSON path is preserved as the default for backwards compatibility with
 * any existing programmatic poller of the root endpoint.
 */
export function rootHandler(req: Request, res: Response): void {
    const payload = buildPayload();
    const accepted = req.accepts(['json', 'html']);

    if (accepted === 'html') {
        res.type('html').send(renderHtml(payload));
        return;
    }

    res.json(payload);
}