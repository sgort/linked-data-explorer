// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const executeSparqlQuery = vi.fn();
vi.mock('../services/sparqlService', () => ({
  executeSparqlQuery: (...args: unknown[]) => executeSparqlQuery(...args),
}));

vi.mock('./OrganizationCard', () => ({
  default: ({
    organization,
    endpoint,
    size,
  }: {
    organization: { name: string; identifier: string };
    endpoint: string;
    size: string;
  }) => (
    <div data-testid="org-card">
      {organization.name} | {organization.identifier} | {endpoint} | {size}
    </div>
  ),
}));

import OrganizationsView from './OrganizationsView';

function binding(overrides: Record<string, { value: string }> = {}) {
  return {
    organization: { value: 'https://example.org/org/svb' },
    identifier: { value: 'SVB' },
    name: { value: 'Sociale Verzekeringsbank' },
    ...overrides,
  };
}

function response(bindings: unknown[]) {
  return { head: { vars: [] }, results: { bindings } };
}

describe('OrganizationsView', () => {
  beforeEach(() => {
    executeSparqlQuery.mockReset();
  });

  test('shows a loading state until the query resolves', async () => {
    let release: (value: unknown) => void = () => {};
    executeSparqlQuery.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      })
    );

    render(<OrganizationsView endpoint="e" />);
    expect(screen.getByText('Loading organizations...')).toBeTruthy();

    release(response([]));
    await waitFor(() => expect(screen.queryByText('Loading organizations...')).toBeNull());
  });

  test('renders one card per organization and a pluralised count', async () => {
    executeSparqlQuery.mockResolvedValue(
      response([
        binding(),
        binding({
          organization: { value: 'https://example.org/org/uwv' },
          identifier: { value: 'UWV' },
          name: { value: 'UWV' },
        }),
      ])
    );

    render(<OrganizationsView endpoint="my-endpoint" />);

    await waitFor(() => expect(screen.getAllByTestId('org-card')).toHaveLength(2));
    expect(screen.getByText('2 organizations found')).toBeTruthy();
    expect(screen.getByText('Sociale Verzekeringsbank | SVB | my-endpoint | medium')).toBeTruthy();
  });

  test('uses the singular noun for exactly one organization', async () => {
    executeSparqlQuery.mockResolvedValue(response([binding()]));
    render(<OrganizationsView endpoint="e" />);
    expect(await screen.findByText('1 organization found')).toBeTruthy();
  });

  test('maps optional bindings and defaults missing required ones to empty strings', async () => {
    executeSparqlQuery.mockResolvedValue(
      response([
        {
          homepage: { value: 'https://svb.nl' },
          logo: { value: 'logo.png' },
          spatial: { value: 'NLD' },
        },
      ])
    );

    render(<OrganizationsView endpoint="e" />);
    const card = await screen.findByTestId('org-card');
    expect(card.textContent).toBe(' |  | e | medium');
  });

  test('shows the empty state when the dataset has no organizations', async () => {
    executeSparqlQuery.mockResolvedValue(response([]));
    render(<OrganizationsView endpoint="e" />);
    expect(await screen.findByText('No organizations found in this dataset')).toBeTruthy();
  });

  test('surfaces an Error message and retries on demand', async () => {
    executeSparqlQuery.mockRejectedValueOnce(new Error('endpoint unreachable'));
    render(<OrganizationsView endpoint="e" />);

    expect(await screen.findByText('endpoint unreachable')).toBeTruthy();

    executeSparqlQuery.mockResolvedValueOnce(response([binding()]));
    await userEvent.click(screen.getByRole('button', { name: /Try Again/ }));

    expect(await screen.findByTestId('org-card')).toBeTruthy();
    expect(screen.queryByText('endpoint unreachable')).toBeNull();
  });

  test('falls back to a generic message when the rejection is not an Error', async () => {
    executeSparqlQuery.mockRejectedValue('boom');
    render(<OrganizationsView endpoint="e" />);
    expect(await screen.findByText('Failed to load organizations')).toBeTruthy();
  });

  test('the Refresh button re-runs the query', async () => {
    executeSparqlQuery.mockResolvedValue(response([binding()]));
    render(<OrganizationsView endpoint="e" />);
    await screen.findByTestId('org-card');
    expect(executeSparqlQuery).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole('button', { name: /Refresh/ }));
    await waitFor(() => expect(executeSparqlQuery).toHaveBeenCalledTimes(2));
  });

  test('reloads when the endpoint prop changes', async () => {
    executeSparqlQuery.mockResolvedValue(response([binding()]));
    const { rerender } = render(<OrganizationsView endpoint="first" />);
    await screen.findByTestId('org-card');

    rerender(<OrganizationsView endpoint="second" />);
    await waitFor(() => expect(executeSparqlQuery).toHaveBeenCalledTimes(2));
    expect(executeSparqlQuery).toHaveBeenLastCalledWith(expect.any(String), 'second');
  });

  test('queries for public organisations ordered by name', async () => {
    executeSparqlQuery.mockResolvedValue(response([]));
    render(<OrganizationsView endpoint="e" />);
    await waitFor(() => expect(executeSparqlQuery).toHaveBeenCalled());

    const query = executeSparqlQuery.mock.calls[0][0] as string;
    expect(query).toContain('cv:PublicOrganisation');
    expect(query).toContain('ORDER BY ?name');
  });
});
