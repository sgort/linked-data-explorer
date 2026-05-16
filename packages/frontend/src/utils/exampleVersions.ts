/**
 * Example version registry
 *
 * Controls when existing users receive updated copies of readonly example files.
 * The seeding logic in BpmnModeler and FormEditor compares the stored version
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
  example_awb_process: 4, // v4: organization=flevoland tagging
  example_tree_felling: 5, // v5: organization=flevoland tagging
  example_awb_zorgtoeslag: 3, // v3: organization=toeslagen tagging
  example_zorgtoeslag_provisional: 4, // v4: organization=toeslagen tagging
  example_zorgtoeslag_final: 4, // v4: organization=toeslagen tagging
  example_hr_capacity_nl: 1, // v1: HR-capacity Dutch BPMN sibling (multilingualism release)

  // Camunda Forms
  example_kapvergunning_start: 4, // v4: force re-seed for ACC users with stale localStorage from v1.6.0 testing
  example_tree_felling_review: 4, // v4: force re-seed (see above)
  example_awb_notify_applicant: 4, // v4: force re-seed (see above)
  example_zorgtoeslag_notify_applicant: 4, // v4: force re-seed (see above)
  example_zorgtoeslag_provisional_start: 4, // v4: force re-seed (see above)
  example_zorgtoeslag_provisional_review: 4, // v4: force re-seed (see above)
  example_zorgtoeslag_final_review: 4, // v4: force re-seed (see above)

  // HR-capacity Dutch forms (multilingualism release)
  example_hr_capacity_intake_nl: 1,
  example_hr_capacity_staffing_nl: 1,
  example_hr_capacity_hiring_nl: 1,
  example_hr_capacity_submit_nl: 1,
  example_hr_capacity_board_decision_nl: 1,
  example_hr_capacity_reconsideration_nl: 1,
  example_hr_capacity_handover_nl: 1,
  example_hr_capacity_register_reservation_nl: 1,

  // HR-capacity Dutch documents (multilingualism release)
  example_hr_capacity_board_doc_nl: 1,
  example_hr_capacity_handover_doc_nl: 1,

  // DvTP consent bundle
  example_dvtp_toestemming: 2, // v2: organization=bzk tagging
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
