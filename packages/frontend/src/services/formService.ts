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
          // A session that can no longer be refreshed, or a refusal, must not
          // lose the save: it stays in this browser, marked, like a signed-out
          // save (#163).
          const headers = await authHeaders();
          if (!headers.Authorization) {
            this.markLocalOnly(form.id);
            return;
          }
          const res = await fetch(`${API_BASE}/v1/assets/forms`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...headers },
            body: JSON.stringify({ ...rest, schema_version: 1 }),
          });
          if (res.status === 401 || res.status === 403) this.markLocalOnly(form.id);
        } catch (err) {
          console.warn('[FormService] Background save failed:', err);
        }
      })();
    }
    return { localOnly };
  }

  /** Marks a stored form as kept in this browser only (#163). */
  static markLocalOnly(formId: string): void {
    const forms = this.getForms().map((f) => (f.id === formId ? { ...f, localOnly: true } : f));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(forms));
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
      // #163: keep what was saved in this browser, unless the server holds a
      // copy at least as recent: then someone saved it since, and the server
      // wins. A signed-out edit of a shared form is newer than its server
      // copy, so it stays, still marked, instead of vanishing on reload.
      const serverById = new Map(data.map((f) => [f.id, f]));
      const localOnly = local.filter((f) => {
        if (!f.localOnly) return false;
        const onServer = serverById.get(f.id);
        return !onServer || Date.parse(f.updatedAt) > Date.parse(onServer.updatedAt);
      });
      const keptIds = new Set(localOnly.map((f) => f.id));
      const merged = [...examples, ...data.filter((f) => !keptIds.has(f.id)), ...localOnly];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      return merged;
    } catch (err) {
      console.warn('[FormService] Hydration failed, using localStorage:', err);
      return this.getForms();
    }
  }
}
