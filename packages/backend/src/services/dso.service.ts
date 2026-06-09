// packages/backend/src/services/dso.service.ts

import { XMLParser } from 'fast-xml-parser';
import { config } from '../utils/config';
import { logger } from '../utils/logger';

const DEFAULT_PAGE_SIZE = 20;

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
export async function getBegrippen(
  opts: BegrippenOptions = {},
  env: DsoEnv = 'pre'
): Promise<unknown> {
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

export async function getActiviteitenByOin(
  oin: string,
  env: DsoEnv = 'pre',
  datum?: string
): Promise<unknown> {
  const d = new Date();
  const today = `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
  const effectiveDatum = datum ?? today;

  const params = new URLSearchParams();
  params.set('page', '1');
  params.set('pageSize', '100');

  const body = {
    datum: effectiveDatum,
    bestuursorgaan: { oin },
  };

  const url = `${getDsoConfig(env).rtrBaseUrl}/activiteiten/_zoek?${params}`;
  logger.info('[DSO] POST activiteiten/_zoek by OIN', { env, oin, datum: effectiveDatum });

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
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`DSO responded ${response.status}: ${text}`);
    }
    return response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function zoekActiviteiten(
  opts: ZoekOptions = {},
  env: DsoEnv = 'pre'
): Promise<unknown> {
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

export async function getActiviteit(
  urn: string,
  datum?: string,
  env: DsoEnv = 'pre'
): Promise<unknown> {
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
export async function getActiviteiten(
  opts: ActiviteitenOptions = {},
  env: DsoEnv = 'pre'
): Promise<unknown> {
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

// ---------------------------------------------------------------------------
// Zoekinterface API
// ---------------------------------------------------------------------------

export interface ZoekWerkzaamhedenOptions {
  zoekterm?: string;
  page?: number;
  pageSize?: number;
}

export async function zoekWerkzaamheden(
  opts: ZoekWerkzaamhedenOptions = {},
  env: DsoEnv = 'pre'
): Promise<unknown> {
  const params = new URLSearchParams();
  params.set('page', String(opts.page ?? 1));
  params.set('pageSize', String(opts.pageSize ?? 20));

  const body: Record<string, unknown> = {};
  if (opts.zoekterm) body.zoekterm = opts.zoekterm;

  const url = `${getDsoConfig(env).zoekinterfaceBaseUrl}/werkzaamheden/_zoek?${params}`;
  logger.info('[DSO] POST zoekinterface/werkzaamheden/_zoek', { env, zoekterm: opts.zoekterm });

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
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`DSO responded ${response.status}: ${text}`);
    }
    return response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function suggereerWerkzaamheden(
  zoekterm: string,
  env: DsoEnv = 'pre'
): Promise<unknown> {
  const url = `${getDsoConfig(env).zoekinterfaceBaseUrl}/werkzaamheden/_suggereer`;
  logger.info('[DSO] POST zoekinterface/werkzaamheden/_suggereer', { env, zoekterm });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.dso.timeout);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'x-api-key': getDsoConfig(env).apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ zoekterm }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`DSO responded ${response.status}: ${text}`);
    }
    return response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

// ---------------------------------------------------------------------------
// Opvragen Werkzaamheden API
// ---------------------------------------------------------------------------

export async function getWerkzaamheidDetail(urn: string, env: DsoEnv = 'pre'): Promise<unknown> {
  // expand=true includes trefwoorden and logischeRelaties

  const params = new URLSearchParams({
    pageSize: '100',
  });

  const url = `${getDsoConfig(env).opvragenWerkzaamhedenBaseUrl}/werkzaamheden/${encodeURIComponent(urn)}?${params}`;
  logger.info('[DSO] GET opvragen werkzaamheid detail request', { env, urn, url });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.dso.timeout);
  try {
    const response = await fetch(url, {
      headers: { 'x-api-key': getDsoConfig(env).apiKey, Accept: 'application/hal+json' },
      signal: controller.signal,
    });
    const text = await response.text();
    logger.info('[DSO] GET opvragen werkzaamheid detail response', {
      status: response.status,
      body: text.substring(0, 500),
    });
    if (!response.ok) throw new Error(`DSO responded ${response.status}: ${text}`);
    return JSON.parse(text);
  } finally {
    clearTimeout(timeoutId);
  }
}

// ---------------------------------------------------------------------------
// Uitvoeren Gegevens API  (toepasbareregelsuitvoerengegevens v1)
// ---------------------------------------------------------------------------

/** Fetch helper that returns raw XML text (used for STTR bestand downloads). */
async function dsoFetchXml(url: string, env: DsoEnv = 'pre'): Promise<string> {
  const dsoConfig = getDsoConfig(env);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.dso.timeout);
  try {
    const response = await fetch(url, {
      headers: { 'x-api-key': dsoConfig.apiKey, Accept: 'application/xml' },
      signal: controller.signal,
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`DSO responded ${response.status}: ${body}`);
    }
    return response.text();
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * GET /toepasbareRegels?functioneleStructuurRef=...
 * Returns the metadata list for a given functioneleStructuurRef.
 */
export async function getToepasbareRegels(
  functioneleStructuurRef: string,
  env: DsoEnv = 'pre'
): Promise<unknown> {
  const params = new URLSearchParams({ functioneleStructuurRef });
  const url = `${getDsoConfig(env).uitvoerenGegevensBaseUrl}/toepasbareRegels?${params}`;
  logger.info('[DSO] GET toepasbareRegels', { env, functioneleStructuurRef });
  return dsoFetch(url, env);
}

/**
 * GET /toepasbareRegels/:id/sttr
 * Returns the raw STTR XML for a toepasbare regel by its generated id.
 */
export async function getSttrBestand(id: string, env: DsoEnv = 'pre'): Promise<string> {
  const url = `${getDsoConfig(env).uitvoerenGegevensBaseUrl}/toepasbareRegels/${encodeURIComponent(id)}/sttrBestand`;
  logger.info('[DSO] GET STTR bestand', { env, id });
  return dsoFetchXml(url, env);
}

// ---------------------------------------------------------------------------
// STTR parsing helpers
// ---------------------------------------------------------------------------

/**
 * Extracts the embedded DMN <definitions> element from a conclusie STTR envelope
 * and returns it as a standalone DMN XML string.
 */
export function extractDmnFromSttr(sttrXml: string): string {
  // The conclusie STTR wraps a complete DMN 1.2 <definitions> element.
  // Match including any namespace declarations and closing tag,
  // handling both prefixed (dmn:definitions) and un-prefixed variants.
  const match = sttrXml.match(/<(?:dmn:)?definitions[\s\S]*?<\/(?:dmn:)?definitions>/);
  if (!match) throw new Error('No DMN <definitions> element found in STTR XML');
  return `<?xml version="1.0" encoding="UTF-8"?>\n${match[0]}`;
}

export interface FormScaffoldField {
  id: string;
  type: string;
  label: string;
  key: string;
  values?: { label: string; value: string }[];
  validate?: { required: boolean };
}

export interface FormScaffold {
  schemaVersion: number;
  id: string;
  components: FormScaffoldField[];
  type: 'default';
}

/**
 * Parses an indieningsvereisten STTR and generates a best-effort form-js field
 * scaffold from the uitv:uitvoeringsregels questionnaire in dmn:extensionElements.
 */
export function extractFormScaffoldFromSttr(sttrXml: string, formId: string): FormScaffold {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    isArray: (name) => ['uitv:uitvoeringsregel', 'uitv:optie'].includes(name),
  });

  const parsed = parser.parse(sttrXml);

  const defs = parsed?.['dmn:definitions'] ?? parsed?.['definitions'] ?? {};
  const ext = defs?.['dmn:extensionElements'] ?? {};
  const regels: unknown[] =
    ext?.['uitv:uitvoeringsregels']?.['uitv:uitvoeringsregel'] ?? [];

  const components: FormScaffoldField[] = [];

  for (const r of regels) {
    const regel = r as Record<string, unknown>;
    const id = (regel['@_id'] as string) ?? '';
    const key = id.replace(/^uitv__/, '').replace(/[^a-zA-Z0-9_]/g, '_');

    if (regel['uitv:vraag']) {
      const vraag = regel['uitv:vraag'] as Record<string, unknown>;
      const gegevensType = (vraag['uitv:gegevensType'] as string) ?? 'string';
      const vraagTekst = (vraag['uitv:vraagTekst'] as string) ?? '';
      const inputType = vraag['inter:inputType'] as string | undefined;

      let fieldType: string;
      let values: { label: string; value: string }[] | undefined;

      if (gegevensType === 'boolean') {
        fieldType = 'checkbox';
      } else if (gegevensType === 'list') {
        fieldType = 'select';
        const opties = (vraag['uitv:opties'] as Record<string, unknown>)?.['uitv:optie'];
        if (Array.isArray(opties)) {
          values = opties.map((o: unknown) => {
            const text = ((o as Record<string, unknown>)['uitv:optieText'] as string) ?? '';
            return { label: text, value: text };
          });
        }
      } else if (gegevensType === 'number') {
        fieldType = 'number';
      } else if (inputType === 'textarea') {
        fieldType = 'textarea';
      } else {
        fieldType = 'textfield';
      }

      components.push({
        id,
        type: fieldType,
        label: vraagTekst,
        key,
        ...(values ? { values } : {}),
        validate: { required: false },
      });
    } else if (regel['uitv:bijlage']) {
      // Attachment requirement — emit as a labelled textfield placeholder
      const bijlageType =
        ((regel['uitv:bijlage'] as Record<string, unknown>)['uitv:bijlageType'] as string) ?? '';
      components.push({
        id,
        type: 'textfield',
        label: `[Bijlage] ${bijlageType}`,
        key,
        validate: { required: false },
      });
    }
    // uitv:geoVerwijzing — geo fields not representable in form-js, skip
  }

  return { schemaVersion: 17, id: formId, components, type: 'default' };
}
