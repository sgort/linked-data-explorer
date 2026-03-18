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
  example_awb_process: 2, // v2: removed camunda:assignee="demo", added candidateGroups="caseworker"
  example_tree_felling: 2, // v2: extracted from bpmnTemplates.ts, no logic changes
  example_awb_zorgtoeslag: 1, // v1: initial release — AWB shell wired for zorgtoeslag provisional
  example_zorgtoeslag_provisional: 1, // v1: initial release — provisional entitlement subprocess
  example_zorgtoeslag_final: 1, // v1: initial release — final settlement subprocess (message start)

  // Camunda Forms
  example_kapvergunning_start: 1,
  example_tree_felling_review: 1,
  example_awb_notify_applicant: 1,
  example_zorgtoeslag_notify_applicant: 1, // v1: Phase 6 notify form for AwbZorgtoeslagProcess
  example_zorgtoeslag_provisional_start: 1, // v1: citizen start form for ZorgtoeslagProvisionalSubProcess
  example_zorgtoeslag_provisional_review: 1, // v1: Sub_CaseReview form for ZorgtoeslagProvisionalSubProcess
  example_zorgtoeslag_final_review: 1, // v1: Sub_CaseReview form for ZorgtoeslagFinalSubProcess
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
