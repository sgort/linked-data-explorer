// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';

const getTestCasesForChain = vi.fn();
const saveTestCase = vi.fn();
const deleteTestCase = vi.fn();
const updateTestCase = vi.fn();

vi.mock('../../services/testCaseStorage', () => ({
  getTestCasesForChain: (...args: unknown[]) => getTestCasesForChain(...args),
  saveTestCase: (...args: unknown[]) => saveTestCase(...args),
  deleteTestCase: (...args: unknown[]) => deleteTestCase(...args),
  updateTestCase: (...args: unknown[]) => updateTestCase(...args),
}));

import { DmnModel } from '../../types';
import { TestCase } from '../../types/testCase.types';
import TestCasePanel from './TestCasePanel';

function dmn(overrides: Partial<DmnModel> = {}): DmnModel {
  return {
    id: 'd1',
    identifier: 'age-check',
    title: 'Age check',
    inputs: [],
    outputs: [],
    ...overrides,
  };
}

function testCase(overrides: Partial<TestCase> = {}): TestCase {
  return {
    id: 'tc1',
    name: 'Happy path',
    inputs: { age: 30 },
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  getTestCasesForChain.mockReset();
  saveTestCase.mockReset();
  deleteTestCase.mockReset();
  updateTestCase.mockReset();
});

describe('TestCasePanel', () => {
  test('renders nothing when the chain is empty', () => {
    getTestCasesForChain.mockReturnValue([]);
    const { container } = render(
      <TestCasePanel chain={[]} endpoint="e" currentInputs={{}} onLoadTestCase={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  test('shows an empty-state message when there are no saved test cases', () => {
    getTestCasesForChain.mockReturnValue([]);
    render(
      <TestCasePanel chain={[dmn()]} endpoint="e" currentInputs={{}} onLoadTestCase={vi.fn()} />
    );
    expect(
      screen.getByText('No test cases yet. Save your current inputs to create one.')
    ).toBeTruthy();
  });

  test('lists saved test cases with their input count', () => {
    getTestCasesForChain.mockReturnValue([testCase()]);
    render(
      <TestCasePanel chain={[dmn()]} endpoint="e" currentInputs={{}} onLoadTestCase={vi.fn()} />
    );
    expect(screen.getByText('Happy path')).toBeTruthy();
    expect(screen.getByText('1 input')).toBeTruthy();
  });

  test('clicking a test case updates its lastRun and calls onLoadTestCase', async () => {
    getTestCasesForChain.mockReturnValue([testCase()]);
    const onLoadTestCase = vi.fn();
    render(
      <TestCasePanel
        chain={[dmn()]}
        endpoint="e"
        currentInputs={{}}
        onLoadTestCase={onLoadTestCase}
      />
    );

    await userEvent.click(screen.getByText('Happy path'));

    expect(updateTestCase).toHaveBeenCalledWith(
      'e',
      ['age-check'],
      'tc1',
      expect.objectContaining({ lastRun: expect.any(String) })
    );
    expect(onLoadTestCase).toHaveBeenCalledWith(testCase());
  });

  test('deleting asks for confirmation and removes the case from the list once confirmed', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    getTestCasesForChain.mockReturnValue([testCase()]);
    deleteTestCase.mockReturnValue(true);
    render(
      <TestCasePanel chain={[dmn()]} endpoint="e" currentInputs={{}} onLoadTestCase={vi.fn()} />
    );

    await userEvent.click(screen.getByRole('button', { name: '' }));

    expect(deleteTestCase).toHaveBeenCalledWith('e', ['age-check'], 'tc1');
    expect(screen.queryByText('Happy path')).toBeNull();
  });

  test('cancelling the delete confirmation leaves the test case in place', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    getTestCasesForChain.mockReturnValue([testCase()]);
    render(
      <TestCasePanel chain={[dmn()]} endpoint="e" currentInputs={{}} onLoadTestCase={vi.fn()} />
    );

    await userEvent.click(screen.getByRole('button', { name: '' }));

    expect(deleteTestCase).not.toHaveBeenCalled();
    expect(screen.getByText('Happy path')).toBeTruthy();
  });

  test('"Save Current" opens a modal; Cancel closes it without saving', async () => {
    getTestCasesForChain.mockReturnValue([]);
    render(
      <TestCasePanel chain={[dmn()]} endpoint="e" currentInputs={{}} onLoadTestCase={vi.fn()} />
    );

    await userEvent.click(screen.getByText('Save Current'));
    expect(screen.getByRole('heading', { name: 'Save Test Case' })).toBeTruthy();

    await userEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByRole('heading', { name: 'Save Test Case' })).toBeNull();
    expect(saveTestCase).not.toHaveBeenCalled();
  });

  test('saving without a name alerts and does not call saveTestCase', async () => {
    getTestCasesForChain.mockReturnValue([]);
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    render(
      <TestCasePanel chain={[dmn()]} endpoint="e" currentInputs={{}} onLoadTestCase={vi.fn()} />
    );

    await userEvent.click(screen.getByText('Save Current'));
    await userEvent.click(screen.getByRole('button', { name: 'Save Test Case' }));

    expect(alertSpy).toHaveBeenCalledWith('Please enter a test case name');
    expect(saveTestCase).not.toHaveBeenCalled();
  });

  test('saving with a name calls saveTestCase with the current inputs and adds it to the list', async () => {
    getTestCasesForChain.mockReturnValue([]);
    saveTestCase.mockReturnValue(testCase({ id: 'tc2', name: 'New case' }));
    render(
      <TestCasePanel
        chain={[dmn()]}
        endpoint="e"
        currentInputs={{ age: 40 }}
        onLoadTestCase={vi.fn()}
      />
    );

    await userEvent.click(screen.getByText('Save Current'));
    await userEvent.type(screen.getByPlaceholderText(/Happy Path/), 'New case');
    await userEvent.click(screen.getByRole('button', { name: 'Save Test Case' }));

    expect(saveTestCase).toHaveBeenCalledWith(
      'e',
      ['age-check'],
      expect.objectContaining({ name: 'New case', inputs: { age: 40 } })
    );
    expect(await screen.findByText('New case')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Save Test Case' })).toBeNull();
  });
});
