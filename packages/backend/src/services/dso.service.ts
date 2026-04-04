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
