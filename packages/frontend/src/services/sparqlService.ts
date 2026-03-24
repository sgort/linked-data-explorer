import { SparqlResponse } from '../types';

/**
 * Executes a SPARQL query against a remote endpoint.
 *
 * Connection strategy:
 *   1. First attempt: direct POST to the endpoint with Content-Type: application/x-www-form-urlencoded.
 *      This is the standard SPARQL protocol and works for any CORS-enabled endpoint.
 *   2. Auto-retry via CORS proxy: if the direct request fails with a network/CORS error on a
 *      remote host, the function transparently retries via the allorigins.win public proxy.
 *      This is a best-effort fallback — the proxy may introduce latency or be rate-limited.
 *      It is NOT used for localhost endpoints, where CORS issues indicate a misconfigured server.
 *
 * For the Orchestration view the backend proxies SPARQL queries itself (via /v1/triplydb/query)
 * so this function is only called from the SPARQL editor and graph-visualisation views.
 */
export const executeSparqlQuery = async (
  endpoint: string,
  query: string,
  useProxy: boolean = false
): Promise<SparqlResponse> => {
  let targetUrl = endpoint;

  // Build the allorigins proxy URL by embedding the full SPARQL GET request as a query
  // parameter. allorigins fetches the URL server-side and returns the response body in
  // a JSON envelope under the "contents" key.
  if (useProxy) {
    targetUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(endpoint + (endpoint.includes('?') ? '&' : '?') + 'query=' + encodeURIComponent(query))}`;
  }

  try {
    const headers: Record<string, string> = {
      Accept: 'application/sparql-results+json',
    };

    if (useProxy) {
      const proxyResponse = await fetch(targetUrl);
      if (!proxyResponse.ok) throw new Error('CORS Proxy failed to reach the endpoint.');
      const proxyData = await proxyResponse.json();

      if (!proxyData.contents) {
        throw new Error('Proxy returned empty content. The endpoint might be down or unreachable.');
      }

      // The proxy wraps the result in 'contents'
      return JSON.parse(proxyData.contents) as SparqlResponse;
    } else {
      const formBody = new URLSearchParams();
      formBody.append('query', query);

      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formBody,
        mode: 'cors',
      });

      if (!response.ok) {
        const text = await response.text();
        let errorMessage = text;
        try {
          const json = JSON.parse(text);
          if (json.message) errorMessage = json.message;
        } catch {
          // If parsing fails, use text as-is
        }
        throw new Error(`Endpoint error (${response.status}): ${errorMessage}`);
      }

      return await response.json();
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error('SPARQL Execution Failed:', errorMessage);

    // A TypeError typically indicates a network-level failure (CORS preflight rejection,
    // DNS resolution failure, or no response). For remote endpoints we attempt one retry
    // through the CORS proxy before surfacing the error to the user. Local endpoints
    // are excluded because a local server refusing the request is a configuration issue
    // that the proxy cannot fix — and bypassing CORS locally hides the real problem.
    const isRemote = !endpoint.includes('localhost') && !endpoint.includes('127.0.0.1');
    if (
      !useProxy &&
      isRemote &&
      (error instanceof TypeError || errorMessage.includes('Failed to fetch'))
    ) {
      console.warn('Direct fetch failed. Retrying via CORS proxy...');
      return executeSparqlQuery(endpoint, query, true);
    }

    if (errorMessage.includes('Failed to fetch')) {
      const isLocal = endpoint.includes('localhost') || endpoint.includes('127.0.0.1');
      let msg = `CORS or Connection Error: Unable to reach ${endpoint}.`;
      if (isLocal) {
        msg += `\n\nEnsure Jena Fuseki/TripleDB is running and CORS is enabled (--cors flag).`;
      } else {
        msg += `\n\nThe server might be blocking browser requests or the URL is incorrect.`;
      }
      throw new Error(msg);
    }

    throw error;
  }
};
