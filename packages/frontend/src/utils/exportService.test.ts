// @vitest-environment jsdom
import JSZip from 'jszip';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { DmnModel } from '../types';
import { ExportFormat, ExportOptions } from '../types/export.types';

const getFormatById = vi.hoisted(() => vi.fn());

vi.mock('./exportFormats', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./exportFormats')>();
  return {
    ...actual,
    getFormatById: (id: ExportFormat) => getFormatById(id),
  };
});

import * as exportFormats from './exportFormats';
import { exportChain, validateChainForExport } from './exportService';

// ─── Test doubles for the browser download path ──────────────────────────────
//
// downloadBlob() calls URL.createObjectURL(blob) and then clicks a temporary
// <a>. jsdom implements neither, so record both halves and pair them up.

let downloads: { blob: Blob | null; filename: string }[] = [];
let clickSpy: ReturnType<typeof vi.spyOn>;
let lastBlob: Blob | null = null;
let createObjectURL: (blob: Blob) => string;

function dmn(overrides: Partial<DmnModel> = {}): DmnModel {
  return {
    id: 'd1',
    identifier: 'age-check',
    title: 'Age check',
    inputs: [{ identifier: 'age', title: 'Age', type: 'Integer' }],
    outputs: [{ identifier: 'eligible', title: 'Eligible', type: 'Boolean' }],
    ...overrides,
  } as DmnModel;
}

function options(overrides: Partial<ExportOptions> = {}): ExportOptions {
  return { format: 'json', filename: 'my-chain', ...overrides };
}

async function textOf(content: string | Blob): Promise<string> {
  return content instanceof Blob ? await content.text() : content;
}

beforeEach(() => {
  downloads = [];
  lastBlob = null;

  getFormatById.mockImplementation((id: ExportFormat) => exportFormats.EXPORT_FORMATS[id] ?? null);

  createObjectURL = (blob: Blob) => {
    lastBlob = blob;
    return 'blob:mock';
  };
  vi.stubGlobal('URL', {
    createObjectURL: (blob: Blob) => createObjectURL(blob),
    revokeObjectURL: vi.fn(),
  });

  clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement
  ) {
    downloads.push({ blob: lastBlob, filename: this.download });
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('validateChainForExport', () => {
  test('rejects an empty chain', () => {
    expect(validateChainForExport([])).toEqual({
      valid: false,
      errors: ['Chain is empty - add at least one DMN'],
    });
  });

  test('accepts a chain with at least one DMN', () => {
    expect(validateChainForExport(['age-check'])).toEqual({ valid: true, errors: [] });
  });
});

describe('exportChain format selection', () => {
  test('rejects a format with no definition', async () => {
    getFormatById.mockReturnValue(null);

    const result = await exportChain([], {}, [], options({ format: 'nope' as ExportFormat }));

    expect(result).toEqual({
      success: false,
      filename: '',
      content: '',
      error: 'Unknown export format: nope',
    });
    expect(clickSpy).not.toHaveBeenCalled();
  });

  test('rejects a known-but-unhandled format', async () => {
    // Defensive branch: a format the registry knows but the switch does not render.
    getFormatById.mockReturnValue({
      id: 'yaml' as ExportFormat,
      name: 'YAML',
      description: '',
      extension: 'yaml',
      mimeType: 'text/yaml',
      icon: '📄',
    });

    const result = await exportChain(['a'], {}, [], options({ format: 'yaml' as ExportFormat }));

    expect(result.success).toBe(false);
    expect(result.error).toBe('Unsupported export format: yaml');
  });

  test('reports a thrown error as a failed export', async () => {
    getFormatById.mockImplementation(() => {
      throw new Error('registry offline');
    });

    const result = await exportChain(['a'], {}, [], options());

    expect(result).toEqual({
      success: false,
      filename: '',
      content: '',
      error: 'registry offline',
    });
  });

  test('falls back to a generic message when a non-Error is thrown', async () => {
    getFormatById.mockImplementation(() => {
      throw 'kaboom';
    });

    const result = await exportChain(['a'], {}, [], options());
    expect(result.error).toBe('Unknown error during export');
  });
});

describe('exportChain — JSON', () => {
  test('pretty-prints by default and downloads the blob', async () => {
    const result = await exportChain(
      ['age-check', 'income-check'],
      { age: 42 },
      [dmn()],
      options({ filename: 'my-chain.json' })
    );

    expect(result.success).toBe(true);
    expect(result.filename).toBe('my-chain.json');
    expect(downloads).toHaveLength(1);
    expect(downloads[0].filename).toBe('my-chain.json');

    const json = JSON.parse(await textOf(result.content));
    expect(json.version).toBe('1.0');
    expect(json.chain).toEqual({ dmnIds: ['age-check', 'income-check'], inputs: { age: 42 } });
    expect(await textOf(result.content)).toContain('\n  ');
  });

  test('emits compact JSON when prettyPrint is false', async () => {
    const result = await exportChain(['a'], {}, [], options({ prettyPrint: false }));
    expect(await textOf(result.content)).not.toContain('\n  ');
  });

  test('pluralises the generated description', async () => {
    const one = await exportChain(['a'], {}, [], options());
    const two = await exportChain(['a', 'b'], {}, [], options());

    expect(JSON.parse(await textOf(one.content)).description).toBe('Chain with 1 DMN');
    expect(JSON.parse(await textOf(two.content)).description).toBe('Chain with 2 DMNs');
  });

  test.each([
    [['a'], 'simple'],
    [['a', 'b'], 'simple'],
    [['a', 'b', 'c'], 'medium'],
    [['a', 'b', 'c', 'd'], 'medium'],
    [['a', 'b', 'c', 'd', 'e'], 'complex'],
  ])('grades a %s-DMN chain as %s', async (ids, complexity) => {
    const result = await exportChain(ids as string[], {}, [], options());
    const meta = JSON.parse(await textOf(result.content)).metadata;

    expect(meta.complexity).toBe(complexity);
    expect(meta.estimatedTime).toBe((ids as string[]).length * 150 + 50);
    expect(meta.tags).toEqual(['exported', 'chain']);
  });

  test('omits metadata when includeMetadata is false', async () => {
    const result = await exportChain(['a'], {}, [], options({ includeMetadata: false }));
    expect(JSON.parse(await textOf(result.content)).metadata).toBeUndefined();
  });

  test('derives a filename when none is given', async () => {
    const result = await exportChain(['a'], {}, [], { format: 'json' });

    expect(JSON.parse(await textOf(result.content)).name).toBe('Unnamed Chain');
    expect(result.filename).toMatch(/^chain-unnamed-chain-\d{4}-\d{2}-\d{2}-\d{6}\.json$/);
  });
});

describe('exportChain — BPMN', () => {
  async function bpmnFor(dmnIds: string[], dmns: DmnModel[], name = 'My Chain') {
    const result = await exportChain(dmnIds, {}, dmns, options({ format: 'bpmn', filename: name }));
    return { result, xml: await textOf(result.content) };
  }

  test('emits one business rule task per DMN wired start → tasks → end', async () => {
    const { xml } = await bpmnFor(
      ['age-check', 'income-check'],
      [dmn(), dmn({ identifier: 'income-check', title: 'Income check' })]
    );

    expect(xml).toContain('<process id="chain-my-chain"');
    expect(xml).toContain('operaton:decisionRef="age-check"');
    expect(xml).toContain('operaton:decisionRef="income-check"');
    expect(xml).toContain('<incoming>flow-start-dmn-0</incoming>');
    expect(xml).toContain('<outgoing>flow-dmn-0-dmn-1</outgoing>');
    expect(xml).toContain('<incoming>flow-dmn-1-end</incoming>');
    expect(xml).toContain('sourceRef="dmn-0" targetRef="dmn-1"');
  });

  test('falls back to the DMN id when the model is not in the chain list', async () => {
    const { xml } = await bpmnFor(['unknown-dmn'], []);
    expect(xml).toContain('<businessRuleTask id="dmn-0" name="unknown-dmn"');
    expect(xml).not.toContain('<documentation>');
  });

  test('includes the DMN description as task documentation when present', async () => {
    const { xml } = await bpmnFor(['age-check'], [dmn({ description: 'Checks age' })]);
    expect(xml).toContain('<documentation>Checks age</documentation>');
  });

  test('escapes XML-significant characters in names and ids', async () => {
    const { xml } = await bpmnFor(
      ['a&b'],
      [dmn({ identifier: 'a&b', title: '<Age> & "Income" \'check\'' })]
    );

    expect(xml).toContain('&lt;Age&gt; &amp; &quot;Income&quot; &apos;check&apos;');
    expect(xml).toContain('operaton:decisionRef="a&amp;b"');
  });

  test('lays out one diagram shape per task plus start and end events', async () => {
    const { xml } = await bpmnFor(['a', 'b'], []);

    expect(xml).toContain('bpmnElement="dmn-0"');
    expect(xml).toContain('bpmnElement="dmn-1"');
    expect(xml).toContain('<bpmndi:BPMNShape id="end_di" bpmnElement="end">');
    expect(xml).toContain('x="650" y="102"');
    expect(xml).toContain('<bpmndi:BPMNEdge id="flow-dmn-0-dmn-1_di"');
  });

  test('downloads with the XML mime type', async () => {
    const { result } = await bpmnFor(['a'], []);
    expect(result.success).toBe(true);
    expect((result.content as Blob).type).toBe('application/xml');
    expect(downloads).toHaveLength(1);
  });
});

describe('exportChain — package (ZIP)', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => ({
        ok: true,
        statusText: 'OK',
        text: async () => `<definitions id="${String(url).split('/').slice(-2)[0]}" />`,
      }))
    );
  });

  async function entriesOf(content: string | Blob) {
    const zip = await JSZip.loadAsync(content as Blob);
    return Object.keys(zip.files).sort();
  }

  test('bundles the BPMN, every DMN and a README', async () => {
    const result = await exportChain(
      ['age-check', 'income-check'],
      { age: 42 },
      [dmn(), dmn({ identifier: 'income-check', title: 'Income check' })],
      options({ format: 'package', filename: 'my-chain' })
    );

    expect(result.success).toBe(true);
    expect(result.filename).toMatch(/^chain-my-chain-\d{4}-\d{2}-\d{2}-\d{6}\.zip$/);
    expect(await entriesOf(result.content)).toEqual([
      'README.md',
      'age-check.dmn',
      'chain.bpmn',
      'income-check.dmn',
    ]);
    expect(downloads).toHaveLength(1);
  });

  test('skips a DMN whose XML cannot be fetched but still produces a package', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        String(url).includes('missing')
          ? { ok: false, statusText: 'Not Found', text: async () => '' }
          : { ok: true, statusText: 'OK', text: async () => '<definitions />' }
      )
    );

    const result = await exportChain(
      ['age-check', 'missing'],
      {},
      [dmn()],
      options({ format: 'package' })
    );

    expect(result.success).toBe(true);
    expect(await entriesOf(result.content)).toEqual(['README.md', 'age-check.dmn', 'chain.bpmn']);
    expect(consoleError).toHaveBeenCalledWith(
      'Failed to fetch DMN missing:',
      expect.objectContaining({ message: 'Failed to fetch DMN missing: Not Found' })
    );
  });

  test('reports a failure when the package cannot be built', async () => {
    createObjectURL = () => {
      throw new Error('no object URLs here');
    };

    const result = await exportChain(['age-check'], {}, [dmn()], options({ format: 'package' }));

    expect(result).toEqual({
      success: false,
      filename: '',
      content: '',
      error: 'no object URLs here',
    });
  });

  async function readmeFor(
    dmnIds: string[],
    inputs: Record<string, unknown>,
    dmns: DmnModel[]
  ): Promise<string> {
    const result = await exportChain(
      dmnIds,
      inputs,
      dmns,
      options({ format: 'package', filename: 'My Chain' })
    );
    const zip = await JSZip.loadAsync(result.content as Blob);
    return zip.file('README.md')!.async('string');
  }

  test('documents deploy commands against the configured Operaton instance', async () => {
    vi.stubEnv('VITE_OPERATON_BASE_URL', 'https://operaton.example.org/engine-rest');

    const readme = await readmeFor(['age-check'], { age: 42 }, [dmn()]);

    expect(readme).toContain('https://operaton.example.org/engine-rest/deployment/create');
    expect(readme).toContain('https://operaton.example.org/operaton/app/cockpit/');
    expect(readme).toContain('curl -X POST');
    expect(readme).toContain('-F "data=@age-check.dmn"');
  });

  test('uses a placeholder URL when Operaton is not configured', async () => {
    vi.stubEnv('VITE_OPERATON_BASE_URL', '');
    const readme = await readmeFor(['age-check'], {}, [dmn()]);
    expect(readme).toContain('<YOUR_OPERATON_URL>/engine-rest');
  });

  test('renders the chain test data and per-DMN input/output counts', async () => {
    const readme = await readmeFor(['age-check'], { age: 42, region: 'NL' }, [dmn()]);

    expect(readme).toContain('- **age**: `42`');
    expect(readme).toContain('- **region**: `"NL"`');
    expect(readme).toContain('"age": {"value": 42, "type": "Integer"}');
    expect(readme).toContain('- Inputs: 1 variables');
    expect(readme).toContain('- Outputs: 1 variables');
    expect(readme).toContain('- eligible (Boolean)');
  });

  test('degrades gracefully when the DMN declares no inputs or outputs', async () => {
    const readme = await readmeFor(['bare'], { x: 1 }, [
      dmn({ identifier: 'bare', inputs: undefined, outputs: undefined }),
    ]);

    expect(readme).toContain('"example": {"value": "value", "type": "String"}');
    expect(readme).toContain('(See DMN definition for output variables)');
    expect(readme).toContain('- Inputs: 0 variables');
  });

  test('defaults the input type when a DMN input omits one', async () => {
    const readme = await readmeFor(['age-check'], { age: 42 }, [
      dmn({ inputs: [{ identifier: 'age', title: 'Age' }] as DmnModel['inputs'] }),
    ]);
    expect(readme).toContain('"age": {"value": 42, "type": "String"}');
  });

  test('defaults the output type when a DMN output omits one', async () => {
    const readme = await readmeFor(['age-check'], {}, [
      dmn({ outputs: [{ identifier: 'eligible', title: 'Eligible' }] as DmnModel['outputs'] }),
    ]);
    expect(readme).toContain('- eligible (unknown)');
  });

  test('lists a fallback DMN key when the chain has no models at all', async () => {
    const readme = await readmeFor(['ghost'], {}, []);

    expect(readme).toContain('/decision-definition/key/DMN_KEY/evaluate');
    expect(readme).toContain('**DMN Count:** 0');
    expect(readme).toContain('final DMN');
  });

  test('reports metadata complexity and estimated time', async () => {
    const readme = await readmeFor(['a', 'b', 'c'], {}, [dmn()]);

    expect(readme).toContain('**Complexity:** medium');
    expect(readme).toContain('**Estimated Execution Time:** ~500ms');
  });

  test('omits complexity and timing when metadata is excluded', async () => {
    const result = await exportChain(
      ['a'],
      {},
      [dmn()],
      options({ format: 'package', includeMetadata: false })
    );
    const zip = await JSZip.loadAsync(result.content as Blob);
    const readme = await zip.file('README.md')!.async('string');

    expect(readme).toContain('**Complexity:** N/A');
    expect(readme).not.toContain('Estimated Execution Time');
  });
});
