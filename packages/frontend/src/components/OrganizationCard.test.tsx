// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const resolveLogo = vi.fn();
vi.mock('../utils/logoResolver', () => ({
  resolveLogo: (...args: unknown[]) => resolveLogo(...args),
}));

import OrganizationCard from './OrganizationCard';

function org(overrides: Record<string, unknown> = {}) {
  return {
    uri: 'https://example.org/org/svb',
    identifier: 'SVB',
    name: 'Sociale Verzekeringsbank',
    ...overrides,
  };
}

describe('OrganizationCard', () => {
  beforeEach(() => {
    resolveLogo.mockReset();
    resolveLogo.mockResolvedValue(null);
  });

  test('renders name and identifier, and falls back to the placeholder icon without a logo', () => {
    const { container } = render(<OrganizationCard organization={org()} endpoint="e" />);

    expect(screen.getByText('Sociale Verzekeringsbank')).toBeTruthy();
    expect(screen.getByText('SVB')).toBeTruthy();
    expect(container.querySelector('img')).toBeNull();
    expect(resolveLogo).not.toHaveBeenCalled();
  });

  test('resolves and renders a logo when the organization has one', async () => {
    resolveLogo.mockResolvedValue('https://cdn.example.org/svb.png');
    render(<OrganizationCard organization={org({ logo: './assets/svb.png' })} endpoint="ep" />);

    const img = await screen.findByAltText('Sociale Verzekeringsbank logo');
    expect(img.getAttribute('src')).toBe('https://cdn.example.org/svb.png');
    expect(resolveLogo).toHaveBeenCalledWith('./assets/svb.png', 'ep');
  });

  test('falls back to the placeholder icon when the resolved logo fails to load', async () => {
    resolveLogo.mockResolvedValue('https://cdn.example.org/broken.png');
    const { container } = render(
      <OrganizationCard organization={org({ logo: 'broken.png' })} endpoint="e" />
    );

    const img = await screen.findByAltText('Sociale Verzekeringsbank logo');
    fireEvent.error(img);

    await waitFor(() => expect(container.querySelector('img')).toBeNull());
  });

  test('keeps the placeholder when logo resolution yields nothing', async () => {
    resolveLogo.mockResolvedValue(null);
    const { container } = render(
      <OrganizationCard organization={org({ logo: 'missing.png' })} endpoint="e" />
    );

    await waitFor(() => expect(resolveLogo).toHaveBeenCalled());
    expect(container.querySelector('img')).toBeNull();
  });

  test('renders a homepage link and the trailing segment of the spatial URI', async () => {
    render(
      <OrganizationCard
        organization={org({
          homepage: 'https://www.svb.nl',
          spatial: 'http://publications.europa.eu/resource/authority/country/NLD',
        })}
        endpoint="e"
      />
    );

    const link = screen.getByRole('link', { name: /Website/ });
    expect(link.getAttribute('href')).toBe('https://www.svb.nl');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(screen.getByText(/NLD/)).toBeTruthy();
  });

  test('omits the homepage link and spatial line when both are absent', () => {
    render(<OrganizationCard organization={org()} endpoint="e" />);

    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByText(/📍/)).toBeNull();
  });

  test.each([
    ['small', 'p-3', 'w-12'],
    ['medium', 'p-4', 'w-16'],
    ['large', 'p-6', 'w-24'],
  ] as const)('applies the %s size classes', (size, containerClass, logoClass) => {
    const { container } = render(
      <OrganizationCard organization={org()} endpoint="e" size={size} />
    );

    expect(container.querySelector(`.${containerClass}`)).not.toBeNull();
    expect(container.querySelector(`.${logoClass}`)).not.toBeNull();
  });

  test('defaults to the medium size when none is given', () => {
    const { container } = render(<OrganizationCard organization={org()} endpoint="e" />);
    expect(container.querySelector('.p-4')).not.toBeNull();
  });

  test('re-resolves the logo when the endpoint changes', async () => {
    resolveLogo.mockResolvedValue('https://cdn.example.org/a.png');
    const { rerender } = render(
      <OrganizationCard organization={org({ logo: 'a.png' })} endpoint="first" />
    );
    await waitFor(() => expect(resolveLogo).toHaveBeenCalledTimes(1));

    rerender(<OrganizationCard organization={org({ logo: 'a.png' })} endpoint="second" />);
    await waitFor(() => expect(resolveLogo).toHaveBeenCalledTimes(2));
    expect(resolveLogo).toHaveBeenLastCalledWith('a.png', 'second');
  });
});

describe('OrganizationCard accessibility', () => {
  test('the homepage link opens safely in a new tab', async () => {
    resolveLogo.mockResolvedValue(null);
    render(<OrganizationCard organization={org({ homepage: 'https://svb.nl' })} endpoint="e" />);
    const link = screen.getByRole('link');
    expect(link.getAttribute('rel')).toBe('noreferrer');
    await userEvent.hover(link);
  });
});
