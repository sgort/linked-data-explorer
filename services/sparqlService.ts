
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
    targetUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(endpoint + '?query=' + encodeURIComponent(query))}`;
  }

  try {
    const headers: Record<string, string> = {
      'Accept': 'application/sparql-results+json',
    };

    if (useProxy) {
      // The proxy wraps the result in a JSON structure with the original body in 'contents'
      const proxyResponse = await fetch(targetUrl);
      if (!proxyResponse.ok) throw new Error("CORS Proxy failed to reach the endpoint.");
      const proxyData = await proxyResponse.json();
      
      if (!proxyData.contents) {
        throw new Error("Proxy returned empty content. The endpoint might be down.");
      }
      
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
        } catch (e) { /* ignore */ }
        throw new Error(`Endpoint error (${response.status}): ${errorMessage}`);
      }

      return await response.json();
    }
  } catch (error: any) {
    console.error("SPARQL Execution Failed:", error);
    
    // Auto-retry with proxy if it looks like a CORS/Network failure
    if (!useProxy && error.name === 'TypeError' && error.message === 'Failed to fetch') {
       console.log("Direct fetch failed (likely CORS). Retrying via proxy...");
       return executeSparqlQuery(endpoint, query, true);
    }

    if (error.name === 'TypeError' && error.message === 'Failed to fetch') {
         const isLocal = endpoint.includes('localhost') || endpoint.includes('127.0.0.1');
         let msg = `CORS/Network Error: Unable to reach ${endpoint}.`;
         msg += `\n\nPotential Fixes:`;
         if (isLocal) {
             msg += `\n- Ensure Jena Fuseki is running locally.`;
             msg += `\n- Start Jena with CORS enabled: fuseki-server --cors`;
         } else {
             msg += `\n- The server might block Cross-Origin requests.`;
             msg += `\n- Check if the URL is correct and supports SPARQL JSON results.`;
         }
         throw new Error(msg);
    }

    throw error;
  }
};
