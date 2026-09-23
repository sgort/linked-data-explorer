// scripts/dossier-render.d.ts
//
// Type declarations for dossier-render.mjs, which is deliberately plain JS
// (see that file's header). This gives the frontend's TypeScript build a
// typed import; the Node CLI script (scripts/dso-dossier.mjs) needs no types
// and imports the .mjs directly.
//
// The shape below is a minimal, self-contained structural type — it mirrors
// (but does not import) the frontend's DsoDossier
// (packages/frontend/src/services/dsoService.ts) and the backend's Dossier /
// QualityProfile (packages/backend/src/services/dossier.service.ts,
// quality.service.ts). Every field renderDossier() actually reads is
// optional/nullable here so the same declaration accepts both the frontend's
// stricter DsoDossier and a looser CLI response body.

export type DossierNamingClass = 'semantic' | 'opaque-resolvable' | 'opaque-dangling' | string;

export interface DossierRuleSetMeta {
  identifier: number | string;
  sttrVersie?: number | string | null;
  begindatum?: string | null;
  toestemming?: string | null;
  viewerUrl: string;
}

export interface DossierDecisionNamingItem {
  name: string;
  class: DossierNamingClass;
}

export interface DossierInputNamingItem {
  name: string;
  class: DossierNamingClass;
  question?: string | null;
}

export interface DossierRuleSetQuality {
  decisionNaming: { total: number; semantic: number; opaque: number; items: DossierDecisionNamingItem[] };
  inputNaming: { total: number; semantic: number; opaque: number; items: DossierInputNamingItem[] };
  labelCoverage: { inputs: number; withQuestion: number };
  refResolvability: { total: number; resolved: number; dangling: number };
}

export interface DossierJuridischeRegel {
  identificatie?: string;
  kwalificatie?: string | null;
  wId?: string | null;
  locaties: { naam?: string | null; identificatie?: string }[];
  articleText?: string | null;
}

export interface DossierForRender {
  urn: string;
  omschrijving?: string | null;
  bestuursorgaan?: { code?: string | null; oin?: string | null } | null;
  legalSource?: {
    available: boolean;
    regelingIdentificatie?: string | null;
    regelingTitel?: string | null;
    juridischeRegels: DossierJuridischeRegel[];
  } | null;
  annotation?: { groep?: string | null; bovenliggendeActiviteitRef?: string | null } | null;
  decisionCriteria?: DossierRuleSetMeta | null;
  submissionRequirements?: DossierRuleSetMeta | null;
  qualityProfile?: {
    activityIdentity?: string;
    legalTraceability?: { withArticleText: number; rules: number } | null;
    ruleSets?: {
      conclusie?: DossierRuleSetQuality | null;
      indieningsvereisten?: DossierRuleSetQuality | null;
    } | null;
  } | null;
  provenance?: {
    env?: string;
    datum?: string | null;
    fetchedAt?: string;
    failures?: { step: string; detail: string }[];
  } | null;
}

/** Renders a dossier (backend `GET .../dossier` response shape) to Markdown. */
export function renderDossier(d: DossierForRender): string;
