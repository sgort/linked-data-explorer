# Semantic Analysis & Link Discovery

## Overview

The Linked Data Explorer's semantic analysis system enables cross-agency DMN chain discovery by identifying variable relationships through SKOS (Simple Knowledge Organization System) concept mappings. This allows government agencies to chain DMNs together even when variable names differ, as long as they represent the same semantic concept.

---

## Core Concept

### The Problem

Different government agencies use different naming conventions:

```
Agency 1 (SVB):     output → "aanvragerIs181920"
Agency 2 (Heusden): input  → "aanvragerIs181920"  ✅ Exact match (easy)

Agency 3 (Zorg):    output → "heeftJuisteLeeftijd"
Agency 4 (Belast):  input  → "leeftijd_requirement"  ❌ Different names (hard)
```

### The Solution

Use **semantic concepts** as an intermediary:

```
Output Variable → Output Concept → Shared Concept ← Input Concept ← Input Variable
"heeftJuisteLeeftijd" → <.../heeftJuisteLeeftijd> → <.../leeftijd_requirement> ← <.../leeftijd_requirement> ← "leeftijd_requirement"
```

Both concepts point to the same third URI via `skos:exactMatch`, creating a semantic link.

---

## RDF Data Structure

### Variable Definition

```turtle
# Output Variable
<https://regels.overheid.nl/services/zorgtoeslag-voorwaarden/dmn/output/2> a cpsv:Output ;
    cpsv:produces <https://regels.overheid.nl/services/zorgtoeslag-voorwaarden/dmn> ;
    dct:identifier "heeftJuisteLeeftijd" ;
    dct:title "Heeft Juiste Leeftijd"@nl ;
    dct:type "Boolean" ;
    dct:description "Of de persoon de juiste leeftijd heeft"@nl .

# Input Variable
<https://regels.overheid.nl/services/zorgtoeslag/dmn/input/2> a cpsv:Input ;
    cpsv:isRequiredBy <https://regels.overheid.nl/services/zorgtoeslag/dmn> ;
    dct:identifier "leeftijd_requirement" ;
    dct:title "Leeftijd Requirement"@nl ;
    dct:type "Boolean" ;
    dct:description "Vereiste voor leeftijdscheck"@nl .
```

### Concept Mapping

```turtle
# Output Concept
<https://regels.overheid.nl/concepts/voorwaarden/heeftJuisteLeeftijd> a skos:Concept ;
    skos:prefLabel "Heeft Juiste Leeftijd"@nl ;
    skos:notation "HJLE" ;
    dct:subject <https://regels.overheid.nl/services/zorgtoeslag-voorwaarden/dmn/output/2> ;
    skos:exactMatch <https://regels.overheid.nl/concepts/leeftijd_requirement> ;
    skos:inScheme <https://regels.overheid.nl/schemes/dmn-variables> .

# Input Concept
<https://regels.overheid.nl/concepts/berekenrechtenhoogtezorg/leeftijd_requirement> a skos:Concept ;
    skos:prefLabel "Leeftijd Requirement"@nl ;
    skos:notation "LREQ" ;
    dct:subject <https://regels.overheid.nl/services/zorgtoeslag/dmn/input/2> ;
    skos:exactMatch <https://regels.overheid.nl/concepts/leeftijd_requirement> ;
    skos:inScheme <https://regels.overheid.nl/schemes/dmn-variables> .
```

**Key Properties**:
- `dct:subject`: Links concept to variable URI
- `skos:exactMatch`: Points to shared concept URI
- `skos:prefLabel`: Human-readable label
- `skos:notation`: Short code for display

---

## SPARQL Query: findEnhancedChainLinks

### Full Query

```sparql
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX dct: <http://purl.org/dc/terms/>
PREFIX cpsv: <http://purl.org/vocab/cpsv#>
PREFIX cprmv: <https://cprmv.open-regels.nl/0.3.0/>

SELECT DISTINCT ?dmn1 ?dmn1Identifier ?dmn1Title 
                ?dmn2 ?dmn2Identifier ?dmn2Title 
                ?outputVar ?outputVarId ?inputVar ?inputVarId ?variableType
                ?matchType ?sharedConcept
WHERE {
  # DMN1 produces output
  ?outputVar a cpsv:Output ;
             cpsv:produces ?dmn1 ;
             dct:identifier ?outputVarId ;
             dct:type ?variableType .
  
  # DMN2 requires input
  ?inputVar a cpsv:Input ;
            cpsv:isRequiredBy ?dmn2 ;
            dct:identifier ?inputVarId ;
            dct:type ?inputVarType .
  
  # Type compatibility (CRITICAL: must match exactly)
  FILTER(?variableType = ?inputVarType)
  FILTER(?dmn1 != ?dmn2)
  
  # Get DMN metadata
  ?dmn1 a cprmv:DecisionModel ;
        dct:identifier ?dmn1Identifier ;
        dct:title ?dmn1Title .
  
  ?dmn2 a cprmv:DecisionModel ;
        dct:identifier ?dmn2Identifier ;
        dct:title ?dmn2Title .
  
  # Check for semantic matching via shared concept
  OPTIONAL {
    ?outputConcept a skos:Concept ;
                   skos:exactMatch ?conceptUri ;
                   dct:subject ?outputVar .
    
    ?inputConcept a skos:Concept ;
                  skos:exactMatch ?conceptUri ;
                  dct:subject ?inputVar .
  }
  
  # Determine match type
  BIND(
    IF(?outputVarId = ?inputVarId && BOUND(?conceptUri), "both",
    IF(?outputVarId = ?inputVarId, "exact",
    IF(BOUND(?conceptUri), "semantic", "none")))
    AS ?matchType
  )
  
  BIND(
    IF(BOUND(?conceptUri), ?conceptUri, ?outputVarId)
    AS ?sharedConcept
  )
  
  # Only return rows where there's a match
  FILTER(?matchType != "none")
}
ORDER BY ?matchType ?dmn1Title ?dmn2Title
```

### Query Breakdown

**Step 1: Find Output Variables**
```sparql
?outputVar a cpsv:Output ;
           cpsv:produces ?dmn1 ;
           dct:identifier ?outputVarId ;
           dct:type ?variableType .
```
Finds all output variables from all DMNs.

**Step 2: Find Input Variables**
```sparql
?inputVar a cpsv:Input ;
          cpsv:isRequiredBy ?dmn2 ;
          dct:identifier ?inputVarId ;
          dct:type ?inputVarType .
```
Finds all input variables from all DMNs.

**Step 3: Type Compatibility Filter**
```sparql
FILTER(?variableType = ?inputVarType)
```
**CRITICAL**: Only matches variables with identical types (Boolean ≠ Integer, Integer ≠ Double).

**Step 4: Semantic Concept Join (Optional)**
```sparql
OPTIONAL {
  ?outputConcept a skos:Concept ;
                 skos:exactMatch ?conceptUri ;
                 dct:subject ?outputVar .
  
  ?inputConcept a skos:Concept ;
                skos:exactMatch ?conceptUri ;
                dct:subject ?inputVar .
}
```
Attempts to find a shared concept URI. Uses `OPTIONAL` so exact matches without concepts are still returned.

**Step 5: Match Type Classification**
```sparql
BIND(
  IF(?outputVarId = ?inputVarId && BOUND(?conceptUri), "both",
  IF(?outputVarId = ?inputVarId, "exact",
  IF(BOUND(?conceptUri), "semantic", "none")))
  AS ?matchType
)
```
- **"both"**: Exact identifier match AND semantic concept match
- **"exact"**: Identifier match only (no concept mapping)
- **"semantic"**: Different identifiers but shared concept
- **"none"**: No match (filtered out)

---

## Match Types

### Exact Match

```
DMN1 output: "aanvragerIs181920" (Boolean)
DMN2 input:  "aanvragerIs181920" (Boolean)
→ matchType: "exact"
```

Variables have identical identifiers. Can be assembled into DRD directly.

### Semantic Match

```
DMN1 output: "heeftJuisteLeeftijd" (Boolean)
DMN2 input:  "leeftijd_requirement" (Boolean)
→ Both point to: <https://regels.overheid.nl/concepts/leeftijd_requirement>
→ matchType: "semantic"
```

Different identifiers, but same semantic concept. **Cannot** be assembled into DRD (requires sequential execution).

### Both Match

```
DMN1 output: "bijstandsNorm" (Double)
DMN2 input:  "bijstandsNorm" (Double)
→ Exact identifier match
→ AND both have concepts pointing to same URI
→ matchType: "both"
```

Rare case where identifier happens to match AND there's semantic mapping. Treated as exact match for DRD purposes.

---

## API Endpoint

### GET /api/dmns/enhanced-chain-links

**Query Parameters**:
- `endpoint` (optional): TriplyDB SPARQL endpoint URL

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "dmn1": {
        "uri": "https://regels.overheid.nl/services/zorgtoeslag-voorwaarden/dmn",
        "identifier": "ZorgtoeslagVoorwaardenCheck",
        "title": "Zorgtoeslag Voorwaarden Check"
      },
      "dmn2": {
        "uri": "https://regels.overheid.nl/services/zorgtoeslag/dmn",
        "identifier": "berekenrechtenhoogtezorg",
        "title": "Bereken Rechten Hoogte Zorg"
      },
      "outputVariable": "heeftJuisteLeeftijd",
      "inputVariable": "leeftijd_requirement",
      "variableType": "Boolean",
      "matchType": "semantic",
      "sharedConcept": "https://regels.overheid.nl/concepts/leeftijd_requirement"
    }
  ],
  "timestamp": "2026-02-13T20:00:00.000Z"
}
```

**Implementation** (`packages/backend/src/services/sparql.service.ts`):

```typescript
async findEnhancedChainLinks(endpoint?: string): Promise<EnhancedChainLink[]> {
  const data = await this.executeQuery(query, endpoint);
  const bindings = data.results?.bindings || [];

  const results: EnhancedChainLink[] = [];

  for (const b of bindings) {
    const matchType = b.matchType.value;

    // If matchType is "both", create two separate entries
    if (matchType === 'both') {
      results.push({
        dmn1: { /* ... */ },
        dmn2: { /* ... */ },
        outputVariable: b.outputVarId.value,
        inputVariable: b.inputVarId.value,
        variableType: b.variableType.value,
        matchType: 'exact',
        sharedConcept: b.sharedConcept.value,
      });

      results.push({
        dmn1: { /* ... */ },
        dmn2: { /* ... */ },
        outputVariable: b.outputVarId.value,
        inputVariable: b.inputVarId.value,
        variableType: b.variableType.value,
        matchType: 'semantic',
        sharedConcept: b.sharedConcept.value,
      });
    } else {
      results.push({ /* single entry */ });
    }
  }

  return results;
}
```

---

## Frontend Integration

### Loading Semantic Links

```typescript
const loadSemanticLinks = async () => {
  const url = `${API_BASE_URL}/api/dmns/enhanced-chain-links?endpoint=${encodeURIComponent(endpoint)}`;
  const response = await fetch(url);
  const data = await response.json();

  if (data.success && Array.isArray(data.data)) {
    setSemanticLinks(data.data);
    console.log(
      `[SemanticLinks] ✓ Loaded ${data.data.length} links (${
        data.data.filter((l) => l.matchType === 'semantic').length
      } semantic)`
    );
  }
};
```

### Using Semantic Links in Validation

```typescript
// Check for semantic match with previous DMN
const semanticLink = semanticLinks.find(
  (link) =>
    link.dmn2.identifier === dmn.identifier &&
    link.dmn1.identifier === prevDmn.identifier &&
    link.inputVariable === input.identifier &&
    link.matchType === 'semantic'
);

if (semanticLink) {
  // Found semantic match → Chain is NOT DRD-compatible
  semanticMatches.push({
    outputDmn: prevDmn.identifier,
    outputVar: semanticLink.outputVariable,
    inputDmn: dmn.identifier,
    inputVar: input.identifier,
    matchType: 'semantic',
    semanticConcept: semanticLink.sharedConcept,
  });

  drdIssues.push(
    `Variable '${input.identifier}' requires semantic match. DRD requires exact identifier match.`
  );
}
```

---

## Semantic View Component

### UI Location

Chain Builder → **Semantic Analysis** tab

### Features

1. **Statistics Cards**:
   - Total semantic equivalences
   - Total semantic chain links
   - Total exact match links

2. **Semantic Chain Suggestions**:
   - Lists all potential chains with semantic matches
   - Shows output variable → input variable mappings
   - Displays shared concept URIs
   - Color-coded by match type

3. **Semantic Equivalences Table**:
   - Full list of all concept mappings
   - Grouped by shared concept
   - Shows which DMNs are connected

### Component Structure

```typescript
interface SemanticViewProps {
  endpoint: string;
  apiBaseUrl: string;
}

const SemanticView: React.FC<SemanticViewProps> = ({ endpoint, apiBaseUrl }) => {
  const [equivalences, setEquivalences] = useState<SemanticEquivalence[]>([]);
  const [enhancedLinks, setEnhancedLinks] = useState<EnhancedChainLink[]>([]);

  useEffect(() => {
    loadData();
  }, [endpoint]);

  const loadData = async () => {
    const [equivData, linksData] = await Promise.all([
      fetch(`${apiBaseUrl}/api/dmns/semantic-equivalences?endpoint=${encodeURIComponent(endpoint)}`),
      fetch(`${apiBaseUrl}/api/dmns/enhanced-chain-links?endpoint=${encodeURIComponent(endpoint)}`),
    ]);
    // ...
  };

  const semanticLinks = enhancedLinks.filter((l) => l.matchType === 'semantic');
  const exactLinks = enhancedLinks.filter((l) => l.matchType === 'exact');

  return (
    <div>
      {/* Statistics */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard value={equivalences.length} label="Semantic Equivalences" />
        <StatCard value={semanticLinks.length} label="Semantic Chain Links" />
        <StatCard value={exactLinks.length} label="Exact Match Links" />
      </div>

      {/* Chain Suggestions */}
      <div>
        <h3>Semantic Chain Suggestions</h3>
        {semanticLinks.map((link) => (
          <div key={link.sharedConcept}>
            {link.dmn1.title} → {link.dmn2.title}
            <br />
            {link.outputVariable} → {link.inputVariable}
          </div>
        ))}
      </div>
    </div>
  );
};
```

---

## Performance Considerations

### Query Complexity

**Worst Case**: O(n² × m²)
- n = number of DMNs
- m = average variables per DMN

For RONL dataset:
- ~10 DMNs
- ~5 variables per DMN
- ~50 output variables × ~50 input variables = 2,500 comparisons

**Optimization**: SPARQL query engine handles this efficiently through indexing.

### Caching

Backend caches results for 5 minutes:

```typescript
private dmnCache: {
  data: Set<string> | null;
  timestamp: number;
} = {
  data: null,
  timestamp: 0,
};

private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
```

### Frontend State

Semantic links loaded once on mount:

```typescript
useEffect(() => {
  loadDmns();
  loadSemanticLinks(); // ✅ Once on mount
}, [endpoint]);
```

Validation runs on every chain change:

```typescript
useEffect(() => {
  if (selectedChain.length > 0) {
    validateChain(); // ✅ Re-runs with cached semanticLinks
  }
}, [selectedChain, availableDmns, inputs, semanticLinks]);
```

---

## Common Pitfalls

### 1. Self-Referencing Concepts

**WRONG**:
```turtle
<.../heeftJuisteLeeftijd> skos:exactMatch <.../heeftJuisteLeeftijd> .
<.../leeftijd_requirement> skos:exactMatch <.../leeftijd_requirement> .
```

Concepts point to themselves, not to a shared third URI. SPARQL query finds no match.

**CORRECT**:
```turtle
<.../heeftJuisteLeeftijd> skos:exactMatch <.../leeftijd_requirement> .
<.../leeftijd_requirement> skos:exactMatch <.../leeftijd_requirement> .
```

Both point to the same URI.

### 2. Type Mismatches

**WRONG**:
```turtle
# Output
dct:type "Integer" .

# Input
dct:type "Double" .
```

SPARQL filter `?variableType = ?inputVarType` rejects the match even if concepts align.

**CORRECT**:
```turtle
# Both must be identical
dct:type "Double" .
```

### 3. Incorrect dct:subject

**WRONG**:
```turtle
<.../concept/heeftJuisteLeeftijd> a skos:Concept ;
    dct:subject <.../dmn/output/4> .  # Points to output #4

# But output #4 has identifier "vrijVanDetentie", not "heeftJuisteLeeftijd"
```

SPARQL joins concepts to variables via `dct:subject`, so the link breaks.

**CORRECT**:
```turtle
<.../concept/heeftJuisteLeeftijd> a skos:Concept ;
    dct:subject <.../dmn/output/2> .  # Must point to output with matching identifier
```

### 4. Missing Type in Variable

**WRONG**:
```turtle
<.../dmn/output/1> a cpsv:Output ;
    dct:identifier "someOutput" .
    # Missing dct:type !
```

SPARQL query requires `?variableType` to be bound. Query returns 0 results.

**CORRECT**:
```turtle
<.../dmn/output/1> a cpsv:Output ;
    dct:identifier "someOutput" ;
    dct:type "Boolean" .  # Required
```

---

## Debugging Semantic Links

### Console Commands

**Check loaded links**:
```javascript
const endpoint = 'https://api.open-regels.triply.cc/datasets/stevengort/DMN-discovery/services/DMN-discovery/sparql';

fetch(`http://localhost:3001/api/dmns/enhanced-chain-links?endpoint=${encodeURIComponent(endpoint)}`)
  .then(r => r.json())
  .then(data => {
    console.log('Total links:', data.data.length);
    console.log('Semantic links:', data.data.filter(l => l.matchType === 'semantic').length);
    console.table(data.data);
  });
```

**Check specific chain**:
```javascript
fetch(`http://localhost:3001/api/dmns/enhanced-chain-links?endpoint=${encodeURIComponent(endpoint)}`)
  .then(r => r.json())
  .then(data => {
    const links = data.data.filter(l => 
      l.dmn1.identifier === 'ZorgtoeslagVoorwaardenCheck' && 
      l.dmn2.identifier === 'berekenrechtenhoogtezorg'
    );
    console.table(links);
  });
```

### TriplyDB SPARQL Editor

1. Navigate to TriplyDB dataset
2. Click "Query"
3. Paste `findEnhancedChainLinks` query
4. Run and export to CSV
5. Check for missing/incorrect mappings

### Validation Logging

Console shows validation results:
```
[SemanticLinks] ✓ Loaded 26 links (16 semantic)
[Validation] Chain: ZorgtoeslagVoorwaardenCheck → berekenrechtenhoogtezorg
[Validation] ⚠️ Sequential | 0 missing | 6 semantic
```

---

## Future Enhancements

### 1. Transitive Semantic Matching

Support multi-hop semantic chains:

```
DMN1 → DMN2 → DMN3
     (semantic)  (semantic)
```

Currently requires adjacent DMNs. Could extend to support:
- DMN1 output semantically matches DMN3 input via DMN2

### 2. Concept Hierarchy

Support `skos:broader` / `skos:narrower`:

```turtle
<.../leeftijd> skos:broader <.../persoonsinformatie> .
<.../geboortedatum> skos:narrower <.../leeftijd> .
```

Enable more flexible matching where "age" can match "birth date" in certain contexts.

### 3. Confidence Scores

Rank semantic matches by reliability:
- Exact identifier match: 1.0
- Same `skos:notation`: 0.9
- Same `skos:prefLabel` (language-normalized): 0.8
- `skos:exactMatch` only: 0.7

### 4. Semantic Concept Browser

UI to explore all concepts and their relationships:
- Graph visualization of `skos:exactMatch` network
- Search by concept URI
- Filter by DMN or variable type

---

## Related Documentation

- `ENHANCED_VALIDATION.md` - Validation system architecture and debugging
- `DRD_GENERATION.md` - DRD assembly and deployment
- `TEST_CASES.md` - Testing semantic detection and validation

---

## References

- SKOS Specification: https://www.w3.org/TR/skos-reference/
- SPARQL 1.1: https://www.w3.org/TR/sparql11-query/
- CPSV-AP: https://joinup.ec.europa.eu/collection/semantic-interoperability-community-semic/solution/core-public-service-vocabulary-application-profile
