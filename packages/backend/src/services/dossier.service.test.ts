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

  // Item 5: with ten concurrent legs, a bare {step, detail} does not say
  // WHICH wId's article fetch failed. The annotaties leg already carries a
  // candidate identity; this pins the same treatment for documentComponent.
  test('a failing article fetch identifies the wId that failed', async () => {
    const failingWId =
      'gm0995_5e613b8efac0433cb977d3445e057208__chp_15__subchp_15.4__art_15.2__para_5';
    ozon.getDocumentComponent.mockImplementation((_regelingId: string, wId: string) => {
      if (wId === failingWId) return Promise.reject(new Error('DSO responded 500: boom'));
      return Promise.resolve({
        _embedded: {
          documentComponenten: [{ inhoud: `<Inhoud><Al>TEXT FOR ${wId}</Al></Inhoud>` }],
        },
      });
    });

    const d = await buildDossier({ urn: URN, env: 'prod' });

    const failure = d.provenance.failures.find((f) => f.step === 'documentComponent');
    expect(failure?.detail).toBe(`DSO responded 500: boom (${failingWId})`);
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
      detail: 'Ozon responded 500: annotaties down (/akn/nl/act/gm0995/2020/omgevingsplan)',
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

  // Item 5: the dmn leg now names the rule identifier it was extracting for
  // — both rule sets fail here (dso.getSttrBestand is rejected for every
  // call), and their identifiers (114233, 105947) are distinct, so a
  // regression to the old bare {step, detail} would collapse them into two
  // indistinguishable entries.
  test('a failing DMN extraction records the reason, identifying the rule, but still returns the rule set', async () => {
    dso.getSttrBestand.mockRejectedValue(new Error('DSO responded 404: STTR not found'));

    const d = await buildDossier({ urn: URN, env: 'prod' });

    expect(d.decisionCriteria?.identifier).toBe(114233);
    expect(d.decisionCriteria?.dmn).toBeNull();
    expect(d.provenance.failures).toContainEqual({
      step: 'dmn',
      detail: 'DSO responded 404: STTR not found (114233)',
    });
    expect(d.provenance.failures).toContainEqual({
      step: 'dmn',
      detail: 'DSO responded 404: STTR not found (105947)',
    });
  });

  test('a rejected toepasbare-regels lookup records the reason, identifying the functioneleStructuurRef, and omits that rule set', async () => {
    dso.getToepasbareRegels.mockRejectedValue(
      new Error('DSO responded 502: toepasbare regels down')
    );

    const d = await buildDossier({ urn: URN, env: 'prod' });

    expect(d.decisionCriteria).toBeNull();
    expect(d.submissionRequirements).toBeNull();
    const failures = d.provenance.failures.filter((f) => f.step === 'toepasbareRegels');
    expect(failures).toHaveLength(2);
    expect(
      failures.some((f) =>
        f.detail.includes(
          'http://toepasbare-regels.omgevingswet.overheid.nl/x/id/concept/Conclusie' + URN
        )
      )
    ).toBe(true);
    expect(
      failures.some((f) =>
        f.detail.includes(
          'http://toepasbare-regels.omgevingswet.overheid.nl/x/id/concept/IndieningsvereistenVergunning' +
            URN
        )
      )
    ).toBe(true);
  });

  test('no regeling of type 003 marks the legal source unavailable', async () => {
    ozon.zoekRegelingen.mockResolvedValue({ _embedded: { regelingen: [] } });

    const d = await buildDossier({ urn: URN, env: 'prod' });

    expect(d.legalSource.available).toBe(false);
    expect(d.provenance.failures.some((f) => f.step === 'regeling')).toBe(true);
  });

  // Item 1: the un-paged search only ever read page 1 (size: 100), so the
  // preferred-type regeling falls off the end for an authority publishing
  // more than a page's worth. Here it only shows up on page 2.
  test('pages through the regelingen search when the omgevingsplan is not on page 1', async () => {
    ozon.zoekRegelingen.mockImplementation(
      (_body: unknown, _env: unknown, opts: { page?: number }) => {
        if ((opts?.page ?? 1) === 1) {
          return Promise.resolve({
            _embedded: {
              regelingen: [
                { identificatie: 'decoy', type: { code: '/join/id/stop/regelingtype_006' } },
              ],
            },
            page: { number: 1, size: 1, totalElements: 2, totalPages: 2 },
          });
        }
        return Promise.resolve({
          _embedded: {
            regelingen: [
              {
                identificatie: '/akn/nl/act/gm0995/2020/omgevingsplan',
                type: { code: '/join/id/stop/regelingtype_003' },
                officieleTitel: 'Omgevingsplan gemeente Lelystad',
              },
            ],
          },
          page: { number: 2, size: 1, totalElements: 2, totalPages: 2 },
        });
      }
    );

    const d = await buildDossier({ urn: URN, env: 'prod' });

    expect(ozon.zoekRegelingen).toHaveBeenCalledTimes(2);
    expect(ozon.zoekRegelingen).toHaveBeenNthCalledWith(1, { bevoegdGezag: ['gm0995'] }, 'prod', {
      size: 100,
    });
    expect(ozon.zoekRegelingen).toHaveBeenNthCalledWith(2, { bevoegdGezag: ['gm0995'] }, 'prod', {
      size: 100,
      page: 2,
    });
    expect(d.provenance.regelingIdentificatie).toBe('/akn/nl/act/gm0995/2020/omgevingsplan');
    expect(d.legalSource.available).toBe(true);
  });

  // A single page of results (the common case) must not trigger any extra
  // fetch beyond page 1.
  test('does not fetch a second page when the first page says there is only one', async () => {
    ozon.zoekRegelingen.mockResolvedValue({
      _embedded: {
        regelingen: [
          {
            identificatie: '/akn/nl/act/gm0995/2020/omgevingsplan',
            type: { code: '/join/id/stop/regelingtype_003' },
          },
        ],
      },
      page: { number: 1, size: 1, totalElements: 1, totalPages: 1 },
    });

    await buildDossier({ urn: URN, env: 'prod' });

    expect(ozon.zoekRegelingen).toHaveBeenCalledTimes(1);
  });

  // Item 1: caps the regelingen search pagination and, when nothing of the
  // preferred type was found within the cap, records that the search was
  // truncated rather than reporting a plain "not found" — a truncated
  // search is never silently reported as evidence the instrument is absent.
  test('caps the regelingen search at the page limit and records a truncated search', async () => {
    ozon.zoekRegelingen.mockImplementation(
      (_body: unknown, _env: unknown, opts: { page?: number }) => {
        const page = opts?.page ?? 1;
        return Promise.resolve({
          _embedded: {
            regelingen: [
              { identificatie: `decoy-${page}`, type: { code: '/join/id/stop/regelingtype_006' } },
            ],
          },
          page: { number: page, size: 1, totalElements: 15, totalPages: 15 },
        });
      }
    );

    const d = await buildDossier({ urn: URN, env: 'prod' });

    expect(ozon.zoekRegelingen).toHaveBeenCalledTimes(10);
    expect(d.legalSource.available).toBe(false);
    const failure = d.provenance.failures.find((f) => f.step === 'regeling');
    expect(failure?.detail).toContain('truncated');
  });

  test('a national activity with no authority parameter returns a dossier, not a rejection', async () => {
    dso.getActiviteit.mockResolvedValue({
      ...activiteit,
      urn: 'nl.imow-mnre1034.activiteit.RijksmonArchMonument',
      bestuursorgaan: {
        oin: '00000001003214345000',
        organisatieType: 'MNRE',
        organisatieCode: '1034',
      },
    });
    // The default `ozon.zoekRegelingen` mock only carries regelingtype_006 and
    // _010 candidates for gm0995 — none of type _001 (AMvB), which is what a
    // rijk authority is searched for. So this activity's rule sets still
    // resolve (they come straight off the RTR's own regelBeheerObjecten,
    // independent of the legal source), while the legal source itself is
    // unavailable with a recorded reason — the known, correct outcome for
    // RijksmonArchMonument.

    const d = await buildDossier({
      urn: 'nl.imow-mnre1034.activiteit.RijksmonArchMonument',
      env: 'prod',
    });

    expect(d.decisionCriteria?.identifier).toBe(114233);
    expect(d.submissionRequirements?.identifier).toBe(105947);
    expect(d.legalSource.available).toBe(false);
    expect(d.provenance.failures.some((f) => f.step === 'regeling')).toBe(true);
  });

  test.each([
    ['gemeente', 'GM', '0995', '/join/id/stop/regelingtype_003'],
    ['provincie', 'PV', '24', '/join/id/stop/regelingtype_004'],
    ['waterschap', 'WS', '0501', '/join/id/stop/regelingtype_005'],
    ['rijk', 'MNRE', '1034', '/join/id/stop/regelingtype_001'],
  ])(
    "selects the %s regeling type (%s%s -> %s) for its own level, not another level's",
    async (level, organisatieType, organisatieCode, expectedType) => {
      dso.getActiviteit.mockResolvedValue({
        ...activiteit,
        bestuursorgaan: { organisatieType, organisatieCode },
      });
      ozon.zoekRegelingen.mockResolvedValue({
        _embedded: {
          regelingen: [
            // A decoy of a type no bestuurslaag in the mapping uses — a
            // regression to "just take the first regeling" must fail this.
            { identificatie: 'decoy', type: { code: '/join/id/stop/regelingtype_999' } },
            {
              identificatie: `correct-${level}`,
              type: { code: expectedType },
              officieleTitel: `Correct for ${level}`,
            },
          ],
        },
      });

      const d = await buildDossier({ urn: URN, env: 'prod' });

      expect(d.provenance.regelingIdentificatie).toBe(`correct-${level}`);
      expect(d.legalSource.regelingTitel).toBe(`Correct for ${level}`);
    }
  );

  // A1: every case above builds `bestuursorgaan` WITHOUT a `bestuurslaag`
  // field, so they only ever exercise the `bestuurslaagFromCode` fallback.
  // In production `bestuursorgaan.bestuurslaag` IS present (verified live),
  // so THIS is the branch that actually runs. These two cases cover the
  // native field driving the choice — one where it disagrees with what the
  // code prefix would give, which is the one that fails if the two
  // branches are ever swapped or `??` becomes `||`.
  test('bestuursorgaan.bestuurslaag drives the level even when it disagrees with the code prefix', async () => {
    dso.getActiviteit.mockResolvedValue({
      ...activiteit,
      bestuursorgaan: { organisatieType: 'GM', organisatieCode: '0995', bestuurslaag: 'provincie' },
    });
    ozon.zoekRegelingen.mockResolvedValue({
      _embedded: {
        regelingen: [
          {
            identificatie: 'provincie-verordening',
            type: { code: '/join/id/stop/regelingtype_004' }, // provincie, not gemeente
            officieleTitel: 'Provincie via bestuurslaag',
          },
        ],
      },
    });

    const d = await buildDossier({ urn: URN, env: 'prod' });

    expect(d.provenance.regelingIdentificatie).toBe('provincie-verordening');
    expect(d.legalSource.regelingTitel).toBe('Provincie via bestuurslaag');
  });

  test('bestuursorgaan.bestuurslaag resolves the level even when the code prefix cannot', async () => {
    dso.getActiviteit.mockResolvedValue({
      ...activiteit,
      bestuursorgaan: { organisatieType: 'XX', organisatieCode: '123', bestuurslaag: 'waterschap' },
    });
    ozon.zoekRegelingen.mockResolvedValue({
      _embedded: {
        regelingen: [
          {
            identificatie: 'waterschap-verordening',
            type: { code: '/join/id/stop/regelingtype_005' },
            officieleTitel: 'Waterschap via bestuurslaag',
          },
        ],
      },
    });

    const d = await buildDossier({ urn: URN, env: 'prod' });

    expect(d.legalSource.available).toBe(true);
    expect(d.provenance.regelingIdentificatie).toBe('waterschap-verordening');
  });

  // D1: an unexpected bestuurslaag value (wrong casing here) must not be
  // trusted via the bare `as Bestuurslaag` cast — it must fall back to the
  // code-derived level instead of flowing through and producing a
  // "no regeling of type undefined" failure.
  test('a junk bestuurslaag value falls back to the code-derived level rather than being trusted', async () => {
    dso.getActiviteit.mockResolvedValue({
      ...activiteit,
      bestuursorgaan: { organisatieType: 'GM', organisatieCode: '0995', bestuurslaag: 'Gemeente' },
    });

    const d = await buildDossier({ urn: URN, env: 'prod' });

    expect(d.legalSource.available).toBe(true);
    expect(d.provenance.regelingIdentificatie).toBe('/akn/nl/act/gm0995/2020/omgevingsplan');
  });

  // C1: the degrade path — bestuurslaag cannot be determined at all (no
  // native field, and a code prefix outside gm/pv/ws/mnre) — must record a
  // failure and still return a dossier, never throw or default to gemeente.
  test('an activity whose bestuurslaag cannot be determined at all degrades to an unavailable legal source with a named reason', async () => {
    dso.getActiviteit.mockResolvedValue({
      ...activiteit,
      bestuursorgaan: { organisatieType: 'XX', organisatieCode: '123' },
    });

    const d = await buildDossier({ urn: URN, env: 'prod' });

    expect(d.legalSource.available).toBe(false);
    expect(d.provenance.failures).toContainEqual({
      step: 'regeling',
      detail: 'Could not determine the bestuurslaag for xx123',
    });
    expect(d.urn).toBe(URN);
  });

  // B1: the mixed-failure path — one candidate's annotations fetch throws,
  // another is actually fetched and found not to match. The two must stay
  // distinct in provenance, and the summary must never claim the errored
  // candidate was checked.
  test('a mixed candidate path keeps an errored candidate distinct from one actually checked and not matching', async () => {
    const urn = 'nl.imow-mnre1034.activiteit.RijksmonArchMonument';
    dso.getActiviteit.mockResolvedValue({
      ...activiteit,
      urn,
      bestuursorgaan: { organisatieType: 'MNRE', organisatieCode: '1034' },
    });
    ozon.zoekRegelingen.mockResolvedValue({
      _embedded: {
        regelingen: [
          { identificatie: 'errors-out', type: { code: '/join/id/stop/regelingtype_001' } },
          { identificatie: 'checked-no-match', type: { code: '/join/id/stop/regelingtype_001' } },
        ],
      },
    });
    ozon.getRegeltekstAnnotaties.mockImplementation((id: string) => {
      if (id === 'errors-out') return Promise.reject(new Error('DSO responded 500: boom'));
      return Promise.resolve({
        activiteiten: [],
        regelteksten: [],
        locaties: [],
        regelsVoorIedereen: [],
      });
    });

    const d = await buildDossier({ urn, env: 'prod' });

    expect(d.legalSource.available).toBe(false);

    const annotatiesFailure = d.provenance.failures.find(
      (f) => f.step === 'annotaties' && f.detail.includes('errors-out')
    );
    expect(annotatiesFailure?.detail).toBe('DSO responded 500: boom (errors-out)');

    const summary = d.provenance.failures.find((f) => f.step === 'regeling');
    expect(summary?.detail).toContain('could not be fetched');
    expect(summary?.detail).toContain('errors-out');
    expect(summary?.detail).toMatch(/checked and do not annotate.*checked-no-match/);
    // The overclaim this guards against: asserting the errored candidate
    // was checked and found not to annotate the activity.
    expect(summary?.detail).not.toMatch(/checked and do not annotate[^;]*errors-out/);
  });

  test('with several candidates of the preferred type, uses the first whose annotations actually name the activity', async () => {
    const urn = 'nl.imow-mnre1034.activiteit.RijksmonArchMonument';
    dso.getActiviteit.mockResolvedValue({
      ...activiteit,
      urn,
      bestuursorgaan: { organisatieType: 'MNRE', organisatieCode: '1034' },
    });
    ozon.zoekRegelingen.mockResolvedValue({
      _embedded: {
        regelingen: [
          {
            identificatie: '/akn/nl/act/mnre1034/2020/regOW01',
            type: { code: '/join/id/stop/regelingtype_001' },
            officieleTitel: 'Omgevingswet',
          },
          {
            identificatie: '/akn/nl/act/mnre1034/2021/OOWATRXX1',
            type: { code: '/join/id/stop/regelingtype_001' },
            officieleTitel: 'Aansluitdocument Rijk',
          },
        ],
      },
    });
    const empty = { activiteiten: [], regelteksten: [], locaties: [], regelsVoorIedereen: [] };
    const withHit = {
      ...empty,
      regelsVoorIedereen: [
        {
          identificatie: 'r1',
          regeltekstRef: 'rt1',
          activiteitLocatieaanduidingen: [{ identificatie: 'a1', activiteitRef: urn }],
        },
      ],
    };
    ozon.getRegeltekstAnnotaties.mockImplementation((id: string) =>
      Promise.resolve(id === '/akn/nl/act/mnre1034/2021/OOWATRXX1' ? withHit : empty)
    );

    const d = await buildDossier({ urn, env: 'prod' });

    expect(d.provenance.regelingIdentificatie).toBe('/akn/nl/act/mnre1034/2021/OOWATRXX1');
    expect(d.legalSource.available).toBe(true);
    expect(ozon.getRegeltekstAnnotaties).toHaveBeenNthCalledWith(
      1,
      '/akn/nl/act/mnre1034/2020/regOW01',
      'prod',
      expect.anything()
    );
    expect(ozon.getRegeltekstAnnotaties).toHaveBeenNthCalledWith(
      2,
      '/akn/nl/act/mnre1034/2021/OOWATRXX1',
      'prod',
      expect.anything()
    );
  });

  test('caps regeling attempts at 3 and records what was tried when none annotate the activity', async () => {
    const urn = 'nl.imow-mnre1034.activiteit.RijksmonArchMonument';
    dso.getActiviteit.mockResolvedValue({
      ...activiteit,
      urn,
      bestuursorgaan: { organisatieType: 'MNRE', organisatieCode: '1034' },
    });
    ozon.zoekRegelingen.mockResolvedValue({
      _embedded: {
        regelingen: ['c1', 'c2', 'c3', 'c4'].map((id) => ({
          identificatie: id,
          type: { code: '/join/id/stop/regelingtype_001' },
        })),
      },
    });
    ozon.getRegeltekstAnnotaties.mockResolvedValue({
      activiteiten: [],
      regelteksten: [],
      locaties: [],
      regelsVoorIedereen: [],
    });

    const d = await buildDossier({ urn, env: 'prod' });

    expect(ozon.getRegeltekstAnnotaties).toHaveBeenCalledTimes(3);
    expect(d.legalSource.available).toBe(false);
    const failure = d.provenance.failures.find((f) => f.step === 'regeling');
    expect(failure?.detail).toContain('c1');
    expect(failure?.detail).toContain('c2');
    expect(failure?.detail).toContain('c3');
    expect(failure?.detail).not.toContain('c4');
  });

  test('an explicit authority overrides the derived level, not just the code', async () => {
    // The activity itself is a gemeente activity (URN's own bestuursorgaan),
    // but the caller names a rijk authority explicitly — the AMvB type must
    // be searched for, not gemeente's omgevingsplan type.
    ozon.zoekRegelingen.mockResolvedValue({
      _embedded: {
        regelingen: [
          {
            identificatie: 'amvb-x',
            type: { code: '/join/id/stop/regelingtype_001' },
            officieleTitel: 'AMvB X',
          },
        ],
      },
    });

    const d = await buildDossier({ urn: URN, env: 'prod', authority: 'mnre1034' });

    expect(ozon.zoekRegelingen).toHaveBeenCalledWith(
      { bevoegdGezag: ['mnre1034'] },
      'prod',
      expect.anything()
    );
    expect(d.provenance.regelingIdentificatie).toBe('amvb-x');
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

  // Item 3: getToepasbareRegels previously took no date at all, so a dossier
  // requested for a past `datum` still got the CURRENT executable rules
  // alongside a historical legal source. The wire format is dd-MM-yyyy,
  // unconverted — unlike Ozon's geldigOp above, this is an RTR-side call.
  test('threads the dossier datum through to getToepasbareRegels, unconverted', async () => {
    await buildDossier({ urn: URN, env: 'prod', datum: '22-09-2026' });

    expect(dso.getToepasbareRegels).toHaveBeenCalledWith(expect.any(String), 'prod', '22-09-2026');
  });

  test('calls getToepasbareRegels with datum undefined when the dossier itself has none', async () => {
    await buildDossier({ urn: URN, env: 'prod' });

    expect(dso.getToepasbareRegels).toHaveBeenCalledWith(expect.any(String), 'prod', undefined);
  });

  // Item 3: reading [0] relied on upstream ordering that is not guaranteed.
  // Two candidates come back for the same functioneleStructuurRef (rule
  // history overlap); the one with the more recent begindatum must win,
  // regardless of which position the upstream lists it in.
  test('picks the toepasbare regel with the most recent begindatum when more than one comes back', async () => {
    dso.getToepasbareRegels.mockResolvedValue({
      _embedded: {
        toepasbareRegels: [
          { identifier: 1, begindatum: '01-01-2024' },
          { identifier: 2, begindatum: '15-06-2026' },
          { identifier: 3, begindatum: '30-07-2025' },
        ],
      },
    });

    const d = await buildDossier({ urn: URN, env: 'prod' });

    expect(d.decisionCriteria?.identifier).toBe(2);
    expect(d.submissionRequirements?.identifier).toBe(2);
  });

  test('a tie on begindatum (or none at all) picks whichever the upstream listed first', async () => {
    dso.getToepasbareRegels.mockResolvedValue({
      _embedded: {
        toepasbareRegels: [{ identifier: 42 }, { identifier: 99 }],
      },
    });

    const d = await buildDossier({ urn: URN, env: 'prod' });

    expect(d.decisionCriteria?.identifier).toBe(42);
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

describe('buildDossier — childActivityUrns', () => {
  // Step 1's RTR response already carries `_links.onderliggendeActiviteiten`
  // (see the `ACTIVITEIT_DETAIL` fixture in dso.routes.test.ts for the same
  // href shape) — this must cost no additional upstream call.
  test('carries the child activity URNs, in RTR order, from _links.onderliggendeActiviteiten', async () => {
    dso.getActiviteit.mockResolvedValue({
      ...activiteit,
      urn: 'nl.imow-mnre1034.activiteit.Rijksmonumentenactiviteit',
      _links: {
        onderliggendeActiviteiten: [
          {
            href: '/activiteiten/nl.imow-mnre1034.activiteit.RijksmonArchMonument?datum=01-01-2026',
          },
          { href: '/activiteiten/nl.imow-mnre1034.activiteit.RijkmonMonument?datum=01-01-2026' },
        ],
      },
    });

    const d = await buildDossier({
      urn: 'nl.imow-mnre1034.activiteit.Rijksmonumentenactiviteit',
      env: 'prod',
    });

    expect(d.childActivityUrns).toEqual([
      'nl.imow-mnre1034.activiteit.RijksmonArchMonument',
      'nl.imow-mnre1034.activiteit.RijkmonMonument',
    ]);
    // Zero extra fan-out: only the fixed set of upstream calls the dossier
    // already makes, nothing keyed off a child URN.
    expect(dso.getActiviteit).toHaveBeenCalledTimes(1);
  });

  test('an activity with no children carries an empty array', async () => {
    dso.getActiviteit.mockResolvedValue({ ...activiteit, _links: undefined });

    const d = await buildDossier({ urn: URN, env: 'prod' });

    expect(d.childActivityUrns).toEqual([]);
  });

  test.each([
    ['no _links at all', undefined],
    ['_links present but no onderliggendeActiviteiten key', {}],
    ['onderliggendeActiviteiten is not an array', { onderliggendeActiviteiten: 'not-an-array' }],
    ['an entry with no href', { onderliggendeActiviteiten: [{}] }],
    [
      'an entry whose href does not match the activiteiten path shape',
      { onderliggendeActiviteiten: [{ href: '/not-an-activiteiten-path' }] },
    ],
  ])('degrades to an empty array rather than throwing: %s', async (_label, links) => {
    dso.getActiviteit.mockResolvedValue({ ...activiteit, _links: links });

    const d = await buildDossier({ urn: URN, env: 'prod' });

    expect(d.childActivityUrns).toEqual([]);
  });
});
