import { BpmnProcess } from '../types';

const STORAGE_KEY = 'linkedDataExplorer_bpmnProcesses';

/**
 * Service for managing BPMN processes in localStorage
 */
export class BpmnService {
  /**
   * Get all saved BPMN processes
   */
  static getProcesses(): BpmnProcess[] {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  }

  /**
   * Save a BPMN process
   */
  static saveProcess(process: BpmnProcess): void {
    const processes = this.getProcesses();
    const existingIndex = processes.findIndex((p) => p.id === process.id);

    if (existingIndex >= 0) {
      processes[existingIndex] = process;
    } else {
      processes.push(process);
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(processes));
  }

  /**
   * Delete a BPMN process
   */
  static deleteProcess(processId: string): void {
    const processes = this.getProcesses().filter((p) => p.id !== processId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(processes));
  }

  /**
   * Get a specific process by ID
   */
  static getProcess(processId: string): BpmnProcess | null {
    return this.getProcesses().find((p) => p.id === processId) || null;
  }
}
