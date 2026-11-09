import { FormSchema } from '../types';
import { authHeaders, getAuthState } from './auth';

const STORAGE_KEY = 'linkedDataExplorer_formSchemas';
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

export class FormService {
  static getForms(): FormSchema[] {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  }

  /**
   * Stores the form locally, then, for an lde-author, in the shared library in
   * the background. Signed out (#163) the form stays in this browser, marked
   * `localOnly`, until an author saves it again.
   */
  static saveForm(form: FormSchema): { localOnly: boolean } {
    const localOnly = !form.readonly && !getAuthState().isAuthor;
    const { localOnly: _old, ...rest } = form;
    const stored: FormSchema = localOnly ? { ...rest, localOnly: true } : rest;

    const forms = this.getForms();
    const idx = forms.findIndex((f) => f.id === form.id);
    if (idx >= 0) forms[idx] = stored;
    else forms.push(stored);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(forms));

    if (!form.readonly && !localOnly) {
      void (async () => {
        try {
          await fetch(`${API_BASE}/v1/assets/forms`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
            body: JSON.stringify({ ...rest, schema_version: 1 }),
          });
        } catch (err) {
          console.warn('[FormService] Background save failed:', err);
        }
      })();
    }
    return { localOnly };
  }

  /** Signed out (#163), only a form kept in this browser can be deleted. */
  static deleteForm(formId: string): void {
    const all = this.getForms();
    const isAuthor = getAuthState().isAuthor;
    if (!isAuthor && !all.find((f) => f.id === formId)?.localOnly) {
      console.warn('[FormService] Delete refused: sign in to delete a shared form');
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all.filter((f) => f.id !== formId)));
    if (!isAuthor) return;

    void (async () => {
      try {
        await fetch(`${API_BASE}/v1/assets/forms/${formId}`, {
          method: 'DELETE',
          headers: await authHeaders(),
        });
      } catch (err) {
        console.warn('[FormService] Background delete failed:', err);
      }
    })();
  }

  static getForm(formId: string): FormSchema | null {
    return this.getForms().find((f) => f.id === formId) || null;
  }

  static async hydrateFromServer(): Promise<FormSchema[]> {
    try {
      const res = await fetch(`${API_BASE}/v1/assets/forms`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { data } = (await res.json()) as { data: FormSchema[] };
      const local = this.getForms();
      const examples = local.filter((f) => f.readonly);
      // #163: keep what was saved signed out, unless the server has that id.
      const serverIds = new Set(data.map((f) => f.id));
      const localOnly = local.filter((f) => f.localOnly && !serverIds.has(f.id));
      const merged = [...examples, ...data, ...localOnly];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      return merged;
    } catch (err) {
      console.warn('[FormService] Hydration failed, using localStorage:', err);
      return this.getForms();
    }
  }
}
