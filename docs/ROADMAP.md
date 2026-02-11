# Linked Data Explorer - BPMN Feature Roadmap

**Last Updated:** February 7, 2026  
**Current Version:** 0.6.0  
**Status:** BPMN Modeler Foundation Complete ✅

---

## Overview

This roadmap outlines the development path for the BPMN Modeler feature in Linked Data Explorer. The foundation (v0.6.0) provides a fully functional BPMN 2.0 editor. The next phases focus on **integrating BPMN with DMN chains** and enhancing the overall workflow automation capabilities for Dutch Government services.

### Vision

Enable government agencies to:
1. **Discover** available DMN decision models from TriplyDB
2. **Compose** DMN chains for eligibility checking workflows
3. **Design** BPMN processes that orchestrate these decisions
4. **Export** execution-ready process definitions for Operaton
5. **Share** reusable process templates across organizations

---

## Current State (v0.6.0)

### ✅ Completed Features

**BPMN Editor Core**
- Interactive canvas with drag-and-drop element palette
- Zoom controls (scroll, +/-, fit-to-viewport)
- Process management (create, rename, delete, save, export)
- localStorage persistence
- Tree Felling Permit example process (protected)

**Technical Foundation**
- bpmn-js v18.12.0 integration
- camunda-bpmn-moddle v7.0.1 (Operaton compatible)
- TypeScript interfaces and type safety
- Component architecture (BpmnModeler, BpmnCanvas, BpmnProperties, ProcessList)
- Custom CSS for rendering fixes

**Integration Points**
- Workflow icon in main navigation
- Consistent UI with existing app design
- Three-panel layout matching ChainBuilder pattern

### 🔄 Current Limitations

1. **No DMN Linking**: Manual entry of `camunda:decisionRef` (plain text input)
2. **Properties Panel**: Read-only display, no actual element updates
3. **No Import**: Cannot upload existing .bpmn files
4. **No Validation**: No checks for execution readiness
5. **localStorage Only**: No database, versioning, or sharing

---

## Development Priorities

---

## 🔗 **Priority 1: Connect BPMN to DMN Templates**

**Status:** 🎯 Next Up  
**Complexity:** Medium (2-3 days)  
**Value:** ⭐⭐⭐⭐⭐ (Highest - completes the integration story)

### Goal

Enable users to link BusinessRuleTasks in BPMN processes to saved DMN templates from the ChainBuilder, creating a seamless workflow from decision modeling to process execution.

### User Story

> "As a process designer, I want to select a DMN decision from a dropdown when configuring a BusinessRuleTask, so that I don't have to manually type decision IDs and can ensure they're valid."

### Technical Requirements

#### 1.1 DMN Template Selector Component

**File:** `packages/frontend/src/components/BpmnModeler/DmnTemplateSelector.tsx`

**Features:**
- Fetch DMN templates from `templateService.getAllTemplates(endpoint)`
- Display as dropdown/searchable list
- Show: template name, description, DMN identifier
- Filter by current endpoint
- Handle empty state (no templates)

**UI Elements:**
```typescript
interface DmnTemplateSelectorProps {
  endpoint: string;
  selectedDecisionRef?: string;
  onSelect: (template: ChainTemplate) => void;
}
```

#### 1.2 Update BpmnProperties Panel

**File:** `packages/frontend/src/components/BpmnModeler/BpmnProperties.tsx`

**Changes:**
- Import DmnTemplateSelector
- Show selector only when `elementType === 'bpmn:BusinessRuleTask'`
- On template selection:
  - Update `camunda:decisionRef` with template DMN identifier
  - Auto-populate `camunda:resultVariable` (suggest from template outputs)
  - Call bpmn-js modeling API to persist changes

**bpmn-js Modeling API Usage:**
```typescript
const modeling = modelerRef.current?.get('modeling');
const moddle = modelerRef.current?.get('moddle');

// Update BusinessRuleTask properties
modeling.updateProperties(selectedElement, {
  'camunda:decisionRef': template.dmnIdentifier,
  'camunda:resultVariable': suggestedVariableName,
  'camunda:mapDecisionResult': 'singleEntry',
});
```

#### 1.3 Visual Indicators on Canvas

**Goal:** Show which BusinessRuleTasks are linked to DMN templates

**Options:**
1. **Overlay Badge**: Small badge/icon on element showing DMN template name
2. **Element Color**: Different fill color for linked vs unlinked tasks
3. **Tooltip**: Hover to see linked DMN details

**Implementation via bpmn-js Overlays:**
```typescript
const overlays = modeler.get('overlays');
overlays.add(elementId, {
  position: { bottom: 10, right: 10 },
  html: '<div class="dmn-badge">📋 TreeFellingDecision</div>'
});
```

#### 1.4 Update BpmnProcess Interface

**File:** `packages/frontend/src/types/index.ts`

**Change:**
```typescript
export interface BpmnProcess {
  // ... existing fields
  linkedDmnTemplates: string[]; // Currently exists but not populated
  linkedDmnDetails?: Array<{    // Add detailed tracking
    taskId: string;              // BPMN element ID
    taskName: string;            // User-friendly name
    templateId: string;          // ChainTemplate.id
    templateName: string;        // ChainTemplate.name
    dmnIdentifier: string;       // DMN model identifier
  }>;
}
```

#### 1.5 Sync Linked Templates

**When to Update:**
- User selects DMN from dropdown → Add to linkedDmnDetails
- User removes DMN reference → Remove from linkedDmnDetails
- User saves process → Update linkedDmnTemplates array

**Storage:**
```typescript
const handleUpdateLinkedDmn = (taskId: string, template: ChainTemplate | null) => {
  const updatedDetails = template 
    ? [...linkedDmnDetails, { taskId, templateId: template.id, ... }]
    : linkedDmnDetails.filter(d => d.taskId !== taskId);
  
  // Update process and save
  const updatedProcess = {
    ...activeProcess,
    linkedDmnDetails: updatedDetails,
    linkedDmnTemplates: updatedDetails.map(d => d.dmnIdentifier),
  };
  
  BpmnService.saveProcess(updatedProcess);
};
```

### Acceptance Criteria

- [ ] DMN template dropdown appears in properties panel for BusinessRuleTasks
- [ ] Dropdown shows all templates available for current endpoint
- [ ] Selecting template auto-fills `camunda:decisionRef` and `camunda:resultVariable`
- [ ] Changes persist when saving process
- [ ] Visual indicator (badge/color) shows linked DMN on canvas
- [ ] Process list shows count of linked DMN templates
- [ ] Reopening process restores DMN links
- [ ] Exported .bpmn file contains correct `camunda:decisionRef` values

### Testing Scenarios

1. **Happy Path**
   - Create new process
   - Add BusinessRuleTask
   - Select DMN from dropdown
   - Save and close
   - Reopen → DMN still linked
   - Export → Verify XML has correct attributes

2. **Edge Cases**
   - No DMN templates available (empty state)
   - Switch endpoints (templates change)
   - Delete referenced DMN template (show warning)
   - Multiple BusinessRuleTasks in one process

3. **Tree Felling Example**
   - Link AssessPermit → TreeFellingDecision template
   - Link AssessReplacement → ReplacementTreeDecision template
   - Verify visual indicators appear
   - Export and verify XML

### Dependencies

- Existing `templateService` (already implemented)
- Access to `endpoint` prop in BpmnProperties
- bpmn-js modeling API knowledge

---

## ⚙️ **Priority 2: Make Properties Panel Fully Functional**

**Status:** 📋 Planned  
**Complexity:** Medium (2-3 days)  
**Value:** ⭐⭐⭐⭐ (High - enables proper element editing)

### Goal

Transform properties panel from read-only display to fully functional element editor using bpmn-js modeling API.

### Current State

- ✅ Shows element type, ID, name
- ✅ Shows DMN fields for BusinessRuleTasks
- ❌ Changes don't persist to BPMN XML
- ❌ Limited property support

### Technical Requirements

#### 2.1 Wire Up Name Editing

**Current:**
```typescript
<input
  type="text"
  value={elementName}
  onChange={(e) => onUpdateElement({ name: e.target.value })}
/>
```

**Needs:**
```typescript
const handleNameChange = (newName: string) => {
  const modeling = modelerRef.current?.get('modeling');
  modeling.updateProperties(selectedElement, {
    name: newName
  });
};
```

#### 2.2 Extend Property Support

**Add Support For:**
- Documentation field (multi-line textarea)
- Conditional expressions (for SequenceFlows)
- Form fields (for UserTasks)
- Implementation details (class/delegate expression)
- Async/retry configuration

**UI Components:**
```typescript
// Documentation
<textarea 
  value={documentation}
  onChange={handleDocumentationChange}
  placeholder="Add description..."
/>

// Conditional Expression (for SequenceFlows)
{elementType === 'bpmn:SequenceFlow' && (
  <input
    type="text"
    value={conditionExpression}
    onChange={handleConditionChange}
    placeholder="${permitDecision == 'Approve'}"
  />
)}
```

#### 2.3 BusinessRuleTask Properties

**Enhance DMN Configuration:**
```typescript
<select 
  value={mapDecisionResult}
  onChange={handleMapDecisionResultChange}
>
  <option value="singleEntry">Single Entry</option>
  <option value="singleResult">Single Result</option>
  <option value="collectEntries">Collect Entries</option>
  <option value="resultList">Result List</option>
</select>
```

#### 2.4 Real-time Validation

**Add Validation Feedback:**
- Required field indicators (*)
- Error messages for invalid values
- Warning icons for missing required properties
- Success indicators when valid

### Acceptance Criteria

- [ ] Changing element name updates BPMN XML immediately
- [ ] Changes visible on canvas without refresh
- [ ] Documentation field works (multi-line)
- [ ] Conditional expressions persist
- [ ] BusinessRuleTask mapDecisionResult dropdown functional
- [ ] No console errors when updating properties
- [ ] Undo/redo works after property changes

---

## 📥 **Priority 3: Import BPMN Files**

**Status:** 📋 Planned  
**Complexity:** Low-Medium (1-2 days)  
**Value:** ⭐⭐⭐ (Medium - workflow convenience)

### Goal

Allow users to upload existing .bpmn files and import them as new processes.

### User Story

> "As a user, I want to upload a .bpmn file exported from Camunda Modeler, so that I can continue editing it in Linked Data Explorer."

### Technical Requirements

#### 3.1 File Upload UI

**Location:** ProcessList.tsx header

**UI Elements:**
```typescript
<div className="flex items-center gap-1">
  <input
    ref={fileInputRef}
    type="file"
    accept=".bpmn,.xml"
    onChange={handleFileUpload}
    className="hidden"
  />
  <button
    onClick={() => fileInputRef.current?.click()}
    className="p-2 rounded-lg bg-slate-200 text-slate-700 hover:bg-slate-300"
    title="Import BPMN"
  >
    <Upload size={16} />
  </button>
  <button
    onClick={onCreateProcess}
    className="p-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
    title="Create New Process"
  >
    <Plus size={16} />
  </button>
</div>
```

#### 3.2 File Processing Logic

```typescript
const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (!file) return;
  
  const xml = await file.text();
  
  // Extract process name from XML
  const nameMatch = xml.match(/name="([^"]+)"/);
  const processName = nameMatch?.[1] || file.name.replace('.bpmn', '');
  
  // Create new process
  const newProcess: BpmnProcess = {
    id: `process_${Date.now()}`,
    name: processName,
    xml: xml,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    linkedDmnTemplates: [],
  };
  
  BpmnService.saveProcess(newProcess);
  onProcessImported(newProcess.id);
};
```

#### 3.3 Duplicate Handling

**If process with same name exists:**
- Append " (imported)" to name
- Or show dialog: "Replace existing / Keep both"

#### 3.4 Validation

**Check imported XML:**
- Valid BPMN 2.0 structure
- Has at least one process element
- Parse errors → Show user-friendly message

### Acceptance Criteria

- [ ] Upload button visible in ProcessList header
- [ ] Clicking opens file picker
- [ ] .bpmn and .xml files accepted
- [ ] Invalid files show error message
- [ ] Valid files create new process
- [ ] Process name extracted from XML
- [ ] Imported process immediately opens in canvas
- [ ] Works with files exported from Linked Data Explorer
- [ ] Works with files from Camunda Modeler

---

## ✅ **Priority 4: Process Validation & Execution Readiness**

**Status:** 📋 Planned  
**Complexity:** Medium (2-3 days)  
**Value:** ⭐⭐⭐ (Medium - quality assurance)

### Goal

Validate BPMN processes for execution readiness and provide feedback on issues that would prevent deployment to Operaton.

### Validation Rules

#### 4.1 Structural Validation

**Required Elements:**
- [ ] Process has at least one StartEvent
- [ ] Process has at least one EndEvent
- [ ] All elements are connected (no orphaned elements)
- [ ] No start events without outgoing flows
- [ ] No end events without incoming flows

#### 4.2 BusinessRuleTask Validation

**DMN Reference Checks:**
- [ ] All BusinessRuleTasks have `camunda:decisionRef`
- [ ] Referenced DMN exists (if linked to template)
- [ ] `camunda:resultVariable` is defined
- [ ] `camunda:mapDecisionResult` is set

#### 4.3 Gateway Validation

**Exclusive Gateway:**
- [ ] Has exactly one incoming flow
- [ ] Has 2+ outgoing flows
- [ ] All outgoing flows have conditions (or one default)

**Parallel Gateway:**
- [ ] Fork: 1 incoming, 2+ outgoing
- [ ] Join: 2+ incoming, 1 outgoing

#### 4.4 Naming Validation

- [ ] No duplicate element IDs
- [ ] Process has a name
- [ ] All tasks have names (user-friendly)

### UI Implementation

#### 4.5 Validation Indicator

**Header Status Badge:**
```typescript
<div className="flex items-center gap-2">
  <h2 className="text-sm font-semibold">BPMN Modeler</h2>
  {validationStatus === 'valid' && (
    <span className="flex items-center gap-1 text-xs text-green-600">
      <CheckCircle size={14} />
      Ready for Execution
    </span>
  )}
  {validationStatus === 'invalid' && (
    <span className="flex items-center gap-1 text-xs text-red-600">
      <AlertCircle size={14} />
      {errorCount} Issues
    </span>
  )}
</div>
```

#### 4.6 Validation Panel

**Toggle button to show/hide issues:**
```typescript
<button onClick={() => setShowValidation(!showValidation)}>
  {showValidation ? 'Hide' : 'Show'} Validation
</button>

{showValidation && (
  <div className="validation-panel">
    <h3>Validation Results</h3>
    {errors.map(error => (
      <div className="error-item" onClick={() => selectElement(error.elementId)}>
        <AlertCircle className="text-red-500" />
        <span>{error.message}</span>
      </div>
    ))}
  </div>
)}
```

#### 4.7 Export Confirmation

**Before export, check validation:**
```typescript
const handleExport = () => {
  const validation = validateProcess();
  
  if (validation.errors.length > 0) {
    if (!confirm(`Process has ${validation.errors.length} issues. Export anyway?`)) {
      return;
    }
  }
  
  // Proceed with export
  exportBpmn();
};
```

### Acceptance Criteria

- [ ] Validation runs automatically on changes
- [ ] Status indicator shows valid/invalid state
- [ ] Validation panel lists all issues
- [ ] Clicking issue selects element on canvas
- [ ] Export shows warning if invalid
- [ ] Validation checks all required rules
- [ ] Performance: Validation doesn't lag editor

---

## 🗄️ **Phase 2: Database & Collaboration**

**Status:** 🔮 Future (Not Scheduled)  
**Complexity:** High (4-6 weeks)  
**Value:** ⭐⭐⭐⭐⭐ (Very High - enterprise readiness)

### Goals

1. **Database Migration**
   - Move from localStorage to PostgreSQL
   - Process versioning with full history
   - Audit trail (who changed what when)

2. **User Authentication**
   - User accounts and login
   - Process ownership
   - Access control (private/public/shared)

3. **Sharing & Collaboration**
   - Share processes via public links
   - Organization-level templates
   - Role-based permissions (viewer/editor/owner)

4. **Advanced Features**
   - Comments and annotations
   - Change notifications
   - Approval workflows
   - Process templates library

### Technical Stack

**Backend:**
- Add to existing Node.js/Express backend
- PostgreSQL tables: `bpmn_processes`, `bpmn_versions`, `bpmn_shares`
- RESTful API: `/api/v1/bpmn/*`

**Frontend:**
- Replace BpmnService with API calls
- Add authentication context
- Real-time updates (WebSockets or polling)

**Migration Path:**
- Keep localStorage as fallback
- Import localStorage processes to database on first login
- Dual-mode operation during transition

---

## 📊 Estimated Timeline

| Priority | Feature | Estimated Time | Dependencies |
|----------|---------|----------------|--------------|
| **P1** | DMN-BPMN Integration | 2-3 days | templateService |
| **P2** | Properties Panel | 2-3 days | P1 complete |
| **P3** | Import BPMN | 1-2 days | None |
| **P4** | Validation | 2-3 days | None |
| **Phase 2** | Database & Sharing | 4-6 weeks | Authentication system |

**Total for P1-P4:** ~8-11 days (2-3 weeks with testing)

---

## Success Metrics

### Phase 1 (P1-P4) Complete

- [ ] Users can create BPMN → DMN workflows end-to-end
- [ ] Export produces valid Operaton-executable .bpmn files
- [ ] Zero manual XML editing required
- [ ] Validation catches 90%+ of deployment issues
- [ ] Documentation complete for all features

### Phase 2 Complete

- [ ] 100+ processes stored in database
- [ ] 5+ organizations using shared templates
- [ ] Zero data loss incidents
- [ ] <2s average API response time

---

## Risk Management

### Technical Risks

1. **bpmn-js API Limitations**
   - Risk: Some properties not editable via API
   - Mitigation: Manual XML editing as fallback

2. **localStorage Quota**
   - Risk: Large processes hit 5-10MB limit
   - Mitigation: Phase 2 database migration

3. **DMN Template Changes**
   - Risk: Breaking linked BPMN processes
   - Mitigation: Validation warnings, version tracking (Phase 2)

### User Experience Risks

1. **Complexity Overload**
   - Risk: Too many features confuse users
   - Mitigation: Progressive disclosure, tutorials

2. **Data Loss**
   - Risk: localStorage cleared accidentally
   - Mitigation: Export reminders, Phase 2 database

---

## Documentation Needs

### For Each Priority

- [ ] Update BPMN-MODELER-IMPLEMENTATION.md
- [ ] Add section to user guide
- [ ] Create video tutorial (Phase 2)
- [ ] Update API documentation (Phase 2)

### Process Documentation

- [ ] Architecture decision records (ADRs)
- [ ] Integration guide (BPMN + DMN + Operaton)
- [ ] Troubleshooting guide
- [ ] Migration guide (localStorage → PostgreSQL)

---

## Getting Started

### To Begin Priority 1 (DMN-BPMN Integration)

1. **Read Documentation:**
   - `docs/BPMN-MODELER-IMPLEMENTATION.md` (current state)
   - This ROADMAP.md (priorities)
   - Existing `templateService.ts` (DMN templates)

2. **Explore Codebase:**
   - `BpmnProperties.tsx` (where to add selector)
   - `templateService.ts` (how to fetch templates)
   - `ChainBuilder` (reference for DMN integration)

3. **Set Up Development:**
   - Ensure latest code: `git pull`
   - Install dependencies: `npm install`
   - Run dev: `npm run dev`
   - Test with example process

4. **Create Branch:**
   ```bash
   git checkout -b feature/bpmn-dmn-linking
   ```

5. **Start with DmnTemplateSelector:**
   - Create component skeleton
   - Integrate with templateService
   - Add to BpmnProperties conditionally
   - Test dropdown population

6. **Iterate:**
   - Implement auto-populate logic
   - Add visual indicators
   - Update BpmnProcess interface
   - Test with Tree Felling example

---

## Questions & Discussion

### Open Questions

1. **DMN Linking UI**: Dropdown vs modal vs sidebar?
2. **Visual Indicators**: Badges, colors, or tooltips?
3. **Validation Timing**: Real-time vs on-demand vs pre-export?
4. **Phase 2 Priority**: Database or sharing first?

### Feedback Welcome

This roadmap is a living document. Suggestions for:
- Priority reordering
- Feature additions
- Complexity estimates
- Alternative approaches

---

## References

- [BPMN 2.0 Specification](https://www.omg.org/spec/BPMN/2.0/)
- [bpmn-js Documentation](https://bpmn.io/toolkit/bpmn-js/)
- [bpmn-js Modeling API](https://github.com/bpmn-io/bpmn-js-examples/tree/main/properties-panel)
- [Operaton Documentation](https://docs.operaton.org/)
- [Linked Data Explorer GitHub](https://github.com/yourusername/linked-data-explorer)

---

**Last Updated:** February 7, 2026  
**Next Review:** After Priority 1 completion  
**Maintained By:** Linked Data Explorer Development Team
