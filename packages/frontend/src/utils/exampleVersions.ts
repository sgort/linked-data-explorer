/**
 * Example version registry
 *
 * Controls when existing users receive updated copies of readonly example files.
 * The seeding logic in BpmnModeler, FormEditor and DocumentComposer compares the stored version
 * against the value here; if the stored version is lower (or absent), the file
 * is re-fetched from public/examples/flevoland/ and the localStorage record is
 * overwritten in-place.
 *
 * HOW TO TRIGGER A RE-SEED FOR ALL USERS
 * ---------------------------------------
 * 1. Edit the file in packages/frontend/public/examples/flevoland/
 * 2. Increment the corresponding number below
 * 3. Deploy — existing users will receive the updated example on next page load
 *
 * Versions start at 1. Increment by 1 for each meaningful change.
 */
export const EXAMPLE_VERSIONS: Record<string, number> = {
  // BPMN processes
  example_awb_process: 9, // v9: DMN results as plain variables, no serialised maps (#273)
  example_tree_felling: 11, // v11: Dutch runtime texts (finalMessage, replacementInfo; #260)
  example_awb_zorgtoeslag: 7, // v7: DMN results as plain variables, no serialised maps (#273)
  example_zorgtoeslag_provisional: 9, // v9: DMN results as plain variables, no serialised maps (#273)
  example_zorgtoeslag_final: 7, // v7: swimlanes + Dutch names
  example_hr_capacity_nl: 5, // v5: DMN results as plain variables, no serialised maps (#273)
  example_thuisbatterij_aanvraag: 4, // v4: own completeness check, reachable Awb 4:5 path (#206)
  example_thuisbatterij_decision: 3, // v3: DMN results as plain variables, no serialised maps (#273)
  example_besluit_gb: 3, // v3: Neem besluit renders the authority's own besluit (#246)

  // Camunda Forms
  example_kapvergunning_start: 5, // v5: translated to Dutch, tagged nl (#254 item 1)
  example_tree_felling_review: 5, // v5: translated to Dutch, tagged nl (#254 item 1)
  example_kapvergunning_missing_info: 1,
  example_awb_notify_applicant: 5, // v5: translated to Dutch, tagged nl (#254 item 1)
  example_zorgtoeslag_notify_applicant: 4, // v4: force re-seed (see above)
  example_zorgtoeslag_provisional_start: 4, // v4: force re-seed (see above)
  example_zorgtoeslag_provisional_review: 4, // v4: force re-seed (see above)
  example_zorgtoeslag_final_review: 4, // v4: force re-seed (see above)
  example_zorgtoeslag_missing_info: 1,
  example_thuisbatterij_start: 1,
  example_thuisbatterij_review: 1,
  example_thuisbatterij_notify_applicant: 1,
  example_thuisbatterij_missing_info: 2, // v2: shows missingFields, records the supplied values (#206)
  example_besluit_gb_sjabloon_kiezen: 1,
  example_besluit_gb_sjabloon_invullen: 1,
  example_besluit_gb_advies_toetsing: 1,
  example_besluit_gb_voorwaarden: 1,
  example_besluit_gb_memorandum: 1,
  example_besluit_gb_akkoord: 1,
  example_besluit_gb_indienen: 1,
  example_besluit_gb_ondertekenen: 1,
  example_besluit_gb_escalatie: 1,
  example_besluit_gb_besluit_nemen: 2, // v2: asks for the besluitnemer (#246)
  example_besluit_gb_registreren: 1,
  example_besluit_gb_archiveren: 1,

  // HR-capacity forms (Dutch)
  example_hr_capacity_intake_nl: 1,
  example_hr_capacity_staffing_nl: 1,
  example_hr_capacity_hiring_nl: 1,
  example_hr_capacity_submit_nl: 1,
  example_hr_capacity_board_decision_nl: 1,
  example_hr_capacity_reconsideration_nl: 1,
  example_hr_capacity_handover_nl: 1,
  example_hr_capacity_register_reservation_nl: 1,

  // Document templates (DocumentComposer's DEFAULT_TEMPLATES), keyed by
  // template id. Every default template needs an entry: exampleVersions.test.ts
  // checks. Until #254 item 7 templates seeded by presence only, and the two
  // HR-capacity keys that stood here matched no template id and were read by
  // nothing.
  example_treefelling_beschikking: 2, // v2: tagged nl, as its text always was (#254 item 1)
  example_zorgtoeslag_provisional_beschikking: 1,
  example_zorgtoeslag_final_beschikking: 1,
  example_dvtp_consent_receipt: 1,
  'board-decision-notification-nl': 1,
  'capacity-claim-handover-nl': 1,
  thuisbatterij_subsidie_beschikking: 1,
  'besluit-gb-besluit': 1,
  'besluit-gb-besluit-bestuur': 1,

  // DvTP consent bundle
  example_dvtp_toestemming: 4, // v4: DMN results as plain variables, no serialised maps (#273)
  example_dvtp_consent_start: 2, // v2: organization=bzk tagging
  example_dvtp_consent_info: 2, // v2: organization=bzk tagging
  example_dvtp_consent_decision: 2, // v2: organization=bzk tagging
};

const STORAGE_KEY = 'linkedDataExplorer_exampleVersions';

/**
 * Returns the version of an example currently stored in the user's localStorage.
 * Returns 0 if the example has never been seeded (triggers a fresh seed).
 */
export function getStoredVersion(exampleId: string): number {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return 0;
    const versions: Record<string, number> = JSON.parse(stored);
    return versions[exampleId] ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Records that the given version of an example has been seeded.
 */
export function setStoredVersion(exampleId: string, version: number): void {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const versions: Record<string, number> = stored ? JSON.parse(stored) : {};
    versions[exampleId] = version;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(versions));
  } catch {
    // Non-fatal — worst case the user gets re-seeded on next visit
  }
}
