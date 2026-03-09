/**
 * Asset Service
 *
 * Destination: packages/frontend/src/services/assetService.ts
 *
 * Fetches image assets from the existing /v1/triplydb/assets backend proxy.
 * Caches results per (account, dataset) pair with a 10-minute TTL.
 * Assets are referenced by URL only — no binary data is stored in localStorage.
 */

import { DocumentAsset } from '../types/document.types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

interface CacheEntry {
  assets: DocumentAsset[];
  fetchedAt: number;
}

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const cache = new Map<string, CacheEntry>();

function cacheKey(account: string, dataset: string): string {
  return `${account}/${dataset}`;
}

/**
 * Parse account and dataset from a TriplyDB SPARQL endpoint URL.
 * Example: https://api.open-regels.triply.cc/datasets/stevengort/facts/services/facts/sparql
 */
function parseEndpoint(endpoint: string): { account: string; dataset: string } | null {
  const match = endpoint.match(/datasets\/([^/]+)\/([^/]+)/);
  return match ? { account: match[1], dataset: match[2] } : null;
}

/**
 * Fetch all assets for the given TriplyDB endpoint.
 * Results are cached; pass `forceRefresh = true` to bypass the cache.
 */
export async function fetchAssets(
  endpoint: string,
  forceRefresh = false
): Promise<DocumentAsset[]> {
  const parsed = parseEndpoint(endpoint);
  if (!parsed) {
    console.warn('[assetService] Could not parse endpoint:', endpoint);
    return [];
  }

  const key = cacheKey(parsed.account, parsed.dataset);
  const now = Date.now();
  const cached = cache.get(key);

  if (!forceRefresh && cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.assets;
  }

  try {
    const params = new URLSearchParams({ account: parsed.account, dataset: parsed.dataset });
    const response = await fetch(`${API_BASE_URL}/v1/triplydb/assets?${params.toString()}`);

    if (!response.ok) {
      console.warn('[assetService] Failed to fetch assets:', response.statusText);
      return [];
    }

    const data = (await response.json()) as { success: boolean; assets: DocumentAsset[] };
    const assets = data.assets ?? [];
    cache.set(key, { assets, fetchedAt: now });
    return assets;
  } catch (err) {
    console.error('[assetService] Error fetching assets:', err);
    return [];
  }
}

/**
 * Fetch variable hints from the Operaton history API for a given process key.
 * Returns deduplicated variable names + types from recent completed instances.
 *
 * Requires the backend endpoint:
 *   GET /v1/process/:key/variable-hints
 */
export async function fetchVariableHints(
  processKey: string
): Promise<Array<{ name: string; type: string }>> {
  try {
    const response = await fetch(
      `${API_BASE_URL}/v1/process/${encodeURIComponent(processKey)}/variable-hints`
    );
    if (!response.ok) return [];
    const data = (await response.json()) as {
      success: boolean;
      variables: Array<{ name: string; type: string }>;
    };
    return data.variables ?? [];
  } catch {
    return [];
  }
}
