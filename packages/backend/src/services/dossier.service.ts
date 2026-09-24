// packages/backend/src/services/dossier.service.ts

/**
 * The only place the four links join.
 *
 * legal source -> annotation -> decision criteria -> submission requirements,
 * assembled from the RTR, Ozon Presenteren v8 and Uitvoeren Gegevens.
 */

import * as dsoService from './dso.service';
import * as ozonService from './ozon.service';
import type { DsoEnv } from './dso.service';
import type { OzonAnnotaties } from './ozon.service';
import { logger } from '../utils/logger';

export type Bestuurslaag = 'gemeente' | 'provincie' | 'waterschap' | 'rijk';

/**
 * The STOP `regelingtype` an authority at each bestuurslaag actually
 * publishes its legal rules in — the instrument step 2 searches for. A
 * gemeente's rules live in its omgevingsplan; a provincie, waterschap or
 * rijk authority never publishes one, so filtering by any other level's
 * type there finds nothing.
 */
export const REGELINGTYPE_BY_BESTUURSLAAG: Record<Bestuurslaag, string> = {
  gemeente: '/join/id/stop/regelingtype_003', // Omgevingsplan
  provincie: '/join/id/stop/regelingtype_004', // Omgevingsverordening
  waterschap: '/join/id/stop/regelingtype_005', // Waterschapsverordening
  rijk: '/join/id/stop/regelingtype_001', // AMvB (Algemene Maatregel van Bestuur)
};

/**
 * How many candidate regelingen of the preferred type get their annotation
 * graph fetched while probing for one that actually names this activity.
 * Each fetch can be multi-megabyte, so this stays small.
 */
const MAX_REGELING_ATTEMPTS = 3;

/**
 * Safety cap on how many pages of an authority's regelingen search this
 * reads before giving up — mirrors `MAX_ACTIVITEITEN_OIN_PAGES` in
 * `dso.service.ts`'s `getActiviteitenByOin`. 10 pages of 100 = 1000
 * regelingen; above that the search is truncated rather than read without
 * bound.
 */
const MAX_REGELINGEN_PAGES = 10;

interface RegelingCandidate {
  identificatie: string;
  type?: { code: string };
  officieleTitel?: string;
}

interface OzonPageInfo {
  number: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

/**
 * `gm0995` -> gemeente, `pv24` -> provincie, `ws...` -> waterschap,
 * `mnre1034` -> rijk. Fallback for when the RTR response carries no
 * `bestuursorgaan.bestuurslaag` of its own.
 */
function bestuurslaagFromCode(code: string): Bestuurslaag | null {
  if (code.startsWith('gm')) return 'gemeente';
  if (code.startsWith('pv')) return 'provincie';
  if (code.startsWith('ws')) return 'waterschap';
  if (code.startsWith('mnre')) return 'rijk';
  return null;
}

const KNOWN_BESTUURSLAGEN = new Set<string>(Object.keys(REGELINGTYPE_BY_BESTUURSLAAG));

/**
 * Validates `bestuursorgaan.bestuurslaag` against the known keys before it
 * is trusted. The RTR's field is untyped on the wire, and `??` only falls
 * back on `null`/`undefined` — an unexpected value (wrong casing, an empty
 * string, a fifth value) would otherwise flow through and degrade into a
 * confusing "no regeling of type undefined" failure instead of falling
 * back to the code prefix.
 */
function asBestuurslaag(value: string | undefined): Bestuurslaag | null {
  if (value !== undefined && KNOWN_BESTUURSLAGEN.has(value)) return value as Bestuurslaag;
  return null;
}

export interface DossierRequest {
  urn: string;
  env: DsoEnv;
  datum?: string;
  /**
   * The authority (bevoegd gezag) code whose regeling to scan, e.g.
   * `gm0995`. Optional: without it, the activity's own `bestuursorgaan` is
   * used. A national (mnre) activity CAN be annotated in another
   * authority's plan (e.g. a municipal omgevingsplan), which is what this
   * lets a caller check explicitly.
   */
  authority?: string;
}

export interface ResolvedLocatie {
  identificatie: string;
  naam: string | null;
}

export interface JuridischeRegelEntry {
  identificatie: string;
  kwalificatie: string | null;
  idealisatie: string | null;
  regeltekstRef: string;
  wId: string | null;
  locaties: ResolvedLocatie[];
  articleText: string | null;
}

export interface LegalSource {
  /**
   * False when no regeling for this authority's level (see
   * `REGELINGTYPE_BY_BESTUURSLAAG`) could be resolved AND confirmed to
   * annotate this activity — whether because none exists, the search or an
   * annotation fetch failed, or every candidate's annotation graph simply
   * does not name this activity (`provenance.failures` records which).
   * `regelingIdentificatie` and `annotaties` are only ever set together, on
   * the candidate that was actually selected, so this is never `true` with
   * an empty `juridischeRegels` list that is empty only because a later
   * fetch failed.
   */
  available: boolean;
  regelingIdentificatie: string | null;
  regelingTitel: string | null;
  juridischeRegels: JuridischeRegelEntry[];
}

export interface Annotation {
  identificatie: string | null;
  naam: string | null;
  groep: string | null;
  symboolcode: string | null;
  bovenliggendeActiviteitRef: string | null;
}

export interface RuleSet {
  typering: 'Conclusie' | 'Indieningsvereisten';
  identifier: number;
  sttrVersie: number | null;
  begindatum: string | null;
  toestemming: string | null;
  functioneleStructuurRef: string;
  viewerUrl: string;
  dmn: string | null;
}

export interface Provenance {
  env: DsoEnv;
  datum: string | null;
  regelingIdentificatie: string | null;
  fetchedAt: string;
  failures: { step: string; detail: string }[];
}

export interface Dossier {
  urn: string;
  omschrijving: string | null;
  bestuursorgaan: { code: string; oin: string | null } | null;
  legalSource: LegalSource;
  annotation: Annotation;
  /**
   * The RTR activity's own `locaties`, by `identificatie`. Carried onto the
   * dossier so cross-layer consistency (§I3) can require a shared object to
   * appear in all three layers — RTR, annotations and DMN — not just the
   * two the annotation-resolved locaties already cover.
   */
  rtrLocaties: string[];
  decisionCriteria: RuleSet | null;
  submissionRequirements: RuleSet | null;
  /**
   * URNs of this activity's own children (RTR `_links.onderliggendeActiviteiten`),
   * in the order the RTR returned them. Empty when there are none. Free —
   * these hrefs are already on the step-1 RTR response, so this costs no
   * additional upstream call. Lets the taxonomy-node edge case (§7 of
   * docs/dso-activity-dossier.md) point a reader at where an empty dossier's
   * rules actually live, without the dossier fetching each child itself.
   */
  childActivityUrns: string[];
  provenance: Provenance;
}

interface RegelBeheerObject {
  typering: string;
  functioneleStructuurRef: string;
  toestemming?: { code: string; waarde: string };
}

/** `GM` + `0995` -> `gm0995`, the code Ozon's regelingen search expects. */
function bevoegdGezagCode(bestuursorgaan: {
  organisatieType?: string;
  organisatieCode?: string;
}): string {
  return `${bestuursorgaan.organisatieType ?? ''}${bestuursorgaan.organisatieCode ?? ''}`.toLowerCase();
}

/**
 * dd-MM-yyyy -> YYYY-MM-dd.
 *
 * The route's wire format is dd-MM-yyyy (matching every sibling DSO route,
 * and what `dsoService.getActiviteit` — the RTR — expects). Ozon's
 * `getRegeltekstAnnotaties` takes the same validity date as `geldigOp`, but
 * in ISO form: forwarding `req.datum` unchanged made Ozon reject or
 * silently misinterpret it, which surfaced as `regelingIdentificatie`
 * resolving fine while `juridischeRegels` was silently empty. Tolerant: a
 * value that matches neither shape is passed through unchanged rather than
 * thrown on, since geldigOp is optional and the upstream can decide it did
 * not like it.
 */
function toIsoDate(datum: string | undefined): string | undefined {
  if (datum === undefined) return undefined;
  const ddMmYyyy = datum.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (ddMmYyyy) {
    const [, dd, mm, yyyy] = ddMmYyyy;
    return `${yyyy}-${mm}-${dd}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(datum)) return datum;
  return datum;
}

/**
 * The public RTR viewer link. The trailing concept name is what the RTR itself
 * supplies on the functioneleStructuurRef, so this is a substring, not a
 * string-built URL.
 */
function viewerUrl(functioneleStructuurRef: string): string {
  const concept = functioneleStructuurRef.split('/id/concept/')[1] ?? '';
  return `https://omgevingswet.overheid.nl/registratie-toepasbare-regels/id/${concept}`;
}

/**
 * Extracts the activiteit URN from a HAL href of the form
 * `…/activiteiten/{urn}?datum=…` — mirrors
 * packages/frontend/src/services/dsoService.ts's `urnFromHref`. Returns
 * `null` rather than the raw href when the path shape isn't recognised, so a
 * malformed entry is dropped instead of masquerading as a URN.
 */
function urnFromHref(href: string): string | null {
  const match = href.match(/activiteiten\/([^?]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * `_links.onderliggendeActiviteiten` -> child activity URNs, in RTR order.
 * Degrades to `[]` rather than throwing on anything malformed — a missing
 * `_links`, a non-array value, or an entry without a usable `href` — since a
 * parent activity legitimately has none, and a shape surprise here must not
 * take down the rest of the dossier.
 */
function childActivityUrnsFrom(links: unknown): string[] {
  const entries = (links as { onderliggendeActiviteiten?: unknown } | undefined)
    ?.onderliggendeActiviteiten;
  if (!Array.isArray(entries)) return [];
  const urns: string[] = [];
  for (const entry of entries) {
    const href = (entry as { href?: unknown } | null)?.href;
    if (typeof href !== 'string') continue;
    const urn = urnFromHref(href);
    if (urn) urns.push(urn);
  }
  return urns;
}

/**
 * Pages through an authority's regelingen search (HAL, `page.totalPages`)
 * until every page has been read or `MAX_REGELINGEN_PAGES` is hit.
 *
 * The un-paged version only ever read page 1 (`size: 100`), so an authority
 * publishing more than 100 regelingen could have its instrument fall off the
 * end and be reported as "no regeling of type …" — a wrong answer, not an
 * error (`mnre1034` already returns a full page). Follows the same pattern
 * as `dso.service.ts`'s `getActiviteitenByOin`: fetch page 1, read its page
 * info, then fetch the rest sequentially up to the cap and merge.
 *
 * Returns `capped: true` when pages remained unread at the cap, so the
 * caller can tell "genuinely no regeling of this type" from "the search was
 * truncated" instead of conflating them into the same failure.
 */
async function fetchAllRegelingen(
  gezagCode: string,
  env: DsoEnv
): Promise<{ regelingen: RegelingCandidate[]; capped: boolean }> {
  const fetchPage = (page?: number) =>
    ozonService.zoekRegelingen({ bevoegdGezag: [gezagCode] }, env, {
      size: 100,
      ...(page !== undefined ? { page } : {}),
    }) as Promise<{ _embedded?: { regelingen?: RegelingCandidate[] }; page?: OzonPageInfo }>;

  const first = await fetchPage();
  const pages = [first];
  const pageInfo = first.page;
  let capped = false;

  if (pageInfo && pageInfo.totalPages > 1) {
    const lastPage = Math.min(pageInfo.totalPages, MAX_REGELINGEN_PAGES);
    // Sequential, on purpose — kinder to the upstream than firing every page
    // at once, same trade-off getActiviteitenByOin makes.
    for (let p = 2; p <= lastPage; p++) {
      pages.push(await fetchPage(p));
    }
    if (lastPage < pageInfo.totalPages) {
      capped = true;
      logger.warn('[Dossier] regelingen search hit the page cap, response is truncated', {
        gezagCode,
        totalElements: pageInfo.totalElements,
        fetchedPages: lastPage,
        totalPages: pageInfo.totalPages,
      });
    }
  }

  return {
    regelingen: pages.flatMap((p) => p._embedded?.regelingen ?? []),
    capped,
  };
}

/** dd-MM-yyyy -> a UTC millisecond timestamp comparable with `<`/`>`, or
 * `-Infinity` for anything absent or malformed — so an entry with no usable
 * begindatum always sorts last rather than crashing or comparing as "now". */
function parseDdMmYyyy(value: string | undefined): number {
  if (!value) return -Infinity;
  const match = value.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!match) return -Infinity;
  const [, dd, mm, yyyy] = match;
  return Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd));
}

/**
 * When a toepasbareRegels lookup returns more than one entry (rule history
 * overlap for the requested date), `[0]` relies on an upstream ordering that
 * is not guaranteed. Picks the entry with the most recent `begindatum`
 * instead — the version that most recently took effect on-or-before the
 * requested date is the one actually in force. Ties (including "no
 * begindatum on any candidate") resolve deterministically to whichever the
 * upstream listed first, via `reduce`'s left-to-right, `>`-not-`>=` compare.
 */
function pickMostRecentToepasbareRegel<T extends { begindatum?: string }>(items: T[]): T {
  return items.reduce((best, candidate) =>
    parseDdMmYyyy(candidate.begindatum) > parseDdMmYyyy(best.begindatum) ? candidate : best
  );
}

export async function buildDossier(req: DossierRequest): Promise<Dossier> {
  const failures: { step: string; detail: string }[] = [];
  // `context`, when given, is appended so a reader knows WHICH candidate a
  // failure is about — e.g. an `annotaties` fetch failure on its own does
  // not say which regeling was being read (see the candidate loop below).
  const record = (step: string, error: unknown, context?: string) => {
    const message = error instanceof Error ? error.message : String(error);
    const detail = context ? `${message} (${context})` : message;
    logger.warn('[Dossier] step failed', { step, detail });
    failures.push({ step, detail });
  };

  // 1. RTR
  const activiteit = (await dsoService.getActiviteit(req.urn, req.datum, req.env)) as {
    omschrijving?: string;
    bestuursorgaan?: {
      oin?: string;
      organisatieType?: string;
      organisatieCode?: string;
      bestuurslaag?: string;
    };
    regelBeheerObjecten?: RegelBeheerObject[];
    locaties?: { identificatie: string }[];
    _links?: { onderliggendeActiviteiten?: { href: string }[] };
  };

  const bo = activiteit.bestuursorgaan ?? {};
  const derivedCode = bevoegdGezagCode(bo);
  const gezagCode = req.authority ?? derivedCode;
  // An explicit authority overrides not just the code but the level it
  // implies: the caller is naming a DIFFERENT authority's plan, so that
  // authority's own prefix decides the instrument, not the activity's.
  const bestuurslaag: Bestuurslaag | null = req.authority
    ? bestuurslaagFromCode(req.authority)
    : (asBestuurslaag(bo.bestuurslaag) ?? bestuurslaagFromCode(derivedCode));

  // 2 + 3. Ozon — the authority's regeling for its level, then the
  // annotation graph that actually names this activity's juridische regels.
  // An authority can publish more than one regeling of the preferred type
  // (a rijk authority can have several AMvBs); each candidate is tried in
  // turn until one's annotation graph actually names this activity, capped
  // at MAX_REGELING_ATTEMPTS since every attempt fetches a multi-megabyte
  // graph. With exactly one candidate it is used regardless of match: a
  // successful fetch that genuinely contains no rule for this activity is a
  // real result, not evidence the wrong regeling was picked.
  let regelingIdentificatie: string | null = null;
  let regelingTitel: string | null = null;
  let annotaties: OzonAnnotaties | null = null;

  if (!bestuurslaag) {
    record('regeling', new Error(`Could not determine the bestuurslaag for ${gezagCode}`));
  } else {
    const preferredType = REGELINGTYPE_BY_BESTUURSLAAG[bestuurslaag];
    let candidates: RegelingCandidate[] = [];
    let searchFailed = false;
    let searchCapped = false;
    try {
      const { regelingen, capped } = await fetchAllRegelingen(gezagCode, req.env);
      candidates = regelingen.filter((r) => r.type?.code === preferredType);
      searchCapped = capped;
    } catch (error) {
      record('regeling', error);
      searchFailed = true;
    }

    if (!searchFailed) {
      if (candidates.length === 0) {
        // A cap-truncated search that found nothing is NOT the same claim as
        // an exhaustive one that found nothing — say so, so it is never
        // silently reported as "not found" when it may simply be unread.
        const detail = searchCapped
          ? `No regeling of type ${preferredType} for ${gezagCode} in the first ${MAX_REGELINGEN_PAGES} pages searched (search truncated at the page cap — more pages exist)`
          : `No regeling of type ${preferredType} for ${gezagCode}`;
        record('regeling', new Error(detail));
      } else {
        const attempted: string[] = [];
        // Kept separate so the summary below never conflates them: a
        // candidate in `checkedNoMatch` was actually read and genuinely does
        // not name this activity, while one in `notFetched` was never read
        // at all — its `annotaties` failure (recorded with its own
        // identificatie, below) explains why, but it is not evidence the
        // regeling doesn't annotate the activity.
        const checkedNoMatch: string[] = [];
        const notFetched: string[] = [];
        for (const candidate of candidates.slice(0, MAX_REGELING_ATTEMPTS)) {
          attempted.push(candidate.identificatie);
          try {
            const result = await ozonService.getRegeltekstAnnotaties(
              candidate.identificatie,
              req.env,
              {
                geldigOp: toIsoDate(req.datum),
              }
            );
            const matches = (result.regelsVoorIedereen ?? []).some((j) =>
              (j.activiteitLocatieaanduidingen ?? []).some((a) => a.activiteitRef === req.urn)
            );
            if (matches || candidates.length === 1) {
              regelingIdentificatie = candidate.identificatie;
              regelingTitel = candidate.officieleTitel ?? null;
              annotaties = result;
              break;
            }
            checkedNoMatch.push(candidate.identificatie);
          } catch (error) {
            record('annotaties', error, candidate.identificatie);
            notFetched.push(candidate.identificatie);
          }
        }
        // Only summarize when at least one candidate was actually checked
        // and found not to match — if every attempt threw, the recorded
        // per-candidate `annotaties` failures already explain why nothing
        // was selected, and an aggregate here would add nothing (worse, it
        // would read as "checked, not found" for candidates never read).
        // When it does fire, name both groups so a reader can tell "we
        // looked and it is not there" from "we could not look" for each one.
        if (!regelingIdentificatie && checkedNoMatch.length > 0) {
          const parts = [
            `${checkedNoMatch.length} checked and do not annotate ${req.urn}: ${checkedNoMatch.join(', ')}`,
          ];
          if (notFetched.length > 0) {
            parts.push(`${notFetched.length} could not be fetched: ${notFetched.join(', ')}`);
          }
          record(
            'regeling',
            new Error(
              `${attempted.length} regeling(en) of type ${preferredType} for ${gezagCode} were tried for ${req.urn} — ${parts.join('; ')}`
            )
          );
        }
      }
    }
  }

  const regeltekstById = new Map((annotaties?.regelteksten ?? []).map((r) => [r.identificatie, r]));
  const locatieById = new Map((annotaties?.locaties ?? []).map((l) => [l.identificatie, l]));
  const activiteitRecord = (annotaties?.activiteiten ?? []).find(
    (a) => a.identificatie === req.urn
  );

  const hits = (annotaties?.regelsVoorIedereen ?? []).filter((j) =>
    (j.activiteitLocatieaanduidingen ?? []).some((a) => a.activiteitRef === req.urn)
  );

  const juridischeRegels: JuridischeRegelEntry[] = hits.map((j) => {
    const aanduiding = (j.activiteitLocatieaanduidingen ?? []).find(
      (a) => a.activiteitRef === req.urn
    );
    const regeltekst = regeltekstById.get(j.regeltekstRef);
    return {
      identificatie: j.identificatie,
      kwalificatie: aanduiding?.activiteitregelkwalificatie?.waarde ?? null,
      idealisatie: j.idealisatie?.waarde ?? null,
      regeltekstRef: j.regeltekstRef,
      wId: regeltekst?.wId ?? null,
      locaties: (aanduiding?.locatieRefs ?? []).map((ref) => {
        const loc = locatieById.get(ref);
        return { identificatie: ref, naam: loc?.naam ?? loc?.noemer ?? null };
      }),
      articleText: null,
    };
  });

  // 4. Ozon — article text per distinct wId
  if (regelingIdentificatie) {
    const wIds = [...new Set(juridischeRegels.map((r) => r.wId).filter((w): w is string => !!w))];
    const texts = await Promise.allSettled(
      wIds.map(async (wId) => {
        const component = (await ozonService.getDocumentComponent(
          regelingIdentificatie as string,
          wId,
          req.env
        )) as { _embedded?: { documentComponenten?: { inhoud?: string }[] } };
        return { wId, inhoud: component._embedded?.documentComponenten?.[0]?.inhoud ?? null };
      })
    );
    const byWId = new Map<string, string | null>();
    texts.forEach((t, i) => {
      if (t.status === 'fulfilled') byWId.set(t.value.wId, t.value.inhoud);
      else record('documentComponent', t.reason, wIds[i]);
    });
    juridischeRegels.forEach((r) => {
      if (r.wId) r.articleText = byWId.get(r.wId) ?? null;
    });
  }

  // 5 + 6. Uitvoeren Gegevens — rule metadata, then the DMN the profile measures
  const rbos = activiteit.regelBeheerObjecten ?? [];
  const ruleSets = await Promise.allSettled(
    rbos.map(async (rbo) => {
      const regels = (await dsoService.getToepasbareRegels(
        rbo.functioneleStructuurRef,
        req.env,
        req.datum
      )) as {
        _embedded?: {
          toepasbareRegels?: { identifier: number; sttrVersie?: number; begindatum?: string }[];
        };
      };
      const candidates = regels._embedded?.toepasbareRegels ?? [];
      if (candidates.length === 0) return null;
      // More than one can still come back for a date (rule-history overlap);
      // `[0]` relied on an upstream ordering that is not guaranteed. Pick
      // deterministically instead — most recent begindatum wins.
      const first = pickMostRecentToepasbareRegel(candidates);

      // The same two calls the `/toepasbare-regels/:id/dmn` route makes, in
      // process. `extractDmnFromSttr` is synchronous and takes the STTR XML,
      // not an id — and it applies `normalizeDmnForOperaton`, which is why the
      // quality profile must handle underscore-separated GUIDs.
      let dmn: string | null = null;
      try {
        const sttr = await dsoService.getSttrBestand(String(first.identifier), req.env);
        dmn = dsoService.extractDmnFromSttr(sttr);
      } catch (error) {
        record('dmn', error, String(first.identifier));
      }

      const set: RuleSet = {
        typering: rbo.typering as 'Conclusie' | 'Indieningsvereisten',
        identifier: first.identifier,
        sttrVersie: first.sttrVersie ?? null,
        begindatum: first.begindatum ?? null,
        toestemming: rbo.toestemming?.waarde ?? null,
        functioneleStructuurRef: rbo.functioneleStructuurRef,
        viewerUrl: viewerUrl(rbo.functioneleStructuurRef),
        dmn,
      };
      return set;
    })
  );

  const resolved: RuleSet[] = [];
  ruleSets.forEach((r, i) => {
    if (r.status === 'fulfilled' && r.value) resolved.push(r.value);
    else if (r.status === 'rejected')
      record('toepasbareRegels', r.reason, rbos[i].functioneleStructuurRef);
  });

  return {
    urn: req.urn,
    omschrijving: activiteit.omschrijving ?? null,
    bestuursorgaan: { code: gezagCode, oin: bo.oin ?? null },
    legalSource: {
      available: regelingIdentificatie !== null,
      regelingIdentificatie,
      regelingTitel,
      juridischeRegels,
    },
    annotation: {
      identificatie: activiteitRecord?.identificatie ?? null,
      naam: activiteitRecord?.naam ?? null,
      groep: activiteitRecord?.groep?.waarde ?? null,
      symboolcode: activiteitRecord?.symboolcodes?.vlak ?? null,
      bovenliggendeActiviteitRef: activiteitRecord?.bovenliggendeActiviteitRef ?? null,
    },
    rtrLocaties: (activiteit.locaties ?? []).map((l) => l.identificatie),
    decisionCriteria: resolved.find((r) => r.typering === 'Conclusie') ?? null,
    submissionRequirements: resolved.find((r) => r.typering === 'Indieningsvereisten') ?? null,
    childActivityUrns: childActivityUrnsFrom(activiteit._links),
    provenance: {
      env: req.env,
      datum: req.datum ?? null,
      regelingIdentificatie,
      fetchedAt: new Date().toISOString(),
      failures,
    },
  };
}
