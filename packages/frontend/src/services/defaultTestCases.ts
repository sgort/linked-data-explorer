/* eslint-disable no-console */
import { TestCase } from '../types/testCase.types';
import { getTestCasesForChain, saveTestCase } from './testCaseStorage';

/**
 * Default test cases for example templates
 * Pre-populated to help users understand the test case feature
 */

const DEFAULT_ENDPOINT =
  'https://api.open-regels.triply.cc/datasets/stevengort/facts/services/facts/sparql';

interface TemplateTestCases {
  templateId: string;
  dmnIds: string[];
  testCases: Array<Omit<TestCase, 'id' | 'createdAt'>>;
}

const TEMPLATE_TEST_CASES: TemplateTestCases[] = [
  // 1. Age Verification (Simple - 1 DMN)
  {
    templateId: 'age-verification',
    dmnIds: ['SVB_LeeftijdsInformatie'],
    testCases: [
      {
        name: 'Young Adult (35 years)',
        description: 'Test case for a 35-year-old single person',
        inputs: {
          geboortedatumAanvrager: '1990-06-15',
          dagVanAanvraag: '2026-02-13',
          geboortedatumPartner: null,
        },
        tags: ['example', 'young-adult'],
      },
      {
        name: 'Senior (68 years)',
        description: 'Test case for AOW-eligible age',
        inputs: {
          geboortedatumAanvrager: '1958-01-20',
          dagVanAanvraag: '2026-02-13',
          geboortedatumPartner: null,
        },
        tags: ['example', 'aow-age'],
      },
      {
        name: 'Young Person (18 years)',
        description: 'Test case for minimum adult age',
        inputs: {
          geboortedatumAanvrager: '2008-02-13',
          dagVanAanvraag: '2026-02-13',
          geboortedatumPartner: null,
        },
        tags: ['example', 'minimum-age'],
      },
    ],
  },

  // 2. Benefits Calculation (Medium - 2 DMNs)
  {
    templateId: 'benefits-calculation',
    dmnIds: ['SVB_LeeftijdsInformatie', 'SZW_BijstandsnormInformatie'],
    testCases: [
      {
        name: 'Single Person - Low Income',
        description: 'Single person with low income, no children',
        inputs: {
          geboortedatumAanvrager: '1985-03-20',
          geboortedatumPartner: null,
          dagVanAanvraag: '2026-02-13',
          aanvragerAlleenstaand: true,
          aanvragerHeeftKinderen: false,
          aanvragerHeeftAOWLeeftijd: false,
          gemeenteCodeWoonplaats: '0794',
          maandelijksBrutoInkomenAanvrager: 800,
        },
        expectedOutputs: {
          bijstandsrechtVoldaan: true,
        },
        tags: ['example', 'single', 'low-income'],
      },
      {
        name: 'Couple - Medium Income',
        description: 'Couple without children, combined income',
        inputs: {
          geboortedatumAanvrager: '1980-05-15',
          geboortedatumPartner: '1982-08-22',
          dagVanAanvraag: '2026-02-13',
          aanvragerAlleenstaand: false,
          aanvragerHeeftKinderen: false,
          aanvragerHeeftAOWLeeftijd: false,
          gemeenteCodeWoonplaats: '0794',
          maandelijksBrutoInkomenAanvrager: 1200,
          maandelijksBrutoInkomenPartner: 1000,
        },
        tags: ['example', 'couple', 'medium-income'],
      },
      {
        name: 'Single Parent - Very Low Income',
        description: 'Single parent with children, minimal income',
        inputs: {
          geboortedatumAanvrager: '1992-11-10',
          geboortedatumPartner: null,
          dagVanAanvraag: '2026-02-13',
          aanvragerAlleenstaand: true,
          aanvragerHeeftKinderen: true,
          aanvragerHeeftAOWLeeftijd: false,
          gemeenteCodeWoonplaats: '0794',
          maandelijksBrutoInkomenAanvrager: 500,
        },
        expectedOutputs: {
          bijstandsrechtVoldaan: true,
        },
        tags: ['example', 'single-parent', 'very-low-income'],
      },
    ],
  },

  // 3. Heusdenpas Full (Complex - 3 DMNs)
  {
    templateId: 'heusdenpas-full',
    dmnIds: [
      'SVB_LeeftijdsInformatie',
      'SZW_BijstandsnormInformatie',
      'RONL_HeusdenpasEindresultaat',
    ],
    testCases: [
      {
        name: 'Eligible - Couple with Children',
        description: 'Couple with children, low income, meets all criteria',
        inputs: {
          geboortedatumAanvrager: '1975-05-15',
          geboortedatumPartner: '1978-03-22',
          dagVanAanvraag: '2026-02-13',
          aanvragerAlleenstaand: false,
          aanvragerHeeftKinderen: true,
          aanvragerHeeftAOWLeeftijd: false,
          aanvragerHeeftKind4Tm17: true,
          aanvragerInwonerHeusden: true,
          gemeenteCodeWoonplaats: '0794',
          maandelijksBrutoInkomenAanvrager: 1500,
          maandelijksBrutoInkomenPartner: 1200,
          aanvragerUitkeringBaanbrekers: false,
          aanvragerVoedselbankpasDenBosch: false,
          aanvragerKwijtscheldingGemeentelijkeBelastingen: false,
          aanvragerSchuldhulptrajectKredietbankNederland: false,
          aanvragerDitKalenderjaarAlAangevraagd: false,
          aanvragerAanmerkingStudieFinanciering: false,
          aanvragerIs181920: false,
          aanvragerIsTenminste21: true,
        },
        expectedOutputs: {
          heeftRechtOpHeusdenpas: true,
        },
        tags: ['example', 'eligible', 'couple', 'children'],
      },
      {
        name: 'Not Eligible - High Income',
        description: 'Couple with children but income too high',
        inputs: {
          geboortedatumAanvrager: '1975-05-15',
          geboortedatumPartner: '1978-03-22',
          dagVanAanvraag: '2026-02-13',
          aanvragerAlleenstaand: false,
          aanvragerHeeftKinderen: true,
          aanvragerHeeftAOWLeeftijd: false,
          aanvragerHeeftKind4Tm17: true,
          aanvragerInwonerHeusden: true,
          gemeenteCodeWoonplaats: '0794',
          maandelijksBrutoInkomenAanvrager: 2500,
          maandelijksBrutoInkomenPartner: 2200,
          aanvragerUitkeringBaanbrekers: false,
          aanvragerVoedselbankpasDenBosch: false,
          aanvragerKwijtscheldingGemeentelijkeBelastingen: false,
          aanvragerSchuldhulptrajectKredietbankNederland: false,
          aanvragerDitKalenderjaarAlAangevraagd: false,
          aanvragerAanmerkingStudieFinanciering: false,
          aanvragerIs181920: false,
          aanvragerIsTenminste21: true,
        },
        expectedOutputs: {
          heeftRechtOpHeusdenpas: false,
        },
        tags: ['example', 'not-eligible', 'high-income'],
      },
      {
        name: 'Edge Case - Already Applied',
        description: 'Eligible income but already applied this year',
        inputs: {
          geboortedatumAanvrager: '1975-05-15',
          geboortedatumPartner: '1978-03-22',
          dagVanAanvraag: '2026-02-13',
          aanvragerAlleenstaand: false,
          aanvragerHeeftKinderen: true,
          aanvragerHeeftAOWLeeftijd: false,
          aanvragerHeeftKind4Tm17: true,
          aanvragerInwonerHeusden: true,
          gemeenteCodeWoonplaats: '0794',
          maandelijksBrutoInkomenAanvrager: 1500,
          maandelijksBrutoInkomenPartner: 1200,
          aanvragerUitkeringBaanbrekers: false,
          aanvragerVoedselbankpasDenBosch: false,
          aanvragerKwijtscheldingGemeentelijkeBelastingen: false,
          aanvragerSchuldhulptrajectKredietbankNederland: false,
          aanvragerDitKalenderjaarAlAangevraagd: true, // Already applied
          aanvragerAanmerkingStudieFinanciering: false,
          aanvragerIs181920: false,
          aanvragerIsTenminste21: true,
        },
        expectedOutputs: {
          heeftRechtOpHeusdenpas: false,
        },
        tags: ['example', 'edge-case', 'already-applied'],
      },
      {
        name: 'Edge Case - Not Heusden Resident',
        description: 'Meets income criteria but not living in Heusden',
        inputs: {
          geboortedatumAanvrager: '1975-05-15',
          geboortedatumPartner: '1978-03-22',
          dagVanAanvraag: '2026-02-13',
          aanvragerAlleenstaand: false,
          aanvragerHeeftKinderen: true,
          aanvragerHeeftAOWLeeftijd: false,
          aanvragerHeeftKind4Tm17: true,
          aanvragerInwonerHeusden: false, // Not living in Heusden
          gemeenteCodeWoonplaats: '0363', // Different municipality
          maandelijksBrutoInkomenAanvrager: 1500,
          maandelijksBrutoInkomenPartner: 1200,
          aanvragerUitkeringBaanbrekers: false,
          aanvragerVoedselbankpasDenBosch: false,
          aanvragerKwijtscheldingGemeentelijkeBelastingen: false,
          aanvragerSchuldhulptrajectKredietbankNederland: false,
          aanvragerDitKalenderjaarAlAangevraagd: false,
          aanvragerAanmerkingStudieFinanciering: false,
          aanvragerIs181920: false,
          aanvragerIsTenminste21: true,
        },
        expectedOutputs: {
          heeftRechtOpHeusdenpas: false,
        },
        tags: ['example', 'edge-case', 'non-resident'],
      },
    ],
  },
];

/**
 * Initialize default test cases for example templates
 * Only seeds if test cases don't already exist for a template
 *
 * @param endpoint - SPARQL endpoint URL
 */
export function initializeDefaultTestCases(endpoint: string = DEFAULT_ENDPOINT): void {
  try {
    let seededCount = 0;

    TEMPLATE_TEST_CASES.forEach(({ templateId, dmnIds, testCases }) => {
      // Check if test cases already exist for this chain
      const existingTestCases = getTestCasesForChain(endpoint, dmnIds);

      // Only seed if no test cases exist
      if (existingTestCases.length === 0) {
        testCases.forEach((testCase) => {
          saveTestCase(endpoint, dmnIds, testCase);
          seededCount++;
        });

        console.log(`[TestCases] Seeded ${testCases.length} test cases for ${templateId}`);
      }
    });

    if (seededCount > 0) {
      console.log(
        `[TestCases] Initialized ${seededCount} default test cases across ${TEMPLATE_TEST_CASES.length} templates`
      );
    }
  } catch (error) {
    console.error('[TestCases] Error initializing default test cases:', error);
  }
}

/**
 * Get test cases for a specific template
 *
 * @param templateId - Template identifier
 * @param endpoint - SPARQL endpoint URL
 * @returns Array of test cases
 */
export function getTemplateTestCases(
  templateId: string,
  endpoint: string = DEFAULT_ENDPOINT
): TestCase[] {
  const template = TEMPLATE_TEST_CASES.find((t) => t.templateId === templateId);
  if (!template) return [];

  return getTestCasesForChain(endpoint, template.dmnIds);
}
