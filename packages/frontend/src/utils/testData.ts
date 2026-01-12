/**
 * Test data for DMN chain execution
 * Supports incremental chain building
 */

export const DMN_TEST_DATA: Record<string, Record<string, unknown>> = {
  SVB_LeeftijdsInformatie: {
    dagVanAanvraag: '2025-01-24',
    geboortedatumAanvrager: '1980-01-23',
    geboortedatumPartner: null,
  },

  SZW_BijstandsnormInformatie: {
    aanvragerAlleenstaand: true,
    aanvragerHeeftKinderen: true,
    aanvragerHeeftAOWLeeftijd: false,
  },

  RONL_HeusdenpasEindresultaat: {
    aanvragerInwonerHeusden: true,
    aanvragerHeeftKind4Tm17: true,
    maandelijksBrutoInkomenAanvrager: 1400,
    aanvragerUitkeringBaanbrekers: false,
    aanvragerVoedselbankpasDenBosch: false,
    aanvragerKwijtscheldingGemeentelijkeBelastingen: false,
    aanvragerSchuldhulptrajectKredietbankNederland: false,
    aanvragerDitKalenderjaarAlAangevraagd: false,
    aanvragerAanmerkingStudieFinanciering: false,
    aanvragerIs181920: false,
    aanvragerIsTenminste21: true,
  },
};

/**
 * Get combined test data for a list of DMN identifiers
 *
 * @param dmnIds - Array of DMN identifiers
 * @returns Combined test data object
 */
export function getCombinedTestData(dmnIds: string[]): Record<string, unknown> {
  const combined: Record<string, unknown> = {};

  dmnIds.forEach((dmnId) => {
    const dmnData = DMN_TEST_DATA[dmnId];
    if (dmnData) {
      Object.assign(combined, dmnData);
    }
  });

  return combined;
}
