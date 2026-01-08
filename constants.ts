export const DEFAULT_ENDPOINT = 'http://localhost:3030/ds/query';

export const PRESET_ENDPOINTS = [
  { name: 'Local Jena', url: 'http://localhost:3030/ds/query' },
  {
    name: 'Facts Jena',
    url: 'https://api.open-regels.triply.cc/datasets/stevengort/facts/services/facts-jena/sparql',
  },
];

export const COMMON_PREFIXES = `
PREFIX cv: <http://data.europa.eu/m8g/>
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
PREFIX ronl: <https://regels.overheid.nl/termen/>
`;

export const SAMPLE_QUERIES = [
  {
    name: 'Get All Public Services',
    sparql: `${COMMON_PREFIXES}
SELECT ?service ?title ?description
WHERE {
  ?service a cpsv:PublicService .
  ?service dct:title ?title .
  OPTIONAL { ?service dct:description ?description }
  FILTER(LANG(?title) = "nl")
} ORDER BY ?title`,
  },
  {
    name: 'Rules with Their Services',
    sparql: `${COMMON_PREFIXES}
SELECT ?serviceTitle ?ruleTitle ?validFrom ?confidence ?description
WHERE {
  ?service a cpsv:PublicService .
  ?service dct:title ?serviceTitle .
  
  ?rule a cpsv:Rule .
  ?rule cpsv:implements ?service .
  ?rule dct:title ?ruleTitle .
  
  OPTIONAL { ?rule dct:description ?description }
  OPTIONAL { ?rule ronl:validFrom ?validFrom }
  OPTIONAL { ?rule ronl:confidenceLevel ?confidence }
  
  FILTER(LANG(?serviceTitle) = "nl")
  FILTER(LANG(?ruleTitle) = "nl")
}
ORDER BY ?serviceTitle ?validFrom ?ruleTitle`,
  },
  {
    name: 'Count Rules per Service',
    sparql: `${COMMON_PREFIXES}
SELECT ?serviceTitle (COUNT(?rule) as ?ruleCount)
WHERE {
  ?service a cpsv:PublicService .
  ?service dct:title ?serviceTitle .
  
  ?rule a cpsv:Rule .
  ?rule cpsv:implements ?service .
  
  FILTER(LANG(?serviceTitle) = "nl")
}
GROUP BY ?serviceTitle
ORDER BY DESC(?ruleCount)`,
  },
  {
    name: 'Services with All Their Rules (Detailed)',
    sparql: `${COMMON_PREFIXES}
SELECT ?service ?serviceTitle ?serviceDescription ?rule ?ruleTitle ?validFrom ?confidence
WHERE {
  ?service a cpsv:PublicService .
  ?service dct:title ?serviceTitle .
  
  OPTIONAL { ?service dct:description ?serviceDescription }
  
  OPTIONAL {
    ?rule a cpsv:Rule .
    ?rule cpsv:implements ?service .
    ?rule dct:title ?ruleTitle .
    OPTIONAL { ?rule ronl:validFrom ?validFrom }
    OPTIONAL { ?rule ronl:confidenceLevel ?confidence }
    FILTER(LANG(?ruleTitle) = "nl")
  }
  
  FILTER(LANG(?serviceTitle) = "nl")
}
ORDER BY ?serviceTitle ?validFrom ?ruleTitle`,
  },
  {
    name: 'Explore Relations (S-P-O)',
    sparql: `${COMMON_PREFIXES}
SELECT ?s ?p ?o
WHERE {
  ?s ?p ?o
} LIMIT 500`,
  },
  {
    name: 'Services and Authorities',
    sparql: `${COMMON_PREFIXES}
SELECT ?service ?title ?authorityName (STR(?homepage) AS ?website)
WHERE {
  ?service a cpsv:PublicService .
  ?service dct:title ?title .
  ?service cv:hasCompetentAuthority ?authority .
  ?authority skos:prefLabel ?authorityName .
  ?authority foaf:homepage ?homepage .
  FILTER(LANG(?title) = "nl")
}
ORDER BY ?title`,
  },
  {
    name: 'Services with Legal Resources',
    sparql: `${COMMON_PREFIXES}
SELECT ?service ?serviceTitle ?legalTitle ?legalResource
WHERE {
  ?service a cpsv:PublicService .
  ?service dct:title ?serviceTitle .
  ?service cv:hasLegalResource ?legalResource .
  ?legalResource dct:title ?legalTitle .
  FILTER(LANG(?serviceTitle) = "nl")
}
ORDER BY ?serviceTitle`,
  },
];
