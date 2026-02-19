# DRD (Decision Requirements Diagram) Generation

## Overview

The DRD Generation feature enables users to save multi-DMN chains as single, executable Decision Requirements Diagrams (DRDs) deployed to Operaton. This transforms sequential chain execution (multiple API calls) into unified DRD evaluation (single API call), improving performance by ~50% while maintaining semantic integrity.

**Key Benefits:**
- **Performance:** Single Operaton call vs. multiple sequential API calls
- **Semantics:** Proper DMN 1.3 `<informationRequirement>` wiring
- **Reusability:** Save complex chains as named templates
- **Portability:** DRD XML can be exported, versioned, shared (Phase 2)
- **Simplicity:** Users work with familiar chain building UI

---

## Architecture

### System Components
```
┌─────────────────┐
│  Chain Builder  │  User builds chain: [DMN A] → [DMN B] → [DMN C]
└────────┬────────┘
         │ Click "Save as DRD"
         ▼
┌─────────────────┐
│  Frontend API   │  POST /api/dmns/drd/deploy
│   (React)       │  Body: { dmnIds: [...], deploymentName: "..." }
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│              Backend DRD Assembly Service               │
│  1. Fetch DMN XML from Operaton for each dmnId          │
│  2. Parse XML → extract all <decision> & <inputData>    │
│  3. Prefix all IDs: dmn0_*, dmn1_*, dmn2_*              │
│  4. Update all href references to match prefixed IDs    │
│  5. Wire main decisions: add chain-based <infoReq>      │
│  6. Assemble single DRD XML with all decisions          │
│  7. Deploy to Operaton via multipart/form-data          │
└────────┬────────────────────────────────────────────────┘
         │ Returns: { deploymentId, entryPointId }
         ▼
┌─────────────────┐
│  localStorage   │  Store DRD metadata in template:
│   (Phase 1)     │  - isDrd: true
│                 │  - drdDeploymentId: "43c759d6-..."
│                 │  - drdEntryPointId: "dmn2_RONL_..."
│                 │  - drdOriginalChain: [A, B, C]
└─────────────────┘
```

### Execution Flow

**Before (Sequential Chain):**
```
User → Frontend → Backend → TriplyDB (lookup DMN A)
                          → Operaton (execute A)
                          → TriplyDB (lookup DMN B)
                          → Operaton (execute B)
                          → TriplyDB (lookup DMN C)
                          → Operaton (execute C)
Total: 6 API calls, 200-224ms
```

**After (DRD):**
```
User → Frontend → Backend → Operaton (execute dmn2_RONL_* entry point)
                              ↓ (internal to Operaton)
                              ├─ Evaluate dmn0_SVB_* first
                              ├─ Use outputs as inputs for dmn1_SZW_*
                              └─ Use outputs as inputs for dmn2_RONL_*
Total: 1 API call, 101-110ms (~50% faster)
```

---

## Phase 1: Local DRD Storage (Completed)

### Implementation Summary

**What is Built:**
1. **DRD Assembly Engine** (`packages/backend/src/services/operaton.service.ts`)
   - `assembleDrd()`: Combines multiple DMN XML files into single DRD
   - `deployDrd()`: Deploys assembled DRD to Operaton
   - `makeIdsUnique()`: Prefixes all IDs and updates references

2. **API Endpoint** (`packages/backend/src/routes/dmn.routes.ts`)
   - `POST /api/dmns/drd/deploy`: Assembles and deploys DRD

3. **Frontend DRD Save** (`packages/frontend/src/components/ChainBuilder/ChainConfig.tsx`)
   - "Save" button triggers DRD assembly & deployment
   - Stores metadata in localStorage via `saveUserTemplate()`
   - Modal updated to "Save as DRD" with deployment info

4. **Execution Routing** (`packages/backend/src/services/orchestration.service.ts`)
   - `executeChain()` checks `isDrd` flag
   - If true: single Operaton call to `drdEntryPointId`
   - If false: sequential TriplyDB lookup + execution (existing behavior)

5. **Type Extensions**
   - `ChainTemplate` interface: added `isDrd`, `drdDeploymentId`, `drdEntryPointId`
   - `ChainExecutionRequest`: added DRD execution parameters
   - `ChainPreset`: added DRD fields for template loading


6. **DRD Card UX & Synthetic Model** (v0.7.2)
   - Synthetic DRD model creation to avoid confusion with original DMN cards
   - Purple-themed visual styling to distinguish DRD cards
   - Output schema storage and display
   - Direct Operaton Cockpit links

### UX Improvements: Synthetic DRD Model (v0.7.2)

**Problem Identified:**
When loading a DRD template, the system was displaying the original DMN card from TriplyDB, which showed:
- Wrong deployment ID (original single-decision DMN instead of unified DRD)
- Misleading "In Chain" badge on left panel
- Zero outputs displayed (outputs array not populated)
- No visual indication that this was a DRD, not a regular DMN

**Solution: Synthetic DRD Model**

When a DRD template is loaded, the system now creates a synthetic `DmnModel` object that represents the unified DRD:

```typescript
const drdModel: DmnModel = {
  id: `drd-${preset.id}`,
  identifier: preset.drdEntryPointId,        // e.g., "dmn1_SZW_BijstandsnormInformatie"
  title: preset.name,                        // e.g., "Social Benefits DRD"
  description: `Unified DRD combining ${preset.drdOriginalChain.length} decisions`,
  deploymentId: preset.drdDeploymentId,      // Correct DRD deployment ID
  isDrd: true,                               // Flag for special styling
  inputs: extractedInputs,                   // From defaultInputs
  outputs: preset.drdOutputs || [],          // Stored during save
};
```

**Visual Styling:**
- **Purple border** (`border-purple-500`) instead of slate
- **Light purple background** (`bg-purple-50`)
- **Purple step number badge** instead of blue
- **🔗 DRD badge** in top-right corner with `z-10` stacking
- **Purple-themed deployment ID** badge
- **Operaton Cockpit link** for direct DRD inspection

**Output Schema Storage:**

During DRD save, the system now captures output schema from the final DMN:

```typescript
const lastDmn = chain[chain.length - 1];
const drdOutputs = lastDmn.outputs.map(output => ({
  identifier: output.identifier,
  title: output.title || output.identifier,
  type: output.type,
}));

// Stored in template metadata
template.drdOutputs = drdOutputs;
```

**Result:**
- ✅ DRD card shows correct deployment ID
- ✅ Correct output count (3 outputs, not 0)
- ✅ Clear visual distinction from regular DMN cards
- ✅ No confusion with original DMN from TriplyDB
- ✅ Direct link to Operaton Cockpit for verification

### Storage Approach (Phase 1)

**localStorage Structure:**
```json
{
  "linkeddata-explorer-user-templates": {
    "https://api.open-regels.triply.cc/.../sparql": [
      {
        "id": "user-1707737600-abc123",
        "name": "Social Benefits DRD",
        "dmnIds": ["SZW_BijstandsnormInformatie"],
        "isDrd": true,
        "drdDeploymentId": "43c759d6-082b-11f1-a5e9-f68ed60940f5",
        "drdEntryPointId": "dmn1_SZW_BijstandsnormInformatie",
        "drdOriginalChain": ["SVB_LeeftijdsInformatie", "SZW_BijstandsnormInformatie"],
        "defaultInputs": { ... },
        "isUserTemplate": true
      }
    ]
  }
}
```

**Key Design Decisions:**
- **Endpoint-scoped:** Each TriplyDB endpoint has isolated template storage
- **Deployment ID stored:** Direct reference to Operaton deployment
- **Prefixed entry point:** Matches the ID generated during assembly (`dmn{N}_originalId`)
- **Original chain preserved:** For reference/debugging, shows which DMNs compose the DRD

### DRD Assembly Process

**Step-by-Step:**

1. **Fetch Source DMN XML**
```javascript
   for (let i = 0; i < dmnIds.length; i++) {
     const xml = await operatonService.fetchDmnXml(dmnIds[i]);
     // Parse with fast-xml-parser
   }
```

2. **Extract All Decisions & Input Data**
```javascript
   const decisions = Array.isArray(definitions.decision) 
     ? definitions.decision 
     : [definitions.decision];
   
   const inputData = Array.isArray(definitions.inputData)
     ? definitions.inputData
     : [definitions.inputData];
```

3. **Make IDs Unique (Two-Pass Algorithm)**
```javascript
   // Pass 1: Collect all IDs
   collectIds(clonedDefinitions); // Builds idMap: oldId → dmn0_oldId
   
   // Pass 2: Update all references
   updateReferences(clonedDefinitions); // Rewrites all href="#oldId" → href="#dmn0_oldId"
```

4. **Wire Chain Dependencies**
```javascript
   if (i > 0) {
     mainDecision.informationRequirement.unshift({
       requiredDecision: { '@_href': `#${previousMainDecisionId}` }
     });
   }
```

5. **Build Final DRD Structure**
```xml
   <definitions xmlns="..." id="drd_dmn2_RONL_HeusdenpasEindresultaat">
     <decision id="dmn0_SVB_LeeftijdsInformatie">...</decision>
     <decision id="dmn0_SVB_Leeftijdsgrenzen">
       <informationRequirement>
         <requiredDecision href="#dmn0_SVB_BerekenLeeftijden"/>
       </informationRequirement>
     </decision>
     <decision id="dmn1_SZW_BijstandsnormInformatie">
       <informationRequirement>
         <requiredDecision href="#dmn0_SVB_LeeftijdsInformatie"/>
       </informationRequirement>
     </decision>
     <inputData id="dmn0_InputData_dagVanAanvraag">...</inputData>
     <!-- ... all other decisions and inputData -->
   </definitions>
```

6. **Deploy to Operaton**
```javascript
   const formData = new FormData();
   formData.append('deployment-name', deploymentName);
   formData.append('data', Buffer.from(drdXml, 'utf-8'), {
     filename: `${entryPointId}.dmn`,
     contentType: 'application/xml',
   });
   
   await axios.post('/engine-rest/deployment/create', formData, {
     headers: formData.getHeaders()
   });
```

### Execution Logic

**Frontend (ChainBuilder.tsx):**
```typescript
const handleExecute = async () => {
  const isDrd = loadedTemplate?.isDrd || false;
  const drdEntryPointId = loadedTemplate?.drdEntryPointId;

  await fetch(`${API_BASE_URL}/api/chains/execute`, {
    method: 'POST',
    body: JSON.stringify({
      dmnIds: selectedChain,
      inputs,
      endpoint,
      isDrd,              // Route to DRD execution if true
      drdEntryPointId,    // Prefixed ID to call in Operaton
    }),
  });
};
```

**Backend (orchestration.service.ts):**
```typescript
async executeChain(dmnIds, inputs, endpoint, isDrd?, drdEntryPointId?) {
  if (isDrd && drdEntryPointId) {
    // DRD path: single Operaton call
    const result = await operatonService.evaluateDecision(drdEntryPointId, inputs);
    return { success: true, finalOutputs: result, executionTime: ... };
  }

  // Regular path: sequential TriplyDB + Operaton calls
  for (const dmnId of dmnIds) {
    const dmn = await sparqlService.getDmnByIdentifier(dmnId, endpoint);
    const result = await operatonService.evaluateDecision(dmn.identifier, currentVars);
    // ...
  }
}
```

### Testing & Validation

**Test Case: Social Benefits Calculation**

**Setup:**
- Chain: `SVB_LeeftijdsInformatie` → `SZW_BijstandsnormInformatie`
- Original sequential execution: 224ms (173ms + 47ms)
- DRD assembly: 8 decisions, 12 inputData elements

**Results:**
```
✓ DRD deployed: deploymentId 43c759d6-082b-11f1-a5e9-f68ed60940f5
✓ Entry point: dmn1_SZW_BijstandsnormInformatie
✓ Execution time: 102-110ms (~50% faster)
✓ Correct outputs: bijstandsNorm, bijstandsnormType, bijstandsnormTermijn
✓ No intermediate outputs exposed (expected behavior)
```

**Verification in Operaton Cockpit:**
- Decision history shows single call to `dmn1_SZW_BijstandsnormInformatie`
- Correct deployment ID matches localStorage metadata
- Internal evaluation of `dmn0_SVB_LeeftijdsInformatie` happens transparently

---

## Phase 2: Promotion to Global Templates (Roadmap)

### Objectives

**Transform local user DRDs into official, reusable templates:**
- Store DRD XML in TriplyDB (version-controlled, environment-independent)
- Enable sharing across teams, installations, environments
- Auto-deploy DRDs on system startup
- Maintain semantic provenance (which DMNs compose this DRD)

### Proposed Workflow
```
┌──────────────────────────────────────────────────────────────┐
│  User creates & tests DRD locally                            │
│  ↓ (localStorage: "My Templates")                            │
│  User clicks "Promote to Global Template"                    │
│  ↓                                                           │
│  System Workflow:                                            │
│  1. Extract DRD XML from Operaton deployment                 │
│  2. Generate semantic URI for DRD                            │
│  3. Publish to TriplyDB with CPSV/CPRMV metadata             │
│  4. Create global template in testData.json                  │
│  5. Auto-deploy to Operaton on system startup                │
│  ↓                                                           │
│  DRD available to all users as Example Template              │
└──────────────────────────────────────────────────────────────┘
```

### TriplyDB Schema Design

**RDF Vocabulary Extension:**
```turtle
@prefix ronl: <https://regels.overheid.nl/ontology#> .
@prefix dct: <http://purl.org/dc/terms/> .
@prefix cpsv: <http://purl.org/vocab/cpsv#> .

<https://regels.overheid.nl/drds/social-benefits-full/dmn>
  a ronl:DecisionRequirementsDiagram ;
  dct:title "Social Benefits Full Calculation"@nl ;
  dct:description "Unified DRD combining age verification and social benefit norm calculation"@nl ;
  dct:created "2026-02-12"^^xsd:date ;
  dct:creator "RONL Team" ;
  
  # Composition metadata
  ronl:composedOf 
    <https://regels.overheid.nl/services/aow-leeftijd/dmn> ,
    <https://regels.overheid.nl/services/normbedragen/dmn> ;
  
  # Entry point
  ronl:entryPointDecision "SZW_BijstandsnormInformatie"^^xsd:string ;
  
  # DRD XML (stored as base64 or external file)
  ronl:drdXml "PD94bWwgdmVyc2lvbj0iMS4wIj8+..."^^xsd:string ;
  ronl:drdXmlFile <https://regels.overheid.nl/drds/social-benefits-full/dmn.xml> ;
  
  # Performance metadata
  ronl:estimatedExecutionTime 110 ;
  ronl:complexity "medium"^^xsd:string ;
  
  # Usage tracking
  ronl:deploymentHistory [
    ronl:deployedAt "2026-02-12T14:30:00Z"^^xsd:dateTime ;
    ronl:deploymentId "43c759d6-082b-11f1-a5e9-f68ed60940f5"^^xsd:string ;
    ronl:environment "production" ;
  ] .
```

### Implementation Plan (Phase 2)

#### 1. Backend: DRD Extraction & Publishing

**New Service: `packages/backend/src/services/drd-publisher.service.ts`**
```typescript
class DrdPublisherService {
  /**
   * Extract DRD XML from Operaton deployment
   */
  async extractDrdXml(deploymentId: string): Promise<string> {
    const response = await axios.get(
      `/engine-rest/deployment/${deploymentId}/resources`
    );
    // Find .dmn resource, fetch its data
  }

  /**
   * Publish DRD to TriplyDB
   */
  async publishDrd(params: {
    name: string;
    description: string;
    drdXml: string;
    composedOf: string[]; // Original DMN URIs
    entryPoint: string;
  }): Promise<string> {
    // Generate URI
    const drdUri = this.generateDrdUri(params.name);
    
    // Build RDF graph
    const rdfGraph = this.buildDrdRdf(drdUri, params);
    
    // Upload to TriplyDB
    await triplyService.uploadGraph(rdfGraph);
    
    return drdUri;
  }
}
```

#### 2. Frontend: Promotion UI

**Add "Promote" Button in Template List:**
```tsx
{isUserTemplate(template) && template.isDrd && (
  <button
    onClick={() => handlePromoteToGlobal(template)}
    className="px-3 py-1 bg-purple-600 text-white rounded"
  >
    ⬆️ Promote to Global
  </button>
)}
```

**Promotion Modal:**
```tsx
<PromotionModal
  template={selectedTemplate}
  onConfirm={async (metadata) => {
    await fetch('/api/drds/promote', {
      method: 'POST',
      body: JSON.stringify({
        templateId: template.id,
        drdDeploymentId: template.drdDeploymentId,
        ...metadata,
      }),
    });
  }}
/>
```

#### 3. Auto-Deployment on Startup

**System Initialization Sequence:**
```typescript
// packages/backend/src/index.ts
async function initializeSystem() {
  // 1. Fetch all DRDs from TriplyDB
  const drds = await sparqlService.getAllDrds();
  
  // 2. For each DRD, check if deployed in Operaton
  for (const drd of drds) {
    const isDeployed = await operatonService.checkDeployment(drd.entryPoint);
    
    if (!isDeployed) {
      // 3. Deploy DRD XML to Operaton
      const drdXml = await triplyService.fetchDrdXml(drd.uri);
      await operatonService.deployDrd(drdXml, drd.name, `${drd.entryPoint}.dmn`);
      logger.info('Auto-deployed DRD', { name: drd.name });
    }
  }
}
```

#### 4. Template Service Integration

**Update `packages/backend/src/services/template.service.ts`:**
```typescript
async getAllTemplates(endpoint?: string): Promise<ChainTemplate[]> {
  // Existing: Load predefined templates from testData.json
  const predefined = this.PREDEFINED_TEMPLATES;
  
  // NEW: Load promoted DRDs from TriplyDB
  const promotedDrds = await sparqlService.getDrdTemplates(endpoint);
  
  // Combine
  return [...predefined, ...promotedDrds];
}
```

### Migration Strategy

**Step 1: Schema Design**
- Define RONL vocabulary for DRDs
- Create TriplyDB dataset for DRD storage
- Document RDF patterns

**Step 2: Backend Services**
- Implement `DrdPublisherService`
- Add `/api/drds/promote` endpoint
- Integrate auto-deployment in startup sequence

**Step 3: Frontend UI**
- Add "Promote" button to user templates
- Create promotion modal with metadata fields
- Add "Global DRD" badge to promoted templates

**Step 4: Testing & Rollout**
- Test promotion workflow in acceptance environment
- Verify auto-deployment on server restart
- Promote 2-3 battle-tested DRDs as pilots
- Gather user feedback

**Step 5: Production**
- Deploy to production
- Announce feature to users
- Monitor usage and performance
- Iterate based on feedback

### Security & Governance (Phase 2)

**Access Control:**
- Only admin users can promote to global
- Approval workflow for sensitive DRDs
- Audit log for all promotions

**Quality Assurance:**
- Require minimum execution count before promotion (e.g., 10+ successful runs)
- Validation checks (all source DMNs exist, no broken references)
- Peer review process for complex DRDs

**Versioning:**
- Semantic versioning for DRDs (v1.0.0, v1.1.0, etc.)
- Deprecation warnings for old versions
- Migration guides when breaking changes occur

---

## Performance Benchmarks

### Heusdenpas Full Chain (3 DMNs)

| Metric | Sequential Execution | DRD Execution | Improvement |
|--------|---------------------|---------------|-------------|
| **API Calls** | 6 (3× TriplyDB lookup + 3× Operaton execute) | 1 (Operaton execute only) | 83% reduction |
| **Total Time** | 202-224ms | 101-110ms | ~50% faster |
| **Network Latency** | 6× round trips | 1× round trip | 83% reduction |
| **Backend Load** | 6 separate requests | 1 request | Lower resource usage |

### Social Benefits Calculation (2 DMNs)

| Metric | Sequential Execution | DRD Execution | Improvement |
|--------|---------------------|---------------|-------------|
| **API Calls** | 4 (2× TriplyDB + 2× Operaton) | 1 (Operaton only) | 75% reduction |
| **Total Time** | 224ms | 102-110ms | ~50% faster |
| **Sub-Decisions** | N/A (hidden in sequential) | 8 decisions (unified) | Full structure preserved |

---

## Troubleshooting

### Common Issues

**Issue: DRD Deployment Fails with "ENGINE-22004 Unable to transform"**
- **Cause:** Broken `href` references in DRD XML
- **Solution:** Verify `makeIdsUnique()` two-pass algorithm completed successfully
- **Check:** All `<requiredDecision href="#X">` match existing `<decision id="X">`

**Issue: DRD Execution Returns No Outputs**
- **Cause:** Wrong entry point ID used
- **Solution:** Check `drdEntryPointId` matches the prefixed ID in deployed DRD
- **Example:** Should be `dmn2_RONL_HeusdenpasEindresultaat`, not `RONL_HeusdenpasEindresultaat`

**Issue: Template Saved But Execution Still Uses Sequential Path**
- **Cause:** `isDrd` flag not set or not passed to backend
- **Solution:** Verify `loadedTemplate?.isDrd === true` in `handleExecute()`
- **Check:** Backend logs should show `"isDrd": true` in execution request

**Issue: Windows "ENOENT /tmp/generated-drd.dmn" Error**
- **Cause:** Debug file write to Unix path on Windows
- **Solution:** Remove debug file write (lines already removed in current implementation)

---


**Issue: DRD Card Shows Wrong Deployment ID or Zero Outputs**
- **Cause:** DRD template loaded but showing original DMN card data instead of synthetic DRD model
- **Solution:** Verify `handleLoadPreset` creates synthetic model when `preset.isDrd === true`
- **Check:** DRD card should show purple border, DRD badge, and correct `drdDeploymentId`
- **Fixed in:** v0.7.2 with synthetic DRD model implementation
## API Reference

### POST `/api/dmns/drd/deploy`

**Request:**
```json
{
  "dmnIds": ["SVB_LeeftijdsInformatie", "SZW_BijstandsnormInformatie"],
  "deploymentName": "drd-SZW_BijstandsnormInformatie-2026-02-12"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "deploymentId": "43c759d6-082b-11f1-a5e9-f68ed60940f5",
    "entryPointId": "dmn1_SZW_BijstandsnormInformatie",
    "filename": "SZW_BijstandsnormInformatie.dmn",
    "dmnCount": 2
  },
  "timestamp": "2026-02-12T14:30:00Z"
}
```

### POST `/api/chains/execute` (with DRD)

**Request:**
```json
{
  "dmnIds": ["SZW_BijstandsnormInformatie"],
  "inputs": { "aanvragerAlleenstaand": true, ... },
  "endpoint": "https://api.open-regels.triply.cc/.../sparql",
  "isDrd": true,
  "drdEntryPointId": "dmn1_SZW_BijstandsnormInformatie"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "chainId": "DRD:dmn1_SZW_BijstandsnormInformatie",
    "executionTime": 110,
    "finalOutputs": {
      "bijstandsNorm": 1234.56,
      "bijstandsnormType": "M",
      "bijstandsnormTermijn": "1e helft 2026"
    },
    "steps": [{
      "dmnId": "dmn1_SZW_BijstandsnormInformatie",
      "dmnTitle": "DRD (2 decisions)",
      "duration": 110
    }]
  }
}
```

---

## Resources

### Documentation
- [DMN 1.3 Specification](https://www.omg.org/spec/DMN/1.3/)
- [Operaton Documentation](https://docs.operaton.org/)
- [CPSV-AP Vocabulary](https://joinup.ec.europa.eu/collection/semantic-interoperability-community-semic/solution/core-public-service-vocabulary-application-profile)

### Code References
- Backend: `packages/backend/src/services/operaton.service.ts` (assembly logic)
- Frontend: `packages/frontend/src/components/ChainBuilder/ChainConfig.tsx` (save UI)
- Types: `packages/frontend/src/services/templateService.ts` (ChainTemplate interface)

### Related Features
- v0.6.2: Semantic Variable Matching (enables intelligent chain discovery)
- v0.6.0: BPMN Modeler (can reference DRDs via BusinessRuleTask)
- v0.5.3: User-Created Templates (foundation for local DRD storage)

---

## Glossary

**DRD (Decision Requirements Diagram):** A DMN 1.3 construct that combines multiple decisions into a single model with explicit dependency relationships.

**Entry Point:** The top-level decision in a DRD that is called externally; Operaton evaluates all required decisions automatically.

**informationRequirement:** DMN XML element that declares a decision's dependency on another decision or input data.

**ID Prefixing:** Adding `dmn0_`, `dmn1_`, etc. to all IDs when combining DMN files to avoid collisions.

**Sequential Execution:** The original chain execution approach where each DMN is called separately in order.

**localStorage:** Browser storage mechanism used in Phase 1 for user-specific DRD templates.

**TriplyDB:** Semantic data platform that stores DMN metadata and (in Phase 2) will store DRD definitions.

---

*Last Updated: February 12, 2026*  
*Version: 0.7.2 (UX improvements)**  
*Status: Phase 1 Complete, Phase 2 Planned*