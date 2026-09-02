// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';

vi.mock('../../services/defaultTestCases', () => ({
  initializeDefaultTestCases: vi.fn(),
}));

// dnd-kit gestures cannot be synthesised in jsdom; capture the handlers
// ChainBuilder hands to DndContext and drive them directly instead.
const dnd = vi.hoisted(() => ({
  onDragStart: null as ((e: unknown) => void) | null,
  onDragEnd: null as ((e: unknown) => void) | null,
}));

vi.mock('@dnd-kit/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dnd-kit/core')>();
  return {
    ...actual,
    DndContext: ({
      children,
      onDragStart,
      onDragEnd,
    }: {
      children: React.ReactNode;
      onDragStart: (e: unknown) => void;
      onDragEnd: (e: unknown) => void;
    }) => {
      dnd.onDragStart = onDragStart;
      dnd.onDragEnd = onDragEnd;
      return <div>{children}</div>;
    },
    DragOverlay: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="drag-overlay">{children}</div>
    ),
  };
});

vi.mock('./SemanticView', () => ({ default: () => <div>SemanticView stub</div> }));

vi.mock('./DmnList', () => ({
  default: ({ dmns, isLoading }: { dmns: unknown[]; isLoading: boolean }) => (
    <div>
      dmns:{dmns.length} loading:{String(isLoading)}
    </div>
  ),
}));

vi.mock('./ChainComposer', () => ({
  default: ({
    chain,
    onRemoveDmn,
    onClearChain,
  }: {
    chain: { identifier: string }[];
    onRemoveDmn: (id: string) => void;
    onClearChain: () => void;
  }) => (
    <div>
      <div>composer-chain:{chain.map((d) => d.identifier).join(',')}</div>
      {chain.map((d) => (
        <button key={d.identifier} onClick={() => onRemoveDmn(d.identifier)}>
          remove-{d.identifier}
        </button>
      ))}
      <button onClick={onClearChain}>clear-chain</button>
    </div>
  ),
}));

vi.mock('./ChainConfig', () => ({
  default: ({
    chain,
    validation,
    inputs,
    onInputChange,
    onExecute,
    onLoadPreset,
    executionResult,
  }: {
    chain: { identifier: string }[];
    validation: {
      isValid: boolean;
      isDrdCompatible: boolean;
      missingInputs: unknown[];
      requiredInputs: { identifier: string; type: string }[];
      semanticMatches: unknown[];
      warnings: { type: string; message: string }[];
    } | null;
    inputs: Record<string, unknown>;
    onInputChange: (id: string, value: unknown) => void;
    onExecute: () => void;
    onLoadPreset: (preset: unknown) => void;
    executionResult: unknown;
  }) => (
    <div>
      <div>chain:{chain.map((d) => d.identifier).join(',')}</div>
      <div>
        validation:
        {validation
          ? JSON.stringify({
              isValid: validation.isValid,
              missing: validation.missingInputs.length,
            })
          : 'none'}
      </div>
      <div>drd:{validation ? String(validation.isDrdCompatible) : 'none'}</div>
      <div>semantic:{validation ? validation.semanticMatches.length : 'none'}</div>
      <div>
        required:
        {validation
          ? validation.requiredInputs.map((r) => `${r.identifier}:${r.type}`).join(',')
          : 'none'}
      </div>
      <div>warnings:{validation ? validation.warnings.map((w) => w.type).join(',') : 'none'}</div>
      <div>inputs:{JSON.stringify(inputs)}</div>
      <div>result:{executionResult ? 'has-result' : 'no-result'}</div>
      <button
        onClick={() =>
          onLoadPreset({
            id: 't1',
            name: 'Sequential preset',
            description: 'd',
            dmnIds: ['age-check'],
            type: 'sequential',
            defaultInputs: { age: 30 },
          })
        }
      >
        load-sequential
      </button>
      <button
        onClick={() =>
          onLoadPreset({
            id: 't2',
            name: 'Sequential preset, no inputs',
            description: 'd',
            dmnIds: ['age-check'],
            type: 'sequential',
            defaultInputs: {},
          })
        }
      >
        load-sequential-missing-input
      </button>
      <button
        onClick={() =>
          onLoadPreset({
            id: 't3',
            name: 'DRD preset',
            description: 'd',
            dmnIds: [],
            type: 'drd',
            drdEntryPointId: 'drd-entry',
            drdOriginalChain: ['age-check'],
            drdDeploymentId: 'deploy1',
            defaultInputs: { age: 30 },
          })
        }
      >
        load-drd
      </button>
      <button
        onClick={() =>
          onLoadPreset({
            id: 't4',
            name: 'Two-DMN preset',
            description: 'd',
            dmnIds: ['age-check', 'benefit-calc'],
            type: 'sequential',
            defaultInputs: { age: 30 },
          })
        }
      >
        load-two-dmn
      </button>
      <button
        onClick={() =>
          onLoadPreset({
            id: 't5',
            name: 'DRD preset, typed inputs',
            description: 'd',
            dmnIds: [],
            type: 'drd',
            drdEntryPointId: 'drd-typed',
            drdOriginalChain: ['age-check'],
            defaultInputs: { flag: true, count: 3, label: 'x' },
          })
        }
      >
        load-drd-typed
      </button>
      <button
        onClick={() =>
          onLoadPreset({
            id: 't6',
            name: 'DRD preset, no inputs',
            description: 'd',
            dmnIds: [],
            type: 'drd',
            drdEntryPointId: 'drd-bare',
            drdOriginalChain: ['age-check'],
          })
        }
      >
        load-drd-bare
      </button>
      <button onClick={() => onInputChange('extra', 'x')}>change-input</button>
      <button onClick={onExecute}>execute</button>
    </div>
  ),
}));

import ChainBuilder from './ChainBuilder';

function fetchMock(overrides: { execute?: unknown } = {}) {
  return vi.fn().mockImplementation((url: string) => {
    if (url.includes('/api/dmns?')) {
      return Promise.resolve({
        json: async () => ({
          success: true,
          data: {
            dmns: [
              {
                id: 'd1',
                identifier: 'age-check',
                title: 'Age check',
                inputs: [{ identifier: 'age', title: 'Age', type: 'Integer' }],
                outputs: [{ identifier: 'eligible', title: 'Eligible', type: 'Boolean' }],
              },
            ],
          },
        }),
      });
    }
    if (url.includes('/api/dmns/enhanced-chain-links')) {
      return Promise.resolve({ json: async () => ({ success: true, data: [] }) });
    }
    if (url.includes('/api/chains/execute')) {
      return Promise.resolve({
        json: async () =>
          overrides.execute ?? {
            success: true,
            data: { success: true, chainId: 'c1', executionTime: 5, steps: [], finalOutputs: {} },
          },
      });
    }
    return Promise.reject(new Error(`unexpected fetch url: ${url}`));
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ChainBuilder — bootstrap', () => {
  test('loads available DMNs and semantic links on mount', async () => {
    global.fetch = fetchMock();
    render(<ChainBuilder endpoint="https://example.com/sparql" />);

    expect(await screen.findByText('dmns:1 loading:false')).toBeTruthy();
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/api/dmns?endpoint='));
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/dmns/enhanced-chain-links?endpoint=')
    );
  });

  test('a failed DMN fetch degrades to an empty list rather than crashing', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/dmns?')) return Promise.reject(new Error('network down'));
      return Promise.resolve({ json: async () => ({ success: true, data: [] }) });
    });
    render(<ChainBuilder endpoint="e" />);
    expect(await screen.findByText('dmns:0 loading:false')).toBeTruthy();
  });

  test('switches to the Semantic Analysis tab', async () => {
    global.fetch = fetchMock();
    render(<ChainBuilder endpoint="e" />);
    await screen.findByText('dmns:1 loading:false');

    await userEvent.click(screen.getByText('Semantic Analysis'));

    expect(screen.getByText('SemanticView stub')).toBeTruthy();
    expect(screen.queryByText(/^dmns:/)).toBeNull();
  });
});

describe('ChainBuilder — preset loading and chain mutation', () => {
  test('loading a sequential preset sets the chain and its default inputs', async () => {
    global.fetch = fetchMock();
    render(<ChainBuilder endpoint="e" />);
    await screen.findByText('dmns:1 loading:false');

    await userEvent.click(screen.getByText('load-sequential'));

    expect(await screen.findByText('composer-chain:age-check')).toBeTruthy();
    expect(screen.getByText('chain:age-check')).toBeTruthy();
    expect(screen.getByText('inputs:{"age":30}')).toBeTruthy();
  });

  test('loading a DRD preset creates a synthetic model and points the chain at its entry point', async () => {
    global.fetch = fetchMock();
    render(<ChainBuilder endpoint="e" />);
    await screen.findByText('dmns:1 loading:false');

    await userEvent.click(screen.getByText('load-drd'));

    expect(await screen.findByText('composer-chain:drd-entry')).toBeTruthy();
    expect(screen.getByText('inputs:{"age":30}')).toBeTruthy();
  });

  test('a fully-satisfied chain validates successfully', async () => {
    global.fetch = fetchMock();
    render(<ChainBuilder endpoint="e" />);
    await screen.findByText('dmns:1 loading:false');

    await userEvent.click(screen.getByText('load-sequential'));

    expect(await screen.findByText('validation:{"isValid":true,"missing":0}')).toBeTruthy();
  });

  test('a chain missing a required input fails validation', async () => {
    global.fetch = fetchMock();
    render(<ChainBuilder endpoint="e" />);
    await screen.findByText('dmns:1 loading:false');

    await userEvent.click(screen.getByText('load-sequential-missing-input'));

    expect(await screen.findByText('validation:{"isValid":false,"missing":1}')).toBeTruthy();
  });

  test('changing an input updates the inputs object', async () => {
    global.fetch = fetchMock();
    render(<ChainBuilder endpoint="e" />);
    await screen.findByText('dmns:1 loading:false');

    await userEvent.click(screen.getByText('change-input'));
    expect(await screen.findByText('inputs:{"extra":"x"}')).toBeTruthy();
  });

  test('removing a DMN clears the chain, inputs, and results', async () => {
    global.fetch = fetchMock();
    render(<ChainBuilder endpoint="e" />);
    await screen.findByText('dmns:1 loading:false');
    await userEvent.click(screen.getByText('load-sequential'));
    await screen.findByText('composer-chain:age-check');

    await userEvent.click(screen.getByText('remove-age-check'));

    expect(await screen.findByText('composer-chain:')).toBeTruthy();
    expect(screen.getByText('inputs:{}')).toBeTruthy();
  });

  test('Clear Chain empties the chain and inputs', async () => {
    global.fetch = fetchMock();
    render(<ChainBuilder endpoint="e" />);
    await screen.findByText('dmns:1 loading:false');
    await userEvent.click(screen.getByText('load-sequential'));
    await screen.findByText('composer-chain:age-check');

    await userEvent.click(screen.getByText('clear-chain'));

    expect(await screen.findByText('composer-chain:')).toBeTruthy();
    expect(screen.getByText('inputs:{}')).toBeTruthy();
  });
});

describe('ChainBuilder — execution', () => {
  test('executing without a valid chain alerts and never calls the execute endpoint', async () => {
    global.fetch = fetchMock();
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    render(<ChainBuilder endpoint="e" />);
    await screen.findByText('dmns:1 loading:false');

    await userEvent.click(screen.getByText('execute'));

    expect(alertSpy).toHaveBeenCalledWith('Please fix validation errors before executing');
    expect(global.fetch).not.toHaveBeenCalledWith(expect.stringContaining('/api/chains/execute'));
  });

  test('executing a valid chain posts to the execute endpoint and stores the result', async () => {
    global.fetch = fetchMock();
    render(<ChainBuilder endpoint="e" />);
    await screen.findByText('dmns:1 loading:false');
    await userEvent.click(screen.getByText('load-sequential'));
    await screen.findByText('validation:{"isValid":true,"missing":0}');

    await userEvent.click(screen.getByText('execute'));

    expect(await screen.findByText('result:has-result')).toBeTruthy();
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/chains/execute'),
      expect.objectContaining({ method: 'POST' })
    );
  });

  test('a failed execution alerts with the server error message', async () => {
    global.fetch = fetchMock({
      execute: { success: false, error: { message: 'DMN engine unavailable' } },
    });
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    render(<ChainBuilder endpoint="e" />);
    await screen.findByText('dmns:1 loading:false');
    await userEvent.click(screen.getByText('load-sequential'));
    await screen.findByText('validation:{"isValid":true,"missing":0}');

    await userEvent.click(screen.getByText('execute'));

    await vi.waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith('Execution failed: DMN engine unavailable')
    );
  });
});

describe('ChainBuilder — degraded backend responses', () => {
  test('a semantic-links payload reporting success: false leaves the links empty', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/dmns/enhanced-chain-links')) {
        return Promise.resolve({
          json: async () => ({ success: false, error: 'links unavailable' }),
        });
      }
      return fetchMock()(url);
    });

    render(<ChainBuilder endpoint="e" />);
    await screen.findByText('dmns:1 loading:false');

    expect(consoleError).toHaveBeenCalledWith(
      '[SemanticLinks] Failed to load:',
      'links unavailable'
    );
  });

  test('a semantic-links fetch that rejects leaves the links empty', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/dmns/enhanced-chain-links')) {
        return Promise.reject(new Error('links down'));
      }
      return fetchMock()(url);
    });

    render(<ChainBuilder endpoint="e" />);
    await screen.findByText('dmns:1 loading:false');

    expect(consoleError).toHaveBeenCalledWith('[SemanticLinks] Error:', expect.any(Error));
  });

  test('a DMN payload reporting success: false degrades to an empty list', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/dmns?')) {
        return Promise.resolve({ json: async () => ({ success: false, error: 'no dmns' }) });
      }
      return Promise.resolve({ json: async () => ({ success: true, data: [] }) });
    });

    render(<ChainBuilder endpoint="e" />);

    expect(await screen.findByText('dmns:0 loading:false')).toBeTruthy();
  });
});

describe('ChainBuilder — chain validation', () => {
  /** Two DMNs where the second consumes what the first produces. */
  function twoDmnFetch(
    secondInputs: { identifier: string; title: string; type: string }[],
    links: unknown[] = []
  ) {
    return vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/dmns?')) {
        return Promise.resolve({
          json: async () => ({
            success: true,
            data: {
              dmns: [
                {
                  id: 'd1',
                  identifier: 'age-check',
                  title: 'Age check',
                  inputs: [{ identifier: 'age', title: 'Age', type: 'Integer' }],
                  outputs: [{ identifier: 'eligible', title: 'Eligible', type: 'Boolean' }],
                },
                {
                  id: 'd2',
                  identifier: 'benefit-calc',
                  title: 'Benefit calculation',
                  inputs: secondInputs,
                  outputs: [{ identifier: 'amount', title: 'Amount', type: 'Double' }],
                },
              ],
            },
          }),
        });
      }
      if (url.includes('/api/dmns/enhanced-chain-links')) {
        return Promise.resolve({ json: async () => ({ success: true, data: links }) });
      }
      return Promise.reject(new Error(`unexpected fetch url: ${url}`));
    });
  }

  test('an exact output-to-input match does not ask the user for the value', async () => {
    global.fetch = twoDmnFetch([{ identifier: 'eligible', title: 'Eligible', type: 'Boolean' }]);
    render(<ChainBuilder endpoint="e" />);
    await screen.findByText('dmns:2 loading:false');

    await userEvent.click(screen.getByText('load-two-dmn'));

    expect(screen.getByText('required:age:Integer')).toBeTruthy();
    expect(screen.getByText('drd:true')).toBeTruthy();
  });

  test('a semantic match satisfies the input but marks the chain DRD-incompatible', async () => {
    global.fetch = twoDmnFetch(
      [{ identifier: 'isEligible', title: 'Is eligible', type: 'Boolean' }],
      [
        {
          dmn1: { identifier: 'age-check' },
          dmn2: { identifier: 'benefit-calc' },
          inputVariable: 'isEligible',
          outputVariable: 'eligible',
          matchType: 'semantic',
          sharedConcept: 'https://example.org/concept/Eligibility',
        },
      ]
    );
    render(<ChainBuilder endpoint="e" />);
    await screen.findByText('dmns:2 loading:false');

    await userEvent.click(screen.getByText('load-two-dmn'));

    expect(screen.getByText('semantic:1')).toBeTruthy();
    expect(screen.getByText('drd:false')).toBeTruthy();
    expect(screen.getByText('required:age:Integer')).toBeTruthy();
  });

  test('an unmatched input on the second DMN is asked of the user', async () => {
    global.fetch = twoDmnFetch([{ identifier: 'region', title: 'Region', type: 'String' }]);
    render(<ChainBuilder endpoint="e" />);
    await screen.findByText('dmns:2 loading:false');

    await userEvent.click(screen.getByText('load-two-dmn'));

    expect(screen.getByText('required:age:Integer,region:String')).toBeTruthy();
    expect(screen.getByText('validation:{"isValid":false,"missing":1}')).toBeTruthy();
  });

  test('Boolean and Date inputs are required but not counted as missing', async () => {
    global.fetch = twoDmnFetch([
      { identifier: 'consent', title: 'Consent', type: 'Boolean' },
      { identifier: 'since', title: 'Since', type: 'Date' },
    ]);
    render(<ChainBuilder endpoint="e" />);
    await screen.findByText('dmns:2 loading:false');

    await userEvent.click(screen.getByText('load-two-dmn'));

    expect(screen.getByText('required:age:Integer,consent:Boolean,since:Date')).toBeTruthy();
    expect(screen.getByText('validation:{"isValid":true,"missing":0}')).toBeTruthy();
  });

  test('two DMNs producing the same output raise a duplicate warning', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/dmns?')) {
        return Promise.resolve({
          json: async () => ({
            success: true,
            data: {
              dmns: [
                {
                  id: 'd1',
                  identifier: 'age-check',
                  title: 'Age check',
                  inputs: [{ identifier: 'age', title: 'Age', type: 'Integer' }],
                  outputs: [{ identifier: 'eligible', title: 'Eligible', type: 'Boolean' }],
                },
                {
                  id: 'd2',
                  identifier: 'benefit-calc',
                  title: 'Benefit calculation',
                  inputs: [{ identifier: 'eligible', title: 'Eligible', type: 'Boolean' }],
                  outputs: [{ identifier: 'eligible', title: 'Eligible', type: 'Boolean' }],
                },
              ],
            },
          }),
        });
      }
      return Promise.resolve({ json: async () => ({ success: true, data: [] }) });
    });
    render(<ChainBuilder endpoint="e" />);
    await screen.findByText('dmns:2 loading:false');

    await userEvent.click(screen.getByText('load-two-dmn'));

    expect(screen.getByText('warnings:duplicate_dmn,duplicate_dmn')).toBeTruthy();
  });

  test('a single-DMN chain warns that orchestration adds little', async () => {
    global.fetch = fetchMock();
    render(<ChainBuilder endpoint="e" />);
    await screen.findByText('dmns:1 loading:false');

    await userEvent.click(screen.getByText('load-sequential'));

    expect(screen.getByText('warnings:performance')).toBeTruthy();
  });
});

describe('ChainBuilder — DRD presets', () => {
  test('a DRD preset derives synthetic input types from its default values', async () => {
    global.fetch = fetchMock();
    render(<ChainBuilder endpoint="e" />);
    await screen.findByText('dmns:1 loading:false');

    await userEvent.click(screen.getByText('load-drd-typed'));

    expect(screen.getByText('required:flag:Boolean,count:Integer,label:String')).toBeTruthy();
  });

  test('a DRD preset without default inputs loads with an empty input set', async () => {
    global.fetch = fetchMock();
    render(<ChainBuilder endpoint="e" />);
    await screen.findByText('dmns:1 loading:false');

    await userEvent.click(screen.getByText('load-drd-bare'));

    expect(screen.getByText('chain:drd-bare')).toBeTruthy();
    expect(screen.getByText('inputs:{}')).toBeTruthy();
    expect(screen.getByText('required:')).toBeTruthy();
  });
});

describe('ChainBuilder — drag and drop', () => {
  async function renderLoaded() {
    global.fetch = fetchMock();
    render(<ChainBuilder endpoint="e" />);
    await screen.findByText('dmns:1 loading:false');
  }

  test('a drop outside any droppable leaves the chain untouched', async () => {
    await renderLoaded();

    act(() => dnd.onDragEnd!({ active: { id: 'age-check' }, over: null }));

    expect(screen.getByText('composer-chain:')).toBeTruthy();
  });

  test('dropping a DMN on the chain droppable appends it', async () => {
    await renderLoaded();

    act(() => dnd.onDragEnd!({ active: { id: 'age-check' }, over: { id: 'chain-droppable' } }));

    expect(screen.getByText('composer-chain:age-check')).toBeTruthy();
  });

  test('dropping a DMN already in the chain does not duplicate it', async () => {
    await renderLoaded();

    act(() => dnd.onDragEnd!({ active: { id: 'age-check' }, over: { id: 'chain-droppable' } }));
    act(() => dnd.onDragEnd!({ active: { id: 'age-check' }, over: { id: 'chain-droppable' } }));

    expect(screen.getByText('composer-chain:age-check')).toBeTruthy();
  });

  test('dropping one chained DMN onto another reorders the chain', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/dmns?')) {
        return Promise.resolve({
          json: async () => ({
            success: true,
            data: {
              dmns: [
                {
                  id: 'd1',
                  identifier: 'age-check',
                  title: 'Age check',
                  inputs: [],
                  outputs: [],
                },
                {
                  id: 'd2',
                  identifier: 'benefit-calc',
                  title: 'Benefit calculation',
                  inputs: [],
                  outputs: [],
                },
              ],
            },
          }),
        });
      }
      return Promise.resolve({ json: async () => ({ success: true, data: [] }) });
    });
    render(<ChainBuilder endpoint="e" />);
    await screen.findByText('dmns:2 loading:false');

    act(() => dnd.onDragEnd!({ active: { id: 'age-check' }, over: { id: 'chain-droppable' } }));
    act(() => dnd.onDragEnd!({ active: { id: 'benefit-calc' }, over: { id: 'chain-droppable' } }));
    expect(screen.getByText('composer-chain:age-check,benefit-calc')).toBeTruthy();

    act(() => dnd.onDragEnd!({ active: { id: 'benefit-calc' }, over: { id: 'age-check' } }));

    expect(screen.getByText('composer-chain:benefit-calc,age-check')).toBeTruthy();
  });

  test('dropping a chained DMN back onto itself leaves the order unchanged', async () => {
    await renderLoaded();
    act(() => dnd.onDragEnd!({ active: { id: 'age-check' }, over: { id: 'chain-droppable' } }));

    act(() => dnd.onDragEnd!({ active: { id: 'age-check' }, over: { id: 'age-check' } }));

    expect(screen.getByText('composer-chain:age-check')).toBeTruthy();
  });

  test('the drag overlay previews the DMN being dragged, and clears on drop', async () => {
    await renderLoaded();

    act(() => dnd.onDragStart!({ active: { id: 'age-check' } }));
    const overlay = screen.getByTestId('drag-overlay');
    expect(overlay.textContent).toContain('age-check');
    expect(overlay.textContent).toContain('1 inputs → 1 outputs');

    act(() => dnd.onDragEnd!({ active: { id: 'age-check' }, over: null }));
    expect(screen.getByTestId('drag-overlay').textContent).toBe('');
  });

  test('the drag overlay stays empty for an id that matches no DMN', async () => {
    await renderLoaded();

    act(() => dnd.onDragStart!({ active: { id: 'ghost' } }));

    expect(screen.getByTestId('drag-overlay').textContent).toBe('');
  });
});
