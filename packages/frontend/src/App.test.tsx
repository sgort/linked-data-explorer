// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';

const executeSparqlQuery = vi.fn();
vi.mock('./services/sparqlService', () => ({
  executeSparqlQuery: (...args: unknown[]) => executeSparqlQuery(...args),
}));

vi.mock('./components/BpmnModeler/BpmnModeler', () => ({
  default: ({ endpoint }: { endpoint: string }) => <div>BpmnModeler:{endpoint}</div>,
}));
vi.mock('./components/ChainBuilder/ChainBuilder', () => ({
  default: ({ endpoint }: { endpoint: string }) => <div>ChainBuilder:{endpoint}</div>,
}));
vi.mock('./components/Changelog', () => ({ default: () => <div>Changelog stub</div> }));
vi.mock('./components/DmnValidator', () => ({
  default: ({ apiBaseUrl }: { apiBaseUrl: string }) => <div>DmnValidator:{apiBaseUrl}</div>,
}));
vi.mock('./components/DocumentComposer/DocumentComposer', () => ({
  default: ({ endpoint }: { endpoint: string }) => <div>DocumentComposer:{endpoint}</div>,
}));
vi.mock('./components/DsoExplorer/DsoExplorer', () => ({
  default: ({ env }: { env: string }) => <div>DsoExplorer:{env}</div>,
}));
vi.mock('./components/FormEditor/FormEditor', () => ({
  default: () => <div>FormEditor stub</div>,
}));
vi.mock('./components/GraphView', () => ({
  default: ({ data }: { data: { results: { bindings: unknown[] } } | null }) => (
    <div>GraphView:{data ? data.results.bindings.length : 'none'}</div>
  ),
}));
vi.mock('./components/ResultsTable', () => ({
  default: ({
    data,
    endpoint,
  }: {
    data: { results: { bindings: unknown[] } } | null;
    endpoint: string;
  }) => (
    <div>
      ResultsTable:{endpoint}:{data ? data.results.bindings.length : 'none'}
    </div>
  ),
}));
vi.mock('./components/RopaEditor/RopaEditor', () => ({
  default: () => <div>RopaEditor stub</div>,
}));
vi.mock('./components/ShaclValidator', () => ({
  default: ({ apiBaseUrl }: { apiBaseUrl: string }) => <div>ShaclValidator:{apiBaseUrl}</div>,
}));
vi.mock('./components/Tutorial/Tutorial', () => ({ default: () => <div>Tutorial stub</div> }));

import App from './App';
import { ALL_QUERIES, PRESET_ENDPOINTS, SAMPLE_QUERIES } from './utils/constants';

const VIEWMODE_STORAGE_KEY = 'linkedDataExplorer_activeView';

/** The endpoint name also appears in the header's <datalist> <option>; scope to the
 *  settings-panel row (a <div>, not an <option>) to avoid an ambiguous text match. */
function endpointRow(name: string): HTMLElement {
  return screen.getAllByText(name).find((el) => el.tagName === 'DIV')!;
}

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  executeSparqlQuery.mockReset();
});

describe('App — sidebar navigation', () => {
  test('defaults to the QUERY view with the SPARQL editor and results pane', () => {
    render(<App />);
    expect(screen.getByLabelText('SPARQL Query')).toBeTruthy();
    expect(screen.getByText('Results View')).toBeTruthy();
    expect(screen.getByText('Run Query')).toBeTruthy();
  });

  test.each([
    ['DMN Orchestration', `ChainBuilder:${PRESET_ENDPOINTS[1]?.url}`],
    ['BPMN Modeler', `BpmnModeler:${PRESET_ENDPOINTS[1]?.url}`],
    ['Form Editor', 'FormEditor stub'],
    ['Document Composer', `DocumentComposer:${PRESET_ENDPOINTS[1]?.url}`],
    ['RoPA Records', 'RopaEditor stub'],
    ['DSO Explorer', 'DsoExplorer:pre'],
    ['Getting Started', 'Tutorial stub'],
    ['Changelog', 'Changelog stub'],
  ])('clicking the %s nav icon renders the corresponding view', async (title, expectedText) => {
    render(<App />);
    await userEvent.click(screen.getByTitle(title));
    expect(screen.getByText(expectedText)).toBeTruthy();
  });

  test('clicking Graph Visualization renders GraphView with no data yet', async () => {
    render(<App />);
    await userEvent.click(screen.getByTitle('Graph Visualization'));
    expect(screen.getByText('GraphView:none')).toBeTruthy();
  });

  test('persists the active view to localStorage and restores it on remount', async () => {
    const { unmount } = render(<App />);
    await userEvent.click(screen.getByTitle('BPMN Modeler'));
    expect(localStorage.getItem(VIEWMODE_STORAGE_KEY)).toBe('BPMN');
    unmount();

    render(<App />);
    expect(screen.getByText(`BpmnModeler:${PRESET_ENDPOINTS[1]?.url}`)).toBeTruthy();
  });

  test('falls back to the QUERY view when localStorage holds an invalid value', () => {
    localStorage.setItem(VIEWMODE_STORAGE_KEY, 'NOT_A_REAL_VIEW');
    render(<App />);
    expect(screen.getByLabelText('SPARQL Query')).toBeTruthy();
  });

  test('the DMN and SHACL validators stay mounted (hidden via CSS) on every other view', () => {
    render(<App />);
    expect(
      screen.getByText('DmnValidator:http://localhost:3001').parentElement?.className
    ).toContain('hidden');
    expect(
      screen.getByText('ShaclValidator:http://localhost:3001').parentElement?.className
    ).toContain('hidden');
  });
});

describe('App — running SPARQL queries', () => {
  test('Run Query executes against the current endpoint and query, and renders the results', async () => {
    executeSparqlQuery.mockResolvedValue({
      head: { vars: ['s'] },
      results: { bindings: [{ s: { type: 'uri', value: 'http://a' } }] },
    });
    render(<App />);

    await userEvent.click(screen.getByText('Run Query'));

    expect(executeSparqlQuery).toHaveBeenCalledWith(
      PRESET_ENDPOINTS[1]?.url,
      SAMPLE_QUERIES[0].sparql
    );
    expect(await screen.findByText(`ResultsTable:${PRESET_ENDPOINTS[1]?.url}:1`)).toBeTruthy();
  });

  test('a query containing "?s ?p ?o" auto-switches to the Visualize view on success', async () => {
    executeSparqlQuery.mockResolvedValue({
      head: { vars: ['s', 'p', 'o'] },
      results: { bindings: [{}, {}] },
    });
    render(<App />);

    const textarea = screen.getByLabelText('SPARQL Query');
    await userEvent.clear(textarea);
    await userEvent.type(textarea, 'SELECT ?s ?p ?o WHERE {{ ?s ?p ?o }}');
    await userEvent.click(screen.getByText('Run Query'));

    expect(await screen.findByText('GraphView:2')).toBeTruthy();
  });

  test('a failed query shows a dismissible error overlay', async () => {
    executeSparqlQuery.mockRejectedValue(new Error('endpoint unreachable'));
    render(<App />);

    await userEvent.click(screen.getByText('Run Query'));

    expect(await screen.findByText('endpoint unreachable')).toBeTruthy();
    await userEvent.click(screen.getByLabelText('Dismiss error'));
    expect(screen.queryByText('endpoint unreachable')).toBeNull();
  });

  test('selecting a library query loads its SPARQL text into the editor', async () => {
    render(<App />);
    const secondQuery = ALL_QUERIES[1];

    await userEvent.click(screen.getByText(secondQuery.name));

    expect((screen.getByLabelText('SPARQL Query') as HTMLTextAreaElement).value).toBe(
      secondQuery.sparql
    );
  });

  test('manually editing the query clears the selected-library highlight', async () => {
    render(<App />);
    const firstQueryButton = screen.getByText(ALL_QUERIES[0].name);
    await userEvent.click(firstQueryButton);
    expect(firstQueryButton.className).toContain('bg-blue-100');

    await userEvent.type(screen.getByLabelText('SPARQL Query'), ' extra');
    expect(firstQueryButton.className).not.toContain('bg-blue-100');
  });
});

describe('App — settings panel', () => {
  test('the gear icon toggles the settings panel', async () => {
    render(<App />);
    expect(screen.queryByText('Configuration')).toBeNull();

    await userEvent.click(screen.getByTitle('Settings'));
    expect(screen.getByText('Configuration')).toBeTruthy();

    await userEvent.click(screen.getByLabelText('Close settings'));
    expect(screen.queryByText('Configuration')).toBeNull();
  });

  test('adding a new endpoint appends it to the session list and clears the form', async () => {
    render(<App />);
    await userEvent.click(screen.getByTitle('Settings'));

    const addButton = screen
      .getByPlaceholderText('SPARQL Endpoint URL')
      .parentElement!.querySelector('button')!;
    expect(addButton).toBeDisabled();

    await userEvent.type(
      screen.getByPlaceholderText('Display Name (e.g. Local TripleDB)'),
      'My Endpoint'
    );
    await userEvent.type(
      screen.getByPlaceholderText('SPARQL Endpoint URL'),
      'http://localhost:9999/sparql'
    );
    await userEvent.click(addButton);

    expect(endpointRow('My Endpoint')).toBeTruthy();
    expect(
      (screen.getByPlaceholderText('Display Name (e.g. Local TripleDB)') as HTMLInputElement).value
    ).toBe('');
  });

  test('deleting a saved endpoint removes it from the list', async () => {
    render(<App />);
    await userEvent.click(screen.getByTitle('Settings'));

    const nameToDelete = PRESET_ENDPOINTS[0].name;
    expect(endpointRow(nameToDelete)).toBeTruthy();
    await userEvent.click(screen.getAllByTitle('Remove Endpoint')[0]);
    expect(screen.queryAllByText(nameToDelete).find((el) => el.tagName === 'DIV')).toBeUndefined();
  });

  test('Reset Defaults restores the preset endpoints only when confirmed', async () => {
    render(<App />);
    await userEvent.click(screen.getByTitle('Settings'));
    await userEvent.click(screen.getAllByTitle('Remove Endpoint')[0]);
    expect(
      screen.queryAllByText(PRESET_ENDPOINTS[0].name).find((el) => el.tagName === 'DIV')
    ).toBeUndefined();

    vi.spyOn(window, 'confirm').mockReturnValue(false);
    await userEvent.click(screen.getByText('Reset Defaults'));
    expect(
      screen.queryAllByText(PRESET_ENDPOINTS[0].name).find((el) => el.tagName === 'DIV')
    ).toBeUndefined();

    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await userEvent.click(screen.getByText('Reset Defaults'));
    expect(endpointRow(PRESET_ENDPOINTS[0].name)).toBeTruthy();
  });

  test('switching the DSO environment updates DsoExplorer and persists to localStorage', async () => {
    render(<App />);
    await userEvent.click(screen.getByTitle('DSO Explorer'));
    expect(screen.getByText('DsoExplorer:pre')).toBeTruthy();

    await userEvent.click(screen.getByTitle('Settings'));
    await userEvent.click(screen.getByText('Production'));

    expect(screen.getByText('DsoExplorer:prod')).toBeTruthy();
    expect(localStorage.getItem('lde_dso_env')).toBe('prod');
  });
});

describe('App — cache refresh (Orchestration view)', () => {
  test('Refresh Cache clears the backend cache then briefly re-mounts ChainBuilder with a fresh endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);

    await userEvent.click(screen.getByTitle('DMN Orchestration'));
    await userEvent.click(screen.getByText('Refresh Cache'));

    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/cache/clear?endpoint='), {
      method: 'DELETE',
    });
    await waitFor(() =>
      expect(screen.getByText(`ChainBuilder:${PRESET_ENDPOINTS[1]?.url}`)).toBeTruthy()
    );
  });

  test('a failed cache-clear request sets an error, but it stays invisible until leaving Orchestration', async () => {
    // The error overlay lives inside the "Right Panel", which is itself hidden
    // while viewMode === ORCHESTRATION (App.tsx's own exclusion list) — so a
    // cache-clear failure has no visible surface on the view that triggered it.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    render(<App />);

    await userEvent.click(screen.getByTitle('DMN Orchestration'));
    await userEvent.click(screen.getByText('Refresh Cache'));
    await waitFor(() => expect(screen.getByText('Refresh Cache')).toBeTruthy());
    expect(screen.queryByText('Failed to clear cache')).toBeNull();

    await userEvent.click(screen.getByTitle('SPARQL Editor'));
    expect(await screen.findByText('Failed to clear cache')).toBeTruthy();
  });
});

describe('App — CSV export', () => {
  test('Export CSV builds a download from the current results', async () => {
    const createObjectURL = vi.fn().mockReturnValue('blob:mock');
    const revokeObjectURL = vi.fn();
    global.URL.createObjectURL = createObjectURL;
    global.URL.revokeObjectURL = revokeObjectURL;
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    executeSparqlQuery.mockResolvedValue({
      head: { vars: ['s'] },
      results: { bindings: [{ s: { type: 'uri', value: 'http://a' } }] },
    });
    render(<App />);

    await userEvent.click(screen.getByText('Run Query'));
    await screen.findByText(/ResultsTable:/);
    await userEvent.click(screen.getByText('Export CSV'));

    expect(createObjectURL).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock');
  });
});
