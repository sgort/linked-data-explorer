import { BpmnProcess } from '../types';
import { authHeaders, getAuthState } from './auth';

const STORAGE_KEY = 'linkedDataExplorer_bpmnProcesses';
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

/** The backend's 409 PROCESS_ID_TAKEN (#171): who already holds the process id. */
export interface ProcessIdConflict {
  bpmnProcessId: string;
  organization: string | null;
  existing: { id: string; name: string; status: string };
}

/** `conflict` is set only when the backend refused the save with PROCESS_ID_TAKEN. */
export interface SaveOutcome {
  saved: boolean;
  conflict?: ProcessIdConflict;
  /** Saved while signed out: kept in this browser only (#163). */
  localOnly?: boolean;
}

export class BpmnService {
  static getProcesses(): BpmnProcess[] {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  }

  /**
   * Writes to localStorage synchronously (so a caller that doesn't await
   * this can still rely on getProcesses() seeing it immediately after), then
   * persists to the backend. Resolves `true` on success — including a
   * readonly process, which never POSTs — and `false` when the write
   * failed, rather than resolving successfully regardless as it used to
   * (#155). Never rejects: a caller that doesn't check the result behaves
   * exactly as before, still with a console warning on failure.
   */
  static async saveProcess(process: BpmnProcess): Promise<boolean> {
    return (await this.saveProcessDetailed(process)).saved;
  }

  /**
   * saveProcess, but says why a save failed when the backend refused it
   * because another stored process in the organisation already has this
   * process id (409 PROCESS_ID_TAKEN, #171), so the caller can offer to
   * replace that process or rename this one. Never rejects.
   */
  static async saveProcessDetailed(process: BpmnProcess): Promise<SaveOutcome> {
    const processes = this.getProcesses();
    const idx = processes.findIndex((p) => p.id === process.id);
    if (idx >= 0) processes[idx] = process;
    else processes.push(process);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(processes));

    if (process.readonly) return { saved: true };

    // #163: without lde-author the shared library refuses the write, so the
    // process stays in this browser, marked, until an author saves it again.
    if (!getAuthState().isAuthor) {
      this.setLocalOnly(process.id, true);
      return { saved: true, localOnly: true };
    }

    try {
      // A session that can no longer be refreshed, or a refusal, must not lose
      // the save: it stays in this browser, marked, like a signed-out save.
      const headers = await authHeaders();
      if (!headers.Authorization) {
        this.setLocalOnly(process.id, true);
        return { saved: true, localOnly: true };
      }
      const res = await fetch(`${API_BASE}/v1/assets/bpmn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({
          id: process.id,
          bpmnProcessId: process.bpmnProcessId ?? 'unknown',
          name: process.name,
          description: process.description,
          xml: process.xml,
          processRole: process.processRole ?? 'standalone',
          calledElement: process.calledElement,
          shellId: process.shellId,
          linkedDmnTemplates: process.linkedDmnTemplates,
          status: process.status,
          language: process.language,
          organization: process.organization,
          createdAt: process.createdAt,
          updatedAt: process.updatedAt,
        }),
      });
      if (res.status === 409) {
        const problem = (await res.json().catch(() => ({}))) as Partial<ProcessIdConflict> & {
          code?: string;
        };
        if (problem.code === 'PROCESS_ID_TAKEN' && problem.existing && problem.bpmnProcessId) {
          console.warn('[BpmnService] Save refused, process id in use:', problem.existing);
          return {
            saved: false,
            conflict: {
              bpmnProcessId: problem.bpmnProcessId,
              organization: problem.organization ?? null,
              existing: problem.existing,
            },
          };
        }
      }
      if (res.status === 401 || res.status === 403) {
        this.setLocalOnly(process.id, true);
        return { saved: true, localOnly: true };
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.setLocalOnly(process.id, false);
      return { saved: true };
    } catch (err) {
      console.warn('[BpmnService] Background save failed:', err);
      return { saved: false };
    }
  }

  /**
   * Drops a process from the local cache only. For a process the backend never
   * stored, such as an import it refused (#171): deleteProcess would also send
   * a DELETE for an id the server does not have.
   */
  static forgetLocal(processId: string): void {
    const processes = this.getProcesses().filter((p) => p.id !== processId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(processes));
  }

  /**
   * Signed out (#163), only a process kept in this browser can be deleted; a
   * shared one is left alone (the UI locks its Delete).
   */
  static deleteProcess(processId: string): void {
    const all = this.getProcesses();
    const target = all.find((p) => p.id === processId);
    const isAuthor = getAuthState().isAuthor;
    if (!isAuthor && !target?.localOnly) {
      console.warn('[BpmnService] Delete refused: sign in to delete a shared process');
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all.filter((p) => p.id !== processId)));
    if (!isAuthor) return;

    void (async () => {
      try {
        await fetch(`${API_BASE}/v1/assets/bpmn/${processId}`, {
          method: 'DELETE',
          headers: await authHeaders(),
        });
      } catch (err) {
        console.warn('[BpmnService] Background delete failed:', err);
      }
    })();
  }

  /** Marks or unmarks a stored process as kept in this browser only. */
  private static setLocalOnly(processId: string, on: boolean): void {
    const processes = this.getProcesses().map((p) => {
      if (p.id !== processId) return p;
      const { localOnly: _old, ...rest } = p;
      return on ? { ...rest, localOnly: true } : rest;
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(processes));
  }

  static getProcess(processId: string): BpmnProcess | null {
    return this.getProcesses().find((p) => p.id === processId) || null;
  }

  /** Fetches user assets from the API, merges with local examples, updates localStorage cache. */
  static async hydrateFromServer(): Promise<BpmnProcess[]> {
    try {
      const res = await fetch(`${API_BASE}/v1/assets/bpmn`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { data } = (await res.json()) as { data: BpmnProcess[] };
      const local = this.getProcesses();
      const examples = local.filter((p) => p.readonly);
      // #163: keep what was saved in this browser, unless the server holds a
      // copy at least as recent: then someone saved it since, and the server
      // wins. A signed-out edit of a shared process is newer than its server
      // copy, so it stays, still marked, instead of vanishing on reload.
      const serverById = new Map(data.map((p) => [p.id, p]));
      const localOnly = local.filter((p) => {
        if (!p.localOnly) return false;
        const onServer = serverById.get(p.id);
        return !onServer || Date.parse(p.updatedAt) > Date.parse(onServer.updatedAt);
      });
      const keptIds = new Set(localOnly.map((p) => p.id));
      const merged = [...examples, ...data.filter((p) => !keptIds.has(p.id)), ...localOnly];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      return merged;
    } catch (err) {
      console.warn('[BpmnService] Hydration failed, using localStorage:', err);
      return this.getProcesses();
    }
  }
}
