import axios from 'axios';

jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));
jest.mock('axios', () => ({ __esModule: true, default: { post: jest.fn() } }));
jest.mock('./edocs.service', () => ({
  __esModule: true,
  edocsService: { ensureWorkspace: jest.fn(), uploadDocument: jest.fn() },
}));

const configMock = { operaton: { baseUrl: 'http://localhost:8080/engine-rest' } };
jest.mock('../utils/config', () => ({
  __esModule: true,
  config: configMock,
  default: configMock,
}));

import { edocsService } from './edocs.service';
import logger from '../utils/logger';
import { ExternalTaskWorker, externalTaskWorker } from './externalTaskWorker.service';

const mockPost = axios.post as jest.Mock;
const mockEnsureWorkspace = edocsService.ensureWorkspace as jest.Mock;
const mockUploadDocument = edocsService.uploadDocument as jest.Mock;
const mockLogError = logger.error as jest.Mock;

const BASE = 'http://localhost:8080/engine-rest';
const WORKER_ID = `lde-worker-${process.pid}`;

type TaskVars = Record<string, { value: unknown; type: string }>;

function task(topicName: string, variables: TaskVars, id = 'task-1') {
  return { id, topicName, processInstanceId: 'pi-1', variables };
}

function strVars(plain: Record<string, unknown>): TaskVars {
  return Object.fromEntries(
    Object.entries(plain).map(([k, v]) => [k, { value: v, type: 'String' }])
  );
}

/** Let the worker's promise chain settle without waiting on real timers. */
async function flush() {
  for (let i = 0; i < 12; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

let worker: ExternalTaskWorker;

/**
 * Run exactly one productive poll cycle: the first fetchAndLock yields `tasks`,
 * the second stops the worker so the recursive loop terminates.
 */
async function runOneCycle(tasks: ReturnType<typeof task>[]) {
  let fetches = 0;
  mockPost.mockImplementation(async (url: string) => {
    if (url.endsWith('/fetchAndLock')) {
      fetches += 1;
      if (fetches > 1) worker.stop();
      return { data: fetches === 1 ? tasks : [] };
    }
    return { data: {} };
  });

  worker.start();
  await flush();
}

function postsTo(suffix: string) {
  return mockPost.mock.calls.filter(([url]: [string]) => url.endsWith(suffix));
}

beforeEach(() => {
  mockPost.mockReset();
  mockEnsureWorkspace.mockReset();
  mockUploadDocument.mockReset();
  mockLogError.mockReset();
  worker = new ExternalTaskWorker();
});

afterEach(() => {
  // Clears any idle-retry timer the loop may have scheduled.
  worker.stop();
});

describe('lifecycle', () => {
  test('start() begins polling Operaton', async () => {
    await runOneCycle([]);

    expect(postsTo('/fetchAndLock').length).toBeGreaterThan(0);
  });

  test('start() is idempotent while the worker is already running', async () => {
    mockPost.mockImplementation(() => new Promise(() => {}));

    worker.start();
    worker.start();
    await flush();

    expect(postsTo('/fetchAndLock')).toHaveLength(1);
  });

  test('stop() halts the loop so no further polls are issued', async () => {
    await runOneCycle([]);
    const before = mockPost.mock.calls.length;

    worker.stop();
    await flush();

    expect(mockPost.mock.calls).toHaveLength(before);
  });

  test('a stopped worker can be started again', async () => {
    worker.stop();

    await runOneCycle([]);

    expect(postsTo('/fetchAndLock').length).toBeGreaterThan(0);
  });
});

describe('fetchAndLock request', () => {
  test('long-polls both eDOCS topics with the documented lock settings', async () => {
    await runOneCycle([]);

    const [url, body, options] = postsTo('/fetchAndLock')[0];
    expect(url).toBe(`${BASE}/external-task/fetchAndLock`);
    expect(options).toEqual({ headers: { 'Content-Type': 'application/json' } });
    expect(body).toMatchObject({
      workerId: WORKER_ID,
      maxTasks: 10,
      usePriority: false,
      asyncResponseTimeout: 20_000,
    });
    expect(body.topics.map((t: { topicName: string }) => t.topicName)).toEqual([
      'rip-edocs-workspace',
      'rip-edocs-document',
    ]);
    for (const topic of body.topics) {
      expect(topic.lockDuration).toBe(60_000);
    }
  });

  test('requests the variables each topic handler reads', async () => {
    await runOneCycle([]);

    const [, body] = postsTo('/fetchAndLock')[0];
    const [workspace, document] = body.topics;

    expect(workspace.variables).toEqual(['projectNumber', 'projectName']);
    expect(document.variables).toEqual(
      expect.arrayContaining([
        'edocsWorkspaceId',
        'projectNumber',
        'projectName',
        'documentTemplateId',
        'edocsDocumentVariableName',
      ])
    );
  });

  test('an idle cycle schedules a retry instead of busy-looping', async () => {
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
    mockPost.mockResolvedValue({ data: [] });

    worker.start();
    await flush();
    worker.stop();

    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 5_000);
    setTimeoutSpy.mockRestore();
  });

  test('a poll failure is logged and backed off rather than crashing the worker', async () => {
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
    mockPost.mockRejectedValue(new Error('Operaton unreachable'));

    worker.start();
    await flush();
    worker.stop();

    expect(mockLogError).toHaveBeenCalledWith('[ExternalTaskWorker] Poll error', {
      error: 'Operaton unreachable',
    });
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 5_000);
    setTimeoutSpy.mockRestore();
  });

  test('a response with no body is treated as no tasks', async () => {
    mockPost.mockResolvedValue({ data: null });

    worker.start();
    await flush();
    worker.stop();

    expect(mockEnsureWorkspace).not.toHaveBeenCalled();
  });
});

describe('rip-edocs-workspace topic', () => {
  test('ensures the workspace and writes the ids back as process variables', async () => {
    mockEnsureWorkspace.mockResolvedValue({
      workspaceId: 'ws-1',
      workspaceName: 'FL-042 — N305',
      created: true,
    });

    await runOneCycle([
      task('rip-edocs-workspace', strVars({ projectNumber: 'FL-042', projectName: 'N305' })),
    ]);

    expect(mockEnsureWorkspace).toHaveBeenCalledWith('FL-042', 'N305');
    const [url, body] = postsTo('/complete')[0];
    expect(url).toBe(`${BASE}/external-task/task-1/complete`);
    expect(body).toEqual({
      workerId: WORKER_ID,
      variables: {
        edocsWorkspaceId: { value: 'ws-1', type: 'String' },
        edocsWorkspaceName: { value: 'FL-042 — N305', type: 'String' },
        edocsWorkspaceCreated: { value: true, type: 'Boolean' },
      },
    });
  });

  test.each([
    ['no project number', { projectName: 'N305' }],
    ['no project name', { projectNumber: 'FL-042' }],
    ['neither variable', {}],
  ])('fails the task when the process supplied %s', async (_label, vars) => {
    await runOneCycle([task('rip-edocs-workspace', strVars(vars))]);

    expect(mockEnsureWorkspace).not.toHaveBeenCalled();
    const [url, body] = postsTo('/failure')[0];
    expect(url).toBe(`${BASE}/external-task/task-1/failure`);
    expect(body.errorMessage).toContain('rip-edocs-workspace: missing required variables');
    expect(body).toMatchObject({ workerId: WORKER_ID, retries: 0, retryTimeout: 0 });
  });

  test('reports an eDOCS failure back to Operaton', async () => {
    mockEnsureWorkspace.mockRejectedValue(new Error('eDOCS library full'));

    await runOneCycle([
      task('rip-edocs-workspace', strVars({ projectNumber: 'FL-042', projectName: 'N305' })),
    ]);

    expect(postsTo('/failure')[0][1].errorMessage).toBe('eDOCS library full');
    expect(postsTo('/complete')).toHaveLength(0);
  });
});

describe('rip-edocs-document topic', () => {
  const DOC_VARS = {
    edocsWorkspaceId: 'ws-1',
    projectNumber: 'FL-042',
    projectName: 'N305',
    documentTemplateId: 'rip-intake-report',
  };

  function uploadedContent() {
    const [, , contentBase64] = mockUploadDocument.mock.calls[0];
    return Buffer.from(contentBase64 as string, 'base64').toString('utf-8');
  }

  beforeEach(() => {
    mockUploadDocument.mockResolvedValue({
      documentId: 'doc-1',
      documentNumber: 'FL-2025-001234',
      workspaceId: 'ws-1',
    });
  });

  test('uploads the rendered document and writes both ids back', async () => {
    await runOneCycle([
      task(
        'rip-edocs-document',
        strVars({ ...DOC_VARS, edocsDocumentVariableName: 'edocsIntakeReportId' })
      ),
    ]);

    expect(postsTo('/complete')[0][1].variables).toEqual({
      edocsIntakeReportId: { value: 'FL-2025-001234', type: 'String' },
      edocsIntakeReportId_docId: { value: 'doc-1', type: 'String' },
    });
  });

  test('defaults the output variable name when the BPMN does not set one', async () => {
    await runOneCycle([task('rip-edocs-document', strVars(DOC_VARS))]);

    expect(Object.keys(postsTo('/complete')[0][1].variables)).toEqual([
      'edocsDocumentId',
      'edocsDocumentId_docId',
    ]);
  });

  test('names the file after the template and project number', async () => {
    await runOneCycle([task('rip-edocs-document', strVars(DOC_VARS))]);

    expect(mockUploadDocument).toHaveBeenCalledWith(
      'ws-1',
      'rip-intake-report-FL-042.txt',
      expect.any(String),
      { docName: 'FL-042 — Intake Report — N305', appId: 'INFRA' }
    );
  });

  test.each([
    ['rip-psu-report', 'PSU Report'],
    ['rip-pdp', 'Preliminary Design Principles'],
  ])('maps the %s template to its human-readable label', async (templateId, label) => {
    await runOneCycle([
      task('rip-edocs-document', strVars({ ...DOC_VARS, documentTemplateId: templateId })),
    ]);

    expect(mockUploadDocument.mock.calls[0][3].docName).toBe(`FL-042 — ${label} — N305`);
  });

  test('falls back to the raw template id when no label is registered', async () => {
    await runOneCycle([
      task('rip-edocs-document', strVars({ ...DOC_VARS, documentTemplateId: 'rip-unknown' })),
    ]);

    expect(mockUploadDocument.mock.calls[0][3].docName).toBe('FL-042 — rip-unknown — N305');
  });

  test.each([
    ['a missing workspace id', { ...DOC_VARS, edocsWorkspaceId: '' }],
    ['a missing template id', { ...DOC_VARS, documentTemplateId: '' }],
  ])('fails the task on %s', async (_label, vars) => {
    await runOneCycle([task('rip-edocs-document', strVars(vars))]);

    expect(mockUploadDocument).not.toHaveBeenCalled();
    expect(postsTo('/failure')[0][1].errorMessage).toContain(
      'rip-edocs-document: missing required variables'
    );
  });

  test('reports an upload failure back to Operaton', async () => {
    mockUploadDocument.mockRejectedValue(new Error('quota exceeded'));

    await runOneCycle([task('rip-edocs-document', strVars(DOC_VARS))]);

    expect(postsTo('/failure')[0][1].errorMessage).toBe('quota exceeded');
  });

  describe('rendered content', () => {
    test('every document carries the province header with project and timestamp', async () => {
      await runOneCycle([task('rip-edocs-document', strVars(DOC_VARS))]);

      const content = uploadedContent();
      expect(content).toContain('Province of Flevoland — Infrastructure');
      expect(content).toContain('Project: N305 (FL-042)');
      expect(content).toMatch(/Generated: \d{4}-\d{2}-\d{2}T/);
    });

    test('renders the intake report fields', async () => {
      await runOneCycle([
        task(
          'rip-edocs-document',
          strVars({
            ...DOC_VARS,
            intakeDecisions: 'Akkoord',
            intakeAgreements: 'Vastgelegd',
            confirmedScope: 'Herinrichting',
            confirmedBudget: '2.5M',
            confirmedTimeline: '2026-2028',
            intakeMeetingDate: '2026-03-01',
          })
        ),
      ]);

      const content = uploadedContent();
      expect(content).toContain('INTAKE REPORT (Column 2)');
      expect(content).toContain('Decisions: Akkoord');
      expect(content).toContain('Confirmed budget: 2.5M');
      expect(content).toContain('Meeting date: 2026-03-01');
    });

    test('renders the PSU report fields', async () => {
      await runOneCycle([
        task(
          'rip-edocs-document',
          strVars({
            ...DOC_VARS,
            documentTemplateId: 'rip-psu-report',
            psDate: '2026-04-01',
            psLocation: 'Lelystad',
            projectManager: 'J. Jansen',
            psOutcomes: 'Go',
            psActionPoints: 'Vervolgafspraak',
            psRisksIdentified: 'Stikstof',
          })
        ),
      ]);

      const content = uploadedContent();
      expect(content).toContain('PSU REPORT (Column 3)');
      expect(content).toContain('PSU date: 2026-04-01');
      expect(content).toContain('Project manager: J. Jansen');
      expect(content).toContain('Risks: Stikstof');
    });

    test('renders the preliminary design principles fields', async () => {
      await runOneCycle([
        task(
          'rip-edocs-document',
          strVars({
            ...DOC_VARS,
            documentTemplateId: 'rip-pdp',
            confirmedScope: 'Herinrichting',
            riskFileReference: 'REL-123',
            pdpNotes: 'Duurzaam asfalt',
          })
        ),
      ]);

      const content = uploadedContent();
      expect(content).toContain('PRELIMINARY DESIGN PRINCIPLES (Column 4)');
      expect(content).toContain('Risk dossier (Relatics): REL-123');
      expect(content).toContain('Design principles: Duurzaam asfalt');
    });

    test('an unregistered template renders a placeholder body rather than failing', async () => {
      await runOneCycle([
        task('rip-edocs-document', strVars({ ...DOC_VARS, documentTemplateId: 'rip-unknown' })),
      ]);

      const content = uploadedContent();
      expect(content).toContain('Document: rip-unknown');
      expect(content).toContain('(No template renderer registered for this template ID)');
    });

    test('absent variables render as an em dash rather than "undefined"', async () => {
      await runOneCycle([task('rip-edocs-document', strVars(DOC_VARS))]);

      const content = uploadedContent();
      expect(content).toContain('Decisions: —');
      expect(content).not.toContain('undefined');
    });
  });
});

describe('unknown topics', () => {
  test('are failed with an explicit message instead of being silently dropped', async () => {
    await runOneCycle([task('some-other-topic', strVars({}))]);

    expect(postsTo('/failure')[0][1].errorMessage).toBe('Unknown topic: some-other-topic');
    expect(postsTo('/complete')).toHaveLength(0);
  });
});

describe('failure reporting', () => {
  test('a failure to report failure is logged, not thrown', async () => {
    let fetches = 0;
    mockPost.mockImplementation(async (url: string) => {
      if (url.endsWith('/fetchAndLock')) {
        fetches += 1;
        if (fetches > 1) worker.stop();
        return { data: fetches === 1 ? [task('unknown-topic', strVars({}))] : [] };
      }
      throw new Error('Operaton rejected the failure report');
    });

    worker.start();
    await flush();

    expect(mockLogError).toHaveBeenCalledWith(
      '[ExternalTaskWorker] Failed to report task failure to Operaton',
      { taskId: 'task-1', error: 'Operaton rejected the failure report' }
    );
  });
});

describe('concurrent tasks', () => {
  test('all fetched tasks are handled in one cycle', async () => {
    mockEnsureWorkspace.mockResolvedValue({
      workspaceId: 'ws',
      workspaceName: 'w',
      created: false,
    });

    await runOneCycle([
      task('rip-edocs-workspace', strVars({ projectNumber: 'A', projectName: 'a' }), 'task-1'),
      task('rip-edocs-workspace', strVars({ projectNumber: 'B', projectName: 'b' }), 'task-2'),
    ]);

    expect(mockEnsureWorkspace).toHaveBeenCalledTimes(2);
    expect(postsTo('/complete')).toHaveLength(2);
  });

  test('one failing task does not prevent the others from completing', async () => {
    mockEnsureWorkspace
      .mockRejectedValueOnce(new Error('eDOCS down'))
      .mockResolvedValueOnce({ workspaceId: 'ws', workspaceName: 'w', created: false });

    await runOneCycle([
      task('rip-edocs-workspace', strVars({ projectNumber: 'A', projectName: 'a' }), 'task-1'),
      task('rip-edocs-workspace', strVars({ projectNumber: 'B', projectName: 'b' }), 'task-2'),
    ]);

    expect(postsTo('/failure')).toHaveLength(1);
    expect(postsTo('/complete')).toHaveLength(1);
  });
});

describe('module exports', () => {
  test('the singleton is an ExternalTaskWorker', () => {
    expect(externalTaskWorker).toBeInstanceOf(ExternalTaskWorker);
  });
});
