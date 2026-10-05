/**
 * What a Modeler deployment bundles alongside its BPMN: the subprocesses its
 * call activities name, and the forms and document templates the shell and
 * those subprocesses reference.
 *
 * The deploy dialog lists the bundle and the deploy itself sends it. Both used
 * to compute it with their own copy of each extractor, identical but for
 * indentation, so a fix to one (signatureRef, the comma-separated documentRef)
 * had to be made twice and could be made once. One copy now, used by both.
 *
 * The extractors scan the raw XML with a regex, deliberately: they run on the
 * exported model and on stored subprocess XML alike, neither of which is loaded
 * into a modeler.
 */
import { parseDocumentRefs } from './documentRefs';

/**
 * Find the `<process>` element in a parsed BPMN document, whatever namespace
 * prefix it carries.
 *
 * The previous lookup used a CSS *type* selector, which matches only the null
 * namespace — so it never matched the `<bpmn:process>` that real bpmn-js output
 * always emits, and every caller silently fell through to its own fallback. The
 * visible consequence was a deployment posting the literal string "process" as
 * its process key instead of the model's actual id, and sub-process lookups by
 * `calledElement` never matching.
 *
 * `getElementsByTagNameNS` matches on local name across every namespace, which
 * is what BPMN needs. There is no prefix-as-tag-name fallback because there is
 * nothing to fall back to: `DOMParser` rejects an undeclared prefix outright and
 * hands back a `<parsererror>` document, so a malformed model has no process
 * element to find under any lookup.
 */
export const findProcessElement = (doc: Document): Element | null =>
  doc.getElementsByTagNameNS('*', 'process')[0] ?? null;

/** The process id of a BPMN model given as XML, or undefined when it has none. */
export const findProcessId = (bpmnXml: string): string | undefined =>
  findProcessElement(new DOMParser().parseFromString(bpmnXml, 'text/xml'))?.getAttribute('id') ??
  undefined;

const unique = (values: string[]) => [...new Set(values)];

const extractFormRefs = (bpmnXml: string) =>
  unique([...bpmnXml.matchAll(/camunda:formRef="([^"]+)"/g)].map((m) => m[1]));

const extractDocumentRefs = (bpmnXml: string) =>
  unique(
    [
      ...bpmnXml.matchAll(/ronl:documentRef="([^"]+)"/g),
      // A signature task binds its template through signatureRef alone;
      // reading only documentRef left such a template out of the bundle.
      ...bpmnXml.matchAll(/ronl:signatureRef="([^"]+)"/g),
      // documentRef holds a comma-separated list, so the captured group is
      // split rather than used whole — otherwise a task with two documents
      // contributes one id that matches no template and bundles neither.
    ].flatMap((m) => parseDocumentRefs(m[1]))
  );

const extractCalledElements = (bpmnXml: string) =>
  unique([...bpmnXml.matchAll(/calledElement="([^"]+)"/g)].map((m) => m[1]));

export interface BundledSubProcess {
  filename: string;
  xml: string;
}

/**
 * The stored process each call activity names, matched on process id.
 *
 * The lookup ignores a record's status, and is safe only because an
 * e2e-fixtures subprocess carries its own `…E2E` key: an example shell can
 * never name it. public-example-fixture-parity.test.ts enforces that (#254
 * item 2). A called element no stored process provides is left out; the
 * engine then reports it at start.
 */
export const resolveSubProcesses = (
  shellXml: string,
  processes: ReadonlyArray<{ xml: string }>
): BundledSubProcess[] => {
  const out: BundledSubProcess[] = [];
  for (const calledElement of extractCalledElements(shellXml)) {
    const match = processes.find((p) => findProcessId(p.xml) === calledElement);
    if (match) out.push({ filename: `${calledElement}.bpmn`, xml: match.xml });
  }
  return out;
};

/** Every form and document template the shell and its subprocesses reference, once each. */
export const collectBundleRefs = (
  shellXml: string,
  subProcesses: ReadonlyArray<BundledSubProcess>
): { formRefs: string[]; documentRefs: string[] } => {
  const sources = [shellXml, ...subProcesses.map((sp) => sp.xml)];
  return {
    formRefs: unique(sources.flatMap(extractFormRefs)),
    documentRefs: unique(sources.flatMap(extractDocumentRefs)),
  };
};
