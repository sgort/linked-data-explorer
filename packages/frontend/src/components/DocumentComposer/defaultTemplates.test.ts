import { describe, expect, test } from 'vitest';

import { DocumentTemplate, ZONE_ORDER, ZoneId } from '../../types/document.types';
import {
  DEFAULT_TEMPLATES,
  DVTP_CONSENT_RECEIPT,
  emptyDoc,
  heading,
  HR_CAPACITY_BOARD_DECISION_NOTIFICATION_NL,
  HR_CAPACITY_HANDOVER_NL,
  paragraphs,
  TREE_FELLING_BESCHIKKING,
  ZORGTOESLAG_FINAL_BESCHIKKING,
  ZORGTOESLAG_PROVISIONAL_BESCHIKKING,
} from './defaultTemplates';

const REQUIRED_ZONES: ZoneId[] = [
  'letterhead',
  'contactInformation',
  'reference',
  'body',
  'closing',
  'signOff',
];

describe('emptyDoc', () => {
  test('wraps text in a single paragraph', () => {
    expect(emptyDoc('Hoogachtend,')).toEqual({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hoogachtend,' }] }],
    });
  });

  test('produces a paragraph with no children when called without text', () => {
    expect(emptyDoc()).toEqual({
      type: 'doc',
      content: [{ type: 'paragraph', content: [] }],
    });
  });

  test('treats an explicit empty string as no text', () => {
    expect(emptyDoc('').content[0].content).toEqual([]);
  });
});

describe('heading', () => {
  test.each([1, 2, 3] as const)('builds a level-%i heading', (level) => {
    expect(heading(level, 'Beschikking')).toEqual({
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level },
          content: [{ type: 'text', text: 'Beschikking' }],
        },
      ],
    });
  });
});

describe('paragraphs', () => {
  test('maps each line to a paragraph, leaving blank lines empty', () => {
    expect(paragraphs(['first', '', 'third'])).toEqual({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'first' }] },
        { type: 'paragraph', content: [] },
        { type: 'paragraph', content: [{ type: 'text', text: 'third' }] },
      ],
    });
  });

  test('accepts an empty list', () => {
    expect(paragraphs([])).toEqual({ type: 'doc', content: [] });
  });
});

describe('DEFAULT_TEMPLATES', () => {
  test('exports every named template exactly once', () => {
    expect(DEFAULT_TEMPLATES).toEqual([
      TREE_FELLING_BESCHIKKING,
      ZORGTOESLAG_PROVISIONAL_BESCHIKKING,
      ZORGTOESLAG_FINAL_BESCHIKKING,
      DVTP_CONSENT_RECEIPT,
      HR_CAPACITY_BOARD_DECISION_NOTIFICATION_NL,
      HR_CAPACITY_HANDOVER_NL,
    ]);
  });

  test('template ids are unique', () => {
    const ids = DEFAULT_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test.each(DEFAULT_TEMPLATES.map((t) => [t.id, t] as [string, DocumentTemplate]))(
    '%s carries all required zones and a schema version',
    (_id, template) => {
      expect(template.schemaVersion).toBeGreaterThanOrEqual(1);
      expect(template.name).not.toBe('');
      for (const zone of REQUIRED_ZONES) {
        expect(Array.isArray(template.zones[zone]?.blocks)).toBe(true);
      }
      expect(Object.keys(template.zones).every((z) => ZONE_ORDER.includes(z as ZoneId))).toBe(true);
    }
  );

  test.each(DEFAULT_TEMPLATES.map((t) => [t.id, t] as [string, DocumentTemplate]))(
    '%s has unique block ids and well-formed blocks',
    (_id, template) => {
      const blocks = ZONE_ORDER.flatMap((z) => template.zones[z]?.blocks ?? []);
      expect(blocks.length).toBeGreaterThan(0);
      expect(new Set(blocks.map((b) => b.id)).size).toBe(blocks.length);

      for (const block of blocks) {
        expect(['text', 'image', 'variable', 'separator', 'spacer']).toContain(block.type);
        if (block.type === 'text') expect(block.content?.type).toBe('doc');
        if (block.type === 'image') expect(typeof block.assetUrl).toBe('string');
        if (block.type === 'variable') expect(typeof block.variableKey).toBe('string');
      }
    }
  );

  test.each(DEFAULT_TEMPLATES.map((t) => [t.id, t] as [string, DocumentTemplate]))(
    '%s declares a binding for every placeholder it uses',
    (_id, template) => {
      const text = JSON.stringify(template.zones);
      const used = new Set([...text.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map((m) => m[1]));
      const bound = new Set(template.bindings.map((b) => b.variableKey));

      for (const placeholder of used) {
        expect(bound.has(placeholder)).toBe(true);
      }
    }
  );

  test.each(DEFAULT_TEMPLATES.map((t) => [t.id, t] as [string, DocumentTemplate]))(
    '%s has unique binding ids and ISO timestamps',
    (_id, template) => {
      expect(new Set(template.bindings.map((b) => b.id)).size).toBe(template.bindings.length);
      expect(Number.isNaN(Date.parse(template.createdAt))).toBe(false);
      expect(Number.isNaN(Date.parse(template.updatedAt))).toBe(false);
      expect(Array.isArray(template.assets)).toBe(true);
    }
  );
});
