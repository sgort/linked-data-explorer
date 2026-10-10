/**
 * A stored process is unique per organisation and process id (#171), so the
 * Modeler sometimes has to give a process another id: a new process starts
 * from a template whose id every other new process shares, and an import may
 * carry an id the organisation already uses.
 */

/** An XML NCName, which is what a BPMN element id must be. */
const PROCESS_ID = /^[A-Za-z_][A-Za-z0-9_.-]*$/;

export const isValidProcessId = (id: string): boolean => PROCESS_ID.test(id);

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Renames a process in BPMN XML: the `<process>` element's own id, a
 * collaboration participant's `processRef` and the diagram plane's
 * `bpmnElement`. Every other id is left alone, and so is the same string
 * anywhere else (a name, a documentation text, another element's id).
 */
export function renameProcessId(xml: string, from: string, to: string): string {
  if (!isValidProcessId(to)) throw new Error(`"${to}" is not a valid process id`);
  const old = escapeRegExp(from);
  return xml
    .replace(new RegExp(`(<(?:[\\w-]+:)?process\\b[^>]*\\sid=")${old}(")`, 'g'), `$1${to}$2`)
    .replace(new RegExp(`(\\sprocessRef=")${old}(")`, 'g'), `$1${to}$2`)
    .replace(
      new RegExp(`(<(?:[\\w-]+:)?BPMNPlane\\b[^>]*\\sbpmnElement=")${old}(")`, 'g'),
      `$1${to}$2`
    );
}

/** A process id no other new process has: the template's own id plus a timestamp. */
export const freshProcessId = (base: string, now: number = Date.now()): string => `${base}_${now}`;
