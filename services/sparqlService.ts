import { SparqlResponse } from '../types';

export const executeSparqlQuery = async (
  endpoint: string,
  query: string
): Promise<SparqlResponse> => {
  try {
    // Use POST with URL-encoded body to support long queries and better standard compliance
    const formBody = new URLSearchParams();
    formBody.append('query', query);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/sparql-results+json',
      },
      body: formBody,
      mode: 'cors', // Explicitly request CORS
    });

    if (!response.ok) {
      const text = await response.text();
      let errorMessage = text;
      // Try to extract clean message if JSON
      try {
         const json = JSON.parse(text);
         if (json.message) errorMessage = json.message;
      } catch (e) { /* ignore */ }
      
      throw new Error(`Endpoint error (${response.status}): ${errorMessage}`);
    }

    const data = await response.json();
    return data as SparqlResponse;
  } catch (error: any) {
    console.error("SPARQL Execution Failed:", error);
    
    // Handle specific fetch errors (Network/CORS)
    if (error.name === 'TypeError' && error.message === 'Failed to fetch') {
         const isLocal = endpoint.includes('localhost') || endpoint.includes('127.0.0.1');
         let msg = `Connection failed. Unable to reach ${endpoint}.`;
         msg += `\n\nTroubleshooting:`;
         if (isLocal) {
             msg += `\n1. Ensure Jena Fuseki is running.`;
             msg += `\n2. CORS blocked? Restart Jena with: ./fuseki-server --cors`;
             msg += `\n3. Check if the endpoint URL is correct (e.g. /ds/query).`;
         } else {
             msg += `\n1. Check your internet connection.`;
             msg += `\n2. The server might not allow Cross-Origin requests (CORS).`;
         }
         throw new Error(msg);
    }

    throw error;
  }
};