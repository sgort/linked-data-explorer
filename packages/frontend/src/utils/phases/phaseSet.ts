/**
 * The phases a process moves through, for RBA's caseworker stepper (#242).
 * RBA is the reference for every rule here:
 * ronl-business-api/packages/backend/src/rip-swimlane/bpmn-swimlane.ts
 * (declaredPhaseSet, AWB_PHASE_SET) and packages/shared/src/awb-phases.ts.
 */

export interface Phase {
  code: string;
  name: string;
}

/** 'declared': the process lists its own phases in ronl:phases. 'awb': RBA's built-in table. */
export type Scheme = 'declared' | 'awb';

export interface PhaseSet {
  scheme: Scheme;
  label: string;
  phases: Phase[];
}

export interface ParsedPhases {
  /** Undefined when nothing usable was declared. */
  set?: PhaseSet;
  /** Non-blank entries RBA would skip: no code, no name, or a repeated code. */
  skipped: string[];
}

export const DEFAULT_PHASE_LABEL = 'Fase';

/** Copied from ronl-business-api packages/shared/src/awb-phases.ts; RBA is the source. */
export const AWB_PHASES: readonly Phase[] = [
  { code: '1', name: 'Rechtsbetrekking' },
  { code: '2', name: 'Ontvangst' },
  { code: '3', name: 'Ontvankelijkheid' },
  { code: '4+5', name: 'Behandeling en besluit' },
  { code: '6', name: 'Bekendmaking' },
  { code: '7', name: 'Betaling' },
  { code: '8', name: 'Ketenproces' },
  { code: 'archivering', name: 'Archivering' },
];

export const AWB_PHASE_SET: PhaseSet = {
  scheme: 'awb',
  label: 'Awb-fase',
  phases: [...AWB_PHASES],
};

/**
 * RBA's declaredPhaseSet: entries split on ';', each at its FIRST ':' (a name
 * may contain ':'), both parts trimmed; an entry without a code or a name, or
 * repeating a code, is skipped.
 */
export function parseDeclaredPhases(
  phases: string | undefined,
  label: string | undefined
): ParsedPhases {
  const effectiveLabel = label?.trim() ? label.trim() : DEFAULT_PHASE_LABEL;
  const result: Phase[] = [];
  const skipped: string[] = [];
  for (const raw of (phases ?? '').split(';')) {
    if (raw.trim() === '') continue;
    const at = raw.indexOf(':');
    const code = at < 0 ? '' : raw.slice(0, at).trim();
    const name = at < 0 ? '' : raw.slice(at + 1).trim();
    if (code === '' || name === '' || result.some((p) => p.code === code)) {
      skipped.push(raw.trim());
      continue;
    }
    result.push({ code, name });
  }
  return {
    set:
      result.length > 0 ? { scheme: 'declared', label: effectiveLabel, phases: result } : undefined,
    skipped,
  };
}

export const serializePhases = (phases: Phase[]): string =>
  phases.map((p) => `${p.code}:${p.name}`).join(';');

/** A code may not be empty, carry surrounding spaces, or contain the separators. */
export const isValidPhaseCode = (code: string): boolean =>
  code !== '' && code === code.trim() && !/[:;]/.test(code);

/** ';' separates entries, so a name may not contain it. */
export const cleanPhaseName = (name: string): string =>
  name.replace(/;/g, '').replace(/\s+/g, ' ').trim();

export function codeFromName(name: string, taken: Iterable<string>): string {
  const base =
    name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'fase';
  const used = new Set(taken);
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

/** The label RBA shows for a phase: "Fase 4+5" / "Archiefwet" for Awb, "<label> <n>" for declared. */
export function phaseCodeLabel(set: PhaseSet, code: string): string {
  if (set.scheme === 'awb') return code === 'archivering' ? 'Archiefwet' : `Fase ${code}`;
  const index = set.phases.findIndex((p) => p.code === code);
  return `${set.label} ${index + 1}`;
}
