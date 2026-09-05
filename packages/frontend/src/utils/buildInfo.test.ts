import { afterEach, describe, expect, test, vi } from 'vitest';

import { getBuildInfo } from './buildInfo';

// getBuildInfo reads import.meta.env on every call rather than capturing it at
// module scope, which is what lets vi.stubEnv reach it. A module-scope capture
// would be evaluated once at import and the fallback below could not be tested
// at all without vi.resetModules gymnastics.
afterEach(() => {
  vi.unstubAllEnvs();
});

const SHA = '570fd98a1c4e2b7d3f8a9016c5d4e2b7a3f81c40';

describe('getBuildInfo', () => {
  test('labels a build that carries both a SHA and a run number', () => {
    vi.stubEnv('VITE_BUILD_SHA', SHA);
    vi.stubEnv('VITE_BUILD_RUN', '412');

    const info = getBuildInfo();

    expect(info.isTracked).toBe(true);
    expect(info.label).toBe('build 570fd98 · #412');
  });

  test('keeps the full SHA alongside the short one, for copying', () => {
    vi.stubEnv('VITE_BUILD_SHA', SHA);
    vi.stubEnv('VITE_BUILD_RUN', '412');

    const info = getBuildInfo();

    expect(info.sha).toBe(SHA);
    expect(info.shortSha).toBe('570fd98');
    expect(info.run).toBe('412');
  });

  test('falls back to "local build" when nothing was injected', () => {
    vi.stubEnv('VITE_BUILD_SHA', undefined);
    vi.stubEnv('VITE_BUILD_RUN', undefined);

    const info = getBuildInfo();

    expect(info.isTracked).toBe(false);
    expect(info.label).toBe('local build');
    expect(info.sha).toBe('');
  });

  // Half-configured counts as untracked. A run number with no commit behind it
  // implies a provenance the bundle does not have, so it must not render as
  // one — and a SHA with no run number cannot distinguish two builds of the
  // same commit, which is the whole point of the run number.
  test('treats a run number without a SHA as untracked', () => {
    vi.stubEnv('VITE_BUILD_SHA', undefined);
    vi.stubEnv('VITE_BUILD_RUN', '412');

    expect(getBuildInfo().label).toBe('local build');
  });

  test('treats a SHA without a run number as untracked', () => {
    vi.stubEnv('VITE_BUILD_SHA', SHA);
    vi.stubEnv('VITE_BUILD_RUN', undefined);

    expect(getBuildInfo().label).toBe('local build');
  });

  // Vite substitutes a missing variable with an empty string in some build
  // configurations rather than leaving it undefined, so blank must be treated
  // exactly like absent — otherwise the page renders "build  · #".
  test('treats blank and whitespace-only values as absent', () => {
    vi.stubEnv('VITE_BUILD_SHA', '   ');
    vi.stubEnv('VITE_BUILD_RUN', '');

    expect(getBuildInfo().isTracked).toBe(false);
    expect(getBuildInfo().label).toBe('local build');
  });

  test('trims surrounding whitespace off injected values', () => {
    vi.stubEnv('VITE_BUILD_SHA', ` ${SHA} `);
    vi.stubEnv('VITE_BUILD_RUN', ' 412 ');

    const info = getBuildInfo();

    expect(info.sha).toBe(SHA);
    expect(info.label).toBe('build 570fd98 · #412');
  });

  // A SHA shorter than 7 characters is not something CI produces, but slicing
  // must not invent characters or throw if one ever arrives.
  test('uses the whole SHA when it is shorter than seven characters', () => {
    vi.stubEnv('VITE_BUILD_SHA', 'abc12');
    vi.stubEnv('VITE_BUILD_RUN', '7');

    expect(getBuildInfo().label).toBe('build abc12 · #7');
  });
});
