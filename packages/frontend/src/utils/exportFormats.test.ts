import { describe, expect, test } from 'vitest';

import { generateFilename, getAvailableFormats, getFormatById } from './exportFormats';

describe('getAvailableFormats', () => {
  test('returns all three known formats', () => {
    const formats = getAvailableFormats();
    expect(formats.map((f) => f.id).sort()).toEqual(['bpmn', 'json', 'package']);
  });
});

describe('getFormatById', () => {
  test('returns the format definition for a known id', () => {
    expect(getFormatById('bpmn')).toMatchObject({ id: 'bpmn', extension: 'bpmn' });
  });

  test('returns null for an unknown id', () => {
    // @ts-expect-error deliberately testing an invalid input
    expect(getFormatById('unknown')).toBeNull();
  });
});

describe('generateFilename', () => {
  const fixedDate = new Date('2026-07-22T14:05:09.000Z');

  test('sanitizes the chain name and appends the format extension', () => {
    const result = generateFilename('My Chain! Config', 'json', fixedDate);
    expect(result).toMatch(/^chain-my-chain-config-2026-07-22-\d{6}\.json$/);
  });

  test('strips leading/trailing non-alphanumeric characters from the chain name', () => {
    const result = generateFilename('--Weird Name--', 'bpmn', fixedDate);
    expect(result).toMatch(/^chain-weird-name-2026-07-22-\d{6}\.bpmn$/);
  });

  test('throws for an unknown format', () => {
    // @ts-expect-error deliberately testing an invalid input
    expect(() => generateFilename('x', 'unknown', fixedDate)).toThrow('Unknown export format');
  });
});
