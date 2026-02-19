# Test Cases & Validation Testing

## Overview

This document provides comprehensive testing procedures for the enhanced validation system, semantic chain detection, and template management features. Use this as a testing checklist to verify that semantic detection, DRD compatibility checks, and template saving work correctly end-to-end.

---

## Table of Contents

1. [Quick Start Testing Guide](#quick-start-testing-guide)
2. [Test Scenarios](#test-scenarios)
3. [Testing Semantic Detection](#testing-semantic-detection)
4. [Testing DRD Compatibility](#testing-drd-compatibility)
5. [Testing Template System](#testing-template-system)
6. [Test Data Setup](#test-data-setup)
7. [Verification Procedures](#verification-procedures)
8. [Common Issues & Solutions](#common-issues--solutions)
9. [Test Case Panel Usage](#test-case-panel-usage)

---

## Quick Start Testing Guide

### Prerequisites

1. **Backend running**: `npm run dev` in `packages/backend`
2. **Frontend running**: `npm run dev` in `packages/frontend`
3. **TriplyDB endpoint**: `https://api.open-regels.triply.cc/datasets/stevengort/DMN-discovery/services/DMN-discovery/sparql`
4. **Test DMN uploaded**: `ZorgtoeslagVoorwaardenCheck.ttl` in TriplyDB

### 5-Minute Smoke Test

```bash
# 1. Load the app
http://localhost:3000

# 2. Switch to Chain Builder tab
Click "Regels Overheid"

# 3. Check semantic links loaded
Open browser console → Look for: "[SemanticLinks] ✓ Loaded 26 links (16 semantic)"

# 4. Build exact match chain (DRD-compatible)
Drag: SVB_LeeftijdsInformatie → SZW_BijstandsnormInformatie

# 5. Verify DRD detection
Look for: ✓ "Chain is valid and ready to execute"
Buttons: Execute | Save | Export (Save should work)

# 6. Build semantic chain
Clear chain → Drag: ZorgtoeslagVoorwaardenCheck → berekenrechtenhoogtezorg

# 7. Verify semantic detection
Look for: ⚠️ "Sequential execution required (semantic links)"
Console: "[Validation] ⚠️ Sequential | 0 missing | 6 semantic"
Buttons: Execute | Save | Export (Save should save as sequential template)

# 8. Test execution
Fill in test inputs → Click Execute → Verify results appear

✅ If all checks pass: Core functionality works
```

---

## Test Scenarios

### Scenario 1: Exact Match Chain (DRD-Compatible)

**Purpose**: Verify that chains with all exact identifier matches are correctly identified as DRD-compatible.

**Steps**:
1. Navigate to Chain Builder
2. Drag `SVB_LeeftijdsInformatie` into composer
3. Drag `SZW_BijstandsnormInformatie` below it
4. Observe validation status

**Expected Results**:
- ✅ Validation shows: "Chain is valid and ready to execute"
- ✅ No semantic match warnings
- ✅ Console logs: `[Validation] ✓ DRD | X missing | 0 semantic`
- ✅ All three buttons enabled: Execute, Save, Export
- ✅ Save modal title: "Save as DRD Template"
- ✅ Save button text: "Save as DRD"

**What This Tests**:
- Exact identifier matching logic
- DRD compatibility detection
- Save button behavior for DRD chains

---

### Scenario 2: Semantic Chain (Sequential-Only)

**Purpose**: Verify that chains with semantic-only matches are correctly identified and blocked from DRD save.

**Steps**:
1. Navigate to Chain Builder
2. Clear any existing chain
3. Drag `ZorgtoeslagVoorwaardenCheck` into composer
4. Drag `berekenrechtenhoogtezorg` below it
5. Observe validation status

**Expected Results**:
- ✅ Validation shows: "⚠️ Sequential execution required (semantic links)"
- ✅ Console logs: `[Validation] ⚠️ Sequential | 0 missing | 6 semantic`
- ✅ Console shows 6 semantic match logs:
  ```
  ✅ SEMANTIC MATCH FOUND: isIngezetene → ingezetene_requirement
  ✅ SEMANTIC MATCH FOUND: heeftJuisteLeeftijd → leeftijd_requirement
  ✅ SEMANTIC MATCH FOUND: betalingsregelingOK → betalingsregeling_requirement
  ✅ SEMANTIC MATCH FOUND: vrijVanDetentie → detentie_requirement
  ✅ SEMANTIC MATCH FOUND: heeftGeldigeVerzekering → verzekering_requirement
  ✅ SEMANTIC MATCH FOUND: inkomenBinnenGrenzen → inkomen_en_vermogen_requirement
  ```
- ✅ Save modal title: "Save as Sequential Template"
- ✅ Save button text: "Save Template"
- ✅ Amber warning badge visible

**What This Tests**:
- Semantic link detection via SPARQL
- React dependency management (semanticLinks in useEffect)
- Validation state computation
- UI rendering based on validation results

---

### Scenario 3: Missing Inputs Detection

**Purpose**: Verify that validation correctly identifies required user inputs.

**Steps**:
1. Build chain: `ZorgtoeslagVoorwaardenCheck` only (single DMN)
2. Don't fill any inputs
3. Observe validation

**Expected Results**:
- ❌ Validation shows error: "Missing 4 required input(s)"
- ✅ Execute button disabled
- ✅ Required inputs list shows:
  - Geboortedatum (String)
  - Woonadres (String)
  - Zorgverzekering Nummer (String)
  - Jaarinkomen (Integer)
- ✅ Boolean inputs NOT marked as missing (heeftBetalingsregeling, inDetentie)

**What This Tests**:
- Boolean input default handling
- Required vs optional input detection
- Missing input validation logic

---

### Scenario 4: Boolean Input Validation

**Purpose**: Verify unchecked checkboxes don't cause false "missing input" errors.

**Steps**:
1. Build chain: `ZorgtoeslagVoorwaardenCheck` → `berekenrechtenhoogtezorg`
2. Fill text inputs: Geboortedatum, Woonadres, Zorgverzekering Nummer, Jaarinkomen
3. Leave checkboxes unchecked: Heeft Betalingsregeling, In Detentie
4. Observe validation

**Expected Results**:
- ✅ Validation shows: "Missing 0 required input(s)"
- ✅ Execute button enabled
- ✅ No errors about missing boolean inputs

**What This Tests**:
- Boolean default value handling (`isBooleanWithDefaultFalse` logic)
- Input validation edge cases

---

### Scenario 5: Type Mismatch Prevention

**Purpose**: Verify semantic links respect variable type compatibility.

**Test Data Required**: Create a DMN with Integer output that should NOT match Boolean input.

**Steps**:
1. Check console for semantic links
2. Verify no links between incompatible types

**Expected Results**:
- ✅ Integer outputs only match Integer inputs
- ✅ Boolean outputs only match Boolean inputs
- ✅ Double outputs only match Double inputs

**What This Tests**:
- SPARQL type filter: `FILTER(?variableType = ?inputVarType)`
- Type safety in semantic matching

---

### Scenario 6: Template Save and Load

**Purpose**: Verify templates save correctly and can be reloaded.

**DRD Template Test**:
1. Build chain: `SVB_LeeftijdsInformatie` → `SZW_BijstandsnormInformatie`
2. Fill test inputs
3. Click Save
4. Name: "Test DRD Template"
5. Click "Save as DRD"
6. Wait for success message
7. Clear chain
8. Load "Test DRD Template" from template list
9. Verify chain and inputs restored

**Sequential Template Test**:
1. Build chain: `ZorgtoeslagVoorwaardenCheck` → `berekenrechtenhoogtezorg`
2. Fill test inputs
3. Click Save
4. Name: "Test Sequential Template"
5. Click "Save Template"
6. Verify success (no deployment)
7. Clear chain
8. Load "Test Sequential Template" from template list
9. Verify chain and inputs restored

**Expected Results**:
- ✅ Templates appear in "MY TEMPLATES" section
- ✅ DRD template shows 🎯 purple badge
- ✅ Sequential template shows ⛓️ amber badge
- ✅ Inputs correctly restored on load
- ✅ Chain composition matches original

**What This Tests**:
- Template saving logic
- localStorage persistence
- Template type detection
- Template loading and state restoration

---

### Scenario 7: Chain Execution

**Purpose**: Verify chains execute correctly via sequential orchestration.

**Steps**:
1. Build chain: `ZorgtoeslagVoorwaardenCheck` → `berekenrechtenhoogtezorg`
2. Fill inputs:
   - Geboortedatum: `1990-05-15`
   - Woonadres: `Amsterdam`
   - Zorgverzekering Nummer: `123456`
   - Jaarinkomen: `24000`
   - Uncheck both boolean inputs
3. Click Execute
4. Wait for results

**Expected Results**:
- ✅ Execution starts (loading indicator)
- ✅ Progress shown (if implemented)
- ✅ Results appear showing:
  - Step 1 outputs (ZorgtoeslagVoorwaardenCheck)
  - Step 2 outputs (berekenrechtenhoogtezorg)
  - Final outputs
- ✅ Execution time displayed
- ✅ Success indicator

**What This Tests**:
- Sequential execution orchestration
- Variable flattening (semantic → exact mapping)
- Backend API integration
- Results rendering

---

### Scenario 8: Export Chain

**Purpose**: Verify chains can be exported as JSON.

**Steps**:
1. Build any chain
2. Fill inputs
3. Click Export
4. Select format: JSON
5. Set filename: "test-chain"
6. Click Export

**Expected Results**:
- ✅ Modal opens with format selection
- ✅ JSON selected by default
- ✅ File downloads: `test-chain.json`
- ✅ JSON contains:
  - Chain DMN IDs
  - Input values
  - Metadata (timestamp, version)

**What This Tests**:
- Export functionality
- JSON serialization
- File download mechanism

---

### Scenario 9: Validation Re-run on Changes

**Purpose**: Verify validation updates when chain changes.

**Steps**:
1. Build exact match chain
2. Observe validation: DRD-compatible
3. Add semantic-only DMN to chain
4. Observe validation updates to sequential

**Expected Results**:
- ✅ Validation updates immediately
- ✅ No page refresh required
- ✅ UI reflects new validation state
- ✅ Console logs show re-validation

**What This Tests**:
- React useEffect dependency array
- Validation trigger on chain changes
- State management

---

### Scenario 10: Null Safety on Empty Chain

**Purpose**: Verify no crashes when chain is empty or validation is null.

**Steps**:
1. Start with empty chain
2. Click around interface
3. Try to click Execute/Save/Export

**Expected Results**:
- ✅ No crashes
- ✅ Buttons properly disabled
- ✅ No console errors
- ✅ Validation panel shows empty state

**What This Tests**:
- Optional chaining (`validation?.isValid`)
- Null safety in UI rendering
- Edge case handling

---

## Testing Semantic Detection

### Comprehensive Semantic Detection Test

**Objective**: Verify all 6 semantic links are detected correctly.

**Console Test Script**:
```javascript
const endpoint = 'https://api.open-regels.triply.cc/datasets/stevengort/DMN-discovery/services/DMN-discovery/sparql';

fetch(`http://localhost:3001/api/dmns/enhanced-chain-links?endpoint=${encodeURIComponent(endpoint)}`)
  .then(r => r.json())
  .then(data => {
    const zorgLinks = data.data.filter(l => 
      l.dmn1.identifier === 'ZorgtoeslagVoorwaardenCheck' && 
      l.dmn2.identifier === 'berekenrechtenhoogtezorg'
    );
    
    console.log('=== SEMANTIC DETECTION TEST ===');
    console.log('Links found:', zorgLinks.length, '(expected: 6)');
    
    const expectedMappings = [
      'isIngezetene → ingezetene_requirement',
      'heeftJuisteLeeftijd → leeftijd_requirement',
      'betalingsregelingOK → betalingsregeling_requirement',
      'vrijVanDetentie → detentie_requirement',
      'heeftGeldigeVerzekering → verzekering_requirement',
      'inkomenBinnenGrenzen → inkomen_en_vermogen_requirement'
    ];
    
    expectedMappings.forEach(mapping => {
      const [out, inp] = mapping.split(' → ');
      const found = zorgLinks.find(l => l.outputVariable === out && l.inputVariable === inp);
      console.log(found ? '✅' : '❌', mapping);
    });
  });
```

**Expected Output**:
```
=== SEMANTIC DETECTION TEST ===
Links found: 6 (expected: 6)
✅ isIngezetene → ingezetene_requirement
✅ heeftJuisteLeeftijd → leeftijd_requirement
✅ betalingsregelingOK → betalingsregeling_requirement
✅ vrijVanDetentie → detentie_requirement
✅ heeftGeldigeVerzekering → verzekering_requirement
✅ inkomenBinnenGrenzen → inkomen_en_vermogen_requirement
```

**If Any ❌ Appears**: Check RDF data in TriplyDB for issues:
1. Run concept verification query (see Test Data Setup)
2. Check dct:subject pointers
3. Verify skos:exactMatch URIs
4. Confirm variable types match

---

### Verification Checklist

After building `ZorgtoeslagVoorwaardenCheck → berekenrechtenhoogtezorg` chain:

- [ ] Console shows `[SemanticLinks] ✓ Loaded 26 links`
- [ ] Console shows `[Validation] ⚠️ Sequential | 0 missing | 6 semantic`
- [ ] 6 semantic match logs appear in console
- [ ] Validation panel shows amber warning
- [ ] "Sequential execution required" message visible
- [ ] Save modal shows "Save as Sequential Template"
- [ ] No "Save as DRD" button (only "Save Template")

---

## Testing DRD Compatibility

### DRD Detection Test

**Objective**: Verify chains with exact matches are DRD-compatible.

**Test Chain**: `SVB_LeeftijdsInformatie → SZW_BijstandsnormInformatie`

**Verification Steps**:

1. **Check Console Logs**:
   ```
   [Validation] ✓ DRD | X missing | 0 semantic
   ```

2. **Check Validation Panel**:
   - Green checkmark icon
   - "Chain is valid and ready to execute"
   - No amber warnings

3. **Check Save Modal**:
   - Title: "Save as DRD Template"
   - Purple badge: "🎯 DRD Template"
   - Button text: "Save as DRD"
   - Description mentions "deployed as unified DRD"

4. **Attempt Save**:
   - Fill name: "Test DRD"
   - Click "Save as DRD"
   - Wait for deployment
   - Check success message mentions deployment ID

5. **Verify Backend Deployment**:
   ```javascript
   // Check localStorage for drdDeploymentId
   const templates = JSON.parse(localStorage.getItem('linkeddata-explorer-user-templates'));
   const endpoint = 'https://api.open-regels.triply.cc/datasets/stevengort/DMN-discovery/services/DMN-discovery/sparql';
   const testDrd = templates[endpoint].find(t => t.name === 'Test DRD');
   console.log('DRD Deployment ID:', testDrd.drdDeploymentId);
   console.log('DRD Entry Point:', testDrd.drdId);
   ```

**Expected Results**:
- ✅ `drdDeploymentId`: UUID format (e.g., `43c759d6-082b-11f1-a5e9-f68ed60940f5`)
- ✅ `drdId`: Prefixed identifier (e.g., `dmn1_SZW_BijstandsnormInformatie`)
- ✅ Template `type`: `"drd"`

---

### DRD vs Sequential Decision Matrix

| Chain Composition | Semantic Matches | DRD Compatible? | Template Type | Execution Mode |
|-------------------|------------------|-----------------|---------------|----------------|
| SVB → SZW | 0 | ✅ Yes | `drd` | Single DRD call |
| SVB → Heusden | 0 | ✅ Yes | `drd` | Single DRD call |
| Zorg → Bereken | 6 | ❌ No | `sequential` | Sequential API calls |
| Single DMN | N/A | ✅ Yes | `drd` | Single call |

---

## Testing Template System

### Template Lifecycle Test

**Full End-to-End Template Test**:

```
Create → Save → Delete → Verify
```

**Steps**:

1. **Create & Save**:
   - Build chain: `ZorgtoeslagVoorwaardenCheck → berekenrechtenhoogtezorg`
   - Fill inputs
   - Click Save
   - Name: "Lifecycle Test"
   - Description: "Test template for lifecycle verification"
   - Click Save Template
   - Verify success message

2. **Verify in Template List**:
   - Check "MY TEMPLATES" section
   - Find "Lifecycle Test"
   - Verify ⛓️ sequential badge
   - Verify description shown

3. **Load Template**:
   - Clear current chain
   - Click "Lifecycle Test" template
   - Verify chain rebuilds
   - Verify inputs restored

4. **Execute from Template**:
   - Click Execute
   - Verify execution completes
   - Verify results shown

5. **Delete Template**:
   - Hover over "Lifecycle Test"
   - Click delete button (trash icon)
   - Confirm deletion
   - Verify template removed from list

6. **Verify Deletion in localStorage**:
   ```javascript
   const templates = JSON.parse(localStorage.getItem('linkeddata-explorer-user-templates'));
   const endpoint = 'https://api.open-regels.triply.cc/datasets/stevengort/DMN-discovery/services/DMN-discovery/sparql';
   const found = templates[endpoint].find(t => t.name === 'Lifecycle Test');
   console.log('Template exists:', !!found); // Should be false
   ```

**Expected Results**:
- ✅ Template saves successfully
- ✅ Template appears in list with correct badge
- ✅ Template loads correctly
- ✅ Execution works from loaded template
- ✅ Deletion removes template
- ✅ localStorage updated

---

### Template Badge Display Test

**Objective**: Verify visual indicators work correctly.

**Setup**: Create 2 templates
- DRD: `SVB_LeeftijdsInformatie → SZW_BijstandsnormInformatie`
- Sequential: `ZorgtoeslagVoorwaardenCheck → berekenrechtenhoogtezorg`

**Verification**:

| Template | Icon | Badge Color | Badge Text |
|----------|------|-------------|------------|
| DRD | 🎯 | Purple (`bg-purple-100 text-purple-700`) | "DRD" |
| Sequential | ⛓️ | Amber (`bg-amber-100 text-amber-700`) | "Sequential" |

---

## Test Data Setup

### Required Test DMN: ZorgtoeslagVoorwaardenCheck

**Location**: Upload to TriplyDB dataset

**Verification Query** (run in TriplyDB SPARQL editor):

```sparql
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX dct: <http://purl.org/dc/terms/>
PREFIX cpsv: <http://purl.org/vocab/cpsv#>

SELECT ?concept ?conceptLabel ?exactMatch ?outputVar ?outputVarId
WHERE {
  ?concept a skos:Concept ;
           skos:prefLabel ?conceptLabel ;
           skos:exactMatch ?exactMatch ;
           dct:subject ?outputVar .
  
  ?outputVar a cpsv:Output ;
             dct:identifier ?outputVarId .
  
  FILTER(CONTAINS(STR(?concept), "voorwaarden"))
}
ORDER BY ?outputVarId
```

**Expected Results** (6 rows):

| Concept Label | exactMatch URI | outputVarId |
|---------------|----------------|-------------|
| Betalingsregeling OK | `.../betalingsregeling_requirement` | betalingsregelingOK |
| Heeft Geldige Verzekering | `.../verzekering_requirement` | heeftGeldigeVerzekering |
| Heeft Juiste Leeftijd | `.../leeftijd_requirement` | heeftJuisteLeeftijd |
| Inkomen Binnen Grenzen | `.../inkomen_en_vermogen_requirement` | inkomenBinnenGrenzen |
| Is Ingezetene | `.../ingezetene_requirement` | isIngezetene |
| Vrij Van Detentie | `.../detentie_requirement` | vrijVanDetentie |

**If Incorrect**: Check TTL file for:
- Swapped `dct:subject` pointers
- Self-referencing `skos:exactMatch`
- Type mismatches
- Missing concepts

---

### Test Input Values

**Standard Test Set for ZorgtoeslagVoorwaardenCheck**:

```json
{
  "geboortedatum": "1990-05-15",
  "woonadres": "Amsterdam",
  "zorgverzekeringNummer": "123456",
  "jaarinkomen": 24000,
  "heeftBetalingsregeling": false,
  "inDetentie": false
}
```

**Expected Output Values**:

```json
{
  "isIngezetene": true,
  "heeftJuisteLeeftijd": true,
  "betalingsregelingOK": true,
  "vrijVanDetentie": true,
  "heeftGeldigeVerzekering": true,
  "inkomenBinnenGrenzen": true
}
```

---

## Verification Procedures

### Manual Verification Checklist

After each code change, run through:

- [ ] **Semantic Links Load**: Console shows `[SemanticLinks] ✓ Loaded X links`
- [ ] **Validation Triggers**: Building chain shows validation in console
- [ ] **DRD Detection**: Exact match chains show green checkmark
- [ ] **Semantic Detection**: Semantic chains show amber warning
- [ ] **Boolean Inputs**: Unchecked boxes don't cause errors
- [ ] **Save Modal**: Title updates based on chain type
- [ ] **Template Badges**: Correct icons and colors in template list
- [ ] **Execution Works**: Chains execute successfully
- [ ] **Export Works**: JSON file downloads correctly

---

### Automated Test Suite (Future)

**Recommended Test Framework**: Playwright or Cypress

**Priority Test Cases**:

1. **Semantic Link Loading**:
   - Mock API response
   - Verify state update
   - Check console output

2. **Validation Logic**:
   - Test exact match detection
   - Test semantic match detection
   - Test missing input detection
   - Test boolean default handling

3. **Template CRUD**:
   - Create DRD template
   - Create sequential template
   - Load template
   - Delete template

4. **UI Rendering**:
   - Verify badges render
   - Verify buttons enable/disable
   - Verify validation messages

---

## Common Issues & Solutions

### Issue 1: Zero Semantic Links Loaded

**Symptom**: Console shows `[SemanticLinks] ✓ Loaded 0 links`

**Diagnosis**:
1. Backend not running
2. Wrong endpoint URL
3. No DMNs in TriplyDB
4. Cache not cleared

**Solution**:
```bash
# Clear cache
curl -X DELETE "http://localhost:3001/api/cache/clear?endpoint=https://api.open-regels.triply.cc/datasets/stevengort/DMN-discovery/services/DMN-discovery/sparql"

# Refresh page
# Check backend logs for SPARQL errors
```

---

### Issue 2: Semantic Chain Shows as DRD-Compatible

**Symptom**: Semantic chain incorrectly shows green checkmark

**Diagnosis**:
1. Validation ran before semantic links loaded
2. React dependency issue

**Solution**:
- Check `useEffect` dependency array includes `semanticLinks`
- Verify console shows semantic links loaded BEFORE validation runs

---

### Issue 3: Boolean Inputs Marked as Missing

**Symptom**: Validation shows "Missing 2 required input(s)" for unchecked boxes

**Diagnosis**: Boolean default handling not implemented

**Solution**: Verify validation logic:
```typescript
const isBooleanWithDefaultFalse = input.type === 'Boolean' && !hasValue;

if (!hasValue && !isBooleanWithDefaultFalse) {
  missingInputs.push(input);
}
```

---

### Issue 4: Save Button Crashes App

**Symptom**: Clicking Save causes white screen, console error about `validation.isValid`

**Diagnosis**: Missing optional chaining

**Solution**: Use `validation?.isValid` everywhere, not `validation.isValid`

---

### Issue 5: Template Type Not Showing

**Symptom**: Templates don't show 🎯 or ⛓️ badges

**Diagnosis**: Template saved without `type` field

**Solution**:
1. Delete old templates from localStorage
2. Save new templates (system auto-detects type)
3. Verify `type` field in localStorage

---

## Test Case Panel Usage

### Accessing Test Case Panel

**Location**: Chain Configuration panel → "Test Cases" section

**Features**:
- Save current inputs as named test case
- Load saved test cases
- Delete test cases
- Export/import test cases

### Creating Test Cases

**Steps**:
1. Build chain
2. Fill inputs with test values
3. Click "Save Current" in Test Cases panel
4. Name: "Test Case 1"
5. Click Save

**Verification**:
```javascript
// Check localStorage
const testCases = JSON.parse(localStorage.getItem('linkeddata-explorer-test-cases'));
console.log(testCases);
```

### Using Test Cases for Regression Testing

**Workflow**:
1. Create test cases for each scenario
2. Load test case
3. Click Execute
4. Verify expected outputs
5. Document any deviations

**Example Test Case Set**:
- "Eligible Applicant" - All conditions true
- "Ineligible Age" - heeftJuisteLeeftijd = false
- "No Insurance" - heeftGeldigeVerzekering = false
- "In Detention" - vrijVanDetentie = false

---

## Testing Best Practices

### 1. Test in Isolation

Test one feature at a time:
- First: Semantic link loading
- Then: Validation logic
- Then: UI rendering
- Finally: End-to-end

### 2. Use Console Logging

Always check console for:
- `[SemanticLinks]` logs
- `[Validation]` logs
- Error messages
- Network requests

### 3. Clear State Between Tests

```javascript
// Clear localStorage
localStorage.clear();

// Clear cache
fetch('http://localhost:3001/api/cache/clear?endpoint=...', { method: 'DELETE' });

// Refresh page
location.reload();
```

### 4. Document Expected vs Actual

Create a testing log:

```
Test: Semantic Detection
Date: 2026-02-13
Expected: 6 semantic links
Actual: 6 semantic links
Status: ✅ PASS
```

### 5. Test Edge Cases

Don't just test happy path:
- Empty chains
- Single DMN chains
- Very long chains (10+ DMNs)
- Chains with cycles (shouldn't be possible, but test)
- Invalid input values
- Network failures

---

## Regression Testing Checklist

Before deploying changes:

- [ ] Run all test scenarios
- [ ] Check all verification procedures
- [ ] Test on clean browser (no localStorage)
- [ ] Test cache clearing and refresh
- [ ] Test with different TriplyDB endpoints
- [ ] Verify console logs are clean (no errors)
- [ ] Test template save/load/delete
- [ ] Test chain execution end-to-end
- [ ] Export chains and verify JSON structure
- [ ] Test on different browsers (Chrome, Firefox, Safari)

---

## Performance Testing

### Semantic Link Loading Performance

**Test**:
```javascript
console.time('SemanticLinks');
// Load semantic links
console.timeEnd('SemanticLinks');
```

**Expected**: < 500ms for 26 links

### Validation Performance

**Test**:
```javascript
console.time('Validation');
// Build chain (triggers validation)
console.timeEnd('Validation');
```

**Expected**: < 100ms for 3-DMN chain

---

## Related Documentation

- `ENHANCED_VALIDATION.md` - Validation system architecture
- `SEMANTIC_ANALYSIS.md` - Semantic link discovery details
- `DRD_GENERATION.md` - DRD assembly and deployment

---

## Next Steps

After verifying all test scenarios pass:

1. **Expand Test Coverage**:
   - Add more test DMNs with different semantic patterns
   - Test multi-hop semantic chains
   - Test complex validation scenarios

2. **Automate Tests**:
   - Set up Playwright/Cypress
   - Create CI/CD pipeline
   - Add regression tests to PR checks

3. **Performance Optimization**:
   - Profile semantic link loading
   - Optimize validation re-runs
   - Cache validation results

4. **User Testing**:
   - Have colleagues test with real DMNs
   - Gather feedback on UX
   - Document common user errors

---

## Appendix: Quick Reference Commands

### Clear Backend Cache
```bash
curl -X DELETE "http://localhost:3001/api/cache/clear?endpoint=https://api.open-regels.triply.cc/datasets/stevengort/DMN-discovery/services/DMN-discovery/sparql"
```

### Check Semantic Links
```javascript
fetch('http://localhost:3001/api/dmns/enhanced-chain-links?endpoint=https://api.open-regels.triply.cc/datasets/stevengort/DMN-discovery/services/DMN-discovery/sparql')
  .then(r => r.json())
  .then(d => console.table(d.data));
```

### Inspect localStorage
```javascript
// All templates
console.log(JSON.parse(localStorage.getItem('linkeddata-explorer-user-templates')));

// All test cases
console.log(JSON.parse(localStorage.getItem('linkeddata-explorer-test-cases')));
```

### Reset Application State
```javascript
localStorage.clear();
location.reload();
```
