import { SparqlResponse } from '../types';

/**
 * Executes a SPARQL query against a remote endpoint.
 * Includes a CORS fallback for browsers.
 */
export const executeSparqlQuery = async (
  endpoint: string,
  query: string,
  useProxy: boolean = false
): Promise<SparqlResponse> => {
  let targetUrl = endpoint;

  // CORS Proxy fallback: some public endpoints block direct browser requests.
  if (useProxy) {
    // We use allorigins as a reliable public proxy
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

    // Auto-retry with proxy if it looks like a CORS/Network failure on a remote host
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
