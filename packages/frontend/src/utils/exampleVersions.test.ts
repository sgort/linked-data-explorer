// @vitest-environment jsdom
import { beforeEach, describe, expect, test } from 'vitest';

import { DEFAULT_TEMPLATES } from '../components/DocumentComposer/defaultTemplates';
import { EXAMPLE_VERSIONS, getStoredVersion, setStoredVersion } from './exampleVersions';

beforeEach(() => {
  localStorage.clear();
});

describe('getStoredVersion', () => {
  test('returns 0 when nothing has ever been seeded', () => {
    expect(getStoredVersion('example_awb_process')).toBe(0);
  });

  test('returns the stored version for a known example', () => {
    setStoredVersion('example_awb_process', 4);
    expect(getStoredVersion('example_awb_process')).toBe(4);
  });

  test('returns 0 when localStorage holds invalid JSON', () => {
    localStorage.setItem('linkedDataExplorer_exampleVersions', 'not json');
    expect(getStoredVersion('example_awb_process')).toBe(0);
  });

  test('returns 0 for an example missing from an otherwise populated map', () => {
    // The case a new example hits on an existing installation: the version map
    // exists but has no entry yet. Without the `?? 0` this yields undefined,
    // and BpmnModeler's `getStoredVersion(id) < EXAMPLE_VERSIONS[id]` is false
    // for undefined — so the new example would never be seeded.
    setStoredVersion('example_awb_process', 4);

    expect(getStoredVersion('example_dvtp_toestemming')).toBe(0);
  });
});

describe('setStoredVersion', () => {
  test('persists across separate calls without clobbering other entries', () => {
    setStoredVersion('example_awb_process', 4);
    setStoredVersion('example_tree_felling', 6);

    expect(getStoredVersion('example_awb_process')).toBe(4);
    expect(getStoredVersion('example_tree_felling')).toBe(6);
  });

  test('overwrites an existing entry for the same example', () => {
    setStoredVersion('example_awb_process', 1);
    setStoredVersion('example_awb_process', 2);
    expect(getStoredVersion('example_awb_process')).toBe(2);
  });

  test('does not throw when localStorage already holds invalid JSON', () => {
    localStorage.setItem('linkedDataExplorer_exampleVersions', 'not json');
    expect(() => setStoredVersion('example_awb_process', 1)).not.toThrow();
  });
});

describe('EXAMPLE_VERSIONS — besluitvorming gedelegeerd', () => {
  test("versions the process at 3: Neem besluit renders the authority's own besluit (#246)", () => {
    expect(EXAMPLE_VERSIONS.example_besluit_gb).toBe(3);
  });

  test('versions all twelve forms', () => {
    const ids = [
      ...[
        'sjabloon_kiezen',
        'sjabloon_invullen',
        'advies_toetsing',
        'voorwaarden',
        'memorandum',
        'akkoord',
        'indienen',
        'ondertekenen',
        'escalatie',
        'besluit_nemen',
        'registreren',
        'archiveren',
      ].map((s) => `example_besluit_gb_${s}`),
    ];
    // Neem besluit is at 2 since it asks for the besluitnemer (#246).
    const changed: Record<string, number> = { example_besluit_gb_besluit_nemen: 2 };
    for (const id of ids) expect(EXAMPLE_VERSIONS[id]).toBe(changed[id] ?? 1);
  });
});

describe('EXAMPLE_VERSIONS — document templates', () => {
  test('registers every default template, so DocumentComposer can refresh it', () => {
    // A template without an entry compares its stored version against
    // undefined, which is never satisfied, and is rewritten on every load.
    const missing = DEFAULT_TEMPLATES.map((t) => t.id).filter(
      (id) => !Number.isInteger(EXAMPLE_VERSIONS[id])
    );
    expect(missing).toEqual([]);
  });
});
