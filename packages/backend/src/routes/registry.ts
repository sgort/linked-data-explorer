// packages/backend/src/routes/registry.ts
// Single source of truth for the v1 API route topology. Consumed by
// routes/index.ts (for mounting) and utils/rootView.ts (for the root listing).
// Adding a new route is one entry here — both registration and the root page
// pick it up automatically.

import type { Router } from 'express';
import healthRoutes from './health.routes';
import dmnRoutes from './dmn.routes';
import chainRoutes from './chain.routes';
import templateRoutes from './template.routes';
import triplydbRoutes from './triplydb.routes';
import cacheRoutes from './cache.routes';
import vendorRoutes from './vendor.routes';
import processRoutes from './process.routes';
import edocsRoutes from './edocs.routes';
import assetsRoutes from './assets.routes';
import ropaRoutes from './ropa.routes';
import ropaPublicRoutes from './ropa.public.routes';
import assetsPublicRoutes from './assets.public.routes';
import dsoRoutes from './dso.routes';
import normsRoutes from './norms.routes';

/** Logical grouping for the root page. New categories can be added; see
 *  CATEGORY_ORDER in utils/rootView.ts for render order. */
export type RouteCategory =
  | 'Health & monitoring'
  | 'Discovery'
  | 'Execution'
  | 'Assets'
  | 'Integrations';

export interface RouteDefinition {
  /** Mount path under which the router is attached. Drives both registration
   *  and the root listing. */
  mount: string;
  /** Express Router. Imported here so the registry is the only place these
   *  module names appear. */
  router: Router;
  /** Short, human-readable description shown on the root page. Keep under
   *  ~80 chars so the HTML row layout stays clean. */
  summary: string;
  /** Logical grouping for the root page. */
  category: RouteCategory;
  /** True when this route is consumed by external clients with fully-open
   *  CORS (rendered with a badge on the root page). */
  publicCors?: boolean;
}

// IMPORTANT — order matters for Express route matching: more specific paths
// must precede their parents. `/v1/chains/templates` must come before
// `/v1/chains`; `/v1/assets/ropa` is mounted after `/v1/assets` only because
// the assets router does not define a `/ropa` sub-path itself. Keeping the
// order in this list aligned with the previous hand-mounted order in
// routes/index.ts preserves the working route precedence exactly.
export const routeRegistry: ReadonlyArray<RouteDefinition> = [
  // Health & monitoring
  {
    mount: '/v1/health',
    router: healthRoutes,
    summary: 'Service health and external dependency latency',
    category: 'Health & monitoring',
  },
  {
    mount: '/v1/cache',
    router: cacheRoutes,
    summary: 'DMN cache statistics and invalidation',
    category: 'Health & monitoring',
  },

  // Discovery
  {
    mount: '/v1/dmns',
    router: dmnRoutes,
    summary: 'DMN discovery, metadata and chain links',
    category: 'Discovery',
  },
  {
    mount: '/v1/triplydb',
    router: triplydbRoutes,
    summary: 'SPARQL query proxy for any TriplyDB endpoint',
    category: 'Discovery',
  },
  {
    mount: '/v1/norms',
    router: normsRoutes,
    summary: 'cprmv:Rule paths and norms in publish format',
    category: 'Discovery',
  },

  // Execution (templates registered before /v1/chains to win route precedence)
  {
    mount: '/v1/chains/templates',
    router: templateRoutes,
    summary: 'Pre-built chain templates by category and tag',
    category: 'Execution',
  },
  {
    mount: '/v1/chains',
    router: chainRoutes,
    summary: 'DMN chain composition and execution',
    category: 'Execution',
  },
  {
    mount: '/v1/process',
    router: processRoutes,
    summary: 'Operaton BPMN process integration',
    category: 'Execution',
  },

  // Assets
  {
    mount: '/v1/assets',
    router: assetsRoutes,
    summary: 'BPMN, form and document template storage',
    category: 'Assets',
  },
  {
    mount: '/v1/assets/ropa',
    router: ropaRoutes,
    summary: 'RoPA (GDPR Article 30) records management',
    category: 'Assets',
  },
  {
    mount: '/v1/ropa/public',
    router: ropaPublicRoutes,
    summary: 'Public RoPA records (read-only, open CORS)',
    category: 'Assets',
    publicCors: true,
  },
  {
    mount: '/v1/bundles/public',
    router: assetsPublicRoutes,
    summary: 'Deployed BPMN bundles with nested artefacts',
    category: 'Assets',
    publicCors: true,
  },

  // Integrations
  {
    mount: '/v1/edocs',
    router: edocsRoutes,
    summary: 'OpenText eDOCS document management bridge',
    category: 'Integrations',
  },
  {
    mount: '/v1/dso',
    router: dsoRoutes,
    summary: 'Digitaal Stelsel Omgevingswet activity search',
    category: 'Integrations',
  },
  {
    mount: '/v1/vendors',
    router: vendorRoutes,
    summary: 'Vendor implementation discovery',
    category: 'Integrations',
  },
];