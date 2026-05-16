// packages/frontend/src/services/dsoService.ts

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

export interface DsoBegrip {
  uri: string;
  naam: string;
  term?: string;
  definitie?: string | null;
  uitleg?: string | null;
  trefwoorden?: string[];
  conceptschema?: string;
  begindatumGeldigheid?: string;
  einddatumGeldigheid?: string | null;
}

export interface DsoActiviteit {
  urn: string;
  omschrijving?: string;
  beginDatum?: string;
  eindDatum?: string | null;
  _links?: {
    bovenliggendeActiviteit?: { href: string } | null;
  };
}

export interface DsoRegelbeheerobject {
  urn: string;
  omschrijving?: string;
  typering: 'conclusie' | 'indieningsvereisten' | 'maatregelen';
}

export interface DsoActiviteitDetail extends DsoActiviteit {
  verfijnbaar?: boolean;
  bestuursorgaan?: {
    oin: string;
    bestuurslaag: string;
    organisatieType: string;
    organisatieCode: string;
  };
  regelBeheerObjecten?: DsoRegelbeheerobject[];
  locaties?: { identificatie: string; beginDatum?: string }[];
  _links?: {
    self?: { href: string };
    bovenliggendeActiviteit?: { href: string } | null;
    onderliggendeActiviteiten?: { href: string }[];
  };
}

/** Extract the activiteit URN from a HAL href like ...activiteiten/{urn}?datum=... */
export function urnFromHref(href: string): string {
  const match = href.match(/activiteiten\/([^?]+)/);
  return match ? decodeURIComponent(match[1]) : href;
}

export interface DsoPage {
  number: number;
  size: number;
}

export interface BegrippenResult {
  items: DsoBegrip[];
  page: DsoPage;
  hasNext: boolean;
}

export interface ActiviteitenResult {
  items: DsoActiviteit[];
  page: DsoPage;
  hasNext: boolean;
}

export type DsoEnv = 'pre' | 'prod';

async function get<T>(path: string, env: DsoEnv = 'pre'): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'X-Dso-Env': env },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const envelope = (await res.json()) as { success: boolean; data: T };
  if (!envelope.success) throw new Error('DSO request failed');
  return envelope.data;
}

export async function searchBegrippen(
  zoekTerm: string,
  page = 1,
  env: DsoEnv = 'pre'
): Promise<BegrippenResult> {
  const params = new URLSearchParams({ page: String(page), pageSize: '20' });
  if (zoekTerm.trim()) params.set('zoekTerm', zoekTerm.trim());
  const raw = await get<Record<string, unknown>>(`/v1/dso/begrippen?${params}`, env);
  const embedded = (raw as { _embedded?: { begrippen?: DsoBegrip[] } })._embedded;
  const pageInfo = (raw as { page?: DsoPage }).page ?? { number: page, size: 10 };
  const links = (raw as { _links?: { next?: { href?: string | null } } })._links;
  return {
    items: embedded?.begrippen ?? [],
    page: pageInfo,
    hasNext: !!links?.next?.href,
  };
}

export async function getActiviteitenByOin(
  oin: string,
  env: DsoEnv = 'pre',
  datum?: string
): Promise<ActiviteitenResult> {
  const res = await fetch(`${API_BASE}/v1/dso/activiteiten/oin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Dso-Env': env },
    body: JSON.stringify({ oin, datum }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const envelope = (await res.json()) as { success: boolean; data: Record<string, unknown> };
  if (!envelope.success) throw new Error('DSO OIN request failed');
  return parseActiviteitenResult(envelope.data);
}

export async function zoekActiviteiten(
  opts: {
    datum?: string;
    lat?: number;
    lon?: number;
    page?: number;
    pageSize?: number;
  },
  env: DsoEnv = 'pre'
): Promise<ActiviteitenResult> {
  const res = await fetch(`${API_BASE}/v1/dso/activiteiten/zoek`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Dso-Env': env },
    body: JSON.stringify(opts),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const envelope = (await res.json()) as { success: boolean; data: Record<string, unknown> };
  if (!envelope.success) throw new Error('DSO search failed');
  const raw = envelope.data;
  const embedded = (raw as { _embedded?: { activiteiten?: DsoActiviteit[] } })._embedded;
  const pageInfo = (raw as { page?: DsoPage }).page ?? {
    number: opts.page ?? 1,
    size: opts.pageSize ?? 20,
  };
  const links = (raw as { _links?: { next?: { href?: string | null } } })._links;
  return {
    items: embedded?.activiteiten ?? [],
    page: pageInfo,
    hasNext: !!links?.next?.href,
  };
}

// ---------------------------------------------------------------------------
// Zoekinterface — werkzaamheden
// ---------------------------------------------------------------------------

export interface DsoWerkzaamheid {
  urn: string;
  functioneleStructuurRef?: string;
  omschrijving?: string;
  trefwoorden?: string[];
}

export interface DsoWerkzaamheidVersie {
  urn: string;
  omschrijving: string;
  beginDatum: string;
  eindDatum?: string | null;
  trefwoorden?: string[];
  logischeRelaties?: { urn: string; omschrijving?: string }[];
}

export interface WerkzaamhedenZoekResult {
  items: DsoWerkzaamheid[];
  hasNext: boolean;
  page: DsoPage;
}

export async function zoekWerkzaamheden(
  zoekterm: string,
  page = 1,
  env: DsoEnv = 'pre'
): Promise<WerkzaamhedenZoekResult> {
  const res = await fetch(`${API_BASE}/v1/dso/werkzaamheden/zoek`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Dso-Env': env },
    body: JSON.stringify({ zoekterm: zoekterm.trim() || undefined, page, pageSize: 20 }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const envelope = (await res.json()) as { success: boolean; data: Record<string, unknown> };
  if (!envelope.success) throw new Error('DSO search failed');
  const raw = envelope.data;
  const embedded = (raw as { _embedded?: { werkzaamheden?: DsoWerkzaamheid[] } })._embedded;
  const pageInfo = (raw as { page?: DsoPage }).page ?? { number: page, size: 20 };
  const links = (raw as { _links?: { next?: { href?: string | null } } })._links;
  return {
    items: embedded?.werkzaamheden ?? [],
    page: pageInfo,
    hasNext: !!links?.next?.href,
  };
}

export async function suggereerWerkzaamheden(
  zoekterm: string,
  env: DsoEnv = 'pre'
): Promise<string[]> {
  const res = await fetch(`${API_BASE}/v1/dso/werkzaamheden/suggereer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Dso-Env': env },
    body: JSON.stringify({ zoekterm }),
  });
  if (!res.ok) return [];
  const envelope = (await res.json()) as { success: boolean; data: unknown };
  // Suggestions response is a flat array of strings
  if (!envelope.success) return [];
  return Array.isArray(envelope.data) ? (envelope.data as string[]) : [];
}

export async function getWerkzaamheidDetail(
  urn: string,
  env: DsoEnv = 'pre'
): Promise<DsoWerkzaamheidVersie[]> {
  const res = await fetch(`${API_BASE}/v1/dso/werkzaamheden/${encodeURIComponent(urn)}`, {
    headers: { 'X-Dso-Env': env },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const envelope = (await res.json()) as { success: boolean; data: Record<string, unknown> };
  if (!envelope.success) throw new Error('DSO request failed');
  const raw = envelope.data;
  const embedded = (
    raw as {
      _embedded?: { werkzaamheidversies?: DsoWerkzaamheidVersie[] };
    }
  )._embedded;
  return embedded?.werkzaamheidversies ?? [];
}

export async function getActiviteitDetail(
  urn: string,
  datum?: string,
  env: DsoEnv = 'pre'
): Promise<DsoActiviteitDetail> {
  const params = new URLSearchParams();
  if (datum) params.set('datum', datum);
  return get<DsoActiviteitDetail>(`/v1/dso/activiteiten/${encodeURIComponent(urn)}?${params}`, env);
}

function parseActiviteitenResult(raw: Record<string, unknown>): ActiviteitenResult {
  const embedded = (raw as { _embedded?: { activiteiten?: DsoActiviteit[] } })._embedded;
  const pageInfo = (raw as { page?: DsoPage }).page ?? { number: 1, size: 20 };
  const links = (raw as { _links?: { next?: { href?: string | null } } })._links;
  return {
    items: embedded?.activiteiten ?? [],
    page: pageInfo,
    hasNext: !!links?.next?.href,
  };
}

export async function getActiviteiten(
  datum?: string,
  page = 1,
  env: DsoEnv = 'pre'
): Promise<ActiviteitenResult> {
  const params = new URLSearchParams({ page: String(page), pageSize: '20' });
  if (datum) params.set('datum', datum);
  const raw = await get<Record<string, unknown>>(`/v1/dso/activiteiten?${params}`, env);
  return parseActiviteitenResult(raw);
}
