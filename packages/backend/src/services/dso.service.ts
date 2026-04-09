// packages/backend/src/services/dso.service.ts

import { config } from '../utils/config';
import { logger } from '../utils/logger';

const DEFAULT_PAGE_SIZE = 10;

/**
 * Internal fetch helper for all DSO API calls.
 * Attaches the x-api-key header and enforces the configured timeout.
 */
async function dsoFetch(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.dso.timeout);

  try {
    const response = await fetch(url, {
      headers: {
        'x-api-key': config.dso.apiKey,
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
export async function getBegrippen(opts: BegrippenOptions = {}): Promise<unknown> {
  const params = new URLSearchParams();
  if (opts.zoekTerm) params.set('zoekTerm', opts.zoekTerm);
  if (opts.geldigOp) params.set('geldigOp', opts.geldigOp);
  params.set('page', String(opts.page ?? 1));
  params.set('pageSize', String(opts.pageSize ?? DEFAULT_PAGE_SIZE));

  const url = `${config.dso.catalogueBaseUrl}/begrippen?${params}`;
  logger.info('[DSO] GET begrippen', { zoekTerm: opts.zoekTerm, page: opts.page });
  return dsoFetch(url);
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

export async function zoekActiviteiten(opts: ZoekOptions = {}): Promise<unknown> {
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

  // crs is a query param per the RTR spec, not a header
  if (opts.lat !== undefined && opts.lon !== undefined) {
    params.set('crs', 'epsg:4326');
  }

  const url = `${config.dso.rtrBaseUrl}/activiteiten/_zoek?${params}`;
  logger.info('[DSO] POST activiteiten/_zoek request', {
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
        'x-api-key': config.dso.apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/hal+json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    logger.info('[DSO] POST activiteiten/_zoek response', {
      status: response.status,
      body: text.substring(0, 1000),
    });
    if (!response.ok) {
      throw new Error(`DSO responded ${response.status}: ${text}`);
    }
    return JSON.parse(text);
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function getActiviteit(urn: string, datum?: string): Promise<unknown> {
  const d = new Date();
  const today = `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;

  const params = new URLSearchParams();
  params.set('datum', datum ?? today);

  const url = `${config.dso.rtrBaseUrl}/activiteiten/${encodeURIComponent(urn)}?${params}`;
  logger.info('[DSO] GET activiteit detail', { urn, datum: datum ?? today });
  return dsoFetch(url);
  // const result = await dsoFetch(url);
  // logger.info('[DSO] activiteit raw', { urn, result: JSON.stringify(result) });
  // return result;
}

/**
 * GET /activiteiten — all activities valid on a given date.
 * `datum` is required by DSO; we default to today when omitted.
 */
export async function getActiviteiten(opts: ActiviteitenOptions = {}): Promise<unknown> {
  const datum =
    opts.datum ??
    new Date()
      .toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric' })
      .replace(/\//g, '-');

  const params = new URLSearchParams();
  params.set('datum', datum);
  params.set('page', String(opts.page ?? 1));
  params.set('pageSize', String(opts.pageSize ?? DEFAULT_PAGE_SIZE));

  const url = `${config.dso.rtrBaseUrl}/activiteiten?${params}`;
  logger.info('[DSO] GET activiteiten', { datum, page: opts.page });
  return dsoFetch(url);
}
