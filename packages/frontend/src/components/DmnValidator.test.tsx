// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import DmnValidator from './DmnValidator';

const API = 'http://api.test';

type Issue = {
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  location?: string;
  line?: number;
  column?: number;
};

function layers(overrides: Partial<Record<string, Issue[]>> = {}) {
  const build = (label: string, key: string) => ({ label, issues: overrides[key] ?? [] });
  return {
    base: build('Base', 'base'),
    business: build('Business', 'business'),
    execution: build('Execution', 'execution'),
    interaction: build('Interaction', 'interaction'),
    content: build('Content', 'content'),
  };
}

function result(overrides: Record<string, unknown> = {}) {
  return {
    valid: true,
    parseError: null,
    layers: layers(),
    summary: { errors: 0, warnings: 0, infos: 0 },
    ...overrides,
  };
}

function dmnFile(name = 'chain.dmn', content = '<definitions />') {
  return new File([content], name, { type: 'application/xml' });
}

/** Drops files onto the drop zone, which is the element carrying the dashed border. */
function dropZone(container: HTMLElement): HTMLElement {
  return container.querySelector('.border-dashed') as HTMLElement;
}

function dataTransfer(files: File[]) {
  return { files, items: [], types: ['Files'] } as unknown as DataTransfer;
}

async function addFiles(container: HTMLElement, files: File[]) {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  await userEvent.upload(input, files);
  for (const file of files) {
    await screen.findByTitle(file.name);
  }
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('DmnValidator drop zone', () => {
  test('shows the empty prompt before any file is added', () => {
    render(<DmnValidator apiBaseUrl={API} />);

    expect(screen.getByText('Drop DMN files here')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Clear all/ })).toBeNull();
    expect(screen.queryByText(/E = error/)).toBeNull();
  });

  test('switches to the compact prompt once a file is loaded', async () => {
    const { container } = render(<DmnValidator apiBaseUrl={API} />);
    await addFiles(container, [dmnFile()]);

    expect(screen.getByText(/Drop more files or click to browse/)).toBeTruthy();
    expect(screen.queryByText('Drop DMN files here')).toBeNull();
    expect(screen.getByText(/E = error/)).toBeTruthy();
  });

  test('highlights while dragging and clears the highlight on leave', () => {
    const { container } = render(<DmnValidator apiBaseUrl={API} />);
    const zone = dropZone(container);

    fireEvent.dragOver(zone);
    expect(zone.className).toContain('border-blue-400');

    fireEvent.dragLeave(zone);
    expect(zone.className).toContain('border-slate-300');
  });

  test('accepts .dmn and .xml files dropped on the zone', async () => {
    const { container } = render(<DmnValidator apiBaseUrl={API} />);

    fireEvent.drop(dropZone(container), {
      dataTransfer: dataTransfer([dmnFile('a.dmn'), dmnFile('b.xml')]),
    });

    expect(await screen.findByTitle('a.dmn')).toBeTruthy();
    expect(await screen.findByTitle('b.xml')).toBeTruthy();
    expect(dropZone(container).className).toContain('border-slate-300');
  });

  test('rejects other extensions with a transient warning', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { container } = render(<DmnValidator apiBaseUrl={API} />);

    fireEvent.drop(dropZone(container), {
      dataTransfer: dataTransfer([dmnFile('notes.txt'), dmnFile('readme.md')]),
    });

    expect(
      await screen.findByText('Skipped 2 file(s) — only .dmn and .xml are accepted.')
    ).toBeTruthy();
    expect(screen.queryByTitle('notes.txt')).toBeNull();

    await act(() => vi.advanceTimersByTimeAsync(4000));
    await waitFor(() => expect(screen.queryByText(/Skipped 2 file/)).toBeNull());
  });

  test('keeps the accepted files from a mixed drop', async () => {
    const { container } = render(<DmnValidator apiBaseUrl={API} />);

    fireEvent.drop(dropZone(container), {
      dataTransfer: dataTransfer([dmnFile('good.dmn'), dmnFile('bad.pdf')]),
    });

    expect(await screen.findByTitle('good.dmn')).toBeTruthy();
    expect(await screen.findByText(/Skipped 1 file/)).toBeTruthy();
  });

  test('clicking the zone opens the hidden file picker', async () => {
    const { container } = render(<DmnValidator apiBaseUrl={API} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const click = vi.spyOn(input, 'click');

    await userEvent.click(dropZone(container));

    expect(click).toHaveBeenCalled();
  });

  test('renders the file size in kilobytes', async () => {
    const { container } = render(<DmnValidator apiBaseUrl={API} />);
    await addFiles(container, [dmnFile('big.dmn', 'x'.repeat(2048))]);

    expect(screen.getByText('2.0 KB')).toBeTruthy();
  });
});

describe('DmnValidator validation', () => {
  test('reports a valid file with an all-clear badge', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: result() }),
    });

    const { container } = render(<DmnValidator apiBaseUrl={API} />);
    await addFiles(container, [dmnFile()]);

    await userEvent.click(screen.getByRole('button', { name: 'Validate' }));

    expect(await screen.findByText('Valid')).toBeTruthy();
    expect(screen.getByText('All checks passed')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(`${API}/v1/dmns/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: '<definitions />' }),
    });
  });

  test('shows per-severity counts for an invalid file', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: result({
          valid: false,
          summary: { errors: 2, warnings: 3, infos: 1 },
          layers: layers({
            base: [{ severity: 'error', code: 'BASE-001', message: 'Missing decision' }],
          }),
        }),
      }),
    });

    const { container } = render(<DmnValidator apiBaseUrl={API} />);
    await addFiles(container, [dmnFile()]);
    await userEvent.click(screen.getByRole('button', { name: 'Validate' }));

    expect(await screen.findByText('Invalid')).toBeTruthy();
    expect(screen.getByText('2E')).toBeTruthy();
    expect(screen.getByText('3W')).toBeTruthy();
    expect(screen.getByText('1I')).toBeTruthy();
    expect(screen.queryByText('All checks passed')).toBeNull();
  });

  test('omits the all-clear badge when a valid file still has warnings', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: result({ summary: { errors: 0, warnings: 1, infos: 0 } }),
      }),
    });

    const { container } = render(<DmnValidator apiBaseUrl={API} />);
    await addFiles(container, [dmnFile()]);
    await userEvent.click(screen.getByRole('button', { name: 'Validate' }));

    expect(await screen.findByText('Valid')).toBeTruthy();
    expect(screen.queryByText('All checks passed')).toBeNull();
  });

  test('surfaces a parse error alongside the summary', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: result({ valid: false, parseError: 'Unexpected token at line 4' }),
      }),
    });

    const { container } = render(<DmnValidator apiBaseUrl={API} />);
    await addFiles(container, [dmnFile()]);
    await userEvent.click(screen.getByRole('button', { name: 'Validate' }));

    expect(await screen.findByText('Unexpected token at line 4')).toBeTruthy();
  });

  test('shows the spinner while the request is in flight', async () => {
    let release: (value: unknown) => void = () => {};
    fetchMock.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      })
    );

    const { container } = render(<DmnValidator apiBaseUrl={API} />);
    await addFiles(container, [dmnFile()]);
    await userEvent.click(screen.getByRole('button', { name: 'Validate' }));

    expect(await screen.findByText('Running validation…')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Validating/ })).toHaveProperty('disabled', true);

    release({ ok: true, status: 200, json: async () => ({ success: true, data: result() }) });
    await screen.findByText('Valid');
  });

  test('reports the server error message when validation fails', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ success: false, error: { message: 'Not a DMN document' } }),
    });

    const { container } = render(<DmnValidator apiBaseUrl={API} />);
    await addFiles(container, [dmnFile()]);
    await userEvent.click(screen.getByRole('button', { name: 'Validate' }));

    expect(await screen.findByText('Not a DMN document')).toBeTruthy();
  });

  test('falls back to the status code when the server sends no message', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ success: false }),
    });

    const { container } = render(<DmnValidator apiBaseUrl={API} />);
    await addFiles(container, [dmnFile()]);
    await userEvent.click(screen.getByRole('button', { name: 'Validate' }));

    expect(await screen.findByText('Server error: 503')).toBeTruthy();
  });

  test('treats an unsuccessful 200 body as an error', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: false, error: { message: 'Validator offline' } }),
    });

    const { container } = render(<DmnValidator apiBaseUrl={API} />);
    await addFiles(container, [dmnFile()]);
    await userEvent.click(screen.getByRole('button', { name: 'Validate' }));

    expect(await screen.findByText('Validator offline')).toBeTruthy();
  });

  test('falls back to a generic message when the rejection is not an Error', async () => {
    fetchMock.mockRejectedValue('network down');

    const { container } = render(<DmnValidator apiBaseUrl={API} />);
    await addFiles(container, [dmnFile()]);
    await userEvent.click(screen.getByRole('button', { name: 'Validate' }));

    expect(await screen.findByText('Validation request failed.')).toBeTruthy();
  });
});

describe('DmnValidator layer sections', () => {
  async function renderWithIssues(issues: Issue[]) {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: result({ valid: false, layers: layers({ base: issues }) }),
      }),
    });

    const { container } = render(<DmnValidator apiBaseUrl={API} />);
    await addFiles(container, [dmnFile()]);
    await userEvent.click(screen.getByRole('button', { name: 'Validate' }));
    await screen.findByText('Invalid');
    return container;
  }

  test('starts collapsed and expands on click', async () => {
    await renderWithIssues([{ severity: 'error', code: 'BASE-001', message: 'Missing decision' }]);

    expect(screen.queryByText('Missing decision')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: /Base/ }));
    expect(screen.getByText('Missing decision')).toBeTruthy();
    expect(screen.getByText('BASE-001')).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: /Base/ }));
    expect(screen.queryByText('Missing decision')).toBeNull();
  });

  test('marks a clean layer OK and says so when expanded', async () => {
    await renderWithIssues([]);

    const clean = screen.getByRole('button', { name: /Business/ });
    expect(within(clean).getByText('OK')).toBeTruthy();

    await userEvent.click(clean);
    expect(screen.getByText('No issues found.')).toBeTruthy();
  });

  test('counts each severity in the layer header', async () => {
    await renderWithIssues([
      { severity: 'error', code: 'E1', message: 'e' },
      { severity: 'warning', code: 'W1', message: 'w' },
      { severity: 'warning', code: 'W2', message: 'w2' },
      { severity: 'info', code: 'I1', message: 'i' },
    ]);

    const header = screen.getByRole('button', { name: /Base/ });
    expect(within(header).getByText('1E')).toBeTruthy();
    expect(within(header).getByText('2W')).toBeTruthy();
    expect(within(header).getByText('1I')).toBeTruthy();
  });

  test('leads a warning-only layer with the warning icon rather than the error one', async () => {
    await renderWithIssues([{ severity: 'warning', code: 'W1', message: 'w' }]);

    const header = screen.getByRole('button', { name: /Base/ });
    expect(within(header).queryByText(/^\d+E$/)).toBeNull();
    expect(within(header).getByText('1W')).toBeTruthy();
  });

  test('renders an info-only layer without error or warning counts', async () => {
    await renderWithIssues([{ severity: 'info', code: 'I1', message: 'fyi' }]);

    const header = screen.getByRole('button', { name: /Base/ });
    expect(within(header).getByText('1I')).toBeTruthy();
    expect(within(header).queryByText('OK')).toBeNull();
  });

  test('shows an issue location and its line and column', async () => {
    await renderWithIssues([
      {
        severity: 'error',
        code: 'E1',
        message: 'bad input',
        location: '/definitions/decision[1]',
        line: 12,
        column: 4,
      },
    ]);

    await userEvent.click(screen.getByRole('button', { name: /Base/ }));
    expect(screen.getByText('/definitions/decision[1]')).toBeTruthy();
    expect(screen.getByText('Line 12, col 4')).toBeTruthy();
  });

  test('omits the column when the issue has none', async () => {
    await renderWithIssues([{ severity: 'error', code: 'E1', message: 'bad', line: 7 }]);

    await userEvent.click(screen.getByRole('button', { name: /Base/ }));
    expect(screen.getByText('Line 7')).toBeTruthy();
  });

  test('omits location and line when the issue carries neither', async () => {
    await renderWithIssues([{ severity: 'error', code: 'E1', message: 'bad' }]);

    await userEvent.click(screen.getByRole('button', { name: /Base/ }));
    expect(screen.queryByText(/^Line /)).toBeNull();
  });
});

describe('DmnValidator multi-file actions', () => {
  test('validates every pending entry at once, then hides the bulk button', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: result() }),
    });

    const { container } = render(<DmnValidator apiBaseUrl={API} />);
    await addFiles(container, [dmnFile('a.dmn'), dmnFile('b.dmn')]);

    await userEvent.click(screen.getByRole('button', { name: /Validate all/ }));

    await waitFor(() => expect(screen.getAllByText('Valid')).toHaveLength(2));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('button', { name: /Validate all/ })).toBeNull();
  });

  test('keeps the bulk button visible while one entry is still pending', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: result() }),
    });

    const { container } = render(<DmnValidator apiBaseUrl={API} />);
    await addFiles(container, [dmnFile('a.dmn'), dmnFile('b.dmn')]);

    const cards = screen.getAllByRole('button', { name: 'Validate' });
    await userEvent.click(cards[0]);
    await screen.findByText('Valid');

    expect(screen.getByRole('button', { name: /Validate all/ })).toBeTruthy();
  });

  test('removes a single entry', async () => {
    const { container } = render(<DmnValidator apiBaseUrl={API} />);
    await addFiles(container, [dmnFile('a.dmn'), dmnFile('b.dmn')]);

    const card = screen.getByTitle('a.dmn').closest('.flex-col') as HTMLElement;
    await userEvent.click(within(card).getByTitle('Remove'));

    await waitFor(() => expect(screen.queryByTitle('a.dmn')).toBeNull());
    expect(screen.getByTitle('b.dmn')).toBeTruthy();
  });

  test('clears every entry at once', async () => {
    const { container } = render(<DmnValidator apiBaseUrl={API} />);
    await addFiles(container, [dmnFile('a.dmn'), dmnFile('b.dmn')]);

    await userEvent.click(screen.getByRole('button', { name: /Clear all/ }));

    await waitFor(() => expect(screen.getByText('Drop DMN files here')).toBeTruthy());
  });

  test('prompts for validation on a freshly added entry', async () => {
    const { container } = render(<DmnValidator apiBaseUrl={API} />);
    await addFiles(container, [dmnFile()]);

    expect(screen.getByText('Press Validate to run checks.')).toBeTruthy();
  });
});
