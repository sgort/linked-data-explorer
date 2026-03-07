/**
 * Document Template Service
 *
 * Destination: packages/frontend/src/services/documentService.ts
 *
 * localStorage CRUD for DocumentTemplate objects.
 * Follows the exact same pattern as FormService and BpmnService.
 */

import { DocumentTemplate } from '../types/document.types';

const STORAGE_KEY = 'linkedDataExplorer_documentTemplates';

export class DocumentService {
  static getTemplates(): DocumentTemplate[] {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? (JSON.parse(stored) as DocumentTemplate[]) : [];
  }

  static saveTemplate(template: DocumentTemplate): void {
    const templates = this.getTemplates();
    const existingIndex = templates.findIndex((t) => t.id === template.id);
    if (existingIndex >= 0) {
      templates[existingIndex] = template;
    } else {
      templates.push(template);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
  }

  static deleteTemplate(templateId: string): void {
    const templates = this.getTemplates().filter((t) => t.id !== templateId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
  }

  static getTemplate(templateId: string): DocumentTemplate | null {
    return this.getTemplates().find((t) => t.id === templateId) ?? null;
  }
}
