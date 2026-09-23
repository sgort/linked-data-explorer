// packages/backend/src/services/dossier.service.test.ts
jest.mock('../utils/logger', () => ({
  __esModule: true,
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
jest.mock('./dso.service', () => ({
  __esModule: true,
  getActiviteit: jest.fn(),
  getToepasbareRegels: jest.fn(),
  extractDmnFromSttr: jest.fn(),
  getSttrBestand: jest.fn(),
}));
jest.mock('./ozon.service', () => ({
  __esModule: true,
  zoekRegelingen: jest.fn(),
  getRegeltekstAnnotaties: jest.fn(),
  getDocumentComponent: jest.fn(),
  toOzonPathId: (s: string) => s.replace(/\//g, '_'),
}));

import * as dsoService from './dso.service';
import * as ozonService from './ozon.service';
import { buildDossier } from './dossier.service';
import annotaties from '../__fixtures__/annotaties-gm0995-prod.json';

const dso = dsoService as unknown as Record<string, jest.Mock>;
const ozon = ozonService as unknown as Record<string, jest.Mock>;

const URN = 'nl.imow-gm0995.activiteit.HoutopstandVellen';

const activiteit = {
  urn: URN,
  omschrijving: 'Boom kappen of houtopstand vellen',
  bestuursorgaan: { oin: '00000001005024249000', organisatieType: 'GM', organisatieCode: '0995' },
  regelBeheerObjecten: [
    {
      typering: 'Conclusie',
      functioneleStructuurRef:
        'http://toepasbare-regels.omgevingswet.overheid.nl/x/id/concept/Conclusie' + URN,
    },
    {
      typering: 'Indieningsvereisten',
      toestemming: { code: 'Vergunning', waarde: 'Aanvraag vergunning' },
      functioneleStructuurRef:
        'http://toepasbare-regels.omgevingswet.overheid.nl/x/id/concept/IndieningsvereistenVergunning' +
        URN,
    },
  ],
  locaties: [{ identificatie: 'nl.imow-gm0995.gebiedengroep.180a63f795be43bf8683a480e75deb84' }],
};

beforeEach(() => {
  for (const fn of [...Object.values(dso), ...Object.values(ozon)]) {
    if (typeof fn === 'function' && 'mockReset' in fn) (fn as jest.Mock).mockReset();
  }
  dso.getActiviteit.mockResolvedValue(activiteit);
  ozon.zoekRegelingen.mockResolvedValue({
    _embedded: {
      regelingen: [
        // Omgevingsplan is deliberately NOT first: a regression to a
        // positional pick (regelingen[0]) must fail this suite, not just an
        // implementation that ignores `type.code` entirely.
        {
          identificatie: '/akn/nl/act/gm0995/2025/Regeling6',
          type: { code: '/join/id/stop/regelingtype_006', waarde: 'Omgevingsvisie' },
        },
        {
          identificatie: '/akn/nl/act/gm0995/2023/Regeling9',
          type: { code: '/join/id/stop/regelingtype_010', waarde: 'Programma' },
        },
        {
          identificatie: '/akn/nl/act/gm0995/2020/omgevingsplan',
          type: { code: '/join/id/stop/regelingtype_003', waarde: 'Omgevingsplan' },
          officieleTitel: 'Omgevingsplan gemeente Lelystad',
        },
      ],
    },
  });
  ozon.getRegeltekstAnnotaties.mockResolvedValue(annotaties);
  // Content is keyed off the requested wId so a scrambled rule<->article
  // mapping is detectable, not just "some text came back".
  ozon.getDocumentComponent.mockImplementation((_regelingId: string, wId: string) => ({
    _embedded: { documentComponenten: [{ inhoud: `<Inhoud><Al>TEXT FOR ${wId}</Al></Inhoud>` }] },
  }));
  // A DIFFERENT identifier per functioneleStructuurRef — this is the hop
  // that decides which DMN is labelled Conclusie vs Indieningsvereisten. A
  // single shared identifier across both would pass even a broken
  // implementation that always picked the first (or last) rbo's result for
  // both rule sets.
  dso.getToepasbareRegels.mockImplementation((functioneleStructuurRef: string) => {
    const identifier = functioneleStructuurRef.includes('IndieningsvereistenVergunning')
      ? 105947
      : 114233;
    return Promise.resolve({
      _embedded: { toepasbareRegels: [{ identifier, sttrVersie: 2, begindatum: '30-07-2026' }] },
    });
  });
  dso.getSttrBestand.mockResolvedValue('<sttr/>');
  dso.extractDmnFromSttr.mockReturnValue('<dmn:definitions/>'); // synchronous
});

describe('buildDossier', () => {
  test('selects the omgevingsplan, not another regeling of the same authority', async () => {
    const d = await buildDossier({ urn: URN, env: 'prod', datum: '22-09-2026' });

    expect(d.provenance.regelingIdentificatie).toBe('/akn/nl/act/gm0995/2020/omgevingsplan');
  });

  test('derives the bevoegdGezag code from the activity bestuursorgaan', async () => {
    await buildDossier({ urn: URN, env: 'prod' });

    expect(ozon.zoekRegelingen).toHaveBeenCalledWith(
      { bevoegdGezag: ['gm0995'] },
      'prod',
      expect.anything()
    );
  });

  // Only the mnre-rejection path exercised `authority` before this: it
  // proved a MISSING authority is rejected, not that a SUPPLIED one actually
  // reaches the regelingen search rather than being silently ignored in
  // favour of the derived code.
  test('a supplied authority reaches zoekRegelingen, overriding the derived code', async () => {
    const d = await buildDossier({ urn: URN, env: 'prod', authority: 'gm9999' });

    expect(ozon.zoekRegelingen).toHaveBeenCalledWith(
      { bevoegdGezag: ['gm9999'] },
      'prod',
      expect.anything()
    );
    expect(d.bestuursorgaan?.code).toBe('gm9999');
  });

  test('joins the activity to its 10 juridische regels', async () => {
    const d = await buildDossier({ urn: URN, env: 'prod' });

    expect(d.legalSource.juridischeRegels).toHaveLength(10);
  });

  test('the fixture holds more rules than just ours, so the activiteitRef filter is exercised', () => {
    // Guards against the decoy entries (GeslotenBodemenergInst, AntenneBouwen)
    // being silently trimmed back out of the fixture later, which would make
    // "joins the activity to its 10 juridische regels" pass against an
    // implementation that returns every regelsVoorIedereen unfiltered.
    expect(annotaties.regelsVoorIedereen.length).toBeGreaterThan(10);
  });

  test('counts 5 rules qualified vergunningplicht', async () => {
    const d = await buildDossier({ urn: URN, env: 'prod' });

    const vergunning = d.legalSource.juridischeRegels.filter(
      (r) => r.kwalificatie === 'vergunningplicht'
    );
    expect(vergunning).toHaveLength(5);
  });

  test('reads the IMOW annotation groep from the annotation layer', async () => {
    const d = await buildDossier({ urn: URN, env: 'prod' });

    expect(d.annotation.groep).toBe('kapactiviteit');
    expect(d.annotation.bovenliggendeActiviteitRef).toBe('nl.imow-gm0995.activiteit.OverigeAct');
  });

  test('resolves locatie refs to readable names', async () => {
    const d = await buildDossier({ urn: URN, env: 'prod' });

    const names = d.legalSource.juridischeRegels.flatMap((r) => r.locaties.map((l) => l.naam));
    expect(names).toContain('bebouwingscontour, houtkap');
  });

  test('maps each juridische regel to its own article text, not a scrambled one', async () => {
    const d = await buildDossier({ urn: URN, env: 'prod' });

    const withWId = d.legalSource.juridischeRegels.filter((r) => r.wId);
    expect(withWId.length).toBeGreaterThanOrEqual(2);
    // Every rule's articleText must embed its OWN wId — proves the
    // regeltekstRef -> wId -> articleText join is keyed correctly rather
    // than broadcasting one fetched text to every rule.
    for (const r of withWId) {
      expect(r.articleText).toContain(r.wId);
    }

    // getDocumentComponent is called once per distinct wId, not once per rule
    // with the same wId repeated — proves the fan-out is deduplicated.
    const calledWIds = ozon.getDocumentComponent.mock.calls.map((call) => call[1]);
    expect(new Set(calledWIds).size).toBe(calledWIds.length);
  });

  test('groups toepasbare regels into decision criteria and submission requirements', async () => {
    const d = await buildDossier({ urn: URN, env: 'prod' });

    expect(d.decisionCriteria?.identifier).toBe(114233);
    expect(d.submissionRequirements?.identifier).toBe(105947);
    expect(d.submissionRequirements?.toestemming).toBe('Aanvraag vergunning');
  });

  test('an activity with no regelBeheerObjecten yields absent rule sets, not an error', async () => {
    dso.getActiviteit.mockResolvedValue({ ...activiteit, regelBeheerObjecten: [] });

    const d = await buildDossier({ urn: URN, env: 'prod' });

    expect(d.decisionCriteria).toBeNull();
    expect(d.submissionRequirements).toBeNull();
    expect(dso.getToepasbareRegels).not.toHaveBeenCalled();
  });

  test('a failing article fetch records the reason and does not fail the dossier', async () => {
    ozon.getDocumentComponent.mockRejectedValue(new Error('DSO responded 500: boom'));

    const d = await buildDossier({ urn: URN, env: 'prod' });

    expect(d.legalSource.juridischeRegels).toHaveLength(10);
    expect(d.provenance.failures.some((f) => f.step === 'documentComponent')).toBe(true);
  });

  test('a rejected regelingen search records the reason and leaves the legal source unavailable', async () => {
    ozon.zoekRegelingen.mockRejectedValue(new Error('Ozon responded 503: boom'));

    const d = await buildDossier({ urn: URN, env: 'prod' });

    expect(d.legalSource.available).toBe(false);
    expect(d.provenance.failures).toContainEqual({
      step: 'regeling',
      detail: 'Ozon responded 503: boom',
    });
    // Downstream steps that depend on regelingIdentificatie must not run.
    expect(ozon.getRegeltekstAnnotaties).not.toHaveBeenCalled();
  });

  // C1 (secondary): a failed annotations leg must NOT leave legalSource
  // marked available — a real regelingIdentificatie/regelingTitel above an
  // empty juridischeRegels list, with `available: true`, reads as "this
  // activity genuinely has zero rules" when the truth is "the fetch that
  // would have found them failed".
  test('a rejected annotaties fetch records the reason and marks the legal source unavailable', async () => {
    ozon.getRegeltekstAnnotaties.mockRejectedValue(
      new Error('Ozon responded 500: annotaties down')
    );

    const d = await buildDossier({ urn: URN, env: 'prod' });

    expect(d.legalSource.available).toBe(false);
    expect(d.legalSource.juridischeRegels).toHaveLength(0);
    expect(d.provenance.failures).toContainEqual({
      step: 'annotaties',
      detail: 'Ozon responded 500: annotaties down',
    });
  });

  // The other half of the same fix: a SUCCESSFUL annotations fetch that
  // simply contains no rule for this activity is a genuine empty result,
  // not a failure, so legalSource must stay available.
  test('a successful annotaties fetch with no matching rules leaves the legal source available', async () => {
    ozon.getRegeltekstAnnotaties.mockResolvedValue({
      activiteiten: [],
      regelteksten: [],
      locaties: [],
      regelsVoorIedereen: [],
    });

    const d = await buildDossier({ urn: URN, env: 'prod' });

    expect(d.legalSource.available).toBe(true);
    expect(d.legalSource.juridischeRegels).toHaveLength(0);
    expect(d.provenance.failures.some((f) => f.step === 'annotaties')).toBe(false);
  });

  test('a failing DMN extraction records the reason but still returns the rule set', async () => {
    dso.getSttrBestand.mockRejectedValue(new Error('DSO responded 404: STTR not found'));

    const d = await buildDossier({ urn: URN, env: 'prod' });

    expect(d.decisionCriteria?.identifier).toBe(114233);
    expect(d.decisionCriteria?.dmn).toBeNull();
    expect(d.provenance.failures).toContainEqual({
      step: 'dmn',
      detail: 'DSO responded 404: STTR not found',
    });
  });

  test('a rejected toepasbare-regels lookup records the reason and omits that rule set', async () => {
    dso.getToepasbareRegels.mockRejectedValue(
      new Error('DSO responded 502: toepasbare regels down')
    );

    const d = await buildDossier({ urn: URN, env: 'prod' });

    expect(d.decisionCriteria).toBeNull();
    expect(d.submissionRequirements).toBeNull();
    expect(d.provenance.failures.filter((f) => f.step === 'toepasbareRegels')).toHaveLength(2);
  });

  test('no regeling of type 003 marks the legal source unavailable', async () => {
    ozon.zoekRegelingen.mockResolvedValue({ _embedded: { regelingen: [] } });

    const d = await buildDossier({ urn: URN, env: 'prod' });

    expect(d.legalSource.available).toBe(false);
    expect(d.provenance.failures.some((f) => f.step === 'regeling')).toBe(true);
  });

  test('a national activity without an authority parameter is rejected', async () => {
    dso.getActiviteit.mockResolvedValue({
      ...activiteit,
      urn: 'nl.imow-mnre1034.activiteit.Iets',
      bestuursorgaan: { organisatieType: 'MNRE', organisatieCode: '1034' },
    });

    await expect(
      buildDossier({ urn: 'nl.imow-mnre1034.activiteit.Iets', env: 'prod' })
    ).rejects.toThrow('authority');
  });

  test('provenance records env and datum', async () => {
    const d = await buildDossier({ urn: URN, env: 'prod', datum: '22-09-2026' });

    expect(d.provenance.env).toBe('prod');
    expect(d.provenance.datum).toBe('22-09-2026');
  });

  // C1: the route's wire format is dd-MM-yyyy throughout — RTR (getActiviteit)
  // expects exactly that. Ozon (getRegeltekstAnnotaties's geldigOp) expects
  // ISO YYYY-MM-dd instead. Forwarding the same string to both is wrong for
  // one of them; this must fail if the dossier service stops converting
  // before calling Ozon.
  test('forwards datum as dd-MM-yyyy to RTR and as ISO geldigOp to Ozon', async () => {
    await buildDossier({ urn: URN, env: 'prod', datum: '22-09-2026' });

    expect(dso.getActiviteit).toHaveBeenCalledWith(URN, '22-09-2026', 'prod');
    expect(ozon.getRegeltekstAnnotaties).toHaveBeenCalledWith(
      '/akn/nl/act/gm0995/2020/omgevingsplan',
      'prod',
      { geldigOp: '2026-09-22' }
    );
  });

  test('an activiteit missing bestuursorgaan, omschrijving and regelBeheerObjecten defaults every optional field rather than crashing', async () => {
    dso.getActiviteit.mockResolvedValue({});

    const d = await buildDossier({ urn: URN, env: 'prod' });

    expect(d.bestuursorgaan).toEqual({ code: '', oin: null });
    expect(d.omschrijving).toBeNull();
    expect(d.decisionCriteria).toBeNull();
    expect(d.submissionRequirements).toBeNull();
    expect(dso.getToepasbareRegels).not.toHaveBeenCalled();
  });

  test('a functioneleStructuurRef with no concept segment yields an empty viewer id', async () => {
    dso.getActiviteit.mockResolvedValue({
      ...activiteit,
      regelBeheerObjecten: [
        {
          typering: 'Conclusie',
          functioneleStructuurRef:
            'http://toepasbare-regels.omgevingswet.overheid.nl/x/no-concept-segment',
        },
      ],
    });

    const d = await buildDossier({ urn: URN, env: 'prod' });

    expect(d.decisionCriteria?.viewerUrl).toBe(
      'https://omgevingswet.overheid.nl/registratie-toepasbare-regels/id/'
    );
  });

  test('a non-Error rejection is stringified rather than crashing on .message', async () => {
    ozon.zoekRegelingen.mockRejectedValue('plain string failure');

    const d = await buildDossier({ urn: URN, env: 'prod' });

    expect(d.provenance.failures).toContainEqual({
      step: 'regeling',
      detail: 'plain string failure',
    });
  });

  test('a regelingen response with no _embedded is treated as an empty result set', async () => {
    ozon.zoekRegelingen.mockResolvedValue({});

    const d = await buildDossier({ urn: URN, env: 'prod' });

    expect(d.legalSource.available).toBe(false);
    expect(d.provenance.failures.some((f) => f.step === 'regeling')).toBe(true);
  });

  test('an omgevingsplan with no officieleTitel yields a null regelingTitel', async () => {
    ozon.zoekRegelingen.mockResolvedValue({
      _embedded: {
        regelingen: [
          {
            identificatie: '/akn/nl/act/gm0995/2020/omgevingsplan',
            type: { code: '/join/id/stop/regelingtype_003' },
          },
        ],
      },
    });

    const d = await buildDossier({ urn: URN, env: 'prod' });

    expect(d.legalSource.available).toBe(true);
    expect(d.legalSource.regelingTitel).toBeNull();
  });

  test('a regel missing kwalificatie, idealisatie and a resolvable wId or locatie defaults each to null', async () => {
    ozon.getRegeltekstAnnotaties.mockResolvedValue({
      activiteiten: [],
      regelteksten: [],
      locaties: [],
      regelsVoorIedereen: [
        {
          identificatie: 'regelA',
          regeltekstRef: 'unknown-regeltekst',
          activiteitLocatieaanduidingen: [{ identificatie: 'aandA', activiteitRef: URN }],
        },
        {
          identificatie: 'regelB',
          regeltekstRef: 'unknown-regeltekst',
          activiteitLocatieaanduidingen: [
            { identificatie: 'aandB', activiteitRef: URN, locatieRefs: ['unresolvable-locatie'] },
          ],
        },
        {
          // No activiteitLocatieaanduidingen at all: must be filtered out silently.
          identificatie: 'regelC-no-aanduidingen',
          regeltekstRef: 'unknown-regeltekst',
        },
      ],
    });

    const d = await buildDossier({ urn: URN, env: 'prod' });

    expect(d.legalSource.juridischeRegels).toHaveLength(2);
    const regelA = d.legalSource.juridischeRegels.find((r) => r.identificatie === 'regelA');
    const regelB = d.legalSource.juridischeRegels.find((r) => r.identificatie === 'regelB');
    expect(regelA?.kwalificatie).toBeNull();
    expect(regelA?.idealisatie).toBeNull();
    expect(regelA?.wId).toBeNull();
    expect(regelA?.locaties).toEqual([]);
    expect(regelB?.locaties).toEqual([{ identificatie: 'unresolvable-locatie', naam: null }]);
  });

  test('a document component response with no inhoud yields a null articleText', async () => {
    ozon.getDocumentComponent.mockResolvedValue({ _embedded: { documentComponenten: [] } });

    const d = await buildDossier({ urn: URN, env: 'prod' });

    const withWId = d.legalSource.juridischeRegels.filter((r) => r.wId);
    expect(withWId.length).toBeGreaterThan(0);
    expect(withWId.every((r) => r.articleText === null)).toBe(true);
  });

  test('a toepasbare-regels lookup with no results yields no rule set for that rbo, not a crash', async () => {
    dso.getToepasbareRegels.mockResolvedValue({ _embedded: { toepasbareRegels: [] } });

    const d = await buildDossier({ urn: URN, env: 'prod' });

    expect(d.decisionCriteria).toBeNull();
    expect(d.submissionRequirements).toBeNull();
  });

  test('a toepasbare regel with no sttrVersie or begindatum defaults both to null', async () => {
    dso.getToepasbareRegels.mockResolvedValue({
      _embedded: { toepasbareRegels: [{ identifier: 114233 }] },
    });

    const d = await buildDossier({ urn: URN, env: 'prod' });

    expect(d.decisionCriteria?.sttrVersie).toBeNull();
    expect(d.decisionCriteria?.begindatum).toBeNull();
  });
});
