// @vitest-environment jsdom
import { describe, expect, test } from 'vitest';

import { applyRonlAttr, readRonlAttr } from './ronlAttributes';

// xmlns:bpmn is declared so the fixture is itself well-formed: without it every
// well-formedness assertion below fails regardless of what applyRonlAttr writes.
const BARE =
  '<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="d">' +
  '<bpmn:process id="p" isExecutable="true"></bpmn:process></bpmn:definitions>';
const NS = 'xmlns:ronl="http://ronl.nl/schema/1.0"';

describe('applyRonlAttr', () => {
  test('declares the ronl namespace and writes the attribute onto the process tag', () => {
    const out = applyRonlAttr(BARE, 'organization', 'flevoland');
    expect(out).toContain(`<bpmn:definitions ${NS} xmlns:bpmn=`);
    expect(out).toContain(
      '<bpmn:process id="p" isExecutable="true" ronl:organization="flevoland">'
    );
  });

  test('replaces an existing value rather than adding a second attribute', () => {
    const once = applyRonlAttr(BARE, 'language', 'nl');
    const twice = applyRonlAttr(once, 'language', 'en');
    expect(twice).toContain('ronl:language="en"');
    expect(twice.match(/ronl:language=/g)).toHaveLength(1);
  });

  test('removes the attribute when the value is cleared', () => {
    const set = applyRonlAttr(BARE, 'ropaRef', 'r-1');
    expect(applyRonlAttr(set, 'ropaRef', undefined)).not.toContain('ronl:ropaRef');
  });

  test('handles a self-closing process tag', () => {
    const selfClosing = '<bpmn:definitions id="d"><bpmn:process id="p"/></bpmn:definitions>';
    expect(applyRonlAttr(selfClosing, 'language', 'nl')).toContain(
      '<bpmn:process id="p" ronl:language="nl"/>'
    );
  });
});

describe('readRonlAttr', () => {
  test('reads back a value that applyRonlAttr wrote', () => {
    expect(
      readRonlAttr(applyRonlAttr(BARE, 'dsoActiviteitUrn', 'urn:x:1'), 'dsoActiviteitUrn')
    ).toBe('urn:x:1');
  });

  test('returns undefined when the attribute is absent', () => {
    expect(readRonlAttr(BARE, 'organization')).toBeUndefined();
  });
});

// Values are written into an XML attribute, and into a String.replace replacement
// string. Today all four come from selectors, so neither defect is reachable -- a
// property of the current wiring rather than of these functions.
describe('applyRonlAttr with values that need escaping', () => {
  const isWellFormed = (xml: string) =>
    new DOMParser().parseFromString(xml, 'application/xml').getElementsByTagName('parsererror')
      .length === 0;

  test('the fixture is itself well-formed, so failures below are about the value', () => {
    expect(isWellFormed(BARE)).toBe(true);
  });

  test.each(['Gemeente "Den Haag"', 'Kosten & baten', 'a < b'])(
    'keeps the XML well-formed and round-trips %s',
    (value) => {
      const out = applyRonlAttr(BARE, 'organization', value);
      expect(isWellFormed(out)).toBe(true);
      expect(readRonlAttr(out, 'organization')).toBe(value);
    }
  );

  test.each(['A$2B', 'A$&B', "A$'B", 'A$1B'])(
    'writes %s literally when inserting a new attribute',
    (value) => {
      const out = applyRonlAttr(BARE, 'organization', value);
      expect(readRonlAttr(out, 'organization')).toBe(value);
      expect(isWellFormed(out)).toBe(true);
    }
  );

  test.each(['A$2B', 'A$&B', "A$'B"])(
    'writes %s literally when replacing an existing attribute',
    (value) => {
      const out = applyRonlAttr(applyRonlAttr(BARE, 'organization', 'old'), 'organization', value);
      expect(readRonlAttr(out, 'organization')).toBe(value);
      expect(isWellFormed(out)).toBe(true);
    }
  );
});
