// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';

// dnd-kit only reports a transform mid-gesture; drive that state directly.
const draggableState = vi.hoisted(() => ({
  transform: null as { x: number; y: number; scaleX: number; scaleY: number } | null,
  isDragging: false,
}));

vi.mock('@dnd-kit/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dnd-kit/core')>();
  return {
    ...actual,
    useDraggable: () => ({
      attributes: {},
      listeners: {},
      setNodeRef: () => {},
      transform: draggableState.transform,
      isDragging: draggableState.isDragging,
    }),
  };
});

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

beforeEach(() => {
  draggableState.transform = null;
  draggableState.isDragging = false;
});

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

  test('follows the pointer and dims the card being dragged', () => {
    draggableState.transform = { x: 12, y: -4, scaleX: 1, scaleY: 1 };
    draggableState.isDragging = true;

    const { container } = render(
      <DmnList dmns={[dmn()]} usedDmnIds={[]} isLoading={false} endpoint="e" />
    );

    const card = container.querySelector('[style*="translate3d"]') as HTMLElement;
    expect(card.getAttribute('style')).toContain('translate3d(12px, -4px, 0)');
    expect(card.getAttribute('style')).toContain('opacity: 0.5');
  });

  test('keeps a transformed card at full opacity when it is not the one being dragged', () => {
    draggableState.transform = { x: 3, y: 3, scaleX: 1, scaleY: 1 };

    const { container } = render(
      <DmnList dmns={[dmn()]} usedDmnIds={[]} isLoading={false} endpoint="e" />
    );

    expect(
      (container.querySelector('[style*="translate3d"]') as HTMLElement).getAttribute('style')
    ).toContain('opacity: 1');
  });

  test('renders the organization logo and name when the DMN carries them', () => {
    render(
      <DmnList
        dmns={[dmn({ logoUrl: 'https://cdn.example.org/svb.png', organizationName: 'SVB' })]}
        usedDmnIds={[]}
        isLoading={false}
        endpoint="e"
      />
    );

    const logo = screen.getByAltText('SVB');
    expect(logo.getAttribute('src')).toBe('https://cdn.example.org/svb.png');
    expect(screen.getByText('SVB')).toBeTruthy();
  });

  test('labels a logo generically when the DMN names no organization', () => {
    render(
      <DmnList
        dmns={[dmn({ logoUrl: 'https://cdn.example.org/anon.png' })]}
        usedDmnIds={[]}
        isLoading={false}
        endpoint="e"
      />
    );

    const logo = screen.getByAltText('Organization logo');
    expect(logo.getAttribute('title')).toBe('Organization');
  });

  test('replaces a broken logo with the identifier initials', () => {
    render(
      <DmnList
        dmns={[dmn({ logoUrl: 'https://cdn.example.org/broken.png' })]}
        usedDmnIds={[]}
        isLoading={false}
        endpoint="e"
      />
    );

    const logo = screen.getByAltText('Organization logo');
    fireEvent.error(logo);

    expect(logo.style.display).toBe('none');
    expect(screen.getByText('ag')).toBeTruthy();
  });

  test('shows the initials placeholder when the DMN has no logo', () => {
    render(<DmnList dmns={[dmn()]} usedDmnIds={[]} isLoading={false} endpoint="e" />);
    expect(screen.getByText('ag')).toBeTruthy();
  });

  test('pluralises the input and output counts', () => {
    render(
      <DmnList
        dmns={[
          dmn({
            inputs: [
              { identifier: 'age', title: 'Age', type: 'Integer' },
              { identifier: 'income', title: 'Income', type: 'Double' },
            ],
            outputs: [
              { identifier: 'a', title: 'A', type: 'Boolean' },
              { identifier: 'b', title: 'B', type: 'Boolean' },
            ],
          }),
        ]}
        usedDmnIds={[]}
        isLoading={false}
        endpoint="e"
      />
    );
    expect(screen.getByText('2 inputs → 2 outputs')).toBeTruthy();
  });

  test('search matches an output variable name', async () => {
    render(
      <DmnList
        dmns={[
          dmn({ identifier: 'age-check' }),
          dmn({
            identifier: 'income-check',
            inputs: [{ identifier: 'salary', title: 'Salary', type: 'Integer' }],
            outputs: [{ identifier: 'meetsThreshold', title: 'Meets', type: 'Boolean' }],
          }),
        ]}
        usedDmnIds={[]}
        isLoading={false}
        endpoint="e"
      />
    );

    await userEvent.type(screen.getByPlaceholderText('Search DMNs...'), 'meetsthreshold');

    expect(screen.getByText('income-check')).toBeTruthy();
    expect(screen.queryByText('age-check')).toBeNull();
  });

  test('hides the vendor badge when the DMN reports no vendors', () => {
    render(
      <DmnList dmns={[dmn({ vendorCount: 0 })]} usedDmnIds={[]} isLoading={false} endpoint="e" />
    );
    expect(screen.queryByText('0')).toBeNull();
  });

  test('hides the validation badge for a DMN that was never validated', () => {
    render(
      <DmnList
        dmns={[dmn({ validationStatus: 'not-validated' })]}
        usedDmnIds={[]}
        isLoading={false}
        endpoint="e"
      />
    );
    expect(screen.queryByText('Gevalideerd')).toBeNull();
  });
});
