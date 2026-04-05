# DSO Integration — Implementation Notes

## Pending fix before first deploy

### `packages/backend/src/services/dso.service.ts` — `getActiviteiten` date default

Do **not** use `toLocaleDateString('nl-NL', ...)`. Azure App Service Node.js runtimes may
not have full `Intl` locale data, causing incorrect or empty output. Use the manual format:

```typescript
const d = new Date();
const datum =
  opts.datum ??
  `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
```

The DSO RTR API requires `datum` in `dd-MM-yyyy` format. Missing or malformed → 400.

---

## Pending UX improvements — `DsoExplorer.tsx`

### 1. Activities tab: make the today-default visible

The date input is empty on load but the backend silently defaults to today. Users do not
know results are already date-scoped. Add a placeholder:

```tsx
// In ActiviteitenTab, on the <input type="date"> element
placeholder = 'Today';
```

### 2. Activities tab: IMOW URNs without a display name

Lower-level IMOW activity identifiers (e.g. `nl.imow-gm0014.activiteit.*`) frequently
carry **no `naam` field** in the RTR. The current fallback `act.naam ?? act.urn` is
correct and safe, but the URN-as-title is noisy.

Future enrichment path: cross-reference the DSO **Catalogus** `/activiteiten` endpoint,
which does carry human-readable display names for the same activity URNs. This would be
a second `GET /v1/dso/activiteiten` backend endpoint pointing at the Catalogue base URL
rather than the RTR base URL, then merge by URN in the frontend.

---

## API endpoints wired (pre-production)

| LDE route                  | DSO upstream           | Notes                                                |
| -------------------------- | ---------------------- | ---------------------------------------------------- |
| `GET /v1/dso/begrippen`    | Catalogue `/begrippen` | `zoekTerm`, `geldigOp`, `page`, `pageSize` forwarded |
| `GET /v1/dso/activiteiten` | RTR `/activiteiten`    | `datum` (dd-MM-yyyy), `page`, `pageSize` forwarded   |

Both routes return `{ success: true, data: <HAL response> }`.  
API key via `x-api-key` header; configured through `DSO_API_KEY` env var.

## Environment variables required

```
DSO_CATALOGUE_BASE_URL=https://service.pre.omgevingswet.overheid.nl/publiek/catalogus/api/opvragen/v3
DSO_RTR_BASE_URL=https://service.pre.omgevingswet.overheid.nl/publiek/toepasbare-regels/api/rtrgegevens/v2
DSO_API_KEY=<your key>
DSO_TIMEOUT=15000
```

Switch `service.pre` → `service` for production.
