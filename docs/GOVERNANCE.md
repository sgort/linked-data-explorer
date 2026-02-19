# DMN Governance & Validation System

**Version:** 0.8.3  
**Release Date:** February 14, 2026  
**Status:** Production  
**Ontology:** RONL Ontology v1.0

---

## Overview

The Linked Data Explorer implements a visual governance system that distinguishes between validated, in-review, and non-validated Decision Model and Notation (DMN) models published to TriplyDB. This transparency enables users to quickly identify which decision models have been officially approved by competent Dutch government authorities.

### Purpose

- **Trust & Transparency:** Clearly indicate which DMNs have undergone official validation
- **Quality Assurance:** Track validation status, validating organization, and validation dates
- **Compliance:** Support audit trails for government rule implementations
- **Multi-Authority Support:** Enable validation by different competent authorities (SVB, SZW, UWV, etc.)

### Key Features

✅ Three-state validation system (validated, in-review, not-validated)  
✅ Visual badges with color coding (emerald green, amber, none)  
✅ Organization attribution showing who validated the DMN  
✅ Validation dates in Dutch format  
✅ Hover tooltips with full validation details  
✅ Backward compatibility with legacy TriplyDB data

---

## RONL Ontology v1.0 Integration

### Namespace

The validation metadata uses the **RONL Ontology v1.0** governance vocabulary:
```turtle
@prefix ronl: <https://regels.overheid.nl/ontology#> .
```

This is separate from the rule management vocabulary (`cprmv:`), providing clean separation of concerns.

### Validation Properties

| Property | Type | Description | Example |
|----------|------|-------------|---------|
| `ronl:validationStatus` | `xsd:string` | Validation state | `"validated"`, `"in-review"`, `"not-validated"` |
| `ronl:validatedBy` | URI | Validating organization | `<https://organisaties.overheid.nl/.../SVB>` |
| `ronl:validatedAt` | `xsd:date` | Validation date | `"2026-02-14"` |
| `ronl:validationNote` | `rdf:langString` | Optional notes | `"Validated against AOW Article 7a"@nl` |

### Example RDF
```turtle
@prefix ronl: <https://regels.overheid.nl/ontology#> .
@prefix cprmv: <https://cprmv.open-regels.nl/0.3.0/> .
@prefix dct: <http://purl.org/dc/terms/> .
@prefix skos: <http://www.w3.org/2004/02/skos/core#> .

# Organization
<https://organisaties.overheid.nl/28212263/Sociale_Verzekeringsbank>
  a org:Organization ;
  skos:prefLabel "Sociale Verzekeringsbank"@nl .

# DMN with validation metadata
<https://regels.overheid.nl/services/aow-leeftijd/dmn>
  a cprmv:DecisionModel ;
  dct:identifier "SVB_LeeftijdsInformatie" ;
  dct:title "AOW Leeftijdsberekening"@nl ;
  
  # Validation metadata
  ronl:validationStatus "validated"^^xsd:string ;
  ronl:validatedBy <https://organisaties.overheid.nl/28212263/Sociale_Verzekeringsbank> ;
  ronl:validatedAt "2026-02-14"^^xsd:date ;
  ronl:validationNote "Validated against AOW legislation Article 7a"@nl .
```

---

## Badge System

### Visual Design

The badge system uses **Dutch government color standards**:

| Status | Badge | Color | Icon | Use Case |
|--------|-------|-------|------|----------|
| **Validated** | `✓ Gevalideerd` | Emerald 600 (`#059669`) | Shield Check | Official approval by competent authority |
| **In Review** | `⏱ In Review` | Amber 500 (`#F59E0B`) | Clock | Under validation process |
| **Not Validated** | *(no badge)* | - | - | Default state, no official validation |

### Accessibility

- ✅ **WCAG AA compliant** contrast ratios
- ✅ **Icon + Text** (not color-only)
- ✅ **Hover tooltips** with full details
- ✅ **Screen reader friendly** with semantic HTML

### Badge Placement

**Available DMNs List (Left Panel):**
```
┌─────────────────────────────────────┐
│ SVB_LeeftijdsInformatie             │
│ ✓ Gevalideerd                       │
│ 3 inputs → 12 outputs               │
│ Sociale Verzekeringsbank            │
└─────────────────────────────────────┘
```

**Chain Composer (Dropped Card):**
```
┌─────────────────────────────────────────────┐
│ ✓ Gevalideerd  🔗 DRD               ← Badges│
│                                             │
│  SVB_LeeftijdsInformatie                    │
│                                             │
│ Validated by: Sociale Verzekeringsbank      │
│ Date: 14 feb 2026                           │
└─────────────────────────────────────────────┘
```

---

## SPARQL Query Implementation

### Backward-Compatible Query

The backend uses a UNION query to support both old (`ronl: <.../termen/>`) and new (`ronl-gov: <.../ontology#>`) namespaces:
```sparql
PREFIX cprmv: <https://cprmv.open-regels.nl/0.3.0/>
PREFIX ronl: <https://regels.overheid.nl/termen/>
PREFIX ronl-gov: <https://regels.overheid.nl/ontology#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT ?dmn ?identifier ?validationStatus ?validatedBy ?validatedByName ?validatedAt
WHERE {
  ?dmn a cprmv:DecisionModel ;
       dct:identifier ?identifier .
  
  # Validation metadata (RONL Ontology v1.0)
  OPTIONAL { ?dmn ronl-gov:validationStatus ?validationStatus }
  OPTIONAL { 
    ?dmn ronl-gov:validatedBy ?validatedBy .
    OPTIONAL {
      ?validatedBy skos:prefLabel ?validatedByName .
    }
  }
  OPTIONAL { ?dmn ronl-gov:validatedAt ?validatedAt }
}
```

### Query Performance

- **Caching:** Backend caches DMN list for 5 minutes per endpoint
- **Optimization:** Uses OPTIONAL blocks to avoid breaking when validation data is missing
- **Scalability:** Supports multiple validation authorities without schema changes

---

## Implementation Architecture

### Backend (Node.js/TypeScript)

**File:** `packages/backend/src/services/sparql.service.ts`
```typescript
interface DmnModel {
  id: string;
  identifier: string;
  // ... other fields ...
  
  // Validation metadata
  validationStatus?: 'validated' | 'in-review' | 'not-validated';
  validatedBy?: string; // Organization URI
  validatedByName?: string; // Organization display name
  validatedAt?: string; // ISO 8601 date
  validationNote?: string;
}
```

**SPARQL Service:**
- Fetches validation metadata alongside DMN data
- Resolves organization names via `skos:prefLabel`
- Handles missing/optional validation data gracefully

### Frontend (React/TypeScript)

**Component:** `packages/frontend/src/components/ChainBuilder/ValidationBadge.tsx`
```typescript
interface ValidationBadgeProps {
  status: 'validated' | 'in-review' | 'not-validated' | undefined;
  validatedByName?: string;
  validatedAt?: string;
  compact?: boolean; // For list vs card display
}
```

**Integration Points:**
- `DmnList.tsx` - Badge in Available DMNs panel
- `ChainComposer.tsx` - Badge on dropped DMN cards
- Conditional rendering (only show badge if status is not "not-validated")

---

## User Guide

### For End Users (Viewing DMNs)

#### Interpreting Badges

**✓ Gevalideerd (Green Badge)**
- DMN has been officially validated by a competent authority
- Safe to use in production environments
- Validation date and organization shown on hover

**⏱ In Review (Amber Badge)**
- DMN is currently under validation review
- Use with caution in production
- Contact validating authority for status updates

**No Badge**
- DMN has not been officially validated
- May be experimental, draft, or community-contributed
- Verify suitability before production use

#### Using Validated DMNs

1. Open **Chain Builder** (Orchestration icon in sidebar)
2. Look for green "✓ Gevalideerd" badges in Available DMNs list
3. Hover over badge to see validation details
4. Drag validated DMN into chain for trusted execution
5. Badge persists on card in Chain Composer

### For CPSV Editor Users (Publishing DMNs)

#### Adding Validation Metadata

When publishing a DMN to TriplyDB via the CPSV Editor:

1. Expand **"Validation Status"** section (optional)
2. Select status:
   - **Not Validated** (default) - No badge shown
   - **In Review** - Amber badge shown
   - **Officially Validated** - Green badge shown
3. If "Validated" or "In Review":
   - Choose **Validating Organization** from dropdown
   - Enter **Validation Date**
   - Optionally add **Validation Notes**
4. Click **"Publish to TriplyDB"**
5. RDF with validation metadata is uploaded
6. Linked Data Explorer automatically displays badges

#### Validation Workflow
```
1. DMN Created → Status: not-validated (no badge)
                    ↓
2. Submit for Review → Status: in-review (amber badge)
                    ↓
3. Authority Validates → Status: validated (green badge)
```

---

## Data Quality & Governance

### Validation Responsibilities

| Authority | Scope | Example DMNs |
|-----------|-------|--------------|
| **Sociale Verzekeringsbank (SVB)** | Social security benefits | AOW leeftijd, ANW, AIO |
| **Sociale Zaken en Werkgelegenheid (SZW)** | Social assistance | Bijstandsnorm, Participatiewet |
| **Uitvoeringsinstituut Werknemersverzekeringen (UWV)** | Employee insurance | WW, WIA, Ziektewet |
| **Belastingdienst** | Tax regulations | Inkomstenbelasting, BTW |
| **Municipalities** | Local services | Minimaregelingen, subsidies |

### Validation Criteria

DMNs should be validated for:

- ✅ **Legal Correctness:** Decision logic matches legislation
- ✅ **Technical Quality:** DMN 1.3 specification compliance
- ✅ **Test Coverage:** Comprehensive test cases pass
- ✅ **Documentation:** Clear variable descriptions
- ✅ **Maintainability:** Versioning and change management

---

## Migration Guide

### From Legacy Systems

If you have existing DMNs in TriplyDB without validation metadata:

**Option 1: Add Metadata via CPSV Editor**
1. Import existing DMN TTL file into CPSV Editor
2. Add validation metadata in "Validation Status" section
3. Re-publish to TriplyDB

**Option 2: Direct RDF Update**
```turtle
# Add to existing DMN definition
<https://regels.overheid.nl/services/your-dmn/dmn>
  ronl:validationStatus "validated"^^xsd:string ;
  ronl:validatedBy <https://organisaties.overheid.nl/.../YourOrg> ;
  ronl:validatedAt "2026-02-14"^^xsd:date .
```

### Backward Compatibility

- ✅ **Old TTL files without validation:** Work normally, no badges shown
- ✅ **Mixed datasets:** Validated and non-validated DMNs coexist
- ✅ **No breaking changes:** Validation is purely additive metadata

---

## Testing & Quality Assurance

### Test Scenarios

**Scenario 1: Validated DMN**
- Status: `"validated"`
- Expected: Green badge with organization name and date

**Scenario 2: In-Review DMN**
- Status: `"in-review"`
- Expected: Amber badge with organization name and date

**Scenario 3: Non-Validated DMN**
- Status: `"not-validated"` or missing
- Expected: No badge shown

**Scenario 4: Missing Organization Name**
- Status: `"validated"` but no `skos:prefLabel` for organization
- Expected: Badge shows without organization name (graceful degradation)

### Quality Metrics

- **SPARQL Query Response Time:** < 500ms (cached)
- **Badge Render Time:** < 50ms
- **Accessibility Score:** 100% (WCAG AA compliant)
- **Browser Compatibility:** Chrome, Firefox, Safari, Edge (latest 2 versions)

---

## Future Enhancements

### Roadmap (Post v0.8.3)

**v0.9.0 - Certification Support**
- Add `ronl:certifiedBy` for official government certification
- Distinguish validation (technical QA) from certification (legal authorization)
- Separate badge styling for certified vs validated

**v1.0.0 - Vendor Integration**
- Support `ronl:basedOn` to track vendor implementations
- Multi-vendor comparison for same government service
- Certification expiry tracking

**v1.1.0 - Advanced Filtering**
- Filter DMN list by validation status
- Search by validating organization
- Date range filters for validation dates

---

## References

### Standards & Specifications

- **RONL Ontology v1.0:** [regels.overheid.nl/ontology](https://regels.overheid.nl/ontology)
- **CPRMV 0.3.0:** Core Public Rule Management Vocabulary
- **CPSV-AP 3.2.0:** Core Public Service Vocabulary
- **DMN 1.3:** Decision Model and Notation Specification

### Related Documentation

- [CPSV Editor Documentation](../cpsv-editor/README.md)
- [RONL Ontology Specification](./RONL_ONTOLOGY.md)
- [Linked Data Explorer README](./README.md)
- [Enhanced Validation System](./docs/ENHANCED_VALIDATION.md)
