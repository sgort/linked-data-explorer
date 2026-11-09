import { DocumentTemplate } from '../types/document.types';
import { authHeaders, getAuthState } from './auth';

const STORAGE_KEY = 'linkedDataExplorer_documentTemplates';
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

export class DocumentService {
  static getTemplates(): DocumentTemplate[] {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? (JSON.parse(stored) as DocumentTemplate[]) : [];
  }

  /**
   * Stores the template locally, then, for an lde-author, in the shared library
   * in the background. Signed out (#163) the template stays in this browser,
   * marked `localOnly`, until an author saves it again.
   */
  static saveTemplate(template: DocumentTemplate): { localOnly: boolean } {
    const localOnly = !template.readonly && !getAuthState().isAuthor;
    const { localOnly: _old, ...rest } = template;
    const stored: DocumentTemplate = localOnly ? { ...rest, localOnly: true } : rest;

    const templates = this.getTemplates();
    const idx = templates.findIndex((t) => t.id === template.id);
    if (idx >= 0) templates[idx] = stored;
    else templates.push(stored);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));

    if (!template.readonly && !localOnly) {
      void (async () => {
        try {
          await fetch(`${API_BASE}/v1/assets/documents`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
            body: JSON.stringify(rest),
          });
        } catch (err) {
          console.warn('[DocumentService] Background save failed:', err);
        }
      })();
    }
    return { localOnly };
  }

  /** Signed out (#163), only a template kept in this browser can be deleted. */
  static deleteTemplate(templateId: string): void {
    const all = this.getTemplates();
    const isAuthor = getAuthState().isAuthor;
    if (!isAuthor && !all.find((t) => t.id === templateId)?.localOnly) {
      console.warn('[DocumentService] Delete refused: sign in to delete a shared template');
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all.filter((t) => t.id !== templateId)));
    if (!isAuthor) return;

    void (async () => {
      try {
        await fetch(`${API_BASE}/v1/assets/documents/${templateId}`, {
          method: 'DELETE',
          headers: await authHeaders(),
        });
      } catch (err) {
        console.warn('[DocumentService] Background delete failed:', err);
      }
    })();
  }

  static getTemplate(templateId: string): DocumentTemplate | null {
    return this.getTemplates().find((t) => t.id === templateId) ?? null;
  }

  static async hydrateFromServer(): Promise<DocumentTemplate[]> {
    try {
      const res = await fetch(`${API_BASE}/v1/assets/documents`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { data } = (await res.json()) as { data: DocumentTemplate[] };
      const local = this.getTemplates();
      const examples = local.filter((t) => t.readonly);
      // #163: keep what was saved signed out, unless the server has that id.
      const serverIds = new Set(data.map((t) => t.id));
      const localOnly = local.filter((t) => t.localOnly && !serverIds.has(t.id));
      const merged = [...examples, ...data, ...localOnly];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      return merged;
    } catch (err) {
      console.warn('[DocumentService] Hydration failed, using localStorage:', err);
      return this.getTemplates();
    }
  }
}
