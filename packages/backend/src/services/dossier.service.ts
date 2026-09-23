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

export async function buildDossier(req: DossierRequest): Promise<Dossier> {
  const failures: { step: string; detail: string }[] = [];
  const record = (step: string, error: unknown) => {
    const detail = error instanceof Error ? error.message : String(error);
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
  };

  const bo = activiteit.bestuursorgaan ?? {};
  const derivedCode = bevoegdGezagCode(bo);
  const gezagCode = req.authority ?? derivedCode;
  // An explicit authority overrides not just the code but the level it
  // implies: the caller is naming a DIFFERENT authority's plan, so that
  // authority's own prefix decides the instrument, not the activity's.
  const bestuurslaag: Bestuurslaag | null = req.authority
    ? bestuurslaagFromCode(req.authority)
    : ((bo.bestuurslaag as Bestuurslaag | undefined) ?? bestuurslaagFromCode(derivedCode));

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
    let candidates: { identificatie: string; type?: { code: string }; officieleTitel?: string }[] =
      [];
    let searchFailed = false;
    try {
      const regelingen = (await ozonService.zoekRegelingen({ bevoegdGezag: [gezagCode] }, req.env, {
        size: 100,
      })) as {
        _embedded?: {
          regelingen?: {
            identificatie: string;
            type?: { code: string };
            officieleTitel?: string;
          }[];
        };
      };
      candidates = (regelingen._embedded?.regelingen ?? []).filter(
        (r) => r.type?.code === preferredType
      );
    } catch (error) {
      record('regeling', error);
      searchFailed = true;
    }

    if (!searchFailed) {
      if (candidates.length === 0) {
        record('regeling', new Error(`No regeling of type ${preferredType} for ${gezagCode}`));
      } else {
        const attempted: string[] = [];
        let anyFetchSucceeded = false;
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
            anyFetchSucceeded = true;
            const matches = (result.regelsVoorIedereen ?? []).some((j) =>
              (j.activiteitLocatieaanduidingen ?? []).some((a) => a.activiteitRef === req.urn)
            );
            if (matches || candidates.length === 1) {
              regelingIdentificatie = candidate.identificatie;
              regelingTitel = candidate.officieleTitel ?? null;
              annotaties = result;
              break;
            }
          } catch (error) {
            record('annotaties', error);
          }
        }
        // Only report "none of them matched" when at least one attempt
        // actually resolved — if every attempt threw, the recorded
        // `annotaties` failures already explain why nothing was selected,
        // and a second summary here would misleadingly imply they were
        // checked and came up empty rather than that they failed to fetch.
        if (!regelingIdentificatie && anyFetchSucceeded) {
          record(
            'regeling',
            new Error(
              `None of the ${attempted.length} regeling(en) of type ${preferredType} for ${gezagCode} annotate ${req.urn}: tried ${attempted.join(', ')}`
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
    texts.forEach((t) => {
      if (t.status === 'fulfilled') byWId.set(t.value.wId, t.value.inhoud);
      else record('documentComponent', t.reason);
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
        req.env
      )) as {
        _embedded?: {
          toepasbareRegels?: { identifier: number; sttrVersie?: number; begindatum?: string }[];
        };
      };
      const first = regels._embedded?.toepasbareRegels?.[0];
      if (!first) return null;

      // The same two calls the `/toepasbare-regels/:id/dmn` route makes, in
      // process. `extractDmnFromSttr` is synchronous and takes the STTR XML,
      // not an id — and it applies `normalizeDmnForOperaton`, which is why the
      // quality profile must handle underscore-separated GUIDs.
      let dmn: string | null = null;
      try {
        const sttr = await dsoService.getSttrBestand(String(first.identifier), req.env);
        dmn = dsoService.extractDmnFromSttr(sttr);
      } catch (error) {
        record('dmn', error);
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
  ruleSets.forEach((r) => {
    if (r.status === 'fulfilled' && r.value) resolved.push(r.value);
    else if (r.status === 'rejected') record('toepasbareRegels', r.reason);
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
    provenance: {
      env: req.env,
      datum: req.datum ?? null,
      regelingIdentificatie,
      fetchedAt: new Date().toISOString(),
      failures,
    },
  };
}
