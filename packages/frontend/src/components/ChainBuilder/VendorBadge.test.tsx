// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';

import VendorBadge from './VendorBadge';

describe('VendorBadge', () => {
  test('renders nothing when count is 0', () => {
    const { container } = render(<VendorBadge count={0} />);
    expect(container).toBeEmptyDOMElement();
  });

  test('renders the singular label for count 1', () => {
    render(<VendorBadge count={1} />);
    expect(screen.getByText('1 Vendor Implementation')).toBeTruthy();
  });

  test('renders the plural label for count > 1', () => {
    render(<VendorBadge count={3} />);
    expect(screen.getByText('3 Vendor Implementations')).toBeTruthy();
  });

  test('the compact variant renders just the count with a title tooltip', () => {
    render(<VendorBadge count={2} compact />);
    expect(screen.getByTitle('2 vendor implementations available')).toBeTruthy();
  });

  test('clicking the badge calls onClick', async () => {
    const onClick = vi.fn();
    render(<VendorBadge count={2} onClick={onClick} />);

    await userEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalled();
  });
});
