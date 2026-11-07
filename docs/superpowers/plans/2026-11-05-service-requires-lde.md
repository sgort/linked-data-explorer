# Service `dct:requires`: LDE (PR 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** LDE shows, for each DMN, the services its service requires ("Requires") and the services that require it ("Required by"), on the Chain Builder card and in the BPMN "Link to DMN/DRD" panel. Display only.

**Architecture:**

- The backend runs one extra aggregate query for every `dct:requires` pair on the endpoint, next to the existing vendor-count pre-query.
- It attaches `requires` / `requiredBy` to each DMN by its service URI, deriving the inverse itself, and caches them with the DMN list.
- The frontend renders both lists through one small `ServiceLinks` component, used in two places.

**Tech Stack:**

- Backend: TypeScript + Express, Jest.
- Frontend: React + TypeScript, Vitest + Testing Library.
- API contract: OpenAPI 3 (`openapi.yaml`, built to JSON).

**Spec:** `docs/superpowers/specs/2026-11-05-service-requires-design.md` in **sgort/ttl-editor** (its section "LDE (PR 2, linked-data-explorer)", plus the revision note at the top). Issue: sgort/ttl-editor#223. The editor side shipped in sgort/ttl-editor#226.

## Global Constraints

- **Relation:** `dct:requires` (`http://purl.org/dc/terms/requires`).
  - Subject: the dependent service. Object: the service it relies on.
  - "Required by" is derived, never read from the data.
- **Display only:**
  - No actions, no chain auto-adding, no BPMN warnings.
  - Only show a line when its list is non-empty.
- **Scope of "Required by":** the endpoint being viewed. A link into another dataset shows only as "Requires" on the dependent side (user decision).
- **Backwards compatible:**
  - `requires` / `requiredBy` are optional and **left out when empty**, so a dataset without `dct:requires` returns exactly today's response shape.
  - No new route.
- **Degrade, don't fail:** if the requirements query fails, the DMN list is still returned without the two fields. This is the same pattern as `getVendorCounts`.
- **Entry shape:** `ServiceLink = { service: string; title?: string; dmnIdentifier?: string }`.
- **Display name:** `dmnIdentifier`, falling back to `title`, then to the last URI path segment.
- **Git and process (from CLAUDE.md):**
  - Ask the user before every `git commit`.
  - Never `--no-verify`.
  - Never start, stop or restart dev servers.
  - Verify UI by asking the user.
  - Nothing reaches `acc` except through a merged PR.
  - In PR bodies, no closing keyword (close/fix/resolve) in front of `#223`: this PR completes #223, but the user closes it.

## Review Focus

1. **A required service with no DMN in the list** (published without a DMN, unpublished, or in another dataset) still appears under "Requires", named by its title or else its URI, with no `dmnIdentifier`. Pinned in Task 1.
2. **Several titles per service** (multilingual) produce duplicate rows; the links must not be duplicated. Pinned in Task 1.
3. **The requirements query fails:** `getAllDmns` still resolves with every DMN, and the two fields are absent. Pinned in Task 1.
4. **A self-link** (`<s> dct:requires <s>`, possible from other tools) is ignored, never shown as requiring or required by itself. Pinned in Task 1.
5. **A dataset without any `dct:requires`:** no DMN carries `requires` or `requiredBy` keys at all, and the `/dmns` response still conforms to the OpenAPI schema. Pinned in Tasks 1 and 2.

---

### Task 1: Backend: requirement pairs attached to DMNs

**Files:**

- Modify: `packages/backend/src/types/dmn.types.ts`. Add `ServiceLink` and `requires?` / `requiredBy?` to `DmnModel`.
- Modify: `packages/backend/src/services/sparql.service.ts`:
  - add `getServiceRequirements()` next to `getVendorCounts` (~l.871);
  - call it in `getAllDmns` next to `getVendorCounts` (~l.248);
  - attach the results after the inputs/outputs loop (~l.310–320), before caching.
- Modify test: `packages/backend/src/services/sparql.service.test.ts`. Extend `respondWith` with a `requires` set, routed on `query.includes('dct:requires')` (before the `main` fallback).

**Interfaces:**

- Produces (`dmn.types.ts`):
  ```ts
  export interface ServiceLink { service: string; title?: string; dmnIdentifier?: string }
  // on DmnModel:
  requires?: ServiceLink[];   // services this DMN's service dct:requires
  requiredBy?: ServiceLink[]; // services that dct:require this DMN's service
  ```
- Produces (`SparqlService`):
  `async getServiceRequirements(endpoint?: string): Promise<Array<{ service: string; serviceTitle?: string; required: string; requiredTitle?: string }>>`.
  - It deduplicates on `(service, required)`, keeping the first title seen.
  - It drops self-pairs.
  - It resolves to `[]` on any error, logged with `logger.warn` as in `getVendorCounts`.
- Query (verbatim):

  ```sparql
  PREFIX dct: <http://purl.org/dc/terms/>
  SELECT ?service ?serviceTitle ?required ?requiredTitle WHERE {
    ?service dct:requires ?required .
    OPTIONAL { ?service dct:title ?serviceTitle }
    OPTIONAL { ?required dct:title ?requiredTitle }
  }
  ```

- [ ] **Step 1: Write the failing tests** in a new `describe('getAllDmns service requirements', …)` and a `describe('getServiceRequirements', …)`.

  Fixtures:
  - `HOOGTE_SVC` and `RECHT_SVC` service URIs, each the `service` of one DMN row (`dmnRow({ dmn, identifier, title, service, serviceTitle })`), with identifiers `BehaalbareHoogteSubsidie` and `RechtOpSubsidieThuisbatterij`.
  - One requires row: `{ service: HOOGTE_SVC, serviceTitle: 'hoogte …', required: RECHT_SVC, requiredTitle: 'recht …' }`.

  Tests:
  - `attaches requires to the dependent DMN and requiredBy to the required one`:
    - hoogte's DMN has `requires: [{ service: RECHT_SVC, title: 'recht …', dmnIdentifier: 'RechtOpSubsidieThuisbatterij' }]` and no `requiredBy`;
    - recht's DMN has `requiredBy: [{ service: HOOGTE_SVC, title: 'hoogte …', dmnIdentifier: 'BehaalbareHoogteSubsidie' }]` and no `requires`.
  - `a required service without a DMN is still listed, without dmnIdentifier` (Review Focus #1): required `https://example.org/services/elsewhere`, no title, so the entry is `{ service: 'https://example.org/services/elsewhere' }`.
  - `duplicate title rows do not duplicate links` (Review Focus #2): two rows for the same pair with different `requiredTitle` give one entry, with the first title.
  - `a self-link is ignored` (Review Focus #4): `{ service: HOOGTE_SVC, required: HOOGTE_SVC }` gives no `requires` / `requiredBy` on hoogte.
  - `without dct:requires in the data, no DMN carries the keys` (Review Focus #5): `expect(dmn).not.toHaveProperty('requires')` and `not.toHaveProperty('requiredBy')`.
  - `a failing requirements query still returns the DMN list` (Review Focus #3): `mockPost` rejects only for queries containing `dct:requires`. Then `getAllDmns()` resolves with the DMN, and neither key is present.
  - `getServiceRequirements` parses rows into pairs, and degrades to `[]` on rejection.

- [ ] **Step 2: Run to verify they fail**

  Run: `npm test --workspace=@linked-data-explorer/backend -- src/services/sparql.service.test.ts --coverage=false`
  Expected: FAIL. `getServiceRequirements` is not a function, and `requires` is undefined.

- [ ] **Step 3: Implement**
  - Add the type and the method.
  - In `getAllDmns`, `const requirements = await this.getServiceRequirements(targetEndpoint);`.
  - After the per-DMN loop, attach the links:
    - build `serviceToDmn: Map<serviceUri, identifier>` (first DMN per service);
    - for each DMN with a `service`, set `requires` / `requiredBy` from the pairs whose `service` / `required` equals it, mapping the _other_ end to a `ServiceLink` (`title` from the query, `dmnIdentifier` from `serviceToDmn`);
    - set a key only when its array is non-empty.

- [ ] **Step 4: Run to verify they pass, plus the whole backend suite**

  Run: `npm test --workspace=@linked-data-explorer/backend`
  Expected: PASS, with coverage thresholds met. Existing `getAllDmns` / caching tests are unchanged.

- [ ] **Step 5: Lint and format**

  Run: `npm run lint --workspace=@linked-data-explorer/backend && npm run check-format --workspace=@linked-data-explorer/backend`
  Expected: clean.

- [ ] **Step 6: Commit** (ask the user first): `feat(dmns): attach dct:requires links to each DMN as requires / requiredBy (ttl-editor#223)`

---

### Task 2: OpenAPI contract

**Files:**

- Modify: `packages/backend/openapi/openapi.yaml`. Add a `ServiceLink` schema under `components/schemas`, and the optional properties `requires` and `requiredBy` (`type: array`, `items: $ref ServiceLink`) on `DmnModel` (~l.6227). Leave `required` as it is.
- Test: `packages/backend/src/routes/dmn.routes.test.ts`. The existing `expectToMatchOperation(res, 'get', '/dmns')` (~l.1136) must pass with a DMN carrying both lists.

**Interfaces:**

- Consumes: Task 1's `ServiceLink` shape.
- `ServiceLink` schema: `type: object`, `required: [service]`, properties `service`, `title` and `dmnIdentifier`, all `string`. Use `additionalProperties: false` only if the neighbouring schemas do.

- [ ] **Step 1: Write the failing test.** In `dmn.routes.test.ts`, add a case where the mocked service returns a DMN with `requires` and `requiredBy`, and assert `expectToMatchOperation(res, 'get', '/dmns')`. _(If the schema is open, so that unknown properties already pass, the test passes before the change. Note that as a ruling and keep it as a regression guard.)_

- [ ] **Step 2: Run it**

  Run: `npm run test:contract --workspace=@linked-data-explorer/backend`
  Expected: FAIL, or PASS with a recorded ruling (see Step 1).

- [ ] **Step 3: Implement** the schema change, then run `npm run build:openapi --workspace=@linked-data-explorer/backend`.

- [ ] **Step 4: Verify**

  Run: `npm run test:contract --workspace=@linked-data-explorer/backend && npm run lint:openapi --workspace=@linked-data-explorer/backend`
  Expected: PASS, with no Spectral errors.

- [ ] **Step 5: Commit** (ask the user first): `docs(openapi): document requires / requiredBy on DmnModel (ttl-editor#223)`

---

### Task 3: Frontend: show the links

**Files:**

- Modify: `packages/frontend/src/types/index.ts` (~l.78–106). Add `ServiceLink` and `requires?` / `requiredBy?` to `DmnModel`, mirroring the backend.
- Create: `packages/frontend/src/components/ServiceLinks/ServiceLinks.tsx` and `ServiceLinks.test.tsx`.
- Modify: `packages/frontend/src/components/ChainBuilder/DmnList.tsx`. Render after the organisation line (~l.122).
- Modify: `packages/frontend/src/components/BpmnModeler/DmnTemplateSelector.tsx`. In the info box, before "Decision Ref:" (~l.190), render only for a regular DMN (`selectedDmn`), not for a DRD.
- Modify tests: `DmnList.test.tsx` and `DmnTemplateSelector.test.tsx`, one case each.

**Interfaces:**

- Produces:
  - `serviceLinkName(link: ServiceLink): string`: `dmnIdentifier || title || last non-empty path segment of service || service`. Exported from `ServiceLinks.tsx`.
  - `ServiceLinks({ requires, requiredBy, className }: { requires?: ServiceLink[]; requiredBy?: ServiceLink[]; className?: string })`:
    - renders `null` when both are empty or absent;
    - otherwise one `div` per non-empty list, with the exact copy **"Requires: "** / **"Required by: "** followed by the names joined with `", "`;
    - each name has `title={link.service}`;
    - styling: `text-xs text-slate-500`, like the card's other secondary lines.

- [ ] **Step 1: Write the failing tests.**
  - `ServiceLinks.test.tsx`:
    - `serviceLinkName` follows the fallback order for the identifier, the title and the URI tail. For the tail, `https://regels.overheid.nl/services/recht-op-subsidie-thuisbatterij-flevoland` gives `recht-op-subsidie-thuisbatterij-flevoland`.
    - Both lines render with the joined names.
    - Only the non-empty line renders.
    - The component renders nothing for empty or absent lists.
  - `DmnList.test.tsx`: a DMN with `requires: [{ service: RECHT, dmnIdentifier: 'RechtOpSubsidieThuisbatterij' }]` shows `Requires: RechtOpSubsidieThuisbatterij`. A DMN without the key shows no "Requires:".
  - `DmnTemplateSelector.test.tsx`: select a DMN whose `/v1/dmns` entry has `requiredBy`, and the info box shows `Required by: BehaalbareHoogteSubsidie`.

- [ ] **Step 2: Run to verify they fail**

  Run: `npx vitest run --root packages/frontend src/components/ServiceLinks src/components/ChainBuilder/DmnList.test.tsx src/components/BpmnModeler/DmnTemplateSelector.test.tsx`
  Expected: FAIL. The module is missing, and the text isn't found.

- [ ] **Step 3: Implement** the type, the component and the two placements.

- [ ] **Step 4: Verify**

  Run: `npm test --workspace=@linked-data-explorer/frontend && npm run typecheck --workspace=@linked-data-explorer/frontend && npm run lint --workspace=@linked-data-explorer/frontend && npm run check-format --workspace=@linked-data-explorer/frontend`
  Expected: all pass.

- [ ] **Step 5: Commit** (ask the user first): `feat(ui): show requires / required by on DMN cards and in the BPMN link panel (ttl-editor#223)`

---

### Task 4: User acceptance and PR

- [ ] **Step 1: Live backend check.** Read-only, against the user's running backend: `curl -s "http://localhost:3001/v1/dmns?endpoint=https://api.open-regels.triply.cc/datasets/stevengort/PublishTest/services/PublishTest/sparql&refresh=true"`.
  - Expected:
    - `BehaalbareHoogteSubsidie` carries `requires: [{ service: …/recht-op-subsidie-thuisbatterij-flevoland, title: 'recht subsidie thuisbatterij Flevoland', dmnIdentifier: 'RechtOpSubsidieThuisbatterij' }]`;
    - `RechtOpSubsidieThuisbatterij` carries the matching `requiredBy`.
  - If the backend runs old code, **ask the user to restart it**. Never restart it yourself.
- [ ] **Step 2: Hand off to the user.**
  - **Full suites:** `npm test` at the root (both workspaces).
  - **UI check, after "Refresh Cache" in LDE:**
    - the Chain Builder cards show "Requires: RechtOpSubsidieThuisbatterij" on hoogte and "Required by: BehaalbareHoogteSubsidie" on recht;
    - the BPMN "Link to DMN/DRD" info box shows the same for the selected DMN.
- [ ] **Step 3: Final whole-branch review** (fresh reviewer, most capable model), then the fix pass, as in PR 1.
- [ ] **Step 4: Push and open the PR to `acc`** once the user confirms.
  - The body refers to sgort/ttl-editor#223 without closing keywords.
  - Check with `gh pr view <n> --json closingIssuesReferences` that the list is empty.
