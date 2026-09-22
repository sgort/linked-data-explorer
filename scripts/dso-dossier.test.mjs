// scripts/dso-dossier.test.mjs
import { renderDossier } from './dso-dossier.mjs';
import { execFileSync } from 'node:child_process';

const checks = [];

// --- Regression: importing must not throw when process.argv[1] is absent --
//
// The direct-invocation guard used to build `file://${process.argv[1]...}`
// by hand, which threw at import time whenever process.argv[1] was
// undefined (e.g. `node -e "import(...)"`). A module must not throw merely
// from being imported. Run in a real subprocess: this test file itself
// always has a defined process.argv[1], so the failure mode can only be
// observed from an separate invocation where argv[1] is absent.
{
  const url = new URL('./dso-dossier.mjs', import.meta.url).href;
  let importSafe = true;
  try {
    execFileSync(process.execPath, ['-e', `import(${JSON.stringify(url)})`], { stdio: 'pipe' });
  } catch {
    importSafe = false;
  }
  checks.push(['importing the module does not throw when process.argv[1] is undefined', importSafe]);
}

/**
 * Renders `data` and reports a crash as a named, uniform failure instead of
 * an uncaught exception that would suppress every other check's output.
 * Returns the rendered Markdown, or null if rendering threw.
 */
function render(data, label) {
  try {
    return renderDossier(data);
  } catch (err) {
    checks.push([`${label}: renderDossier threw: ${err.message}`, false]);
    return null;
  }
}

// --- Base fixture: a fully-populated activity -----------------------------

const baseData = {
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
        articleText:
          '<Inhoud><Al>Het is verboden zonder omgevingsvergunning<![CDATA[ met bijzondere tekens]]>…</Al></Inhoud>',
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

const md = render(baseData, 'base');

if (md !== null) {
  checks.push(
    ['stamps the environment', md.includes('**Environment:** prod')],
    ['stamps the date', md.includes('22-09-2026')],
    ['names the activity', md.includes('Boom kappen of houtopstand vellen')],
    ['renders article text without XML tags', md.includes('Het is verboden zonder omgevingsvergunning') && !md.includes('<Al>')],
    // FINDING 1: CDATA payload must survive the tag strip, not just plain text
    // alongside it — a naive `/<[^>]+>/g` swallows the whole CDATA span.
    ['preserves CDATA payload text', md.includes('met bijzondere tekens') && !md.includes('CDATA')],
    ['shows the viewer link', md.includes('registratie-toepasbare-regels')],
    // FINDING 2: assert the actual rendered split, not incidental digits that
    // also appear in the rule identifier, OIN or date. Must fail if
    // `decisionNaming` is removed from the fixture (verified below).
    ['reports the naming split', md.includes('3/7 semantic') && md.includes('4 opaque')],
    ['marks an absent rule set', md.includes('Not present')],
    ['resolves the locatie name', md.includes('bebouwingscontour, houtkap')]
  );
}

// --- FINDING 3a: provenance.failures -> "Incomplete legs" section ---------

const failuresData = {
  ...baseData,
  provenance: {
    ...baseData.provenance,
    failures: [{ step: 'annotaties', detail: 'Ozon annotaties timed out after 5000ms' }],
  },
};

const mdFailures = render(failuresData, 'failures');

if (mdFailures !== null) {
  checks.push([
    'renders an Incomplete legs section with the failing step and detail',
    mdFailures.includes('## Incomplete legs') &&
      mdFailures.includes('**annotaties:**') &&
      mdFailures.includes('Ozon annotaties timed out after 5000ms'),
  ]);
}

// --- FINDING 3b: legalSource.available === false ---------------------------

const noPlanData = {
  ...baseData,
  legalSource: { available: false, regelingTitel: null, juridischeRegels: [] },
};

const mdNoPlan = render(noPlanData, 'no-plan');

if (mdNoPlan !== null) {
  checks.push([
    'renders the no-omgevingsplan message and omits the juridische-regel sections',
    mdNoPlan.includes('No omgevingsplan was found for this authority.') &&
      !mdNoPlan.includes('Regeling: **Omgevingsplan gemeente Lelystad**') &&
      !mdNoPlan.includes('#### gm0995_x__art_15.2__para_5'),
  ]);
}

// ---------------------------------------------------------------------------

let failed = 0;
for (const [name, ok] of checks) {
  if (!ok) { console.error('FAIL:', name); failed++; }
}
if (failed) process.exit(1);
console.log(`PASS: ${checks.length} checks`);
