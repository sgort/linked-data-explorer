import { BpmnProcess } from '../types';

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

    try {
      const res = await fetch(`${API_BASE}/v1/assets/bpmn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
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

  static deleteProcess(processId: string): void {
    const processes = this.getProcesses().filter((p) => p.id !== processId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(processes));

    fetch(`${API_BASE}/v1/assets/bpmn/${processId}`, { method: 'DELETE' }).catch((err) =>
      console.warn('[BpmnService] Background delete failed:', err)
    );
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
      const examples = this.getProcesses().filter((p) => p.readonly);
      const merged = [...examples, ...data];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      return merged;
    } catch (err) {
      console.warn('[BpmnService] Hydration failed, using localStorage:', err);
      return this.getProcesses();
    }
  }
}
