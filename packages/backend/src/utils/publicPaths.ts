/**
 * Paths that get wildcard CORS -- origin '*', GET/OPTIONS only, no credentials --
 * rather than the credentialed allowlist in index.ts.
 *
 * They serve deliberately public, read-only data to named third-party consumers:
 * ropa.flevoland.nl and similar for /v1/ropa/public, and the RONL Business API
 * caseworker dashboard for /v1/bundles/public. The data behind them is shaped for
 * publication (listPublicRopa returns active records only and strips controller
 * and DPO contacts), and the backend performs no inbound authentication, so these
 * endpoints are already readable by anything that is not a browser. Wildcard CORS
 * extends that to browser scripts on other origins, which is the point.
 */
const PUBLIC_MOUNTS = ['/v1/ropa/public', '/v1/bundles/public'];

// Matches a mount or anything below it, never a sibling that merely shares the
// prefix: /v1/ropa/publications must fall through to the credentialed allowlist.
export const isPublicPath = (path: string) =>
  PUBLIC_MOUNTS.some((mount) => path === mount || path.startsWith(`${mount}/`));
