# BPMN Modeler Implementation

**Date:** February 7, 2026  
**Version:** 0.6.0  

---

## Overview

The BPMN Modeler is a web-based process editor integrated into the Linked Data Explorer application. It enables users to create, edit, and visualize BPMN 2.0 business processes with support for DMN decision orchestration through the Operaton engine (Camunda 7 CE fork).

### Purpose

- **Visual Process Design**: Create government service workflows visually
- **DMN Integration**: Link BusinessRuleTasks to DMN decision models
- **Process Export**: Generate execution-ready .bpmn files for Operaton
- **Knowledge Sharing**: Provide example processes demonstrating best practices

---

## Architecture

### Component Structure
```
packages/frontend/src/components/BpmnModeler/
├── BpmnModeler.tsx           # Main orchestrator component
├── BpmnCanvas.tsx            # bpmn-js canvas wrapper
├── BpmnProperties.tsx        # Properties panel (right)
├── ProcessList.tsx           # Process management (left)
├── DmnTemplateSelector.tsx   # Future DMN linking (placeholder)
├── BpmnModeler.css           # Custom styles for canvas
└── bpmn-js.css              # bpmn-js core styles import
```

### Services & Utilities
```
packages/frontend/src/
├── services/
│   └── bpmnService.ts        # localStorage CRUD operations
├── utils/
│   └── bpmnTemplates.ts      # Default XML templates
└── types/
    └── index.ts              # TypeScript interfaces
```

---

## Key Features

### 1. Three-Panel Layout

**Left Panel - Process List**
- Display all saved processes
- Create new processes (+ button)
- Double-click to rename
- Delete with confirmation (protected for examples)
- Shows update timestamp

**Middle Panel - Canvas Editor**
- Interactive BPMN 2.0 canvas powered by bpmn-js
- Element palette for drag-and-drop
- Zoom controls: +/- buttons, fit-to-viewport, scroll-to-zoom
- Save/Export/Close buttons
- Real-time diagram updates

**Right Panel - Properties**
- Element type display
- Element ID (read-only)
- Name field (editable)
- DMN Decision Reference section (for BusinessRuleTasks)
  - Decision Ref input
  - Result Variable input

### 2. BPMN Palette

Available elements:
- Hand Tool (pan canvas)
- Lasso Tool (select multiple)
- Space Tool (create space)
- Global Connect Tool
- Create StartEvent
- Create IntermediateEvent
- Create EndEvent
- Create Task
- Create Gateway (exclusive, parallel, inclusive, event-based)
- Create SubProcess
- Create DataObjectReference
- Create DataStoreReference
- Create ExpandedPool
- Create TextAnnotation
- Create Group

### 3. Zoom & Navigation

- **Mouse Wheel**: Scroll to zoom in/out (no modifier key required)
- **+ Button**: Zoom in by 10%
- **- Button**: Zoom out by 10%
- **Fit Button**: Auto-fit diagram to viewport
- **Zoom Range**: 20% to 400%
- **Pan**: Click and drag canvas background

### 4. Process Persistence

**Storage Method**: localStorage
- Key: `linkedDataExplorer_bpmnProcesses`
- Format: JSON array of BpmnProcess objects
- Survives browser refresh (not cleared on reload)
- Scoped per endpoint (future enhancement planned)

**Data Model**:
```typescript
interface BpmnProcess {
  id: string;                    // Unique identifier
  name: string;                  // Display name
  description?: string;          // Optional description
  xml: string;                   // BPMN 2.0 XML
  createdAt: string;            // ISO timestamp
  updatedAt: string;            // ISO timestamp
  linkedDmnTemplates: string[]; // DMN IDs referenced
  readonly?: boolean;           // Protection flag
}
```

### 5. Example Process Auto-Loading

**Tree Felling Permit Example**
- Auto-created on first visit (empty localStorage)
- Demonstrates complete workflow:
  - StartEvent
  - Submit Application (UserTask)
  - Assess Felling Permit (BusinessRuleTask → TreeFellingDecision)
  - Permit? (ExclusiveGateway)
  - Assess Replacement Requirement (BusinessRuleTask → ReplacementTreeDecision)
  - Permit Granted/Rejected (UserTasks)
  - EndEvents (two paths)
- **Protected**: Cannot be deleted (readonly: true)
- Shows "EXAMPLE" badge in process list
- Delete button disabled with tooltip

---

## Technical Implementation

### Dependencies

**NPM Packages**:
```json
{
  "bpmn-js": "^18.12.0",
  "camunda-bpmn-moddle": "^7.0.1"
}
```

**Why These Versions**:
- `bpmn-js@18.12`: Latest stable, includes TypeScript types
- `camunda-bpmn-moddle@7.0.1`: Camunda namespace support (backward compatible with Operaton)

### Namespace Strategy

**Decision**: Use `camunda:` namespace attributes
- Operaton accepts both `camunda:` and `operaton:` namespaces
- `camunda-bpmn-moddle` package exists and is stable
- No `operaton-bpmn-moddle` package available yet
- Ensures broad compatibility

**Example XML**:
```xml
<bpmn:businessRuleTask 
  id="AssessPermit" 
  name="Assess Felling Permit" 
  camunda:resultVariable="permitDecision" 
  camunda:decisionRef="TreeFellingDecision" 
  camunda:mapDecisionResult="singleEntry" />
```

### Canvas Initialization
```typescript
const modeler = new Modeler({
  container: containerRef.current,
  moddleExtensions: {
    camunda: camundaModdleDescriptor,
  },
});

await modeler.importXML(xml);
const canvas = modeler.get('canvas');
canvas.zoom('fit-viewport');
```

### Custom Scroll-to-Zoom

bpmn-js default behavior requires Ctrl+Scroll. We override this:
```typescript
const handleWheel = (e: WheelEvent) => {
  e.preventDefault();
  const canvas = modelerRef.current?.get('canvas');
  const currentZoom = canvas.zoom();
  const delta = e.deltaY > 0 ? -0.1 : 0.1;
  canvas.zoom(Math.max(0.2, Math.min(4, currentZoom + delta)));
};

container.addEventListener('wheel', handleWheel, { passive: false });
```

### Rendering Artifact Fixes

**Problem**: Black circles/lines appearing when dragging connections

**Solution**: Custom CSS to control SVG layer rendering
```css
.bpmn-container .djs-overlay-container,
.bpmn-container .djs-hit-container,
.bpmn-container .djs-outline-container {
  pointer-events: none;
}

.bpmn-container .djs-element {
  pointer-events: all;
}
```

---

## User Workflows

### Creating a New Process

1. Click Workflow icon (Workflow) in left sidebar
2. Click blue "+" button in process list
3. New process appears: "New Process"
4. Canvas shows empty diagram with StartEvent
5. Drag elements from palette onto canvas
6. Connect elements by clicking and dragging
7. Click "Save" to persist changes
8. Double-click process name to rename

### Editing an Existing Process

1. Click process in left panel list
2. Canvas loads process diagram
3. Select element to view/edit properties (right panel)
4. Modify diagram using palette and drag-drop
5. Click "Save" when done
6. Click "Close" to return to empty state

### Exporting for Execution

1. Open desired process
2. Click "Export" button
3. Downloads `process_[timestamp].bpmn` file
4. Upload to Operaton engine
5. Compatible with Camunda 7.x / Operaton execution

### Using the Example

1. First visit: Tree Felling Permit auto-loads
2. Examine workflow structure
3. Click BusinessRuleTasks to see DMN references
4. Cannot delete (protected)
5. Can create copy: Export → Create New → Import XML

---

## Integration Points

### Operaton Engine

**BusinessRuleTask Attributes**:
- `camunda:decisionRef`: DMN decision ID to invoke
- `camunda:resultVariable`: Variable name for decision output
- `camunda:mapDecisionResult`: How to map result (singleEntry, singleResult, collectEntries, resultList)

**Example Decision Reference**:
```xml
<bpmn:businessRuleTask 
  id="Task_Assess" 
  camunda:decisionRef="TreeFellingDecision" 
  camunda:resultVariable="permitDecision" 
  camunda:mapDecisionResult="singleEntry" />
```

### Future: DMN Chain Composer Integration

**Planned Enhancement** (Phase 2):
- Link BPMN BusinessRuleTasks to saved DMN templates
- Auto-populate `camunda:decisionRef` from template selector
- Validate variable compatibility between BPMN and DMN
- Visual indication of DMN linkage in canvas
- Bi-directional navigation: BPMN ↔ DMN views

---

## Known Limitations

1. **Properties Panel**: Basic implementation, not all BPMN properties editable yet
2. **DMN Linking**: Manual entry of decisionRef, no dropdown selector (Phase 2)
3. **Validation**: No real-time BPMN validation (relies on bpmn-js)
4. **Collaboration**: Single-user only, no real-time collaboration
5. **Versioning**: No version history, only latest state saved
6. **PostgreSQL**: Using localStorage; PostgreSQL migration planned (Phase 2)

---

## Future Enhancements

### Phase 2 Roadmap

**PostgreSQL Migration**
- Move from localStorage to database
- User authentication and ownership
- Process versioning with history
- Public sharing with access control
- Collaborative editing

**DMN Template Linking**
- Dropdown selector for DMN templates
- Auto-populate decisionRef from saved chains
- Variable compatibility validation
- Visual indicators for linked decisions
- Navigate from BPMN → DMN definition

**Advanced Properties Panel**
- Edit all BPMN element properties
- Form field configuration
- Listener/extension configuration
- Input/output mapping
- Conditional expressions editor

**Process Execution**
- Deploy directly to Operaton from UI
- Monitor running instances
- View execution history
- Debug process issues

**Enhanced Canvas**
- Minimap navigation
- Keyboard shortcuts
- Element templates/snippets
- Import existing .bpmn files
- Compare process versions

---

## Testing Checklist

- [ ] Create new process
- [ ] Rename process (double-click)
- [ ] Delete process (confirm dialog)
- [ ] Cannot delete example (disabled button)
- [ ] Save process (persist to localStorage)
- [ ] Close process (return to empty state)
- [ ] Export process (.bpmn file downloads)
- [ ] Zoom in/out (buttons)
- [ ] Scroll to zoom (mouse wheel)
- [ ] Fit to viewport
- [ ] Drag elements from palette
- [ ] Connect elements
- [ ] Select element (properties panel updates)
- [ ] Edit element name
- [ ] Hard refresh preserves processes
- [ ] Clear localStorage shows example on reload

---

## Troubleshooting

### Palette Not Showing
- Ensure `bpmn-js.css` is imported in BpmnCanvas.tsx
- Check browser console for CSS loading errors
- Verify bpmn-js package is installed

### Rendering Artifacts
- Ensure `BpmnModeler.css` is imported
- Check for conflicting global CSS
- Verify SVG layer pointer-events are set correctly

### Scroll Not Zooming
- Check `handleWheel` event listener is registered
- Verify `passive: false` option is set
- Test in different browsers (Firefox vs Chrome)

### Process Not Saving
- Check browser localStorage quota
- Verify bpmnService is imported correctly
- Check browser console for errors

---

## References

- [bpmn-js Documentation](https://bpmn.io/toolkit/bpmn-js/)
- [BPMN 2.0 Specification](https://www.omg.org/spec/BPMN/2.0/)
- [Operaton Documentation](https://docs.operaton.org/)
- [Camunda 7 BPMN Reference](https://docs.camunda.org/manual/latest/reference/bpmn20/)

---

## Change Log

**v0.6.0 (2026-02-07)**
- Initial BPMN Modeler implementation
- Three-panel layout with process management
- Tree Felling Permit example auto-loading
- localStorage persistence
- Export functionality
- Custom zoom controls and scroll-to-zoom
- Properties panel basic implementation