// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';

import OrganizationSelector from './OrganizationSelector';

describe('OrganizationSelector', () => {
  test('renders the current value and the "Ungrouped" hint when unset', () => {
    render(<OrganizationSelector currentOrganization={undefined} onOrganizationChange={vi.fn()} />);

    expect(screen.getByRole('combobox')).toHaveValue('');
    expect(screen.getByText(/Ungrouped/i)).toBeTruthy();
  });

  test('does not show the hint once an organization is set', () => {
    render(<OrganizationSelector currentOrganization="flevoland" onOrganizationChange={vi.fn()} />);

    expect(screen.getByRole('combobox')).toHaveValue('flevoland');
    expect(screen.queryByText(/Ungrouped/i)).toBeNull();
  });

  test('renders suggestions as datalist options', () => {
    render(
      <OrganizationSelector
        currentOrganization={undefined}
        onOrganizationChange={vi.fn()}
        suggestions={['flevoland', 'utrecht']}
      />
    );

    const options = screen.getByRole('combobox').closest('div')!.querySelectorAll('option');
    expect(Array.from(options).map((o) => o.getAttribute('value'))).toEqual([
      'flevoland',
      'utrecht',
    ]);
  });

  test('calls onOrganizationChange as the user types, and with undefined when cleared', async () => {
    const onOrganizationChange = vi.fn();
    render(
      <OrganizationSelector
        currentOrganization={undefined}
        onOrganizationChange={onOrganizationChange}
      />
    );

    await userEvent.type(screen.getByRole('combobox'), 'x');
    expect(onOrganizationChange).toHaveBeenLastCalledWith('x');
  });

  test('disables the input when disabled is true', () => {
    render(
      <OrganizationSelector
        currentOrganization={undefined}
        onOrganizationChange={vi.fn()}
        disabled
      />
    );
    expect(screen.getByRole('combobox')).toBeDisabled();
  });
});
