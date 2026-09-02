// @vitest-environment jsdom
import { beforeEach, describe, expect, test } from 'vitest';

import {
  clearAllUserTemplates,
  deleteUserTemplate,
  exportUserTemplates,
  getAllUserTemplates,
  getUserTemplateById,
  getUserTemplates,
  importUserTemplates,
  saveUserTemplate,
  updateUserTemplate,
} from './userTemplateStorage';

const ENDPOINT = 'https://api.open-regels.triply.cc/datasets/x/facts/sparql';

/** Endpoint deliberately unlike ENDPOINT — see the note on `endpoint` below. */
const IGNORED_ENDPOINT = 'https://ignored.example.com/sparql';

function baseTemplate() {
  return {
    name: 'My chain',
    description: 'A chain saved from the builder',
    dmnIds: ['age-check', 'income-check'],
    // saveUserTemplate spreads the payload and then overwrites endpoint from
    // its own argument, so whatever is passed here is discarded. Passing a
    // different value keeps `expect(saved.endpoint).toBe(ENDPOINT)` honest.
    endpoint: IGNORED_ENDPOINT,
    type: 'sequential' as const,
    category: 'custom' as const,
    tags: [] as string[],
    complexity: 'simple' as const,
    estimatedTime: 5,
    isPublic: false,
  };
}

beforeEach(() => {
  clearAllUserTemplates();
});

describe('getUserTemplates / getUserTemplateById', () => {
  test('return [] / null when nothing has been saved', () => {
    expect(getUserTemplates(ENDPOINT)).toEqual([]);
    expect(getUserTemplateById(ENDPOINT, 'no-such-id')).toBeNull();
  });

  test('return [] when localStorage holds invalid JSON', () => {
    localStorage.setItem('linkeddata-explorer-user-templates', 'not json');
    expect(getUserTemplates(ENDPOINT)).toEqual([]);
  });
});

describe('saveUserTemplate', () => {
  test('assigns id/endpoint/timestamps/isUserTemplate to the saved template', () => {
    const saved = saveUserTemplate(ENDPOINT, baseTemplate());
    expect(saved.id).toMatch(/^user-/);
    expect(saved.endpoint).toBe(ENDPOINT);
    expect(saved.isUserTemplate).toBe(true);
    expect(saved.createdAt).toBeTruthy();
    expect(saved.updatedAt).toBeTruthy();
  });

  test('keeps separate templates per endpoint', () => {
    saveUserTemplate(ENDPOINT, baseTemplate());
    saveUserTemplate('https://other.example.com/sparql', baseTemplate());
    expect(getUserTemplates(ENDPOINT)).toHaveLength(1);
    expect(getAllUserTemplates()).toHaveLength(2);
  });
});

describe('updateUserTemplate', () => {
  test('updates fields and bumps updatedAt', async () => {
    const saved = saveUserTemplate(ENDPOINT, baseTemplate());
    await new Promise((r) => setTimeout(r, 5));

    const updated = updateUserTemplate(ENDPOINT, saved.id, { name: 'Renamed' });

    expect(updated?.name).toBe('Renamed');
    expect(updated?.updatedAt).not.toBe(saved.updatedAt);
  });

  test('returns null when the endpoint has no templates at all', () => {
    expect(updateUserTemplate(ENDPOINT, 'no-such-id', { name: 'x' })).toBeNull();
  });

  test('returns null when the id does not match any template', () => {
    saveUserTemplate(ENDPOINT, baseTemplate());
    expect(updateUserTemplate(ENDPOINT, 'no-such-id', { name: 'x' })).toBeNull();
  });
});

describe('deleteUserTemplate', () => {
  test('removes the matching template and returns true', () => {
    const saved = saveUserTemplate(ENDPOINT, baseTemplate());
    expect(deleteUserTemplate(ENDPOINT, saved.id)).toBe(true);
    expect(getUserTemplates(ENDPOINT)).toEqual([]);
  });

  test('returns false when the endpoint has no templates at all', () => {
    expect(deleteUserTemplate(ENDPOINT, 'no-such-id')).toBe(false);
  });

  test('returns false when the id does not match any template', () => {
    saveUserTemplate(ENDPOINT, baseTemplate());
    expect(deleteUserTemplate(ENDPOINT, 'no-such-id')).toBe(false);
  });
});

describe('export / import', () => {
  test('exportUserTemplates returns "{}" when nothing is stored', () => {
    expect(exportUserTemplates()).toBe('{}');
  });

  test('round-trips through export -> import', () => {
    saveUserTemplate(ENDPOINT, baseTemplate());
    const exported = exportUserTemplates();

    clearAllUserTemplates();
    expect(getUserTemplates(ENDPOINT)).toEqual([]);

    expect(importUserTemplates(exported)).toBe(true);
    expect(getUserTemplates(ENDPOINT)).toHaveLength(1);
  });

  test('importUserTemplates returns false for invalid JSON, without touching storage', () => {
    saveUserTemplate(ENDPOINT, baseTemplate());
    expect(importUserTemplates('not json')).toBe(false);
    expect(getUserTemplates(ENDPOINT)).toHaveLength(1);
  });
});
