// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';

import { ChainExecutionResult } from '../../types';
import ChainResults from './ChainResults';

function result(overrides: Partial<ChainExecutionResult> = {}): ChainExecutionResult {
  return {
    success: true,
    chainId: 'chain-1',
    executionTime: 120,
    steps: [],
    finalOutputs: {},
    ...overrides,
  };
}

describe('ChainResults', () => {
  test('shows the success header and execution time', () => {
    render(<ChainResults result={result()} />);
    expect(screen.getByText('Execution Successful')).toBeTruthy();
    expect(screen.getByText('Completed in 120ms')).toBeTruthy();
  });

  test('shows the failure header and error message', () => {
    render(<ChainResults result={result({ success: false, error: 'DMN evaluation failed' })} />);
    expect(screen.getByText('Execution Failed')).toBeTruthy();
    expect(screen.getByText('DMN evaluation failed')).toBeTruthy();
  });

  test('renders final outputs, including boolean formatting', () => {
    render(
      <ChainResults
        result={result({ finalOutputs: { eligible: true, denied: false, amount: 42 } })}
      />
    );
    expect(screen.getByText('Final Outputs (3)')).toBeTruthy();
    expect(screen.getByText('✓ true')).toBeTruthy();
    expect(screen.getByText('✗ false')).toBeTruthy();
    expect(screen.getByText('42')).toBeTruthy();
  });

  test('truncates to 5 outputs with a "show more" toggle', async () => {
    const finalOutputs = Object.fromEntries(Array.from({ length: 7 }, (_, i) => [`out${i}`, i]));
    render(<ChainResults result={result({ finalOutputs })} />);

    expect(screen.queryByText('out5')).toBeNull();
    await userEvent.click(screen.getByText('Show 2 more outputs...'));
    expect(screen.getByText('out5')).toBeTruthy();
    expect(screen.getByText('out6')).toBeTruthy();
  });

  test('execution steps are collapsed by default and expand on click', async () => {
    render(
      <ChainResults
        result={result({
          steps: [
            {
              dmnId: 'age-check',
              dmnTitle: 'Age check',
              startTime: 1_700_000_000_000,
              inputs: { age: 42 },
              duration: 10,
              outputs: { eligible: true },
            },
          ],
        })}
      />
    );

    expect(screen.queryByText(/1\. age-check/)).toBeNull();
    await userEvent.click(screen.getByText('Execution Steps (1)'));
    expect(screen.getByText(/1\. age-check/)).toBeTruthy();
    expect(screen.getByText('Outputs: eligible')).toBeTruthy();
  });

  test('a failed step shows its error instead of outputs', async () => {
    render(
      <ChainResults
        result={result({
          steps: [
            {
              dmnId: 'age-check',
              dmnTitle: 'Age check',
              startTime: 1_700_000_000_000,
              inputs: { age: 42 },
              duration: 10,
              error: 'Missing variable',
            },
          ],
        })}
      />
    );
    await userEvent.click(screen.getByText('Execution Steps (1)'));
    expect(screen.getByText('Error: Missing variable')).toBeTruthy();
  });

  test('"Copy Results as JSON" writes to the clipboard and alerts', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

    render(<ChainResults result={result()} />);
    await userEvent.click(screen.getByText('Copy Results as JSON'));

    expect(writeText).toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith('Results copied to clipboard!');
  });
});
