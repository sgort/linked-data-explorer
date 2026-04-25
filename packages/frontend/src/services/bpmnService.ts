import { BpmnProcess } from '../types';

const STORAGE_KEY = 'linkedDataExplorer_bpmnProcesses';
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

export class BpmnService {
  static getProcesses(): BpmnProcess[] {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  }

  static saveProcess(process: BpmnProcess): void {
    const processes = this.getProcesses();
    const idx = processes.findIndex((p) => p.id === process.id);
    if (idx >= 0) processes[idx] = process;
    else processes.push(process);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(processes));

    if (!process.readonly) {
      fetch(`${API_BASE}/v1/assets/bpmn`, {
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
          linkedDmnTemplates: process.linkedDmnTemplates,
          status: process.status,
          language: process.language,
          organization: process.organization,
          createdAt: process.createdAt,
          updatedAt: process.updatedAt,
        }),
      }).catch((err) => console.warn('[BpmnService] Background save failed:', err));
    }
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
