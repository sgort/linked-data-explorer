import { describe, expect, test } from 'vitest';

import {
  AWB_PHASE_SET,
  AWB_PHASES,
  cleanPhaseName,
  codeFromName,
  isValidPhaseCode,
  parseDeclaredPhases,
  phaseCodeLabel,
  serializePhases,
} from './phaseSet';

describe('parseDeclaredPhases (RBA declaredPhaseSet)', () => {
  test('reads code:Name pairs under the given label', () => {
    expect(parseDeclaredPhases('a:Alpha;b:Beta', 'Stap')).toEqual({
      set: {
        scheme: 'declared',
        label: 'Stap',
        phases: [
          { code: 'a', name: 'Alpha' },
          { code: 'b', name: 'Beta' },
        ],
      },
      skipped: [],
    });
  });

  test('labels the set "Fase" without a label, and also for a blank one', () => {
    expect(parseDeclaredPhases('a:Alpha', undefined).set?.label).toBe('Fase');
    expect(parseDeclaredPhases('a:Alpha', '  ').set?.label).toBe('Fase');
  });

  // RBA: 'skips malformed and duplicate entries, and trims the rest'
  test('skips malformed and duplicate entries, trims the rest, and reports what it skipped', () => {
    const parsed = parseDeclaredPhases(' a : Alpha ;;b;:x;c:Gamma: two;a:Again;d: ', undefined);
    expect(parsed.set?.phases).toEqual([
      { code: 'a', name: 'Alpha' },
      { code: 'c', name: 'Gamma: two' },
    ]);
    // Blank entries (the ';;') are not reported; everything else that was dropped is.
    expect(parsed.skipped).toEqual(['b', ':x', 'a:Again', 'd:']);
  });

  test('yields no set when nothing usable is left, or nothing was declared', () => {
    expect(parseDeclaredPhases(';;', undefined)).toEqual({ set: undefined, skipped: [] });
    expect(parseDeclaredPhases(undefined, undefined)).toEqual({ set: undefined, skipped: [] });
    expect(parseDeclaredPhases('   ', undefined)).toEqual({ set: undefined, skipped: [] });
  });
});

describe('serializePhases', () => {
  test('is the inverse of parsing', () => {
    const phases = [
      { code: 'a', name: 'Alpha' },
      { code: 'c', name: 'Gamma: two' },
    ];
    expect(serializePhases(phases)).toBe('a:Alpha;c:Gamma: two');
    expect(parseDeclaredPhases(serializePhases(phases), undefined).set?.phases).toEqual(phases);
  });
});

describe('codes and names', () => {
  test('codeFromName lower-cases, strips diacritics and joins words with "-"', () => {
    expect(codeFromName('Financiële reservering', [])).toBe('financiele-reservering');
    expect(codeFromName('  Advies & toetsing! ', [])).toBe('advies-toetsing');
  });

  test('codeFromName stays unique against codes already taken', () => {
    expect(codeFromName('Intake', ['intake'])).toBe('intake-2');
    expect(codeFromName('Intake', ['intake', 'intake-2'])).toBe('intake-3');
  });

  test('codeFromName falls back to "fase" for a name with no letters or digits', () => {
    expect(codeFromName('!!!', [])).toBe('fase');
  });

  test('isValidPhaseCode refuses empty codes and the separators', () => {
    expect(isValidPhaseCode('intake')).toBe(true);
    expect(isValidPhaseCode('4+5')).toBe(true);
    expect(isValidPhaseCode('')).toBe(false);
    expect(isValidPhaseCode('a:b')).toBe(false);
    expect(isValidPhaseCode('a;b')).toBe(false);
    expect(isValidPhaseCode(' a')).toBe(false);
  });

  test('cleanPhaseName strips the entry separator and trims', () => {
    expect(cleanPhaseName(' Claim; opstellen ')).toBe('Claim opstellen');
    expect(cleanPhaseName('Gamma: two')).toBe('Gamma: two');
  });
});

describe('the Awb table (copied from RBA packages/shared/src/awb-phases.ts)', () => {
  test('has the eight codes in order', () => {
    expect(AWB_PHASES.map((p) => p.code)).toEqual([
      '1',
      '2',
      '3',
      '4+5',
      '6',
      '7',
      '8',
      'archivering',
    ]);
    expect(AWB_PHASE_SET).toMatchObject({ scheme: 'awb', label: 'Awb-fase' });
  });

  test('phaseCodeLabel matches RBA: "Fase <code>", "Archiefwet", and "<label> <n>" for declared', () => {
    expect(phaseCodeLabel(AWB_PHASE_SET, '4+5')).toBe('Fase 4+5');
    expect(phaseCodeLabel(AWB_PHASE_SET, 'archivering')).toBe('Archiefwet');
    const declared = parseDeclaredPhases('a:Alpha;b:Beta', 'Stap').set!;
    expect(phaseCodeLabel(declared, 'b')).toBe('Stap 2');
  });
});
