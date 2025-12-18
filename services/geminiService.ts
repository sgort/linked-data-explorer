
import { GoogleGenAI } from "@google/genai";
import { COMMON_PREFIXES } from "../constants";

/**
 * AI Service for SPARQL Query Generation.
 * Uses Gemini 3 Pro for advanced reasoning and coding tasks.
 */
export const generateSparqlQuery = async (prompt: string): Promise<string> => {
  // Initialize the Gemini API client with the environment API key
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: `Task: Translate the following natural language request into a valid SPARQL query.
    
Context: The target dataset contains public service definitions, legal rules, and administrative concepts. 
It utilizes ontologies like CPSV-AP, SKOS, Dublin Core (DCT), and FOAF.

Available Prefixes:
${COMMON_PREFIXES}

User Request: "${prompt}"

Instructions:
1. Return ONLY the raw SPARQL query.
2. Do not include markdown code blocks (e.g., no \`\`\`sparql).
3. Ensure the query uses the provided prefixes where appropriate.
4. If the request is ambiguous, provide a broad discovery query.`,
  });

  // Extract text response
  const query = response.text?.trim() || "";
  
  // Basic cleanup: remove markdown blocks if the model ignored the instruction
  return query.replace(/```sparql|```/gi, '').trim();
};
