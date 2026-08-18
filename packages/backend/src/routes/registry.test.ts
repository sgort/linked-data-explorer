// The registry is the single source of truth for the v1 topology: routes/index.ts
// mounts from it and utils/rootViews.ts renders it. These are structural
// invariants — the things that silently break when someone adds an entry.
//
// The real route modules are imported (only db/pool is stubbed, since importing
// it for real would open a Postgres connection the test run never closes), so
// this also proves every router in the registry actually loads.

jest.mock('../db/pool', () => ({ __esModule: true, default: null }));
jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

// @rdfjs/dataset and rdf-validate-shacl are ESM-only and reach the SHACL
// service through Node's require(esm), which Jest's CommonJS runtime cannot do.
// Stubbing them keeps shacl.routes -> shacl-validation.service importable here;
// neither stub is exercised, since this file only inspects the registry's shape.
jest.mock('@rdfjs/dataset', () => ({ __esModule: true, default: { dataset: () => ({}) } }));
jest.mock('rdf-validate-shacl', () => ({ __esModule: true, default: class {} }));

import { routeRegistry, type RouteCategory } from './registry';

const CATEGORIES: RouteCategory[] = [
  'Health & monitoring',
  'Discovery',
  'Validation',
  'Execution',
  'Assets',
  'Integrations',
];

describe('routeRegistry entries', () => {
  test('is non-empty', () => {
    expect(routeRegistry.length).toBeGreaterThan(0);
  });

  test.each(routeRegistry.map((r) => [r.mount, r] as const))(
    '%s is well-formed',
    (_mount, route) => {
      expect(route.mount).toMatch(/^\/v1\//);
      expect(route.mount).not.toMatch(/\/$/);
      expect(CATEGORIES).toContain(route.category);
      expect(route.summary.trim()).not.toHaveLength(0);
      // Keeps the root page's two-column HTML rows from wrapping — see the
      // summary field docs in registry.ts.
      expect(route.summary.length).toBeLessThanOrEqual(80);
    }
  );

  test.each(routeRegistry.map((r) => [r.mount, r] as const))(
    '%s exposes a mountable Express router',
    (_mount, route) => {
      expect(typeof route.router).toBe('function');
      expect(typeof route.router.use).toBe('function');
      expect(Array.isArray((route.router as unknown as { stack: unknown[] }).stack)).toBe(true);
    }
  );

  test('every mount path is unique', () => {
    const mounts = routeRegistry.map((r) => r.mount);

    expect(new Set(mounts).size).toBe(mounts.length);
  });

  test('every router instance is used exactly once', () => {
    const routers = routeRegistry.map((r) => r.router);

    expect(new Set(routers).size).toBe(routers.length);
  });
});

describe('route precedence', () => {
  // Express matches in registration order, so a parent mount registered before
  // its child would swallow the child's requests. The registry order therefore
  // doubles as a precedence spec.
  // `/v1/assets/ropa` is deliberately registered *after* `/v1/assets`; the
  // comment in registry.ts justifies it by saying the assets router defines no
  // `/ropa` sub-path. This asserts that justification rather than trusting it,
  // so the ordering breaks loudly if someone adds a matching route to a parent.
  test('a parent mount registered first defines no route that would swallow its nested mount', () => {
    const violations: string[] = [];

    routeRegistry.forEach((parent, i) => {
      routeRegistry.slice(i + 1).forEach((child) => {
        if (!child.mount.startsWith(`${parent.mount}/`)) return;

        const subPath = child.mount.slice(parent.mount.length);
        const stack = (parent.router as unknown as { stack?: Array<{ regexp?: RegExp }> }).stack;

        for (const layer of stack ?? []) {
          if (layer.regexp?.test(subPath)) {
            violations.push(
              `${parent.mount} matches ${subPath}, so ${child.mount} must be registered before it`
            );
          }
        }
      });
    });

    expect(violations).toEqual([]);
  });

  test('/v1/chains/templates precedes /v1/chains', () => {
    const mounts = routeRegistry.map((r) => r.mount);

    expect(mounts.indexOf('/v1/chains/templates')).toBeLessThan(mounts.indexOf('/v1/chains'));
  });
});

describe('public CORS flag', () => {
  test('is set on exactly the read-only public endpoints', () => {
    const publicMounts = routeRegistry.filter((r) => r.publicCors).map((r) => r.mount);

    expect(publicMounts.sort()).toEqual(['/v1/bundles/public', '/v1/ropa/public']);
  });

  test('is left undefined rather than false on internal routes', () => {
    const internal = routeRegistry.find((r) => r.mount === '/v1/health');

    expect(internal?.publicCors).toBeUndefined();
  });
});

describe('category coverage', () => {
  test('every declared category has at least one route', () => {
    const used = new Set(routeRegistry.map((r) => r.category));

    expect([...CATEGORIES].filter((c) => !used.has(c))).toEqual([]);
  });
});
