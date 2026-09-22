// scripts/dso-dossier.test.mjs
import { renderDossier } from './dso-dossier.mjs';

const data = {
  urn: 'nl.imow-gm0995.activiteit.HoutopstandVellen',
  omschrijving: 'Boom kappen of houtopstand vellen',
  bestuursorgaan: { code: 'gm0995', oin: '00000001005024249000' },
  legalSource: {
    available: true,
    regelingTitel: 'Omgevingsplan gemeente Lelystad',
    juridischeRegels: [
      {
        identificatie: 'nl.imow-gm0995.juridischeregel.1',
        kwalificatie: 'vergunningplicht',
        wId: 'gm0995_x__art_15.2__para_5',
        locaties: [{ identificatie: 'nl.imow-gm0995.gebiedengroep.180a', naam: 'bebouwingscontour, houtkap' }],
        articleText: '<Inhoud><Al>Het is verboden zonder omgevingsvergunning…</Al></Inhoud>',
      },
    ],
  },
  annotation: { groep: 'kapactiviteit', bovenliggendeActiviteitRef: 'nl.imow-gm0995.activiteit.OverigeAct' },
  decisionCriteria: {
    identifier: 114233,
    sttrVersie: 2,
    begindatum: '30-07-2026',
    viewerUrl: 'https://omgevingswet.overheid.nl/registratie-toepasbare-regels/id/Conclusiex',
  },
  submissionRequirements: null,
  qualityProfile: {
    activityIdentity: 'semantic',
    decisionNaming: { total: 7, semantic: 3, opaque: 4 },
    inputNaming: { total: 5, semantic: 0, opaque: 5 },
    labelCoverage: { inputs: 5, withQuestion: 5 },
    refResolvability: { total: 1, resolved: 1, dangling: 0 },
    legalTraceability: { rules: 10, withWId: 10, withArticleText: 10 },
  },
  provenance: { env: 'prod', datum: '22-09-2026', fetchedAt: '2026-09-22T14:00:00Z', failures: [] },
};

const md = renderDossier(data);

const checks = [
  ['stamps the environment', md.includes('**Environment:** prod')],
  ['stamps the date', md.includes('22-09-2026')],
  ['names the activity', md.includes('Boom kappen of houtopstand vellen')],
  ['renders article text without XML tags', md.includes('Het is verboden zonder omgevingsvergunning') && !md.includes('<Al>')],
  ['shows the viewer link', md.includes('registratie-toepasbare-regels')],
  ['reports the naming split', md.includes('3') && md.includes('4')],
  ['marks an absent rule set', md.includes('Not present')],
  ['resolves the locatie name', md.includes('bebouwingscontour, houtkap')],
];

let failed = 0;
for (const [name, ok] of checks) {
  if (!ok) { console.error('FAIL:', name); failed++; }
}
if (failed) process.exit(1);
console.log(`PASS: ${checks.length} checks`);
