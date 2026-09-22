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

const OMGEVINGSPLAN_TYPE = '/join/id/stop/regelingtype_003';

export interface DossierRequest {
  urn: string;
  env: DsoEnv;
  datum?: string;
  /** Required for a national (mnre) activity: which authority's plan to scan. */
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
    bestuursorgaan?: { oin?: string; organisatieType?: string; organisatieCode?: string };
    regelBeheerObjecten?: RegelBeheerObject[];
  };

  const bo = activiteit.bestuursorgaan ?? {};
  const derivedCode = bevoegdGezagCode(bo);
  const isNational = derivedCode.startsWith('mnre');
  if (isNational && !req.authority) {
    throw new Error(
      `A national activity is annotated in many plans: pass an authority parameter for ${req.urn}`
    );
  }
  const gezagCode = req.authority ?? derivedCode;

  // 2. Ozon — the authority's omgevingsplan
  let regelingIdentificatie: string | null = null;
  let regelingTitel: string | null = null;
  try {
    const regelingen = (await ozonService.zoekRegelingen({ bevoegdGezag: [gezagCode] }, req.env, {
      size: 100,
    })) as {
      _embedded?: {
        regelingen?: { identificatie: string; type?: { code: string }; officieleTitel?: string }[];
      };
    };
    const plan = (regelingen._embedded?.regelingen ?? []).find(
      (r) => r.type?.code === OMGEVINGSPLAN_TYPE
    );
    if (plan) {
      regelingIdentificatie = plan.identificatie;
      regelingTitel = plan.officieleTitel ?? null;
    } else {
      record('regeling', new Error(`No omgevingsplan (regelingtype_003) for ${gezagCode}`));
    }
  } catch (error) {
    record('regeling', error);
  }

  // 3. Ozon — the annotation graph, joined on activiteitRef
  let annotaties: OzonAnnotaties | null = null;
  if (regelingIdentificatie) {
    try {
      annotaties = await ozonService.getRegeltekstAnnotaties(regelingIdentificatie, req.env, {
        geldigOp: req.datum,
      });
    } catch (error) {
      record('annotaties', error);
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
