import { FormSchema } from '../types';

const STORAGE_KEY = 'linkedDataExplorer_formSchemas';
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

export class FormService {
  static getForms(): FormSchema[] {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  }

  static saveForm(form: FormSchema): void {
    const forms = this.getForms();
    const idx = forms.findIndex((f) => f.id === form.id);
    if (idx >= 0) forms[idx] = form;
    else forms.push(form);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(forms));

    if (!form.readonly) {
      fetch(`${API_BASE}/v1/assets/forms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, schema_version: 1 }),
      }).catch((err) => console.warn('[FormService] Background save failed:', err));
    }
  }

  static deleteForm(formId: string): void {
    const forms = this.getForms().filter((f) => f.id !== formId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(forms));

    fetch(`${API_BASE}/v1/assets/forms/${formId}`, { method: 'DELETE' }).catch((err) =>
      console.warn('[FormService] Background delete failed:', err)
    );
  }

  static getForm(formId: string): FormSchema | null {
    return this.getForms().find((f) => f.id === formId) || null;
  }

  static async hydrateFromServer(): Promise<FormSchema[]> {
    try {
      const res = await fetch(`${API_BASE}/v1/assets/forms`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { data } = (await res.json()) as { data: FormSchema[] };
      const examples = this.getForms().filter((f) => f.readonly);
      const merged = [...examples, ...data];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      return merged;
    } catch (err) {
      console.warn('[FormService] Hydration failed, using localStorage:', err);
      return this.getForms();
    }
  }
}
