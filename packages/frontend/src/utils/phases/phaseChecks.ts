/**
 * What the deploy dialog says about a process's phases (#242). Only mixing
 * the two schemes blocks a deploy: RBA would read one and silently ignore the
 * other. Everything else is a warning about a stepper that will look wrong.
 */
import { computePhaseView } from './assignPhases';
import { graphFromXml } from './phaseGraph';
import { phaseCodeLabel } from './phaseSet';

export type PhaseFindingCode =
  | 'MIXED_SCHEMES'
  | 'NO_MARKERS'
  | 'UNKNOWN_CODE'
  | 'EMPTY_PHASE'
  | 'SKIPPED_ENTRIES'
  | 'IGNORED_NODE_KIND';

export interface PhaseFinding {
  severity: 'error' | 'warning';
  code: PhaseFindingCode;
  message: string;
}

export function checkPhases(xml: string): PhaseFinding[] {
  const graph = graphFromXml(xml);
  const view = computePhaseView(graph);
  const findings: PhaseFinding[] = [];

  if (view.scheme === 'declared' && graph.nodes.some((n) => n.awbPhase !== undefined)) {
    findings.push({
      severity: 'error',
      code: 'MIXED_SCHEMES',
      message:
        'The process declares its own phases (ronl:phases) and also has Awb phase markers (ronl:awbPhase). RBA reads only one scheme; remove the other before deploying.',
    });
  }
  if (view.scheme !== 'none' && view.byNode.size === 0 && view.unknownMarkers.length === 0) {
    findings.push({
      severity: 'warning',
      code: 'NO_MARKERS',
      message: 'Phases are set on the process but no node starts a phase, so RBA shows no stepper.',
    });
  }
  if (view.unknownMarkers.length > 0) {
    findings.push({
      severity: 'warning',
      code: 'UNKNOWN_CODE',
      message: `These phase markers name a phase the process does not have, so RBA ignores them: ${view.unknownMarkers
        .map((m) => `${m.id} (${m.code})`)
        .join(', ')}.`,
    });
  }
  if (view.scheme === 'declared' && view.set && view.byNode.size > 0) {
    const set = view.set;
    const used = new Set([...view.byNode.values()].map((a) => a.code));
    const empty = set.phases.filter((p) => !used.has(p.code));
    if (empty.length > 0) {
      findings.push({
        severity: 'warning',
        code: 'EMPTY_PHASE',
        message: `No node falls into ${empty
          .map((p) => `${phaseCodeLabel(set, p.code)} (${p.name})`)
          .join(', ')}, so that step of the stepper never lights up.`,
      });
    }
  }
  if (view.skippedEntries.length > 0) {
    findings.push({
      severity: 'warning',
      code: 'SKIPPED_ENTRIES',
      message: `RBA skips these entries of ronl:phases (no code, no name, or a repeated code): ${view.skippedEntries.join(', ')}.`,
    });
  }
  if (graph.ignoredMarkers.length > 0) {
    findings.push({
      severity: 'warning',
      code: 'IGNORED_NODE_KIND',
      message: `These elements carry a phase marker that RBA does not count: ${graph.ignoredMarkers
        .map((m) => `${m.id} (${m.kind})`)
        .join(', ')}.`,
    });
  }
  return findings;
}
