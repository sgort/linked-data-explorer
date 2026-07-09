export const DEFAULT_ENDPOINT =
  'https://api.open-regels.triply.cc/datasets/stevengort/RONL/services/RONL/sparql';

export const PRESET_ENDPOINTS = [
  { name: 'Local Jena', url: 'http://localhost:3030/ds/query' },
  {
    name: 'DMN Discovery',
    url: 'https://api.open-regels.triply.cc/datasets/stevengort/DMN-discovery/services/DMN-discovery/sparql',
  },
  {
    name: 'RONL',
    url: 'https://api.open-regels.triply.cc/datasets/stevengort/RONL/services/RONL/sparql',
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
PREFIX ronl: <https://regels.overheid.nl/ontology#>
PREFIX cprmv: <https://cprmv.open-regels.nl/0.3.0/>
PREFIX cprmv041: <https://standaarden.open-regels.nl/standards/cprmv/0.4.1#>
PREFIX schema: <http://schema.org/>
`;

export const SAMPLE_QUERIES = [
  {
    name: 'Get All Organizations',
    sparql: `${COMMON_PREFIXES}
SELECT ?organization ?identifier ?name ?homepage ?spatial ?logo
WHERE {
  ?organization a cv:PublicOrganisation ;
                dct:identifier ?identifier ;
                skos:prefLabel ?name .

  OPTIONAL { ?organization foaf:homepage ?homepage }
  OPTIONAL { ?organization cv:spatial ?spatial }
  OPTIONAL { ?organization foaf:logo ?logo }
  OPTIONAL { ?organization schema:image ?logo }

  FILTER(LANG(?name) = "nl" || LANG(?name) = "")
}
ORDER BY ?name`,
  },
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
    name: 'All Rule Paths and Norms by Ruleset',
    category: 'rules',
    sparql: `${COMMON_PREFIXES}
SELECT DISTINCT ?rulesetId ?rule ?ruleIdPath ?norm
WHERE {
  ?rule a cprmv:Rule ;
        cprmv:rulesetId ?rulesetId ;
        cprmv:ruleIdPath ?ruleIdPath ;
        cprmv:norm ?norm .
}
ORDER BY ?rulesetId ?ruleIdPath`,
  },
  {
    name: 'Rules with Their Services',
    sparql: `${COMMON_PREFIXES}
SELECT DISTINCT ?serviceTitle ?ruleTitle ?validFrom ?confidence ?description
WHERE {
  ?service a cpsv:PublicService .
  ?service dct:title ?serviceTitle .

  ?rule a cpsv:Rule .
  ?rule dct:title ?ruleTitle .

  # A rule links to its service either directly (older exports) or via the
  # shared legal resource. Since the CPSV-AP RuleShape fix, a cpsv:Rule's
  # cpsv:implements points at an eli:LegalResource — the same resource the
  # service declares with cv:hasLegalResource — instead of the service itself.
  {
    ?rule cpsv:implements ?service .
  } UNION {
    ?service cv:hasLegalResource ?legal .
    ?rule cpsv:implements ?legal .
  }

  OPTIONAL { ?rule dct:description ?description }
  OPTIONAL { ?rule cprmv041:validFrom ?validFrom }
  OPTIONAL { ?rule cprmv041:confidenceLevel ?confidence }

  FILTER(LANG(?serviceTitle) = "nl")
  FILTER(LANG(?ruleTitle) = "nl")
  # Hide auto-generated DMN decision rules (placeholder "Decision rule <id>" titles).
  FILTER(!STRSTARTS(STR(?ruleTitle), "Decision rule "))
}
ORDER BY ?serviceTitle ?validFrom ?ruleTitle`,
  },
  {
    name: 'Count Rules per Service',
    sparql: `${COMMON_PREFIXES}
SELECT ?serviceTitle (COUNT(DISTINCT ?rule) as ?ruleCount)
WHERE {
  ?service a cpsv:PublicService .
  ?service dct:title ?serviceTitle .

  ?rule a cpsv:Rule .
  ?rule dct:title ?ruleTitle .
  # Direct link (older exports) or via the shared eli:LegalResource (RuleShape).
  {
    ?rule cpsv:implements ?service .
  } UNION {
    ?service cv:hasLegalResource ?legal .
    ?rule cpsv:implements ?legal .
  }

  FILTER(LANG(?serviceTitle) = "nl")
  # Exclude auto-generated DMN decision rules so the count matches the rule list.
  FILTER(!STRSTARTS(STR(?ruleTitle), "Decision rule "))
}
GROUP BY ?serviceTitle
ORDER BY DESC(?ruleCount)`,
  },
  {
    name: 'Services with All Their Rules (Detailed)',
    sparql: `${COMMON_PREFIXES}
SELECT DISTINCT ?service ?serviceTitle ?serviceDescription ?rule ?ruleTitle ?validFrom ?confidence
WHERE {
  ?service a cpsv:PublicService .
  ?service dct:title ?serviceTitle .

  OPTIONAL { ?service dct:description ?serviceDescription }

  OPTIONAL {
    ?rule a cpsv:Rule .
    ?rule dct:title ?ruleTitle .
    # Direct link (older exports) or via the shared eli:LegalResource (RuleShape).
    {
      ?rule cpsv:implements ?service .
    } UNION {
      ?service cv:hasLegalResource ?legal .
      ?rule cpsv:implements ?legal .
    }
    OPTIONAL { ?rule cprmv041:validFrom ?validFrom }
    OPTIONAL { ?rule cprmv041:confidenceLevel ?confidence }
    FILTER(LANG(?ruleTitle) = "nl")
    # Hide auto-generated DMN decision rules (placeholder "Decision rule <id>" titles).
    FILTER(!STRSTARTS(STR(?ruleTitle), "Decision rule "))
  }
  
  FILTER(LANG(?serviceTitle) = "nl")
}
ORDER BY ?serviceTitle ?validFrom ?ruleTitle`,
  },
  {
    name: 'Service Rules Metadata',
    category: 'rules',
    sparql: `${COMMON_PREFIXES}
SELECT ?serviceId ?serviceTitle ?legalResourceId ?rulesetId ?ruleIdPath ?ruleId ?ruleDefinition ?ruleSituatie ?ruleNorm
WHERE {
  # Start with rules that implement legal resources
  ?rule a cprmv:Rule ;
        cprmv:implements ?implementedResource ;
        cprmv:rulesetId ?rulesetId ;
        cprmv:ruleIdPath ?ruleIdPath .
  
  # Find the legal resource (base or versioned)
  {
    # Case 1: Rule implements the base legal resource directly
    ?implementedResource a eli:LegalResource ;
                        dct:identifier ?legalResourceId .
    BIND(?implementedResource as ?legalResource)
  }
  UNION
  {
    # Case 2: Rule implements a versioned legal resource
    ?legalResource a eli:LegalResource ;
                   dct:identifier ?legalResourceId ;
                   eli:is_realized_by ?implementedResource .
  }
  
  # Find the service that uses this legal resource
  ?service a cpsv:PublicService ;
           dct:identifier ?serviceId ;
           dct:title ?serviceTitle ;
           cv:hasLegalResource ?legalResource .
  
  # Get rule details
  OPTIONAL { ?rule cprmv:id ?ruleId }
  OPTIONAL { ?rule cprmv:definition ?ruleDefinition }
  OPTIONAL { ?rule cprmv:situatie ?ruleSituatie }
  OPTIONAL { ?rule cprmv:norm ?ruleNorm }
  
  FILTER(LANG(?serviceTitle) = "nl" || LANG(?serviceTitle) = "")
}
ORDER BY ?serviceId ?ruleIdPath`,
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
    name: 'NL-SBB Concepts and Services',
    sparql: `${COMMON_PREFIXES}
SELECT ?subject ?prefLabel ?exactMatch ?service ?serviceTitle
WHERE {
  ?subject skos:exactMatch ?exactMatch ;
           dct:subject ?variable .

  OPTIONAL { ?subject skos:prefLabel ?prefLabel . FILTER(LANG(?prefLabel) = "nl" || LANG(?prefLabel) = "") }

  {
    ?variable cpsv:isRequiredBy ?dmn .
  } UNION {
    ?variable cpsv:produces ?dmn .
  }

  { ?dmn cprmv:implements ?service } UNION { ?dmn cprmv041:implements ?service }
  OPTIONAL { ?service dct:title ?serviceTitle . FILTER(LANG(?serviceTitle) = "nl" || LANG(?serviceTitle) = "") }
}
ORDER BY ?service ?subject`,
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
];

// DMN Orchestration Queries
export const DMN_QUERIES = [
  {
    name: 'Find All DMNs',
    category: 'orchestration',
    sparql: `${COMMON_PREFIXES}
SELECT DISTINCT ?dmn ?identifier ?title ?apiEndpoint ?deploymentId ?service 
       ?inputUri ?inputId ?inputType ?inputTitle
       ?outputUri ?outputId ?outputType ?outputTitle
WHERE {
  # Core DMN properties (DecisionModel type + implementedBy: CPRMV 0.3.0 or 0.4.1)
  { ?dmn a cprmv:DecisionModel } UNION { ?dmn a cprmv041:DecisionModel }
  ?dmn dct:identifier ?identifier ;
       dct:title ?title .
  { ?dmn cprmv:implementedBy ?apiEndpoint } UNION { ?dmn cprmv041:implementedBy ?apiEndpoint }

  OPTIONAL { ?dmn cprmv:deploymentId ?deploymentId }
  OPTIONAL { ?dmn cprmv041:deploymentId ?deploymentId }
  OPTIONAL { ?dmn cpsv:implements ?service }
  
  # Get all inputs
  OPTIONAL {
    ?inputUri a cpsv:Input ;
              cpsv:isRequiredBy ?dmn ;
              dct:identifier ?inputId ;
              dct:type ?inputType .
    OPTIONAL { ?inputUri dct:title ?inputTitle }
  }
  
  # Get all outputs
  OPTIONAL {
    ?outputUri a cpsv:Output ;
               cpsv:produces ?dmn ;
               dct:identifier ?outputId ;
               dct:type ?outputType .
    OPTIONAL { ?outputUri dct:title ?outputTitle }
  }
  
  FILTER(LANG(?title) = "nl" || LANG(?title) = "")
}
ORDER BY ?title ?inputId ?outputId`,
  },
  {
    name: 'DMNs full path traversed',
    category: 'orchestration',
    sparql: `${COMMON_PREFIXES}
SELECT ?dmn ?dmnTitle ?service ?serviceTitle ?organization ?orgName ?logo
WHERE {
  # Start with DMN (DecisionModel type + implements: CPRMV 0.3.0 or 0.4.1)
  { ?dmn a cprmv:DecisionModel } UNION { ?dmn a cprmv041:DecisionModel }
  ?dmn dct:title ?dmnTitle .
  { ?dmn cprmv:implements ?service } UNION { ?dmn cprmv041:implements ?service }

  # Service details
  ?service a cpsv:PublicService ;
           dct:title ?serviceTitle ;
           cv:hasCompetentAuthority ?organization .

  # Organization details
  ?organization a cv:PublicOrganisation ;
                skos:prefLabel ?orgName .
  
  # Logo (optional)
  OPTIONAL { ?organization foaf:logo ?logo }
  
  FILTER(LANG(?dmnTitle) = "nl" || LANG(?dmnTitle) = "")
  FILTER(LANG(?serviceTitle) = "nl" || LANG(?serviceTitle) = "")
  FILTER(LANG(?orgName) = "nl" || LANG(?orgName) = "")
}
ORDER BY ?dmnTtitle`,
  },
  {
    name: 'DMN Input/Output Details',
    category: 'orchestration',
    sparql: `${COMMON_PREFIXES}
SELECT ?dmn ?dmnTitle ?inputUri ?inputId ?inputType ?outputUri ?outputId ?outputType ?outputValue
WHERE {
  { ?dmn a cprmv:DecisionModel } UNION { ?dmn a cprmv041:DecisionModel }
  ?dmn dct:title ?dmnTitle .

  OPTIONAL {
    ?inputUri a cpsv:Input ;
              cpsv:isRequiredBy ?dmn ;
              dct:identifier ?inputId ;
              dct:type ?inputType .
  }
  
  OPTIONAL {
    ?outputUri a cpsv:Output ;
               cpsv:produces ?dmn ;
               dct:identifier ?outputId ;
               dct:type ?outputType .
    OPTIONAL { ?outputUri schema:value ?outputValue }
  }
  
  FILTER(LANG(?dmnTitle) = "nl" || LANG(?dmnTitle) = "")
}
ORDER BY ?dmnTitle ?inputId ?outputId`,
  },
  {
    name: 'Find DMN Chains',
    category: 'orchestration',
    sparql: `${COMMON_PREFIXES}
SELECT DISTINCT ?dmn1 ?dmn1Title ?dmn2 ?dmn2Title ?variableId ?variableType
WHERE {
  # DMN1 produces output
  ?output1 a cpsv:Output ;
           cpsv:produces ?dmn1 ;
           dct:identifier ?variableId ;
           dct:type ?variableType .
  
  # DMN2 requires input with same identifier
  ?input2 a cpsv:Input ;
          cpsv:isRequiredBy ?dmn2 ;
          dct:identifier ?variableId ;
          dct:type ?variableType .
  
  # Get DMN titles (DecisionModel type: CPRMV 0.3.0 or 0.4.1)
  { ?dmn1 a cprmv:DecisionModel } UNION { ?dmn1 a cprmv041:DecisionModel }
  ?dmn1 dct:title ?dmn1Title .

  { ?dmn2 a cprmv:DecisionModel } UNION { ?dmn2 a cprmv041:DecisionModel }
  ?dmn2 dct:title ?dmn2Title .

  # Ensure different DMNs
  FILTER(?dmn1 != ?dmn2)
  FILTER(LANG(?dmn1Title) = "nl" || LANG(?dmn1Title) = "")
  FILTER(LANG(?dmn2Title) = "nl" || LANG(?dmn2Title) = "")
}
ORDER BY ?dmn1Title ?dmn2Title ?variableId`,
  },
  {
    name: 'DMN Chain Paths (Transitive)',
    category: 'orchestration',
    sparql: `${COMMON_PREFIXES}
SELECT DISTINCT ?startDmn ?startTitle ?endDmn ?endTitle ?pathLength
WHERE {
  # This is a simplified version - full transitive closure requires more complex SPARQL
  # For now, we find direct and 2-hop chains
  
  {
    # Direct connection (1-hop)
    ?output1 cpsv:produces ?startDmn ;
             dct:identifier ?var1 .
    ?input2 cpsv:isRequiredBy ?endDmn ;
            dct:identifier ?var1 .
    FILTER(?var1 = ?var1)
    BIND(1 AS ?pathLength)
  }
  UNION
  {
    # 2-hop connection
    ?output1 cpsv:produces ?startDmn ;
             dct:identifier ?var1 .
    ?input2 cpsv:isRequiredBy ?middleDmn ;
            dct:identifier ?var1 .
    ?output2 cpsv:produces ?middleDmn ;
             dct:identifier ?var2 .
    ?input3 cpsv:isRequiredBy ?endDmn ;
            dct:identifier ?var2 .
    FILTER(?startDmn != ?middleDmn && ?middleDmn != ?endDmn && ?startDmn != ?endDmn)
    BIND(2 AS ?pathLength)
  }
  
  { ?startDmn a cprmv:DecisionModel } UNION { ?startDmn a cprmv041:DecisionModel }
  ?startDmn dct:title ?startTitle .
  { ?endDmn a cprmv:DecisionModel } UNION { ?endDmn a cprmv041:DecisionModel }
  ?endDmn dct:title ?endTitle .

  FILTER(?startDmn != ?endDmn)
  FILTER(LANG(?startTitle) = "nl" || LANG(?startTitle) = "")
  FILTER(LANG(?endTitle) = "nl" || LANG(?endTitle) = "")
}
ORDER BY ?pathLength ?startTitle ?endTitle`,
  },
  {
    name: 'DMN Complete Metadata',
    category: 'orchestration',
    sparql: `${COMMON_PREFIXES}
SELECT ?dmn ?identifier ?title ?apiEndpoint ?deploymentId ?service ?serviceTitle
       (GROUP_CONCAT(DISTINCT ?inputId; separator=", ") as ?inputs)
       (GROUP_CONCAT(DISTINCT ?outputId; separator=", ") as ?outputs)
WHERE {
  # DecisionModel type + implementedBy: CPRMV 0.3.0 or 0.4.1
  { ?dmn a cprmv:DecisionModel } UNION { ?dmn a cprmv041:DecisionModel }
  ?dmn dct:identifier ?identifier ;
       dct:title ?title .
  { ?dmn cprmv:implementedBy ?apiEndpoint } UNION { ?dmn cprmv041:implementedBy ?apiEndpoint }

  OPTIONAL { ?dmn cprmv:deploymentId ?deploymentId }
  OPTIONAL { ?dmn cprmv041:deploymentId ?deploymentId }

  OPTIONAL {
    ?dmn cpsv:implements ?service .
    ?service dct:title ?serviceTitle .
    FILTER(LANG(?serviceTitle) = "nl" || LANG(?serviceTitle) = "")
  }
  
  OPTIONAL {
    ?input cpsv:isRequiredBy ?dmn ;
           dct:identifier ?inputId .
  }
  
  OPTIONAL {
    ?output cpsv:produces ?dmn ;
            dct:identifier ?outputId .
  }
  
  FILTER(LANG(?title) = "nl" || LANG(?title) = "")
}
GROUP BY ?dmn ?identifier ?title ?apiEndpoint ?deploymentId ?service ?serviceTitle
ORDER BY ?title`,
  },
];

// Combined queries for Library view
export const ALL_QUERIES = [...SAMPLE_QUERIES, ...DMN_QUERIES];
