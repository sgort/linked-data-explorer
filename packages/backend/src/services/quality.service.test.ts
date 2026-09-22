import { profileDossier, classifyName, measureDmn, GUID_RE } from './quality.service';
import type { Dossier } from './dossier.service';

describe('GUID detection', () => {
  test('matches a hyphen-separated GUID', () => {
    expect(GUID_RE.test('_6d45be8c-8010-4d11-8775-487a28b88087_Vergunningplicht')).toBe(true);
  });

  // normalizeDmnForOperaton rewrites hyphens to underscores to make names
  // FEEL-safe; a hyphen-only detector reports 0% opacity on an opaque DMN.
  test('matches an underscore-separated GUID', () => {
    expect(GUID_RE.test('onderwerp_c7ef02b1_0f07_4ec7_a91e_6a6c35dd3922')).toBe(true);
  });

  test('does not match an ordinary name', () => {
    expect(GUID_RE.test('Boom kappen of houtopstand vellen')).toBe(false);
  });

  // §I1: IMOW URN local names are 32 contiguous hex characters with NO
  // separator at all — a real example from a GM0995 activity URN. The
  // `imowRefs` regex in this same file already handles this shape; before
  // this fix GUID_RE required a separator and missed it, so `classifyName`
  // reported `semantic` for precisely the GUID-named activities this
  // profile exists to flag.
  test('matches a separator-less 32-hex GUID', () => {
    expect(GUID_RE.test('180a63f795be43bf8683a480e75deb84')).toBe(true);
  });
});

describe('classifyName', () => {
  test('a meaningful name is semantic', () => {
    expect(classifyName('Boom kappen of houtopstand vellen', false)).toBe('semantic');
  });

  test('a GUID name with a resolution path is opaque-resolvable', () => {
    expect(classifyName('uitv__864933e7-4ea9-45a2-ae17-d8b1a4df34d7', true)).toBe(
      'opaque-resolvable'
    );
  });

  test('a GUID name with no resolution path is opaque-dangling', () => {
    expect(classifyName('_6d45be8c-8010-4d11-8775-487a28b88087_Niet van toepassing', false)).toBe(
      'opaque-dangling'
    );
  });

  test('a separator-less 32-hex GUID name is classified opaque', () => {
    expect(classifyName('180a63f795be43bf8683a480e75deb84', false)).toBe('opaque-dangling');
  });
});

describe('measureDmn', () => {
  const dmn = `<?xml version="1.0"?>
<dmn:definitions xmlns:dmn="https://www.omg.org/spec/DMN/20191111/MODEL/" xmlns:uitv="x">
  <dmn:decision id="d1" name="Boom kappen of houtopstand vellen"/>
  <dmn:decision id="d2" name="_6d45be8c-8010-4d11-8775-487a28b88087_Vergunningplicht"/>
  <dmn:decisionTable id="t1"/>
  <dmn:inputData id="i1" name="uitv__864933e7-4ea9-45a2-ae17-d8b1a4df34d7"/>
  <dmn:inputData id="i2" name="onderwerp_c7ef02b1_0f07_4ec7_a91e_6a6c35dd3922"/>
  <uitv:vraagTekst><![CDATA[Wilt u een boom of beplanting weghalen?]]></uitv:vraagTekst>
</dmn:definitions>`;

  test('counts decisions without counting decisionTable', () => {
    expect(measureDmn(dmn).decisions.total).toBe(2);
  });

  test('splits decisions into semantic and opaque', () => {
    const m = measureDmn(dmn);
    expect(m.decisions.semantic).toBe(1);
    expect(m.decisions.opaque).toBe(1);
  });

  test('counts both GUID separators as opaque inputs', () => {
    expect(measureDmn(dmn).inputs.opaque).toBe(2);
  });

  // A naive `<[^>]+>` strip eats CDATA and scores label coverage as zero.
  test('reads question text out of CDATA', () => {
    expect(measureDmn(dmn).questions).toEqual(['Wilt u een boom of beplanting weghalen?']);
  });

  test('collects embedded IMOW refs', () => {
    const withRef = dmn.replace(
      '<uitv:vraagTekst>',
      '<dmn:text>nl.imow-gm0995.gebiedengroep.180a63f795be43bf8683a480e75deb84</dmn:text><uitv:vraagTekst>'
    );
    expect(measureDmn(withRef).imowRefs).toEqual([
      'nl.imow-gm0995.gebiedengroep.180a63f795be43bf8683a480e75deb84',
    ]);
  });

  test('an unterminated opening tag is skipped rather than throwing or grabbing garbage', () => {
    // No `>` appears anywhere after the second `<dmn:decision` match, so
    // `openTags` must bail via its `end === -1` guard instead of scanning
    // past the end of the string.
    const truncated =
      '<dmn:definitions xmlns:dmn="x"><dmn:decision id="d1" name="A"/><dmn:decision name="incomplete"';

    expect(() => measureDmn(truncated)).not.toThrow();
    expect(measureDmn(truncated).decisions.total).toBe(1);
  });

  test('a decision or input tag with no name attribute reports an empty name rather than throwing', () => {
    const noName =
      '<dmn:definitions xmlns:dmn="x"><dmn:decision id="d1"/><dmn:inputData id="i1"/></dmn:definitions>';

    const m = measureDmn(noName);

    expect(m.decisions.total).toBe(1);
    // An empty name is not a GUID, so it is classified semantic rather than
    // making nameOf's fallback throw or produce `undefined`.
    expect(m.decisions.semantic).toBe(1);
    expect(m.inputs.semantic).toBe(1);
  });

  // §I2: the rest of this codebase treats the `dmn:`/`uitv:` prefix as
  // optional (dso.service.ts's `/<(?:dmn:)?definitions/` and the `(?:\w+:)?`
  // matches throughout `normalizeDmnForOperaton`); `normalizeDmnForOperaton`
  // never ADDS the prefix, so an un-prefixed DMN is not itself an error. A
  // hardcoded `dmn:`/`uitv:` here previously measured such a DMN as
  // `decisions: {total: 0, ...}` — silently reporting nothing opaque.
  test('counts decisions, inputs and questions on an UN-PREFIXED DMN', () => {
    const unprefixed = `<?xml version="1.0"?>
<definitions xmlns="https://www.omg.org/spec/DMN/20191111/MODEL/">
  <decision id="d1" name="Boom kappen of houtopstand vellen"/>
  <decision id="d2" name="_6d45be8c-8010-4d11-8775-487a28b88087_Vergunningplicht"/>
  <inputData id="i1" name="uitv__864933e7-4ea9-45a2-ae17-d8b1a4df34d7"/>
  <vraagTekst><![CDATA[Wilt u een boom of beplanting weghalen?]]></vraagTekst>
</definitions>`;

    const m = measureDmn(unprefixed);

    expect(m.decisions.total).toBe(2);
    expect(m.decisions.opaque).toBe(1);
    expect(m.inputs.total).toBe(1);
    expect(m.questions).toEqual(['Wilt u een boom of beplanting weghalen?']);
  });

  // The prefix becoming optional must not start counting `decisionTable` (or
  // its un-prefixed form) as a `decision` — the tag-name guard in `openTags`
  // must still exclude it.
  test('an un-prefixed decisionTable is not counted as a decision', () => {
    const unprefixed =
      '<definitions xmlns="x"><decision id="d1" name="A"/><decisionTable id="t1"/></definitions>';

    expect(measureDmn(unprefixed).decisions.total).toBe(1);
  });
});

describe('profileDossier', () => {
  const dossier = {
    urn: 'nl.imow-gm0995.activiteit.HoutopstandVellen',
    legalSource: {
      available: true,
      juridischeRegels: Array.from({ length: 10 }, (_, i) => ({
        wId: `w${i}`,
        articleText: i < 8 ? '<Inhoud/>' : null,
        locaties: [
          {
            identificatie: 'nl.imow-gm0995.gebiedengroep.180a63f795be43bf8683a480e75deb84',
            naam: 'bebouwingscontour, houtkap',
          },
        ],
      })),
    },
    annotation: { groep: 'kapactiviteit' },
    // The RTR's own locaties for this activity — the third layer §I3 checks.
    // Carries the same gebiedengroep ref as the annotation and DMN layers,
    // so the worked-example case is present in all three.
    rtrLocaties: ['nl.imow-gm0995.gebiedengroep.180a63f795be43bf8683a480e75deb84'],
    decisionCriteria: {
      // Carries the gebiedengroep ref so refResolvability has something to resolve —
      // the dossier resolved that same identificatie to a name above.
      dmn:
        '<dmn:definitions xmlns:dmn="x"><dmn:decision id="d" name="Boom kappen"/>' +
        '<dmn:text>nl.imow-gm0995.gebiedengroep.180a63f795be43bf8683a480e75deb84</dmn:text>' +
        '</dmn:definitions>',
    },
    submissionRequirements: null,
  } as unknown as Dossier;

  test('classifies a semantic activity URN', () => {
    expect(profileDossier(dossier).activityIdentity).toBe('semantic');
  });

  test('reports legal traceability as traced over total', () => {
    const p = profileDossier(dossier);
    expect(p.legalTraceability).toEqual({ rules: 10, withWId: 10, withArticleText: 8 });
  });

  test('counts a resolved IMOW ref as resolvable', () => {
    expect(profileDossier(dossier).refResolvability.resolved).toBe(1);
  });

  // §I3: cross-layer consistency is a THREE-layer check (RTR, annotations,
  // DMN), not the two `refResolvability` already covers.
  test('reports a ref present in the RTR, annotations and DMN as a shared object', () => {
    expect(profileDossier(dossier).crossLayerConsistency.sharedObjects).toEqual([
      'nl.imow-gm0995.gebiedengroep.180a63f795be43bf8683a480e75deb84',
    ]);
  });

  test('does NOT report a ref as shared when the RTR never listed it under the activity locaties', () => {
    const noRtrMatch = { ...dossier, rtrLocaties: [] } as unknown as Dossier;

    expect(profileDossier(noRtrMatch).crossLayerConsistency.sharedObjects).toEqual([]);
    // Still resolvable via the annotation layer alone — proves this is a
    // genuinely three-layer gate, not a break in the two-layer resolution
    // refResolvability already performs.
    expect(profileDossier(noRtrMatch).refResolvability.resolved).toBe(1);
  });

  test('produces no single headline grade', () => {
    const p = profileDossier(dossier) as unknown as Record<string, unknown>;
    expect(p['grade']).toBeUndefined();
    expect(p['score']).toBeUndefined();
  });

  test('an opaque URN local name is classified opaque', () => {
    const opaque = {
      ...dossier,
      urn: 'nl.imow-gm0995.activiteit.180a63f7-95be-43bf-8683-a480e75deb84',
    } as Dossier;
    expect(profileDossier(opaque).activityIdentity).toBe('opaque-dangling');
  });

  // §I1: IMOW URN local names are 32 CONTIGUOUS hex characters, no separator
  // at all — the form GUID_RE previously missed entirely.
  test('a separator-less 32-hex URN local name is classified opaque', () => {
    const opaque = {
      ...dossier,
      urn: 'nl.imow-gm0995.activiteit.180a63f795be43bf8683a480e75deb84',
    } as Dossier;
    expect(profileDossier(opaque).activityIdentity).toBe('opaque-dangling');
  });

  // The `resolvable` flag must be earned from a real readable name, not
  // assumed true — otherwise every opaque activity looks recoverable even
  // when nothing on the dossier actually recovers it.
  test('an opaque URN with no readable name anywhere is opaque-dangling', () => {
    const dangling = {
      ...dossier,
      urn: 'nl.imow-gm0995.activiteit.180a63f7-95be-43bf-8683-a480e75deb84',
      omschrijving: null,
      annotation: { groep: 'kapactiviteit' },
    } as unknown as Dossier;
    expect(profileDossier(dangling).activityIdentity).toBe('opaque-dangling');
  });

  test('an opaque URN with a readable omschrijving is opaque-resolvable', () => {
    const resolvable = {
      ...dossier,
      urn: 'nl.imow-gm0995.activiteit.180a63f7-95be-43bf-8683-a480e75deb84',
      omschrijving: 'Boom kappen of houtopstand vellen',
    } as unknown as Dossier;
    expect(profileDossier(resolvable).activityIdentity).toBe('opaque-resolvable');
  });

  test('a urn with fewer than 4 dot-separated segments falls back to the full urn as the local name', () => {
    // Only 2 segments after splitting on '.', so `.slice(3).join('.')` is ''
    // and the code must fall back to the full urn — which, unlike '', is
    // itself opaque. An implementation that forgot the `|| d.urn` fallback
    // would classify this 'semantic' instead.
    const shortUrn = {
      ...dossier,
      urn: 'nl.imow-6d45be8c-8010-4d11-8775-487a28b88087',
      omschrijving: null,
      annotation: { groep: 'kapactiviteit' },
    } as unknown as Dossier;
    expect(profileDossier(shortUrn).activityIdentity).toBe('opaque-dangling');
  });

  test('a dossier with no decisionCriteria and no legal source falls back to nulls and empty counts', () => {
    const minimal = {
      urn: 'nl.imow-gm0995.activiteit.Iets',
      omschrijving: 'Iets',
      annotation: { naam: null },
      decisionCriteria: null,
      submissionRequirements: null,
    } as unknown as Dossier;

    const p = profileDossier(minimal);

    expect(p.decisionNaming).toBeNull();
    expect(p.inputNaming).toBeNull();
    expect(p.labelCoverage).toBeNull();
    expect(p.refResolvability).toEqual({ total: 0, resolved: 0, dangling: 0 });
    expect(p.legalTraceability).toEqual({ rules: 0, withWId: 0, withArticleText: 0 });
  });
});
