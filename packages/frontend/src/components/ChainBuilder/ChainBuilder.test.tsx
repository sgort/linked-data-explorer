// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';

vi.mock('../../services/defaultTestCases', () => ({
  initializeDefaultTestCases: vi.fn(),
}));

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
    validation: { isValid: boolean; missingInputs: unknown[] } | null;
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
