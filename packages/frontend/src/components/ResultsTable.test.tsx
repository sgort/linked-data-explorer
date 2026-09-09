// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const resolveLogo = vi.fn();
vi.mock('../utils/logoResolver', () => ({
  resolveLogo: (...args: unknown[]) => resolveLogo(...args),
}));

import { SparqlResponse } from '../types';
import ResultsTable from './ResultsTable';

type Cell = { value: string; type?: string; 'xml:lang'?: string };

function response(vars: string[], bindings: Record<string, Cell>[]): SparqlResponse {
  return { head: { vars }, results: { bindings } } as SparqlResponse;
}

const COMPLETE_LOGO_URL =
  'https://api.triplydb.triply.cc/datasets/acme/dataset/assets/asset-1/version-9';

describe('ResultsTable empty and idle states', () => {
  beforeEach(() => {
    resolveLogo.mockReset();
    resolveLogo.mockResolvedValue(null);
  });

  test('prompts for a query when there is no data at all', () => {
    render(<ResultsTable data={null} />);
    expect(screen.getByText('No results yet. Run a query.')).toBeTruthy();
  });

  test('reports an empty result set', () => {
    render(<ResultsTable data={response(['s'], [])} />);
    expect(screen.getByText('Query returned 0 results.')).toBeTruthy();
  });
});

describe('ResultsTable regular cells', () => {
  beforeEach(() => {
    resolveLogo.mockReset();
    resolveLogo.mockResolvedValue(null);
  });

  test('renders a header per variable and a 1-based row index', () => {
    render(
      <ResultsTable
        data={response(
          ['name', 'age'],
          [
            { name: { value: 'Ada' }, age: { value: '36' } },
            { name: { value: 'Grace' }, age: { value: '45' } },
          ]
        )}
      />
    );

    expect(screen.getByText('?name')).toBeTruthy();
    expect(screen.getByText('?age')).toBeTruthy();
    expect(screen.getByText('1')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('Grace')).toBeTruthy();
  });

  test('renders a dash for a variable unbound in a row', () => {
    render(<ResultsTable data={response(['name', 'nick'], [{ name: { value: 'Ada' } }])} />);
    expect(screen.getByText('-')).toBeTruthy();
  });

  test('renders a URI cell as a link showing its last path segment', () => {
    render(
      <ResultsTable
        data={response(['s'], [{ s: { value: 'https://example.org/things/widget', type: 'uri' } }])}
      />
    );

    const link = screen.getByRole('link', { name: 'widget' });
    expect(link.getAttribute('href')).toBe('https://example.org/things/widget');
    expect(link.getAttribute('target')).toBe('_blank');
  });

  test('prefers the fragment over the path segment for a hash URI', () => {
    render(
      <ResultsTable
        data={response(['s'], [{ s: { value: 'https://example.org/onto#Person', type: 'uri' } }])}
      />
    );
    expect(screen.getByRole('link', { name: 'Person' })).toBeTruthy();
  });

  test('shows a non-http URI verbatim', () => {
    render(
      <ResultsTable data={response(['s'], [{ s: { value: 'urn:nl:svb:123', type: 'uri' } }])} />
    );
    expect(screen.getByRole('link', { name: 'urn:nl:svb:123' })).toBeTruthy();
  });

  test('appends the language tag to a tagged literal', () => {
    render(
      <ResultsTable
        data={response(
          ['label'],
          [{ label: { value: 'Kapvergunning', type: 'literal', 'xml:lang': 'nl' } }]
        )}
      />
    );
    expect(screen.getByText('Kapvergunning')).toBeTruthy();
    expect(screen.getByText('@nl')).toBeTruthy();
  });

  test('omits the language tag for an untagged literal', () => {
    render(
      <ResultsTable data={response(['label'], [{ label: { value: 'plain', type: 'literal' } }])} />
    );
    expect(screen.queryByText(/^@/)).toBeNull();
  });
});

describe('ResultsTable logo columns', () => {
  beforeEach(() => {
    resolveLogo.mockReset();
    resolveLogo.mockResolvedValue(null);
  });

  test('does not resolve logos when no endpoint is supplied', async () => {
    render(<ResultsTable data={response(['logo'], [{ logo: { value: 'a.png' } }])} />);
    await waitFor(() => expect(screen.getByTitle('a.png')).toBeTruthy());
    expect(resolveLogo).not.toHaveBeenCalled();
  });

  test('does not resolve when no column looks like a logo', async () => {
    render(<ResultsTable data={response(['name'], [{ name: { value: 'x' } }])} endpoint="e" />);
    await waitFor(() => expect(screen.getByText('x')).toBeTruthy());
    expect(resolveLogo).not.toHaveBeenCalled();
  });

  test.each(['logo', 'orgLogo', 'image'])('marks %s as a logo column in the header', (varName) => {
    render(<ResultsTable data={response([varName], [{ [varName]: { value: 'a.png' } }])} />);
    const header = screen.getByRole('columnheader', { name: new RegExp(varName) });
    expect(header.textContent).not.toContain('?');
  });

  test('resolves each distinct logo path once and renders the image', async () => {
    resolveLogo.mockResolvedValue('https://cdn.example.org/a.png');
    render(
      <ResultsTable
        data={response(
          ['logo'],
          [{ logo: { value: 'assets/a.png' } }, { logo: { value: 'assets/a.png' } }]
        )}
        endpoint="ep"
      />
    );

    await waitFor(() => expect(screen.getAllByAltText('Organization logo')).toHaveLength(2));
    expect(resolveLogo).toHaveBeenCalledTimes(1);
    expect(resolveLogo).toHaveBeenCalledWith('assets/a.png', 'ep');
    expect(screen.getAllByRole('link', { name: 'a.png' })).toHaveLength(2);
  });

  test('skips bindings with no value when collecting logo paths', async () => {
    resolveLogo.mockResolvedValue('https://cdn.example.org/a.png');
    render(
      <ResultsTable
        data={response(['logo'], [{ logo: { value: '' } }, { logo: { value: 'a.png' } }])}
        endpoint="ep"
      />
    );

    await waitFor(() => expect(resolveLogo).toHaveBeenCalledTimes(1));
    expect(resolveLogo).toHaveBeenCalledWith('a.png', 'ep');
  });

  test('renders an already-complete TriplyDB asset URL without resolution', async () => {
    resolveLogo.mockResolvedValue(null);
    render(
      <ResultsTable
        data={response(['logo'], [{ logo: { value: COMPLETE_LOGO_URL } }])}
        endpoint="e"
      />
    );

    const img = await screen.findByAltText('Organization logo');
    expect(img.getAttribute('src')).toBe(COMPLETE_LOGO_URL);
  });

  test('shows a pending marker while an incomplete path is unresolved', async () => {
    resolveLogo.mockResolvedValue(null);
    render(
      <ResultsTable data={response(['logo'], [{ logo: { value: 'assets/a.png' } }])} endpoint="e" />
    );
    await waitFor(() => expect(resolveLogo).toHaveBeenCalled());
    const pending = screen.getByTitle('assets/a.png');
    expect(pending.textContent).toContain('a.png');
    expect(screen.queryByAltText('Organization logo')).toBeNull();
  });

  test('switches to an error state when the image fails to load', async () => {
    resolveLogo.mockResolvedValue('https://cdn.example.org/broken.png');
    render(
      <ResultsTable data={response(['logo'], [{ logo: { value: 'broken.png' } }])} endpoint="e" />
    );

    fireEvent.error(await screen.findByAltText('Organization logo'));

    await waitFor(() => expect(screen.queryByAltText('Organization logo')).toBeNull());
    const link = screen.getByRole('link', { name: 'broken.png' });
    expect(link.getAttribute('title')).toContain('Failed to load');
  });

  test('clicking a logo opens a modal that closes on backdrop click', async () => {
    resolveLogo.mockResolvedValue('https://cdn.example.org/a.png');
    const { container } = render(
      <ResultsTable data={response(['logo'], [{ logo: { value: 'dir/a.png' } }])} endpoint="e" />
    );

    await userEvent.click(await screen.findByAltText('Organization logo'));
    expect(screen.getByAltText('a.png')).toBeTruthy();

    await userEvent.click(container.querySelector('.fixed.inset-0') as HTMLElement);
    await waitFor(() => expect(screen.queryByAltText('a.png')).toBeNull());
  });

  test('clicking the modal image itself does not close the modal', async () => {
    resolveLogo.mockResolvedValue('https://cdn.example.org/a.png');
    render(<ResultsTable data={response(['logo'], [{ logo: { value: 'a.png' } }])} endpoint="e" />);

    await userEvent.click(await screen.findByAltText('Organization logo'));
    await userEvent.click(screen.getByAltText('a.png'));
    expect(screen.getByAltText('a.png')).toBeTruthy();
  });

  test('the close button dismisses the modal', async () => {
    resolveLogo.mockResolvedValue('https://cdn.example.org/a.png');
    render(<ResultsTable data={response(['logo'], [{ logo: { value: 'a.png' } }])} endpoint="e" />);

    await userEvent.click(await screen.findByAltText('Organization logo'));
    await userEvent.click(screen.getByTitle('Close (ESC)'));
    await waitFor(() => expect(screen.queryByTitle('Close (ESC)')).toBeNull());
  });

  test('Escape closes the modal and other keys leave it open', async () => {
    resolveLogo.mockResolvedValue('https://cdn.example.org/a.png');
    render(<ResultsTable data={response(['logo'], [{ logo: { value: 'a.png' } }])} endpoint="e" />);

    await userEvent.click(await screen.findByAltText('Organization logo'));

    fireEvent.keyDown(document, { key: 'Enter' });
    expect(screen.getByAltText('a.png')).toBeTruthy();

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByAltText('a.png')).toBeNull());
  });

  test('falls back to "Logo" as the modal alt when the value has no path segment', async () => {
    resolveLogo.mockResolvedValue('https://cdn.example.org/a.png');
    render(<ResultsTable data={response(['logo'], [{ logo: { value: 'x/' } }])} endpoint="e" />);

    await userEvent.click(await screen.findByAltText('Organization logo'));
    expect(screen.getByAltText('Logo')).toBeTruthy();
  });

  test('clears stale image errors when new data arrives', async () => {
    resolveLogo.mockResolvedValue('https://cdn.example.org/a.png');
    const { rerender } = render(
      <ResultsTable data={response(['logo'], [{ logo: { value: 'a.png' } }])} endpoint="e" />
    );

    fireEvent.error(await screen.findByAltText('Organization logo'));
    await waitFor(() => expect(screen.queryByAltText('Organization logo')).toBeNull());

    rerender(
      <ResultsTable data={response(['logo'], [{ logo: { value: 'a.png' } }])} endpoint="e" />
    );
    expect(await screen.findByAltText('Organization logo')).toBeTruthy();
  });

  test('renders logo and non-logo columns side by side', async () => {
    resolveLogo.mockResolvedValue('https://cdn.example.org/a.png');
    render(
      <ResultsTable
        data={response(
          ['name', 'orgLogo'],
          [{ name: { value: 'SVB' }, orgLogo: { value: 'a.png' } }]
        )}
        endpoint="e"
      />
    );

    const row = (await screen.findByText('SVB')).closest('tr') as HTMLElement;
    expect(within(row).getByAltText('Organization logo')).toBeTruthy();
  });
});
