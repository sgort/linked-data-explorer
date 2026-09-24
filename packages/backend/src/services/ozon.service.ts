// packages/backend/src/services/ozon.service.ts

/**
 * Omgevingsdocumenten Presenteren (Ozon) v8 — the sixth DSO API, and the only
 * one carrying the juridical half of an activity's chain.
 *
 * Shares `dsoFetch` with the other five APIs so timeout, key attachment and
 * the error contract stay identical.
 */

import { dsoFetch, DsoEnv } from './dso.service';
import { config } from '../utils/config';
import { logger } from '../utils/logger';
import { createTtlCache } from '../utils/ttl-cache';

/** Ozon rejects `EPSG:28992` and `epsg:28992`; only the full OGC URI is accepted. */
export const CONTENT_CRS = 'http://www.opengis.net/def/crs/EPSG/0/28992';

export interface OzonActiviteit {
  identificatie: string;
  naam?: string;
  groep?: { code: string; waarde: string };
  symboolcodes?: { vlak?: string };
  bovenliggendeActiviteitRef?: string;
}

export interface OzonRegeltekst {
  identificatie: string;
  wId: string;
}

export interface OzonLocatie {
  identificatie: string;
  naam?: string;
  noemer?: string;
  locatieType?: { code: string; waarde: string };
}

export interface OzonActiviteitLocatieaanduiding {
  identificatie: string;
  activiteitRef: string;
  activiteitregelkwalificatie?: { code: string; waarde: string };
  locatieRefs?: string[];
}

export interface OzonJuridischeRegel {
  identificatie: string;
  idealisatie?: { code: string; waarde: string };
  regeltekstRef: string;
  locatieRefs?: string[];
  activiteitLocatieaanduidingen?: OzonActiviteitLocatieaanduiding[];
}

/**
 * NOT a HAL collection: no `page`, no `_embedded`. Sibling arrays on one object.
 */
export interface OzonAnnotaties {
  activiteiten: OzonActiviteit[];
  regelteksten: OzonRegeltekst[];
  regelsVoorIedereen: OzonJuridischeRegel[];
  locaties: OzonLocatie[];
  gebiedsaanwijzingen?: unknown[];
  omgevingsnormen?: unknown[];
}

function baseUrl(env: DsoEnv): string {
  return env === 'prod' ? config.dsoProd.ozonBaseUrl : config.dso.ozonBaseUrl;
}

/**
 * Ozon puts a document identificatie in the path with underscores, not slashes.
 * Percent-encoding the slashes returns a Tomcat HTML 400, not a JSON error.
 */
export function toOzonPathId(identificatie: string): string {
  return identificatie.replace(/\//g, '_');
}

export async function zoekRegelingen(
  body: { bevoegdGezag?: string[]; typeBevoegdGezag?: string[] },
  env: DsoEnv = 'pre',
  opts: { size?: number; page?: number } = {}
): Promise<unknown> {
  const params = new URLSearchParams({ size: String(opts.size ?? 100) });
  // Omitted by default so every existing caller's request is unchanged;
  // dossier.service.ts's paging loop is the only caller that passes it (see
  // its `MAX_REGELINGEN_PAGES` cap), the same way `getActiviteitenByOin` in
  // dso.service.ts pages the RTR search.
  if (opts.page !== undefined) params.set('page', String(opts.page));
  const url = `${baseUrl(env)}/regelingen/_zoek?${params}`;
  logger.info('[Ozon] POST regelingen/_zoek', { env, body, page: opts.page });
  return dsoFetch(url, env, { method: 'POST', body, headers: { 'Content-Crs': CONTENT_CRS } });
}

/**
 * The annotation graph. 8.7 MB for the Lelystad omgevingsplan, so it is cached
 * for 15 minutes — longer than activity detail because it is far more
 * expensive and changes only on publication dates.
 */
const annotatiesCache = createTtlCache<OzonAnnotaties>({
  name: 'ozon-annotaties',
  ttlMs: 15 * 60 * 1000,
});

export async function getRegeltekstAnnotaties(
  regelingPathId: string,
  env: DsoEnv = 'pre',
  opts: { geldigOp?: string } = {}
): Promise<OzonAnnotaties> {
  const pathId = toOzonPathId(regelingPathId);
  const cacheKey = `${env}|${pathId}|${opts.geldigOp ?? 'today'}`;
  const cached = annotatiesCache.get(cacheKey);
  if (cached !== undefined) {
    logger.info('[Ozon] annotaties from cache', { env, pathId });
    return cached;
  }

  const params = new URLSearchParams();
  if (opts.geldigOp) params.set('geldigOp', opts.geldigOp);
  const query = params.toString();
  const url = `${baseUrl(env)}/regelingen/${pathId}/regeltekstannotaties${query ? `?${query}` : ''}`;
  logger.info('[Ozon] GET regeltekstannotaties', { env, pathId });

  const raw = (await dsoFetch(url, env, {
    headers: { 'Content-Crs': CONTENT_CRS },
  })) as Partial<OzonAnnotaties>;
  const data: OzonAnnotaties = {
    activiteiten: raw.activiteiten ?? [],
    regelteksten: raw.regelteksten ?? [],
    regelsVoorIedereen: raw.regelsVoorIedereen ?? [],
    locaties: raw.locaties ?? [],
    gebiedsaanwijzingen: raw.gebiedsaanwijzingen ?? [],
    omgevingsnormen: raw.omgevingsnormen ?? [],
  };
  annotatiesCache.set(cacheKey, data);
  return data;
}

export async function getDocumentComponent(
  regelingPathId: string,
  wId: string,
  env: DsoEnv = 'pre'
): Promise<unknown> {
  const pathId = toOzonPathId(regelingPathId);
  const url = `${baseUrl(env)}/regelingen/${pathId}/documentstructuur/${wId}`;
  logger.info('[Ozon] GET documentstructuur component', { env, pathId, wId });
  return dsoFetch(url, env, { headers: { 'Content-Crs': CONTENT_CRS } });
}
