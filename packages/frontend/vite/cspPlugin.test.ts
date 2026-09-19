// packages/frontend/vite/cspPlugin.test.ts
//
// buildCspConfig() is the pure, unit-testable core of the CSP build-time
// plugin (#161): given the backend origin for a build mode, it returns the
// exact staticwebapp.config.json content that closeBundle() writes to
// dist/. The plugin's write step itself is exercised separately, below.

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, test } from 'vitest';

import { buildCspConfig, cspPlugin } from './cspPlugin';

const ACC_API_BASE_URL = 'https://acc.backend.linkeddata.open-regels.nl';
const PROD_API_BASE_URL = 'https://backend.linkeddata.open-regels.nl';

describe('buildCspConfig', () => {
  test('builds the acceptance policy from the acceptance API base URL', () => {
    const config = buildCspConfig(ACC_API_BASE_URL);

    expect(config).toEqual({
      globalHeaders: {
        'Content-Security-Policy-Report-Only':
          "default-src 'self'; script-src 'self'; " +
          "style-src 'self' https://fonts.googleapis.com; " +
          "font-src 'self' data: https://fonts.gstatic.com; " +
          "img-src 'self' data: https://open-regels.triply.cc https://api.open-regels.triply.cc; " +
          "connect-src 'self' https://acc.backend.linkeddata.open-regels.nl; " +
          "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'; " +
          'report-uri https://acc.backend.linkeddata.open-regels.nl/v1/csp-reports; report-to csp',
        'Reporting-Endpoints': 'csp="https://acc.backend.linkeddata.open-regels.nl/v1/csp-reports"',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
      },
    });
  });

  test('builds the production policy from the production API base URL', () => {
    const config = buildCspConfig(PROD_API_BASE_URL);

    expect(config).toEqual({
      globalHeaders: {
        'Content-Security-Policy-Report-Only':
          "default-src 'self'; script-src 'self'; " +
          "style-src 'self' https://fonts.googleapis.com; " +
          "font-src 'self' data: https://fonts.gstatic.com; " +
          "img-src 'self' data: https://open-regels.triply.cc https://api.open-regels.triply.cc; " +
          "connect-src 'self' https://backend.linkeddata.open-regels.nl; " +
          "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'; " +
          'report-uri https://backend.linkeddata.open-regels.nl/v1/csp-reports; report-to csp',
        'Reporting-Endpoints': 'csp="https://backend.linkeddata.open-regels.nl/v1/csp-reports"',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
      },
    });
  });

  test('derives the origin only — a path or query string on the base URL is dropped', () => {
    const config = buildCspConfig('https://backend.example.com/v1/?token=abc');

    expect(config.globalHeaders['Reporting-Endpoints']).toBe(
      'csp="https://backend.example.com/v1/csp-reports"'
    );
    expect(config.globalHeaders['Content-Security-Policy-Report-Only']).toContain(
      "connect-src 'self' https://backend.example.com;"
    );
  });

  test('throws on a missing API base URL', () => {
    expect(() => buildCspConfig('')).toThrow(/VITE_API_BASE_URL/);
  });

  test('throws on an API base URL that is not a valid absolute URL', () => {
    expect(() => buildCspConfig('not-a-url')).toThrow(/VITE_API_BASE_URL/);
  });

  test('throws on a relative-looking API base URL', () => {
    expect(() => buildCspConfig('/api')).toThrow(/VITE_API_BASE_URL/);
  });
});

// The plugin's `configResolved`/`closeBundle` hooks are plain functions (not
// Rollup's `{ handler, order }` object form), but the `Plugin` type allows
// either, so calling them directly needs a narrow, test-only shape rather
// than fighting the union on every call.
interface TestableHooks {
  apply?: string;
  configResolved: (config: { root: string; build: { outDir: string } }) => void;
  closeBundle: () => void;
}

function asTestableHooks(plugin: ReturnType<typeof cspPlugin>): TestableHooks {
  return plugin as unknown as TestableHooks;
}

describe('cspPlugin', () => {
  test('is a build-only plugin', () => {
    const plugin = cspPlugin(ACC_API_BASE_URL);
    expect(plugin.apply).toBe('build');
  });

  test('writes staticwebapp.config.json to the resolved outDir on closeBundle', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'lde-csp-plugin-'));
    try {
      const outDir = path.join(root, 'dist');
      const plugin = asTestableHooks(cspPlugin(ACC_API_BASE_URL));

      plugin.configResolved({ root, build: { outDir } });
      // The plugin writes beside the bundle, which by the time closeBundle
      // runs, Vite has already created.
      mkdirSync(outDir, { recursive: true });
      plugin.closeBundle();

      const written = path.join(outDir, 'staticwebapp.config.json');
      expect(existsSync(written)).toBe(true);
      const parsed = JSON.parse(readFileSync(written, 'utf8'));
      expect(parsed).toEqual(buildCspConfig(ACC_API_BASE_URL));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('closeBundle throws loudly when no API base URL was resolved', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'lde-csp-plugin-'));
    try {
      const outDir = path.join(root, 'dist');
      mkdirSync(outDir, { recursive: true });
      const plugin = asTestableHooks(cspPlugin(undefined));

      plugin.configResolved({ root, build: { outDir } });

      expect(() => plugin.closeBundle()).toThrow(/VITE_API_BASE_URL/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
