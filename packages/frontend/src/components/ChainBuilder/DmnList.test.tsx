// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';

vi.mock('./VendorModal', () => ({
  default: ({ dmnTitle, onClose }: { dmnTitle: string; onClose: () => void }) => (
    <div>
      <span>Vendor modal: {dmnTitle}</span>
      <button onClick={onClose}>close-vendor-modal</button>
    </div>
  ),
}));

import { DmnModel } from '../../types';
import DmnList from './DmnList';

function dmn(overrides: Partial<DmnModel> = {}): DmnModel {
  return {
    id: 'd1',
    identifier: 'age-check',
    title: 'Age check',
    inputs: [{ identifier: 'age', title: 'Age', type: 'Integer' }],
    outputs: [{ identifier: 'eligible', title: 'Eligible', type: 'Boolean' }],
    ...overrides,
  };
}

describe('DmnList', () => {
  test('shows a skeleton loading state', () => {
    render(<DmnList dmns={[]} usedDmnIds={[]} isLoading endpoint="e" />);
    expect(screen.getByText('Loading DMNs...')).toBeTruthy();
  });

  test('renders every DMN with its input/output counts', () => {
    render(
      <DmnList
        dmns={[dmn(), dmn({ identifier: 'income-check', title: 'Income check' })]}
        usedDmnIds={[]}
        isLoading={false}
        endpoint="e"
      />
    );
    expect(screen.getByText('age-check')).toBeTruthy();
    expect(screen.getByText('income-check')).toBeTruthy();
    expect(screen.getAllByText('1 input → 1 output')).toHaveLength(2);
    expect(screen.getByText('2 DMNs available • 0 in chain')).toBeTruthy();
  });

  test('marks a used DMN as "In Chain"', () => {
    render(<DmnList dmns={[dmn()]} usedDmnIds={['age-check']} isLoading={false} endpoint="e" />);
    expect(screen.getByText('In Chain')).toBeTruthy();
  });

  test('search filters by identifier, description, and input/output variable names', async () => {
    render(
      <DmnList
        dmns={[
          dmn({ identifier: 'age-check', description: 'Checks age eligibility' }),
          dmn({
            identifier: 'income-check',
            description: 'Checks income',
            inputs: [{ identifier: 'salary', title: 'Salary', type: 'Integer' }],
            outputs: [{ identifier: 'meetsThreshold', title: 'Meets threshold', type: 'Boolean' }],
          }),
        ]}
        usedDmnIds={[]}
        isLoading={false}
        endpoint="e"
      />
    );

    await userEvent.type(screen.getByPlaceholderText('Search DMNs...'), 'salary');

    expect(screen.getByText('income-check')).toBeTruthy();
    expect(screen.queryByText('age-check')).toBeNull();
    expect(screen.getByText('Showing 1 of 2 DMNs • 0 in chain')).toBeTruthy();
  });

  test('shows a "no DMNs found" message with a clear-search shortcut', async () => {
    render(<DmnList dmns={[dmn()]} usedDmnIds={[]} isLoading={false} endpoint="e" />);

    await userEvent.type(screen.getByPlaceholderText('Search DMNs...'), 'nonexistent');
    expect(screen.getByText('No DMNs found')).toBeTruthy();

    await userEvent.click(screen.getByText('Clear search'));
    expect(screen.getByText('age-check')).toBeTruthy();
  });

  test("the search input's own clear (X) button also resets the search", async () => {
    render(<DmnList dmns={[dmn()]} usedDmnIds={[]} isLoading={false} endpoint="e" />);

    await userEvent.type(screen.getByPlaceholderText('Search DMNs...'), 'age');
    await userEvent.click(screen.getByLabelText('Clear search'));

    expect(screen.getByPlaceholderText('Search DMNs...')).toHaveValue('');
  });

  test('clicking a vendor badge opens the vendor modal for that DMN, without navigating away', async () => {
    render(
      <DmnList dmns={[dmn({ vendorCount: 2 })]} usedDmnIds={[]} isLoading={false} endpoint="e" />
    );

    await userEvent.click(screen.getByText('2'));
    expect(screen.getByText('Vendor modal: Age check')).toBeTruthy();

    await userEvent.click(screen.getByText('close-vendor-modal'));
    expect(screen.queryByText('Vendor modal: Age check')).toBeNull();
  });

  test('shows the validation badge for a validated DMN', () => {
    render(
      <DmnList
        dmns={[dmn({ validationStatus: 'validated' })]}
        usedDmnIds={[]}
        isLoading={false}
        endpoint="e"
      />
    );
    expect(screen.getByText('Gevalideerd')).toBeTruthy();
  });
});
