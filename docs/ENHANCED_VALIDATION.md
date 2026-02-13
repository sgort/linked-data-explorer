# Enhanced Validation & Semantic Chain Detection

## Overview

The Linked Data Explorer implements a sophisticated validation system that distinguishes between two types of DMN chains:

1. **DRD-Compatible Chains**: All variables match by exact identifier, enabling deployment as unified Decision Requirements Diagrams in Operaton
2. **Sequential Chains**: Variables match semantically via `skos:exactMatch` relationships, requiring sequential API execution with runtime variable mapping

This document describes the complete implementation, including the validation logic, semantic detection mechanism, test data structure, and the debugging journey that led to a working end-to-end solution.

---

## Architecture

### Core Components

```
┌─────────────────────────────────────────────────────────────┐
│                    ChainBuilder.tsx                         │
│  • Loads semantic links via enhanced-chain-links API        │
│  • Manages validation state and chain composition           │
│  • Triggers validation on chain/input/semantic changes      │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                 Validation Engine                           │
│  • Checks exact identifier matches (availableOutputs Set)   │
│  • Finds semantic matches via semanticLinks array           │
│  • Determines DRD compatibility (no semantic links)         │
│  • Tracks missing inputs and user requirements              │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                Backend SPARQL Query                         │
│  findEnhancedChainLinks (sparql.service.ts)                 │
│  • Joins Output Variables → Concepts → Shared Concepts      │
│  • Joins Input Variables → Concepts → Shared Concepts       │
│  • Returns links with matchType: 'exact' | 'semantic'       │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Initialization**: `loadSemanticLinks()` fetches all potential chain links from backend
2. **Chain Building**: User drags DMNs into composer, triggering validation
3. **Validation**: For each DMN input, system checks:
   - Is it in `availableOutputs` (exact match)? → DRD-compatible
   - Does a semantic link exist? → Sequential-only
   - Neither? → User must provide input
4. **Result Storage**: `ChainValidation` object contains:
   - `isDrdCompatible`: boolean
   - `semanticMatches`: array of semantic links found
   - `drdIssues`: human-readable reasons why DRD is blocked
   - `missingInputs`: inputs user must provide

---

## Validation Logic

### Algorithm (packages/frontend/src/components/ChainBuilder/ChainBuilder.tsx)

```typescript
const validateChain = () => {
  const availableOutputs = new Set<string>();
  const semanticMatches: VariableMatch[] = [];
  const drdIssues: string[] = [];

  for (let i = 0; i < chainDmns.length; i++) {
    const dmn = chainDmns[i];

    for (const input of dmn.inputs) {
      // 1. Check exact match
      const exactMatch = availableOutputs.has(input.identifier);

      if (!exactMatch && i > 0) {
        // 2. Check semantic match with previous DMN
        const prevDmn = chainDmns[i - 1];
        const semanticLink = semanticLinks.find(
          (link) =>
            link.dmn2.identifier === dmn.identifier &&
            link.dmn1.identifier === prevDmn.identifier &&
            link.inputVariable === input.identifier &&
            link.matchType === 'semantic'
        );

        if (semanticLink) {
          // Semantic match found → Chain is NOT DRD-compatible
          semanticMatches.push({
            outputDmn: prevDmn.identifier,
            outputVar: semanticLink.outputVariable,
            inputDmn: dmn.identifier,
            inputVar: input.identifier,
            matchType: 'semantic',
            semanticConcept: semanticLink.sharedConcept,
          });

          drdIssues.push(
            `Variable '${input.identifier}' requires semantic match. ` +
            `DRD requires exact identifier match.`
          );

          continue; // Don't require user input
        }
      }

      // 3. No exact or semantic match → User must provide
      if (!exactMatch && !semanticMatch) {
        requiredInputs.push(input);
        if (!(input.identifier in inputs)) {
          missingInputs.push(input);
        }
      }
    }

    // Add this DMN's outputs to available set
    dmn.outputs.forEach(output => availableOutputs.add(output.identifier));
  }

  return {
    isDrdCompatible: drdIssues.length === 0,
    semanticMatches,
    drdIssues,
    missingInputs,
    // ...
  };
};
```

### Key Design Decisions

**1. React Dependency Management**

The validation must re-run when semantic links load (asynchronous). Initially, validation ran before `semanticLinks` populated, causing false DRD-compatible results.

**Fix**: Add `semanticLinks` to `useEffect` dependency array:

```typescript
useEffect(() => {
  if (selectedChain.length > 0) {
    validateChain();
  }
}, [selectedChain, availableDmns, inputs, semanticLinks]); // ✅ Added semanticLinks
```

**2. Boolean Input Validation**

Unchecked checkboxes don't exist in React state (`{ someBoolean: true }` vs `{}`), causing false "missing input" errors.

**Fix**: Treat absent boolean inputs as valid (default `false`):

```typescript
const hasValue = input.identifier in inputs;
const isBooleanWithDefaultFalse = input.type === 'Boolean' && !hasValue;

if (!hasValue && !isBooleanWithDefaultFalse) {
  missingInputs.push(input);
}
```

**3. Null Safety on Initial Load**

When dragging first DMN into composer, `validation` is `null`, causing crashes on `validation.isValid` access.

**Fix**: Use optional chaining throughout:

```typescript
disabled={!validation?.isValid || isExecuting}
```

---

## Semantic Detection via SPARQL

### Backend Query (packages/backend/src/services/sparql.service.ts)

The `findEnhancedChainLinks` query is the heart of semantic detection:

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
  
  # Only return rows where there's a match
  FILTER(?matchType != "none")
}
```

### Critical Requirements

1. **Type Compatibility**: `?variableType = ?inputVarType` ensures Boolean doesn't match Integer
2. **Shared Concept**: Both concepts must point to **identical third URI** via `skos:exactMatch`
3. **Subject Linking**: `dct:subject` must correctly point to the variable URI

---

## Test Data: ZorgtoeslagVoorwaardenCheck

### Purpose

Create a DMN that chains to `berekenrechtenhoogtezorg` using **semantic-only** matches (no exact identifiers). This validates that:

1. Semantic detection works end-to-end
2. DRD save is properly blocked
3. Sequential execution functions with semantic variable flattening
4. Test case management handles semantic chains

### Structure

**Inputs** (user-provided):
- `geboortedatum` (Date)
- `woonadres` (String)
- `zorgverzekeringNummer` (String)
- `heeftBetalingsregeling` (Boolean)
- `inDetentie` (Boolean)
- `jaarinkomen` (Double)

**Outputs** (semantic mappings):
- `isIngezetene` → `ingezetene_requirement`
- `heeftJuisteLeeftijd` → `leeftijd_requirement`
- `betalingsregelingOK` → `betalingsregeling_requirement`
- `vrijVanDetentie` → `detentie_requirement`
- `heeftGeldigeVerzekering` → `verzekering_requirement`
- `inkomenBinnenGrenzen` → `inkomen_en_vermogen_requirement`

### Concept Mapping Pattern

Each output has a concept that points to the **same shared concept** as the corresponding `berekenrechtenhoogtezorg` input:

```turtle
# ZorgtoeslagVoorwaardenCheck output concept
<https://regels.overheid.nl/concepts/voorwaarden/isIngezetene> a skos:Concept ;
    skos:prefLabel "Is Ingezetene"@nl ;
    dct:subject <https://regels.overheid.nl/services/zorgtoeslag-voorwaarden/dmn/output/1> ;
    skos:exactMatch <https://regels.overheid.nl/concepts/ingezetene_requirement> .

# berekenrechtenhoogtezorg input concept
<https://regels.overheid.nl/concepts/berekenrechtenhoogtezorg/ingezetene_requirement> a skos:Concept ;
    skos:prefLabel "Ingezetene_requirement"@nl ;
    dct:subject <https://regels.overheid.nl/services/zorgtoeslag/dmn/input/1> ;
    skos:exactMatch <https://regels.overheid.nl/concepts/ingezetene_requirement> .
```

**Key Insight**: Both concepts point to `<https://regels.overheid.nl/concepts/ingezetene_requirement>`, creating the semantic link.

---

## Debugging Journey: Making Semantic Detection Work

### Issue 1: Zero Semantic Links Found

**Symptom**: Console showed `[SemanticLinks] Bereken links: []`

**Diagnosis**: SPARQL query returned no results for the test chain

**Investigation Steps**:
1. Ran SPARQL query directly in TriplyDB editor
2. Exported results to CSV
3. Discovered `ZorgtoeslagVoorwaardenCheck` DMN not in results

**Root Cause**: TTL file not uploaded to TriplyDB

**Fix**: Upload `ZorgtoeslagVoorwaardenCheck.ttl` via TriplyDB interface, clear cache

---

### Issue 2: Wrong Concept URIs

**Symptom**: After upload, still 0 semantic links

**Diagnosis**: CSV export showed:
```
berekenrechtenhoogtezorg: ingezetene_requirement → .../ingezetene_requirement
ZorgtoeslagVoorwaardenCheck: isIngezetene → .../isIngezetene
```

Concepts pointed to **different URIs**, not a shared third URI.

**Root Cause**: Initial TTL used concept self-references:
```turtle
# WRONG
<.../isIngezetene> skos:exactMatch <.../isIngezetene> .
```

**Fix**: Point both to shared concept URI:
```turtle
# CORRECT
<.../isIngezetene> skos:exactMatch <.../ingezetene_requirement> .
```

---

### Issue 3: Swapped dct:subject Pointers

**Symptom**: 5 links found instead of 6, two variables swapped

**Diagnosis**: CSV showed:
```
Concept: vrijVanDetentie → dct:subject → output/4 (identifier: heeftJuisteLeeftijd) ❌
Concept: heeftJuisteLeeftijd → dct:subject → output/2 (identifier: vrijVanDetentie) ❌
```

**Root Cause**: Copy-paste error in TTL file - concepts pointed to wrong output URIs

**Fix**: Ensure `dct:subject` points to output with matching identifier:
```turtle
<.../vrijVanDetentie> a skos:Concept ;
    dct:subject <.../dmn/output/4> ;  # Must be the output with identifier "vrijVanDetentie"
    skos:exactMatch <.../detentie_requirement> .
```

---

### Issue 4: Type Mismatch (Integer vs Double)

**Symptom**: 5 links found, missing `inkomenBinnenGrenzen → inkomen_en_vermogen_requirement`

**Diagnosis**: Ran type-checking SPARQL query:
```
ZorgtoeslagVoorwaardenCheck: inkomenBinnenGrenzen → Integer
berekenrechtenhoogtezorg: inkomen_en_vermogen_requirement → Double
```

SPARQL filter `?variableType = ?inputVarType` rejected the match.

**Root Cause**: Incorrect type in `ZorgtoeslagVoorwaardenCheck.ttl`

**Fix**: Change output #6 type from Integer to Double:
```turtle
<.../dmn/output/6> a cpsv:Output ;
    dct:identifier "inkomenBinnenGrenzen" ;
    dct:type "Double" ;  # Changed from Integer
```

---

### Final Result

After all fixes:
```
[SemanticLinks] ✓ Loaded 26 links (16 semantic)
[Validation] Chain: ZorgtoeslagVoorwaardenCheck → berekenrechtenhoogtezorg
[Validation] ⚠️ Sequential | 0 missing | 6 semantic

✅ SEMANTIC MATCH FOUND: isIngezetene → ingezetene_requirement
✅ SEMANTIC MATCH FOUND: heeftJuisteLeeftijd → leeftijd_requirement
✅ SEMANTIC MATCH FOUND: betalingsregelingOK → betalingsregeling_requirement
✅ SEMANTIC MATCH FOUND: vrijVanDetentie → detentie_requirement
✅ SEMANTIC MATCH FOUND: heeftGeldigeVerzekering → verzekering_requirement
✅ SEMANTIC MATCH FOUND: inkomenBinnenGrenzen → inkomen_en_vermogen_requirement

Status: isDrdCompatible = false ✓
```

---

## Template System Enhancement

### Before v0.8.2

Templates had no type distinction:
- Saved chains could be DRD or sequential
- No visual indicator
- Inconsistent save behavior

### After v0.8.2

**ChainTemplate Interface**:
```typescript
interface ChainTemplate {
  id: string;
  name: string;
  type: 'sequential' | 'drd';  // NEW
  dmnIds: string[];
  drdId?: string;              // For DRD templates
  drdDeploymentId?: string;    // For DRD templates
  // ...
}
```

**Auto-Detection**:
```typescript
const templateType: 'sequential' | 'drd' = 
  validation?.isDrdCompatible ? 'drd' : 'sequential';
```

**Visual Indicators**:
- 🎯 Purple badge for DRD templates
- ⛓️ Amber badge for Sequential templates

**Save Behavior**:
- **DRD**: Deploys to Operaton → stores `drdDeploymentId` → saves template
- **Sequential**: Just saves template (no deployment)

**Button Layout**:
```
┌──────────┬──────────┬──────────┐
│ Execute  │   Save   │  Export  │
└──────────┴──────────┴──────────┘
```

All three equal width, consistent behavior.

---

## User Experience Flow

### DRD-Compatible Chain

1. User builds chain: `SVB_LeeftijdsInformatie → SZW_BijstandsnormInformatie`
2. Validation detects: 0 semantic matches, all exact
3. UI shows: "✓ Chain is valid and ready to execute"
4. User clicks **Save**:
   - Modal title: "Save as DRD Template"
   - Button: "Save as DRD"
   - System deploys to Operaton
   - Template saved with `type: 'drd'`
5. Template list shows: 🎯 DRD badge

### Sequential Chain

1. User builds chain: `ZorgtoeslagVoorwaardenCheck → berekenrechtenhoogtezorg`
2. Validation detects: 6 semantic matches
3. UI shows: "⚠️ Sequential execution required (semantic links)"
4. User clicks **Save**:
   - Modal title: "Save as Sequential Template"
   - Button: "Save Template"
   - No deployment (just localStorage)
   - Template saved with `type: 'sequential'`
5. Template list shows: ⛓️ Sequential badge

---

## Technical Constraints

### Why Semantic Chains Can't Be DRDs

**DRD Structure** (from DMN 1.3 spec):
```xml
<decision id="Decision_2" name="Calculate Benefits">
  <informationRequirement>
    <requiredDecision href="#Decision_1"/>
    <requiredInput>leeftijd_output</requiredInput>  <!-- Must match exactly -->
  </informationRequirement>
</decision>
```

DRDs use **static string references** to wire decisions. There's no runtime variable mapping capability. If Decision_1 outputs `heeftJuisteLeeftijd` and Decision_2 requires `leeftijd_requirement`, DRD compilation fails.

**Sequential Execution** bypasses this:
```typescript
const step1Result = await executeDmn('ZorgtoeslagVoorwaardenCheck', inputs);

// Runtime variable flattening via semantic links
const step2Inputs = {
  ...inputs,
  ingezetene_requirement: step1Result.isIngezetene,  // Semantic mapping
  leeftijd_requirement: step1Result.heeftJuisteLeeftijd,
  // ...
};

const step2Result = await executeDmn('berekenrechtenhoogtezorg', step2Inputs);
```

---

## Performance Implications

**Semantic Link Loading**: O(n²) worst case (all DMNs × all DMNs), typically ~26 links for RONL dataset

**Validation Complexity**: O(m × n) where:
- m = number of DMNs in chain
- n = average inputs per DMN

Typical chain (3 DMNs, 5 inputs each): ~15 checks per validation

**Optimization**: Use `Set` for `availableOutputs` (O(1) lookup) instead of array iteration

---

## Future Enhancements

### 1. Multi-Hop Semantic Chains

Currently validates only adjacent DMNs. Could support:
```
DMN1 → DMN2 → DMN3
      (semantic)  (exact)
```

Where DMN1 output semantically matches DMN3 input via DMN2.

### 2. Semantic Concept Ontology Browser

UI to explore `skos:exactMatch` relationships across all DMNs, aiding in chain discovery.

### 3. Partial DRD Generation

If chain has semantic links in middle but exact matches at edges, generate multiple DRDs with orchestration layer.

### 4. Test Case Templates

Save test inputs alongside templates for one-click regression testing.

---

## Conclusion

The enhanced validation system successfully distinguishes between DRD-compatible and semantic chains through:

1. **Robust SPARQL querying** with type checking and shared concept detection
2. **React state management** with proper dependency tracking
3. **Comprehensive test data** validating semantic-only chains
4. **Detailed debugging** revealing critical RDF data integrity requirements

The result is a system that guides users toward the correct execution path (DRD vs sequential) based on actual semantic relationships in the data, not guesses or heuristics.

---

## References

- DMN 1.3 Specification: https://www.omg.org/spec/DMN/1.3
- SKOS Reference: https://www.w3.org/TR/skos-reference/
- SPARQL 1.1: https://www.w3.org/TR/sparql11-query/
- Related Docs:
  - [DRD assembly and deployment](./DRD_GENERATION.md)
  - [Semantic link discovery](./SEMANTIC_ANALYSIS.md)
  - [Test case management system](./TEST_CASES.md)
