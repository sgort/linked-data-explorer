/**
 * `ronl:documentRef` carries a list, not a single id.
 *
 * A task can produce more than one deliverable — R2.2's "Opstellen concept VO"
 * yields both an Ontwerptoelichting and an Objectenboom, and the source PDF
 * draws several such clusters. The attribute was single-valued, so only the
 * first document of each task was ever modelled; the rest existed as authored
 * templates that no BPMN referenced and that the deploy bundle therefore never
 * included.
 *
 * Comma-separated rather than child elements or a second attribute: BPMN
 * already carries lists this way (`camunda:candidateGroups`), every existing
 * single-id BPMN stays valid and needs no migration, and the bundle extractor
 * — which scans the raw XML with a regex — keeps working with only a split
 * added.
 *
 * Whitespace around a comma is tolerated on read and dropped on write, so a
 * hand-edited `"a, b"` behaves the same as `"a,b"`.
 */

/** Ids in a `ronl:documentRef` value, in order, with blanks dropped. */
export function parseDocumentRefs(value: string | undefined | null): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
}

/**
 * The attribute value for a list of ids, or `undefined` when there are none —
 * which is what `modeling.updateProperties` needs to remove the attribute
 * rather than write an empty string.
 */
export function formatDocumentRefs(ids: string[]): string | undefined {
  const cleaned = ids.map((id) => id.trim()).filter((id) => id.length > 0);
  return cleaned.length > 0 ? cleaned.join(',') : undefined;
}
