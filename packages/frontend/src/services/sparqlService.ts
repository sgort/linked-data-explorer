import { SparqlResponse } from '../types';
import { getProblemDetail } from '../utils/problem';

/**
 * Executes a SPARQL query against a remote endpoint via the backend's
 * `/v1/triplydb/query` proxy (#161).
 *
 * The browser never contacts a SPARQL endpoint directly any more, and the
 * allorigins.win CORS-proxy fallback this function used to fall back to is
 * gone with it: routing every query through the backend removes both the
 * third-party dependency and the direct-fetch CORS failures it existed to
 * paper over, and it is what a Content-Security-Policy's connect-src can
 * name a single, known origin for.
 *
 * The backend spreads the endpoint's own SPARQL JSON results beside
 * `success` (`{ success: true, head, results }` / `{ success: true, head,
 * boolean }`) -- `success` is stripped here so this function keeps
 * returning exactly the `SparqlResponse` shape callers already expect.
 *
 * On a non-OK response the backend answers RFC 9457 problem details; the
 * `detail` member is surfaced as the thrown error's message so, for example,
 * a refused endpoint (http:// on an environment that requires https:, #142)
 * shows the server's real reason instead of a generic failure.
 */
export const executeSparqlQuery = async (
  endpoint: string,
  query: string
): Promise<SparqlResponse> => {
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';
  const response = await fetch(`${apiBaseUrl}/v1/triplydb/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ endpoint, query }),
  });

  if (!response.ok) {
    // A non-OK response is not guaranteed to be JSON -- a proxy or gateway
    // error in front of the backend (e.g. a 502 with an HTML body) would
    // otherwise make response.json() throw its own "Unexpected token '<'"
    // instead of surfacing the real problem. .catch(() => null), as in
    // ropaService.ts, falls through to the generic `Query failed (status)`
    // message below instead.
    const body: unknown = await response.json().catch(() => null);
    throw new Error(getProblemDetail(body, `Query failed (${response.status}).`));
  }

  const body: unknown = await response.json();
  const { success: _success, ...result } = body as { success?: boolean } & Record<string, unknown>;

  return result as unknown as SparqlResponse;
};
