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
    expect(profileDossier(opaque).activityIdentity).not.toBe('semantic');
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
});
