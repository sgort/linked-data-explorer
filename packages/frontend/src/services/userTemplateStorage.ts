import { ChainTemplate } from './templateService';

const STORAGE_KEY = 'linkeddata-explorer-user-templates';

/**
 * User template with endpoint association
 */
export interface UserTemplate extends ChainTemplate {
  endpoint: string;
  isUserTemplate: true;
}

/**
 * Storage structure: endpoint -> templates
 */
type TemplateStorage = Record<string, UserTemplate[]>;

/**
 * Get all user templates for a specific endpoint
 */
export function getUserTemplates(endpoint: string): UserTemplate[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];

    const storage: TemplateStorage = JSON.parse(stored);
    return storage[endpoint] || [];
  } catch (error) {
    console.error('Error loading user templates:', error);
    return [];
  }
}

/**
 * Get all user templates across all endpoints
 */
export function getAllUserTemplates(): UserTemplate[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];

    const storage: TemplateStorage = JSON.parse(stored);
    return Object.values(storage).flat();
  } catch (error) {
    console.error('Error loading all user templates:', error);
    return [];
  }
}

/**
 * Save a new user template
 */
export function saveUserTemplate(
  endpoint: string,
  template: Omit<UserTemplate, 'id' | 'createdAt' | 'updatedAt' | 'isUserTemplate'>
): UserTemplate {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const storage: TemplateStorage = stored ? JSON.parse(stored) : {};

    // Ensure endpoint key exists
    if (!storage[endpoint]) {
      storage[endpoint] = [];
    }

    // Create full template with metadata
    const newTemplate: UserTemplate = {
      ...template,
      id: `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      endpoint,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isUserTemplate: true,
    };

    // Add to storage
    storage[endpoint].push(newTemplate);

    // Save back to localStorage
    localStorage.setItem(STORAGE_KEY, JSON.stringify(storage));

    return newTemplate;
  } catch (error) {
    console.error('Error saving user template:', error);
    throw new Error('Failed to save template');
  }
}

/**
 * Update an existing user template
 */
export function updateUserTemplate(
  endpoint: string,
  templateId: string,
  updates: Partial<Omit<UserTemplate, 'id' | 'endpoint' | 'createdAt' | 'isUserTemplate'>>
): UserTemplate | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;

    const storage: TemplateStorage = JSON.parse(stored);
    const templates = storage[endpoint];
    if (!templates) return null;

    const index = templates.findIndex((t) => t.id === templateId);
    if (index === -1) return null;

    // Update template
    templates[index] = {
      ...templates[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    // Save back
    localStorage.setItem(STORAGE_KEY, JSON.stringify(storage));

    return templates[index];
  } catch (error) {
    console.error('Error updating user template:', error);
    return null;
  }
}

/**
 * Delete a user template
 */
export function deleteUserTemplate(endpoint: string, templateId: string): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return false;

    const storage: TemplateStorage = JSON.parse(stored);
    const templates = storage[endpoint];
    if (!templates) return false;

    const index = templates.findIndex((t) => t.id === templateId);
    if (index === -1) return false;

    // Remove template
    templates.splice(index, 1);

    // Save back
    localStorage.setItem(STORAGE_KEY, JSON.stringify(storage));

    return true;
  } catch (error) {
    console.error('Error deleting user template:', error);
    return false;
  }
}

/**
 * Get a specific user template by ID
 */
export function getUserTemplateById(endpoint: string, templateId: string): UserTemplate | null {
  const templates = getUserTemplates(endpoint);
  return templates.find((t) => t.id === templateId) || null;
}

/**
 * Clear all user templates (useful for testing/reset)
 */
export function clearAllUserTemplates(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Export user templates as JSON (for backup)
 */
export function exportUserTemplates(): string {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored || '{}';
}

/**
 * Import user templates from JSON (for restore)
 */
export function importUserTemplates(json: string): boolean {
  try {
    const parsed = JSON.parse(json);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
    return true;
  } catch (error) {
    console.error('Error importing user templates:', error);
    return false;
  }
}
