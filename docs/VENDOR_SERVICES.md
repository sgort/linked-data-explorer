# Vendor Services Integration

**Version:** 0.8.4  
**Release Date:** February 15, 2026  
**Status:** Production  
**Ontology:** RONL Ontology v1.0 - Vendor Integration Vocabulary

---

## Table of Contents

1. [Overview](#overview)
2. [RONL Ontology Integration](#ronl-ontology-integration)
3. [User Guide](#user-guide)
4. [Technical Implementation](#technical-implementation)
5. [API Reference](#api-reference)
6. [Data Model](#data-model)
7. [UI Components](#ui-components)
8. [CPSV Editor Integration](#cpsv-editor-integration)
9. [Testing & Examples](#testing--examples)
10. [Future Enhancements](#future-enhancements)

---

## Overview

The Vendor Services feature enables discovery and management of commercial implementations of government decision models. While government agencies publish reference DMN implementations through RONL, vendors (like Blueriq, Oracle Policy Automation, etc.) may provide certified commercial implementations with additional features, support, and integration capabilities.

### Purpose

- **Discoverability:** Users can see which DMNs have commercial implementations available
- **Transparency:** Clear information about vendor implementations, licensing, and access requirements
- **Choice:** Enable organizations to choose between reference implementations and vendor services
- **Ecosystem Growth:** Support multi-vendor implementations of government services

### Key Features

✅ Visual badges showing vendor implementation count per DMN  
✅ Detailed vendor information modal with provider details  
✅ Contact information and service URLs  
✅ License type and access requirement indicators  
✅ Logo display for vendor branding  
✅ Integration with CPSV Editor for publishing vendor services

---

## RONL Ontology Integration

### Namespace

The vendor metadata uses the **RONL Ontology v1.0** vendor integration vocabulary:
```turtle
@prefix ronl: <https://regels.overheid.nl/ontology#> .
@prefix schema: <http://schema.org/> .
@prefix foaf: <http://xmlns.com/foaf/0.1/> .
```

### Core Properties

| Property | Type | Description |
|----------|------|-------------|
| `ronl:VendorService` | Class | A commercial implementation of a government service |
| `ronl:basedOn` | URI | Links vendor service to reference DMN |
| `ronl:implementedBy` | URI | Platform/framework used (e.g., Blueriq) |
| `schema:provider` | Blank Node | Organization providing the service |
| `schema:url` | URI | URL to access the vendor service |
| `schema:license` | String | License type (Commercial, Open Source, Free) |
| `ronl:accessType` | String | Access requirements (iam-required, public, api-key) |

### Example RDF
```turtle
@prefix ronl: <https://regels.overheid.nl/ontology#> .
@prefix schema: <http://schema.org/> .
@prefix foaf: <http://xmlns.com/foaf/0.1/> .
@prefix dct: <http://purl.org/dc/terms/> .

# Vendor Service
<https://regels.overheid.nl/services/aow-leeftijd/vendor>
  a ronl:VendorService ;
  ronl:basedOn <https://regels.overheid.nl/services/aow-leeftijd/dmn> ;
  ronl:implementedBy <https://regels.overheid.nl/termen/Blueriq> ;
  schema:provider [
    a schema:Organization ;
    schema:name "Blueriq B.V." ;
    schema:image <./assets/Blueriq_vendor_logo.png> ;
    foaf:homepage <https://www.blueriq.com> ;
    schema:contactPoint [
      schema:name "John Doe" ;
      schema:email "john.doe@blueriq.com" ;
      schema:telephone "+31 6 12 34 56 78"
    ]
  ] ;
  schema:url <https://regelservices.blueriq.com/shortcut/Doccle> ;
  schema:license "Commercial" ;
  ronl:accessType "iam-required" ;
  dct:description "Pensioen Regelservice voor gebruik in combinatie met Doccle."@nl .
```

---

## User Guide

### For End Users (Viewing Vendor Services)

#### Finding Vendor Implementations

**In Available DMNs List (Left Panel):**

Look for blue badges with numbers next to DMN cards:
```
┌─────────────────────────────────────┐
│ ✓ Gevalideerd  🏢 1                 │
│ SVB_LeeftijdsInformatie             │
│ 3 inputs → 12 outputs               │
│ Sociale Verzekeringsbank            │
└─────────────────────────────────────┘
```

- **Blue badge with "1"** = One vendor implementation available
- **No vendor badge** = Reference implementation only, no commercial alternatives

#### Viewing Vendor Details

1. **Click the blue vendor badge** on any DMN card
2. A modal opens showing all available vendor implementations
3. Review vendor information:
   - **Provider Name & Logo**
   - **Platform** (e.g., Blueriq, Oracle)
   - **License Type** (Commercial, Open Source, Free)
   - **Access Type** (IAM Required, Public, API Key Required)
   - **Contact Information** (Name, Email, Phone)
   - **Service URL** (Click to access)
   - **Description**

#### Interpreting License Badges

| Badge | Meaning |
|-------|---------|
| 🟣 **Commercial** | Paid license, typically includes support and SLA |
| 🟢 **Open Source** | Free to use, source code available |
| 🔵 **Free** | Free to use, may have usage restrictions |

#### Interpreting Access Type

| Badge | Meaning |
|-------|---------|
| 🟡 **IAM Required** | Requires Dutch government IAM authentication |
| 🟢 **Public Access** | Publicly accessible, no authentication |
| 🔵 **API Key Required** | Requires API key registration |

#### Contacting Vendors

- **Email:** Click email address to compose message
- **Phone:** Click phone number to dial
- **Website:** Click homepage link for more information

---

### For CPSV Editor Users (Publishing Vendor Services)

#### Adding Vendor Implementation Metadata

When publishing a vendor service to TriplyDB via the CPSV Editor:

1. Open the **CPSV Editor**
2. Navigate to the **Vendor** tab
3. Fill in vendor information:

**Provider Information:**
- Organization Name (e.g., "Blueriq B.V.")
- Logo Upload (PNG/JPG, will be stored in TriplyDB assets)
- Homepage URL

**Contact Details:**
- Contact Person Name
- Email Address
- Phone Number

**Implementation Details:**
- Platform/Framework (e.g., Blueriq, Oracle Policy Automation)
- Service URL (where users can access the implementation)
- License Type (Commercial, Open Source, Free)
- Access Type (iam-required, public, api-key)
- Description (Dutch language, explain implementation specifics)

**Link to Reference DMN:**
- Select the reference DMN this implementation is based on
- URI will be automatically linked via `ronl:basedOn`

4. Click **"Publish to TriplyDB"**
5. Vendor service is created with full metadata
6. Linked Data Explorer automatically displays vendor badge

#### Best Practices

✅ **Use official vendor logos** with proper licensing  
✅ **Provide accurate contact information** for support inquiries  
✅ **Keep descriptions in Dutch** for consistency  
✅ **Update service URLs** if endpoints change  
✅ **Specify clear license terms** to set user expectations

---

## Technical Implementation

### Architecture Overview
```
┌─────────────────────────────────────────────────────────────┐
│  Frontend (React/TypeScript)                                │
│  ┌────────────────┐  ┌──────────────┐  ┌────────────────┐   │
│  │  DmnList       │  │ ChainComposer│  │  VendorModal   │   │
│  │  (with badges) │  │ (with badges)│  │  (details)     │   │
│  └────────┬───────┘  └──────┬───────┘  └────────┬───────┘   │
│           │                 │                    │          │
│           └─────────────────┴────────────────────┘          │
│                             ↓                               │
│                      VendorBadge Component                  │
└─────────────────────────────┬───────────────────────────────┘
                              ↓
┌─────────────────────────────┴───────────────────────────────┐
│  Backend API (Node.js/Express)                              │
│  GET /v1/vendors?endpoint=...                               │
│  GET /v1/vendors/dmn/:identifier?endpoint=...               │
└─────────────────────────────┬───────────────────────────────┘
                              ↓
┌─────────────────────────────┴───────────────────────────────┐
│  Vendor Service (SPARQL Queries)                            │
│  - getAllVendorServices()                                   │
│  - getVendorServicesForDmn()                                │
│  - resolveVendorLogo()                                      │
└─────────────────────────────┬───────────────────────────────┘
                              ↓
┌─────────────────────────────┴───────────────────────────────┐
│  TriplyDB (RDF Store)                                       │
│  - ronl:VendorService instances                             │
│  - schema:provider metadata                                 │
│  - Vendor logos in assets                                   │
└─────────────────────────────────────────────────────────────┘
```

### Backend Implementation

#### Vendor Service

**File:** `packages/backend/src/services/vendor.service.ts`
```typescript
class VendorServiceImpl {
  /**
   * Get all vendor services for a specific endpoint
   * Uses SAMPLE() + GROUP BY for deduplication
   */
  async getAllVendorServices(endpoint?: string): Promise<VendorServiceType[]>

  /**
   * Get vendor services for a specific DMN
   * Filters by DMN identifier or URI
   */
  async getVendorServicesForDmn(dmnId: string, endpoint?: string): Promise<VendorServiceType[]>

  /**
   * Resolve vendor logo from TriplyDB assets
   * Handles relative paths like ./assets/logo.png
   */
  private async resolveVendorLogo(logoPath: string, endpoint?: string): Promise<string | undefined>
}
```

#### SPARQL Query

The backend uses a sophisticated SPARQL query with deduplication:
```sparql
PREFIX ronl: <https://regels.overheid.nl/ontology#>
PREFIX schema: <http://schema.org/>
PREFIX foaf: <http://xmlns.com/foaf/0.1/>

SELECT DISTINCT ?vendorService ?basedOn ?basedOnIdentifier
                ?implementedBy 
                (SAMPLE(?providerName_) AS ?providerName)
                (SAMPLE(?providerLogo_) AS ?providerLogo)
                (SAMPLE(?serviceUrl_) AS ?serviceUrl)
                (SAMPLE(?license_) AS ?license)
                -- ... other fields with SAMPLE()
WHERE {
  ?vendorService a ronl:VendorService ;
                 ronl:basedOn ?basedOn .
  
  OPTIONAL { ?basedOn dct:identifier ?basedOnIdentifier }
  OPTIONAL { ?vendorService ronl:implementedBy ?implementedBy }
  OPTIONAL { ?vendorService schema:provider ?provider .
    OPTIONAL { ?provider schema:name ?providerName_ }
    OPTIONAL { ?provider schema:image ?providerLogo_ }
    -- ... other provider fields
  }
}
GROUP BY ?vendorService ?basedOn ?basedOnIdentifier ?implementedBy
ORDER BY ?basedOnIdentifier ?providerName
```

**Key Query Features:**
- `SAMPLE()` aggregation to handle duplicate values (e.g., multiple language tags)
- `GROUP BY` to deduplicate vendor service URIs
- Language filtering for Dutch content preference
- Nested OPTIONAL blocks for provider and contact information

#### Vendor Count Integration

The vendor count is fetched alongside DMN metadata:

**File:** `packages/backend/src/services/sparql.service.ts`
```typescript
/**
 * Get vendor implementation count for DMNs
 * Returns a map of DMN URI → vendor count
 */
async getVendorCounts(endpoint?: string): Promise<Map<string, number>> {
  const query = `
    PREFIX ronl: <https://regels.overheid.nl/ontology#>
    
    SELECT ?basedOn (COUNT(?vendorService) AS ?vendorCount)
    WHERE {
      ?vendorService a ronl:VendorService ;
                     ronl:basedOn ?basedOn .
    }
    GROUP BY ?basedOn
  `;
  
  // ... execute and return map
}
```

This count is added to each `DmnModel` during the `getAllDmns()` call.

### Frontend Implementation

#### Type Definitions

**File:** `packages/frontend/src/types/vendor.types.ts`
```typescript
export interface VendorContact {
  name?: string;
  email?: string;
  telephone?: string;
}

export interface VendorOrganization {
  name: string;
  logoUrl?: string;
  homepage?: string;
  contactPoint?: VendorContact;
}

export interface VendorService {
  id: string;
  basedOn: string;
  basedOnIdentifier?: string;
  implementedBy?: string;
  implementedByName?: string;
  provider: VendorOrganization;
  serviceUrl?: string;
  license?: string;
  accessType?: string;
  description?: string;
}
```

#### VendorBadge Component

**File:** `packages/frontend/src/components/ChainBuilder/VendorBadge.tsx`

Displays a blue badge with vendor count:
```typescript
<button className="bg-blue-600 text-white ...">
  <Building2 size={12} />
  <span>{count}</span>
</button>
```

**Features:**
- Returns `null` if count is 0 or undefined (no badge shown)
- Compact mode for lists, expanded mode for cards
- Click handler with optional event parameter
- Hover tooltip with full count description

#### VendorModal Component

**File:** `packages/frontend/src/components/ChainBuilder/VendorModal.tsx`

Full-screen modal displaying vendor details:

**Modal Structure:**
```
┌──────────────────────────────────────────┐
│  🏢 Vendor Implementations               │
│  Available implementations for [DMN]     │
├──────────────────────────────────────────┤
│  ┌────────────────────────────────────┐  │
│  │ [Logo] Blueriq B.V.                │  │
│  │ Platform: Blueriq                  │  │
│  │ 🟣 Commercial  🟡 IAM Required     │  │
│  │                                    │  │
│  │ Description: ...                   │  │
│  │ 🔗 Access Service                  │  │
│  │                                    │  │
│  │ Contact Information:               │  │
│  │ 📧 john.doe@blueriq.com            │  │
│  │ 📞 +31 6 12 34 56 78               │  │
│  └────────────────────────────────────┘  │
├──────────────────────────────────────────┤
│           [Close Button]                 │
└──────────────────────────────────────────┘
```

**Features:**
- Fetches vendor data on mount via API
- Loading state with spinner
- Error handling with clear messages
- Empty state for DMNs with no vendors
- Multiple vendor cards if multiple implementations exist
- Clickable mailto: and tel: links
- External link indicators for URLs

---

## API Reference

### Endpoints

#### GET /v1/vendors

Get all vendor services for an endpoint.

**Query Parameters:**
- `endpoint` (optional): SPARQL endpoint URL

**Example Request:**
```bash
GET /v1/vendors?endpoint=https://api.open-regels.triply.cc/datasets/stevengort/RONL/services/RONL/sparql
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "vendorServices": [
      {
        "id": "https://regels.overheid.nl/services/aow-leeftijd/vendor",
        "basedOn": "https://regels.overheid.nl/services/aow-leeftijd/dmn",
        "basedOnIdentifier": "SVB_LeeftijdsInformatie",
        "implementedBy": "https://regels.overheid.nl/termen/Blueriq",
        "implementedByName": "Blueriq",
        "provider": {
          "name": "Blueriq B.V.",
          "logoUrl": "https://open-regels.triply.cc/.../Blueriq_vendor_logo.png",
          "homepage": "https://www.blueriq.com",
          "contactPoint": {
            "name": "John Doe",
            "email": "john.doe@blueriq.com",
            "telephone": "+31 6 12 34 56 78"
          }
        },
        "serviceUrl": "https://regelservices.blueriq.com/shortcut/Doccle",
        "license": "Commercial",
        "accessType": "iam-required",
        "description": "Pensioen Regelservice voor Doccle."
      }
    ],
    "count": 1
  }
}
```

#### GET /v1/vendors/dmn/:identifier

Get vendor services for a specific DMN.

**Path Parameters:**
- `identifier`: DMN identifier (e.g., "SVB_LeeftijdsInformatie")

**Query Parameters:**
- `endpoint` (optional): SPARQL endpoint URL

**Example Request:**
```bash
GET /v1/vendors/dmn/SVB_LeeftijdsInformatie?endpoint=https://...
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "vendorServices": [ /* same structure as above */ ],
    "count": 1,
    "dmnIdentifier": "SVB_LeeftijdsInformatie"
  }
}
```

### Error Responses
```json
{
  "success": false,
  "error": "Failed to fetch vendor services: SPARQL query timeout"
}
```

---

## Data Model

### Extended DmnModel
```typescript
export interface DmnModel {
  id: string;
  identifier: string;
  title: string;
  // ... other DMN fields ...
  
  // NEW: Vendor implementation count
  vendorCount?: number; // Number of commercial implementations
}
```

### Vendor Data Flow
```
1. CPSV Editor publishes vendor service to TriplyDB
   ↓
2. Backend fetches vendor metadata via SPARQL
   ↓
3. Vendor count aggregated and added to DmnModel
   ↓
4. Frontend displays blue badge with count
   ↓
5. User clicks badge → VendorModal fetches full details
   ↓
6. Modal displays provider info, contact, URLs
```

---

## UI Components

### Badge Rendering Logic

**Defensive Conditional Rendering:**
```typescript
// ❌ WRONG - renders "0" as plain text
{dmn.vendorCount && dmn.vendorCount > 0 && <VendorBadge />}

// ✅ CORRECT - returns null for 0 or undefined
{typeof dmn.vendorCount === 'number' && dmn.vendorCount > 0 ? (
  <VendorBadge count={dmn.vendorCount} onClick={...} />
) : null}
```

**Why This Matters:**
- JSX renders `0` as plain text when using `&&` operator
- Ternary with explicit `null` prevents rendering
- Type check ensures we're dealing with actual numbers

### Badge Ordering

Standardized across all interfaces:

1. **Validation Badge** (Green/Amber) - Official approval status
2. **Vendor Badge** (Blue) - Commercial implementations count
3. **DRD Badge** (Purple) - Unified decision diagram indicator
4. **Close Button** (White with border) - Remove from chain

### Styling Specifications

**Vendor Badge (Compact):**
```css
background: #2563eb (blue-600)
border: #1d4ed8 (blue-700)
text: white
size: 12px icon, xs font
padding: 2px 8px
```

**License Badges:**
- Commercial: `bg-purple-100 text-purple-700`
- Open Source: `bg-green-100 text-green-700`
- Free: `bg-blue-100 text-blue-700`

**Access Type Badges:**
- IAM Required: `bg-amber-100 text-amber-700`
- Public: `bg-green-100 text-green-700`
- API Key: `bg-blue-100 text-blue-700`

---

## CPSV Editor Integration

### Vendor Tab Workflow
```
1. User opens CPSV Editor
   ↓
2. Fills in service metadata (Service tab)
   ↓
3. Switches to Vendor tab
   ↓
4. Fills in vendor implementation details:
   - Provider name, logo, homepage
   - Contact person, email, phone
   - Platform/framework
   - Service URL
   - License and access type
   - Description
   ↓
5. Links to reference DMN via ronl:basedOn
   ↓
6. Clicks "Publish to TriplyDB"
   ↓
7. TTL file generated with ronl:VendorService
   ↓
8. Uploaded to TriplyDB with vendor metadata
   ↓
9. Linked Data Explorer immediately shows vendor badge
```

### Generated TTL Structure
```turtle
<https://regels.overheid.nl/services/aow-leeftijd/vendor>
  a ronl:VendorService ;
  ronl:basedOn <reference-dmn> ;
  ronl:implementedBy <platform> ;
  schema:provider [ /* blank node */ ] ;
  schema:url <service-url> ;
  schema:license "Commercial" ;
  ronl:accessType "iam-required" ;
  dct:description "..."@nl .
```

### Logo Asset Management

**Upload Process:**
1. User selects logo file in CPSV Editor
2. Logo uploaded to TriplyDB assets
3. Asset URL stored in `schema:image`
4. Backend resolves full URL via assets API
5. Frontend displays logo in modal

**Supported Formats:**
- PNG (recommended)
- JPG/JPEG
- SVG (with fallback)

**Recommended Dimensions:**
- 200x200 pixels minimum
- Square aspect ratio preferred
- Transparent background (PNG)

---

## Testing & Examples

### Example Test Data

**Vendor Service: Blueriq AOW Leeftijd**
```turtle
<https://regels.overheid.nl/services/aow-leeftijd/vendor>
  a ronl:VendorService ;
  ronl:basedOn <https://regels.overheid.nl/services/aow-leeftijd/dmn> ;
  ronl:implementedBy <https://regels.overheid.nl/termen/Blueriq> ;
  schema:provider [
    a schema:Organization ;
    schema:name "Blueriq B.V." ;
    schema:image <https://open-regels.triply.cc/.../Blueriq_vendor_logo.png> ;
    foaf:homepage <https://www.blueriq.com> ;
    schema:contactPoint [
      schema:name "John Doe" ;
      schema:email "john.doe@blueriq.com" ;
      schema:telephone "+31 6 12 34 56 78"
    ]
  ] ;
  schema:url <https://regelservices.blueriq.com/shortcut/Doccle> ;
  schema:license "Commercial" ;
  ronl:accessType "iam-required" ;
  dct:description "Pensioen Regelservice voor gebruik in combinatie met Doccle."@nl .
```

### Testing Checklist

**Backend:**
- [ ] GET /v1/vendors returns all vendor services
- [ ] GET /v1/vendors/dmn/:id returns filtered results
- [ ] SPARQL deduplication works (no duplicate vendors)
- [ ] Logo URL resolution from TriplyDB assets
- [ ] Vendor count aggregation in DMN queries
- [ ] Error handling for missing/malformed data

**Frontend:**
- [ ] Vendor badges appear in Available DMNs list
- [ ] Vendor badges appear in Chain Composer cards
- [ ] No "0" badges shown for DMNs without vendors
- [ ] Clicking badge opens modal
- [ ] Modal displays all vendor information correctly
- [ ] Contact links (mailto:, tel:) work
- [ ] External links open in new tab
- [ ] Modal closes on backdrop click and ESC key
- [ ] Loading states display correctly
- [ ] Error states display clear messages

**Integration:**
- [ ] CPSV Editor vendor tab publishes correctly
- [ ] Published vendor services appear in Linked Data Explorer
- [ ] Vendor count updates when new vendors added
- [ ] Logo images display correctly
- [ ] Multi-vendor scenarios work (multiple vendors per DMN)

### Manual Testing Scenario

1. **Setup:**
   - Open Linked Data Explorer at `https://acc.linkeddata.open-regels.nl`
   - Switch to endpoint with vendor test data

2. **View Vendors:**
   - Look for DMN with blue vendor badge (e.g., SVB_LeeftijdsInformatie)
   - Verify badge shows count "1"
   - Hover to see tooltip

3. **Open Modal:**
   - Click vendor badge
   - Verify modal opens with vendor details
   - Check logo displays
   - Check all fields populated

4. **Test Links:**
   - Click email link → Opens mail client
   - Click phone link → Initiates call
   - Click service URL → Opens in new tab
   - Click homepage → Opens vendor site

5. **Close Modal:**
   - Click close button → Modal closes
   - Click backdrop → Modal closes
   - Press ESC → Modal closes

---

## Future Enhancements

### Roadmap

**v0.9.0 - Certification Support**
- Distinguish between vendor implementations (self-declared) and certified implementations (authority-approved)
- Add `ronl:certifiedBy` property for official government certification
- Certification badge (gold) separate from vendor badge (blue)
- Certification expiry tracking and renewal workflows

**v1.0.0 - Vendor Marketplace**
- Vendor comparison matrix (side-by-side feature comparison)
- User reviews and ratings
- Vendor service health monitoring (uptime, response time)
- Cost estimation and pricing information
- SLA tracking and reporting

**v1.1.0 - Advanced Features**
- Vendor service versioning (track implementation updates)
- API specification integration (OpenAPI/Swagger docs)
- Test suite compatibility reports
- Migration guides between vendors
- Vendor notification system for DMN updates

### Potential Extensions

**Integration Capabilities:**
- OAuth 2.0 flow integration for IAM-required services
- API key management interface
- Direct service invocation from Linked Data Explorer
- Result comparison: reference vs vendor implementation

**Analytics & Insights:**
- Vendor adoption metrics (which vendors are most used)
- Performance comparison (execution time, success rate)
- Cost-benefit analysis tools
- Ecosystem health dashboards

---

## References

### Standards & Specifications

- **RONL Ontology v1.0:** [regels.overheid.nl/ontology](https://regels.overheid.nl/ontology)
- **Schema.org:** [schema.org](https://schema.org/) (provider, organization, contactPoint)
- **FOAF Vocabulary:** [xmlns.com/foaf/0.1/](http://xmlns.com/foaf/0.1/) (homepage)
- **DMN 1.3:** Decision Model and Notation Specification

### Related Documentation

- [GOVERNANCE.md](./GOVERNANCE.md) - DMN Validation & Governance System
- [RONL Ontology Specification](./RONL_ONTOLOGY.md)
- [CPSV Editor Documentation](../cpsv-editor/README.md)
- [Linked Data Explorer README](./README.md)
