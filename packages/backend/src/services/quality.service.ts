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
// Anchored on both sides against another hex digit (not against `\b`, which
// would not help here — `_` and `-` are themselves plausible token
// separators in this domain, e.g. `onderwerp_<guid>` or `uitv__<guid>`, so
// they must stay allowed immediately outside the match). This blocks a GUID
// from being read out of the middle of a longer hex/digit run — since
// digits are a subset of [0-9a-f], an all-numeric string of, say, 40 digits
// would otherwise always contain a matching 32-char substring — while still
// matching a GUID that is genuinely a standalone token bounded by `.`, `_`,
// `-`, start/end of string, or non-hex letters.
export const GUID_RE = new RegExp(
  `(?<![0-9a-f])(?:${H}{8}[-_]${H}{4}[-_]${H}{4}[-_]${H}{4}[-_]${H}{12}|${H}{32})(?![0-9a-f])`,
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

export interface DecisionNamingItem {
  name: string;
  class: IdClass;
}

export interface InputNamingItem {
  name: string;
  class: IdClass;
  /** The input's own `vraagTekst`, resolved through its `uitvoeringsregelRef`; `null` if unresolved. */
  question: string | null;
}

export interface DecisionNamingSplit extends NamingSplit {
  items: DecisionNamingItem[];
}

export interface InputNamingSplit extends NamingSplit {
  items: InputNamingItem[];
}

export interface DmnNamingStats {
  decisions: DecisionNamingSplit;
  inputs: InputNamingSplit;
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
 *
 * Returns both the opening tag (for attributes, e.g. `name=`) and the
 * element's inner content — everything between the opening and closing tag,
 * `''` for a self-closing element or one whose closer could not be found.
 * The inner content is what lets a caller look inside `<dmn:inputData>` for
 * its nested `<dmn:extensionElements>`/`uitv:uitvoeringsregelRef`, and inside
 * `<uitv:uitvoeringsregel>` for its `uitv:vraagTekst`.
 */
function matchTag(xml: string, tag: string): { open: string; inner: string }[] {
  const out: { open: string; inner: string }[] = [];
  const re = new RegExp(`<(?:\\w+:)?${tag}\\s`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const end = xml.indexOf('>', m.index);
    if (end === -1) continue;
    const open = xml.slice(m.index, end + 1);
    // `<decisionTable`/`<dmn:decisionTable` also starts with `<decision`/
    // `<dmn:decision`; compare the qualified name with any namespace prefix
    // stripped against the exact tag being measured. The same guard keeps
    // `<uitv:uitvoeringsregels>` (plural, the questionnaire wrapper) from
    // being read as a `uitvoeringsregel`.
    const qualifiedName = open.slice(1).split(/[\s>]/)[0] ?? '';
    const localName = qualifiedName.includes(':') ? qualifiedName.split(':')[1] : qualifiedName;
    if (localName !== tag) continue;

    let inner = '';
    if (!/\/>\s*$/.test(open)) {
      const rest = xml.slice(end + 1);
      const closeMatch = new RegExp(`<\\/(?:\\w+:)?${tag}>`).exec(rest);
      if (closeMatch) {
        inner = rest.slice(0, closeMatch.index);
        re.lastIndex = end + 1 + closeMatch.index + closeMatch[0].length;
      }
    }
    out.push({ open, inner });
  }
  return out;
}

// vraagTekst content is CDATA — a `<[^>]+>` strip would eat it. The `uitv:`
// prefix is optional too, for the same reason as `matchTag` above.
const VRAAGTEKST_RE =
  /<(?:\w+:)?vraagTekst[^>]*>\s*(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?\s*<\/(?:\w+:)?vraagTekst>/;

// An inputData's own `<uitv:uitvoeringsregelRef href="#UitvId0001"/>`, inside
// its `<dmn:extensionElements>`. The `#` is a same-document fragment marker,
// not part of the uitvoeringsregel's own `id`.
const UITVOERINGSREGEL_REF_RE = /<(?:\w+:)?uitvoeringsregelRef\b[^>]*\bhref="#?([^"]*)"/;

function split(names: string[]): NamingSplit {
  const opaque = names.filter((n) => GUID_RE.test(n)).length;
  return { total: names.length, semantic: names.length - opaque, opaque };
}

export function measureDmn(xml: string): DmnNamingStats {
  const nameOf = (open: string) => (open.match(/\bname="([^"]*)"/) || [])[1] ?? '';

  const decisionNames = matchTag(xml, 'decision').map((t) => nameOf(t.open));
  const decisionItems: DecisionNamingItem[] = decisionNames.map((name) => ({
    name,
    // No resolution path exists anywhere in this codebase for an opaque
    // *decision* name — unlike an input, whose question can recover it.
    class: classifyName(name, false),
  }));

  // uitvoeringsregel id -> its own vraagTekst, resolved once for the whole
  // document (the questionnaire lives in one place, in extensionElements),
  // then looked up per input below.
  const questionById = new Map<string, string>();
  for (const { open, inner } of matchTag(xml, 'uitvoeringsregel')) {
    const id = (open.match(/\bid="([^"]*)"/) || [])[1];
    if (!id) continue;
    const text = VRAAGTEKST_RE.exec(inner)?.[1]?.trim();
    if (text) questionById.set(id, text);
  }

  const inputTags = matchTag(xml, 'inputData');
  const inputNames = inputTags.map((t) => nameOf(t.open));
  const inputItems: InputNamingItem[] = inputTags.map(({ open, inner }) => {
    const name = nameOf(open);
    const refId = UITVOERINGSREGEL_REF_RE.exec(inner)?.[1] ?? null;
    const question = (refId && questionById.get(refId)) || null;
    return { name, class: classifyName(name, question !== null), question };
  });

  const imowRefs = [
    ...new Set([...xml.matchAll(/nl\.imow-[a-z0-9]+\.[a-zA-Z]+\.[0-9a-f]{6,}/g)].map((m) => m[0])),
  ];

  return {
    decisions: { ...split(decisionNames), items: decisionItems },
    inputs: { ...split(inputNames), items: inputItems },
    imowRefs,
  };
}

/**
 * The per-DMN measurements: how the decisions and inputs of ONE rule set's
 * DMN are named, and how many of that DMN's own IMOW refs resolve.
 * `null` when the rule set itself is absent, or its DMN could not be
 * extracted — never fabricated as zero counts, which would say "measured and
 * found nothing" for a rule set that was never measured at all.
 */
export interface RuleSetQuality {
  decisionNaming: DecisionNamingSplit;
  inputNaming: InputNamingSplit;
  labelCoverage: { inputs: number; withQuestion: number };
  refResolvability: { total: number; resolved: number; dangling: number };
}

export interface QualityProfile {
  urn: string;
  activityIdentity: IdClass;
  legalTraceability: { rules: number; withWId: number; withArticleText: number };
  crossLayerConsistency: { sharedObjects: string[] };
  ruleSets: {
    conclusie: RuleSetQuality | null;
    indieningsvereisten: RuleSetQuality | null;
  };
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

  const conclusieMeasured = d.decisionCriteria?.dmn ? measureDmn(d.decisionCriteria.dmn) : null;
  const indieningsvereistenMeasured = d.submissionRequirements?.dmn
    ? measureDmn(d.submissionRequirements.dmn)
    : null;

  // Every locatie the dossier resolved to a readable name.
  const resolvedRefs = new Set(
    (d.legalSource?.juridischeRegels ?? [])
      .flatMap((r) => r.locaties)
      .filter((l) => l.naam !== null)
      .map((l) => l.identificatie)
  );

  // refResolvability is per rule set — its own refs only.
  const toRuleSetQuality = (measured: DmnNamingStats | null): RuleSetQuality | null => {
    if (!measured) return null;
    const withQuestion = measured.inputs.items.filter((i) => i.question !== null).length;
    const resolved = measured.imowRefs.filter((ref) => resolvedRefs.has(ref));
    const dangling = measured.imowRefs.filter((ref) => !resolvedRefs.has(ref));
    return {
      decisionNaming: measured.decisions,
      inputNaming: measured.inputs,
      labelCoverage: { inputs: measured.inputs.total, withQuestion },
      refResolvability: {
        total: measured.imowRefs.length,
        resolved: resolved.length,
        dangling: dangling.length,
      },
    };
  };

  // Cross-layer consistency is a THREE-layer check — RTR, annotations and
  // DMN — not the two `resolved` above already covers. A ref resolved only
  // via the annotation layer (RTR never listed it under the activity's own
  // `locaties`) is not "the same object reached two different ways"; it is
  // one layer's claim, unconfirmed by the third. It stays activity-level and
  // considers refs from BOTH DMNs — a ref could equally well be embedded in
  // either rule set's decision logic.
  const allDmnRefs = [
    ...new Set([
      ...(conclusieMeasured?.imowRefs ?? []),
      ...(indieningsvereistenMeasured?.imowRefs ?? []),
    ]),
  ];
  const rtrLocatieSet = new Set(d.rtrLocaties ?? []);
  const sharedObjects = allDmnRefs.filter((ref) => resolvedRefs.has(ref) && rtrLocatieSet.has(ref));

  const rules = d.legalSource?.juridischeRegels ?? [];

  return {
    urn: d.urn,
    activityIdentity,
    legalTraceability: {
      rules: rules.length,
      withWId: rules.filter((r) => r.wId !== null).length,
      withArticleText: rules.filter((r) => r.articleText !== null).length,
    },
    crossLayerConsistency: { sharedObjects },
    ruleSets: {
      conclusie: toRuleSetQuality(conclusieMeasured),
      indieningsvereisten: toRuleSetQuality(indieningsvereistenMeasured),
    },
  };
}
