export const DEFAULT_ENDPOINT = "http://localhost:3030/ds/query";

export const COMMON_PREFIXES = `
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX owl: <http://www.w3.org/2002/07/owl#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX dc: <http://purl.org/dc/elements/1.1/>
PREFIX dct: <http://purl.org/dc/terms/>
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
PREFIX cpsv: <http://purl.org/vocab/cpsv#>
PREFIX m8g: <http://data.europa.eu/m8g/>
PREFIX eli: <http://data.europa.eu/eli/ontology#>
PREFIX ro: <https://regels.overheid.nl/termen/>
`;

export const SAMPLE_QUERIES = [
  {
    name: "Get All Public Services",
    sparql: `${COMMON_PREFIXES}
SELECT ?service ?title ?description
WHERE {
  ?service a cpsv:PublicService .
  ?service dct:title ?title .
  OPTIONAL { ?service dct:description ?description }
  FILTER(LANG(?title) = "nl")
} LIMIT 100`
  },
  {
    name: "Explore Relations (S-P-O)",
    sparql: `${COMMON_PREFIXES}
SELECT ?s ?p ?o
WHERE {
  ?s ?p ?o
} LIMIT 50`
  },
  {
    name: "Services & Authorities",
    sparql: `${COMMON_PREFIXES}
SELECT ?serviceName ?orgName
WHERE {
  ?service a cpsv:PublicService ;
           dct:title ?serviceName ;
           m8g:hasCompetentAuthority ?org .
  ?org skos:prefLabel ?orgName .
  FILTER(LANG(?serviceName) = "nl")
}`
  },
  {
      name: "Rules Valid From 2025",
      sparql: `${COMMON_PREFIXES}
SELECT ?rule ?id ?validFrom
WHERE {
  ?rule a cpsv:Rule ;
        dct:identifier ?id ;
        ro:validFrom ?validFrom .
  FILTER (?validFrom >= "2025-01-01"^^xsd:date)
}`
  }
];

export const SYSTEM_INSTRUCTION = `
You are an expert in SPARQL and Linked Data, specifically for the European Data Model (CPSV-AP) and Dutch Government data (Regels Overheid).

Your task is to translate natural language questions into valid SPARQL 1.1 queries.

Context & Schema:
- Classes: cpsv:PublicService, cpsv:Rule, m8g:PublicOrganisation, eli:LegalResource
- Properties: 
  - dct:title, dct:identifier, dct:description
  - m8g:hasCompetentAuthority (links Service to Organization)
  - m8g:hasLegalResource (links Service to LegalResource)
  - ro:validFrom (date), ro:confidenceLevel
- Prefixes:
  ${COMMON_PREFIXES}

Rules:
1. Return ONLY the raw SPARQL query. Do not use Markdown blocks (no \`\`\`sparql).
2. Always include the necessary PREFIX headers defined above.
3. If the user asks for a specific language (Dutch), use FILTER(LANG(?var) = "nl").
4. Sort results meaningfully if applicable.
`;