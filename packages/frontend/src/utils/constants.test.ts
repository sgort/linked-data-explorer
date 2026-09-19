import { describe, expect, test } from 'vitest';

import { presetEndpoints } from './constants';

describe('presetEndpoints', () => {
  test('includes the local Jena preset in development', () => {
    expect(presetEndpoints(true).map((p) => p.name)).toContain('Local Jena');
  });

  test('leaves it out of acceptance and production builds, where the backend refuses it', () => {
    const presets = presetEndpoints(false);
    expect(presets.map((p) => p.name)).not.toContain('Local Jena');
    expect(presets.every((p) => p.url.startsWith('https://'))).toBe(true);
  });
});
