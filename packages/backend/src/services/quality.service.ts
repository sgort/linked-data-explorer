// packages/backend/src/services/quality.service.ts

/**
 * Scores how legible an activity's chain is.
 *
 * Two axes, never one number: LEGIBILITY (readable as it stands?) and
 * RECOVERABILITY (if not, can the dossier resolve it, and from where?).
 * A single headline grade is deliberately not produced — the profile exists
 * to compare activities and municipalities, and a grade flattens exactly the
 * differences being compared.
 *
 * Pure: no I/O, so it is trivially testable and the scoring rules live in one
 * readable place.
 */

import type { Dossier } from './dossier.service';

/**
 * A GUID with EITHER separator, or with no separator at all.
 * `normalizeDmnForOperaton` rewrites hyphens to underscores to make names
 * FEEL-safe, so a hyphen-only detector reports 0% opacity on a DMN that is
 * in fact mostly opaque. Separately, IMOW URN local names are 32 contiguous
 * hex characters with no separator at all (e.g.
 * `180a63f795be43bf8683a480e75deb84`) — the same form the `imowRefs` regex
 * below already has to handle — so a separator-only pattern misses exactly
 * the GUID-named activities this profile exists to flag.
 */
const H = '[0-9a-f]';
export const GUID_RE = new RegExp(
  `(?:${H}{8}[-_]${H}{4}[-_]${H}{4}[-_]${H}{4}[-_]${H}{12}|${H}{32})`,
  'i'
);

export type IdClass = 'semantic' | 'opaque-resolvable' | 'opaque-dangling';

export function classifyName(name: string, resolvable: boolean): IdClass {
  if (!GUID_RE.test(name)) return 'semantic';
  return resolvable ? 'opaque-resolvable' : 'opaque-dangling';
}

export interface NamingSplit {
  total: number;
  semantic: number;
  opaque: number;
}

export interface DmnNamingStats {
  decisions: NamingSplit;
  inputs: NamingSplit;
  questions: string[];
  imowRefs: string[];
}

/**
 * The rest of this codebase deliberately treats the `dmn:` prefix as
 * optional (see `dso.service.ts`'s `/<(?:dmn:)?definitions/` and the
 * `(?:\w+:)?` matches throughout `normalizeDmnForOperaton`) — an
 * un-prefixed DMN is not itself an error, `normalizeDmnForOperaton` never
 * adds the prefix, and a hardcoded `dmn:` here silently measured such a DMN
 * as `decisions: {total: 0, ...}`, reporting nothing opaque rather than
 * reporting the truth.
 */
function openTags(xml: string, tag: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<(?:\\w+:)?${tag}\\s`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const end = xml.indexOf('>', m.index);
    if (end === -1) continue;
    const open = xml.slice(m.index, end + 1);
    // `<decisionTable`/`<dmn:decisionTable` also starts with `<decision`/
    // `<dmn:decision`; compare the qualified name with any namespace prefix
    // stripped against the exact tag being measured.
    const qualifiedName = open.slice(1).split(/[\s>]/)[0] ?? '';
    const localName = qualifiedName.includes(':') ? qualifiedName.split(':')[1] : qualifiedName;
    if (localName !== tag) continue;
    out.push(open);
  }
  return out;
}

function split(names: string[]): NamingSplit {
  const opaque = names.filter((n) => GUID_RE.test(n)).length;
  return { total: names.length, semantic: names.length - opaque, opaque };
}

export function measureDmn(xml: string): DmnNamingStats {
  const nameOf = (open: string) => (open.match(/\bname="([^"]*)"/) || [])[1] ?? '';
  const decisions = openTags(xml, 'decision').map(nameOf);
  const inputs = openTags(xml, 'inputData').map(nameOf);

  // vraagTekst content is CDATA — a `<[^>]+>` strip would eat it. The `uitv:`
  // prefix is optional too, for the same reason as `openTags` above.
  const questions = [
    ...xml.matchAll(
      /<(?:\w+:)?vraagTekst[^>]*>\s*(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?\s*<\/(?:\w+:)?vraagTekst>/g
    ),
  ]
    .map((m) => m[1]?.trim() ?? '')
    .filter(Boolean);

  const imowRefs = [
    ...new Set([...xml.matchAll(/nl\.imow-[a-z0-9]+\.[a-zA-Z]+\.[0-9a-f]{6,}/g)].map((m) => m[0])),
  ];

  return { decisions: split(decisions), inputs: split(inputs), questions, imowRefs };
}

export interface QualityProfile {
  urn: string;
  activityIdentity: IdClass;
  decisionNaming: NamingSplit | null;
  inputNaming: NamingSplit | null;
  labelCoverage: { inputs: number; withQuestion: number } | null;
  refResolvability: { total: number; resolved: number; dangling: number };
  legalTraceability: { rules: number; withWId: number; withArticleText: number };
  crossLayerConsistency: { sharedObjects: string[] };
}

export function profileDossier(d: Dossier): QualityProfile {
  const localName = d.urn.split('.').slice(3).join('.') || d.urn;
  // Resolvability must be earned, not assumed: an opaque URN is only
  // "opaque-resolvable" if a readable name actually exists elsewhere on the
  // dossier (RTR omschrijving or the annotation's naam). A hardcoded `true`
  // here would make every opaque activity look recoverable even when nothing
  // recovers it — do not revert this to `true`.
  const hasReadableName = Boolean(d.omschrijving ?? d.annotation?.naam);
  const activityIdentity = classifyName(localName, hasReadableName);

  const dmn = d.decisionCriteria?.dmn ?? null;
  const measured = dmn ? measureDmn(dmn) : null;

  // Every locatie the dossier resolved to a readable name.
  const resolvedRefs = new Set(
    (d.legalSource?.juridischeRegels ?? [])
      .flatMap((r) => r.locaties)
      .filter((l) => l.naam !== null)
      .map((l) => l.identificatie)
  );

  const dmnRefs = measured?.imowRefs ?? [];
  const resolved = dmnRefs.filter((ref) => resolvedRefs.has(ref));
  const dangling = dmnRefs.filter((ref) => !resolvedRefs.has(ref));

  // Cross-layer consistency is a THREE-layer check — RTR, annotations and
  // DMN — not the two `resolved` above already covers. A ref resolved only
  // via the annotation layer (RTR never listed it under the activity's own
  // `locaties`) is not "the same object reached two different ways"; it is
  // one layer's claim, unconfirmed by the third.
  const rtrLocatieSet = new Set(d.rtrLocaties ?? []);
  const sharedObjects = resolved.filter((ref) => rtrLocatieSet.has(ref));

  const rules = d.legalSource?.juridischeRegels ?? [];

  return {
    urn: d.urn,
    activityIdentity,
    decisionNaming: measured?.decisions ?? null,
    inputNaming: measured?.inputs ?? null,
    labelCoverage: measured
      ? { inputs: measured.inputs.total, withQuestion: measured.questions.length }
      : null,
    refResolvability: {
      total: dmnRefs.length,
      resolved: resolved.length,
      dangling: dangling.length,
    },
    legalTraceability: {
      rules: rules.length,
      withWId: rules.filter((r) => r.wId !== null).length,
      withArticleText: rules.filter((r) => r.articleText !== null).length,
    },
    crossLayerConsistency: { sharedObjects },
  };
}
