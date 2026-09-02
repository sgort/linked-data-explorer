// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import ShaclValidator from './ShaclValidator';

const API = 'http://api.test';

type Issue = {
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  location?: string;
  line?: number;
  column?: number;
};

type LayerOverride = { loaded?: boolean; issues?: Issue[] };

function layers(overrides: Record<string, LayerOverride> = {}) {
  const build = (label: string, key: string) => ({
    label,
    loaded: overrides[key]?.loaded ?? true,
    issues: overrides[key]?.issues ?? [],
  });
  return {
    cprmv: build('CPRMV', 'cprmv'),
    'cpsv-ap': build('CPSV-AP', 'cpsv-ap'),
    'ronl-custom': build('RONL custom', 'ronl-custom'),
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

const TURTLE = '<urn:s> a <urn:C> .';

function ttlFile(name = 'service.ttl', content = TURTLE) {
  return new File([content], name, { type: 'text/turtle' });
}

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

function ok(data: unknown) {
  return { ok: true, status: 200, json: async () => ({ success: true, data }) };
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

describe('ShaclValidator drop zone', () => {
  test('shows the empty prompt before any file is added', () => {
    render(<ShaclValidator apiBaseUrl={API} />);

    expect(screen.getByText('Drop Turtle files here')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Clear all/ })).toBeNull();
  });

  test('switches to the compact prompt once a file is loaded', async () => {
    const { container } = render(<ShaclValidator apiBaseUrl={API} />);
    await addFiles(container, [ttlFile()]);

    expect(screen.getByText(/Drop more files or click to browse/)).toBeTruthy();
    expect(screen.queryByText('Drop Turtle files here')).toBeNull();
    expect(screen.getByText(/E = error/)).toBeTruthy();
  });

  test('highlights while dragging and clears the highlight on leave', () => {
    const { container } = render(<ShaclValidator apiBaseUrl={API} />);
    const zone = dropZone(container);

    fireEvent.dragOver(zone);
    expect(zone.className).toContain('border-blue-400');

    fireEvent.dragLeave(zone);
    expect(zone.className).toContain('border-slate-300');
  });

  test('accepts .ttl files dropped on the zone', async () => {
    const { container } = render(<ShaclValidator apiBaseUrl={API} />);

    fireEvent.drop(dropZone(container), {
      dataTransfer: dataTransfer([ttlFile('a.ttl'), ttlFile('b.ttl')]),
    });

    expect(await screen.findByTitle('a.ttl')).toBeTruthy();
    expect(await screen.findByTitle('b.ttl')).toBeTruthy();
  });

  test('rejects non-Turtle files with a transient warning', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { container } = render(<ShaclValidator apiBaseUrl={API} />);

    fireEvent.drop(dropZone(container), {
      dataTransfer: dataTransfer([ttlFile('notes.txt'), ttlFile('graph.rdf')]),
    });

    expect(await screen.findByText('Skipped 2 file(s) — only .ttl is accepted.')).toBeTruthy();
    expect(screen.queryByTitle('notes.txt')).toBeNull();

    await act(() => vi.advanceTimersByTimeAsync(4000));
    await waitFor(() => expect(screen.queryByText(/Skipped 2 file/)).toBeNull());
  });

  test('keeps the accepted files from a mixed drop', async () => {
    const { container } = render(<ShaclValidator apiBaseUrl={API} />);

    fireEvent.drop(dropZone(container), {
      dataTransfer: dataTransfer([ttlFile('good.ttl'), ttlFile('bad.jsonld')]),
    });

    expect(await screen.findByTitle('good.ttl')).toBeTruthy();
    expect(await screen.findByText(/Skipped 1 file/)).toBeTruthy();
  });

  test('clicking the zone opens the hidden file picker', async () => {
    const { container } = render(<ShaclValidator apiBaseUrl={API} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const click = vi.spyOn(input, 'click');

    await userEvent.click(dropZone(container));

    expect(click).toHaveBeenCalled();
  });

  test('renders the file size in kilobytes', async () => {
    const { container } = render(<ShaclValidator apiBaseUrl={API} />);
    await addFiles(container, [ttlFile('big.ttl', 'x'.repeat(1536))]);

    expect(screen.getByText('1.5 KB')).toBeTruthy();
  });
});

describe('ShaclValidator validation modes', () => {
  test('defaults to file-local validation', async () => {
    fetchMock.mockResolvedValue(ok(result()));

    const { container } = render(<ShaclValidator apiBaseUrl={API} />);
    await addFiles(container, [ttlFile()]);
    await userEvent.click(screen.getByRole('button', { name: 'Validate' }));

    await screen.findByText('Valid');
    expect(fetchMock).toHaveBeenCalledWith(`${API}/v1/shacl/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: TURTLE }),
    });
    expect(screen.queryByPlaceholderText(/SPARQL endpoint/)).toBeNull();
  });

  test('merge-simulated mode reveals the endpoint field and its explanation', async () => {
    render(<ShaclValidator apiBaseUrl={API} />);

    await userEvent.click(screen.getByRole('button', { name: /Merge-simulated/ }));

    expect(screen.getByPlaceholderText('SPARQL endpoint (blank = server default)')).toBeTruthy();
    expect(screen.getByText(/unions each file with the already-published triples/)).toBeTruthy();
  });

  test('merge-simulated mode posts to the merged endpoint without an endpoint override', async () => {
    fetchMock.mockResolvedValue(ok(result()));

    const { container } = render(<ShaclValidator apiBaseUrl={API} />);
    await addFiles(container, [ttlFile()]);
    await userEvent.click(screen.getByRole('button', { name: /Merge-simulated/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Validate' }));

    await screen.findByText('Valid');
    expect(fetchMock).toHaveBeenCalledWith(
      `${API}/v1/shacl/validate-merged`,
      expect.objectContaining({ body: JSON.stringify({ content: TURTLE }) })
    );
  });

  test('a typed endpoint is sent with the merged request', async () => {
    fetchMock.mockResolvedValue(ok(result()));

    const { container } = render(<ShaclValidator apiBaseUrl={API} />);
    await addFiles(container, [ttlFile()]);
    await userEvent.click(screen.getByRole('button', { name: /Merge-simulated/ }));
    await userEvent.type(
      screen.getByPlaceholderText(/SPARQL endpoint/),
      '  https://sparql.example.org  '
    );
    await userEvent.click(screen.getByRole('button', { name: 'Validate' }));

    await screen.findByText('Valid');
    expect(fetchMock).toHaveBeenCalledWith(
      `${API}/v1/shacl/validate-merged`,
      expect.objectContaining({
        body: JSON.stringify({ content: TURTLE, endpoint: 'https://sparql.example.org' }),
      })
    );
  });

  test('a whitespace-only endpoint is treated as blank', async () => {
    fetchMock.mockResolvedValue(ok(result()));

    const { container } = render(<ShaclValidator apiBaseUrl={API} />);
    await addFiles(container, [ttlFile()]);
    await userEvent.click(screen.getByRole('button', { name: /Merge-simulated/ }));
    await userEvent.type(screen.getByPlaceholderText(/SPARQL endpoint/), '   ');
    await userEvent.click(screen.getByRole('button', { name: 'Validate' }));

    await screen.findByText('Valid');
    expect(fetchMock).toHaveBeenCalledWith(
      `${API}/v1/shacl/validate-merged`,
      expect.objectContaining({ body: JSON.stringify({ content: TURTLE }) })
    );
  });

  test('switching back to file-local hides the endpoint field again', async () => {
    render(<ShaclValidator apiBaseUrl={API} />);

    await userEvent.click(screen.getByRole('button', { name: /Merge-simulated/ }));
    expect(screen.getByPlaceholderText(/SPARQL endpoint/)).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: /File-local/ }));
    expect(screen.queryByPlaceholderText(/SPARQL endpoint/)).toBeNull();
  });
});

describe('ShaclValidator results', () => {
  test('reports a valid file with an all-clear badge', async () => {
    fetchMock.mockResolvedValue(ok(result()));

    const { container } = render(<ShaclValidator apiBaseUrl={API} />);
    await addFiles(container, [ttlFile()]);
    await userEvent.click(screen.getByRole('button', { name: 'Validate' }));

    expect(await screen.findByText('Valid')).toBeTruthy();
    expect(screen.getByText('All checks passed')).toBeTruthy();
  });

  test('shows per-severity counts for an invalid file', async () => {
    fetchMock.mockResolvedValue(
      ok(result({ valid: false, summary: { errors: 4, warnings: 2, infos: 6 } }))
    );

    const { container } = render(<ShaclValidator apiBaseUrl={API} />);
    await addFiles(container, [ttlFile()]);
    await userEvent.click(screen.getByRole('button', { name: 'Validate' }));

    expect(await screen.findByText('Invalid')).toBeTruthy();
    expect(screen.getByText('4E')).toBeTruthy();
    expect(screen.getByText('2W')).toBeTruthy();
    expect(screen.getByText('6I')).toBeTruthy();
    expect(screen.queryByText('All checks passed')).toBeNull();
  });

  test('omits the all-clear badge when a valid file still has warnings', async () => {
    fetchMock.mockResolvedValue(ok(result({ summary: { errors: 0, warnings: 1, infos: 0 } })));

    const { container } = render(<ShaclValidator apiBaseUrl={API} />);
    await addFiles(container, [ttlFile()]);
    await userEvent.click(screen.getByRole('button', { name: 'Validate' }));

    expect(await screen.findByText('Valid')).toBeTruthy();
    expect(screen.queryByText('All checks passed')).toBeNull();
  });

  test('surfaces a parse error alongside the summary', async () => {
    fetchMock.mockResolvedValue(
      ok(result({ valid: false, parseError: 'Unexpected "." on line 3' }))
    );

    const { container } = render(<ShaclValidator apiBaseUrl={API} />);
    await addFiles(container, [ttlFile()]);
    await userEvent.click(screen.getByRole('button', { name: 'Validate' }));

    expect(await screen.findByText('Unexpected "." on line 3')).toBeTruthy();
  });

  test('shows the spinner while the request is in flight', async () => {
    let release: (value: unknown) => void = () => {};
    fetchMock.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      })
    );

    const { container } = render(<ShaclValidator apiBaseUrl={API} />);
    await addFiles(container, [ttlFile()]);
    await userEvent.click(screen.getByRole('button', { name: 'Validate' }));

    expect(await screen.findByText('Running validation…')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Validating/ })).toHaveProperty('disabled', true);

    release(ok(result()));
    await screen.findByText('Valid');
  });

  test('reports the server error message when validation fails', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ success: false, error: { message: 'Turtle could not be parsed' } }),
    });

    const { container } = render(<ShaclValidator apiBaseUrl={API} />);
    await addFiles(container, [ttlFile()]);
    await userEvent.click(screen.getByRole('button', { name: 'Validate' }));

    expect(await screen.findByText('Turtle could not be parsed')).toBeTruthy();
  });

  test('falls back to the status code when the server sends no message', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 502, json: async () => ({ success: false }) });

    const { container } = render(<ShaclValidator apiBaseUrl={API} />);
    await addFiles(container, [ttlFile()]);
    await userEvent.click(screen.getByRole('button', { name: 'Validate' }));

    expect(await screen.findByText('Server error: 502')).toBeTruthy();
  });

  test('treats an unsuccessful 200 body as an error', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: false, error: { message: 'Shapes unavailable' } }),
    });

    const { container } = render(<ShaclValidator apiBaseUrl={API} />);
    await addFiles(container, [ttlFile()]);
    await userEvent.click(screen.getByRole('button', { name: 'Validate' }));

    expect(await screen.findByText('Shapes unavailable')).toBeTruthy();
  });

  test('falls back to a generic message when the rejection is not an Error', async () => {
    fetchMock.mockRejectedValue('offline');

    const { container } = render(<ShaclValidator apiBaseUrl={API} />);
    await addFiles(container, [ttlFile()]);
    await userEvent.click(screen.getByRole('button', { name: 'Validate' }));

    expect(await screen.findByText('Validation request failed.')).toBeTruthy();
  });
});

describe('ShaclValidator layer sections', () => {
  async function renderWithLayers(overrides: Record<string, LayerOverride>) {
    fetchMock.mockResolvedValue(ok(result({ valid: false, layers: layers(overrides) })));

    const { container } = render(<ShaclValidator apiBaseUrl={API} />);
    await addFiles(container, [ttlFile()]);
    await userEvent.click(screen.getByRole('button', { name: 'Validate' }));
    await screen.findByText('Invalid');
    return container;
  }

  test('starts collapsed and expands on click', async () => {
    await renderWithLayers({
      cprmv: { issues: [{ severity: 'error', code: 'SH-001', message: 'Missing sh:targetClass' }] },
    });

    expect(screen.queryByText('Missing sh:targetClass')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: /CPRMV/ }));
    expect(screen.getByText('Missing sh:targetClass')).toBeTruthy();
    expect(screen.getByText('SH-001')).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: /CPRMV/ }));
    expect(screen.queryByText('Missing sh:targetClass')).toBeNull();
  });

  test('marks a loaded, issue-free layer OK', async () => {
    await renderWithLayers({});

    const clean = screen.getByRole('button', { name: /CPSV-AP/ });
    expect(within(clean).getByText('OK')).toBeTruthy();

    await userEvent.click(clean);
    expect(screen.getByText('No issues found.')).toBeTruthy();
  });

  test('marks a layer with no shapes as not loaded and explains why on expand', async () => {
    await renderWithLayers({ 'ronl-custom': { loaded: false } });

    const header = screen.getByRole('button', { name: /RONL custom/ });
    expect(within(header).getByText('Not loaded')).toBeTruthy();
    expect(within(header).queryByText('OK')).toBeNull();

    await userEvent.click(header);
    expect(
      screen.getByText('No shapes are loaded for this layer, so nothing was validated against it.')
    ).toBeTruthy();
  });

  test('counts each severity in the layer header', async () => {
    await renderWithLayers({
      cprmv: {
        issues: [
          { severity: 'error', code: 'E1', message: 'e' },
          { severity: 'warning', code: 'W1', message: 'w' },
          { severity: 'warning', code: 'W2', message: 'w2' },
          { severity: 'info', code: 'I1', message: 'i' },
        ],
      },
    });

    const header = screen.getByRole('button', { name: /CPRMV/ });
    expect(within(header).getByText('1E')).toBeTruthy();
    expect(within(header).getByText('2W')).toBeTruthy();
    expect(within(header).getByText('1I')).toBeTruthy();
  });

  test('leads a warning-only layer without an error count', async () => {
    await renderWithLayers({
      cprmv: { issues: [{ severity: 'warning', code: 'W1', message: 'w' }] },
    });

    const header = screen.getByRole('button', { name: /CPRMV/ });
    expect(within(header).queryByText(/^\d+E$/)).toBeNull();
    expect(within(header).getByText('1W')).toBeTruthy();
  });

  test('renders an info-only layer without error or warning counts', async () => {
    await renderWithLayers({
      cprmv: { issues: [{ severity: 'info', code: 'I1', message: 'fyi' }] },
    });

    const header = screen.getByRole('button', { name: /CPRMV/ });
    expect(within(header).getByText('1I')).toBeTruthy();
    expect(within(header).queryByText('OK')).toBeNull();
  });

  test('shows an issue location and its line and column', async () => {
    await renderWithLayers({
      cprmv: {
        issues: [
          {
            severity: 'error',
            code: 'E1',
            message: 'bad node',
            location: 'urn:service:1',
            line: 12,
            column: 4,
          },
        ],
      },
    });

    await userEvent.click(screen.getByRole('button', { name: /CPRMV/ }));
    expect(screen.getByText('urn:service:1')).toBeTruthy();
    expect(screen.getByText('Line 12, col 4')).toBeTruthy();
  });

  test('omits the column when the issue has none', async () => {
    await renderWithLayers({
      cprmv: { issues: [{ severity: 'error', code: 'E1', message: 'bad', line: 7 }] },
    });

    await userEvent.click(screen.getByRole('button', { name: /CPRMV/ }));
    expect(screen.getByText('Line 7')).toBeTruthy();
  });

  test('omits location and line when the issue carries neither', async () => {
    await renderWithLayers({
      cprmv: { issues: [{ severity: 'error', code: 'E1', message: 'bad' }] },
    });

    await userEvent.click(screen.getByRole('button', { name: /CPRMV/ }));
    expect(screen.queryByText(/^Line /)).toBeNull();
  });
});

describe('ShaclValidator multi-file actions', () => {
  test('validates every pending entry at once, then hides the bulk button', async () => {
    fetchMock.mockResolvedValue(ok(result()));

    const { container } = render(<ShaclValidator apiBaseUrl={API} />);
    await addFiles(container, [ttlFile('a.ttl'), ttlFile('b.ttl')]);

    await userEvent.click(screen.getByRole('button', { name: /Validate all/ }));

    await waitFor(() => expect(screen.getAllByText('Valid')).toHaveLength(2));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('button', { name: /Validate all/ })).toBeNull();
  });

  test('keeps the bulk button visible while one entry is still pending', async () => {
    fetchMock.mockResolvedValue(ok(result()));

    const { container } = render(<ShaclValidator apiBaseUrl={API} />);
    await addFiles(container, [ttlFile('a.ttl'), ttlFile('b.ttl')]);

    await userEvent.click(screen.getAllByRole('button', { name: 'Validate' })[0]);
    await screen.findByText('Valid');

    expect(screen.getByRole('button', { name: /Validate all/ })).toBeTruthy();
  });

  test('removes a single entry', async () => {
    const { container } = render(<ShaclValidator apiBaseUrl={API} />);
    await addFiles(container, [ttlFile('a.ttl'), ttlFile('b.ttl')]);

    const card = screen.getByTitle('a.ttl').closest('.flex-col') as HTMLElement;
    await userEvent.click(within(card).getByTitle('Remove'));

    await waitFor(() => expect(screen.queryByTitle('a.ttl')).toBeNull());
    expect(screen.getByTitle('b.ttl')).toBeTruthy();
  });

  test('clears every entry at once', async () => {
    const { container } = render(<ShaclValidator apiBaseUrl={API} />);
    await addFiles(container, [ttlFile('a.ttl'), ttlFile('b.ttl')]);

    await userEvent.click(screen.getByRole('button', { name: /Clear all/ }));

    await waitFor(() => expect(screen.getByText('Drop Turtle files here')).toBeTruthy());
  });

  test('prompts for validation on a freshly added entry', async () => {
    const { container } = render(<ShaclValidator apiBaseUrl={API} />);
    await addFiles(container, [ttlFile()]);

    expect(screen.getByText('Press Validate to run checks.')).toBeTruthy();
  });
});
