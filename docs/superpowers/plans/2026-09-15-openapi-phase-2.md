# OpenAPI Phase 2 (#134) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fully describe the 20 `/v1` operations under `cache`, `norms`, `triplydb` and `dmns` in the OpenAPI document, prove each against real responses, and empty those entries from `pending.json`.

**Architecture:** Each task adds a mount group's paths and schemas to `packages/backend/openapi/openapi.yaml`, removes the group's entries from `openapi/pending.json`, lowers the pending ceiling, records any design-rules exceptions in `openapi/.spectral.yaml`, and adds a new `describe` block to the group's route test that validates real handler responses with `expectToMatchOperation`. Schemas describe what the handlers actually send, taken from the source-cited inventories, not from the TypeScript types where the two differ.

**Tech Stack:** Express 4.22, TypeScript, Jest + supertest, Ajv 2020-12 (via `expectToMatchOperation`), Spectral with the vendored NL API Design Rules 2.2.1 ruleset.

**Spec:** `docs/superpowers/specs/2026-09-15-openapi-description-design.md` (phase 1 plan, for conventions: `docs/superpowers/plans/2026-09-15-openapi-phase-1.md`)

## Global Constraints

- **Describe, don't change.** No handler, service or middleware changes. Where a schema and a handler disagree, correct the schema to the handler, never the reverse.
- **Real shapes, not TypeScript types.** Where the inventory says a field is always sent, it is `required`. Where the knowledge graph supplies a value the code does not check (`testStatus`, `validationStatus`, `DmnVariable.type`, dates), use `type: string` with a `description` naming the usual values. Never an `enum` the code does not enforce.
- **No closed schemas.** Do not add `additionalProperties: false` in phase 2.
- **Open data stays open.** Maps keyed by data values use `additionalProperties: <schema>`. Objects whose keys vary by CPRMV version (`/norms` rules) are `type: object` with a description.
- **Headers.** Every documented 2xx and 3xx response declares `API-Version: $ref: '#/components/headers/ApiVersion'`.
- **Malformed JSON.** A POST body that is not valid JSON reaches the global error handler and is answered `500` with `ErrorEnvelope` (#143). Every POST's `500` response must allow `ErrorEnvelope`.
- **Envelopes as they are.**
  - The triplydb router uses its own error shape, `TriplyDbError`.
  - `POST /dmns/evaluate/{decisionKey}` passes Operaton's body and status through, and uses `OperatonProxyError` for non-HTTP failures.
  - `GET /triplydb/health` has no `success` field.
- **Lint exceptions agreed for phase 2**, in addition to phase 1's four. Nothing else:
  - `nlgov:problem-invalid-input` off for exactly: `DELETE /cache/clear`, `GET /dmns`, `GET /dmns/semantic-equivalences`, `GET /dmns/enhanced-chain-links`, `GET /dmns/cycles`, `GET /dmns/{identifier}`, `GET /dmns/{identifier}/xml`, `POST /dmns/evaluate/{decisionKey}`.
  - `nlgov:query-keys-camel-case` off for exactly `GET /norms`.
- **Ceiling.** `PENDING_CEILING` in `src/openapi/coverage.test.ts` goes from 62 to 59 (Task 1), 53 (Task 2), 47 (Task 3), then 42 (Task 4).
- **YAML placement.**
  - New path items go directly above the top-level line `components:` in `openapi.yaml`.
  - New schemas are appended at the end of the file, under `components.schemas`, at 4-space indentation, like `NamedArtefact`.
  - Existing tags are `Health & monitoring`, `Discovery` and `Assets`; add none.
- **Tests.** Add a new `describe` block at the end of the route test file. Do not modify existing tests except where a step says so. Run Jest from `packages/backend`: `npx jest --config jest.config.js <files> --coverage=false`. The full suite belongs to the user: `npm test --workspace=packages/backend`.
- **Style.** Code follows `packages/backend/.prettierrc`: single quotes, 100 columns, ES5 trailing commas.
- **Paths.** `git` commands run from the repository root; `npm run` and `npx` from `packages/backend`.
- **Commits.** The implementer stages and never commits. The controller commits after a clean review (approved by the user for phase 2). Never push. Never `--no-verify`, and never bypass or edit a hook.
- **Servers and subagents.** Never start, stop or restart a dev server. Implementers dispatch no subagents.
- **Attribution.** No attribution to Claude anywhere.

---

### Task 1: `/cache` and `/norms`

**Files:**

- Modify: `packages/backend/openapi/openapi.yaml`
- Modify: `packages/backend/openapi/pending.json`
- Modify: `packages/backend/openapi/.spectral.yaml`
- Modify: `packages/backend/src/openapi/coverage.test.ts`
- Modify: `packages/backend/src/routes/cache.routes.test.ts`
- Modify: `packages/backend/src/routes/norms.routes.test.ts`

**Interfaces:**

- Consumes: `expectToMatchOperation(res, method, path, document?)` from `src/openapi/testing/conformance.ts`; `versionMiddleware` from `src/middleware/version.middleware.ts`; `ErrorEnvelope` and `ApiVersion` from `openapi.yaml`.
- Produces: document operations `GET /cache/stats`, `DELETE /cache/clear`, `GET /norms`; schemas `CacheStats`, `NormsResult`, `DatasetVersion`.

- [ ] **Step 1: Correct the cache stats fixture and add the failing conformance tests**

In `packages/backend/src/routes/cache.routes.test.ts`, inside the existing test `returns the cache statistics the SPARQL service reports`, the mocked value and the expected `data` are both an array of `{ endpoint, ageSeconds, entries }`. That shape does not exist in the service: `SparqlService.getCacheStats()` returns a map keyed by endpoint URL (`sparql.service.ts:1036-1049`). Replace both the mocked value and the expected `data` with:

```ts
{ 'https://triplydb.example/sparql': { age: 42, count: 7 } }
```

The new tests below mock `getCacheStats` and `clearCache` as synchronous: `mockReturnValue`, and `mockImplementation(() => { throw … })` for failures. First check how the existing tests `returns the cache statistics the SPARQL service reports` and `returns 500 with a CACHE_ERROR code when the service throws` mock them. If they use `mockResolvedValue` or `mockRejectedValue`, use the same style in the new tests, and note the change in the report.

Add these two imports directly after `import cacheRoutes from './cache.routes';`:

```ts
import { versionMiddleware } from '../middleware/version.middleware';
import { expectToMatchOperation } from '../openapi/testing/conformance';
```

Append at the end of the file:

```ts
describe('/v1/cache matches its OpenAPI description', () => {
  function makeDocumentedApp() {
    const app = express();
    app.use(versionMiddleware); // app-wide in index.ts
    app.use('/v1/cache', cacheRoutes);
    return app;
  }

  test('GET /cache/stats reports entries keyed by endpoint URL', async () => {
    mockGetCacheStats.mockReturnValue({
      'https://triplydb.example/sparql': { age: 42, count: 7 },
      'https://other.example/sparql': { age: 0, count: 0 },
    });

    const res = await request(makeDocumentedApp()).get('/v1/cache/stats');

    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'get', '/cache/stats');
  });

  test('GET /cache/stats with nothing cached', async () => {
    mockGetCacheStats.mockReturnValue({});

    const res = await request(makeDocumentedApp()).get('/v1/cache/stats');

    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'get', '/cache/stats');
  });

  test('a stats entry in another shape does not match the description', async () => {
    mockGetCacheStats.mockReturnValue({
      'https://triplydb.example/sparql': { ageSeconds: 42, entries: 7 },
    });

    const res = await request(makeDocumentedApp()).get('/v1/cache/stats');

    expect(() => expectToMatchOperation(res, 'get', '/cache/stats')).toThrow(
      /must have required property 'age'/
    );
  });

  test('GET /cache/stats 500, as documented', async () => {
    mockGetCacheStats.mockImplementation(() => {
      throw new Error('cache backend unavailable');
    });

    const res = await request(makeDocumentedApp()).get('/v1/cache/stats');

    expect(res.status).toBe(500);
    expectToMatchOperation(res, 'get', '/cache/stats');
  });

  test.each([
    ['for every endpoint', '/v1/cache/clear'],
    ['for one endpoint', '/v1/cache/clear?endpoint=https%3A%2F%2Ftriplydb.example%2Fsparql'],
  ])('DELETE /cache/clear %s, as documented', async (_label, url) => {
    const res = await request(makeDocumentedApp()).delete(url);

    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'delete', '/cache/clear');
  });

  test('DELETE /cache/clear 500, as documented', async () => {
    mockClearCache.mockImplementation(() => {
      throw new Error('cache is locked');
    });

    const res = await request(makeDocumentedApp()).delete('/v1/cache/clear');

    expect(res.status).toBe(500);
    expectToMatchOperation(res, 'delete', '/cache/clear');
  });
});
```

In `packages/backend/src/routes/norms.routes.test.ts`, add the same two imports directly after `import packageJson from '../../package.json';`, then append at the end of the file:

```ts
describe('/v1/norms matches its OpenAPI description', () => {
  function makeDocumentedApp() {
    const app = express();
    app.use(versionMiddleware); // app-wide in index.ts
    app.use('/v1/norms', normsRoutes);
    return app;
  }

  test('200 without filters, as documented', async () => {
    mockGetAllNorms.mockResolvedValue(normsResult());

    const res = await request(makeDocumentedApp()).get('/v1/norms');

    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'get', '/norms');
  });

  test('200 with every filter, as documented', async () => {
    mockGetAllNorms.mockResolvedValue(normsResult());

    const res = await request(makeDocumentedApp()).get(
      '/v1/norms?rulesetid=awb&applicable_date=2026-01-01&cprmv_version=0.4.1'
    );

    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'get', '/norms');
  });

  test('400 for an unsupported cprmv_version, as documented', async () => {
    const res = await request(makeDocumentedApp()).get('/v1/norms?cprmv_version=9.9.9');

    expect(res.status).toBe(400);
    expectToMatchOperation(res, 'get', '/norms');
  });

  test('500 when the rules query fails, as documented', async () => {
    mockGetAllNorms.mockRejectedValue(new Error('SPARQL endpoint unreachable'));

    const res = await request(makeDocumentedApp()).get('/v1/norms');

    expect(res.status).toBe(500);
    expectToMatchOperation(res, 'get', '/norms');
  });
});
```

Then add one more test inside that new `describe`, for the 304 response. Name it `304 on a matching conditional request, as documented`.

- Copy the mock setup (the `mockGetDatasetVersions`, `mockEtag` and `mockLastModified` calls) and the request line verbatim from the existing test `answers 304 without running the expensive rules query`.
- Send the request through `request(makeDocumentedApp())` instead of `request(makeApp())`.
- Finish with `expect(res.status).toBe(304);` and `expectToMatchOperation(res, 'get', '/norms');`.

- [ ] **Step 2: Run the tests to verify they fail**

Run from `packages/backend`: `npx jest --config jest.config.js src/routes/cache.routes.test.ts src/routes/norms.routes.test.ts --coverage=false`

Expected:

- the new conformance tests FAIL with `GET /cache/stats is not documented`, `DELETE /cache/clear is not documented` and `GET /norms is not documented`;
- the existing tests, including the corrected stats test, PASS.

The negative test (`a stats entry in another shape…`) also fails at this point, because the operation is not documented yet.

- [ ] **Step 3: Describe the three operations**

In `packages/backend/openapi/openapi.yaml`, insert directly above the top-level line `components:`:

```yaml
  /cache/stats:
    get:
      operationId: getCacheStats
      tags: [Health & monitoring]
      summary: SPARQL result cache statistics per endpoint
      description: >-
        One entry per SPARQL endpoint whose DMN list is currently cached, keyed
        by the endpoint URL. An empty object means nothing is cached.
      responses:
        '200':
          description: The cache statistics.
          headers:
            API-Version:
              $ref: '#/components/headers/ApiVersion'
          content:
            application/json:
              schema:
                type: object
                required: [success, data, timestamp]
                properties:
                  success:
                    const: true
                  data:
                    $ref: '#/components/schemas/CacheStats'
                  timestamp:
                    type: string
                    format: date-time
        '500':
          description: The statistics could not be read (code CACHE_ERROR).
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  /cache/clear:
    delete:
      operationId: clearCache
      tags: [Health & monitoring]
      summary: Clear the SPARQL result cache
      description: >-
        Clears the cache for one endpoint when `endpoint` is given and not empty,
        otherwise for every endpoint.
      parameters:
        - name: endpoint
          in: query
          required: false
          description: SPARQL endpoint URL whose cache to clear. Omitted or empty clears all.
          schema:
            type: string
      responses:
        '200':
          description: The cache was cleared.
          headers:
            API-Version:
              $ref: '#/components/headers/ApiVersion'
          content:
            application/json:
              schema:
                type: object
                required: [success, data, timestamp]
                properties:
                  success:
                    const: true
                  data:
                    type: object
                    required: [message, endpoint]
                    properties:
                      message:
                        type: string
                        examples: [All caches cleared]
                      endpoint:
                        type: string
                        description: The endpoint whose cache was cleared, or `all`.
                  timestamp:
                    type: string
                    format: date-time
        '500':
          description: The cache could not be cleared (code CACHE_ERROR).
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  /norms:
    get:
      operationId: listNorms
      tags: [Discovery]
      summary: Published rules (norms) with their dataset versions
      description: >-
        Rules published to TriplyDB, optionally filtered by ruleset and
        applicable date, in the vocabulary of the requested CPRMV version. When
        every ruleset in the result has dataset metadata, the response carries
        `ETag` and `Cache-Control: public, max-age=3600`, and a matching
        conditional request is answered 304; otherwise `Cache-Control: no-cache`.
        The `endpoint` override is not validated (#142).
      parameters:
        - name: rulesetid
          in: query
          required: false
          description: Only rules of this ruleset.
          schema:
            type: string
            pattern: '^[A-Za-z0-9_-]+$'
        - name: applicable_date
          in: query
          required: false
          description: Only rules applicable on this date, as YYYY-MM-DD. The shape is checked, not the calendar.
          schema:
            type: string
            pattern: '^\d{4}-\d{2}-\d{2}$'
        - name: cprmv_version
          in: query
          required: false
          description: CPRMV vocabulary version for the rule keys.
          schema:
            type: string
            enum: ['0.3.0', '0.3.2', '0.4.1']
            default: '0.3.0'
        - name: endpoint
          in: query
          required: false
          description: SPARQL endpoint URL to query instead of the configured one.
          schema:
            type: string
      responses:
        '200':
          description: The matching rules.
          headers:
            API-Version:
              $ref: '#/components/headers/ApiVersion'
            ETag:
              description: Present when every ruleset in the result has dataset metadata.
              schema:
                type: string
            Last-Modified:
              description: Present with `ETag` when the latest publication date is known.
              schema:
                type: string
            Cache-Control:
              description: '`public, max-age=3600` with `ETag`, otherwise `no-cache`.'
              schema:
                type: string
          content:
            application/json:
              schema:
                type: object
                required: [success, data, timestamp]
                properties:
                  success:
                    const: true
                  data:
                    $ref: '#/components/schemas/NormsResult'
                  timestamp:
                    type: string
                    format: date-time
        '304':
          description: Not modified since the conditional request's `ETag` or date.
          headers:
            API-Version:
              $ref: '#/components/headers/ApiVersion'
            ETag:
              description: The unchanged entity tag.
              schema:
                type: string
            Cache-Control:
              description: '`public, max-age=3600`.'
              schema:
                type: string
        '400':
          description: A query parameter is invalid (code INVALID_PARAM).
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '500':
          description: The rules could not be queried (code QUERY_ERROR).
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
```

Append at the end of the file, under `components.schemas`:

```yaml
    CacheStats:
      type: object
      description: >-
        SPARQL result cache entries keyed by endpoint URL. `age` is the number of
        seconds since the entry was cached; `count` is the number of cached DMN
        records.
      additionalProperties:
        type: object
        required: [age, count]
        properties:
          age:
            type: integer
            minimum: 0
          count:
            type: integer
            minimum: 0
    NormsResult:
      type: object
      required: [total, dataset_versions, cprmv_version, aggregations, rules]
      properties:
        total:
          type: integer
          minimum: 0
          description: Number of rules in `rules`.
        dataset_versions:
          type: object
          description: Published dataset versions per ruleset id, newest first.
          additionalProperties:
            type: array
            items:
              $ref: '#/components/schemas/DatasetVersion'
        cprmv_version:
          type: string
          description: The CPRMV version the rule keys use.
          examples: ['0.3.0']
        aggregations:
          type: object
          required: [norms_per_rulesetid]
          properties:
            norms_per_rulesetid:
              type: object
              description: Number of rules per ruleset id.
              additionalProperties:
                type: integer
                minimum: 0
        rules:
          type: array
          description: >-
            Published rules. A rule's keys are IRIs in the requested CPRMV
            version's namespace (for example
            `https://cprmv.open-regels.nl/0.3.0/id`), plus `rulesetid`,
            `applicable_date`, `rulesetid_index`, `rule_id_path` and
            `rule_id_path_key`. A nested `contains` map, keyed by rule id, is
            present when the rule has children. The key set varies by version,
            so rules are described as open objects.
          items:
            type: object
    DatasetVersion:
      type: object
      required: [version, published_at, title]
      properties:
        version:
          type: [string, 'null']
          description: Null for rulesets other than the primary one.
        published_at:
          type: string
          description: Publication date as published in TriplyDB, normally ISO 8601; not reformatted.
        title:
          type: [string, 'null']
          description: Null for rulesets other than the primary one.
```

- [ ] **Step 4: Remove the entries and lower the ceiling**

In `packages/backend/openapi/pending.json`, delete exactly these three lines:

```
  "DELETE /cache/clear",
  "GET /cache/stats",
  "GET /norms",
```

In `packages/backend/src/openapi/coverage.test.ts`, change `const PENDING_CEILING = 62;` to `const PENDING_CEILING = 59;`.

- [ ] **Step 5: Record the two exceptions**

In `packages/backend/openapi/.spectral.yaml`, append to the end of the `overrides:` list, at the same indentation as the existing `/ropa/public` entry:

```yaml
  # DELETE /cache/clear takes one optional parameter, a free-text endpoint whose
  # empty value means "all". No value is invalid, so the handler never answers 400.
  - files:
      - 'openapi.json#/paths/~1cache~1clear/delete'
    rules:
      nlgov:problem-invalid-input: 'off'

  # GET /norms names two query parameters in snake_case (applicable_date,
  # cprmv_version). Renaming them would break existing callers, so the document
  # describes them as they are.
  - files:
      - 'openapi.json#/paths/~1norms/get'
    rules:
      nlgov:query-keys-camel-case: 'off'
```

- [ ] **Step 6: Verify**

Run from `packages/backend`:

```bash
npx jest --config jest.config.js src/routes/cache.routes.test.ts src/routes/norms.routes.test.ts src/openapi --coverage=false
npm run lint:openapi
npm run typecheck && npm run lint && npm run check-format
node -e "console.log(require('./openapi/pending.json').length)"
```

Expected:

- every suite passes, including the coverage gate at ceiling 59;
- `lint:openapi` exits 0;
- typecheck, lint and format are clean;
- the pending count prints `59`.

Prove each new exception is load-bearing and narrow. Work from a copy: `cp openapi/.spectral.yaml openapi/.spectral.yaml.orig`. For each of the two new override entries:

1. Delete that entry and run `npm run lint:openapi`.
2. Expect exit 1, with a finding reported only at that operation: `nlgov:problem-invalid-input` at `paths./cache/clear.delete`, or `nlgov:query-keys-camel-case` at `paths./norms.get` for `applicable_date` and `cprmv_version`.
3. Restore with `cp openapi/.spectral.yaml.orig openapi/.spectral.yaml`.

Finally run `rm openapi/.spectral.yaml.orig`.

If a schema test fails with `does not match the document`, the message names the property. Check the handler and inventory facts in the task brief, correct the schema, and record the correction in the report.

- [ ] **Step 7: Stage and stop**

```bash
git add packages/backend/openapi/openapi.yaml packages/backend/openapi/pending.json packages/backend/openapi/.spectral.yaml packages/backend/src/openapi/coverage.test.ts packages/backend/src/routes/cache.routes.test.ts packages/backend/src/routes/norms.routes.test.ts
git status --short
```

Proposed message: `docs(backend): describe /cache and /norms in OpenAPI (#134)`. Do not commit.

---

### Task 2: `/triplydb`

**Files:**

- Modify: `packages/backend/openapi/openapi.yaml`
- Modify: `packages/backend/openapi/pending.json`
- Modify: `packages/backend/src/openapi/coverage.test.ts`
- Modify: `packages/backend/src/routes/triplydb.routes.test.ts`

**Interfaces:**

- Consumes: `expectToMatchOperation`; `versionMiddleware`; `errorHandler` from `src/middleware/error.middleware.ts`; `ErrorEnvelope`, `ApiVersion`.
- Produces: document operations `POST /triplydb/query`, `POST /triplydb/update-service`, `POST /triplydb/list-graphs`, `POST /triplydb/test-connection`, `GET /triplydb/assets`, `GET /triplydb/health`; schemas `TriplyDbError`, `TriplyDbConfig`, `SparqlResults`, `SparqlBinding`, `TriplyDbAsset`.

- [ ] **Step 1: Add the failing conformance tests**

In `packages/backend/src/routes/triplydb.routes.test.ts`, add directly after `import packageJson from '../../package.json';`:

```ts
import { errorHandler } from '../middleware/error.middleware';
import { versionMiddleware } from '../middleware/version.middleware';
import { expectToMatchOperation } from '../openapi/testing/conformance';
```

Append at the end of the file:

```ts
describe('/v1/triplydb matches its OpenAPI description', () => {
  function makeDocumentedApp() {
    const app = express();
    app.use(express.json());
    app.use(versionMiddleware); // app-wide in index.ts
    app.use('/v1/triplydb', triplydbRoutes);
    app.use(errorHandler); // app-wide in index.ts; answers malformed JSON bodies
    return app;
  }

  const post = (path: string) => request(makeDocumentedApp()).post(`/v1/triplydb${path}`);

  test('POST /query SELECT results, as documented', async () => {
    svc.executeQuery.mockResolvedValue({
      head: { vars: ['s', 'label'] },
      results: {
        bindings: [
          {
            s: { type: 'uri', value: 'https://regels.example/id/regel/1' },
            label: { type: 'literal', value: 'Regel', 'xml:lang': 'nl' },
          },
        ],
      },
    });

    const res = await post('/query').send({ endpoint: 'https://triplydb.example/sparql', query: 'SELECT * WHERE { ?s ?p ?o }' });

    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'post', '/triplydb/query');
  });

  test('POST /query ASK result, as documented', async () => {
    svc.executeQuery.mockResolvedValue({ head: {}, boolean: true });

    const res = await post('/query').send({ endpoint: 'https://triplydb.example/sparql', query: 'ASK { ?s ?p ?o }' });

    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'post', '/triplydb/query');
  });

  test('POST /query 400 and 500, as documented', async () => {
    const bad = await post('/query').send({});
    expect(bad.status).toBe(400);
    expectToMatchOperation(bad, 'post', '/triplydb/query');

    svc.executeQuery.mockRejectedValue(new Error('Failed to execute query: Query failed: 502'));
    const failed = await post('/query').send({ endpoint: 'https://triplydb.example/sparql', query: 'ASK {}' });
    expect(failed.status).toBe(500);
    expectToMatchOperation(failed, 'post', '/triplydb/query');
  });

  test('a malformed JSON body is a 500 ErrorEnvelope, as documented (#143)', async () => {
    const res = await post('/query').set('Content-Type', 'application/json').send('{"endpoint":');

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expectToMatchOperation(res, 'post', '/triplydb/query');
  });

  test('POST /update-service 200, 400 and 500, as documented', async () => {
    svc.updateService.mockResolvedValue({
      success: true,
      message: 'Service PublishTest updated to include 2 graphs',
      graphCount: 2,
      graphName: 'graph:a',
    });
    const ok = await post('/update-service').send({ config: CONFIG, serviceName: 'PublishTest', graphName: 'graph:a' });
    expect(ok.status).toBe(200);
    expectToMatchOperation(ok, 'post', '/triplydb/update-service');

    const bad = await post('/update-service').send({ serviceName: 'PublishTest' });
    expect(bad.status).toBe(400);
    expectToMatchOperation(bad, 'post', '/triplydb/update-service');

    svc.updateService.mockRejectedValue(new Error('Failed to update service: 403'));
    const failed = await post('/update-service').send({ config: CONFIG, serviceName: 'PublishTest' });
    expect(failed.status).toBe(500);
    expectToMatchOperation(failed, 'post', '/triplydb/update-service');
  });

  test('POST /list-graphs 200, 400 and 500, as documented', async () => {
    svc.listGraphs.mockResolvedValue(['graph:default', 'graph:default-1']);
    const ok = await post('/list-graphs').send({ config: CONFIG });
    expect(ok.status).toBe(200);
    expectToMatchOperation(ok, 'post', '/triplydb/list-graphs');

    const bad = await post('/list-graphs').send({});
    expect(bad.status).toBe(400);
    expectToMatchOperation(bad, 'post', '/triplydb/list-graphs');

    svc.listGraphs.mockRejectedValue(new Error('Failed to list graphs: 404'));
    const failed = await post('/list-graphs').send({ config: CONFIG });
    expect(failed.status).toBe(500);
    expectToMatchOperation(failed, 'post', '/triplydb/list-graphs');
  });

  test('POST /test-connection 200, 503, 400 and 500, as documented', async () => {
    svc.testConnection.mockResolvedValue(true);
    const ok = await post('/test-connection').send({ config: CONFIG });
    expect(ok.status).toBe(200);
    expectToMatchOperation(ok, 'post', '/triplydb/test-connection');

    svc.testConnection.mockResolvedValue(false);
    const refused = await post('/test-connection').send({ config: CONFIG });
    expect(refused.status).toBe(503);
    expectToMatchOperation(refused, 'post', '/triplydb/test-connection');

    const bad = await post('/test-connection').send({});
    expect(bad.status).toBe(400);
    expectToMatchOperation(bad, 'post', '/triplydb/test-connection');

    svc.testConnection.mockRejectedValue(new Error('DNS failure'));
    const failed = await post('/test-connection').send({ config: CONFIG });
    expect(failed.status).toBe(500);
    expectToMatchOperation(failed, 'post', '/triplydb/test-connection');
  });

  test('GET /assets 200, 400, upstream status and 500, as documented', async () => {
    const app = makeDocumentedApp();

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [
        {
          identifier: 'a1',
          assetName: 'logo.png',
          createdAt: '2026-01-01T00:00:00Z',
          versions: [{ id: 'v1', fileSize: 2048, url: 'https://triplydb.example/assets/logo.png' }],
        },
        { identifier: 'a2', assetName: 'empty.svg', createdAt: '2026-01-02T00:00:00Z', versions: [] },
      ],
    });
    const ok = await request(app).get('/v1/triplydb/assets?account=regels&dataset=dmn');
    expect(ok.status).toBe(200);
    expectToMatchOperation(ok, 'get', '/triplydb/assets');

    const bad = await request(app).get('/v1/triplydb/assets?account=regels');
    expect(bad.status).toBe(400);
    expectToMatchOperation(bad, 'get', '/triplydb/assets');

    mockFetch.mockResolvedValue({ ok: false, status: 403, statusText: 'Forbidden', text: async () => 'no access' });
    const forbidden = await request(app).get('/v1/triplydb/assets?account=regels&dataset=dmn');
    expect(forbidden.status).toBe(403);
    expectToMatchOperation(forbidden, 'get', '/triplydb/assets');

    mockFetch.mockRejectedValue(new Error('ENOTFOUND'));
    const failed = await request(app).get('/v1/triplydb/assets?account=regels&dataset=dmn');
    expect(failed.status).toBe(500);
    expectToMatchOperation(failed, 'get', '/triplydb/assets');
  });

  test('GET /health 200, as documented', async () => {
    const res = await request(makeDocumentedApp()).get('/v1/triplydb/health');

    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'get', '/triplydb/health');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run from `packages/backend`: `npx jest --config jest.config.js src/routes/triplydb.routes.test.ts --coverage=false`

Expected:

- every new conformance test FAILS with `<METHOD> /triplydb/<path> is not documented`;
- the existing tests PASS.

- [ ] **Step 3: Describe the six operations**

Insert directly above the top-level line `components:` in `openapi.yaml`:

```yaml
  /triplydb/query:
    post:
      operationId: queryTriplyDb
      tags: [Discovery]
      summary: Run a SPARQL query against a caller-supplied endpoint
      description: >-
        Forwards `query` to `endpoint` and returns the endpoint's SPARQL JSON
        results beside `success`, without a `data` wrapper. The endpoint is not
        validated (#142).
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [endpoint, query]
              properties:
                endpoint:
                  type: string
                  description: SPARQL endpoint URL.
                query:
                  type: string
                  description: SPARQL query text.
      responses:
        '200':
          description: The endpoint's results.
          headers:
            API-Version:
              $ref: '#/components/headers/ApiVersion'
          content:
            application/json:
              schema:
                allOf:
                  - $ref: '#/components/schemas/SparqlResults'
                  - type: object
                    required: [success]
                    properties:
                      success:
                        const: true
        '400':
          description: '`endpoint` or `query` is missing.'
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/TriplyDbError'
        '500':
          description: >-
            The query failed (`TriplyDbError`), or the request body was not valid
            JSON (`ErrorEnvelope`, INTERNAL_ERROR; #143).
          content:
            application/json:
              schema:
                anyOf:
                  - $ref: '#/components/schemas/TriplyDbError'
                  - $ref: '#/components/schemas/ErrorEnvelope'
  /triplydb/update-service:
    post:
      operationId: updateTriplyDbService
      tags: [Discovery]
      summary: Sync a TriplyDB service to include every graph of its dataset
      description: >-
        Changes remote state. The caller supplies the TriplyDB instance and its
        credentials, which are not validated (#142).
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [config, serviceName]
              properties:
                config:
                  $ref: '#/components/schemas/TriplyDbConfig'
                serviceName:
                  type: string
                graphName:
                  type: string
                  description: Echoed back in the response when given.
      responses:
        '200':
          description: The service was updated.
          headers:
            API-Version:
              $ref: '#/components/headers/ApiVersion'
          content:
            application/json:
              schema:
                type: object
                required: [success, message, graphCount]
                properties:
                  success:
                    const: true
                  message:
                    type: string
                  graphCount:
                    type: integer
                    minimum: 0
                  graphName:
                    type: string
        '400':
          description: >-
            `config` or `serviceName` is missing, or `config` lacks `baseUrl`,
            `account`, `dataset` or `apiToken`.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/TriplyDbError'
        '500':
          description: >-
            The update failed (`TriplyDbError`), or the request body was not valid
            JSON (`ErrorEnvelope`, INTERNAL_ERROR; #143).
          content:
            application/json:
              schema:
                anyOf:
                  - $ref: '#/components/schemas/TriplyDbError'
                  - $ref: '#/components/schemas/ErrorEnvelope'
  /triplydb/list-graphs:
    post:
      operationId: listTriplyDbGraphs
      tags: [Discovery]
      summary: List the graph names of a TriplyDB dataset
      description: The caller supplies the TriplyDB instance and its credentials, which are not validated (#142).
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [config]
              properties:
                config:
                  $ref: '#/components/schemas/TriplyDbConfig'
      responses:
        '200':
          description: The dataset's graph names.
          headers:
            API-Version:
              $ref: '#/components/headers/ApiVersion'
          content:
            application/json:
              schema:
                type: object
                required: [success, graphs, count]
                properties:
                  success:
                    const: true
                  graphs:
                    type: array
                    items:
                      type: string
                  count:
                    type: integer
                    minimum: 0
        '400':
          description: '`config` is missing or lacks `baseUrl`, `account`, `dataset` or `apiToken`.'
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/TriplyDbError'
        '500':
          description: >-
            Listing failed (`TriplyDbError`), or the request body was not valid
            JSON (`ErrorEnvelope`, INTERNAL_ERROR; #143).
          content:
            application/json:
              schema:
                anyOf:
                  - $ref: '#/components/schemas/TriplyDbError'
                  - $ref: '#/components/schemas/ErrorEnvelope'
  /triplydb/test-connection:
    post:
      operationId: testTriplyDbConnection
      tags: [Discovery]
      summary: Check that a TriplyDB dataset is reachable with the given settings
      description: >-
        Only the presence of `config` is checked; incomplete settings surface as a
        failed connection (503). The target is not validated (#142).
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [config]
              properties:
                config:
                  type: object
                  description: TriplyDB connection settings (`baseUrl`, `account`, `dataset`, `apiToken`).
      responses:
        '200':
          description: The dataset answered.
          headers:
            API-Version:
              $ref: '#/components/headers/ApiVersion'
          content:
            application/json:
              schema:
                type: object
                required: [success, message, status]
                properties:
                  success:
                    const: true
                  message:
                    type: string
                    examples: [Connection successful]
                  status:
                    const: 200
        '400':
          description: '`config` is missing.'
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/TriplyDbError'
        '500':
          description: >-
            The check itself failed (`TriplyDbError`), or the request body was not
            valid JSON (`ErrorEnvelope`, INTERNAL_ERROR; #143).
          content:
            application/json:
              schema:
                anyOf:
                  - $ref: '#/components/schemas/TriplyDbError'
                  - $ref: '#/components/schemas/ErrorEnvelope'
        '503':
          description: The dataset did not answer. This body uses `message`, not `error`.
          content:
            application/json:
              schema:
                type: object
                required: [success, message, status]
                properties:
                  success:
                    const: false
                  message:
                    type: string
                    examples: [Connection failed]
                  status:
                    const: 503
  /triplydb/assets:
    get:
      operationId: listTriplyDbAssets
      tags: [Discovery]
      summary: List the assets of a dataset on the Open Regels TriplyDB instance
      description: >-
        Queries `https://api.open-regels.triply.cc`. A private dataset needs
        `apiToken`, which this operation takes in the query string (#142).
      parameters:
        - name: account
          in: query
          required: true
          schema:
            type: string
        - name: dataset
          in: query
          required: true
          schema:
            type: string
        - name: apiToken
          in: query
          required: false
          description: Bearer token for a private dataset.
          schema:
            type: string
      responses:
        '200':
          description: The dataset's assets.
          headers:
            API-Version:
              $ref: '#/components/headers/ApiVersion'
          content:
            application/json:
              schema:
                type: object
                required: [success, assets, count]
                properties:
                  success:
                    const: true
                  assets:
                    type: array
                    items:
                      $ref: '#/components/schemas/TriplyDbAsset'
                  count:
                    type: integer
                    minimum: 0
        '400':
          description: '`account` or `dataset` is missing.'
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/TriplyDbError'
        '500':
          description: TriplyDB could not be reached.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/TriplyDbError'
        default:
          description: TriplyDB rejected the request; its HTTP status is passed through (for example 403).
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/TriplyDbError'
  /triplydb/health:
    get:
      operationId: getTriplyDbProxyHealth
      tags: [Health & monitoring]
      summary: Liveness of the TriplyDB proxy
      description: Always answers 200 and does not contact TriplyDB.
      responses:
        '200':
          description: The proxy is running.
          headers:
            API-Version:
              $ref: '#/components/headers/ApiVersion'
          content:
            application/json:
              schema:
                type: object
                required: [status, service, version, timestamp, uptime]
                properties:
                  status:
                    const: ok
                  service:
                    const: triplydb-proxy
                  version:
                    type: string
                  timestamp:
                    type: string
                    format: date-time
                  uptime:
                    type: number
                    description: Process uptime in seconds.
```

Append at the end of the file, under `components.schemas`:

```yaml
    TriplyDbError:
      type: object
      description: >-
        Error body of the TriplyDB proxy routes. Not `ErrorEnvelope`: `error` is a
        plain message and `status` repeats the HTTP status (#131).
      required: [success, error, status]
      properties:
        success:
          const: false
        error:
          type: string
        status:
          type: integer
    TriplyDbConfig:
      type: object
      description: TriplyDB connection settings supplied by the caller (#142).
      required: [baseUrl, account, dataset, apiToken]
      properties:
        baseUrl:
          type: string
          examples: ['https://api.open-regels.triply.cc']
        account:
          type: string
        dataset:
          type: string
        apiToken:
          type: string
    SparqlResults:
      type: object
      description: >-
        SPARQL 1.1 Query Results JSON as returned by the endpoint, unchanged:
        `head` and `results.bindings` for SELECT, `head` and `boolean` for ASK.
      properties:
        head:
          type: object
          properties:
            vars:
              type: array
              items:
                type: string
        results:
          type: object
          properties:
            bindings:
              type: array
              items:
                type: object
                additionalProperties:
                  $ref: '#/components/schemas/SparqlBinding'
        boolean:
          type: boolean
    SparqlBinding:
      type: object
      required: [value]
      properties:
        type:
          type: string
          examples: [uri]
        value:
          type: string
        datatype:
          type: string
        'xml:lang':
          type: string
    TriplyDbAsset:
      type: object
      required: [id, name, url, size, contentType]
      properties:
        id:
          type: string
        name:
          type: string
        url:
          type: string
          description: Download URL of the first version, or a constructed page URL when the asset has no versions.
        size:
          type: number
          minimum: 0
          description: Size of the first version in bytes, or 0 when there is none.
        contentType:
          type: string
          description: Always `image/png`; TriplyDB does not report the type.
```

- [ ] **Step 4: Remove the entries and lower the ceiling**

In `openapi/pending.json`, delete exactly these six lines:

```
  "GET /triplydb/assets",
  "GET /triplydb/health",
  "POST /triplydb/list-graphs",
  "POST /triplydb/query",
  "POST /triplydb/test-connection",
  "POST /triplydb/update-service",
```

In `src/openapi/coverage.test.ts`, change `const PENDING_CEILING = 59;` to `const PENDING_CEILING = 53;`.

No new lint exception is needed: every triplydb operation with inputs can return 400.

- [ ] **Step 5: Verify**

Run from `packages/backend`:

```bash
npx jest --config jest.config.js src/routes/triplydb.routes.test.ts src/openapi --coverage=false
npm run lint:openapi
npm run typecheck && npm run lint && npm run check-format
node -e "console.log(require('./openapi/pending.json').length)"
```

Expected:

- every suite passes;
- `lint:openapi` exits 0 with no change to `.spectral.yaml`;
- typecheck, lint and format are clean;
- the pending count prints `53`.

If Spectral reports a finding, fix the document, never the ruleset, and report it. If a finding can only be silenced by an exception, stop and report DONE_WITH_CONCERNS.

- [ ] **Step 6: Stage and stop**

```bash
git add packages/backend/openapi/openapi.yaml packages/backend/openapi/pending.json packages/backend/src/openapi/coverage.test.ts packages/backend/src/routes/triplydb.routes.test.ts
git status --short
```

Proposed message: `docs(backend): describe /triplydb in OpenAPI (#134)`. Do not commit.

---

### Task 3: `/dmns` reads

**Files:**

- Modify: `packages/backend/openapi/openapi.yaml`
- Modify: `packages/backend/openapi/pending.json`
- Modify: `packages/backend/openapi/.spectral.yaml`
- Modify: `packages/backend/src/openapi/coverage.test.ts`
- Modify: `packages/backend/src/routes/dmn.routes.test.ts`

**Interfaces:**

- Consumes: `expectToMatchOperation`; `versionMiddleware`; `ErrorEnvelope`, `ApiVersion`.
- Produces: document operations `GET /dmns`, `GET /dmns/semantic-equivalences`, `GET /dmns/enhanced-chain-links`, `GET /dmns/cycles`, `GET /dmns/{identifier}`, `GET /dmns/{identifier}/xml`; schemas `DmnModel`, `DmnVariable`, `SemanticEquivalence`, `SemanticConcept`, `DmnReference`, `EnhancedChainLink`, `ChainCycle`.

- [ ] **Step 1: Add the failing conformance tests**

In `packages/backend/src/routes/dmn.routes.test.ts`, add directly after `import dmnRoutes from './dmn.routes';`:

```ts
import { versionMiddleware } from '../middleware/version.middleware';
import { expectToMatchOperation } from '../openapi/testing/conformance';
```

Append at the end of the file:

```ts
describe('/v1/dmns reads match their OpenAPI description', () => {
  function makeDocumentedApp() {
    const app = express();
    app.use(express.json());
    app.use(versionMiddleware); // app-wide in index.ts
    app.use('/v1/dmns', dmnRoutes);
    return app;
  }

  // Shaped like sparqlService's DmnModel (sparql.service.ts:273-320): optional
  // fields are omitted, vendorCount is always set.
  const DMN = {
    id: 'https://regels.example/id/dmn/SVB_LeeftijdsInformatie',
    identifier: 'SVB_LeeftijdsInformatie',
    title: 'Leeftijdsinformatie',
    description: 'Bepaalt de AOW-leeftijd',
    deploymentId: 'dep-1',
    deployedAt: '2026-09-01T08:00:00Z',
    testStatus: 'passed',
    organization: 'https://regels.example/id/org/svb',
    organizationName: 'SVB',
    inputs: [{ identifier: 'geboortedatum', title: 'Geboortedatum', type: 'Date' }],
    outputs: [
      { identifier: 'aowLeeftijd', title: 'AOW-leeftijd', type: 'Integer', testValue: 67 },
      { identifier: 'toelichting', title: 'Toelichting', type: 'String', description: 'Vrije tekst' },
    ],
    validationStatus: 'validated',
    vendorCount: 2,
  };

  const get = (path: string) => request(makeDocumentedApp()).get(`/v1/dmns${path}`);

  test('GET /dmns 200 and 500, as documented', async () => {
    sparql.getAllDmns.mockResolvedValue([DMN, { ...DMN, identifier: 'Leeg', inputs: [], outputs: [], vendorCount: 0 }]);
    const ok = await get('?refresh=true');
    expect(ok.status).toBe(200);
    expectToMatchOperation(ok, 'get', '/dmns');

    sparql.getAllDmns.mockRejectedValue(new Error('SPARQL endpoint unreachable'));
    const failed = await get('');
    expect(failed.status).toBe(500);
    expectToMatchOperation(failed, 'get', '/dmns');
  });

  test('a non-numeric Integer test value serialises as null, and still matches', async () => {
    sparql.getAllDmns.mockResolvedValue([
      { ...DMN, outputs: [{ identifier: 'x', title: 'X', type: 'Integer', testValue: NaN }] },
    ]);

    const res = await get('');

    expect(res.body.data.dmns[0].outputs[0].testValue).toBeNull();
    expectToMatchOperation(res, 'get', '/dmns');
  });

  test('GET /dmns/semantic-equivalences 200, as documented', async () => {
    const concept = (n: number) => ({
      uri: `https://regels.example/id/concept/${n}`,
      label: `Begrip ${n}`,
      variable: { uri: `https://regels.example/id/var/${n}`, identifier: `var${n}`, type: 'Date' },
    });
    sparql.findSemanticEquivalences.mockResolvedValue([
      {
        sharedConcept: 'https://begrippen.example/geboortedatum',
        concept1: { ...concept(1), notation: 'GBD' },
        concept2: concept(2),
        dmn1: { uri: 'https://regels.example/id/dmn/A', title: 'A' },
        dmn2: { uri: 'https://regels.example/id/dmn/B', title: 'B' },
      },
    ]);

    const res = await get('/semantic-equivalences');

    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'get', '/dmns/semantic-equivalences');
  });

  test('GET /dmns/enhanced-chain-links 200, as documented', async () => {
    sparql.findEnhancedChainLinks.mockResolvedValue([
      {
        dmn1: { uri: 'https://regels.example/id/dmn/A', identifier: 'A', title: 'A' },
        dmn2: { uri: 'https://regels.example/id/dmn/B', identifier: 'B', title: 'B' },
        outputVariable: 'leeftijd',
        inputVariable: 'leeftijd',
        variableType: 'Integer',
        matchType: 'exact',
        sharedConcept: 'https://begrippen.example/leeftijd',
      },
    ]);

    const res = await get('/enhanced-chain-links');

    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'get', '/dmns/enhanced-chain-links');
  });

  test('GET /dmns/cycles 200, as documented', async () => {
    sparql.detectChainCycles.mockResolvedValue([
      {
        path: [
          { uri: 'https://regels.example/id/dmn/A', title: 'A' },
          { uri: 'https://regels.example/id/dmn/B', title: 'B' },
          { uri: 'https://regels.example/id/dmn/C', title: 'C' },
        ],
        type: 'three-hop',
      },
    ]);

    const res = await get('/cycles');

    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'get', '/dmns/cycles');
  });

  test('GET /dmns/{identifier} 200, 404 and 500, as documented', async () => {
    sparql.getDmnByIdentifier.mockResolvedValue(DMN);
    const ok = await get('/SVB_LeeftijdsInformatie');
    expect(ok.status).toBe(200);
    expectToMatchOperation(ok, 'get', '/dmns/{identifier}');

    sparql.getDmnByIdentifier.mockResolvedValue(undefined);
    const missing = await get('/Onbekend');
    expect(missing.status).toBe(404);
    expectToMatchOperation(missing, 'get', '/dmns/{identifier}');

    sparql.getDmnByIdentifier.mockRejectedValue(new Error('SPARQL timeout'));
    const failed = await get('/SVB_LeeftijdsInformatie');
    expect(failed.status).toBe(500);
    expectToMatchOperation(failed, 'get', '/dmns/{identifier}');
  });

  test('GET /dmns/{identifier}/xml 200, 404 and 500, as documented', async () => {
    operaton.fetchDmnXml.mockResolvedValue('<definitions id="d1"/>');
    const ok = await get('/SVB_LeeftijdsInformatie/xml');
    expect(ok.status).toBe(200);
    expectToMatchOperation(ok, 'get', '/dmns/{identifier}/xml');

    operaton.fetchDmnXml.mockResolvedValue(null);
    const missing = await get('/Onbekend/xml');
    expect(missing.status).toBe(404);
    expectToMatchOperation(missing, 'get', '/dmns/{identifier}/xml');

    operaton.fetchDmnXml.mockRejectedValue(new Error('Operaton unreachable'));
    const failed = await get('/SVB_LeeftijdsInformatie/xml');
    expect(failed.status).toBe(500);
    expectToMatchOperation(failed, 'get', '/dmns/{identifier}/xml');
  });
});
```

If the 404 lookup test does not return 404 with `mockResolvedValue(undefined)`, use `null`, following the existing test `returns 404 naming the identifier when the DMN is unknown`, and report which one the route needs.

- [ ] **Step 2: Run the tests to verify they fail**

Run from `packages/backend`: `npx jest --config jest.config.js src/routes/dmn.routes.test.ts --coverage=false`

Expected:

- every new conformance test FAILS with `GET /dmns… is not documented`;
- the existing tests PASS.

- [ ] **Step 3: Describe the six operations**

Insert directly above the top-level line `components:` in `openapi.yaml`:

```yaml
  /dmns:
    get:
      operationId: listDmns
      tags: [Discovery]
      summary: DMN decision models published in the knowledge graph
      description: >-
        Results are cached for five minutes per endpoint. The `endpoint` override
        is not validated (#142).
      parameters:
        - name: endpoint
          in: query
          required: false
          description: SPARQL endpoint URL to query instead of the configured one.
          schema:
            type: string
        - name: refresh
          in: query
          required: false
          description: '`true` or `1` bypasses the cache; any other value leaves it in use.'
          schema:
            type: string
      responses:
        '200':
          description: The decision models.
          headers:
            API-Version:
              $ref: '#/components/headers/ApiVersion'
          content:
            application/json:
              schema:
                type: object
                required: [success, data, timestamp]
                properties:
                  success:
                    const: true
                  data:
                    type: object
                    required: [total, dmns, fromCache]
                    properties:
                      total:
                        type: integer
                        minimum: 0
                      dmns:
                        type: array
                        items:
                          $ref: '#/components/schemas/DmnModel'
                      fromCache:
                        type: boolean
                        description: True unless `refresh` was requested; not a cache-hit indicator.
                  timestamp:
                    type: string
                    format: date-time
        '500':
          description: The knowledge graph could not be queried (code QUERY_ERROR).
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  /dmns/semantic-equivalences:
    get:
      operationId: listDmnSemanticEquivalences
      tags: [Discovery]
      summary: Variables of different DMNs linked to the same concept
      description: The `endpoint` override is not validated (#142).
      parameters:
        - name: endpoint
          in: query
          required: false
          description: SPARQL endpoint URL to query instead of the configured one.
          schema:
            type: string
      responses:
        '200':
          description: The equivalences.
          headers:
            API-Version:
              $ref: '#/components/headers/ApiVersion'
          content:
            application/json:
              schema:
                type: object
                required: [success, data, timestamp]
                properties:
                  success:
                    const: true
                  data:
                    type: array
                    items:
                      $ref: '#/components/schemas/SemanticEquivalence'
                  timestamp:
                    type: string
                    format: date-time
        '500':
          description: The knowledge graph could not be queried (code QUERY_ERROR).
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  /dmns/enhanced-chain-links:
    get:
      operationId: listDmnChainLinks
      tags: [Discovery]
      summary: Output-to-input links between DMNs, by identifier or shared concept
      description: The `endpoint` override is not validated (#142).
      parameters:
        - name: endpoint
          in: query
          required: false
          description: SPARQL endpoint URL to query instead of the configured one.
          schema:
            type: string
      responses:
        '200':
          description: The chain links.
          headers:
            API-Version:
              $ref: '#/components/headers/ApiVersion'
          content:
            application/json:
              schema:
                type: object
                required: [success, data, timestamp]
                properties:
                  success:
                    const: true
                  data:
                    type: array
                    items:
                      $ref: '#/components/schemas/EnhancedChainLink'
                  timestamp:
                    type: string
                    format: date-time
        '500':
          description: The knowledge graph could not be queried (code QUERY_ERROR).
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  /dmns/cycles:
    get:
      operationId: listDmnChainCycles
      tags: [Discovery]
      summary: Cycles in the DMN chain graph
      description: The `endpoint` override is not validated (#142).
      parameters:
        - name: endpoint
          in: query
          required: false
          description: SPARQL endpoint URL to query instead of the configured one.
          schema:
            type: string
      responses:
        '200':
          description: The detected cycles.
          headers:
            API-Version:
              $ref: '#/components/headers/ApiVersion'
          content:
            application/json:
              schema:
                type: object
                required: [success, data, timestamp]
                properties:
                  success:
                    const: true
                  data:
                    type: array
                    items:
                      $ref: '#/components/schemas/ChainCycle'
                  timestamp:
                    type: string
                    format: date-time
        '500':
          description: The knowledge graph could not be queried (code QUERY_ERROR).
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  /dmns/{identifier}:
    get:
      operationId: getDmn
      tags: [Discovery]
      summary: One DMN decision model
      description: Served from the same five-minute cache as the list. The `endpoint` override is not validated (#142).
      parameters:
        - name: identifier
          in: path
          required: true
          description: The DMN's identifier.
          schema:
            type: string
        - name: endpoint
          in: query
          required: false
          description: SPARQL endpoint URL to query instead of the configured one.
          schema:
            type: string
      responses:
        '200':
          description: The decision model.
          headers:
            API-Version:
              $ref: '#/components/headers/ApiVersion'
          content:
            application/json:
              schema:
                type: object
                required: [success, data, timestamp]
                properties:
                  success:
                    const: true
                  data:
                    $ref: '#/components/schemas/DmnModel'
                  timestamp:
                    type: string
                    format: date-time
        '404':
          description: No DMN has this identifier (code NOT_FOUND).
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '500':
          description: The knowledge graph could not be queried (code QUERY_ERROR).
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  /dmns/{identifier}/xml:
    get:
      operationId: getDmnXml
      tags: [Discovery]
      summary: The deployed DMN XML, as a file download
      description: Fetched from Operaton; `identifier` is used as the decision definition key.
      parameters:
        - name: identifier
          in: path
          required: true
          description: The DMN's identifier, used as the Operaton decision definition key.
          schema:
            type: string
      responses:
        '200':
          description: The DMN XML.
          headers:
            API-Version:
              $ref: '#/components/headers/ApiVersion'
            Content-Disposition:
              description: '`attachment; filename="<identifier>.dmn"`.'
              schema:
                type: string
          content:
            application/xml:
              schema:
                type: string
        '404':
          description: Operaton has no decision definition with this key (code DMN_NOT_FOUND).
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '500':
          description: Operaton could not be reached or answered with an error (code DMN_FETCH_FAILED).
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
```

Append at the end of the file, under `components.schemas`:

```yaml
    DmnModel:
      type: object
      required: [id, identifier, title, inputs, outputs, vendorCount, xmlUrl]
      properties:
        id:
          type: string
          description: IRI of the DMN.
        identifier:
          type: string
        title:
          type: string
        description:
          type: string
        deploymentId:
          type: string
        deployedAt:
          type: string
          description: As published in the knowledge graph; not reformatted.
        implementedBy:
          type: string
        lastTested:
          type: string
        testStatus:
          type: string
          description: Usually `passed`, `failed` or `pending`; read from the knowledge graph and not enforced.
        service:
          type: string
        serviceTitle:
          type: string
        organization:
          type: string
        organizationName:
          type: string
        logoUrl:
          type: string
        xmlUrl:
          type: string
          description: Relative link to the DMN XML download.
          examples: [/v1/dmns/SVB_LeeftijdsInformatie/xml]
        inputs:
          type: array
          items:
            $ref: '#/components/schemas/DmnVariable'
        outputs:
          type: array
          items:
            $ref: '#/components/schemas/DmnVariable'
        validationStatus:
          type: string
          description: Usually `validated`, `in-review` or `not-validated`; read from the knowledge graph and not enforced.
        validatedBy:
          type: string
        validatedByName:
          type: string
        validatedAt:
          type: string
          description: As published in the knowledge graph; not reformatted.
        validationNote:
          type: string
        vendorCount:
          type: integer
          minimum: 0
    DmnVariable:
      type: object
      required: [identifier, title, type]
      properties:
        identifier:
          type: string
        title:
          type: string
        type:
          type: string
          description: Usually `String`, `Integer`, `Boolean`, `Date` or `Double`; read from the knowledge graph and not enforced.
        description:
          type: string
        testValue:
          type: [string, number, boolean, 'null']
          description: >-
            Example value, converted according to `type`. A non-numeric value for
            an Integer or Double variable serialises as null.
    SemanticEquivalence:
      type: object
      required: [sharedConcept, concept1, concept2, dmn1, dmn2]
      properties:
        sharedConcept:
          type: string
          description: IRI of the concept both variables refer to.
        concept1:
          $ref: '#/components/schemas/SemanticConcept'
        concept2:
          $ref: '#/components/schemas/SemanticConcept'
        dmn1:
          $ref: '#/components/schemas/DmnReference'
        dmn2:
          $ref: '#/components/schemas/DmnReference'
    SemanticConcept:
      type: object
      required: [uri, label, variable]
      properties:
        uri:
          type: string
        label:
          type: string
        notation:
          type: string
        variable:
          type: object
          required: [uri, identifier, type]
          properties:
            uri:
              type: string
            identifier:
              type: string
            type:
              type: string
              description: Read from the knowledge graph; not enforced.
    DmnReference:
      type: object
      required: [uri, title]
      properties:
        uri:
          type: string
        identifier:
          type: string
        title:
          type: string
    EnhancedChainLink:
      type: object
      required: [dmn1, dmn2, outputVariable, inputVariable, variableType, matchType, sharedConcept]
      properties:
        dmn1:
          $ref: '#/components/schemas/DmnReference'
        dmn2:
          $ref: '#/components/schemas/DmnReference'
        outputVariable:
          type: string
        inputVariable:
          type: string
        variableType:
          type: string
        matchType:
          type: string
          enum: [exact, semantic]
          description: A link that matches both ways is listed twice, once per match type.
        sharedConcept:
          type: string
    ChainCycle:
      type: object
      required: [path, type]
      properties:
        path:
          type: array
          minItems: 3
          items:
            $ref: '#/components/schemas/DmnReference'
        type:
          type: string
          enum: [three-hop, four-hop]
          description: Only `three-hop` cycles are detected today.
```

- [ ] **Step 4: Remove the entries and lower the ceiling**

In `openapi/pending.json`, delete exactly these six lines:

```
  "GET /dmns",
  "GET /dmns/cycles",
  "GET /dmns/enhanced-chain-links",
  "GET /dmns/semantic-equivalences",
  "GET /dmns/{identifier}",
  "GET /dmns/{identifier}/xml",
```

In `src/openapi/coverage.test.ts`, change `const PENDING_CEILING = 53;` to `const PENDING_CEILING = 47;`.

- [ ] **Step 5: Record the six exceptions**

In `openapi/.spectral.yaml`, append to the end of the `overrides:` list:

```yaml
  # These reads never answer 400. Their only inputs are an optional free-text
  # SPARQL endpoint (not validated, #142), a `refresh` flag where any value is
  # accepted, and a path identifier that resolves to 200 or 404.
  - files:
      - 'openapi.json#/paths/~1dmns/get'
      - 'openapi.json#/paths/~1dmns~1semantic-equivalences/get'
      - 'openapi.json#/paths/~1dmns~1enhanced-chain-links/get'
      - 'openapi.json#/paths/~1dmns~1cycles/get'
      - 'openapi.json#/paths/~1dmns~1{identifier}/get'
      - 'openapi.json#/paths/~1dmns~1{identifier}~1xml/get'
    rules:
      nlgov:problem-invalid-input: 'off'
```

- [ ] **Step 6: Verify**

Run from `packages/backend`:

```bash
npx jest --config jest.config.js src/routes/dmn.routes.test.ts src/openapi --coverage=false
npm run lint:openapi
npm run typecheck && npm run lint && npm run check-format
node -e "console.log(require('./openapi/pending.json').length)"
```

Expected:

- every suite passes;
- `lint:openapi` exits 0;
- typecheck, lint and format are clean;
- the pending count prints `47`.

Prove the override is load-bearing and narrow. Copy `.spectral.yaml` to `.spectral.yaml.orig`, delete the new override entry, and run `npm run lint:openapi`.

- **Expected:** exit 1, with `nlgov:problem-invalid-input` reported at exactly the six operations above and nowhere else.
- **If the two `{identifier}` operations are still reported with the override present:** Spectral did not match the braces. Replace `{identifier}` with `%7Bidentifier%7D` in both `files` lines, rerun, and report which form works.

Then restore from `.orig` and remove the copy.

- [ ] **Step 7: Stage and stop**

```bash
git add packages/backend/openapi/openapi.yaml packages/backend/openapi/pending.json packages/backend/openapi/.spectral.yaml packages/backend/src/openapi/coverage.test.ts packages/backend/src/routes/dmn.routes.test.ts
git status --short
```

Proposed message: `docs(backend): describe the /dmns read operations in OpenAPI (#134)`. Do not commit.

---

### Task 4: `/dmns` deploy, evaluate and validate

**Files:**

- Modify: `packages/backend/openapi/openapi.yaml`
- Modify: `packages/backend/openapi/pending.json`
- Modify: `packages/backend/openapi/.spectral.yaml`
- Modify: `packages/backend/src/openapi/coverage.test.ts`
- Modify: `packages/backend/src/routes/dmn.routes.test.ts`

**Interfaces:**

- Consumes: `expectToMatchOperation`; `versionMiddleware` (both already imported in `dmn.routes.test.ts` by Task 3); `ErrorEnvelope`, `ApiVersion`.
- Produces: document operations `POST /dmns/drd/deploy`, `POST /dmns/process/deploy`, `POST /dmns/deploy`, `POST /dmns/evaluate/{decisionKey}`, `POST /dmns/validate`; schemas `OperatonDecisionResult`, `OperatonProxyError`, `DmnValidationResult`, `ValidationLayer`, `ValidationIssue`.

- [ ] **Step 1: Add the failing conformance tests**

Append at the end of `packages/backend/src/routes/dmn.routes.test.ts`:

```ts
describe('/v1/dmns deploy, evaluate and validate match their OpenAPI description', () => {
  function makeDocumentedApp() {
    const app = express();
    app.use(express.json());
    app.use(versionMiddleware); // app-wide in index.ts
    app.use('/v1/dmns', dmnRoutes);
    return app;
  }

  const post = (path: string) => request(makeDocumentedApp()).post(`/v1/dmns${path}`);

  test('POST /dmns/evaluate/{decisionKey} passes Operaton results and errors through, as documented', async () => {
    operaton.evaluateRaw.mockResolvedValue([{ aanspraak: { value: true, type: 'Boolean' } }]);
    const rows = await post('/evaluate/zorgtoeslag').send({ variables: { inkomen: { value: 30000, type: 'Integer' } } });
    expect(rows.status).toBe(200);
    expectToMatchOperation(rows, 'post', '/dmns/evaluate/{decisionKey}');

    operaton.evaluateRaw.mockResolvedValue({ aanspraak: { value: false, type: 'Boolean' } });
    const single = await post('/evaluate/zorgtoeslag').send({});
    expect(single.status).toBe(200);
    expectToMatchOperation(single, 'post', '/dmns/evaluate/{decisionKey}');

    operaton.evaluateRaw.mockRejectedValue(
      Object.assign(new Error('Request failed'), {
        isAxiosError: true,
        response: { status: 500, data: { type: 'RestException', message: 'Unknown property used in expression' } },
      })
    );
    const forwarded = await post('/evaluate/zorgtoeslag').send({});
    expect(forwarded.status).toBe(500);
    expectToMatchOperation(forwarded, 'post', '/dmns/evaluate/{decisionKey}');

    operaton.evaluateRaw.mockRejectedValue(new Error('ECONNREFUSED'));
    const proxy = await post('/evaluate/zorgtoeslag').send({});
    expect(proxy.status).toBe(500);
    expect(proxy.body).toEqual({ type: 'ProxyError', message: 'ECONNREFUSED' });
    expectToMatchOperation(proxy, 'post', '/dmns/evaluate/{decisionKey}');
  });

  test('POST /dmns/validate 200, 400 and 500, as documented', async () => {
    const layer = (label: string) => ({ label, issues: [] as unknown[] });
    mockValidate.mockResolvedValue({
      valid: false,
      parseError: null,
      layers: {
        base: layer('Base DMN'),
        business: {
          label: 'Business Rules',
          issues: [{ severity: 'error', code: 'BIZ-006', message: 'Missing hit policy', location: '/definitions/decision[1]' }],
        },
        execution: layer('Execution Rules'),
        interaction: layer('Interaction Rules'),
        content: {
          label: 'Content',
          issues: [{ severity: 'warning', code: 'CON-001', message: 'Untitled input', line: 12, column: 4 }],
        },
      },
      summary: { errors: 1, warnings: 1, infos: 0 },
    });
    const ok = await post('/validate').send({ content: '<definitions/>' });
    expect(ok.status).toBe(200);
    expectToMatchOperation(ok, 'post', '/dmns/validate');

    const bad = await post('/validate').send({ content: 42 });
    expect(bad.status).toBe(400);
    expectToMatchOperation(bad, 'post', '/dmns/validate');

    mockValidate.mockRejectedValue(new Error('validator crashed'));
    const failed = await post('/validate').send({ content: '<definitions/>' });
    expect(failed.status).toBe(500);
    expectToMatchOperation(failed, 'post', '/dmns/validate');
  });

  test('POST /dmns/deploy 400 and 500, as documented', async () => {
    const bad = await post('/deploy').send({ deploymentName: 'Zorgtoeslag' });
    expect(bad.status).toBe(400);
    expectToMatchOperation(bad, 'post', '/dmns/deploy');

    operaton.deployDrd.mockRejectedValue(new Error('Operaton unreachable'));
    const failed = await post('/deploy').send({ xml: '<definitions/>', deploymentName: 'Zorgtoeslag' });
    expect(failed.status).toBe(500);
    expectToMatchOperation(failed, 'post', '/dmns/deploy');
  });

  test('POST /dmns/drd/deploy 400, as documented', async () => {
    const res = await post('/drd/deploy').send({ dmnIds: ['A'], deploymentName: 'Keten' });

    expect(res.status).toBe(400);
    expectToMatchOperation(res, 'post', '/dmns/drd/deploy');
  });

  test('POST /dmns/process/deploy 400, as documented', async () => {
    const res = await post('/process/deploy').send({ bpmnXml: '<definitions/>', deploymentName: 'Proces' });

    expect(res.status).toBe(400);
    expectToMatchOperation(res, 'post', '/dmns/process/deploy');
  });
});
```

The validate test above mocks `validateDmnContent` as asynchronous: `mockResolvedValue`, and `mockRejectedValue` for the 500. Check the existing tests `validates the posted DMN XML and returns the layered result` and `returns 500 with a VALIDATION_ERROR code when the validator throws`. If they use `mockReturnValue`, or `mockImplementation(() => { throw … })`, use the same style instead, and note the change in the report.

Then add three success tests inside that new `describe`. Each copies its mock setup and request body verbatim from an existing test, sends the request through `post(...)` (the documented app), and ends with `expect(res.status).toBe(200);` and `expectToMatchOperation(res, 'post', '<document path>');`:

| New test name                                  | Copy mocks and body from                                                  | Document path          |
| ---------------------------------------------- | ------------------------------------------------------------------------- | ---------------------- |
| `POST /dmns/drd/deploy 200, as documented`     | `assembles and deploys the DRD, naming it after the entry-point decision` | `/dmns/drd/deploy`     |
| `POST /dmns/process/deploy 200, as documented` | `forwards the full artefact bundle and Operaton credentials`              | `/dmns/process/deploy` |
| `POST /dmns/deploy 200, as documented`         | `uses an explicit filename when given`                                    | `/dmns/deploy`         |

- [ ] **Step 2: Run the tests to verify they fail**

Run from `packages/backend`: `npx jest --config jest.config.js src/routes/dmn.routes.test.ts --coverage=false`

Expected:

- every new test in this `describe` FAILS at its first `expectToMatchOperation` call, with `POST /dmns/… is not documented`. The status assertions before that call pass.
- all other tests, including Task 3's reads, PASS.

- [ ] **Step 3: Describe the five operations**

Insert directly above the top-level line `components:` in `openapi.yaml`:

```yaml
  /dmns/drd/deploy:
    post:
      operationId: deployDrd
      tags: [Discovery]
      summary: Assemble deployed DMNs into one DRD and deploy it to Operaton
      description: >-
        The last id in `dmnIds` is the entry point and names the deployed file.
        Operaton's own error status is not passed through; failures answer 500.
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [dmnIds, deploymentName]
              properties:
                dmnIds:
                  type: array
                  minItems: 2
                  items:
                    type: string
                deploymentName:
                  type: string
      responses:
        '200':
          description: The DRD was deployed.
          headers:
            API-Version:
              $ref: '#/components/headers/ApiVersion'
          content:
            application/json:
              schema:
                type: object
                required: [success, data, timestamp]
                properties:
                  success:
                    const: true
                  data:
                    type: object
                    required: [deploymentId, entryPointId, filename, dmnCount]
                    properties:
                      deploymentId:
                        type: string
                      entryPointId:
                        type: string
                      filename:
                        type: string
                      dmnCount:
                        type: integer
                        minimum: 2
                  timestamp:
                    type: string
                    format: date-time
        '400':
          description: '`dmnIds` has fewer than two entries or `deploymentName` is blank (code INVALID_INPUT).'
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '500':
          description: >-
            Assembly or deployment failed (code DRD_DEPLOY_FAILED), or the request
            body was not valid JSON (code INTERNAL_ERROR; #143).
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  /dmns/process/deploy:
    post:
      operationId: deployProcess
      tags: [Discovery]
      summary: Deploy a BPMN process bundle to Operaton
      description: >-
        Deploys the BPMN with its subprocesses, forms and document templates as
        one Operaton deployment, tagged with `organization` as the tenant. When
        `operatonUrl` is given, that Operaton instance is used instead (not
        validated, #142). Operaton's own error status is not passed through.
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [bpmnXml, deploymentName, organization]
              properties:
                bpmnXml:
                  type: string
                deploymentName:
                  type: string
                organization:
                  type: string
                  description: Becomes the Operaton tenant id.
                forms:
                  type: array
                  items:
                    type: object
                    required: [id, schema]
                    properties:
                      id:
                        type: string
                      schema:
                        type: object
                subProcesses:
                  type: array
                  items:
                    type: object
                    required: [filename, xml]
                    properties:
                      filename:
                        type: string
                      xml:
                        type: string
                documents:
                  type: array
                  items:
                    type: object
                    required: [id, template]
                    properties:
                      id:
                        type: string
                      template:
                        type: object
                operatonUrl:
                  type: string
                operatonUsername:
                  type: string
                operatonPassword:
                  type: string
                boardOwner:
                  type: string
                  description: Omit to derive it from the BPMN candidate groups; an empty string leaves it unset.
      responses:
        '200':
          description: The bundle was deployed.
          headers:
            API-Version:
              $ref: '#/components/headers/ApiVersion'
          content:
            application/json:
              schema:
                type: object
                required: [success, data, timestamp]
                properties:
                  success:
                    const: true
                  data:
                    type: object
                    required: [deploymentId, resourceCount]
                    properties:
                      deploymentId:
                        type: string
                      resourceCount:
                        type: integer
                        minimum: 1
                  timestamp:
                    type: string
                    format: date-time
        '400':
          description: '`bpmnXml`, `deploymentName` or `organization` is missing or blank (code INVALID_INPUT).'
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '500':
          description: >-
            Deployment failed (code PROCESS_DEPLOY_FAILED; the message carries
            Operaton's error text), or the request body was not valid JSON (code
            INTERNAL_ERROR; #143).
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  /dmns/deploy:
    post:
      operationId: deployDmn
      tags: [Discovery]
      summary: Deploy DMN XML to Operaton as it is
      description: Operaton's own error status is not passed through; failures answer 500.
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [xml, deploymentName]
              properties:
                xml:
                  type: string
                deploymentName:
                  type: string
                filename:
                  type: string
                  description: Defaults to `<deploymentName>.dmn`.
      responses:
        '200':
          description: The DMN was deployed.
          headers:
            API-Version:
              $ref: '#/components/headers/ApiVersion'
          content:
            application/json:
              schema:
                type: object
                required: [success, data, timestamp]
                properties:
                  success:
                    const: true
                  data:
                    type: object
                    required: [deploymentId]
                    properties:
                      deploymentId:
                        type: string
                  timestamp:
                    type: string
                    format: date-time
        '400':
          description: '`xml` or `deploymentName` is missing or blank (code INVALID_INPUT).'
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '500':
          description: >-
            Deployment failed (code DMN_DEPLOY_FAILED), or the request body was not
            valid JSON (code INTERNAL_ERROR; #143).
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  /dmns/evaluate/{decisionKey}:
    post:
      operationId: evaluateDecision
      tags: [Discovery]
      summary: Evaluate a deployed decision in Operaton
      description: >-
        A proxy for Operaton's decision evaluation, kept byte-for-byte compatible
        with calling Operaton directly: the result has no `success`/`data`
        envelope, and Operaton's own error status and body are passed through.
        Nothing is validated here; Operaton rejects invalid input itself.
      parameters:
        - name: decisionKey
          in: path
          required: true
          description: The Operaton decision definition key.
          schema:
            type: string
      requestBody:
        required: false
        content:
          application/json:
            schema:
              type: object
              properties:
                variables:
                  type: object
                  description: Input variables in Operaton's format. A missing object is sent as empty.
                  additionalProperties:
                    type: object
                    required: [value]
                    properties:
                      value: {}
                      type:
                        type: string
                        examples: [Integer]
                      valueInfo:
                        type: object
      responses:
        '200':
          description: Operaton's decision result, one output map per result row.
          headers:
            API-Version:
              $ref: '#/components/headers/ApiVersion'
          content:
            application/json:
              schema:
                anyOf:
                  - $ref: '#/components/schemas/OperatonDecisionResult'
                  - type: array
                    items:
                      $ref: '#/components/schemas/OperatonDecisionResult'
        '500':
          description: >-
            Operaton's own error body passed through (for example a
            `RestException`), a `ProxyError` when Operaton could not be reached, or
            `ErrorEnvelope` when the request body was not valid JSON (#143).
          content:
            application/json:
              schema:
                anyOf:
                  - $ref: '#/components/schemas/OperatonProxyError'
                  - $ref: '#/components/schemas/ErrorEnvelope'
                  - type: object
                    description: Operaton's error body, unchanged.
        default:
          description: Operaton's own error status and body, passed through unchanged.
          content:
            application/json:
              schema:
                type: object
  /dmns/validate:
    post:
      operationId: validateDmn
      tags: [Discovery]
      summary: Validate DMN XML in five layers
      description: >-
        Runs locally, without Operaton or TriplyDB. The HTTP status says whether
        the request could be processed; the verdict on the DMN is in `data.valid`.
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [content]
              properties:
                content:
                  type: string
                  description: The DMN XML.
      responses:
        '200':
          description: The validation result, valid or not.
          headers:
            API-Version:
              $ref: '#/components/headers/ApiVersion'
          content:
            application/json:
              schema:
                type: object
                required: [success, data, timestamp]
                properties:
                  success:
                    const: true
                  data:
                    $ref: '#/components/schemas/DmnValidationResult'
                  timestamp:
                    type: string
                    format: date-time
        '400':
          description: '`content` is missing, empty or not a string (code INVALID_REQUEST).'
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '500':
          description: >-
            The validator failed unexpectedly (code VALIDATION_ERROR), or the
            request body was not valid JSON or over 10 MB (code INTERNAL_ERROR; #143).
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
```

Append at the end of the file, under `components.schemas`:

```yaml
    OperatonDecisionResult:
      type: object
      description: One result row, mapping each output name to its typed value.
      additionalProperties:
        type: object
        required: [value, type]
        properties:
          value: {}
          type:
            type: string
            examples: [Boolean]
    OperatonProxyError:
      type: object
      description: Returned when Operaton could not be reached at all.
      required: [type, message]
      properties:
        type:
          const: ProxyError
        message:
          type: string
    DmnValidationResult:
      type: object
      required: [valid, parseError, layers, summary]
      properties:
        valid:
          type: boolean
          description: True when the XML parsed and no layer reported an error.
        parseError:
          type: [string, 'null']
        layers:
          type: object
          required: [base, business, execution, interaction, content]
          properties:
            base:
              $ref: '#/components/schemas/ValidationLayer'
            business:
              $ref: '#/components/schemas/ValidationLayer'
            execution:
              $ref: '#/components/schemas/ValidationLayer'
            interaction:
              $ref: '#/components/schemas/ValidationLayer'
            content:
              $ref: '#/components/schemas/ValidationLayer'
        summary:
          type: object
          required: [errors, warnings, infos]
          properties:
            errors:
              type: integer
              minimum: 0
            warnings:
              type: integer
              minimum: 0
            infos:
              type: integer
              minimum: 0
    ValidationLayer:
      type: object
      required: [label, issues]
      properties:
        label:
          type: string
        issues:
          type: array
          items:
            $ref: '#/components/schemas/ValidationIssue'
    ValidationIssue:
      type: object
      required: [severity, code, message]
      properties:
        severity:
          type: string
          enum: [error, warning, info]
        code:
          type: string
          examples: [BIZ-006]
        message:
          type: string
        location:
          type: string
        line:
          type: integer
        column:
          type: integer
```

- [ ] **Step 4: Remove the entries and lower the ceiling**

In `openapi/pending.json`, delete exactly these five lines:

```
  "POST /dmns/deploy",
  "POST /dmns/drd/deploy",
  "POST /dmns/evaluate/{decisionKey}",
  "POST /dmns/process/deploy",
  "POST /dmns/validate",
```

In `src/openapi/coverage.test.ts`, change `const PENDING_CEILING = 47;` to `const PENDING_CEILING = 42;`.

- [ ] **Step 5: Record the exception**

In `openapi/.spectral.yaml`, append to the end of the `overrides:` list:

```yaml
  # POST /dmns/evaluate/{decisionKey} is a pass-through to Operaton. It validates
  # nothing, so it never answers 400 itself; Operaton's own validation errors come
  # back at Operaton's status, described by the `default` response.
  - files:
      - 'openapi.json#/paths/~1dmns~1evaluate~1{decisionKey}/post'
    rules:
      nlgov:problem-invalid-input: 'off'
```

If Task 3's verification found that braces must be written `%7B…%7D`, use `%7BdecisionKey%7D` here.

- [ ] **Step 6: Verify**

Run from `packages/backend`:

```bash
npx jest --config jest.config.js src/routes/dmn.routes.test.ts src/openapi --coverage=false
npm run lint:openapi
npm run typecheck && npm run lint && npm run check-format
node -e "console.log(require('./openapi/pending.json').length)"
```

Expected:

- every suite passes;
- `lint:openapi` exits 0;
- typecheck, lint and format are clean;
- the pending count prints `42`.

Prove the new override is load-bearing: with a `.orig` copy, delete the new entry, run `npm run lint:openapi`, and expect exit 1 with `nlgov:problem-invalid-input` only at `paths./dmns/evaluate/{decisionKey}.post`. Restore, and remove the copy.

- [ ] **Step 7: Stage and stop**

```bash
git add packages/backend/openapi/openapi.yaml packages/backend/openapi/pending.json packages/backend/openapi/.spectral.yaml packages/backend/src/openapi/coverage.test.ts packages/backend/src/routes/dmn.routes.test.ts
git status --short
```

Proposed message: `docs(backend): describe the /dmns deploy, evaluate and validate operations in OpenAPI (#134)`. Do not commit.

---

### Task 5: Record the phase 2 exceptions in the spec

**Files:**

- Modify: `docs/superpowers/specs/2026-09-15-openapi-description-design.md`

**Interfaces:**

- Consumes: the final `openapi/.spectral.yaml` from Tasks 1–4.
- Produces: a spec whose section C lists every exception the ruleset applies.

- [ ] **Step 1: Add the phase 2 exceptions**

In the spec, find the paragraph beginning `` `nlgov:problem-invalid-input` stays on.``. Directly after it, add this paragraph:

``Phase 2 (#134) applied that allowance to eight operations that never answer 400: `DELETE /cache/clear`, the six `GET /dmns` reads (their only inputs are an optional unvalidated `endpoint`, a `refresh` flag and a path identifier), and the Operaton pass-through `POST /dmns/evaluate/{decisionKey}`. It also turned off `nlgov:query-keys-camel-case` for `GET /norms` alone, whose `applicable_date` and `cprmv_version` parameters are snake_case: renaming them would break existing callers. That exception was approved on 15 September 2026. Validating `endpoint` (#142) would let the `GET /dmns` exceptions be removed.``

Then run, from the repository root:

```bash
npx prettier --write --embedded-language-formatting=off docs/superpowers/specs/2026-09-15-openapi-description-design.md
npx prettier --check --embedded-language-formatting=off docs/superpowers/specs/2026-09-15-openapi-description-design.md
```

- [ ] **Step 2: Verify the whole phase**

Run from `packages/backend`:

```bash
npm run typecheck && npm run lint && npm run check-format && npm run lint:openapi
npx jest --config jest.config.js src/openapi src/routes/cache.routes.test.ts src/routes/norms.routes.test.ts src/routes/triplydb.routes.test.ts src/routes/dmn.routes.test.ts --coverage=false
node -e "const p=require('./openapi/pending.json');console.log(p.length, p.filter(o=>/ \/(cache|norms|triplydb|dmns)(\/|$)/.test(o)))"
```

Expected:

- every check passes;
- the pending count prints `42 []`: no phase 2 operation is left pending.

- [ ] **Step 3: Stage and stop**

```bash
git add docs/superpowers/specs/2026-09-15-openapi-description-design.md
git status --short
```

Proposed message: `docs: record the phase 2 design-rule exceptions in the OpenAPI spec (#134)`. Do not commit.
