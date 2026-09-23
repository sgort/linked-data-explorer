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

// --- Base fixture: a fully-populated activity, BOTH rule sets present ------
//
// decisionNaming/inputNaming/labelCoverage/refResolvability now live under
// `qualityProfile.ruleSets.conclusie` / `.indieningsvereisten`, each carrying
// the item lists that are the evidence behind the counts. One decision name
// and one input name contain a literal `|`, so the table-escaping check has
// something to escape rather than something incidentally safe.

const conclusieRuleSetQuality = {
  decisionNaming: {
    total: 2,
    semantic: 1,
    opaque: 1,
    items: [
      { name: 'Boom kappen of houtopstand vellen', class: 'semantic' },
      { name: '_6d45be8c-8010-4d11-8775-487a28b88087_Vergunningplicht', class: 'opaque-dangling' },
    ],
  },
  inputNaming: {
    total: 2,
    semantic: 0,
    opaque: 2,
    items: [
      {
        name: 'uitv__864933e7-4ea9-45a2-ae17-d8b1a4df34d7',
        class: 'opaque-resolvable',
        question: 'Gaat het om een boom of houtopstand | bijzonder object binnen de contour?',
      },
      {
        name: 'onderwerp_c7ef02b1_0f07_4ec7_a91e_6a6c35dd3922',
        class: 'opaque-dangling',
        question: null,
      },
    ],
  },
  labelCoverage: { inputs: 2, withQuestion: 1 },
  refResolvability: { total: 1, resolved: 1, dangling: 0 },
};

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
    legalTraceability: { rules: 10, withWId: 10, withArticleText: 10 },
    crossLayerConsistency: { sharedObjects: [] },
    ruleSets: {
      conclusie: conclusieRuleSetQuality,
      indieningsvereisten: null,
    },
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
    // The evidence heading states counts per rule set.
    ['renders the evidence heading with counts', md.includes('### Conclusie — 2 decisions, 2 inputs')],
    ['resolves the locatie name', md.includes('bebouwingscontour, houtkap')]
  );

  // --- Decisions table -------------------------------------------------
  checks.push(
    ['decisions table header present', md.includes('| Decision | Naming |')],
    [
      'renders a semantic decision row',
      md.includes('| Boom kappen of houtopstand vellen | semantic |'),
    ],
    [
      'renders an opaque-dangling decision row',
      md.includes(
        '| _6d45be8c-8010-4d11-8775-487a28b88087_Vergunningplicht | opaque-dangling |'
      ),
    ]
  );

  // --- Inputs table, including the escaped `|` -------------------------
  checks.push(
    ['inputs table header present', md.includes('| Input | Naming | Question |')],
    [
      "an input's own question is rendered next to it, with the literal `|` escaped",
      md.includes(
        '| uitv__864933e7-4ea9-45a2-ae17-d8b1a4df34d7 | opaque-resolvable | Gaat het om een boom of houtopstand \\| bijzonder object binnen de contour? |'
      ),
    ],
    [
      // Verifies the escaping did NOT bleed into an unrelated row, i.e. the
      // table's column count still lines up for the row with no question.
      'an input with no resolved question renders an em dash, not a blank cell',
      md.includes('| onderwerp_c7ef02b1_0f07_4ec7_a91e_6a6c35dd3922 | opaque-dangling | — |')
    ],
    [
      // Sanity check that escaping actually changed something: if this raw,
      // un-escaped `|`-containing question text appeared verbatim, the table
      // would be broken (extra column) rather than merely rendered as text.
      'the raw un-escaped question text (with a bare `|`) does not appear anywhere',
      !md.includes('Gaat het om een boom of houtopstand | bijzonder object')
    ]
  );

  // --- Quality profile is now per rule set ------------------------------
  checks.push(
    ['Conclusie quality sub-table present', md.includes('**Conclusie**')],
    ['reports the Conclusie naming split', md.includes('1/2 semantic') && md.includes('1 opaque')],
    ['marks the absent Indieningsvereisten rule set as Not present (evidence)', md.includes('Not present for this activity.')],
    ['marks the absent Indieningsvereisten quality as Not present', md.includes('**Indieningsvereisten:** Not present.')]
  );
}

// --- An absent rule set must not crash, and must render "Not present" -----

const noIndieningsvereistenData = {
  ...baseData,
  submissionRequirements: null,
  qualityProfile: {
    ...baseData.qualityProfile,
    ruleSets: { conclusie: conclusieRuleSetQuality, indieningsvereisten: null },
  },
};

const mdNoIndiening = render(noIndieningsvereistenData, 'no-indieningsvereisten');

if (mdNoIndiening !== null) {
  checks.push([
    'an absent rule set renders "Not present" for both its metadata and its evidence, without crashing',
    mdNoIndiening.includes('### Indieningsvereisten') &&
      mdNoIndiening.includes('Not present for this activity.') &&
      mdNoIndiening.includes('**Indieningsvereisten:** Not present.'),
  ]);
}

// --- A rule set present as metadata but with no measured quality (DMN ------
// --- extraction failed) must not crash, and must render no evidence table --

const dmnFailedData = {
  ...baseData,
  submissionRequirements: {
    identifier: 105947,
    sttrVersie: 1,
    begindatum: '12-12-2025',
    viewerUrl: 'https://omgevingswet.overheid.nl/registratie-toepasbare-regels/id/IndieningsvereistenVergunning',
  },
  qualityProfile: {
    ...baseData.qualityProfile,
    ruleSets: { conclusie: conclusieRuleSetQuality, indieningsvereisten: null },
  },
};

const mdDmnFailed = render(dmnFailedData, 'dmn-failed');

if (mdDmnFailed !== null) {
  checks.push([
    'a present rule set whose DMN could not be measured renders its metadata, no evidence table, and does not crash',
    mdDmnFailed.includes('### Indieningsvereisten') &&
      mdDmnFailed.includes('registratie-toepasbare-regels/id/IndieningsvereistenVergunning') &&
      !mdDmnFailed.includes('### Indieningsvereisten — '),
  ]);
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
