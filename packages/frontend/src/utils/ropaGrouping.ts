import { BpmnProcess } from '../types';
import { RopaRecord } from '../types/ropa.types';
import { extractCallActivityTargets } from './bpmnLinks';

/** A shell's RoPA record with the subprocess records its process calls. */
export interface RopaShellGroup {
  shell: RopaRecord;
  subprocesses: RopaRecord[];
}

export interface RopaGrouping {
  shells: RopaShellGroup[];
  /** Subprocess records no shell record calls: shown apart, never guessed (#173). */
  unlinked: RopaRecord[];
}

/**
 * Nests each subprocess record under the shell record whose process calls it,
 * reading the link the way the BPMN Modeler does: a shell's BPMN names its
 * subprocesses in its call activities (extractCallActivityTargets).
 *
 * A RoPA record carries only its process id, so the shell's stored process is
 * found by that id; when several stored processes share it (one per
 * organisation, #171), the calls of all of them count. A subprocess called by
 * two shells appears under both. Subprocesses keep the order of the shell's
 * call activities; shells keep the order they were given in.
 *
 * Records whose shell has no RoPA record, or whose process no stored shell
 * calls, go to `unlinked` rather than under whichever shell came last.
 */
export function groupRopaRecords(records: RopaRecord[], processes: BpmnProcess[]): RopaGrouping {
  const subsByProcessId = new Map<string, RopaRecord>();
  for (const r of records) {
    if (r.processLevel === 'subprocess') subsByProcessId.set(r.bpmnProcessId, r);
  }

  const placed = new Set<string>();
  const shells = records
    .filter((r) => r.processLevel === 'shell')
    .map((shell) => {
      const called = processes
        .filter((p) => p.bpmnProcessId === shell.bpmnProcessId)
        .flatMap((p) => extractCallActivityTargets(p.xml));
      const subprocesses = [...new Set(called)]
        .map((id) => subsByProcessId.get(id))
        .filter((r): r is RopaRecord => r !== undefined);
      for (const s of subprocesses) placed.add(s.id);
      return { shell, subprocesses };
    });

  const unlinked = records.filter((r) => r.processLevel === 'subprocess' && !placed.has(r.id));
  return { shells, unlinked };
}
