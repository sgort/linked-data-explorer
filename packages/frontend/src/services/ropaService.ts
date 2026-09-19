import { RopaRecord } from '../types/ropa.types';
import { getProblemDetail } from '../utils/problem';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

/** Reads the RFC 9457 `detail` from a failed response, falling back to the
 *  bare status when the body isn't (parseable) problem+json. */
async function problemDetail(res: Response): Promise<string> {
  const body = await res.json().catch(() => null);
  return getProblemDetail(body, `HTTP ${res.status}`);
}

export class RopaService {
  static async listRopa(): Promise<RopaRecord[]> {
    const res = await fetch(`${API_BASE}/v1/assets/ropa`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { data } = (await res.json()) as { data: RopaRecord[] };
    return data;
  }

  static async getRopaByBpmnProcessId(bpmnProcessId: string): Promise<RopaRecord | null> {
    const res = await fetch(
      `${API_BASE}/v1/assets/ropa/by-bpmn-id/${encodeURIComponent(bpmnProcessId)}`
    );
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { data } = (await res.json()) as { data: RopaRecord };
    return data;
  }

  static async upsertRopa(
    record: Omit<RopaRecord, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
  ): Promise<string> {
    const res = await fetch(`${API_BASE}/v1/assets/ropa`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record),
    });
    if (!res.ok) throw new Error(await problemDetail(res));
    const { data } = (await res.json()) as { data: { id: string } };
    return data.id;
  }

  static async deleteRopa(id: string): Promise<void> {
    const res = await fetch(`${API_BASE}/v1/assets/ropa/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(await problemDetail(res));
  }
}
