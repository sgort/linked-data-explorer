import { describe, expect, test } from 'vitest';

import { formatDocumentRefs, parseDocumentRefs } from './documentRefs';

describe('parseDocumentRefs', () => {
  test('reads a single id, the shape every pre-existing BPMN carries', () => {
    expect(parseDocumentRefs('rip-ontwerptoelichting')).toEqual(['rip-ontwerptoelichting']);
  });

  test('reads several ids in the order they were written', () => {
    expect(parseDocumentRefs('rip-ontwerptoelichting,rip-objectenboom')).toEqual([
      'rip-ontwerptoelichting',
      'rip-objectenboom',
    ]);
  });

  test('tolerates whitespace around a comma, as a hand-edited BPMN has', () => {
    expect(parseDocumentRefs(' a , b ')).toEqual(['a', 'b']);
  });

  test('treats absent, empty and comma-only values as no documents', () => {
    expect(parseDocumentRefs(undefined)).toEqual([]);
    expect(parseDocumentRefs('')).toEqual([]);
    expect(parseDocumentRefs(' , ')).toEqual([]);
  });
});

describe('formatDocumentRefs', () => {
  test('joins ids without spaces', () => {
    expect(formatDocumentRefs(['a', 'b'])).toBe('a,b');
  });

  test('returns undefined for an empty list, so the attribute is removed', () => {
    // updateProperties deletes a property set to undefined; '' would leave an
    // empty attribute in the XML for the extractor to trip over.
    expect(formatDocumentRefs([])).toBeUndefined();
    expect(formatDocumentRefs(['  '])).toBeUndefined();
  });

  test('round-trips what parse produced', () => {
    const value = 'rip-ontwerptoelichting,rip-objectenboom';
    expect(formatDocumentRefs(parseDocumentRefs(value))).toBe(value);
  });
});
