import { GoogleGenAI } from "@google/genai";
import { SYSTEM_INSTRUCTION } from '../constants';

export const generateSparqlFromPrompt = async (
  userPrompt: string
): Promise<string> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("Gemini API Key is missing. Please set it in the settings.");
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    
    // Using gemini-2.5-flash for speed and logic capabilities
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: userPrompt,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.1, // Low temperature for deterministic code generation
      }
    });

    let text = response.text || '';
    
    // Clean up if the model accidentally returns markdown blocks despite instructions
    text = text.replace(/^```sparql/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
    
    return text;
  } catch (error) {
    console.error("Gemini Generation Error:", error);
    throw new Error("Failed to generate SPARQL query.");
  }
};