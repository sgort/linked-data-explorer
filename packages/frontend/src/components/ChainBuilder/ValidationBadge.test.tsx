// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import ValidationBadge from './ValidationBadge';

describe('ValidationBadge', () => {
  test('renders nothing for "not-validated" or undefined status', () => {
    const { container: a } = render(<ValidationBadge status="not-validated" />);
    expect(a).toBeEmptyDOMElement();

    const { container: b } = render(<ValidationBadge status={undefined} />);
    expect(b).toBeEmptyDOMElement();
  });

  test('renders the "Officieel Gevalideerd" label for validated status', () => {
    render(<ValidationBadge status="validated" />);
    expect(screen.getByText('Officieel Gevalideerd')).toBeTruthy();
  });

  test('renders the "In Validatie" label for in-review status', () => {
    render(<ValidationBadge status="in-review" />);
    expect(screen.getByText('In Validatie')).toBeTruthy();
  });

  test('shows the validator name and formatted date when provided', () => {
    render(
      <ValidationBadge status="validated" validatedByName="J. Jansen" validatedAt="2026-03-05" />
    );
    expect(screen.getByText('door J. Jansen')).toBeTruthy();
    expect(screen.getByText(/5 mrt\.? 2026/)).toBeTruthy();
  });

  test('the compact variant shows the short label in its title tooltip', () => {
    render(<ValidationBadge status="validated" compact />);
    expect(screen.getByText('Gevalideerd')).toBeTruthy();
    expect(screen.getByTitle('Officieel Gevalideerd')).toBeTruthy();
  });
});
