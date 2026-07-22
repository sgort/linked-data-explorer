import { computeLastModified, computeNormsEtag, DatasetVersionInfo } from './etag';

describe('computeNormsEtag', () => {
  const dataset = (overrides: Partial<DatasetVersionInfo> = {}): DatasetVersionInfo => ({
    version: '2026-01-01',
    publishedAt: '2026-01-01T00:00:00.000Z',
    title: 'Participatiewet',
    ...overrides,
  });

  test('produces a strong, quoted, 8-hex-char ETag', () => {
    const etag = computeNormsEtag({
      datasetVersions: { BWBR0015703: [dataset()] },
      filterSignature: {},
    });
    expect(etag).toMatch(/^"[0-9a-f]{8}"$/);
  });

  test('is deterministic for the same inputs', () => {
    const inputs = {
      datasetVersions: { BWBR0015703: [dataset()] },
      filterSignature: { cprmv_version: '0.4.1' },
    };
    expect(computeNormsEtag(inputs)).toBe(computeNormsEtag(inputs));
  });

  test('changes when a dataset version changes', () => {
    const base = computeNormsEtag({
      datasetVersions: { BWBR0015703: [dataset()] },
      filterSignature: {},
    });
    const changed = computeNormsEtag({
      datasetVersions: { BWBR0015703: [dataset({ version: '2026-04-03' })] },
      filterSignature: {},
    });
    expect(changed).not.toBe(base);
  });

  test('does not change when only the title changes (informational, not cache identity)', () => {
    const base = computeNormsEtag({
      datasetVersions: { BWBR0015703: [dataset()] },
      filterSignature: {},
    });
    const sameIdentity = computeNormsEtag({
      datasetVersions: { BWBR0015703: [dataset({ title: 'A different title' })] },
      filterSignature: {},
    });
    expect(sameIdentity).toBe(base);
  });

  test('changes when a filter parameter changes', () => {
    const base = computeNormsEtag({
      datasetVersions: { BWBR0015703: [dataset()] },
      filterSignature: { cprmv_version: '0.3.2' },
    });
    const changed = computeNormsEtag({
      datasetVersions: { BWBR0015703: [dataset()] },
      filterSignature: { cprmv_version: '0.4.1' },
    });
    expect(changed).not.toBe(base);
  });

  test('an explicit undefined filter value hashes the same as an absent key', () => {
    const withUndefined = computeNormsEtag({
      datasetVersions: { BWBR0015703: [dataset()] },
      filterSignature: { rulesetid: undefined },
    });
    const withoutKey = computeNormsEtag({
      datasetVersions: { BWBR0015703: [dataset()] },
      filterSignature: {},
    });
    expect(withUndefined).toBe(withoutKey);
  });

  test('rulesetid key order does not affect the hash (sorted internally)', () => {
    const a = computeNormsEtag({
      datasetVersions: {
        BWBR0015703: [dataset()],
        BWBR0044894: [dataset({ version: '2025-01-01' })],
      },
      filterSignature: {},
    });
    const b = computeNormsEtag({
      datasetVersions: {
        BWBR0044894: [dataset({ version: '2025-01-01' })],
        BWBR0015703: [dataset()],
      },
      filterSignature: {},
    });
    expect(a).toBe(b);
  });

  test('a null version is represented distinctly from a real version', () => {
    const withVersion = computeNormsEtag({
      datasetVersions: { BWBR0015703: [dataset({ version: '2026-01-01' })] },
      filterSignature: {},
    });
    const withNull = computeNormsEtag({
      datasetVersions: { BWBR0015703: [dataset({ version: null })] },
      filterSignature: {},
    });
    expect(withNull).not.toBe(withVersion);
  });
});

describe('computeLastModified', () => {
  test('returns null when there are no datasets at all', () => {
    expect(computeLastModified({})).toBeNull();
  });

  test('returns the single timestamp as an RFC 7231 HTTP-date', () => {
    const result = computeLastModified({
      BWBR0015703: [{ version: '2026-01-01', publishedAt: '2026-01-01T12:00:00.000Z', title: 'X' }],
    });
    expect(result).toBe(new Date('2026-01-01T12:00:00.000Z').toUTCString());
  });

  test('picks the latest publishedAt across multiple datasets and rulesets', () => {
    const result = computeLastModified({
      BWBR0015703: [
        { version: '2025-01-01', publishedAt: '2025-01-01T00:00:00.000Z', title: 'A' },
        { version: '2026-01-01', publishedAt: '2026-06-01T00:00:00.000Z', title: 'B' },
      ],
      BWBR0044894: [{ version: null, publishedAt: '2024-01-01T00:00:00.000Z', title: null }],
    });
    expect(result).toBe(new Date('2026-06-01T00:00:00.000Z').toUTCString());
  });
});
