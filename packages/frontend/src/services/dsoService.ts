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
  naam?: string;
  bovenliggendeActiviteit?: { urn: string } | null;
  begindatumJuridischeGeldigheid?: string;
  einddatumJuridischeGeldigheid?: string | null;
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

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const envelope = (await res.json()) as { success: boolean; data: T };
  if (!envelope.success) throw new Error('DSO request failed');
  return envelope.data;
}

export async function searchBegrippen(zoekTerm: string, page = 1): Promise<BegrippenResult> {
  const params = new URLSearchParams({ page: String(page), pageSize: '10' });
  if (zoekTerm.trim()) params.set('zoekTerm', zoekTerm.trim());
  const raw = await get<Record<string, unknown>>(`/v1/dso/begrippen?${params}`);
  const embedded = (raw as { _embedded?: { begrippen?: DsoBegrip[] } })._embedded;
  const pageInfo = (raw as { page?: DsoPage }).page ?? { number: page, size: 10 };
  const links = (raw as { _links?: { next?: { href?: string | null } } })._links;
  return {
    items: embedded?.begrippen ?? [],
    page: pageInfo,
    hasNext: !!links?.next?.href,
  };
}

export async function getActiviteiten(datum?: string, page = 1): Promise<ActiviteitenResult> {
  const params = new URLSearchParams({ page: String(page), pageSize: '20' });
  if (datum) params.set('datum', datum);
  const raw = await get<Record<string, unknown>>(`/v1/dso/activiteiten?${params}`);
  const embedded = (raw as { _embedded?: { activiteiten?: DsoActiviteit[] } })._embedded;
  const pageInfo = (raw as { page?: DsoPage }).page ?? { number: page, size: 20 };
  const links = (raw as { _links?: { next?: { href?: string | null } } })._links;
  return {
    items: embedded?.activiteiten ?? [],
    page: pageInfo,
    hasNext: !!links?.next?.href,
  };
}
