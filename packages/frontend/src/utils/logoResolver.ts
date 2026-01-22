// NEW FILE: packages/frontend/src/utils/logoResolver.ts

/**
 * Logo Resolution Utility
 *
 * Resolves relative logo paths from RDF to actual TriplyDB asset URLs.
 * Handles caching and error gracefully.
 */

interface Asset {
  id: string;
  name: string;
  url: string;
  size: number;
  contentType: string;
}

interface AssetCache {
  assets: Asset[];
  timestamp: number;
  endpoint: string;
}

// Cache TTL: 1 hour (logos don't change frequently)
const CACHE_TTL = 60 * 60 * 1000;

// In-memory cache per endpoint
const assetCache = new Map<string, AssetCache>();

/**
 * Extract filename from relative path
 * Examples:
 * - "./assets/Sociale_Verzekeringsbank_logo.png" → "Sociale_Verzekeringsbank_logo.png"
 * - "assets/logo.png" → "logo.png"
 * - "logo.png" → "logo.png"
 */
function extractFilename(relativePath: string): string {
  return relativePath.split('/').pop() || relativePath;
}

/**
 * Extract account and dataset from SPARQL endpoint URL
 * Example: https://api.open-regels.triply.cc/datasets/stevengort/facts/services/facts/sparql
 * Returns: { account: "stevengort", dataset: "facts" }
 */
function parseEndpoint(endpoint: string): { account: string; dataset: string } | null {
  try {
    const match = endpoint.match(/datasets\/([^/]+)\/([^/]+)/);
    if (match) {
      return {
        account: match[1],
        dataset: match[2],
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Response type from the assets API
 */
interface AssetsApiResponse {
  success: boolean;
  assets: Asset[];
  count: number;
}

/**
 * Fetch assets from backend API
 */
async function fetchAssets(account: string, dataset: string, apiToken?: string): Promise<Asset[]> {
  // Use existing Vite environment variable with fallback
  const backendUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

  const params = new URLSearchParams({
    account,
    dataset,
  });

  if (apiToken) {
    params.append('apiToken', apiToken);
  }

  console.log('[logoResolver] Fetching assets from:', `${backendUrl}/v1/triplydb/assets?${params}`);

  const response = await fetch(`${backendUrl}/v1/triplydb/assets?${params}`);

  if (!response.ok) {
    console.warn(`[logoResolver] Failed to fetch assets: ${response.statusText}`);
    return [];
  }

  const data = (await response.json()) as AssetsApiResponse;
  console.log('[logoResolver] Backend response:', data);
  console.log('[logoResolver] Assets array:', data.assets);

  return data.assets || [];
}

/**
 * Get cached assets or fetch new ones
 */
async function getAssets(endpoint: string, apiToken?: string): Promise<Asset[]> {
  const now = Date.now();
  const cached = assetCache.get(endpoint);

  // Return cached if still valid
  if (cached && now - cached.timestamp < CACHE_TTL) {
    return cached.assets;
  }

  // Parse endpoint to get account/dataset
  const parsed = parseEndpoint(endpoint);
  if (!parsed) {
    console.warn('Could not parse endpoint for assets:', endpoint);
    return [];
  }

  // Fetch new assets
  try {
    const assets = await fetchAssets(parsed.account, parsed.dataset, apiToken);

    // Cache results
    assetCache.set(endpoint, {
      assets,
      timestamp: now,
      endpoint,
    });

    return assets;
  } catch (error) {
    console.error('Error fetching assets:', error);
    return [];
  }
}

/**
 * Resolve a relative logo path to actual TriplyDB asset URL
 *
 * @param relativePath - Relative path from RDF (e.g., "./assets/logo.png")
 * @param endpoint - SPARQL endpoint URL for context
 * @param apiToken - Optional API token for private datasets
 * @returns Full URL to the asset, or null if not found
 */
export async function resolveLogo(
  relativePath: string | null | undefined,
  endpoint: string,
  apiToken?: string
): Promise<string | null> {
  console.log('[resolveLogo] Called with:', { relativePath, endpoint });

  if (!relativePath) {
    console.log('[resolveLogo] No path provided, returning null');
    return null;
  }

  // Check if it's a TriplyDB asset URL WITHOUT version ID (needs resolution)
  // Pattern: https://open-regels.triply.cc/{account}/{dataset}/assets/{filename}
  const incompleteTriplyDbPattern = /^https?:\/\/.*\.triply\.cc\/[^/]+\/[^/]+\/assets\/[^/]+$/;
  const isIncompleteTriplyDbUrl = incompleteTriplyDbPattern.test(relativePath);

  // If it's a complete URL with version ID, return as-is
  // Pattern: https://api.open-regels.triply.cc/datasets/{account}/{dataset}/assets/{id}/{versionId}
  const completeTriplyDbPattern =
    /^https?:\/\/api\..*\.triply\.cc\/datasets\/[^/]+\/[^/]+\/assets\/[^/]+\/[^/]+$/;
  const isCompleteTriplyDbUrl = completeTriplyDbPattern.test(relativePath);

  if (isCompleteTriplyDbUrl) {
    console.log('[resolveLogo] Already a complete TriplyDB URL with version ID, returning as-is');
    return relativePath;
  }

  // If it's some other full URL (not TriplyDB), return as-is
  if (
    !isIncompleteTriplyDbUrl &&
    (relativePath.startsWith('http://') || relativePath.startsWith('https://'))
  ) {
    console.log('[resolveLogo] Non-TriplyDB full URL, returning as-is');
    return relativePath;
  }

  // Extract filename from either relative path or incomplete TriplyDB URL
  const filename = extractFilename(relativePath);
  console.log('[resolveLogo] Extracted filename:', filename);

  // Get assets
  const assets = await getAssets(endpoint, apiToken);
  console.log('[resolveLogo] Got assets:', assets);
  console.log(
    '[resolveLogo] Asset names:',
    assets.map((a) => a.name)
  );

  // Find matching asset by filename
  const match = assets.find((asset) => asset.name === filename);
  console.log('[resolveLogo] Match found:', match);

  return match ? match.url : null;
}

/**
 * Clear cache for an endpoint
 */
export function clearLogoCache(endpoint?: string): void {
  if (endpoint) {
    assetCache.delete(endpoint);
  } else {
    assetCache.clear();
  }
}

/**
 * Prefetch assets for an endpoint to warm the cache
 */
export async function prefetchLogos(endpoint: string, apiToken?: string): Promise<void> {
  await getAssets(endpoint, apiToken);
}
