import axios, { AxiosInstance } from 'axios';
import { config } from '../utils/config';
import logger from '../utils/logger';
import { getErrorMessage } from '../utils/errors';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EdocsWorkspaceResult {
  workspaceId: string;
  workspaceName: string;
  /** true when a new workspace was created; false when an existing one was found */
  created: boolean;
}

export interface EdocsDocumentResult {
  documentId: string;
  /** Human-readable eDOCS document number, e.g. "FL-2025-001234" */
  documentNumber: string;
  workspaceId: string;
}

export interface EdocsDocumentMetadata {
  /** eDOCS DOCNAME profile field */
  docName: string;
  /** eDOCS APP_ID profile field — identifies the authoring application */
  appId?: string;
  /** eDOCS form name, e.g. "INFRAPROF" */
  formName?: string;
  /** Additional arbitrary profile fields passed through to eDOCS */
  extra?: Record<string, string>;
}

// ─── Service ──────────────────────────────────────────────────────────────────

/**
 * EdocsService — wrapper around the OpenText eDOCS REST API.
 *
 * Authentication flow:
 *   POST /connect  →  X-DM-DST session token  →  cached in memory
 *   Token is reused for all subsequent calls. On a 401/403 response the service
 *   re-authenticates once and retries the original request.
 *
 * Stub mode:
 *   When EDOCS_STUB_MODE=true all public methods return realistic fake responses
 *   and log what they would have done. This allows the BPMN + worker to run end-to-
 *   end in a development or acceptance environment before a live eDOCS server is
 *   available. The stub is transparent — callers cannot distinguish stub from live.
 */
export class EdocsService {
  private client: AxiosInstance;
  private sessionToken: string | null = null;
  private readonly stubMode: boolean;

  constructor() {
    this.stubMode = config.edocs.stubMode;

    this.client = axios.create({
      baseURL: config.edocs.baseUrl,
      timeout: 15000,
      headers: { 'Content-Type': 'application/json' },
    });

    this.client.interceptors.request.use((cfg) => {
      if (this.sessionToken) {
        cfg.headers['X-DM-DST'] = this.sessionToken;
      }
      return cfg;
    });

    if (this.stubMode) {
      logger.info('[EdocsService] Running in STUB MODE — no real eDOCS calls will be made');
    }
  }

  // ─── Authentication ─────────────────────────────────────────────────────────

  /**
   * Connects to the eDOCS DM Server and caches the session token.
   * Called lazily before the first request that requires authentication.
   */
  private async connect(): Promise<void> {
    if (this.stubMode) {
      this.sessionToken = 'stub-session-token';
      logger.debug('[EdocsService:stub] connect() → token cached');
      return;
    }

    logger.info('[EdocsService] Connecting to eDOCS DM Server', {
      baseUrl: config.edocs.baseUrl,
      library: config.edocs.library,
      userId: config.edocs.userId,
    });

    const response = await this.client.post('/connect', {
      data: {
        userid: config.edocs.userId,
        password: config.edocs.password,
        library: config.edocs.library,
      },
    });

    // The X-DM-DST token is returned as a response header
    const token = response.headers['x-dm-dst'] as string | undefined;
    if (!token) {
      throw new Error(
        'eDOCS connect() succeeded but X-DM-DST token was absent from response headers'
      );
    }

    this.sessionToken = token;
    logger.info('[EdocsService] Connected — session token cached');
  }

  /**
   * Ensures a valid session token is available.
   * Re-authenticates when the token has not yet been obtained.
   */
  private async ensureConnected(): Promise<void> {
    if (!this.sessionToken) {
      await this.connect();
    }
  }

  /**
   * Executes an eDOCS API call, re-authenticating once on 401/403.
   */
  private async withAuth<T>(fn: () => Promise<T>): Promise<T> {
    await this.ensureConnected();
    try {
      return await fn();
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 401 || status === 403) {
        logger.warn('[EdocsService] Session expired — re-authenticating');
        this.sessionToken = null;
        await this.connect();
        return await fn();
      }
      throw err;
    }
  }

  // ─── Workspaces ─────────────────────────────────────────────────────────────

  /**
   * Finds an existing workspace for the given project number, or creates one.
   *
   * Workspace naming convention: "<projectNumber> — <projectName>"
   * The projectNumber is used as the filter/search key so that re-deploying the same
   * process instance does not create duplicate workspaces.
   *
   * @param projectNumber  Unique project identifier, e.g. "FL-INF-2025-042"
   * @param projectName    Human-readable project name
   */
  async ensureWorkspace(projectNumber: string, projectName: string): Promise<EdocsWorkspaceResult> {
    if (this.stubMode) {
      const stubId = `stub-ws-${projectNumber.replace(/[^a-zA-Z0-9]/g, '-')}`;
      logger.info('[EdocsService:stub] ensureWorkspace()', { projectNumber, projectName, stubId });
      return {
        workspaceId: stubId,
        workspaceName: `${projectNumber} — ${projectName}`,
        created: false,
      };
    }

    return this.withAuth(async () => {
      const workspaceName = `${projectNumber} — ${projectName}`;

      // Search for an existing workspace matching the project number
      const searchResponse = await this.client.get('/workspaces', {
        params: {
          library: config.edocs.library,
          filter: `DOCNAME like '${projectNumber}%'`,
          max: 1,
        },
      });

      const list: Array<{ id: string; data: { DOCNAME: string } }> =
        searchResponse.data?.data?.list ?? [];

      if (list.length > 0) {
        const existing = list[0];
        logger.info('[EdocsService] Found existing workspace', {
          projectNumber,
          workspaceId: existing.id,
        });
        return {
          workspaceId: existing.id,
          workspaceName: existing.data.DOCNAME,
          created: false,
        };
      }

      // No existing workspace — create one
      logger.info('[EdocsService] Creating new workspace', { workspaceName });
      const createResponse = await this.client.post(
        '/workspaces',
        {
          data: {
            DOCNAME: workspaceName,
            AUTHOR_ID: config.edocs.userId,
            APP_ID: 'INFRA',
          },
        },
        { params: { library: config.edocs.library } }
      );

      const newWorkspaceId: string = createResponse.data?.data?.id ?? createResponse.data?.id;
      logger.info('[EdocsService] Workspace created', { workspaceName, newWorkspaceId });

      return {
        workspaceId: newWorkspaceId,
        workspaceName,
        created: true,
      };
    });
  }

  // ─── Documents ──────────────────────────────────────────────────────────────

  /**
   * Uploads a document to the specified eDOCS workspace.
   *
   * @param workspaceId   eDOCS workspace identifier returned by ensureWorkspace()
   * @param filename      Filename for the document, e.g. "intake-report-FL-INF-2025-042.pdf"
   * @param contentBase64 Base64-encoded file content
   * @param metadata      eDOCS profile fields (DOCNAME, APP_ID, etc.)
   */
  async uploadDocument(
    workspaceId: string,
    filename: string,
    contentBase64: string,
    metadata: EdocsDocumentMetadata
  ): Promise<EdocsDocumentResult> {
    if (this.stubMode) {
      const stubDocId = `stub-doc-${Date.now()}`;
      const stubDocNumber = `STUB-${Date.now()}`;
      logger.info('[EdocsService:stub] uploadDocument()', {
        workspaceId,
        filename,
        docName: metadata.docName,
        stubDocId,
        stubDocNumber,
      });
      return { documentId: stubDocId, documentNumber: stubDocNumber, workspaceId };
    }

    return this.withAuth(async () => {
      logger.info('[EdocsService] Uploading document', {
        workspaceId,
        filename,
        docName: metadata.docName,
      });

      const response = await this.client.post(
        '/documents',
        {
          file: contentBase64,
          data: {
            DOCNAME: metadata.docName,
            AUTHOR_ID: config.edocs.userId,
            TYPIST_ID: config.edocs.userId,
            APP_ID: metadata.appId ?? 'INFRA',
            ...(metadata.formName && {
              _restapi: {
                form_name: metadata.formName,
                ref: {
                  type: 'workspace',
                  id: parseInt(workspaceId, 10),
                  lib: config.edocs.library,
                },
              },
            }),
            ...(!metadata.formName && {
              _restapi: {
                ref: {
                  type: 'workspace',
                  id: parseInt(workspaceId, 10),
                  lib: config.edocs.library,
                },
              },
            }),
            ...(metadata.extra ?? {}),
          },
        },
        { params: { library: config.edocs.library } }
      );

      const documentId: string = response.data?.data?.id ?? response.data?.id;
      const documentNumber: string = response.data?.data?.DOCNUMBER ?? documentId;

      logger.info('[EdocsService] Document uploaded', { documentId, documentNumber, workspaceId });
      return { documentId, documentNumber, workspaceId };
    });
  }

  /**
   * Retrieves the list of documents in a workspace.
   * Used for verification and audit purposes.
   */
  async getWorkspaceDocuments(
    workspaceId: string
  ): Promise<Array<{ id: string; name: string; documentNumber: string }>> {
    if (this.stubMode) {
      logger.info('[EdocsService:stub] getWorkspaceDocuments()', { workspaceId });
      return [{ id: 'stub-doc-1', name: 'Stub document', documentNumber: 'STUB-001' }];
    }

    return this.withAuth(async () => {
      const response = await this.client.get(`/workspaces/${workspaceId}/documents`, {
        params: { library: config.edocs.library },
      });

      const list: Array<{ id: string; data: { DOCNAME: string; DOCNUMBER: string } }> =
        response.data?.data?.list ?? [];

      return list.map((item) => ({
        id: item.id,
        name: item.data.DOCNAME,
        documentNumber: item.data.DOCNUMBER,
      }));
    });
  }

  // ─── Health ─────────────────────────────────────────────────────────────────

  async healthCheck(): Promise<{
    status: 'up' | 'down' | 'stub';
    latency?: number;
    error?: string;
  }> {
    if (this.stubMode) {
      return { status: 'stub' };
    }
    try {
      const start = Date.now();
      await this.client.get('/libraries');
      return { status: 'up', latency: Date.now() - start };
    } catch (err) {
      return { status: 'down', error: getErrorMessage(err) };
    }
  }
}

export const edocsService = new EdocsService();
export default edocsService;
