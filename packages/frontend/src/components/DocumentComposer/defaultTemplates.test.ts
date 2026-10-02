import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, test } from 'vitest';

import { DocumentTemplate, ZONE_ORDER, ZoneId } from '../../types/document.types';
import {
  BESLUIT_GB_BESLUIT,
  DEFAULT_TEMPLATES,
  DVTP_CONSENT_RECEIPT,
  emptyDoc,
  heading,
  HR_CAPACITY_BOARD_DECISION_NOTIFICATION_NL,
  HR_CAPACITY_HANDOVER_NL,
  paragraphs,
  THUISBATTERIJ_SUBSIDIE_BESCHIKKING,
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
      THUISBATTERIJ_SUBSIDIE_BESCHIKKING,
      BESLUIT_GB_BESLUIT,
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

describe('BESLUIT_GB_BESLUIT', () => {
  test('is the signable besluit of the gedelegeerde-bevoegdheid bundle', () => {
    expect(BESLUIT_GB_BESLUIT.id).toBe('besluit-gb-besluit');
    expect(BESLUIT_GB_BESLUIT.processKey).toBe('GedelegeerdBesluitProcess');
    expect(BESLUIT_GB_BESLUIT.language).toBe('nl');
    expect(BESLUIT_GB_BESLUIT.organization).toBe('flevoland');
  });

  test('carries the default Dutch besluit text in its body', () => {
    expect(JSON.stringify(BESLUIT_GB_BESLUIT.zones.body)).toContain(
      'Besluiten tot het aangaan, wijzigen, beëindigen verplichtingen d.m.v. opdrachtbon, -brief, overeenkomst of anderszins voor: het leveren van zaken, verrichten van diensten en uitvoeren van werken.'
    );
  });

  test('has a text block opening its signOff zone, where ValidSign anchors the signature field', () => {
    expect(BESLUIT_GB_BESLUIT.zones.signOff?.blocks[0].type).toBe('text');
  });
});

describe('BESLUIT_GB_BESLUIT and its deployable file', () => {
  // Vite refuses imports from public/ in the dev server (vitest and tsc do
  // not), so the template is inline and this pins it to the public copy the
  // Modeler deploys and RBA renders for ValidSign.
  const file = join(
    __dirname,
    '../../../public/examples/flevoland/besluitvorming-gedelegeerd/besluit-gb-besluit.document'
  );

  test('is identical to the public .document file', () => {
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(BESLUIT_GB_BESLUIT);
  });

  test('is not imported from public/, which the Vite dev server rejects', () => {
    const source = readFileSync(join(__dirname, 'defaultTemplates.ts'), 'utf8');
    expect(source).not.toMatch(/from '[^']*\/public\//);
  });
});
