// packages/backend/src/services/dso.service.ts

import { config } from '../utils/config';
import { logger } from '../utils/logger';

const DEFAULT_PAGE_SIZE = 10;

export type DsoEnv = 'pre' | 'prod';

function getDsoConfig(env: DsoEnv = 'pre') {
  return env === 'prod' ? config.dsoProd : config.dso;
}

/**
 * Internal fetch helper for all DSO API calls.
 * Attaches the x-api-key header and enforces the configured timeout.
 */
async function dsoFetch(url: string, env: DsoEnv = 'pre'): Promise<unknown> {
  const dsoConfig = getDsoConfig(env);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.dso.timeout);

  try {
    const response = await fetch(url, {
      headers: {
        'x-api-key': dsoConfig.apiKey,
        Accept: 'application/hal+json',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`DSO responded ${response.status}: ${body}`);
    }

    return response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

// ---------------------------------------------------------------------------
// Catalogus API
// ---------------------------------------------------------------------------

export interface BegrippenOptions {
  zoekTerm?: string;
  page?: number;
  pageSize?: number;
  geldigOp?: string; // YYYY-MM-dd
}

/**
 * GET /begrippen — search or list concepts from the Stelselcatalogus.
 * Returns the raw HAL response (items live in _embedded.begrippen).
 */
export async function getBegrippen(opts: BegrippenOptions = {}, env: DsoEnv = 'pre'): Promise<unknown> {
  const params = new URLSearchParams();
  if (opts.zoekTerm) params.set('zoekTerm', opts.zoekTerm);
  if (opts.geldigOp) params.set('geldigOp', opts.geldigOp);
  params.set('page', String(opts.page ?? 1));
  params.set('pageSize', String(opts.pageSize ?? DEFAULT_PAGE_SIZE));

  const url = `${getDsoConfig(env).catalogueBaseUrl}/begrippen?${params}`;
  logger.info('[DSO] GET begrippen', { env, zoekTerm: opts.zoekTerm, page: opts.page });
  return dsoFetch(url, env);
}

// ---------------------------------------------------------------------------
// RTR API
// ---------------------------------------------------------------------------

export interface ActiviteitenOptions {
  datum?: string; // dd-MM-yyyy — defaults to today
  page?: number;
  pageSize?: number;
}

export interface ZoekOptions {
  datum?: string; // dd-MM-yyyy, defaults to today
  lat?: number; // WGS84
  lon?: number;
  page?: number;
  pageSize?: number;
}

export async function zoekActiviteiten(opts: ZoekOptions = {}, env: DsoEnv = 'pre'): Promise<unknown> {
  const d = new Date();
  const today = `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
  const datum = opts.datum ?? today;

  const params = new URLSearchParams();
  params.set('page', String(opts.page ?? 1));
  params.set('pageSize', String(opts.pageSize ?? 20));

  const body: Record<string, unknown> = { datum };
  if (opts.lat !== undefined && opts.lon !== undefined) {
    body.geometrie = {
      type: 'Point',
      coordinates: [opts.lon, opts.lat],
    };
  }

  if (opts.lat !== undefined && opts.lon !== undefined) {
    params.set('crs', 'epsg:4326');
  }

  const url = `${getDsoConfig(env).rtrBaseUrl}/activiteiten/_zoek?${params}`;
  logger.info('[DSO] POST activiteiten/_zoek request', {
    env,
    url,
    body: JSON.stringify(body),
    lat: opts.lat,
    lon: opts.lon,
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.dso.timeout);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'x-api-key': getDsoConfig(env).apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/hal+json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`DSO responded ${response.status}: ${text}`);
    }
    return JSON.parse(text);
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function getActiviteit(urn: string, datum?: string, env: DsoEnv = 'pre'): Promise<unknown> {
  const d = new Date();
  const today = `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;

  const params = new URLSearchParams();
  params.set('datum', datum ?? today);

  const url = `${getDsoConfig(env).rtrBaseUrl}/activiteiten/${encodeURIComponent(urn)}?${params}`;
  logger.info('[DSO] GET activiteit detail', { env, urn, datum: datum ?? today });
  return dsoFetch(url, env);
}

/**
 * GET /activiteiten — all activities valid on a given date.
 * `datum` is required by DSO; we default to today when omitted.
 */
export async function getActiviteiten(opts: ActiviteitenOptions = {}, env: DsoEnv = 'pre'): Promise<unknown> {
  const d = new Date();
  const datum =
    opts.datum ??
    `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;

  const params = new URLSearchParams();
  params.set('datum', datum);
  params.set('page', String(opts.page ?? 1));
  params.set('pageSize', String(opts.pageSize ?? DEFAULT_PAGE_SIZE));

  const url = `${getDsoConfig(env).rtrBaseUrl}/activiteiten?${params}`;
  logger.info('[DSO] GET activiteiten', { env, datum, page: opts.page });
  return dsoFetch(url, env);
}
