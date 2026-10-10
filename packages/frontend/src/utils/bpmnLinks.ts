/**
 * How a shell process names its subprocesses: the calledElement of each of its
 * call activities. Shared by the BPMN Modeler (classifying shells and
 * subprocesses) and the ROPA editor (nesting a subprocess record under its
 * shell, #173), so both read the link the same way.
 */

/** Every calledElement value found in callActivity elements, in document order. */
export const extractCallActivityTargets = (xml: string): string[] => {
  const targets: string[] = [];
  const re = /calledElement="([^"]+)"/g;
  let m;
  while ((m = re.exec(xml)) !== null) targets.push(m[1]);
  return targets;
};
