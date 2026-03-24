import { DocumentTemplate } from '../types/document.types';

const STORAGE_KEY = 'linkedDataExplorer_documentTemplates';
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

export class DocumentService {
  static getTemplates(): DocumentTemplate[] {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? (JSON.parse(stored) as DocumentTemplate[]) : [];
  }

  static saveTemplate(template: DocumentTemplate): void {
    const templates = this.getTemplates();
    const idx = templates.findIndex((t) => t.id === template.id);
    if (idx >= 0) templates[idx] = template;
    else templates.push(template);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));

    if (!template.readonly) {
      fetch(`${API_BASE}/v1/assets/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(template),
      }).catch((err) => console.warn('[DocumentService] Background save failed:', err));
    }
  }

  static deleteTemplate(templateId: string): void {
    const templates = this.getTemplates().filter((t) => t.id !== templateId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));

    fetch(`${API_BASE}/v1/assets/documents/${templateId}`, { method: 'DELETE' }).catch((err) =>
      console.warn('[DocumentService] Background delete failed:', err)
    );
  }

  static getTemplate(templateId: string): DocumentTemplate | null {
    return this.getTemplates().find((t) => t.id === templateId) ?? null;
  }

  static async hydrateFromServer(): Promise<DocumentTemplate[]> {
    try {
      const res = await fetch(`${API_BASE}/v1/assets/documents`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { data } = (await res.json()) as { data: DocumentTemplate[] };
      const examples = this.getTemplates().filter((t) => t.readonly);
      const merged = [...examples, ...data];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      return merged;
    } catch (err) {
      console.warn('[DocumentService] Hydration failed, using localStorage:', err);
      return this.getTemplates();
    }
  }
}
