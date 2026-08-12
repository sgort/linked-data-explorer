# Mandatory organization/tenantId at BPMN Deploy Time, with Repo Sync — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `organization` mandatory (client- and server-validated) when
deploying a BPMN process from LDE's BPMN Modeler, wire it through to
Operaton's native `tenant-id` deployment field, and write the exact
deployed bundle to `deployed/<organization>/<definitionKey>/` in LDE's own
repo working tree on every successful deploy.

**Architecture:** Mirrors the existing `boardOwner` mandatory-at-deploy
pattern end to end — same client-side extraction-from-XML approach, same
deploy-blocking UX, same request-body/route/service parameter threading.
Adds one new file-persistence function (`writeDeployedBundleToRepo` in
`assets.service.ts`) that runs after a confirmed-successful Operaton
deploy and only ever writes to the filesystem — no git operations.

**Tech Stack:** TypeScript, React (frontend, Vitest), Express (backend,
Jest), `form-data` (Node), `fs/promises`.

## Global Constraints

- Never add `Co-Authored-By`/`Claude-Session` git commit trailers.
- `organization` stays nullable in Postgres and in the BPMN XML at
  draft/save time — mandatory is enforced **only** at deploy time (client
  + server), matching the existing `boardOwner` precedent exactly.
- The repo-sync write never blocks a successful Operaton deploy — a
  filesystem failure logs a warning and surfaces as a non-fatal
  `repoSync: { written: false, error }` field in the response, not a
  failed deploy.
- No `git add`/`commit`/`push` anywhere in this plan — filesystem writes
  only.
- This plan touches `linked-data-explorer` exclusively. No file in
  `ronl-business-api` is part of this plan.
- Run frontend commands from `packages/frontend` (Vitest), backend
  commands from `packages/backend` (Jest).

---

### Task 1: `config.repoRoot`

**Files:**
- Modify: `packages/backend/src/utils/config.ts`

**Interfaces:**
- Produces (used by Task 2): `config.repoRoot: string` — absolute path to
  the `linked-data-explorer` repo root.

- [ ] **Step 1: Add the `repoRoot` entry**

In `packages/backend/src/utils/config.ts`, add a `path` import at the top:

```ts
import dotenv from 'dotenv';
import path from 'path';
```

Then, inside the `export const config = {` object, add `repoRoot` right
after the existing `host` line:

```ts
  port: parseInt(process.env.PORT || '3001', 10),
  host: process.env.HOST || 'localhost',

  // Absolute path to the repo root, used to write deployed BPMN bundles to
  // deployed/<organization>/<definitionKey>/ on successful deploy (see
  // assets.service.ts's writeDeployedBundleToRepo). Defaults to a path
  // resolved from this file's own location — packages/backend/src/utils/
  // is four directories below the repo root (utils → src → backend →
  // packages → root), true whether running from src/ or the compiled
  // dist/ output, since both sit at the same depth under packages/backend.
  // Overridable via REPO_ROOT for deployment topologies where that
  // relative assumption doesn't hold.
  repoRoot: process.env.REPO_ROOT || path.resolve(__dirname, '../../../../'),
```

- [ ] **Step 2: Typecheck**

Run (from `packages/backend`): `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/utils/config.ts
git commit -m "feat(backend): add config.repoRoot for the deploy-time repo sync"
```

---

### Task 2: `writeDeployedBundleToRepo`

**Files:**
- Modify: `packages/backend/src/services/assets.service.ts`
- Test: `packages/backend/src/services/assets.service.test.ts`

**Interfaces:**
- Consumes: `config.repoRoot` from `../utils/config` (Task 1).
- Produces (used by Task 4): `writeDeployedBundleToRepo(params: {
  organization: string; definitionKey: string; bpmnXml: string;
  subProcesses: { filename: string; xml: string }[]; forms: { id: string;
  schema: Record<string, unknown> }[]; documents: { id: string; template:
  Record<string, unknown> }[]; }): Promise<{ written: boolean; path:
  string; error?: string }>`

- [ ] **Step 1: Write the failing tests**

Append to `packages/backend/src/services/assets.service.test.ts` (find the
exact top-of-file mock setup already in that file and reuse it — this step
adds a new `describe` block, it does not replace existing tests):

```ts
describe('writeDeployedBundleToRepo', () => {
  const tmpRoot = path.join(os.tmpdir(), `lde-repo-sync-test-${Date.now()}`);

  beforeEach(() => {
    jest.spyOn(configModule.config, 'repoRoot', 'get').mockReturnValue(tmpRoot);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  test('writes the bpmn, subprocess bpmns, forms, and documents to deployed/<organization>/<definitionKey>/', async () => {
    const result = await writeDeployedBundleToRepo({
      organization: 'flevoland',
      definitionKey: 'RipR21Process',
      bpmnXml: '<bpmn:definitions/>',
      subProcesses: [{ filename: 'SubProcess.bpmn', xml: '<bpmn:definitions/>' }],
      forms: [{ id: 'rip-intake', schema: { id: 'rip-intake', type: 'default' } }],
      documents: [{ id: 'rip-pdp', template: { id: 'rip-pdp', zones: [] } }],
    });

    const dir = path.join(tmpRoot, 'deployed', 'flevoland', 'RipR21Process');
    expect(result).toEqual({ written: true, path: dir });

    expect(await fs.readFile(path.join(dir, 'RipR21Process.bpmn'), 'utf-8')).toBe(
      '<bpmn:definitions/>'
    );
    expect(await fs.readFile(path.join(dir, 'SubProcess.bpmn'), 'utf-8')).toBe(
      '<bpmn:definitions/>'
    );
    const formContent = await fs.readFile(path.join(dir, 'rip-intake.form'), 'utf-8');
    expect(JSON.parse(formContent)).toEqual({ id: 'rip-intake', type: 'default' });
    const docContent = await fs.readFile(path.join(dir, 'rip-pdp.document'), 'utf-8');
    expect(JSON.parse(docContent)).toEqual({ id: 'rip-pdp', zones: [] });
  });

  test('overwrites a previous deploy of the same definitionKey', async () => {
    await writeDeployedBundleToRepo({
      organization: 'flevoland',
      definitionKey: 'RipR21Process',
      bpmnXml: '<old/>',
      subProcesses: [],
      forms: [],
      documents: [],
    });
    await writeDeployedBundleToRepo({
      organization: 'flevoland',
      definitionKey: 'RipR21Process',
      bpmnXml: '<new/>',
      subProcesses: [],
      forms: [],
      documents: [],
    });

    const filePath = path.join(tmpRoot, 'deployed', 'flevoland', 'RipR21Process', 'RipR21Process.bpmn');
    expect(await fs.readFile(filePath, 'utf-8')).toBe('<new/>');
  });

  test('returns written: false with an error message instead of throwing when the target is not writable', async () => {
    // A file where a directory needs to be created makes mkdir fail with ENOTDIR.
    await fs.mkdir(tmpRoot, { recursive: true });
    await fs.writeFile(path.join(tmpRoot, 'deployed'), 'not a directory');

    const result = await writeDeployedBundleToRepo({
      organization: 'flevoland',
      definitionKey: 'RipR21Process',
      bpmnXml: '<bpmn:definitions/>',
      subProcesses: [],
      forms: [],
      documents: [],
    });

    expect(result.written).toBe(false);
    expect(result.error).toBeTruthy();
  });
});
```

Add these imports at the top of the test file (alongside whatever is
already imported there — do not remove existing imports):

```ts
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import * as configModule from '../utils/config';
import { writeDeployedBundleToRepo } from './assets.service';
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `packages/backend`): `npx jest assets.service.test.ts -t "writeDeployedBundleToRepo"`
Expected: FAIL — `writeDeployedBundleToRepo` is not exported yet.

- [ ] **Step 3: Write the implementation**

In `packages/backend/src/services/assets.service.ts`, add these imports at
the top of the file (alongside the existing ones — do not remove them):

```ts
import { promises as fs } from 'fs';
import path from 'path';
import { config } from '../utils/config';
import logger from '../utils/logger';
```

Then append this function at the end of the file:

```ts
/**
 * Writes the exact bundle a successful deploy sent to Operaton to
 * deployed/<organization>/<definitionKey>/ in this repo's working tree —
 * same filenames as the Operaton FormData, so the folder is a literal
 * mirror of what's live as of the last deploy. Write-only: never runs git
 * itself: a human reviews and commits the resulting change.
 *
 * Never throws — a filesystem failure here must not turn an already-
 * successful Operaton deploy into a failed response. Callers surface
 * `written: false` as a non-fatal note instead.
 */
export async function writeDeployedBundleToRepo(params: {
  organization: string;
  definitionKey: string;
  bpmnXml: string;
  subProcesses: { filename: string; xml: string }[];
  forms: { id: string; schema: Record<string, unknown> }[];
  documents: { id: string; template: Record<string, unknown> }[];
}): Promise<{ written: boolean; path: string; error?: string }> {
  const dir = path.join(config.repoRoot, 'deployed', params.organization, params.definitionKey);

  try {
    await fs.mkdir(dir, { recursive: true });

    await fs.writeFile(path.join(dir, `${params.definitionKey}.bpmn`), params.bpmnXml, 'utf-8');

    for (const sp of params.subProcesses) {
      await fs.writeFile(path.join(dir, sp.filename), sp.xml, 'utf-8');
    }

    for (const form of params.forms) {
      await fs.writeFile(
        path.join(dir, `${form.id}.form`),
        JSON.stringify(form.schema, null, 2),
        'utf-8'
      );
    }

    for (const doc of params.documents) {
      await fs.writeFile(
        path.join(dir, `${doc.id}.document`),
        JSON.stringify(doc.template, null, 2),
        'utf-8'
      );
    }

    logger.info('Wrote deployed bundle to repo', { path: dir });
    return { written: true, path: dir };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.warn('Failed to write deployed bundle to repo — deploy itself still succeeded', {
      path: dir,
      error: message,
    });
    return { written: false, path: dir, error: message };
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run (from `packages/backend`): `npx jest assets.service.test.ts -t "writeDeployedBundleToRepo"`
Expected: PASS, all 3 new tests green.

- [ ] **Step 5: Run the full assets.service test file and typecheck**

Run (from `packages/backend`): `npx jest assets.service.test.ts`
Expected: all tests pass, including the pre-existing ones — this function
is purely additive.

Run (from `packages/backend`): `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/backend/src/services/assets.service.ts packages/backend/src/services/assets.service.test.ts
git commit -m "feat(backend): add writeDeployedBundleToRepo for post-deploy repo sync"
```

---

### Task 3: `operatonService.deployProcess` gains `organization` → `tenant-id`

**Files:**
- Modify: `packages/backend/src/services/operaton.service.ts`
- Test: `packages/backend/src/services/operaton.service.test.ts` (new file)

**Interfaces:**
- Produces (used by Task 4): `deployProcess`'s signature gains a 9th
  parameter, `organization?: string`, inserted right after the existing
  `boardOwner?: string` parameter (i.e. it becomes the *last* parameter).
  When present, the resulting Operaton `FormData` carries a `tenant-id`
  field set to that value.

- [ ] **Step 1: Write the failing test**

Create `packages/backend/src/services/operaton.service.test.ts`:

```ts
jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('axios', () => ({
  __esModule: true,
  default: {
    create: jest.fn(() => ({
      interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } },
    })),
  },
}));

import { OperatonService } from './operaton.service';

describe('deployProcess', () => {
  test('sends tenant-id in the deployment FormData when organization is provided', async () => {
    const service = new OperatonService();
    const mockPost = jest.fn().mockResolvedValue({ data: { id: 'deployment-1' } });
    (service as unknown as { client: { post: jest.Mock } }).client = { post: mockPost };

    await service.deployProcess(
      '<bpmn:definitions/>',
      'RipR21Process',
      [],
      [],
      [],
      undefined,
      undefined,
      undefined,
      'infra-board',
      'flevoland'
    );

    expect(mockPost).toHaveBeenCalledTimes(1);
    const formData = mockPost.mock.calls[0][0];
    const body = formData.getBuffer().toString('utf-8');
    expect(body).toContain('name="tenant-id"');
    expect(body).toContain('flevoland');
    expect(body).toContain('name="deployment-name"');
  });

  test('omits tenant-id from the FormData when organization is not provided', async () => {
    const service = new OperatonService();
    const mockPost = jest.fn().mockResolvedValue({ data: { id: 'deployment-1' } });
    (service as unknown as { client: { post: jest.Mock } }).client = { post: mockPost };

    await service.deployProcess(
      '<bpmn:definitions/>',
      'RipR21Process',
      [],
      [],
      [],
      undefined,
      undefined,
      undefined,
      'infra-board'
    );

    const formData = mockPost.mock.calls[0][0];
    const body = formData.getBuffer().toString('utf-8');
    expect(body).not.toContain('name="tenant-id"');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `packages/backend`): `npx jest operaton.service.test.ts`
Expected: FAIL — `deployProcess` doesn't accept a 9th (`organization`)
argument yet, and the current implementation never appends `tenant-id`, so
the first test's `toContain('name="tenant-id"')` assertion fails.

- [ ] **Step 3: Write the implementation**

In `packages/backend/src/services/operaton.service.ts`, change the
`deployProcess` signature:

```ts
  async deployProcess(
    bpmnXml: string,
    deploymentName: string,
    forms: { id: string; schema: Record<string, unknown> }[],
    subProcesses: { filename: string; xml: string }[] = [],
    documents: { id: string; template: Record<string, unknown> }[] = [],
    operatonUrl?: string,
    operatonUsername?: string,
    operatonPassword?: string,
    boardOwner?: string
  ): Promise<{ deploymentId: string; resourceCount: number }> {
```

to:

```ts
  async deployProcess(
    bpmnXml: string,
    deploymentName: string,
    forms: { id: string; schema: Record<string, unknown> }[],
    subProcesses: { filename: string; xml: string }[] = [],
    documents: { id: string; template: Record<string, unknown> }[] = [],
    operatonUrl?: string,
    operatonUsername?: string,
    operatonPassword?: string,
    boardOwner?: string,
    /** Operaton's native tenant-id deployment field. Omitted entirely when unset. */
    organization?: string
  ): Promise<{ deploymentId: string; resourceCount: number }> {
```

Then change the `FormData` assembly:

```ts
      const formData = new FormData();
      formData.append('deployment-name', deploymentName);
      formData.append('enable-duplicate-filtering', 'false');
```

to:

```ts
      const formData = new FormData();
      formData.append('deployment-name', deploymentName);
      formData.append('enable-duplicate-filtering', 'false');
      if (organization) {
        formData.append('tenant-id', organization);
      }
```

- [ ] **Step 4: Run the test to verify it passes**

Run (from `packages/backend`): `npx jest operaton.service.test.ts`
Expected: PASS, both tests green.

- [ ] **Step 5: Typecheck**

Run (from `packages/backend`): `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/backend/src/services/operaton.service.ts packages/backend/src/services/operaton.service.test.ts
git commit -m "feat(backend): deployProcess sends organization as Operaton's tenant-id"
```

---

### Task 4: `POST /process/deploy` — mandatory `organization`, repo sync on success

**Files:**
- Modify: `packages/backend/src/routes/dmn.routes.ts`
- Test: `packages/backend/src/routes/dmn.routes.test.ts` (new file)

**Interfaces:**
- Consumes: `deployProcess(...)`'s new `organization` parameter (Task 3),
  `writeDeployedBundleToRepo(...)` (Task 2).
- Produces: `POST /process/deploy`'s success response gains an optional
  `repoSync?: { written: boolean; path: string; error?: string }` field;
  returns `400 INVALID_INPUT` when `organization` is missing/empty.

- [ ] **Step 1: Write the failing tests**

Create `packages/backend/src/routes/dmn.routes.test.ts`:

```ts
import express from 'express';
import request from 'supertest';

jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
jest.mock('../services/operaton.service', () => ({
  operatonService: { deployProcess: jest.fn() },
}));
jest.mock('../services/assets.service', () => ({
  writeDeployedBundleToRepo: jest.fn(),
}));

import { operatonService } from '../services/operaton.service';
import { writeDeployedBundleToRepo } from '../services/assets.service';
import dmnRoutes from './dmn.routes';

const mockDeployProcess = operatonService.deployProcess as jest.Mock;
const mockWriteBundle = writeDeployedBundleToRepo as jest.Mock;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/dmns', dmnRoutes);
  return app;
}

beforeEach(() => {
  mockDeployProcess.mockReset();
  mockWriteBundle.mockReset();
});

describe('POST /api/dmns/process/deploy', () => {
  test('returns 400 when organization is missing', async () => {
    const res = await request(makeApp())
      .post('/api/dmns/process/deploy')
      .send({ bpmnXml: '<bpmn:definitions/>', deploymentName: 'RipR21Process' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_INPUT');
    expect(mockDeployProcess).not.toHaveBeenCalled();
  });

  test('returns 400 when organization is an empty string', async () => {
    const res = await request(makeApp()).post('/api/dmns/process/deploy').send({
      bpmnXml: '<bpmn:definitions/>',
      deploymentName: 'RipR21Process',
      organization: '',
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_INPUT');
  });

  test('passes organization through to deployProcess and includes repoSync on success', async () => {
    mockDeployProcess.mockResolvedValue({ deploymentId: 'dep-1', resourceCount: 3 });
    mockWriteBundle.mockResolvedValue({
      written: true,
      path: '/repo/deployed/flevoland/RipR21Process',
    });

    const res = await request(makeApp()).post('/api/dmns/process/deploy').send({
      bpmnXml: '<bpmn:definitions/>',
      deploymentName: 'RipR21Process',
      organization: 'flevoland',
    });

    expect(res.status).toBe(200);
    expect(res.body.data.repoSync).toEqual({
      written: true,
      path: '/repo/deployed/flevoland/RipR21Process',
    });
    expect(mockDeployProcess).toHaveBeenCalledWith(
      '<bpmn:definitions/>',
      'RipR21Process',
      [],
      [],
      [],
      undefined,
      undefined,
      undefined,
      undefined,
      'flevoland'
    );
    expect(mockWriteBundle).toHaveBeenCalledWith({
      organization: 'flevoland',
      definitionKey: 'RipR21Process',
      bpmnXml: '<bpmn:definitions/>',
      subProcesses: [],
      forms: [],
      documents: [],
    });
  });

  test('a failed repo-sync write does not fail the deploy response', async () => {
    mockDeployProcess.mockResolvedValue({ deploymentId: 'dep-1', resourceCount: 1 });
    mockWriteBundle.mockResolvedValue({
      written: false,
      path: '/repo/deployed/flevoland/RipR21Process',
      error: 'EACCES',
    });

    const res = await request(makeApp()).post('/api/dmns/process/deploy').send({
      bpmnXml: '<bpmn:definitions/>',
      deploymentName: 'RipR21Process',
      organization: 'flevoland',
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.repoSync).toEqual({
      written: false,
      path: '/repo/deployed/flevoland/RipR21Process',
      error: 'EACCES',
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `packages/backend`): `npx jest dmn.routes.test.ts`
Expected: FAIL — the route doesn't validate `organization` yet, doesn't
pass it to `deployProcess`, and never calls `writeDeployedBundleToRepo` or
includes `repoSync` in the response.

- [ ] **Step 3: Write the implementation**

In `packages/backend/src/routes/dmn.routes.ts`, add this import near the
top of the file, alongside the existing `operatonService` import:

```ts
import { writeDeployedBundleToRepo } from '../services/assets.service';
```

Then replace the `/process/deploy` handler body. Current:

```ts
router.post('/process/deploy', async (req: Request, res: Response) => {
  try {
    const {
      bpmnXml,
      deploymentName,
      forms = [],
      subProcesses = [],
      documents = [],
      operatonUrl,
      operatonUsername,
      operatonPassword,
      boardOwner,
    } = req.body as {
      bpmnXml: string;
      deploymentName: string;
      forms: { id: string; schema: Record<string, unknown> }[];
      subProcesses: { filename: string; xml: string }[];
      documents: { id: string; template: Record<string, unknown> }[];
      operatonUrl?: string;
      operatonUsername?: string;
      operatonPassword?: string;
      /** Owning board for the deployed process; auto-derived from candidate groups when omitted. */
      boardOwner?: string;
    };

    if (!bpmnXml?.trim()) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'bpmnXml is required' },
        timestamp: new Date().toISOString(),
      });
    }

    if (!deploymentName?.trim()) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'deploymentName is required' },
        timestamp: new Date().toISOString(),
      });
    }

    const result = await operatonService.deployProcess(
      bpmnXml,
      deploymentName,
      forms,
      subProcesses,
      documents,
      operatonUrl,
      operatonUsername,
      operatonPassword,
      boardOwner
    );

    res.json({
      success: true,
      data: {
        deploymentId: result.deploymentId,
        resourceCount: result.resourceCount,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    logger.error('Process deploy error', getErrorDetails(error));
    res.status(500).json({
      success: false,
      error: { code: 'PROCESS_DEPLOY_FAILED', message: getErrorMessage(error) },
      timestamp: new Date().toISOString(),
    });
  }
});
```

Becomes:

```ts
router.post('/process/deploy', async (req: Request, res: Response) => {
  try {
    const {
      bpmnXml,
      deploymentName,
      forms = [],
      subProcesses = [],
      documents = [],
      operatonUrl,
      operatonUsername,
      operatonPassword,
      boardOwner,
      organization,
    } = req.body as {
      bpmnXml: string;
      deploymentName: string;
      forms: { id: string; schema: Record<string, unknown> }[];
      subProcesses: { filename: string; xml: string }[];
      documents: { id: string; template: Record<string, unknown> }[];
      operatonUrl?: string;
      operatonUsername?: string;
      operatonPassword?: string;
      /** Owning board for the deployed process; auto-derived from candidate groups when omitted. */
      boardOwner?: string;
      /** Tenant tag, mandatory — becomes Operaton's native tenant-id and the deployed/ repo-sync path segment. */
      organization?: string;
    };

    if (!bpmnXml?.trim()) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'bpmnXml is required' },
        timestamp: new Date().toISOString(),
      });
    }

    if (!deploymentName?.trim()) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'deploymentName is required' },
        timestamp: new Date().toISOString(),
      });
    }

    if (!organization?.trim()) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'organization is required' },
        timestamp: new Date().toISOString(),
      });
    }

    const result = await operatonService.deployProcess(
      bpmnXml,
      deploymentName,
      forms,
      subProcesses,
      documents,
      operatonUrl,
      operatonUsername,
      operatonPassword,
      boardOwner,
      organization
    );

    const repoSync = await writeDeployedBundleToRepo({
      organization,
      definitionKey: deploymentName,
      bpmnXml,
      subProcesses,
      forms,
      documents,
    });

    res.json({
      success: true,
      data: {
        deploymentId: result.deploymentId,
        resourceCount: result.resourceCount,
        repoSync,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    logger.error('Process deploy error', getErrorDetails(error));
    res.status(500).json({
      success: false,
      error: { code: 'PROCESS_DEPLOY_FAILED', message: getErrorMessage(error) },
      timestamp: new Date().toISOString(),
    });
  }
});
```

- [ ] **Step 4: Run the tests to verify they pass**

Run (from `packages/backend`): `npx jest dmn.routes.test.ts`
Expected: PASS, all 4 tests green.

- [ ] **Step 5: Run the full backend suite and typecheck**

Run (from `packages/backend`): `npx jest`
Expected: all tests pass, no regressions in unrelated route/service tests.

Run (from `packages/backend`): `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/backend/src/routes/dmn.routes.ts packages/backend/src/routes/dmn.routes.test.ts
git commit -m "feat(backend): require organization on /process/deploy, sync to repo on success"
```

---

### Task 5: `BpmnCanvas.tsx` — mandatory organization in the Deploy modal

**Files:**
- Modify: `packages/frontend/src/components/BpmnModeler/BpmnCanvas.tsx`
- Test: `packages/frontend/src/components/BpmnModeler/BpmnCanvas.test.tsx`

**Interfaces:**
- Produces: the deploy request body sent to `/api/dmns/process/deploy`
  gains an `organization` field, sourced from the BPMN XML's
  `ronl:organization="..."` attribute (already written by
  `BpmnModeler.tsx`'s existing organization-editing flow — this task only
  reads it, never writes it).

- [ ] **Step 1: Write the failing tests**

In `packages/frontend/src/components/BpmnModeler/BpmnCanvas.test.tsx`,
add two new tests inside the existing `describe('BpmnCanvas — deploy
modal', ...)` block (do not remove or modify the existing tests — add
these alongside them, e.g. right after the `'auto-detects the board
owner...'` test):

```ts
  test('blocks deploy when the BPMN has no ronl:organization attribute', async () => {
    await renderCanvas({ xml: SIMPLE_XML });
    await userEvent.click(screen.getByText('Deploy'));

    expect(await screen.findByText('not set')).toBeTruthy();
    expect(screen.getByText(/An organization is required/)).toBeTruthy();
    const modalDeployButton = screen.getAllByRole('button', { name: /Deploy/ })[1];
    expect(modalDeployButton).toBeDisabled();
  });

  test('reads organization from the BPMN and sends it in the deploy request', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      json: async () => ({ success: true, data: { deploymentId: 'dep-123' } }),
    });
    const xmlWithOrg = SIMPLE_XML.replace(
      '<bpmn:process',
      '<bpmn:process ronl:organization="flevoland"'
    );
    await renderCanvas({ xml: xmlWithOrg });
    await userEvent.click(screen.getByText('Deploy'));

    await screen.findByText('flevoland');
    await userEvent.click(screen.getByRole('button', { name: 'Infra-board' }));
    const modalDeployButton = screen.getAllByRole('button', { name: /Deploy/ })[1];
    expect(modalDeployButton).not.toBeDisabled();

    await userEvent.click(modalDeployButton);

    await vi.waitFor(() =>
      expect(screen.getAllByText(/Deployment ID: dep-123/).length).toBeGreaterThan(0)
    );
    const [, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(options.body as string);
    expect(body.organization).toBe('flevoland');
  });
```

Before running these, confirm `SIMPLE_XML` (used by the existing
`'auto-detects the board owner...'` test) is defined somewhere accessible
in this test file — it already is, since that existing test uses it; these
new tests reuse the same constant.

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `packages/frontend`): `npx vitest run src/components/BpmnModeler/BpmnCanvas.test.tsx`
Expected: FAIL — both new tests fail (no "not set"/organization text
rendered yet, deploy request never carries `organization`).

- [ ] **Step 3: Write the implementation**

**3a.** Add the extraction helper right after the existing
`deriveBoardOwnerFromXml` function (around line 71):

```ts
/** Derive the owning board from candidate groups in a BPMN, or null if unknown. */
const deriveBoardOwnerFromXml = (xml: string): string | null => {
  const groups = new Set<string>();
  for (const m of xml.matchAll(/candidateGroups\s*=\s*["']([^"']+)["']/g)) {
    for (const g of m[1].split(',')) groups.add(g.trim());
  }
  let found: string | null = null;
  for (const g of groups) {
    for (const { match, board } of BOARD_BY_GROUP) {
      if (match.test(g)) {
        if (board === 'infra-board') return 'infra-board';
        found = board;
      }
    }
  }
  return found;
};
```

Add immediately after it:

```ts
/** Extract the organization tag from a BPMN's ronl:organization attribute, or null if unset. */
const extractOrganizationFromXml = (xml: string): string | null => {
  return xml.match(/ronl:organization="([^"]+)"/)?.[1] ?? null;
};
```

**3b.** Add state right after the existing `boardAuto` state declaration
(around line 111):

```ts
  const [boardChoice, setBoardChoice] = useState<BoardChoice>('auto');
  const [boardAuto, setBoardAuto] = useState<string | null>(null);
```

becomes:

```ts
  const [boardChoice, setBoardChoice] = useState<BoardChoice>('auto');
  const [boardAuto, setBoardAuto] = useState<string | null>(null);
  const [deployOrganization, setDeployOrganization] = useState<string | null>(null);
```

**3c.** In `handleOpenDeployModal`, right after the existing
`setBoardAuto(deriveBoardOwnerFromXml(xml));` line (around line 499), add:

```ts
    // Pre-fill the board-ownership picker with the auto-detected board.
    setBoardAuto(deriveBoardOwnerFromXml(xml));
    setBoardChoice('auto');
```

becomes:

```ts
    // Pre-fill the board-ownership picker with the auto-detected board.
    setBoardAuto(deriveBoardOwnerFromXml(xml));
    setBoardChoice('auto');
    setDeployOrganization(extractOrganizationFromXml(xml));
```

**3d.** In `handleDeploy`, right after the existing `boardOwner` mandatory
check (around line 511-517):

```ts
    const boardOwner = boardChoice === 'auto' ? boardAuto : boardChoice;
    if (!boardOwner) {
      setDeployResult({
        success: false,
        message: 'Select a board — boardOwner is required before deploying.',
      });
      return;
    }
```

add immediately after:

```ts
    const boardOwner = boardChoice === 'auto' ? boardAuto : boardChoice;
    if (!boardOwner) {
      setDeployResult({
        success: false,
        message: 'Select a board — boardOwner is required before deploying.',
      });
      return;
    }

    if (!deployOrganization) {
      setDeployResult({
        success: false,
        message: 'Set an organization in the sidebar — organization is required before deploying.',
      });
      return;
    }
```

**3e.** In `handleDeploy`'s fetch call body (around line 578-586):

```ts
        body: JSON.stringify({
          bpmnXml: xml,
          deploymentName: processKey,
          forms,
          documents,
          subProcesses: subProcessXmls,
          operatonUrl: operatonUrl.trim() || undefined,
          boardOwner,
        }),
```

becomes:

```ts
        body: JSON.stringify({
          bpmnXml: xml,
          deploymentName: processKey,
          forms,
          documents,
          subProcesses: subProcessXmls,
          operatonUrl: operatonUrl.trim() || undefined,
          boardOwner,
          organization: deployOrganization,
        }),
```

**3f.** In the modal JSX, right after the "Board ownership" section's
closing `</div>` (the block ending at what's currently line 810, right
before the `{/* Resources preview */}` comment), insert a new
"Organization" section mirroring the Board ownership block's structure but
without a picker (organization is set via the persistent sidebar
`OrganizationSelector`, not chosen in this modal):

```tsx
              {!resolvedBoard && (
                <div className="mt-2 p-2 rounded-md bg-amber-50 border border-amber-200 text-xs text-amber-800">
                  ⚠️ A board owner is required. Select{' '}
                  <span className="font-mono">Infra-board</span> or{' '}
                  <span className="font-mono">Caseworker</span> before deploying.
                </div>
              )}
            </div>

            {/* Organization — deploy-time tenant-id tag */}
            <div className="mb-4 p-3 rounded-lg border-2 bg-slate-50 border-slate-200">
              <div className="flex items-center justify-between mb-2">
                <div className="font-semibold text-sm text-slate-800">🏢 Organization</div>
                {deployOrganization ? (
                  <span className="text-xs font-mono text-slate-700">{deployOrganization}</span>
                ) : (
                  <span className="text-xs text-slate-400">not set</span>
                )}
              </div>
              {!deployOrganization && (
                <div className="mt-2 p-2 rounded-md bg-amber-50 border border-amber-200 text-xs text-amber-800">
                  ⚠️ An organization is required. Set one in the sidebar's Organization field
                  before deploying.
                </div>
              )}
            </div>

            {/* Resources preview */}
```

**3g.** In the modal's Deploy button `disabled` condition (around line
924):

```tsx
                disabled={isDeploying || deployResult?.success === true || !resolvedBoard}
```

becomes:

```tsx
                disabled={
                  isDeploying ||
                  deployResult?.success === true ||
                  !resolvedBoard ||
                  !deployOrganization
                }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run (from `packages/frontend`): `npx vitest run src/components/BpmnModeler/BpmnCanvas.test.tsx`
Expected: PASS, all tests green (existing tests + 2 new).

- [ ] **Step 5: Run the full frontend suite and typecheck**

Run (from `packages/frontend`): `npx vitest run`
Expected: all tests pass, no regressions.

Run (from `packages/frontend`): `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/frontend/src/components/BpmnModeler/BpmnCanvas.tsx packages/frontend/src/components/BpmnModeler/BpmnCanvas.test.tsx
git commit -m "feat(frontend): require organization before deploying a BPMN process"
```

---

## Final verification

After Task 5: run the full suite once more from both packages
(`packages/backend`: `npx jest && npx tsc --noEmit`; `packages/frontend`:
`npx vitest run && npx tsc --noEmit`), then hand off to
`superpowers:finishing-a-development-branch`.
