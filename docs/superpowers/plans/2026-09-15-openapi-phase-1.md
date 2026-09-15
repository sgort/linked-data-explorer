# OpenAPI Phase 1 (#133) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve a hand-written OpenAPI 3.1 description at `GET /v1/openapi.json`, with gates that keep it true (route coverage, response conformance, ADR Spectral lint), and fully describe `/health`, `/openapi.json`, `/ropa/public` and `/bundles/public`.

**Architecture:**

- **Source and build.** `packages/backend/openapi/openapi.yaml` is the source. A small CommonJS script builds `openapi/openapi.json` from it, taking `info.version` from `package.json`. The script runs before `build`, `dev` and every Jest run.
- **Serving.** The runtime reads only the JSON, through `src/openapi/document.ts`, and a registry-mounted router serves it with open CORS.
- **Test helpers.** Under `src/openapi/testing/`: one lists the operations Express actually serves; one validates real supertest responses against the document with Ajv 2020-12.
- **Lint.** Spectral lints the built JSON against a vendored copy of the NL API Design Rules 2.2.1 ruleset.

**Tech Stack:** Express 4.22, TypeScript, Jest + ts-jest + supertest, `yaml` 2.9.0, `ajv` 8.20.0 + `ajv-formats` 3.0.1, `@stoplight/spectral-cli` 6.16.3, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-15-openapi-description-design.md`

## Global Constraints

- **Versions.** `@stoplight/spectral-cli` 6.16.3, `ajv` 8.20.0, `ajv-formats` 3.0.1 and `yaml` 2.9.0. Exact pins (`--save-exact`), `devDependencies` of `packages/backend` only.
- **Document.** OpenAPI `3.1.0`. `servers` lists only `https://backend.linkeddata.open-regels.nl/v1` and `https://acc.backend.linkeddata.open-regels.nl/v1`.
- **Contact.** `info.contact` is name `Steven Gort`, email `steven.gort@ictu.nl`, url `https://iou-architectuur.open-regels.nl/`.
- **Version.** `openapi.yaml` must not set `info.version`; the build takes it from `packages/backend/package.json`.
- **Generated file.** `openapi/openapi.json` is generated and gitignored. Never commit it.
- **Error bodies.** Document the existing `{ success: false, error }` envelope as it is. Do not describe problem details (#131).
- **Lint exceptions.** Exceptions to the ADR ruleset live only in `openapi/.spectral.yaml`, each with a stated reason. Never edit the vendored ruleset below its header.
- **Lint exceptions agreed so far.** `.spectral.yaml` turns off `nlgov:use-problem-schema` and `nlgov:problem-schema-members` (#131) and `nlgov:semver` (CalVer `2026.09.4`), and overrides `nlgov:problem-invalid-input` for `GET /ropa/public` only. Nothing else.
- **Tests.** Run from `packages/backend` with the package config: `npx jest --config jest.config.js <files> --coverage=false`. A bare `npx jest` from the repository root ignores this config. The full suite belongs to the user: `npm test --workspace=packages/backend`.
- **Branch coverage.** A per-file 80% branch floor applies to every `src/**/*.ts` file, including the new helpers under `src/openapi/testing/`.
- **Code style.** Code in this plan follows `packages/backend/.prettierrc`: single quotes, 100 columns, ES5 trailing commas.
- **Paths.** `git` commands in this plan, including every `git add`, run from the repository root; `npm run` and `npx` commands run from `packages/backend` unless a step says otherwise.
- **Commits.** Never run `git commit`. At the end of each task, stage the files, report what is staged, propose the commit message, and stop for the user's approval. Never pass `--no-verify`, and never disable, skip or edit a hook.
- **Servers.** Never start, stop or restart a dev server (`npm run dev`, `npm start`, `node dist/...`, `taskkill`, `Stop-Process`). Tests run against nothing live.
- **Subagents** share the working tree: while one is running, the controller makes no git writes.
- **Attribution.** No attribution to Claude in commits, pull request bodies, code or docs.

---

### Task 1: Build pipeline and document reader

**Files:**

- Modify: `packages/backend/package.json` (devDependencies, scripts)
- Modify: `packages/backend/jest.config.js` (add `globalSetup`)
- Modify: `packages/backend/.gitignore`
- Create: `packages/backend/scripts/build-openapi.cjs`
- Create: `packages/backend/scripts/jest-global-setup.cjs`
- Create: `packages/backend/openapi/openapi.yaml`
- Create: `packages/backend/src/openapi/document.ts`
- Test: `packages/backend/src/openapi/document.test.ts`

**Interfaces:**

- Produces:
  - `OPENAPI_JSON_PATH: string`
  - `interface OpenApiDocument { openapi: string; info: { title: string; version: string; [key: string]: unknown }; paths: Record<string, Record<string, unknown>>; components?: { schemas?: Record<string, unknown>; [key: string]: unknown }; [key: string]: unknown }`
  - `readOpenApiDocument(file?: string): OpenApiDocument`, which throws on a missing file or a non-OpenAPI JSON
  - npm scripts `build:openapi`, `prebuild`, `predev`
  - A Jest `globalSetup` that writes `openapi/openapi.json` before every run

- [ ] **Step 1: Create the feature branch**

Run from the repository root:

```bash
git switch docs/openapi-description-design
git switch -c feature/openapi-phase-1
```

Expected: `Switched to a new branch 'feature/openapi-phase-1'`.

- [ ] **Step 2: Add the dev dependencies**

Run from the repository root:

```bash
npm install --workspace=packages/backend --save-dev --save-exact @stoplight/spectral-cli@6.16.3 ajv@8.20.0 ajv-formats@3.0.1 yaml@2.9.0
```

Expected: `added 117 packages` (give or take a few if the tree has moved), and `packages/backend/package.json` lists the four under `devDependencies` without `^`. `npm install` adds packages without deleting `node_modules`, so a running dev server is unaffected. Do not restart it.

- [ ] **Step 3: Write the source document skeleton**

Create `packages/backend/openapi/openapi.yaml`:

```yaml
# packages/backend/openapi/openapi.yaml
#
# The OpenAPI description of the Linked Data Explorer backend, written by hand
# (#129). Served as JSON at /v1/openapi.json. scripts/build-openapi.cjs builds
# openapi.json from this file and sets info.version from package.json, so this
# file must not set info.version.
#
# Operations not described yet are listed in pending.json;
# src/openapi/coverage.test.ts keeps both in step with the Express routes, and
# route tests check real responses against this file (expectToMatchOperation).
openapi: '3.1.0'
info:
  title: Linked Data Explorer Backend
  description: >-
    DMN discovery and chain execution, SHACL validation, asset storage and
    integrations for the Linked Data Explorer.

    Error responses use the `{ success: false, error }` envelope described by
    the ErrorEnvelope schema. The move to RFC 9457 problem details is tracked in
    https://github.com/sgort/linked-data-explorer/issues/131.
  contact:
    name: Steven Gort
    email: steven.gort@ictu.nl
    url: https://iou-architectuur.open-regels.nl/
servers:
  - url: https://backend.linkeddata.open-regels.nl/v1
    description: Production
  - url: https://acc.backend.linkeddata.open-regels.nl/v1
    description: Acceptance
tags:
  - name: Discovery
    description: What the API and its data offer.
paths: {}
components:
  headers:
    ApiVersion:
      description: Full release version of the API (/core/version-header).
      required: true
      schema:
        type: string
        examples:
          - '2026.09.4'
  schemas:
    ErrorEnvelope:
      type: object
      description: >-
        The error body the backend returns today. Not RFC 9457 problem details;
        see https://github.com/sgort/linked-data-explorer/issues/131.
      required: [success, error]
      properties:
        success:
          const: false
        error:
          type: object
          required: [code, message]
          properties:
            code:
              type: string
              examples: [LIST_FAILED]
            message:
              type: string
            details:
              type: string
        timestamp:
          type: string
          format: date-time
```

- [ ] **Step 4: Write the build script**

Create `packages/backend/scripts/build-openapi.cjs`:

```js
#!/usr/bin/env node
// packages/backend/scripts/build-openapi.cjs
//
// Builds openapi/openapi.json from the hand-written openapi/openapi.yaml (#129).
//
// info.version is taken from package.json here, never written in the YAML, so
// the published document and the API-Version header cannot disagree.
//
// The JSON is generated and gitignored: a committed copy of a generated file is
// a second source waiting to drift. npm runs this before `build` and `dev`, and
// scripts/jest-global-setup.cjs runs it before every Jest run, because CI runs
// the tests before it builds.

const fs = require('fs');
const path = require('path');
const YAML = require('yaml');

const PACKAGE_ROOT = path.resolve(__dirname, '..');
const SOURCE = path.join(PACKAGE_ROOT, 'openapi', 'openapi.yaml');
const TARGET = path.join(PACKAGE_ROOT, 'openapi', 'openapi.json');

function buildOpenApiDocument(source, version) {
  const document = YAML.parse(source);
  if (typeof document !== 'object' || document === null || Array.isArray(document)) {
    throw new Error('openapi.yaml does not contain an object');
  }
  if (document.info && Object.prototype.hasOwnProperty.call(document.info, 'version')) {
    throw new Error('openapi.yaml must not set info.version; it is taken from package.json');
  }
  return { ...document, info: { ...document.info, version } };
}

function buildOpenApi() {
  const { version } = JSON.parse(fs.readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8'));
  const document = buildOpenApiDocument(fs.readFileSync(SOURCE, 'utf8'), version);
  fs.writeFileSync(TARGET, `${JSON.stringify(document, null, 2)}\n`);
  return TARGET;
}

module.exports = { buildOpenApiDocument, buildOpenApi, SOURCE, TARGET };

if (require.main === module) {
  console.log(`Wrote ${path.relative(process.cwd(), buildOpenApi())}`);
}
```

- [ ] **Step 5: Run the build before every Jest run**

Create `packages/backend/scripts/jest-global-setup.cjs`:

```js
// packages/backend/scripts/jest-global-setup.cjs
//
// CI runs `npm test` before `npm run build`, so without this the tests would read
// an openapi/openapi.json that does not exist yet, or locally a stale one.
const { buildOpenApi } = require('./build-openapi.cjs');

module.exports = async () => {
  buildOpenApi();
};
```

In `packages/backend/jest.config.js`, add this property directly after `testMatch: ['<rootDir>/src/**/*.test.ts'],`:

```js
  // Builds openapi/openapi.json from openapi.yaml before any test reads it (#129).
  globalSetup: '<rootDir>/scripts/jest-global-setup.cjs',
```

- [ ] **Step 6: Wire the npm scripts and ignore the output**

In `packages/backend/package.json` `scripts`:

- Add `"build:openapi": "node scripts/build-openapi.cjs"`.
- Add `"prebuild": "npm run build:openapi"`.
- Add `"predev": "npm run build:openapi"`.
- Leave every existing script unchanged.

In `packages/backend/.gitignore`, directly below the `build-info.json` lines, add:

```
# Built from openapi/openapi.yaml by scripts/build-openapi.cjs (#129)
openapi/openapi.json
```

Run from `packages/backend`: `npm run build:openapi`
Expected: `Wrote openapi/openapi.json`. Then `git check-ignore openapi/openapi.json` prints `openapi/openapi.json`, which confirms the generated file is ignored.

- [ ] **Step 7: Write the failing reader tests**

Create `packages/backend/src/openapi/document.test.ts`:

```ts
import fs from 'fs';
import os from 'os';
import path from 'path';
import YAML from 'yaml';

import packageJson from '../../package.json';
import { OPENAPI_JSON_PATH, readOpenApiDocument } from './document';

const YAML_PATH = path.resolve(__dirname, '../../openapi/openapi.yaml');

function readSource() {
  return YAML.parse(fs.readFileSync(YAML_PATH, 'utf8'));
}

describe('the built OpenAPI document', () => {
  test('is openapi.yaml with info.version taken from package.json', () => {
    const source = readSource();

    expect(readOpenApiDocument()).toEqual({
      ...source,
      info: { ...source.info, version: packageJson.version },
    });
  });

  test('is OpenAPI 3.1.0, and the source leaves info.version to the build', () => {
    const source = readSource();

    expect(source.openapi).toBe('3.1.0');
    expect(source.info).not.toHaveProperty('version');
  });

  test('lists only HTTPS servers that carry the major version', () => {
    const { servers } = readOpenApiDocument() as unknown as { servers: { url: string }[] };

    expect(servers.map((server) => server.url)).toEqual([
      'https://backend.linkeddata.open-regels.nl/v1',
      'https://acc.backend.linkeddata.open-regels.nl/v1',
    ]);
  });

  test('is read from the package root, where the deploy artifact places it', () => {
    expect(OPENAPI_JSON_PATH).toBe(path.resolve(__dirname, '../../openapi/openapi.json'));
  });
});

describe('readOpenApiDocument', () => {
  let dir: string;

  beforeEach(() => {
    // One directory per test, so parallel workers never share a file.
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'openapi-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function write(content: string): string {
    const file = path.join(dir, 'openapi.json');
    fs.writeFileSync(file, content);
    return file;
  }

  test('throws when the file is missing', () => {
    expect(() => readOpenApiDocument(path.join(dir, 'absent.json'))).toThrow(/ENOENT/);
  });

  test.each([
    ['null', 'null'],
    ['a string', '"openapi"'],
    ['an object without openapi', JSON.stringify({ paths: {} })],
    ['an object without paths', JSON.stringify({ openapi: '3.1.0' })],
  ])('throws when the JSON is %s', (_label, content) => {
    const file = write(content);

    expect(() => readOpenApiDocument(file)).toThrow(`${file} is not an OpenAPI document`);
  });
});
```

- [ ] **Step 8: Run the tests to verify they fail**

Run from `packages/backend`: `npx jest --config jest.config.js src/openapi/document.test.ts --coverage=false`
Expected: FAIL with `Cannot find module './document'`.

- [ ] **Step 9: Implement the reader**

Create `packages/backend/src/openapi/document.ts`:

```ts
// packages/backend/src/openapi/document.ts
//
// The published OpenAPI description (#129). Written by hand in
// openapi/openapi.yaml and built to openapi/openapi.json by
// scripts/build-openapi.cjs. This module only reads the JSON, so the YAML
// parser stays a development dependency.

import fs from 'fs';
import path from 'path';

/**
 * <package root>/openapi/openapi.json: packages/backend/ from src/openapi, and
 * deploy/ from dist/openapi in the artifact. The same relative step resolves
 * package.json, build-info.json and shapes/.
 */
export const OPENAPI_JSON_PATH = path.resolve(__dirname, '../../openapi/openapi.json');

export interface OpenApiDocument {
  openapi: string;
  info: { title: string; version: string; [key: string]: unknown };
  paths: Record<string, Record<string, unknown>>;
  components?: { schemas?: Record<string, unknown>; [key: string]: unknown };
  [key: string]: unknown;
}

/** Throws when the file is missing or does not hold an OpenAPI document. */
export function readOpenApiDocument(file: string = OPENAPI_JSON_PATH): OpenApiDocument {
  const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('openapi' in parsed) ||
    !('paths' in parsed)
  ) {
    throw new Error(`${file} is not an OpenAPI document`);
  }

  return parsed as OpenApiDocument;
}
```

- [ ] **Step 10: Run the tests to verify they pass**

Run from `packages/backend`: `npx jest --config jest.config.js src/openapi/document.test.ts --coverage=false`
Expected: PASS, 9 tests.

Run from `packages/backend`: `npm run typecheck && npx eslint src/openapi && npx prettier --check "src/openapi/**/*.ts"`
Expected: all clean.

- [ ] **Step 11: Stage and stop for approval**

```bash
git add package-lock.json packages/backend/package.json packages/backend/jest.config.js packages/backend/.gitignore packages/backend/scripts/build-openapi.cjs packages/backend/scripts/jest-global-setup.cjs packages/backend/openapi/openapi.yaml packages/backend/src/openapi/document.ts packages/backend/src/openapi/document.test.ts
git status --short
```

Report what is staged. Proposed message: `feat(backend): build the OpenAPI description from openapi.yaml (#133)`. Do not commit until the user approves.

---

### Task 2: Response conformance helper

**Files:**

- Create: `packages/backend/src/openapi/testing/conformance.ts`
- Test: `packages/backend/src/openapi/testing/conformance.test.ts`

**Interfaces:**

- Consumes: `OpenApiDocument` and `readOpenApiDocument()` from `src/openapi/document.ts` (Task 1).
- Produces:
  - `type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete'`
  - `expectToMatchOperation(res: Response, method: HttpMethod, path: string, document?: OpenApiDocument): void`, where `Response` is supertest's. `path` is the document path, e.g. `'/health'`, never the mount. It throws an `Error` describing the first mismatch.

- [ ] **Step 1: Write the failing tests**

Create `packages/backend/src/openapi/testing/conformance.test.ts`:

```ts
import express from 'express';
import request from 'supertest';

import type { OpenApiDocument } from '../document';
import { expectToMatchOperation } from './conformance';

const THING = { id: 't1', createdAt: '2026-09-15T07:00:00.000Z' };

const DOCUMENT: OpenApiDocument = {
  openapi: '3.1.0',
  info: { title: 'Fixture', version: '1.0.0' },
  paths: {
    '/things': {
      get: {
        responses: {
          '200': {
            description: 'OK',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ThingList' } },
            },
          },
          '500': {
            description: 'Error',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['success'],
                  properties: { success: { const: false } },
                },
              },
            },
          },
        },
      },
    },
    '/things/{id}/xml': {
      get: {
        responses: {
          '200': {
            description: 'XML',
            content: { 'application/xml': { schema: { type: 'string', pattern: '^<' } } },
          },
        },
      },
    },
    '/schemaless': {
      get: {
        responses: { '200': { description: 'Untyped JSON', content: { 'application/json': {} } } },
      },
    },
    '/untyped': {
      get: {
        responses: {
          '204': { description: 'No content' },
          default: {
            description: 'Anything else',
            content: { 'application/vnd.fixture+json': { schema: { type: 'object' } } },
          },
        },
      },
    },
    '/undocumented-responses': { get: {} },
  },
  components: {
    schemas: {
      ThingList: {
        type: 'object',
        required: ['success', 'data'],
        properties: {
          success: { const: true },
          data: { type: 'array', items: { $ref: '#/components/schemas/Thing' } },
        },
      },
      Thing: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' }, createdAt: { type: 'string', format: 'date-time' } },
        example: THING,
      },
    },
  },
};

function makeApp() {
  const app = express();
  const versioned = (res: express.Response) => res.set('API-Version', '1.0.0');

  app.get('/things', (req, res) => {
    switch (req.query.case) {
      case 'bad-shape':
        return versioned(res).json({ success: true, data: [{ createdAt: THING.createdAt }] });
      case 'bad-date':
        return versioned(res).json({ success: true, data: [{ id: 't1', createdAt: 'yesterday' }] });
      case 'no-version':
        return res.json({ success: true, data: [THING] });
      case 'text':
        return versioned(res).type('text/plain').send('hello');
      case 'no-content-type':
        return versioned(res).status(200).end();
      case 'error':
        return res.status(500).json({ success: false });
      case 'teapot':
        return res.status(418).json({});
      default:
        return versioned(res).json({ success: true, data: [THING] });
    }
  });
  app.get('/things/:id/xml', (req, res) => {
    versioned(res)
      .type('application/xml')
      .send(req.query.case === 'bad' ? 'not xml' : '<dmn/>');
  });
  app.get('/schemaless', (_req, res) => {
    versioned(res).json({ anything: true });
  });
  app.get('/untyped', (req, res) => {
    if (req.query.case === 'teapot') {
      res.status(418).type('application/vnd.fixture+json').send('{}');
      return;
    }
    versioned(res).status(204).end();
  });
  app.get('/undocumented-responses', (_req, res) => {
    versioned(res).json({});
  });
  return app;
}

const get = (url: string) => request(makeApp()).get(url);

describe('expectToMatchOperation', () => {
  test('passes a documented response, resolving component references', async () => {
    const res = await get('/things');

    expect(() => expectToMatchOperation(res, 'get', '/things', DOCUMENT)).not.toThrow();
  });

  test('fails when the body does not match the schema', async () => {
    const res = await get('/things?case=bad-shape');

    expect(() => expectToMatchOperation(res, 'get', '/things', DOCUMENT)).toThrow(
      /GET \/things answered 200 with a body that does not match the document:\n.*must have required property 'id'/
    );
  });

  test('checks formats', async () => {
    const res = await get('/things?case=bad-date');

    expect(() => expectToMatchOperation(res, 'get', '/things', DOCUMENT)).toThrow(
      /must match format "date-time"/
    );
  });

  test('fails a 2xx response without the API-Version header', async () => {
    const res = await get('/things?case=no-version');

    expect(() => expectToMatchOperation(res, 'get', '/things', DOCUMENT)).toThrow(
      'GET /things answered 200 without the API-Version header'
    );
  });

  test('does not require the API-Version header on an error response', async () => {
    const res = await get('/things?case=error');

    expect(() => expectToMatchOperation(res, 'get', '/things', DOCUMENT)).not.toThrow();
  });

  test('fails an undocumented content type', async () => {
    const res = await get('/things?case=text');

    expect(() => expectToMatchOperation(res, 'get', '/things', DOCUMENT)).toThrow(
      'GET /things answered 200 with text/plain; documented: application/json'
    );
  });

  test('fails a response without a content type where one is documented', async () => {
    const res = await get('/things?case=no-content-type');

    expect(() => expectToMatchOperation(res, 'get', '/things', DOCUMENT)).toThrow(
      'GET /things answered 200 with no content type; documented: application/json'
    );
  });

  test('fails an undocumented status', async () => {
    const res = await get('/things?case=teapot');

    expect(() => expectToMatchOperation(res, 'get', '/things', DOCUMENT)).toThrow(
      'GET /things does not document status 418'
    );
  });

  test('fails an operation that documents no responses', async () => {
    const res = await get('/undocumented-responses');

    expect(() => expectToMatchOperation(res, 'get', '/undocumented-responses', DOCUMENT)).toThrow(
      'GET /undocumented-responses does not document status 200'
    );
  });

  test('falls back to the default response and validates +json bodies as JSON', async () => {
    const res = await get('/untyped?case=teapot');

    expect(() => expectToMatchOperation(res, 'get', '/untyped', DOCUMENT)).not.toThrow();
  });

  test('passes a response that documents no content', async () => {
    const res = await get('/untyped');

    expect(() => expectToMatchOperation(res, 'get', '/untyped', DOCUMENT)).not.toThrow();
  });

  test('passes a documented media type without a schema', async () => {
    const res = await get('/schemaless');

    expect(() => expectToMatchOperation(res, 'get', '/schemaless', DOCUMENT)).not.toThrow();
  });

  test('validates a non-JSON body as text', async () => {
    const good = await get('/things/1/xml');
    const bad = await get('/things/1/xml?case=bad');

    expect(() => expectToMatchOperation(good, 'get', '/things/{id}/xml', DOCUMENT)).not.toThrow();
    expect(() => expectToMatchOperation(bad, 'get', '/things/{id}/xml', DOCUMENT)).toThrow(
      /must match pattern "\^<"/
    );
  });

  test('works with a document that has no components', async () => {
    const res = await get('/things/1/xml');
    const bare: OpenApiDocument = { ...DOCUMENT, components: undefined };

    expect(() => expectToMatchOperation(res, 'get', '/things/{id}/xml', bare)).not.toThrow();
  });

  test.each([
    ['post', '/things', 'POST /things is not documented'],
    ['get', '/nowhere', 'GET /nowhere is not documented'],
  ] as const)('fails an undocumented operation (%s %s)', async (method, path, message) => {
    const res = await get('/things');

    expect(() => expectToMatchOperation(res, method, path, DOCUMENT)).toThrow(message);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run from `packages/backend`: `npx jest --config jest.config.js src/openapi/testing/conformance.test.ts --coverage=false`
Expected: FAIL with `Cannot find module './conformance'`.

- [ ] **Step 3: Implement the helper**

Create `packages/backend/src/openapi/testing/conformance.ts`:

```ts
// packages/backend/src/openapi/testing/conformance.ts
//
// Test helper: assert that a real response matches what the OpenAPI document
// describes for that operation (#129). Route tests call it, so a handler change
// that alters a response shape fails the handler's own test, not only later, in
// a client, against a document that quietly stopped being true.
//
// Never loaded at runtime. It lives under src/ so it is type-checked, linted and
// held to the branch-coverage floor like everything else.

import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import type { Response } from 'supertest';

import { OpenApiDocument, readOpenApiDocument } from '../document';

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

interface MediaTypeObject {
  schema?: unknown;
}

interface ResponseObject {
  content?: Record<string, MediaTypeObject>;
}

interface OperationObject {
  responses?: Record<string, ResponseObject>;
}

/**
 * OpenAPI refers to shared schemas as #/components/schemas/X. Compiled as one
 * standalone JSON Schema, they sit under $defs, so the references move with them.
 */
function toJsonSchema(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value).split('#/components/schemas/').join('#/$defs/'));
}

function isJson(contentType: string): boolean {
  return contentType === 'application/json' || contentType.endsWith('+json');
}

export function expectToMatchOperation(
  res: Response,
  method: HttpMethod,
  path: string,
  document: OpenApiDocument = readOpenApiDocument()
): void {
  const label = `${method.toUpperCase()} ${path}`;

  const operation = document.paths[path]?.[method] as OperationObject | undefined;
  if (!operation) throw new Error(`${label} is not documented`);

  const responses = operation.responses ?? {};
  const response = responses[String(res.status)] ?? responses.default;
  if (!response) throw new Error(`${label} does not document status ${res.status}`);

  // /core/version-header: every successful response carries the version.
  if (String(res.status).startsWith('2') && res.headers['api-version'] === undefined) {
    throw new Error(`${label} answered ${res.status} without the API-Version header`);
  }

  const content = response.content ?? {};
  const documentedTypes = Object.keys(content);
  if (documentedTypes.length === 0) return;

  const contentType = String(res.headers['content-type'] ?? '')
    .split(';')[0]
    .trim();
  const media = content[contentType];
  if (!media) {
    throw new Error(
      `${label} answered ${res.status} with ${contentType || 'no content type'}; ` +
        `documented: ${documentedTypes.join(', ')}`
    );
  }
  if (media.schema === undefined) return;

  // strictSchema stays on, so a misspelled keyword in the document fails loudly.
  // These four are OpenAPI 3.1 schema keywords that JSON Schema 2020-12 lacks.
  const ajv = new Ajv2020({ allErrors: true, strictTypes: false, strictTuples: false });
  ajv.addVocabulary(['example', 'discriminator', 'xml', 'externalDocs']);
  addFormats(ajv);

  const validate = ajv.compile({
    ...(toJsonSchema(media.schema) as Record<string, unknown>),
    $defs: toJsonSchema(document.components?.schemas ?? {}),
  });

  const body: unknown = isJson(contentType) ? res.body : res.text;
  if (!validate(body)) {
    throw new Error(
      `${label} answered ${res.status} with a body that does not match the document:\n` +
        ajv.errorsText(validate.errors, { separator: '\n' })
    );
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run from `packages/backend`: `npx jest --config jest.config.js src/openapi/testing/conformance.test.ts --coverage --collectCoverageFrom=src/openapi/testing/conformance.ts --coverageThreshold='{}'`
Expected: PASS, 16 tests. `conformance.ts` shows 100% branches, except the `readOpenApiDocument()` default parameter, which Task 3's route test covers.

Run from `packages/backend`: `npm run typecheck && npx eslint src/openapi && npx prettier --check "src/openapi/**/*.ts"`
Expected: all clean.

- [ ] **Step 5: Stage and stop for approval**

```bash
git add packages/backend/src/openapi/testing/conformance.ts packages/backend/src/openapi/testing/conformance.test.ts
git status --short
```

Proposed message: `test(backend): validate route responses against the OpenAPI document (#133)`. Do not commit until the user approves.

---

### Task 3: Serve `GET /v1/openapi.json`

**Files:**

- Create: `packages/backend/src/routes/openapi.routes.ts`
- Test: `packages/backend/src/routes/openapi.routes.test.ts`
- Modify: `packages/backend/src/routes/registry.ts`
- Modify: `packages/backend/src/routes/registry.test.ts`
- Modify: `packages/backend/src/utils/publicPaths.ts`
- Modify: `packages/backend/src/utils/publicPaths.test.ts`
- Modify: `packages/backend/openapi/openapi.yaml`

**Interfaces:**

- Consumes: `readOpenApiDocument`, `OpenApiDocument` (Task 1); `expectToMatchOperation` (Task 2).
- Produces:
  - `createOpenApiRouter(load?: () => OpenApiDocument): Router`, with a default export mounted at `/v1/openapi.json` in the registry
  - document operation `GET /openapi.json`
  - `/v1/openapi.json` in `PUBLIC_MOUNTS`

- [ ] **Step 1: Document the operation**

In `packages/backend/openapi/openapi.yaml`, replace the line `paths: {}` with:

```yaml
paths:
  /openapi.json:
    get:
      operationId: getOpenApiDescription
      tags: [Discovery]
      summary: This OpenAPI description
      description: >-
        The published contract of this API (/core/publish-openapi). Served with
        `Access-Control-Allow-Origin: *`, so any OpenAPI viewer can load it.
      responses:
        '200':
          description: The OpenAPI 3.1 document.
          headers:
            API-Version:
              $ref: '#/components/headers/ApiVersion'
            Access-Control-Allow-Origin:
              description: Always `*`.
              schema:
                type: string
                const: '*'
          content:
            application/json:
              schema:
                type: object
                required: [openapi, info, paths]
                properties:
                  openapi:
                    type: string
                    const: '3.1.0'
        '500':
          description: The document could not be read.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
```

- [ ] **Step 2: Write the failing route tests**

Create `packages/backend/src/routes/openapi.routes.test.ts`:

```ts
import express from 'express';
import request from 'supertest';

jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

import logger from '../utils/logger';
import { versionMiddleware } from '../middleware/version.middleware';
import { OpenApiDocument, readOpenApiDocument } from '../openapi/document';
import { expectToMatchOperation } from '../openapi/testing/conformance';
import { createOpenApiRouter } from './openapi.routes';

const mockLoggerError = logger.error as jest.Mock;

function makeApp(load?: () => OpenApiDocument) {
  const app = express();
  // Mounted app-wide in index.ts; added here so the header rule is checked too.
  app.use(versionMiddleware);
  app.use('/v1/openapi.json', createOpenApiRouter(load));
  return app;
}

beforeEach(() => {
  mockLoggerError.mockReset();
});

describe('GET /v1/openapi.json', () => {
  test('serves the built document, as the document describes', async () => {
    const res = await request(makeApp()).get('/v1/openapi.json');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(readOpenApiDocument());
    expectToMatchOperation(res, 'get', '/openapi.json');
  });

  test('lets any origin read it, as /core/publish-openapi requires', async () => {
    const res = await request(makeApp())
      .get('/v1/openapi.json')
      .set('Origin', 'https://viewer.example');

    expect(res.headers['access-control-allow-origin']).toBe('*');
  });

  test('reads the document once', async () => {
    const load = jest.fn(() => readOpenApiDocument());
    const app = makeApp(load);

    await request(app).get('/v1/openapi.json');
    await request(app).get('/v1/openapi.json');

    expect(load).toHaveBeenCalledTimes(1);
  });

  test('answers 500, as documented, when the document cannot be read', async () => {
    const res = await request(
      makeApp(() => {
        throw new Error('ENOENT: no such file');
      })
    ).get('/v1/openapi.json');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      success: false,
      error: {
        code: 'OPENAPI_UNAVAILABLE',
        message: 'The OpenAPI description is not available',
      },
    });
    expectToMatchOperation(res, 'get', '/openapi.json');
    expect(mockLoggerError).toHaveBeenCalledWith('[openapi] document unavailable', {
      error: 'ENOENT: no such file',
    });
  });

  test('does not cache a failed read', async () => {
    const load = jest
      .fn<OpenApiDocument, []>()
      .mockImplementationOnce(() => {
        throw new Error('not yet built');
      })
      .mockImplementation(() => readOpenApiDocument());
    const app = makeApp(load);

    expect((await request(app).get('/v1/openapi.json')).status).toBe(500);
    expect((await request(app).get('/v1/openapi.json')).status).toBe(200);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run from `packages/backend`: `npx jest --config jest.config.js src/routes/openapi.routes.test.ts --coverage=false`
Expected: FAIL with `Cannot find module './openapi.routes'`.

- [ ] **Step 4: Implement the router**

Create `packages/backend/src/routes/openapi.routes.ts`:

```ts
// packages/backend/src/routes/openapi.routes.ts
//
// GET /v1/openapi.json: this API's OpenAPI description, at the standard
// location /core/publish-openapi prescribes (#129).

import { Request, Response, Router } from 'express';
import cors from 'cors';

import { OpenApiDocument, readOpenApiDocument } from '../openapi/document';
import { getErrorMessage } from '../utils/errors';
import logger from '../utils/logger';

export function createOpenApiRouter(load: () => OpenApiDocument = readOpenApiDocument): Router {
  const router = Router();
  let cached: OpenApiDocument | undefined;

  // Fully open CORS: /core/publish-openapi requires that any origin can fetch the
  // document, so a browser-based viewer can load it. Kept although index.ts
  // already applies it, so the router is correct when mounted on its own, as its
  // tests do. Public, read-only, no credentials; see utils/publicPaths.ts.
  // nosemgrep: javascript.express.web.cors-permissive-express.cors-permissive-express
  router.use(cors({ origin: '*', methods: ['GET', 'OPTIONS'] }));

  router.get('/', (_req: Request, res: Response) => {
    try {
      // Read once: the file is part of the deploy artifact and changes only with
      // a redeploy, which restarts the process. A failed read is not cached.
      cached ??= load();
      res.json(cached);
    } catch (err) {
      logger.error('[openapi] document unavailable', { error: getErrorMessage(err) });
      res.status(500).json({
        success: false,
        error: {
          code: 'OPENAPI_UNAVAILABLE',
          message: 'The OpenAPI description is not available',
        },
      });
    }
  });

  return router;
}

export default createOpenApiRouter();
```

- [ ] **Step 5: Run the route tests to verify they pass**

Run from `packages/backend`: `npx jest --config jest.config.js src/routes/openapi.routes.test.ts --coverage=false`
Expected: PASS, 5 tests.

- [ ] **Step 6: Register the mount and grant it public CORS, tests first**

In `packages/backend/src/routes/registry.test.ts`, replace the body of `test('is set on exactly the read-only public endpoints', ...)` with:

```ts
    const publicMounts = routeRegistry.filter((r) => r.publicCors).map((r) => r.mount);

    expect(publicMounts.sort()).toEqual([
      '/v1/bundles/public',
      '/v1/openapi.json',
      '/v1/ropa/public',
    ]);
```

In `packages/backend/src/utils/publicPaths.test.ts`, change the first `test.each` list from `['/v1/ropa/public', '/v1/bundles/public']` to `['/v1/ropa/public', '/v1/bundles/public', '/v1/openapi.json']`. Then add this block directly after the sibling-route `test.each`:

```ts
  // /core/publish-openapi: the document must be readable from any origin.
  test('does not treat a path that merely starts with the document name as public', () => {
    expect(isPublicPath('/v1/openapi.jsonp')).toBe(false);
  });
```

Run from `packages/backend`: `npx jest --config jest.config.js src/routes/registry.test.ts src/utils/publicPaths.test.ts --coverage=false`
Expected: FAIL. `registry.test.ts` lacks `/v1/openapi.json`, and `publicPaths` returns `false` for `/v1/openapi.json`.

In `packages/backend/src/routes/registry.ts`, add `import openapiRoutes from './openapi.routes';` after `import shaclRoutes from './shacl.routes';`. Then add this entry directly after the `/v1/norms` entry (the last one under `// Discovery`):

```ts
  {
    mount: '/v1/openapi.json',
    router: openapiRoutes,
    summary: 'OpenAPI 3.1 description of this API',
    category: 'Discovery',
    publicCors: true,
  },
```

In `packages/backend/src/utils/publicPaths.ts`, make two changes:

- In the header comment, after the sentence ending `...for /v1/bundles/public.`, add: `/v1/openapi.json serves the API's OpenAPI description, which /core/publish-openapi requires to be readable from any origin.`
- Change `const PUBLIC_MOUNTS = ['/v1/ropa/public', '/v1/bundles/public'];` to:

```ts
const PUBLIC_MOUNTS = ['/v1/ropa/public', '/v1/bundles/public', '/v1/openapi.json'];
```

- [ ] **Step 7: Run everything that reads the registry**

Run from `packages/backend`: `npx jest --config jest.config.js src/routes/openapi.routes.test.ts src/routes/registry.test.ts src/routes/index.test.ts src/utils/publicPaths.test.ts src/utils/rootViews.test.ts --coverage=false`
Expected: PASS, all suites.

Run from `packages/backend`: `npm run typecheck && npm run lint && npm run check-format`
Expected: all clean.

- [ ] **Step 8: Stage and stop for approval**

```bash
git add packages/backend/openapi/openapi.yaml packages/backend/src/routes/openapi.routes.ts packages/backend/src/routes/openapi.routes.test.ts packages/backend/src/routes/registry.ts packages/backend/src/routes/registry.test.ts packages/backend/src/utils/publicPaths.ts packages/backend/src/utils/publicPaths.test.ts
git status --short
```

Proposed message: `feat(backend): serve the OpenAPI description at /v1/openapi.json (#133)`. Do not commit until the user approves.

---

### Task 4: Route coverage gate and the pending list

**Files:**

- Create: `packages/backend/src/openapi/testing/routeOperations.ts`
- Test: `packages/backend/src/openapi/testing/routeOperations.test.ts`
- Create: `packages/backend/src/openapi/coverage.test.ts`
- Create: `packages/backend/openapi/pending.json`

**Interfaces:**

- Consumes: `routeRegistry`, `RouteDefinition` from `src/routes/registry.ts`; `OpenApiDocument`, `readOpenApiDocument` (Task 1).
- Produces:
  - `HTTP_METHODS: readonly ['get', 'post', 'put', 'patch', 'delete']`
  - `toDocumentPath(mount: string, routePath: string): string`
  - `listServedOperations(routes: ReadonlyArray<Pick<RouteDefinition, 'mount' | 'router'>>): string[]`
  - `listDocumentedOperations(document: OpenApiDocument): string[]`
  - Operations are strings like `"GET /dmns/{identifier}/xml"`, sorted.

- [ ] **Step 1: Write the failing unit tests**

Create `packages/backend/src/openapi/testing/routeOperations.test.ts`:

```ts
import cors from 'cors';
import { Router } from 'express';

import type { OpenApiDocument } from '../document';
import { listDocumentedOperations, listServedOperations, toDocumentPath } from './routeOperations';

const handler = () => undefined;

describe('toDocumentPath', () => {
  test.each([
    ['/v1/health', '/', '/health'],
    ['/v1/dmns', '/:identifier/xml', '/dmns/{identifier}/xml'],
    ['/v1/chains/templates', '/categories/list', '/chains/templates/categories/list'],
    ['/v1/assets', '/bpmn/by-bpmn-id/:bpmnProcessId', '/assets/bpmn/by-bpmn-id/{bpmnProcessId}'],
  ])('%s + %s is %s', (mount, routePath, expected) => {
    expect(toDocumentPath(mount, routePath)).toBe(expected);
  });

  test('rejects a mount outside /v1', () => {
    expect(() => toDocumentPath('/api/health', '/')).toThrow('/api/health is not a /v1 mount');
  });
});

describe('listServedOperations', () => {
  test('lists every method of every route and skips middleware', () => {
    const router = Router();
    router.use(cors());
    router.get('/', handler);
    router.route('/:id').get(handler).delete(handler);

    expect(listServedOperations([{ mount: '/v1/things', router }])).toEqual([
      'DELETE /things/{id}',
      'GET /things',
      'GET /things/{id}',
    ]);
  });

  // Each of these would otherwise be skipped or misread, leaving an operation
  // the coverage gate never sees.
  test('fails loudly on a nested router', () => {
    const router = Router();
    router.use('/sub', Router());

    expect(() => listServedOperations([{ mount: '/v1/things', router }])).toThrow(
      '/v1/things: nested routers are not supported'
    );
  });

  test('fails loudly on router.all', () => {
    const router = Router();
    router.all('/', handler);

    expect(() => listServedOperations([{ mount: '/v1/things', router }])).toThrow(
      '/v1/things/: unsupported method _all'
    );
  });

  test('fails loudly on a regular-expression route path', () => {
    const router = Router();
    router.get(/^\/x$/, handler);

    expect(() => listServedOperations([{ mount: '/v1/things', router }])).toThrow(
      '/v1/things: only string route paths are supported'
    );
  });
});

describe('listDocumentedOperations', () => {
  test('lists operations and ignores path-level keys', () => {
    const document: OpenApiDocument = {
      openapi: '3.1.0',
      info: { title: 'Fixture', version: '1.0.0' },
      paths: {
        '/a': { summary: 'A', parameters: [], get: {}, post: {} },
        '/b': { delete: {} },
      },
    };

    expect(listDocumentedOperations(document)).toEqual(['DELETE /b', 'GET /a', 'POST /a']);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run from `packages/backend`: `npx jest --config jest.config.js src/openapi/testing/routeOperations.test.ts --coverage=false`
Expected: FAIL with `Cannot find module './routeOperations'`.

- [ ] **Step 3: Implement the operation listing**

Create `packages/backend/src/openapi/testing/routeOperations.ts`:

```ts
// packages/backend/src/openapi/testing/routeOperations.ts
//
// The operations Express actually serves under /v1, and the operations the
// OpenAPI document describes, in one notation ("GET /dmns/{identifier}/xml"),
// so src/openapi/coverage.test.ts can compare them (#129).
//
// Anything the walk cannot read reliably (a nested router, router.all, a
// regular-expression path) throws. Skipping it would hide an operation from the
// gate, which is the failure the gate exists to prevent. None exist today.

import type { RouteDefinition } from '../../routes/registry';
import type { OpenApiDocument } from '../document';

export const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

interface StackLayer {
  name?: string;
  route?: { path: unknown; methods: Record<string, boolean> };
}

/** '/v1/dmns' + '/:identifier/xml' is '/dmns/{identifier}/xml'. */
export function toDocumentPath(mount: string, routePath: string): string {
  if (!mount.startsWith('/v1/')) throw new Error(`${mount} is not a /v1 mount`);

  const subPath = routePath === '/' ? '' : routePath;
  return `${mount.slice('/v1'.length)}${subPath}`.replace(/:(\w+)/g, '{$1}');
}

export function listServedOperations(
  routes: ReadonlyArray<Pick<RouteDefinition, 'mount' | 'router'>>
): string[] {
  const operations: string[] = [];

  for (const { mount, router } of routes) {
    for (const layer of (router as unknown as { stack: StackLayer[] }).stack) {
      if (layer.name === 'router') throw new Error(`${mount}: nested routers are not supported`);
      if (!layer.route) continue; // middleware, such as cors()

      const { path: routePath, methods } = layer.route;
      if (typeof routePath !== 'string') {
        throw new Error(`${mount}: only string route paths are supported`);
      }

      for (const method of Object.keys(methods)) {
        if (!(HTTP_METHODS as readonly string[]).includes(method)) {
          throw new Error(`${mount}${routePath}: unsupported method ${method}`);
        }
        operations.push(`${method.toUpperCase()} ${toDocumentPath(mount, routePath)}`);
      }
    }
  }

  return operations.sort();
}

export function listDocumentedOperations(document: OpenApiDocument): string[] {
  const operations: string[] = [];

  for (const [documentPath, pathItem] of Object.entries(document.paths)) {
    for (const method of HTTP_METHODS) {
      if (method in pathItem) operations.push(`${method.toUpperCase()} ${documentPath}`);
    }
  }

  return operations.sort();
}
```

Run from `packages/backend`: `npx jest --config jest.config.js src/openapi/testing/routeOperations.test.ts --coverage=false`
Expected: PASS, 10 tests.

- [ ] **Step 4: Write the coverage gate**

Create `packages/backend/src/openapi/coverage.test.ts`:

```ts
// Keeps openapi/openapi.yaml, openapi/pending.json and the Express routes in step
// (#129). pending.json lists operations not described yet; the list may only
// shrink, and #137 empties it.

// The real registry is imported, as in routes/registry.test.ts: only db/pool is
// stubbed, since importing it for real would open a Postgres connection the run
// never closes.
jest.mock('../db/pool', () => ({ __esModule: true, default: null }));
jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));
// ESM-only dependencies of the SHACL service that Jest's CommonJS runtime cannot
// load; see routes/registry.test.ts.
jest.mock('@rdfjs/dataset', () => ({ __esModule: true, default: { dataset: () => ({}) } }));
jest.mock('rdf-validate-shacl', () => ({ __esModule: true, default: class {} }));

import fs from 'fs';
import path from 'path';

import { routeRegistry } from '../routes/registry';
import { readOpenApiDocument } from './document';
import { listDocumentedOperations, listServedOperations } from './testing/routeOperations';

const PENDING_PATH = path.resolve(__dirname, '../../openapi/pending.json');

const pending: string[] = JSON.parse(fs.readFileSync(PENDING_PATH, 'utf8'));
const served = listServedOperations(routeRegistry);
const documented = listDocumentedOperations(readOpenApiDocument());

describe('OpenAPI coverage of the /v1 routes', () => {
  test('every served operation is documented or pending', () => {
    expect(served.filter((op) => !documented.includes(op) && !pending.includes(op))).toEqual([]);
  });

  test('no pending operation is already documented', () => {
    expect(pending.filter((op) => documented.includes(op))).toEqual([]);
  });

  test('every pending operation is still served', () => {
    expect(pending.filter((op) => !served.includes(op))).toEqual([]);
  });

  test('every documented operation is served', () => {
    expect(documented.filter((op) => !served.includes(op))).toEqual([]);
  });

  test('pending lists each operation once', () => {
    expect(new Set(pending).size).toBe(pending.length);
  });
});
```

Run from `packages/backend`: `npx jest --config jest.config.js src/openapi/coverage.test.ts --coverage=false`
Expected: FAIL with `ENOENT` for `openapi/pending.json`.

- [ ] **Step 5: Create the pending list**

Create `packages/backend/openapi/pending.json`. It holds all 65 operations served on `acc` at 5530720, the state before this plan; `GET /openapi.json`, added and documented in Task 3, is not among them. Task 5, #134, #135, #136 and #137 remove entries.

```json
[
  "GET /assets/bpmn",
  "POST /assets/bpmn",
  "GET /assets/bpmn/by-bpmn-id/{bpmnProcessId}",
  "DELETE /assets/bpmn/{id}",
  "PATCH /assets/bpmn/{id}/deploy",
  "GET /assets/documents",
  "POST /assets/documents",
  "DELETE /assets/documents/{id}",
  "GET /assets/forms",
  "POST /assets/forms",
  "DELETE /assets/forms/{id}",
  "GET /assets/ropa",
  "POST /assets/ropa",
  "GET /assets/ropa/by-bpmn-id/{bpmnProcessId}",
  "DELETE /assets/ropa/{id}",
  "GET /bundles/public",
  "DELETE /cache/clear",
  "GET /cache/stats",
  "GET /chains",
  "POST /chains/execute",
  "GET /chains/templates",
  "GET /chains/templates/categories/list",
  "GET /chains/templates/tags/list",
  "GET /chains/templates/{id}",
  "GET /dmns",
  "GET /dmns/cycles",
  "POST /dmns/deploy",
  "POST /dmns/drd/deploy",
  "GET /dmns/enhanced-chain-links",
  "POST /dmns/evaluate/{decisionKey}",
  "POST /dmns/process/deploy",
  "GET /dmns/semantic-equivalences",
  "POST /dmns/validate",
  "GET /dmns/{identifier}",
  "GET /dmns/{identifier}/xml",
  "GET /dso/activiteiten",
  "POST /dso/activiteiten/oin",
  "POST /dso/activiteiten/zoek",
  "GET /dso/activiteiten/{urn}",
  "GET /dso/begrippen",
  "GET /dso/toepasbare-regels",
  "GET /dso/toepasbare-regels/{id}/dmn",
  "GET /dso/toepasbare-regels/{id}/form-scaffold",
  "GET /dso/toepasbare-regels/{id}/sttr",
  "POST /dso/werkzaamheden/suggereer",
  "POST /dso/werkzaamheden/zoek",
  "GET /dso/werkzaamheden/{urn}",
  "POST /edocs/documents",
  "GET /edocs/status",
  "POST /edocs/workspaces/ensure",
  "GET /edocs/workspaces/{workspaceId}/documents",
  "GET /health",
  "GET /norms",
  "GET /process/{key}/variable-hints",
  "GET /ropa/public",
  "POST /shacl/validate",
  "POST /shacl/validate-merged",
  "GET /triplydb/assets",
  "GET /triplydb/health",
  "POST /triplydb/list-graphs",
  "POST /triplydb/query",
  "POST /triplydb/test-connection",
  "POST /triplydb/update-service",
  "GET /vendors",
  "GET /vendors/dmn/{identifier}"
]
```

Run from `packages/backend`: `npx jest --config jest.config.js src/openapi/coverage.test.ts --coverage=false`
Expected: PASS, 5 tests. If the first test lists operations, a route has been added on `acc` since 5530720. Add exactly those strings to `pending.json`, and mention them when reporting.

- [ ] **Step 6: Prove the gate bites**

Temporarily delete the line `"GET /norms",` from `pending.json` and rerun the command from Step 5.
Expected: FAIL in `every served operation is documented or pending`, with `["GET /norms"]` in the received value.

Restore the line, rerun, and expect PASS. Confirm the restore from `packages/backend` with `node -e "console.log(require('./openapi/pending.json').length)"`, which prints `65`.

- [ ] **Step 7: Stage and stop for approval**

Run from `packages/backend`: `npm run typecheck && npm run lint && npm run check-format`
Expected: all clean.

```bash
git add packages/backend/src/openapi/testing/routeOperations.ts packages/backend/src/openapi/testing/routeOperations.test.ts packages/backend/src/openapi/coverage.test.ts packages/backend/openapi/pending.json
git status --short
```

Proposed message: `test(backend): fail when a /v1 route is neither documented nor pending (#133)`. Do not commit until the user approves.

---

### Task 5: Describe `/health`, `/ropa/public` and `/bundles/public`

**Files:**

- Modify: `packages/backend/openapi/openapi.yaml`
- Modify: `packages/backend/openapi/pending.json`
- Modify: `packages/backend/src/routes/health.routes.test.ts`
- Modify: `packages/backend/src/routes/ropa.public.routes.test.ts`
- Modify: `packages/backend/src/routes/assets.public.routes.test.ts`

**Interfaces:**

- Consumes: `expectToMatchOperation` (Task 2); the coverage gate (Task 4); `versionMiddleware` from `src/middleware/version.middleware.ts`.
- Produces: document operations `GET /health`, `GET /ropa/public`, `GET /bundles/public`; schemas `Health`, `BuildInfo`, `DependencyStatus`, `ShaclLayerStatus`, `PublicRopaRecord`, `RopaPersonalDataField`, `PublicBundle`, `NamedArtefact`.

- [ ] **Step 1: Assert the documented contract in the health tests**

In `packages/backend/src/routes/health.routes.test.ts`, add `import { expectToMatchOperation } from '../openapi/testing/conformance';` after `import healthRoutes from './health.routes';`.

Then add `expectToMatchOperation(res, 'get', '/health');` as the last line of each of these tests:

- `returns 200 healthy when both TriplyDB and Operaton are up`
- `returns 503 degraded when TriplyDB reports down`
- `an unexpected failure yields a 503 unhealthy envelope`
- `an untracked build is reported without changing the health status`
- `a failure reading the shape status reports the set incomplete, not the API unhealthy`

- [ ] **Step 2: Assert it in the public route tests**

Replace `packages/backend/src/routes/ropa.public.routes.test.ts` with:

```ts
import express from 'express';
import request from 'supertest';

jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
jest.mock('../services/ropa.service', () => ({ listPublicRopa: jest.fn() }));

import { versionMiddleware } from '../middleware/version.middleware';
import { expectToMatchOperation } from '../openapi/testing/conformance';
import { listPublicRopa } from '../services/ropa.service';
import ropaPublicRoutes from './ropa.public.routes';

const mockListPublicRopa = listPublicRopa as jest.Mock;

// Shaped like listPublicRopa's output: mapRopaRecord without schemaVersion,
// controllerContact and dpoContact, with dates as ISO strings.
const RECORD = {
  id: '6f1c2d3e-4a5b-4c6d-8e7f-000000000001',
  bpmnProcessId: 'ZorgtoeslagProcess',
  processLevel: 'shell',
  title: 'Zorgtoeslag',
  controllerName: 'Provincie Flevoland',
  purpose: 'Beoordelen van aanvragen',
  legalBasisUri: 'https://wetten.overheid.nl/BWBR0018451',
  legalBasisLabel: 'Wet op de zorgtoeslag',
  gdprArticle: '6(1)(e)',
  dataSubjects: 'Aanvragers',
  recipients: 'Belastingdienst',
  thirdCountryTransfers: false,
  retentionPeriod: '7 jaar',
  securityMeasures: 'Versleuteling in rust en tijdens transport',
  status: 'active',
  personalDataFields: [
    {
      id: '6f1c2d3e-4a5b-4c6d-8e7f-000000000002',
      ropaRecordId: '6f1c2d3e-4a5b-4c6d-8e7f-000000000001',
      formId: 'aanvraag',
      fieldKey: 'bsn',
      fieldLabel: 'BSN',
      dataCategory: 'identificatie',
      specialCategory: false,
      sortOrder: 0,
    },
  ],
  createdAt: '2026-09-01T08:00:00.000Z',
  updatedAt: '2026-09-10T08:00:00.000Z',
};

function makeApp() {
  const app = express();
  app.use(versionMiddleware); // app-wide in index.ts
  app.use('/v1/ropa-public', ropaPublicRoutes);
  return app;
}

beforeEach(() => {
  mockListPublicRopa.mockReset();
});

describe('GET /v1/ropa-public', () => {
  test('returns the public ROPA list, as documented', async () => {
    mockListPublicRopa.mockResolvedValue([RECORD]);

    const res = await request(makeApp()).get('/v1/ropa-public');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: [RECORD] });
    expectToMatchOperation(res, 'get', '/ropa/public');
  });

  test('forwards the organisation query param', async () => {
    mockListPublicRopa.mockResolvedValue([]);

    await request(makeApp()).get('/v1/ropa-public').query({ organisation: 'Flevoland' });

    expect(mockListPublicRopa).toHaveBeenCalledWith('Flevoland');
  });

  // The document closes the record schema, so it states that internal contacts
  // are never published. A record that leaked one would break the contract.
  test('a record carrying an internal contact does not match the document', async () => {
    mockListPublicRopa.mockResolvedValue([{ ...RECORD, controllerContact: 'privacy@example.nl' }]);

    const res = await request(makeApp()).get('/v1/ropa-public');

    expect(() => expectToMatchOperation(res, 'get', '/ropa/public')).toThrow(
      /must NOT have additional properties/
    );
  });

  test('returns 500 with the error message when the service throws, as documented', async () => {
    mockListPublicRopa.mockRejectedValue(new Error('db unavailable'));

    const res = await request(makeApp()).get('/v1/ropa-public');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      success: false,
      error: { code: 'LIST_FAILED', message: 'db unavailable' },
    });
    expectToMatchOperation(res, 'get', '/ropa/public');
  });
});
```

Replace `packages/backend/src/routes/assets.public.routes.test.ts` with:

```ts
import express from 'express';
import request from 'supertest';

jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
jest.mock('../services/assets.service', () => ({ listPublicBundles: jest.fn() }));

import { versionMiddleware } from '../middleware/version.middleware';
import { expectToMatchOperation } from '../openapi/testing/conformance';
import { listPublicBundles } from '../services/assets.service';
import assetsPublicRoutes from './assets.public.routes';

const mockListPublicBundles = listPublicBundles as jest.Mock;

// Shaped like listPublicBundles' output after JSON serialisation: optional
// columns that are NULL are omitted, and Dates become ISO strings.
const BUNDLE = {
  id: 'zorgtoeslag-shell',
  bpmnProcessId: 'ZorgtoeslagProcess',
  name: 'Zorgtoeslag',
  processRole: 'shell',
  linkedDmnTemplates: ['zorgtoeslag-berekening'],
  status: 'wip',
  deployedAt: '2026-09-10T08:00:00.000Z',
  operatonDeploymentId: 'a1b2c3',
  deployedForms: [{ id: 'aanvraag', name: 'Aanvraagformulier' }],
  deployedDocuments: [],
  subprocesses: [
    { id: 'zorgtoeslag-toets', name: 'Toets', bpmnProcessId: 'ZorgtoeslagToets', status: 'wip' },
  ],
  organization: 'flevoland',
  updatedAt: '2026-09-10T08:00:00.000Z',
};

function makeApp() {
  const app = express();
  app.use(versionMiddleware); // app-wide in index.ts
  app.use('/v1/assets-public', assetsPublicRoutes);
  return app;
}

beforeEach(() => {
  mockListPublicBundles.mockReset();
});

describe('GET /v1/assets-public', () => {
  test('returns the public bundle list, as documented', async () => {
    mockListPublicBundles.mockResolvedValue([BUNDLE]);

    const res = await request(makeApp()).get('/v1/assets-public');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: [BUNDLE] });
    expectToMatchOperation(res, 'get', '/bundles/public');
  });

  test('returns 500 with the error message when the service throws, as documented', async () => {
    mockListPublicBundles.mockRejectedValue(new Error('db unavailable'));

    const res = await request(makeApp()).get('/v1/assets-public');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      success: false,
      error: { code: 'LIST_FAILED', message: 'db unavailable' },
    });
    expectToMatchOperation(res, 'get', '/bundles/public');
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run from `packages/backend`: `npx jest --config jest.config.js src/routes/health.routes.test.ts src/routes/ropa.public.routes.test.ts src/routes/assets.public.routes.test.ts --coverage=false`
Expected: FAIL. The tests that call `expectToMatchOperation` throw `GET /health is not documented`, `GET /ropa/public is not documented` and `GET /bundles/public is not documented`.

- [ ] **Step 4: Describe the three operations**

Replace `packages/backend/openapi/openapi.yaml` with the complete file below. It keeps everything from Tasks 1 and 3, and adds two tags, three paths and eight schemas.

```yaml
# packages/backend/openapi/openapi.yaml
#
# The OpenAPI description of the Linked Data Explorer backend, written by hand
# (#129). Served as JSON at /v1/openapi.json. scripts/build-openapi.cjs builds
# openapi.json from this file and sets info.version from package.json, so this
# file must not set info.version.
#
# Operations not described yet are listed in pending.json;
# src/openapi/coverage.test.ts keeps both in step with the Express routes, and
# route tests check real responses against this file (expectToMatchOperation).
openapi: '3.1.0'
info:
  title: Linked Data Explorer Backend
  description: >-
    DMN discovery and chain execution, SHACL validation, asset storage and
    integrations for the Linked Data Explorer.

    Error responses use the `{ success: false, error }` envelope described by
    the ErrorEnvelope schema. The move to RFC 9457 problem details is tracked in
    https://github.com/sgort/linked-data-explorer/issues/131.
  contact:
    name: Steven Gort
    email: steven.gort@ictu.nl
    url: https://iou-architectuur.open-regels.nl/
servers:
  - url: https://backend.linkeddata.open-regels.nl/v1
    description: Production
  - url: https://acc.backend.linkeddata.open-regels.nl/v1
    description: Acceptance
tags:
  - name: Health & monitoring
    description: Whether this instance, its build and its dependencies are working.
  - name: Discovery
    description: What the API and its data offer.
  - name: Assets
    description: Published processes and records of processing activities.
paths:
  /health:
    get:
      operationId: getHealth
      tags: [Health & monitoring]
      summary: Service health, build and dependency status
      description: >-
        200 when TriplyDB and Operaton are reachable, 503 otherwise. An
        incomplete SHACL shape set or an untracked build is reported in the body
        but never changes the status.
      responses:
        '200':
          description: Healthy.
          headers:
            API-Version:
              $ref: '#/components/headers/ApiVersion'
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Health'
        '503':
          description: >-
            Degraded (a dependency is down) or unhealthy (the check itself
            failed; `error` says why).
          headers:
            API-Version:
              $ref: '#/components/headers/ApiVersion'
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Health'
  /openapi.json:
    get:
      operationId: getOpenApiDescription
      tags: [Discovery]
      summary: This OpenAPI description
      description: >-
        The published contract of this API (/core/publish-openapi). Served with
        `Access-Control-Allow-Origin: *`, so any OpenAPI viewer can load it.
      responses:
        '200':
          description: The OpenAPI 3.1 document.
          headers:
            API-Version:
              $ref: '#/components/headers/ApiVersion'
            Access-Control-Allow-Origin:
              description: Always `*`.
              schema:
                type: string
                const: '*'
          content:
            application/json:
              schema:
                type: object
                required: [openapi, info, paths]
                properties:
                  openapi:
                    type: string
                    const: '3.1.0'
        '500':
          description: The document could not be read.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  /ropa/public:
    get:
      operationId: listPublicRopaRecords
      tags: [Assets]
      summary: Active records of processing activities (GDPR Article 30)
      description: >-
        Public and read-only, with open CORS. Returns active records only,
        without the controller contact, the DPO contact or the schema version.
      parameters:
        - name: organisation
          in: query
          required: false
          description: Case-insensitive substring match on the controller name.
          schema:
            type: string
      responses:
        '200':
          description: The active records, most recently updated first.
          headers:
            API-Version:
              $ref: '#/components/headers/ApiVersion'
          content:
            application/json:
              schema:
                type: object
                required: [success, data]
                properties:
                  success:
                    const: true
                  data:
                    type: array
                    items:
                      $ref: '#/components/schemas/PublicRopaRecord'
        '500':
          description: The records could not be read.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  /bundles/public:
    get:
      operationId: listPublicBundles
      tags: [Assets]
      summary: Deployed BPMN bundles with their forms, documents and subprocesses
      description: >-
        Public and read-only, with open CORS. Returns shell and standalone
        processes that have been deployed, most recently deployed first.
      responses:
        '200':
          description: The deployed bundles.
          headers:
            API-Version:
              $ref: '#/components/headers/ApiVersion'
          content:
            application/json:
              schema:
                type: object
                required: [success, data]
                properties:
                  success:
                    const: true
                  data:
                    type: array
                    items:
                      $ref: '#/components/schemas/PublicBundle'
        '500':
          description: The bundles could not be read.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
components:
  headers:
    ApiVersion:
      description: Full release version of the API (/core/version-header).
      required: true
      schema:
        type: string
        examples:
          - '2026.09.4'
  schemas:
    ErrorEnvelope:
      type: object
      description: >-
        The error body the backend returns today. Not RFC 9457 problem details;
        see https://github.com/sgort/linked-data-explorer/issues/131.
      required: [success, error]
      properties:
        success:
          const: false
        error:
          type: object
          required: [code, message]
          properties:
            code:
              type: string
              examples: [LIST_FAILED]
            message:
              type: string
            details:
              type: string
        timestamp:
          type: string
          format: date-time
    Health:
      type: object
      required:
        [name, version, environment, build, status, uptime, timestamp, services, shacl, documentation]
      properties:
        name:
          type: string
        version:
          type: string
          description: Release version; the same value as the API-Version header.
        environment:
          type: string
        build:
          $ref: '#/components/schemas/BuildInfo'
        status:
          type: string
          enum: [healthy, degraded, unhealthy]
        uptime:
          type: number
          description: Process uptime in seconds.
        timestamp:
          type: string
          format: date-time
        services:
          type: object
          required: [triplydb, operaton]
          properties:
            triplydb:
              $ref: '#/components/schemas/DependencyStatus'
            operaton:
              $ref: '#/components/schemas/DependencyStatus'
        shacl:
          $ref: '#/components/schemas/ShaclLayerStatus'
        documentation:
          type: string
          examples: [/v1/openapi.json]
        error:
          type: string
          description: Present only when status is unhealthy.
    BuildInfo:
      type: object
      description: >-
        The build this instance runs, recorded in the deploy artifact (#122).
        isTracked is true only when both sha and run are present; otherwise the
        label is "local build".
      required: [sha, shortSha, run, isTracked, label]
      properties:
        sha:
          type: string
          description: Full commit SHA, or empty when untracked.
        shortSha:
          type: string
        run:
          type: string
          description: GitHub Actions run number, or empty when untracked.
        isTracked:
          type: boolean
        label:
          type: string
          examples: ['build 5530720 · #135', local build]
    DependencyStatus:
      type: object
      required: [status, latency, lastCheck]
      properties:
        status:
          type: string
          enum: [up, down, unknown]
        latency:
          type: number
          description: Round trip in milliseconds; 0 when not measured.
        lastCheck:
          type: string
          format: date-time
    ShaclLayerStatus:
      type: object
      description: >-
        Which SHACL shape layers loaded. Reported only; never changes the health
        status. `layers` is present when the status was read, `error` when
        reading it failed, and neither when the health check itself failed
        before reaching it (status unhealthy).
      required: [complete]
      properties:
        complete:
          type: boolean
        layers:
          type: object
          additionalProperties:
            type: object
            required: [label, loaded]
            properties:
              label:
                type: string
              loaded:
                type: boolean
        error:
          type: string
    PublicRopaRecord:
      type: object
      description: >-
        A record of processing activities as published. Closed: internal fields
        such as the controller and DPO contacts are never included.
      additionalProperties: false
      required:
        - id
        - bpmnProcessId
        - processLevel
        - title
        - controllerName
        - purpose
        - legalBasisUri
        - legalBasisLabel
        - gdprArticle
        - dataSubjects
        - recipients
        - thirdCountryTransfers
        - retentionPeriod
        - securityMeasures
        - status
        - personalDataFields
        - createdAt
        - updatedAt
      properties:
        id:
          type: string
          format: uuid
        bpmnProcessId:
          type: string
        processLevel:
          type: string
          enum: [shell, subprocess]
        title:
          type: string
        controllerName:
          type: string
        purpose:
          type: string
        legalBasisUri:
          type: string
        legalBasisLabel:
          type: string
        gdprArticle:
          type: string
        dataSubjects:
          type: string
        recipients:
          type: string
        thirdCountryTransfers:
          type: boolean
        thirdCountryDetails:
          type: string
          description: Omitted when there are no third-country transfer details.
        retentionPeriod:
          type: string
        securityMeasures:
          type: string
        status:
          type: string
          const: active
        personalDataFields:
          type: array
          items:
            $ref: '#/components/schemas/RopaPersonalDataField'
        createdAt:
          type: string
          format: date-time
        updatedAt:
          type: string
          format: date-time
    RopaPersonalDataField:
      type: object
      additionalProperties: false
      required:
        [id, ropaRecordId, formId, fieldKey, fieldLabel, dataCategory, specialCategory, sortOrder]
      properties:
        id:
          type: string
          format: uuid
        ropaRecordId:
          type: string
          format: uuid
        formId:
          type: string
        fieldKey:
          type: string
        fieldLabel:
          type: string
        dataCategory:
          type: string
        specialCategory:
          type: boolean
        sortOrder:
          type: integer
    PublicBundle:
      type: object
      description: A deployed shell or standalone process with its deployed artefacts.
      additionalProperties: false
      required:
        - id
        - bpmnProcessId
        - name
        - processRole
        - linkedDmnTemplates
        - status
        - deployedAt
        - deployedForms
        - deployedDocuments
        - subprocesses
        - updatedAt
      properties:
        id:
          type: string
        bpmnProcessId:
          type: string
        name:
          type: string
        description:
          type: string
        processRole:
          type: string
          enum: [shell, standalone]
        linkedDmnTemplates:
          type: array
          items:
            type: string
        status:
          type: string
          enum: [example, wip, e2e]
        deployedAt:
          type: string
          format: date-time
        operatonUrl:
          type: string
        operatonDeploymentId:
          type: string
        deployedForms:
          type: array
          items:
            $ref: '#/components/schemas/NamedArtefact'
        deployedDocuments:
          type: array
          items:
            $ref: '#/components/schemas/NamedArtefact'
        subprocesses:
          type: array
          items:
            type: object
            additionalProperties: false
            required: [id, name, bpmnProcessId, status]
            properties:
              id:
                type: string
              name:
                type: string
              bpmnProcessId:
                type: string
              status:
                type: string
                enum: [example, wip, e2e]
        language:
          type: string
          maxLength: 2
        organization:
          type: string
        boardOwner:
          type: string
        updatedAt:
          type: string
          format: date-time
    NamedArtefact:
      type: object
      additionalProperties: false
      required: [id, name]
      properties:
        id:
          type: string
        name:
          type: string
```

- [ ] **Step 5: Remove the three operations from the pending list**

In `packages/backend/openapi/pending.json`, delete these three lines:

```
  "GET /bundles/public",
  "GET /health",
  "GET /ropa/public",
```

- [ ] **Step 6: Run the tests to verify they pass**

Run from `packages/backend`: `npx jest --config jest.config.js src/routes/health.routes.test.ts src/routes/ropa.public.routes.test.ts src/routes/assets.public.routes.test.ts src/routes/openapi.routes.test.ts src/openapi --coverage=false`
Expected: PASS, all suites. The coverage gate now sees 66 served operations: four documented and 62 pending.

If a health test fails with `does not match the document`, the message names the property. Correct the schema to what the handler actually returns, never the handler to the schema. This phase documents, it does not change behaviour.

- [ ] **Step 7: Stage and stop for approval**

Run from `packages/backend`: `npm run typecheck && npm run lint && npm run check-format`
Expected: all clean.

```bash
git add packages/backend/openapi/openapi.yaml packages/backend/openapi/pending.json packages/backend/src/routes/health.routes.test.ts packages/backend/src/routes/ropa.public.routes.test.ts packages/backend/src/routes/assets.public.routes.test.ts
git status --short
```

Proposed message: `docs(backend): describe /health and the public read-only endpoints in OpenAPI (#133)`. Do not commit until the user approves.

---

### Task 6: Lint against the NL API Design Rules

**Files:**

- Create: `packages/backend/openapi/adr-ruleset-2.2.1.yaml`
- Create: `packages/backend/openapi/.spectral.yaml`
- Modify: `packages/backend/package.json` (script `lint:openapi`)

**Interfaces:**

- Consumes: the built document (Task 1) with the four operations (Tasks 3 and 5).
- Produces: `npm run lint:openapi`, which exits non-zero on any ADR violation not excepted in `.spectral.yaml`.

- [ ] **Step 1: Fetch the ruleset and verify its hash**

Run from `packages/backend`:

```bash
curl -fsSL https://gitdocumentatie.logius.nl/publicatie/api/adr/2.2.1/media/linter.yaml -o openapi/adr-upstream.yaml
sha256sum openapi/adr-upstream.yaml
```

Expected: `446423f5de90232282bb7add03bc9818a13ee1ae3be79fe88acacba00a5aad04`. If the hash differs, stop and report it. Upstream has changed since the design was written, and the new content must be reviewed before it gates anything.

- [ ] **Step 2: Vendor it with a provenance header**

Use the Write tool, not a heredoc, to create `packages/backend/openapi/adr-ruleset-header.txt` with exactly these 13 lines:

```
# Vendored copy of the NL API Design Rules 2.2.1 Spectral ruleset (Logius).
#
#   Source:  https://gitdocumentatie.logius.nl/publicatie/api/adr/2.2.1/media/linter.yaml
#   Fetched: 2026-09-15
#   sha256:  446423f5de90232282bb7add03bc9818a13ee1ae3be79fe88acacba00a5aad04
#            (of the upstream file: everything below the divider line)
#
# Vendored, not fetched in CI, so the gate changes only with a commit: the
# unversioned https://static.developer.overheid.nl/adr/ruleset.yaml redirected
# to the 2.1.0 ruleset on the fetch date. Exceptions belong in .spectral.yaml,
# never in this file. To update, replace everything below the divider with a
# newer version's file and record its URL, date and hash above.
# ---------------------------------------------------------------------------
```

Then run from `packages/backend`:

```bash
cat openapi/adr-ruleset-header.txt openapi/adr-upstream.yaml > openapi/adr-ruleset-2.2.1.yaml
rm openapi/adr-ruleset-header.txt openapi/adr-upstream.yaml
tail -n +14 openapi/adr-ruleset-2.2.1.yaml | sha256sum
```

Expected: `446423f5de90232282bb7add03bc9818a13ee1ae3be79fe88acacba00a5aad04`.

- [ ] **Step 3: Write the local ruleset with its exceptions**

Create `packages/backend/openapi/.spectral.yaml`:

```yaml
# packages/backend/openapi/.spectral.yaml
#
# Lints the built openapi.json (npm run lint:openapi) against the NL API Design
# Rules 2.2.1 ruleset vendored beside this file. Every rule in it gates except
# the exceptions below. Each one states its reason and is scoped as narrowly as
# the rule allows; add one only with a reason a reviewer can check.

extends:
  - ./adr-ruleset-2.2.1.yaml

rules:
  # Error responses are the { success: false, error } envelope, not RFC 9457
  # problem details. The document describes them as they are rather than claim
  # a format the API does not return. Remove both lines when
  # https://github.com/sgort/linked-data-explorer/issues/131 lands.
  nlgov:use-problem-schema: 'off'
  nlgov:problem-schema-members: 'off'

  # The release version is calendar-based, YYYY.MM.N with a zero-padded month
  # (2026.09.4), and info.version is the same string as the API-Version header.
  # A zero-padded month is not valid semver, and rewriting it in the document
  # would make the document and the header disagree.
  nlgov:semver: 'off'

overrides:
  # GET /ropa/public takes one parameter, a free-text substring filter on the
  # controller name. No value is invalid, the handler never answers 400, and
  # the document does not claim it can.
  - files:
      - 'openapi.json#/paths/~1ropa~1public/get'
    rules:
      nlgov:problem-invalid-input: 'off'
```

- [ ] **Step 4: Add the lint script and run it**

In `packages/backend/package.json` `scripts`, add:

```json
"lint:openapi": "npm run build:openapi && spectral lint openapi/openapi.json --ruleset openapi/.spectral.yaml --fail-severity error"
```

Run from `packages/backend`: `npm run lint:openapi`
Expected: exit code 0 and `No results with a severity of 'error' found!` (or Spectral's equivalent wording).

If Spectral reports anything, fix the document, not the ruleset. The only exceptions allowed are the three rules and one override above.

- [ ] **Step 5: Prove every exception is load-bearing and narrow**

`.spectral.yaml` is still untracked, so `git checkout` cannot restore it. Work from a copy. Run from `packages/backend` before the first check:

```bash
cp openapi/.spectral.yaml openapi/.spectral.yaml.orig
```

Each check edits `openapi/.spectral.yaml`, runs `npm run lint:openapi`, then restores it with `cp openapi/.spectral.yaml.orig openapi/.spectral.yaml`:

1. Delete the `overrides:` block. Expected: exit code 1, with `nlgov:problem-invalid-input` reported at `paths./ropa/public.get` only.
2. Delete the line `nlgov:semver: 'off'`. Expected: exit code 1, with `nlgov:semver` reported at `info.version`.
3. Delete the line `nlgov:use-problem-schema: 'off'`. Expected: exit code 1, with `nlgov:use-problem-schema` reported on the 500 and 503 responses.

After each restore, `npm run lint:openapi` exits 0 again. When all three are done, run `rm openapi/.spectral.yaml.orig` and confirm with `git status --short openapi/` that no `.orig` file remains.

If check 1 still exits 0, the override did not narrow to that path. The `files` pattern resolves relative to `.spectral.yaml`, so confirm it reads `openapi.json#/paths/~1ropa~1public/get`. Report the finding rather than widening the exception.

- [ ] **Step 6: Stage and stop for approval**

```bash
git add packages/backend/openapi/adr-ruleset-2.2.1.yaml packages/backend/openapi/.spectral.yaml packages/backend/package.json
git status --short
```

Proposed message: `ci(backend): lint the OpenAPI description against the NL API Design Rules 2.2.1 (#133)`. Do not commit until the user approves.

---

### Task 7: Gate it in CI and ship it in the artifact

**Files:**

- Modify: `.github/workflows/azure-backend-acc.yml`
- Modify: `.github/workflows/azure-backend-production.yml`

**Interfaces:**

- Consumes: `npm run lint:openapi` (Task 6); `openapi/openapi.json`, generated by `prebuild` (Task 1).
- Produces:
  - a `Lint OpenAPI description` step in both workflows;
  - `deploy/openapi/openapi.json` in the artifact;
  - a post-deploy check that `/v1/openapi.json` describes the deployed release.

Apply every step to **both** workflows. The only difference is the host: `acc.backend.linkeddata.open-regels.nl` in `azure-backend-acc.yml`, `backend.linkeddata.open-regels.nl` in `azure-backend-production.yml`.

- [ ] **Step 1: Lint on every run**

Directly after the `Run linter` step, add:

```yaml
      - name: Lint OpenAPI description
        working-directory: packages/backend
        run: npm run lint:openapi
```

It carries no `if:`. In the acc workflow it runs on pull requests too, which is where it gates.

- [ ] **Step 2: Ship the document in the artifact**

In `Prepare deployment package`, directly after the SHACL `ronl/*.ttl` check (the `fi` that follows `No SHACL shape files in deploy/shapes/ronl/`), add:

```bash

          # OpenAPI description, served at /v1/openapi.json from
          # <package root>/openapi/openapi.json (src/openapi/document.ts). npm run
          # build generated it; fail here rather than ship an API whose
          # documentation link answers 500 (#129).
          mkdir -p deploy/openapi
          cp openapi/openapi.json deploy/openapi/
          if [ ! -s deploy/openapi/openapi.json ]; then
            echo "❌ Missing OpenAPI description: deploy/openapi/openapi.json"
            exit 1
          fi
```

- [ ] **Step 3: Verify it after deploy**

In `Verify v1 endpoints`, directly after the SHACL block (the `fi` that follows `SHACL shape layers incomplete`), add the following. This is the acc version; in `azure-backend-production.yml` use `https://backend.linkeddata.open-regels.nl` in both URLs.

```bash

          # OpenAPI description (#129): served, and describing the release that is
          # running. The build check above already waited for the new artifact.
          doc_version=$(curl -s -m 10 https://acc.backend.linkeddata.open-regels.nl/v1/openapi.json | jq -r '.info.version' 2>/dev/null || true)
          api_version=$(curl -s -m 10 https://acc.backend.linkeddata.open-regels.nl/v1/health | jq -r '.version' 2>/dev/null || true)
          if [ -n "$doc_version" ] && [ "$doc_version" != "null" ] && [ "$doc_version" = "$api_version" ]; then
            echo "✅ /v1/openapi.json describes $doc_version"
          else
            echo "❌ /v1/openapi.json info.version is ${doc_version:-unreadable}; /v1/health version is ${api_version:-unreadable}"
            exit 1
          fi
```

- [ ] **Step 4: Check the workflows**

Run from the repository root:

```bash
uvx zizmor --offline .github/workflows/azure-backend-acc.yml .github/workflows/azure-backend-production.yml
node -e "
const YAML = require('yaml'); const fs = require('fs'); const cp = require('child_process');
for (const f of ['azure-backend-acc.yml','azure-backend-production.yml']) {
  const steps = YAML.parse(fs.readFileSync('.github/workflows/'+f,'utf8')).jobs.deploy.steps;
  const names = steps.map(s => s.name);
  console.log(f, 'lint after linter:', names.indexOf('Lint OpenAPI description') === names.indexOf('Run linter') + 1);
  for (const s of steps.filter(s => s.run)) {
    const r = cp.spawnSync('bash', ['-n'], { input: s.run });
    if (r.status !== 0) console.log(f, s.name, r.stderr.toString());
  }
}"
node scripts/check-supply-chain.mjs --offline
```

Expected: zizmor reports `No findings to report`; both files print `lint after linter: true` with no `bash -n` errors; the supply-chain check passes. No `uses:` line was added, so the register is unchanged.

- [ ] **Step 5: Stage and stop for approval**

```bash
git add .github/workflows/azure-backend-acc.yml .github/workflows/azure-backend-production.yml
git status --short
```

Proposed message: `ci(backend): gate and ship the OpenAPI description (#133)`. Do not commit until the user approves.

---

### Task 8: Verification and hand-off

**Files:** none new.

- [ ] **Step 1: Run the package checks**

Run from `packages/backend`:

```bash
npm run typecheck
npm run lint
npm run check-format
npm run lint:openapi
npm run build
git status --short
```

Expected:

- every command succeeds;
- `dist/routes/openapi.routes.js` exists;
- `git status --short` shows no `openapi/openapi.json` (gitignored) and nothing unstaged beyond what the user has not yet committed.

Run from the repository root: `npm run deps:check`
Expected: installed dependencies in sync with `package-lock.json`.

- [ ] **Step 2: Hand the full suite to the user**

Do not substitute a focused run. Give the user this command and the expected result, then wait for their green:

```
npm test --workspace=packages/backend
```

Expected: every suite passes; the per-file 80% branch floor holds, including `src/openapi/document.ts`, `src/openapi/testing/conformance.ts`, `src/openapi/testing/routeOperations.ts` and `src/routes/openapi.routes.ts`.

If a test fails only in the full run, rerun that file in isolation before drawing any conclusion, and report which way each was run.

- [ ] **Step 3: Prepare the pull request, with the user's go-ahead**

After the user's green and approval of the remaining commits, push `feature/openapi-phase-1` and open a pull request against `acc` that:

- carries the spec and this plan (the branch started from `docs/openapi-description-design`);
- says `Closes #133`;
- lists what the reviewer should check: the three rule exceptions and one override in `.spectral.yaml` with their reasons, the 62 entries left in `pending.json`, and the 117 new dev-only packages;
- includes the post-merge checks in its body:
  - ACC deploy passes `Lint OpenAPI description` and the new verify block;
  - `https://acc.backend.linkeddata.open-regels.nl/v1/openapi.json` returns the document with `Access-Control-Allow-Origin: *`;
  - the root page lists `/v1/openapi.json` under Discovery.
