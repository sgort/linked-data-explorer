// @vitest-environment jsdom
//
// Fixtures are built from the two reference dossiers in
// design_handoff_dso_quality_profile/reference/ — that folder is scratch
// input for the handoff and is never committed, so the figures are inlined
// here rather than read from it at runtime.

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';

const getActiviteitDossier = vi.fn();

vi.mock('../../services/dsoService', async () => {
  const actual = await vi.importActual<typeof import('../../services/dsoService')>(
    '../../services/dsoService'
  );
  return {
    ...actual,
    getActiviteitDossier: (...args: unknown[]) => getActiviteitDossier(...args),
  };
});

import type {
  DecisionNamingItem,
  DsoDossier,
  InputNamingItem,
  JuridischeRegelEntry,
} from '../../services/dsoService';
import QualityProfileTab, { QualityProfileTabProps } from './QualityProfileTab';

afterEach(() => {
  vi.restoreAllMocks();
  getActiviteitDossier.mockReset();
});

// ─── Fixture builders ────────────────────────────────────────────────────────

function sem(name: string): DecisionNamingItem {
  return { name, class: 'semantic' };
}
function dang(name: string): DecisionNamingItem {
  return { name, class: 'opaque-dangling' };
}
function semIn(name: string, question: string | null): InputNamingItem {
  return { name, class: 'semantic', question };
}
function resIn(name: string, question: string | null): InputNamingItem {
  return { name, class: 'opaque-resolvable', question };
}
function dangIn(name: string, question: string | null): InputNamingItem {
  return { name, class: 'opaque-dangling', question };
}

const GM0995_URN = 'nl.imow-gm0995.activiteit.HoutopstandVellen';
const GM1708_URN = 'nl.imow-gm1708.activiteit.HoutopstandVellen';

const gm0995ConclusieDecisions: DecisionNamingItem[] = [
  sem('Boom kappen of houtopstand vellen'),
  sem('Boom kappen of houtopstand vellen_Niet van toepassing_cross'),
  sem('Boom kappen of houtopstand vellen_Vergunningplicht_cross'),
  dang('_6d45be8c-8010-4d11-8775-487a28b88087_Niet van toepassing'),
  dang('_2bc68e71-981f-4476-aaaf-f10980dab348_Vergunningplicht'),
  dang('_45d6b9e0-518b-4bcc-b39a-b50cc3251539_Vergunningplicht'),
  dang('_8f6e3ddc-bba0-4b6c-bb24-6614f061332c_Vergunningplicht'),
];

const gm0995ConclusieInputs: InputNamingItem[] = [
  resIn('uitv__4483fe58-57b7-4e71-bf19-15783f0f9d92', 'Wilt u een boom of beplanting weghalen?'),
  resIn(
    'uitv__864933e7-4ea9-45a2-ae17-d8b1a4df34d7',
    'Gaat het om een aangewezen bijzondere boom of plant?'
  ),
  resIn(
    'uitv__7b6ed60e-184f-4d93-a186-828dc9182890',
    'Gaat het om een boom of houtopstand binnen de bebouwingscontour houtkap?'
  ),
  resIn(
    'uitv__648edf88-a9ce-4726-b043-a3e18fa434c5',
    'Staat de boom of beplanting op een kavel van maximaal 5.000 vierkante meter?'
  ),
  resIn(
    'uitv__8155d4e0-7003-44ca-8f42-c97afa52f0c7',
    'Staat de boom of beplanting op een (particulier) privé terrein?'
  ),
];

const gm0995IndDecisions: DecisionNamingItem[] = [
  sem('Indieningsvereisten Vergunning Boom kappen of houtopstand vellen'),
  dang('_5acd1773-b81c-436f-a91e-d37546ad5e24'),
  dang('_5acd1773-b81c-436f-a91e-d37546ad5e24_anders_cross_0'),
  dang('_625483ff-2dfd-4e63-8c52-2773cf169211'),
  dang('_625483ff-2dfd-4e63-8c52-2773cf169211_in'),
  dang('_06480753-bdb0-4d23-8fd7-8941fad930f2'),
  dang('_06480753-bdb0-4d23-8fd7-8941fad930f2_in'),
  dang('_c1720883-89cf-47e5-97f0-36ef4d5fab05'),
  dang('_c1720883-89cf-47e5-97f0-36ef4d5fab05_in'),
  dang('_2ebda717-baaf-4b56-8cc8-e8761d7ab632'),
  dang('_2ebda717-baaf-4b56-8cc8-e8761d7ab632_in'),
  dang('_94af6398-3d9e-450b-bb64-12b1728fee00'),
  dang('_94af6398-3d9e-450b-bb64-12b1728fee00_nee_cross_0'),
  dang('_5f545924-6269-4f1b-b4e7-26c457e7fd31'),
  dang('_5f545924-6269-4f1b-b4e7-26c457e7fd31_ja_cross_0'),
  dang('_9d5e992e-4e3f-429b-930c-0e9d69e997de'),
  dang('_9d5e992e-4e3f-429b-930c-0e9d69e997de_in'),
  dang('_acbdb84c-54b5-4bd9-98b4-bf7e676bf3d4'),
  dang('_acbdb84c-54b5-4bd9-98b4-bf7e676bf3d4_in'),
  dang('_82778bb0-6319-4d43-985e-d3d4c4ea2958'),
  dang('_82778bb0-6319-4d43-985e-d3d4c4ea2958_in'),
];

const gm0995IndInputs: InputNamingItem[] = [
  resIn('uitv__5acd1773-b81c-436f-a91e-d37546ad5e24', 'Wat wilt u gaan doen?'),
  resIn('uitv__625483ff-2dfd-4e63-8c52-2773cf169211', 'Beschrijf  wat u wilt gaan doen.'),
  resIn(
    'uitv__06480753-bdb0-4d23-8fd7-8941fad930f2',
    'Waarom wilt u de houtopstand onderhouden of weghalen?'
  ),
  resIn('uitv__c1720883-89cf-47e5-97f0-36ef4d5fab05', 'Om hoeveel bomen gaat het?'),
  resIn('uitv__2ebda717-baaf-4b56-8cc8-e8761d7ab632', 'Beschrijf om welke soort(en) het gaat.'),
  resIn(
    'uitv__94af6398-3d9e-450b-bb64-12b1728fee00',
    'Bent u de eigenaar van de boom of houtopstand?'
  ),
  resIn(
    'uitv__5f545924-6269-4f1b-b4e7-26c457e7fd31',
    'Stemt de eigenaar van de boom in met de kap?'
  ),
  dangIn('uitv__9d5e992e-4e3f-429b-930c-0e9d69e997de', null),
  dangIn('uitv__acbdb84c-54b5-4bd9-98b4-bf7e676bf3d4', null),
  dangIn('uitv__82778bb0-6319-4d43-985e-d3d4c4ea2958', null),
];

const gm0995Rules: JuridischeRegelEntry[] = [
  {
    identificatie: 'r1',
    kwalificatie: 'vergunningplicht',
    idealisatie: null,
    regeltekstRef: 'rt1',
    wId: 'gm0995_db881f056d804d4c9755699044d47aee__chp_15__subchp_15.4__art_15.5',
    locaties: [{ identificatie: 'l1', naam: 'Ambtsgebied Gemeente Lelystad' }],
    articleText:
      'Een omgevingsvergunning wordt alleen verleend als er geen onevenredige afbreuk wordt gedaan aan de natuurwaarde van de houtopstand.',
  },
  {
    identificatie: 'r2',
    kwalificatie: 'anders geduid',
    idealisatie: null,
    regeltekstRef: 'rt2',
    wId: 'gm0995_f925519614564fb2ad7d126edc6167b3__chp_15__subchp_15.1__subsec_15.1.3__art_15.10',
    locaties: [
      { identificatie: 'l2a', naam: 'bebouwingscontour' },
      { identificatie: 'l2b', naam: 'houtkap' },
    ],
    articleText:
      'Er is een bebouwingscontour houtkap, bestaande uit de locatie bebouwingscontour, houtkap.',
  },
  {
    identificatie: 'r3',
    kwalificatie: 'vergunningplicht',
    idealisatie: null,
    regeltekstRef: 'rt3',
    wId: 'gm0995_d4a634c07f6f400aa04e77509126d678__chp_15__subchp_15.4__art_15.2__para_2',
    locaties: [{ identificatie: 'l1', naam: 'Ambtsgebied Gemeente Lelystad' }],
    articleText:
      'Het verbod in het eerste lid, onder b, is niet van toepassing op kavels van ten hoogste 5.000 m2.',
  },
  {
    identificatie: 'r4',
    kwalificatie: 'vergunningplicht',
    idealisatie: null,
    regeltekstRef: 'rt4',
    wId: 'gm0995_b49d3eda196b498591c40c575644b831__chp_15__subchp_15.4__art_15.6',
    locaties: [{ identificatie: 'l1', naam: 'Ambtsgebied Gemeente Lelystad' }],
    articleText: 'Een vergunningvoorschrift kan aan een omgevingsvergunning worden verbonden.',
  },
  {
    identificatie: 'r5',
    kwalificatie: 'anders geduid',
    idealisatie: null,
    regeltekstRef: 'rt5',
    wId: 'gm0995_1-0__chp_22__subchp_22.5__subsec_22.5.2__subsec_22.5.2.4__art_22.299__para_2',
    locaties: [{ identificatie: 'l1', naam: 'Ambtsgebied Gemeente Lelystad' }],
    articleText: 'Per genummerde houtopstand worden de volgende gegevens en bescheiden verstrekt.',
  },
  {
    identificatie: 'r6',
    kwalificatie: 'vergunningplicht',
    idealisatie: null,
    regeltekstRef: 'rt6',
    wId: 'gm0995_5e613b8efac0433cb977d3445e057208__chp_15__subchp_15.4__art_15.2__para_5',
    locaties: [{ identificatie: 'l1', naam: 'Ambtsgebied Gemeente Lelystad' }],
    articleText:
      'Het is verboden zonder omgevingsvergunning bomen te kappen of houtopstanden te vellen.',
  },
  {
    identificatie: 'r7',
    kwalificatie: 'anders geduid',
    idealisatie: null,
    regeltekstRef: 'rt7',
    wId: 'gm0995_1-0__chp_22__subchp_22.5__subsec_22.5.2__subsec_22.5.2.4__art_22.299__para_1',
    locaties: [{ identificatie: 'l1', naam: 'Ambtsgebied Gemeente Lelystad' }],
    articleText:
      'Bij een aanvraag om een omgevingsvergunning identificeert de aanvrager iedere houtopstand.',
  },
  {
    identificatie: 'r8',
    kwalificatie: 'anders geduid',
    idealisatie: null,
    regeltekstRef: 'rt8',
    wId: 'gm0995_9fa25368e58f4fa697db3c85572e3dbf__chp_15__subchp_15.4__art_15.3__para_1',
    locaties: [{ identificatie: 'l1', naam: 'Ambtsgebied Gemeente Lelystad' }],
    articleText:
      'De regels in deze afdeling gaan over het kappen van bomen en het vellen van houtopstanden.',
  },
  {
    identificatie: 'r9',
    kwalificatie: 'anders geduid',
    idealisatie: null,
    regeltekstRef: 'rt9',
    wId: 'gm0995_d7034ba59279448593d76d96f015599f__chp_15__subchp_15.4__art_15.3__para_2',
    locaties: [{ identificatie: 'l1', naam: 'Ambtsgebied Gemeente Lelystad' }],
    articleText:
      'Deze afdeling is niet van toepassing op het kappen van bomen waarvoor elders regels zijn gesteld.',
  },
  {
    identificatie: 'r10',
    kwalificatie: 'vergunningplicht',
    idealisatie: null,
    regeltekstRef: 'rt10',
    wId: 'gm0995_ae571aa1019b4484add0836cda95c717__chp_15__subchp_15.4__art_15.15',
    locaties: [{ identificatie: 'l1', naam: 'Ambtsgebied Gemeente Lelystad' }],
    articleText:
      'Bij een aanvraag voor een omgevingsvergunning worden de volgende gegevens verstrekt.',
  },
];

function gm0995Dossier(overrides: Partial<DsoDossier> = {}): DsoDossier {
  return {
    urn: GM0995_URN,
    omschrijving: 'Boom kappen of houtopstand vellen',
    bestuursorgaan: { code: 'gm0995', oin: '00000001005024249000' },
    legalSource: {
      available: true,
      regelingIdentificatie: 'reg-gm0995',
      regelingTitel: 'Omgevingsplan gemeente Lelystad',
      juridischeRegels: gm0995Rules,
    },
    annotation: {
      identificatie: 'ann-1',
      naam: null,
      groep: 'kapactiviteit',
      symboolcode: null,
      bovenliggendeActiviteitRef: null,
    },
    rtrLocaties: [],
    decisionCriteria: {
      typering: 'Conclusie',
      identifier: 114233,
      sttrVersie: 2,
      begindatum: '30-07-2026',
      toestemming: null,
      functioneleStructuurRef: 'fs-conclusie-gm0995',
      viewerUrl: 'https://example.test/conclusie',
      dmn: null,
    },
    submissionRequirements: {
      typering: 'Indieningsvereisten',
      identifier: 105947,
      sttrVersie: 1,
      begindatum: '12-12-2025',
      toestemming: 'Aanvraag vergunning',
      functioneleStructuurRef: 'fs-ind-gm0995',
      viewerUrl: 'https://example.test/indieningsvereisten',
      dmn: null,
    },
    provenance: {
      env: 'prod',
      datum: null,
      regelingIdentificatie: 'reg-gm0995',
      fetchedAt: '2026-09-22T21:03:31.478Z',
      failures: [],
    },
    qualityProfile: {
      urn: GM0995_URN,
      activityIdentity: 'semantic',
      legalTraceability: { rules: 10, withWId: 10, withArticleText: 10 },
      crossLayerConsistency: { sharedObjects: [] },
      ruleSets: {
        conclusie: {
          decisionNaming: { total: 7, semantic: 3, opaque: 4, items: gm0995ConclusieDecisions },
          inputNaming: { total: 5, semantic: 0, opaque: 5, items: gm0995ConclusieInputs },
          labelCoverage: { inputs: 5, withQuestion: 5 },
          refResolvability: { total: 1, resolved: 1, dangling: 0 },
        },
        indieningsvereisten: {
          decisionNaming: { total: 21, semantic: 1, opaque: 20, items: gm0995IndDecisions },
          inputNaming: { total: 10, semantic: 0, opaque: 10, items: gm0995IndInputs },
          labelCoverage: { inputs: 10, withQuestion: 7 },
          refResolvability: { total: 0, resolved: 0, dangling: 0 },
        },
      },
    },
    ...overrides,
  };
}

const gm1708ConclusieDecisions: DecisionNamingItem[] = [
  sem('Conclusie Boom kappen houtopstand vellen'),
  sem('toepassingsbereik kappen'),
  sem('dyn boom dunnen'),
  sem('dyn boom kappen'),
];

const gm1708ConclusieInputs: InputNamingItem[] = [
  semIn(
    'beschermd stads dorpgezicht',
    'Staat de boom in een rijksbeschermde stads- of dorpsgezicht?'
  ),
  semIn('handeling met boom', 'Wat gaat u doen met de boom?'),
  semIn('bebouwde kom', 'Staat de boom of struik binnen de bebouwde kom?'),
  semIn('erf tuin', 'Staat de boom op een erf of in een tuin?'),
  semIn(
    'omtrek boom dunnen',
    'U gaat een boom verwijderen om een groep bomen of struiken uit te dunnen. Is de omtrek van de boom die u gaat verwijderen kleiner dan 125 centimeter?'
  ),
  semIn('perceel groter 400', 'Is het perceel waar de boom op staat groter dan 400m2?'),
  semIn(
    'omtrek boom kappen',
    'U gaat een boom kappen. Is de omtrek van de boom groter dan 155 centimeter?'
  ),
  semIn(
    'situatie boom',
    'Staat de boom die u gaat kappen in een houtwal, houtsingel, laanbeplanting of bosperceel?'
  ),
];

const gm1708IndDecisions: DecisionNamingItem[] = [
  sem('Indieningsvereisten Vergunning - HoutopstandVellen'),
  sem('omschrijving van activiteit houtopstand vellen'),
];

const gm1708IndInputs: InputNamingItem[] = [
  semIn('BIJLAGEN - overige gegevens toetsing omgevingsplan UR', null),
  semIn('BIJLAGEN - situatietekening kappen houtopstanden UR', null),
  semIn('BIJLAGEN - gegevens houtopstanden UR', null),
  semIn('DIVERSE VRAGEN - aantal houtopstanden UR', 'Om hoeveel houtopstanden gaat het?'),
  semIn('DIVERSE VRAGEN - omschrijving activiteit houtopstand vellen UR', 'Wat wilt u gaan doen?'),
  semIn(
    'DIVERSE VRAGEN - omschrijving andere activiteit houtopstand vellen UR',
    'Wat wilt u gaan doen? Beschrijf dat hier.'
  ),
];

const gm1708Rules: JuridischeRegelEntry[] = [
  {
    identificatie: 's1',
    kwalificatie: 'anders geduid',
    idealisatie: null,
    regeltekstRef: 'srt1',
    wId: 'gm1708_35__chp_22__subchp_22.5__subsec_22.5.2__subsec_22.5.2.4__art_22.299__para_2',
    locaties: [{ identificatie: 'sl1', naam: 'gemeente Steenwijkerland' }],
    articleText: 'Per genummerde houtopstand worden de volgende gegevens en bescheiden verstrekt.',
  },
  {
    identificatie: 's2',
    kwalificatie: 'anders geduid',
    idealisatie: null,
    regeltekstRef: 'srt2',
    wId: 'gm1708_35__chp_22__subchp_22.5__subsec_22.5.2__subsec_22.5.2.4__art_22.299__para_1',
    locaties: [{ identificatie: 'sl1', naam: 'gemeente Steenwijkerland' }],
    articleText:
      'Bij een aanvraag om een omgevingsvergunning identificeert de aanvrager iedere houtopstand.',
  },
];

function gm1708Dossier(overrides: Partial<DsoDossier> = {}): DsoDossier {
  return {
    urn: GM1708_URN,
    omschrijving: 'Boom kappen of houtopstand vellen',
    bestuursorgaan: { code: 'gm1708', oin: '00000001809249066000' },
    legalSource: {
      available: true,
      regelingIdentificatie: 'reg-gm1708',
      regelingTitel: 'Omgevingsplan gemeente Steenwijkerland',
      juridischeRegels: gm1708Rules,
    },
    annotation: {
      identificatie: 'ann-2',
      naam: null,
      groep: 'kapactiviteit',
      symboolcode: null,
      bovenliggendeActiviteitRef: null,
    },
    rtrLocaties: [],
    decisionCriteria: {
      typering: 'Conclusie',
      identifier: 116244,
      sttrVersie: 2,
      begindatum: '08-09-2026',
      toestemming: null,
      functioneleStructuurRef: 'fs-conclusie-gm1708',
      viewerUrl: 'https://example.test/conclusie2',
      dmn: null,
    },
    submissionRequirements: {
      typering: 'Indieningsvereisten',
      identifier: 60566,
      sttrVersie: 1,
      begindatum: '01-01-2024',
      toestemming: 'Aanvraag vergunning',
      functioneleStructuurRef: 'fs-ind-gm1708',
      viewerUrl: 'https://example.test/indieningsvereisten2',
      dmn: null,
    },
    provenance: {
      env: 'prod',
      datum: null,
      regelingIdentificatie: 'reg-gm1708',
      fetchedAt: '2026-09-22T21:03:32.696Z',
      failures: [],
    },
    qualityProfile: {
      urn: GM1708_URN,
      activityIdentity: 'semantic',
      legalTraceability: { rules: 2, withWId: 2, withArticleText: 2 },
      crossLayerConsistency: { sharedObjects: [] },
      ruleSets: {
        conclusie: {
          decisionNaming: { total: 4, semantic: 4, opaque: 0, items: gm1708ConclusieDecisions },
          inputNaming: { total: 8, semantic: 8, opaque: 0, items: gm1708ConclusieInputs },
          labelCoverage: { inputs: 8, withQuestion: 8 },
          refResolvability: { total: 0, resolved: 0, dangling: 0 },
        },
        indieningsvereisten: {
          decisionNaming: { total: 2, semantic: 2, opaque: 0, items: gm1708IndDecisions },
          inputNaming: { total: 6, semantic: 6, opaque: 0, items: gm1708IndInputs },
          labelCoverage: { inputs: 6, withQuestion: 3 },
          refResolvability: { total: 0, resolved: 0, dangling: 0 },
        },
      },
    },
    ...overrides,
  };
}

function renderTab(props: Partial<QualityProfileTabProps> = {}, onGoToActivities = vi.fn()) {
  render(
    <QualityProfileTab
      selectedUrn={GM0995_URN}
      selectedDatum={undefined}
      authorityOin=""
      env="pre"
      onGoToActivities={onGoToActivities}
      {...props}
    />
  );
  return { onGoToActivities };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('QualityProfileTab — states', () => {
  test('no selection shows the empty state, and Go to Activities calls the callback', async () => {
    const { onGoToActivities } = renderTab({ selectedUrn: null });

    expect(screen.getByText('No activity selected')).toBeTruthy();
    expect(
      screen.getByText('Select an activity in the Activities tab — its quality profile opens here.')
    ).toBeTruthy();
    expect(getActiviteitDossier).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Go to Activities' }));
    expect(onGoToActivities).toHaveBeenCalled();
  });

  test('shows the loading state while the dossier call is pending', async () => {
    getActiviteitDossier.mockReturnValue(new Promise(() => {})); // never resolves
    renderTab();

    expect(await screen.findByText('Loading…')).toBeTruthy();
    expect(
      screen.getByText('Building dossier — legal source, annotation and rule sets…')
    ).toBeTruthy();
  });

  test('a 404 is rephrased the same way as the Activities detail panel', async () => {
    getActiviteitDossier.mockRejectedValue(new Error('HTTP 404'));
    renderTab({ env: 'pre' });

    expect(
      await screen.findByText(/not available in the pre-production DSO environment/)
    ).toBeTruthy();
  });

  test('a 404 names the production environment when env="prod"', async () => {
    getActiviteitDossier.mockRejectedValue(new Error('HTTP 404'));
    renderTab({ env: 'prod' });

    expect(await screen.findByText(/not available in the production DSO environment/)).toBeTruthy();
  });

  test('a non-404 error is shown verbatim', async () => {
    getActiviteitDossier.mockRejectedValue(new Error('gateway timeout'));
    renderTab();

    expect(await screen.findByText('gateway timeout')).toBeTruthy();
  });

  test('provenance.failures renders an amber "Incomplete legs" box', async () => {
    getActiviteitDossier.mockResolvedValue(
      gm0995Dossier({
        provenance: {
          env: 'prod',
          datum: null,
          regelingIdentificatie: 'reg-gm0995',
          fetchedAt: '2026-09-22T21:03:31.478Z',
          failures: [
            { step: 'regeling', detail: 'No regeling of type regelingtype_003 for gm0000' },
          ],
        },
      })
    );
    renderTab();

    expect(await screen.findByText('Incomplete legs')).toBeTruthy();
    expect(
      screen.getByText(/regeling: No regeling of type regelingtype_003 for gm0000/)
    ).toBeTruthy();
  });

  // A national (mnre) activity like RijksmonArchMonument no longer errors
  // for lacking an authority (the backend guard that threw was removed):
  // buildDossier now returns 200 with the rule sets fully resolved and
  // `legalSource.available: false`, plus a reason in `provenance.failures`.
  // The tab must render that as a normal dossier — rule sets and all — not
  // fall into the red error state, and the "no legal source" reason must
  // come from `provenance.failures` rather than a hardcoded, omgevingsplan-
  // specific message (wrong on both counts once other bestuurslagen and
  // non-error outcomes are possible).
  test('a dossier with legalSource.available: false and present rule sets renders the rule sets and the reason, not an error', async () => {
    getActiviteitDossier.mockResolvedValue(
      gm0995Dossier({
        urn: 'nl.imow-mnre1034.activiteit.RijksmonArchMonument',
        legalSource: {
          available: false,
          regelingIdentificatie: null,
          regelingTitel: null,
          juridischeRegels: [],
        },
        qualityProfile: {
          urn: 'nl.imow-mnre1034.activiteit.RijksmonArchMonument',
          activityIdentity: 'semantic',
          legalTraceability: { rules: 0, withWId: 0, withArticleText: 0 },
          crossLayerConsistency: { sharedObjects: [] },
          ruleSets: {
            conclusie: {
              decisionNaming: { total: 7, semantic: 3, opaque: 4, items: gm0995ConclusieDecisions },
              inputNaming: { total: 5, semantic: 0, opaque: 5, items: gm0995ConclusieInputs },
              labelCoverage: { inputs: 5, withQuestion: 5 },
              refResolvability: { total: 1, resolved: 1, dangling: 0 },
            },
            indieningsvereisten: {
              decisionNaming: { total: 21, semantic: 1, opaque: 20, items: gm0995IndDecisions },
              inputNaming: { total: 10, semantic: 0, opaque: 10, items: gm0995IndInputs },
              labelCoverage: { inputs: 10, withQuestion: 7 },
              refResolvability: { total: 0, resolved: 0, dangling: 0 },
            },
          },
        },
        provenance: {
          env: 'prod',
          datum: null,
          regelingIdentificatie: null,
          fetchedAt: '2026-09-23T09:00:00.000Z',
          failures: [
            {
              step: 'regeling',
              detail:
                'None of the 2 regeling(en) of type /join/id/stop/regelingtype_001 for mnre1034 annotate nl.imow-mnre1034.activiteit.RijksmonArchMonument: tried /akn/nl/act/mnre1034/2020/regOW01, /akn/nl/act/mnre1034/2021/OOWATRXX1',
            },
          ],
        },
      })
    );
    renderTab({ selectedUrn: 'nl.imow-mnre1034.activiteit.RijksmonArchMonument' });

    // The rule sets still resolve and render.
    expect(await screen.findByText('3/7 semantic')).toBeTruthy();

    // No red error state.
    expect(screen.queryByText(/not available in the/)).toBeNull();

    // The reason comes from provenance.failures, not a hardcoded message.
    expect(screen.getByText('Incomplete legs')).toBeTruthy();
    expect(screen.getByText(/regeling: None of the 2 regeling\(en\) of type/)).toBeTruthy();

    // The summary card points at the reason rather than showing a bare "—".
    expect(screen.getByText('Not resolved — see Incomplete legs')).toBeTruthy();
  });

  test('the summary card shows the regeling title, not the pointer, when the legal source is available', async () => {
    getActiviteitDossier.mockResolvedValue(gm0995Dossier());
    renderTab();

    // "Omgevingsplan gemeente Lelystad" also appears in the annotation
    // section below, so scope to the "Legal source" summary card itself.
    const legalSourceCard = (await screen.findByText('Legal source')).closest('div') as HTMLElement;
    expect(within(legalSourceCard).getByText('Omgevingsplan gemeente Lelystad')).toBeTruthy();
    expect(within(legalSourceCard).queryByText('Not resolved — see Incomplete legs')).toBeNull();
  });
});

describe('QualityProfileTab — gm0995 (Lelystad) scorecard', () => {
  test('Conclusie renders the four metric rows from the reference dossier', async () => {
    getActiviteitDossier.mockResolvedValue(gm0995Dossier());
    renderTab();

    expect(await screen.findByText('3/7 semantic')).toBeTruthy();
    expect(screen.getByText('4 opaque (57%)')).toBeTruthy();
    expect(screen.getByText('0/5 semantic')).toBeTruthy();
    expect(screen.getByText('5/5')).toBeTruthy();
    expect(screen.getByText('1 resolved')).toBeTruthy();
  });

  test('Indieningsvereisten renders the reference figures', async () => {
    getActiviteitDossier.mockResolvedValue(gm0995Dossier());
    renderTab();

    expect(await screen.findByText('1/21 semantic')).toBeTruthy();
    expect(screen.getByText('20 opaque (95%)')).toBeTruthy();
    expect(screen.getByText('7/10')).toBeTruthy();
  });

  test('both rule sets are shown as separate cards, never blended', async () => {
    getActiviteitDossier.mockResolvedValue(gm0995Dossier());
    renderTab();
    await screen.findByText('3/7 semantic');

    expect(screen.getByText('Conclusie')).toBeTruthy();
    expect(screen.getByText('Indieningsvereisten')).toBeTruthy();
    // Each rule set keeps its own decision-naming figure — nothing averaged.
    expect(screen.queryByText(/4\/28/)).toBeNull();
  });

  test('Issues only hides semantic rows and keeps opaque ones', async () => {
    getActiviteitDossier.mockResolvedValue(gm0995Dossier());
    renderTab();
    await screen.findByText('3/7 semantic');

    await userEvent.click(screen.getByRole('button', { name: /Show decisions \(7\)/ }));
    // Use a semantic decision name distinct from the activity's own header
    // text (the two happen to coincide for the top-level decision here).
    expect(
      screen.getByText('Boom kappen of houtopstand vellen_Niet van toepassing_cross')
    ).toBeTruthy();
    expect(
      screen.getByText('_6d45be8c-8010-4d11-8775-487a28b88087_Niet van toepassing')
    ).toBeTruthy();

    await userEvent.click(screen.getByLabelText('Issues only'));

    expect(
      screen.queryByText('Boom kappen of houtopstand vellen_Niet van toepassing_cross')
    ).toBeNull();
    expect(
      screen.getByText('_6d45be8c-8010-4d11-8775-487a28b88087_Niet van toepassing')
    ).toBeTruthy();
  });

  test('Issues only on the inputs table hides semantic-and-answered rows only', async () => {
    getActiviteitDossier.mockResolvedValue(gm1708Dossier());
    renderTab({ selectedUrn: GM1708_URN });
    await screen.findByText('4/4 semantic');

    await userEvent.click(screen.getAllByRole('button', { name: /Show inputs \(8\)/ })[0]);
    await userEvent.click(screen.getByLabelText('Issues only'));

    // Every gm1708 Conclusie input is semantic AND carries a question.
    expect(
      screen.getByText('No issues — every input is semantic and carries a question.')
    ).toBeTruthy();
  });

  test('an expanded table renders "no question" in italic for an unanswered opaque input', async () => {
    getActiviteitDossier.mockResolvedValue(gm0995Dossier());
    renderTab();
    await screen.findByText('1/21 semantic');

    await userEvent.click(screen.getByRole('button', { name: /Show inputs \(10\)/ }));

    // All 3 opaque-dangling inputs carry no question.
    expect(screen.getAllByText('no question').length).toBe(3);
  });
});

describe('QualityProfileTab — gm1708 (Steenwijkerland) contrast', () => {
  test('renders 4/4, 8/8 and 3/6 as the reference dossier records', async () => {
    getActiviteitDossier.mockResolvedValue(gm1708Dossier());
    renderTab({ selectedUrn: GM1708_URN });

    expect(await screen.findByText('4/4 semantic')).toBeTruthy(); // Conclusie decision naming
    expect(screen.getByText('8/8 semantic')).toBeTruthy(); // Conclusie input naming
    expect(screen.getByText('3/6')).toBeTruthy(); // Indieningsvereisten label coverage
  });
});

describe('QualityProfileTab — null rule set', () => {
  test('shows "Not present for this activity." and never a zero count', async () => {
    getActiviteitDossier.mockResolvedValue(
      gm0995Dossier({
        decisionCriteria: null,
        submissionRequirements: null,
        qualityProfile: {
          ...gm0995Dossier().qualityProfile,
          ruleSets: { conclusie: null, indieningsvereisten: null },
        },
      })
    );
    renderTab();

    const notices = await screen.findAllByText('Not present for this activity.');
    expect(notices.length).toBe(2);
    // Never zero counts, which would read as "measured and found nothing".
    expect(screen.queryByText(/0\/0/)).toBeNull();
    expect(screen.queryByText('Decision naming')).toBeNull();
  });
});

describe('QualityProfileTab — Compare', () => {
  test('selecting a compare authority renders 4 matrix columns', async () => {
    getActiviteitDossier.mockImplementation(async (urn: string) => {
      if (urn === GM0995_URN) return gm0995Dossier();
      if (urn === GM1708_URN) return gm1708Dossier();
      throw new Error(`unexpected urn ${urn}`);
    });
    renderTab();
    await screen.findByText('3/7 semantic');

    await userEvent.selectOptions(screen.getByLabelText('Compare with'), 'gm1708');

    await screen.findByText('4/4 semantic');
    // 4 columns → 2 "Decision criteria" chips and 2 "Submission requirements" chips.
    expect(screen.getAllByText('Decision criteria').length).toBe(2);
    expect(screen.getAllByText('Submission requirements').length).toBe(2);
  });

  test('drilling into a matrix cell shows the decisions table for that column', async () => {
    getActiviteitDossier.mockImplementation(async (urn: string) => {
      if (urn === GM0995_URN) return gm0995Dossier();
      if (urn === GM1708_URN) return gm1708Dossier();
      throw new Error(`unexpected urn ${urn}`);
    });
    renderTab();
    await screen.findByText('3/7 semantic');
    await userEvent.selectOptions(screen.getByLabelText('Compare with'), 'gm1708');
    await screen.findByText('4/4 semantic');

    // First "Decision naming" row's first cell (Lelystad · Decision criteria).
    const decisionNamingCells = screen
      .getAllByText('3/7 semantic')
      .map((el) => el.closest('button'))
      .filter(Boolean) as HTMLButtonElement[];
    await userEvent.click(decisionNamingCells[0]);

    expect(
      await screen.findByText('Boom kappen of houtopstand vellen_Niet van toepassing_cross')
    ).toBeTruthy();
  });

  test('a "Clear compare" control appears only while comparing, and resets to the Scorecard layout', async () => {
    getActiviteitDossier.mockImplementation(async (urn: string) => {
      if (urn === GM0995_URN) return gm0995Dossier();
      if (urn === GM1708_URN) return gm1708Dossier();
      throw new Error(`unexpected urn ${urn}`);
    });
    renderTab();
    await screen.findByText('3/7 semantic');

    // No comparison active yet — the clear control is not rendered.
    expect(screen.queryByRole('button', { name: /Clear compare/ })).toBeNull();

    await userEvent.selectOptions(screen.getByLabelText('Compare with'), 'gm1708');
    await screen.findByText('4/4 semantic');
    expect(screen.getByText('Dimension')).toBeTruthy(); // Matrix layout is up

    await userEvent.click(screen.getByRole('button', { name: /Clear compare/ }));

    // Back to the single-dossier Scorecard view.
    expect(screen.queryByText('Dimension')).toBeNull();
    expect(screen.getByText('Conclusie')).toBeTruthy();
    expect(screen.getByText('Indieningsvereisten')).toBeTruthy();
    expect((screen.getByLabelText('Compare with') as HTMLSelectElement).value).toBe('');
    expect(screen.queryByRole('button', { name: /Clear compare/ })).toBeNull();
  });
});

describe('QualityProfileTab — footer', () => {
  test('shows env and datum, never carrying rule ids across environments', async () => {
    getActiviteitDossier.mockResolvedValue(gm0995Dossier());
    renderTab();

    expect(await screen.findByText(/Dossier retrieved .* · prod · valid on today/)).toBeTruthy();
    expect(
      screen.getByText(
        'Environment and date are part of the result — rule ids do not carry across.'
      )
    ).toBeTruthy();
  });
});

describe('QualityProfileTab — edge cases and fallbacks', () => {
  test('no bestuursorgaan renders with no authority pill and no crash', async () => {
    getActiviteitDossier.mockResolvedValue(gm0995Dossier({ bestuursorgaan: null }));
    renderTab();

    await screen.findByText('Boom kappen of houtopstand vellen');
    // The authority pill's "{Name} · {code}" text — unlike the regeling
    // title or Werkingsgebied text, which also say "Lelystad".
    expect(screen.queryByText(/· gm0995/)).toBeNull();
  });

  test('a rule with no wId, kwalificatie, article text or locations renders the "—" fallbacks', async () => {
    getActiviteitDossier.mockResolvedValue(
      gm0995Dossier({
        legalSource: {
          available: true,
          regelingIdentificatie: 'reg-gm0995',
          regelingTitel: null,
          juridischeRegels: [
            {
              identificatie: 'bare',
              kwalificatie: null,
              idealisatie: null,
              regeltekstRef: 'rt-bare',
              wId: null,
              locaties: [],
              articleText: null,
            },
          ],
        },
        annotation: {
          identificatie: 'ann-1',
          naam: null,
          groep: null,
          symboolcode: null,
          bovenliggendeActiviteitRef: null,
        },
      })
    );
    renderTab();

    expect(await screen.findByText('Legal source (1)')).toBeTruthy();
    // articleLabel(null) falls back to "—"; regelingTitel null does too.
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    expect(screen.queryByText('Werkingsgebied:', { exact: false })).toBeNull();
  });

  test('a wId that does not match the article regex also falls back to "—"', async () => {
    getActiviteitDossier.mockResolvedValue(
      gm0995Dossier({
        legalSource: {
          available: true,
          regelingIdentificatie: 'reg-gm0995',
          regelingTitel: 'Omgevingsplan gemeente Lelystad',
          juridischeRegels: [
            {
              identificatie: 'r-nomatch',
              kwalificatie: 'anders geduid',
              idealisatie: null,
              regeltekstRef: 'rt-nomatch',
              wId: 'not-an-article-wid',
              locaties: [{ identificatie: 'l', naam: 'Ergens' }],
              articleText: '<![CDATA[Some <b>text</b>]]>',
            },
          ],
        },
      })
    );
    renderTab();

    await screen.findByText('Legal source (1)');
    expect(screen.getByText('Some text')).toBeTruthy(); // CDATA unwrapped, tags stripped
  });

  test('clicking "Show all N rules" reveals the rest and toggles back', async () => {
    getActiviteitDossier.mockResolvedValue(gm0995Dossier());
    renderTab();
    await screen.findByText('Legal source (10)');

    expect(screen.queryByText('Art. 15.15')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Show all 10 rules' }));
    expect(screen.getByText('Art. 15.15')).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Show fewer' }));
    expect(screen.queryByText('Art. 15.15')).toBeNull();
  });

  test('a rule set with zero-total dimensions renders "0/0" rather than crashing', async () => {
    const dossier = gm0995Dossier();
    getActiviteitDossier.mockResolvedValue({
      ...dossier,
      qualityProfile: {
        ...dossier.qualityProfile,
        ruleSets: {
          ...dossier.qualityProfile.ruleSets,
          conclusie: {
            decisionNaming: { total: 0, semantic: 0, opaque: 0, items: [] },
            inputNaming: { total: 0, semantic: 0, opaque: 0, items: [] },
            labelCoverage: { inputs: 0, withQuestion: 0 },
            refResolvability: { total: 0, resolved: 0, dangling: 0 },
          },
        },
      },
    });
    renderTab();

    // Both decision naming and input naming are zeroed, so both render the
    // same "0/0 semantic" bold text.
    expect((await screen.findAllByText('0/0 semantic')).length).toBe(2);
    expect(screen.getByText('0/0')).toBeTruthy(); // label coverage
  });

  test('Issues only on an all-semantic decisions table shows the "no issues" message', async () => {
    getActiviteitDossier.mockResolvedValue(gm1708Dossier());
    renderTab({ selectedUrn: GM1708_URN });
    await screen.findByText('4/4 semantic');

    await userEvent.click(screen.getByRole('button', { name: /Show decisions \(4\)/ }));
    await userEvent.click(screen.getByLabelText('Issues only'));

    expect(screen.getByText('No issues — every decision is semantic.')).toBeTruthy();
  });

  test('a rule set metadata with no sttrVersie or begindatum falls back to "—"', async () => {
    getActiviteitDossier.mockResolvedValue(
      gm0995Dossier({
        decisionCriteria: {
          typering: 'Conclusie',
          identifier: 999,
          sttrVersie: null,
          begindatum: null,
          toestemming: null,
          functioneleStructuurRef: 'fs-x',
          viewerUrl: 'https://example.test',
          dmn: null,
        },
      })
    );
    renderTab();

    expect(await screen.findByText('id: 999 · STTR v— · —')).toBeTruthy();
  });

  test('an authority OIN is resolved to its bevoegd-gezag code before reaching getActiviteitDossier', async () => {
    getActiviteitDossier.mockResolvedValue(gm0995Dossier());
    // gm1708's OIN — deliberately not the OIN of the activity being viewed,
    // so this can't pass by coincidence.
    renderTab({ authorityOin: '00000001809249066000' });

    await screen.findByText('3/7 semantic');

    // The dossier route's `authority` param is a bevoegd-gezag CODE
    // (dossier.service.ts's `gezagCode`, e.g. "gm0995"), never an OIN. This
    // must fail if the raw OIN ("00000001809249066000") is passed instead.
    expect(getActiviteitDossier).toHaveBeenCalledWith(GM0995_URN, 'pre', undefined, 'gm1708');
  });

  test('an authority OIN with no match in the register is passed as undefined, not the raw OIN', async () => {
    getActiviteitDossier.mockResolvedValue(gm0995Dossier());
    renderTab({ authorityOin: 'not-a-real-oin' });

    await screen.findByText('3/7 semantic');

    expect(getActiviteitDossier).toHaveBeenCalledWith(GM0995_URN, 'pre', undefined, undefined);
  });
});

describe('QualityProfileTab — Compare authority (correctness)', () => {
  test("the compare fetch uses the COMPARED authority, not the primary's", async () => {
    getActiviteitDossier.mockImplementation(async (urn: string) => {
      if (urn === GM0995_URN) return gm0995Dossier();
      if (urn === GM1708_URN) return gm1708Dossier();
      throw new Error(`unexpected urn ${urn}`);
    });
    // The primary activity's own authority is gm0995 (Lelystad) — set via
    // its OIN, resolved to the code the same way the primary fetch does.
    renderTab({ authorityOin: '00000001005024249000' });
    await screen.findByText('3/7 semantic');

    await userEvent.selectOptions(screen.getByLabelText('Compare with'), 'gm1708');
    await screen.findByText('4/4 semantic');

    // The compared dossier (GM1708_URN) must be fetched with the COMPARED
    // authority's code (gm1708). This is the bug: previously the PRIMARY
    // authority's code (gm0995) was passed instead, so the backend searched
    // Lelystad's regelingen for a Steenwijkerland activity.
    expect(getActiviteitDossier).toHaveBeenCalledWith(GM1708_URN, 'pre', undefined, 'gm1708');
    expect(getActiviteitDossier).not.toHaveBeenCalledWith(GM1708_URN, 'pre', undefined, 'gm0995');
  });
});

describe('QualityProfileTab — Compare edge cases', () => {
  test('a selected URN that does not match the IMOW pattern cannot be compared', async () => {
    getActiviteitDossier.mockResolvedValue(gm0995Dossier({ urn: 'not-an-imow-urn' }));
    renderTab();
    await screen.findByText('3/7 semantic');

    await userEvent.selectOptions(screen.getByLabelText('Compare with'), 'gm1708');

    // No second call is ever made, and the layout stays Scorecard.
    await new Promise((r) => setTimeout(r, 0));
    expect(getActiviteitDossier).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Dimension')).toBeNull();
  });

  test('a failed compare fetch shows an inline error without disturbing the primary dossier', async () => {
    getActiviteitDossier.mockImplementation(async (urn: string) => {
      if (urn === GM0995_URN) return gm0995Dossier();
      throw new Error('compare backend down');
    });
    renderTab();
    await screen.findByText('3/7 semantic');

    await userEvent.selectOptions(screen.getByLabelText('Compare with'), 'gm1708');

    expect(await screen.findByText(/Compare failed to load: compare backend down/)).toBeTruthy();
    // The primary scorecard is still intact.
    expect(screen.getByText('3/7 semantic')).toBeTruthy();
  });

  test('a compare dossier with provenance failures renders its own Incomplete legs box', async () => {
    getActiviteitDossier.mockImplementation(async (urn: string) => {
      if (urn === GM0995_URN) return gm0995Dossier();
      if (urn === GM1708_URN) {
        return gm1708Dossier({
          provenance: {
            env: 'prod',
            datum: null,
            regelingIdentificatie: 'reg-gm1708',
            fetchedAt: '2026-09-22T21:03:32.696Z',
            failures: [{ step: 'legalSource', detail: 'Ozon timed out' }],
          },
        });
      }
      throw new Error(`unexpected urn ${urn}`);
    });
    renderTab();
    await screen.findByText('3/7 semantic');

    await userEvent.selectOptions(screen.getByLabelText('Compare with'), 'gm1708');

    expect(await screen.findByText(/legalSource: Ozon timed out/)).toBeTruthy();
  });

  test('clicking the same matrix cell twice deselects it and closes the drill-down', async () => {
    getActiviteitDossier.mockImplementation(async (urn: string) => {
      if (urn === GM0995_URN) return gm0995Dossier();
      if (urn === GM1708_URN) return gm1708Dossier();
      throw new Error(`unexpected urn ${urn}`);
    });
    renderTab();
    await screen.findByText('3/7 semantic');
    await userEvent.selectOptions(screen.getByLabelText('Compare with'), 'gm1708');
    await screen.findByText('4/4 semantic');

    const cell = screen
      .getAllByText('3/7 semantic')
      .map((el) => el.closest('button'))
      .filter(Boolean)[0] as HTMLButtonElement;
    await userEvent.click(cell);
    expect(
      await screen.findByText('Boom kappen of houtopstand vellen_Niet van toepassing_cross')
    ).toBeTruthy();

    await userEvent.click(cell);
    expect(
      screen.queryByText('Boom kappen of houtopstand vellen_Niet van toepassing_cross')
    ).toBeNull();
  });

  test('drilling into Ref resolvability shows the plural and "no cross-references" wording', async () => {
    getActiviteitDossier.mockImplementation(async (urn: string) => {
      if (urn === GM0995_URN) {
        const d = gm0995Dossier();
        return {
          ...d,
          qualityProfile: {
            ...d.qualityProfile,
            ruleSets: {
              ...d.qualityProfile.ruleSets,
              conclusie: {
                ...d.qualityProfile.ruleSets.conclusie!,
                refResolvability: { total: 3, resolved: 2, dangling: 1 },
              },
            },
          },
        };
      }
      if (urn === GM1708_URN) return gm1708Dossier();
      throw new Error(`unexpected urn ${urn}`);
    });
    renderTab();
    await screen.findByText('3/7 semantic');
    await userEvent.selectOptions(screen.getByLabelText('Compare with'), 'gm1708');
    await screen.findByText('2 resolved');

    await userEvent.click(screen.getByText('2 resolved').closest('button')!);
    expect(await screen.findByText('2 references resolved, 1 dangling.')).toBeTruthy();

    // gm1708's Conclusie carries no cross-references at all (total 0).
    await userEvent.click(screen.getAllByText('none')[0].closest('button')!);
    expect(await screen.findByText('This rule set carries no cross-references.')).toBeTruthy();
  });
});

// ─── "Dossier .md" — shares scripts/dso-dossier.mjs#renderDossier ──────────
//
// The CLI (`npm run dso:dossier`, scripts/dso-dossier.mjs) and this button
// must produce IDENTICAL Markdown for the same dossier. Rather than porting
// renderDossier twice — a port would drift — both import the one copy in
// scripts/dossier-render.mjs. These tests prove that sharing, not just that
// each side happens to render something.

describe('renderDossier — shared between the CLI and the frontend', () => {
  test('the frontend import and the CLI script import the exact same function', async () => {
    const shared = await import('../../../../../scripts/dossier-render.mjs');
    const cli = await import('../../../../../scripts/dso-dossier.mjs');

    // Not "produces the same output" (which two independent ports could also
    // achieve by coincidence) but IS the same function object — the CLI
    // module re-exports it rather than defining its own, so drift between
    // the two is structurally impossible, not just untested.
    expect(cli.renderDossier).toBe(shared.renderDossier);
  });

  test('renders Markdown carrying the reference dossier’s figures, byte-identical to what the CLI would produce', async () => {
    const { renderDossier } = await import('../../../../../scripts/dossier-render.mjs');

    const md = renderDossier(gm0995Dossier());

    expect(md).toContain('# Boom kappen of houtopstand vellen');
    expect(md).toContain('**Authority:** gm0995');
    expect(md).toContain('**Environment:** prod');
    expect(md).toContain('## Quality profile');
    expect(md).toContain('| Decision naming | 3/7 semantic, 4 opaque (57%) |');
    expect(md).toContain('| Decision naming | 1/21 semantic, 20 opaque (95%) |');
    expect(md).toContain('| Label coverage | 5/5 inputs carry a question |');
    expect(md).toContain('| Label coverage | 7/10 inputs carry a question |');
  });
});

describe('QualityProfileTab — "Dossier .md" button', () => {
  test('downloads Markdown identical to renderDossier(dossier), named dossier-{urn}.md', async () => {
    const { renderDossier } = await import('../../../../../scripts/dossier-render.mjs');
    const createObjectURL = vi.fn().mockReturnValue('blob:mock');
    global.URL.createObjectURL = createObjectURL;
    global.URL.revokeObjectURL = vi.fn();
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    const dossier = gm0995Dossier();
    getActiviteitDossier.mockResolvedValue(dossier);
    renderTab();
    await screen.findByText('3/7 semantic');

    await userEvent.click(screen.getByRole('button', { name: /Dossier \.md/ }));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    expect(blob.type).toContain('text/markdown');
    expect(await blob.text()).toBe(renderDossier(dossier));

    expect(clickSpy).toHaveBeenCalledTimes(1);
    const anchor = clickSpy.mock.instances[0] as HTMLAnchorElement;
    expect(anchor.download).toBe(`dossier-${GM0995_URN}.md`);
  });
});
