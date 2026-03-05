import { FormSchema } from '../types';

const STORAGE_KEY = 'linkedDataExplorer_formSchemas';

/**
 * Service for managing Camunda Form schemas in localStorage
 */
export class FormService {
  static getForms(): FormSchema[] {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  }

  static saveForm(form: FormSchema): void {
    const forms = this.getForms();
    const existingIndex = forms.findIndex((f) => f.id === form.id);
    if (existingIndex >= 0) {
      forms[existingIndex] = form;
    } else {
      forms.push(form);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(forms));
  }

  static deleteForm(formId: string): void {
    const forms = this.getForms().filter((f) => f.id !== formId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(forms));
  }

  static getForm(formId: string): FormSchema | null {
    return this.getForms().find((f) => f.id === formId) || null;
  }
}
