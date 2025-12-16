export const DEFAULT_ENDPOINT = "http://localhost:3030/ds/query";

export const PRESET_ENDPOINTS = [
  { name: "Local Jena", url: "http://localhost:3030/ds/query" },
  { name: "AOW Leeftijd Service", url: "https://api.open-regels.triply.cc/datasets/stevengort/aow-leeftijd-service/services/aow-leeftijd-service/sparql" },
  { name: "Geboortedatum Service", url: "https://api.open-regels.triply.cc/datasets/stevengort/geboortedatum/services/geboortedatum/sparql" }
];

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