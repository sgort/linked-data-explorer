import { describe, expect, test } from 'vitest';

import {
  authoritiesByLevel,
  AuthorityLevel,
  DSO_AUTHORITIES,
  findAuthorityByOin,
  shortName,
} from './dsoAuthorities';

const LEVELS: AuthorityLevel[] = ['gemeente', 'provincie', 'waterschap', 'rijk'];

// Verified against organisaties.overheid.nl on 2026-09-18 — see the
// authorities brief for the cross-check against DSO's own bestuursorgaan data.
const KNOWN = [
  { name: 'Gemeente Lelystad', oin: '00000001005024249000' },
  { name: 'Provincie Flevoland', oin: '00000001006203243000' },
  { name: 'Gemeente Ede', oin: '00000001001104524000' },
  { name: 'Provincie Gelderland', oin: '00000001001825100000' },
  { name: 'Provincie Zuid-Holland', oin: '00000001002306608000' },
];

describe('DSO_AUTHORITIES', () => {
  test('is not empty', () => {
    expect(DSO_AUTHORITIES.length).toBeGreaterThan(0);
  });

  test('every entry has a 20-digit OIN', () => {
    for (const a of DSO_AUTHORITIES) {
      expect(a.oin, `${a.name} has a malformed OIN: ${a.oin}`).toMatch(/^\d{20}$/);
    }
  });

  test('every entry has one of the four known levels', () => {
    for (const a of DSO_AUTHORITIES) {
      expect(LEVELS, `${a.name} has an unknown level: ${a.level}`).toContain(a.level);
    }
  });

  test('every entry has a non-empty name', () => {
    for (const a of DSO_AUTHORITIES) {
      expect(a.name.trim().length).toBeGreaterThan(0);
    }
  });

  test('every entry has a code matching the register format for its level', () => {
    const CODE_RE = /^(gm\d{4}|pv\d{2}|ws\d{4}|mnre\d+)$/;
    for (const a of DSO_AUTHORITIES) {
      expect(a.code, `${a.name} has a malformed code: ${a.code}`).toMatch(CODE_RE);
    }
  });

  test('no duplicate OINs', () => {
    const oins = DSO_AUTHORITIES.map((a) => a.oin);
    expect(new Set(oins).size).toBe(oins.length);
  });

  test('each level is non-empty', () => {
    for (const level of LEVELS) {
      expect(authoritiesByLevel(level).length).toBeGreaterThan(0);
    }
  });

  test('authoritiesByLevel only returns entries for the requested level', () => {
    for (const level of LEVELS) {
      for (const a of authoritiesByLevel(level)) {
        expect(a.level).toBe(level);
      }
    }
  });

  test.each(KNOWN)('$name ($oin) is present', ({ name, oin }) => {
    const found = findAuthorityByOin(oin);
    expect(found?.name).toBe(name);
  });

  test('findAuthorityByOin returns undefined for an unknown OIN', () => {
    expect(findAuthorityByOin('00000000000000000000')).toBeUndefined();
  });
});

describe('shortName', () => {
  test('strips the generic level prefix for gemeente and provincie, which the register always carries', () => {
    const lelystad = findAuthorityByOin('00000001005024249000')!; // Gemeente Lelystad
    const flevoland = findAuthorityByOin('00000001006203243000')!; // Provincie Flevoland
    expect(shortName(lelystad)).toBe('Lelystad');
    expect(shortName(flevoland)).toBe('Flevoland');
  });

  test('strips a literal "Waterschap " prefix but leaves a distinctive waterschap name alone', () => {
    const limburg = authoritiesByLevel('waterschap').find((a) => a.name === 'Waterschap Limburg');
    const rijnland = authoritiesByLevel('waterschap').find(
      (a) => a.name === 'Hoogheemraadschap van Rijnland'
    );
    expect(limburg).toBeDefined();
    expect(rijnland).toBeDefined();
    expect(shortName(limburg!)).toBe('Limburg');
    expect(shortName(rijnland!)).toBe('Hoogheemraadschap van Rijnland');
  });

  test('leaves a ministry name alone when it carries no "Ministerie van " prefix', () => {
    const financien = authoritiesByLevel('rijk').find((a) => a.name === 'Financiën');
    expect(financien).toBeDefined();
    expect(shortName(financien!)).toBe('Financiën');
  });

  test('no gemeente, provincie, or waterschap short name still starts with its own generic level word', () => {
    for (const level of ['gemeente', 'provincie', 'waterschap'] as AuthorityLevel[]) {
      const genericWord =
        level === 'waterschap' ? 'Waterschap' : level === 'gemeente' ? 'Gemeente' : 'Provincie';
      for (const a of authoritiesByLevel(level)) {
        expect(
          shortName(a).startsWith(`${genericWord} `),
          `${a.name} -> "${shortName(a)}" still starts with "${genericWord} "`
        ).toBe(false);
      }
    }
  });
});

describe('authoritiesByLevel sorting', () => {
  test('sorts by short name using Dutch collation', () => {
    const provincies = authoritiesByLevel('provincie').map((a) => shortName(a));
    const sorted = [...provincies].sort((a, b) => a.localeCompare(b, 'nl'));
    expect(provincies).toEqual(sorted);
  });

  test('"\'s-Hertogenbosch" sorts among the "H" names, not first (ignoring the leading "\'s-")', () => {
    const gemeenten = authoritiesByLevel('gemeente').map((a) => shortName(a));
    const index = gemeenten.indexOf("'s-Hertogenbosch");
    expect(index).toBeGreaterThan(-1);
    expect(gemeenten[index - 1]).toMatch(/^H/);
    expect(gemeenten[index + 1]).toMatch(/^H/);
  });

  test('every level is sorted, and the display name keeps its apostrophe form', () => {
    for (const level of ['gemeente', 'provincie', 'waterschap', 'rijk'] as AuthorityLevel[]) {
      const names = authoritiesByLevel(level).map((a) => shortName(a));
      const sortKey = (n: string) => n.replace(/^('s-|'t |'s )/, '');
      const sorted = [...names].sort((a, b) => sortKey(a).localeCompare(sortKey(b), 'nl'));
      expect(names).toEqual(sorted);
    }
    // Display form is unchanged — not de-prefixed to "Hertogenbosch".
    expect(authoritiesByLevel('gemeente').map((a) => shortName(a))).toContain("'s-Hertogenbosch");
  });
});
