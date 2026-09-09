// @vitest-environment jsdom
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';

const searchBegrippen = vi.fn();
const zoekWerkzaamheden = vi.fn();
const suggereerWerkzaamheden = vi.fn();
const getWerkzaamheidDetail = vi.fn();
const getActiviteiten = vi.fn();
const getActiviteitenByOin = vi.fn();
const getActiviteitDetail = vi.fn();
const fetchToepasbareRegels = vi.fn();
const fetchFormScaffold = vi.fn();
const saveForm = vi.fn();

vi.mock('../../services/dsoService', async () => {
  const actual = await vi.importActual<typeof import('../../services/dsoService')>(
    '../../services/dsoService'
  );
  return {
    ...actual,
    searchBegrippen: (...args: unknown[]) => searchBegrippen(...args),
    zoekWerkzaamheden: (...args: unknown[]) => zoekWerkzaamheden(...args),
    suggereerWerkzaamheden: (...args: unknown[]) => suggereerWerkzaamheden(...args),
    getWerkzaamheidDetail: (...args: unknown[]) => getWerkzaamheidDetail(...args),
    getActiviteiten: (...args: unknown[]) => getActiviteiten(...args),
    getActiviteitenByOin: (...args: unknown[]) => getActiviteitenByOin(...args),
    getActiviteitDetail: (...args: unknown[]) => getActiviteitDetail(...args),
    fetchToepasbareRegels: (...args: unknown[]) => fetchToepasbareRegels(...args),
    fetchFormScaffold: (...args: unknown[]) => fetchFormScaffold(...args),
  };
});

vi.mock('../../services/formService', () => ({
  FormService: { saveForm: (...args: unknown[]) => saveForm(...args) },
}));

import DsoExplorer from './DsoExplorer';

function emptyResult() {
  return { items: [], page: { number: 1, size: 10 }, hasNext: false };
}

afterEach(() => {
  vi.restoreAllMocks();
  searchBegrippen.mockReset();
  zoekWerkzaamheden.mockReset();
  suggereerWerkzaamheden.mockReset();
  getWerkzaamheidDetail.mockReset();
  getActiviteiten.mockReset();
  getActiviteitenByOin.mockReset();
  getActiviteitDetail.mockReset();
  fetchToepasbareRegels.mockReset();
  fetchFormScaffold.mockReset();
  saveForm.mockReset();
});

describe('DsoExplorer — shell', () => {
  test('defaults to the Concepts tab and shows the pre-production badge', async () => {
    searchBegrippen.mockResolvedValue(emptyResult());
    render(<DsoExplorer />);

    expect(await screen.findByPlaceholderText('Search concepts…')).toBeTruthy();
    expect(screen.getByText('pre-production')).toBeTruthy();
  });

  test('renders the production badge when env="prod"', async () => {
    searchBegrippen.mockResolvedValue(emptyResult());
    render(<DsoExplorer env="prod" />);

    expect(await screen.findByText('production')).toBeTruthy();
  });

  test('switches to the Works and Activities tabs', async () => {
    searchBegrippen.mockResolvedValue(emptyResult());
    zoekWerkzaamheden.mockResolvedValue(emptyResult());
    getActiviteiten.mockResolvedValue(emptyResult());
    render(<DsoExplorer />);
    await screen.findByPlaceholderText('Search concepts…');

    await userEvent.click(screen.getByRole('button', { name: /Works/ }));
    expect(await screen.findByPlaceholderText('Search werkzaamheden…')).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: /Activities/ }));
    expect(await screen.findByText('Valid on')).toBeTruthy();
  });
});

describe('DsoExplorer — Concepts (Begrippen) tab', () => {
  test('loads on mount and renders results', async () => {
    searchBegrippen.mockResolvedValue({
      items: [{ uri: 'x1', naam: 'Bouwwerk', definitie: 'Een gebouwd object' }],
      page: { number: 1, size: 10 },
      hasNext: false,
    });
    render(<DsoExplorer />);

    expect(await screen.findByText('Bouwwerk')).toBeTruthy();
    expect(searchBegrippen).toHaveBeenCalledWith('', 1, 'pre');
  });

  test('shows an empty-state message when there are no results', async () => {
    searchBegrippen.mockResolvedValue(emptyResult());
    render(<DsoExplorer />);
    expect(await screen.findByText('No concepts found.')).toBeTruthy();
  });

  test('shows the error message when the search fails', async () => {
    searchBegrippen.mockRejectedValue(new Error('HTTP 500'));
    render(<DsoExplorer />);
    expect(await screen.findByText('HTTP 500')).toBeTruthy();
  });

  test('typing a term and clicking Search re-queries with it', async () => {
    searchBegrippen.mockResolvedValue(emptyResult());
    render(<DsoExplorer />);
    await screen.findByText('No concepts found.');

    await userEvent.type(screen.getByPlaceholderText('Search concepts…'), 'bouwwerk');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));

    expect(searchBegrippen).toHaveBeenLastCalledWith('bouwwerk', 1, 'pre');
  });

  test('pressing Enter also triggers a search', async () => {
    searchBegrippen.mockResolvedValue(emptyResult());
    render(<DsoExplorer />);
    await screen.findByText('No concepts found.');

    await userEvent.type(screen.getByPlaceholderText('Search concepts…'), 'kap{Enter}');
    expect(searchBegrippen).toHaveBeenLastCalledWith('kap', 1, 'pre');
  });

  test('pagination: prev disabled on page 1, next disabled without hasNext, next advances the page', async () => {
    searchBegrippen.mockResolvedValue({
      items: [{ uri: 'x1', naam: 'Bouwwerk' }],
      page: { number: 1, size: 1 },
      hasNext: true,
    });
    render(<DsoExplorer />);
    await screen.findByText('Bouwwerk');

    expect(screen.getByText('Page 1')).toBeTruthy();
    const [prev, next] = screen.getAllByRole('button').slice(-2);
    expect(prev).toBeDisabled();
    expect(next).not.toBeDisabled();

    searchBegrippen.mockResolvedValue({
      items: [{ uri: 'x2', naam: 'Werk' }],
      page: { number: 2, size: 1 },
      hasNext: false,
    });
    await userEvent.click(next);
    expect(await screen.findByText('Page 2')).toBeTruthy();
    expect(searchBegrippen).toHaveBeenLastCalledWith('', 2, 'pre');
  });
});

describe('DsoExplorer — Works (Werkzaamheden) tab', () => {
  async function openWorksTab() {
    searchBegrippen.mockResolvedValue(emptyResult());
    zoekWerkzaamheden.mockResolvedValue(emptyResult());
    render(<DsoExplorer />);
    await screen.findByPlaceholderText('Search concepts…');
    await userEvent.click(screen.getByRole('button', { name: /Works/ }));
    await screen.findByPlaceholderText('Search werkzaamheden…');
  }

  test('loads on mount and renders results', async () => {
    zoekWerkzaamheden.mockResolvedValue({
      items: [{ urn: 'w1', omschrijving: 'Kappen' }],
      page: { number: 1, size: 10 },
      hasNext: false,
    });
    searchBegrippen.mockResolvedValue(emptyResult());
    render(<DsoExplorer />);
    await screen.findByPlaceholderText('Search concepts…');
    await userEvent.click(screen.getByRole('button', { name: /Works/ }));

    expect(await screen.findByText('Kappen')).toBeTruthy();
  });

  test('shows an empty-state message when there are no results', async () => {
    await openWorksTab();
    expect(await screen.findByText('No werkzaamheden found.')).toBeTruthy();
  });

  test('selecting a result opens its detail panel with version info', async () => {
    zoekWerkzaamheden.mockResolvedValue({
      items: [{ urn: 'w1', omschrijving: 'Kappen' }],
      page: { number: 1, size: 10 },
      hasNext: false,
    });
    getWerkzaamheidDetail.mockResolvedValue([
      { urn: 'w1', omschrijving: 'Kappen', beginDatum: '2026-01-01' },
    ]);
    searchBegrippen.mockResolvedValue(emptyResult());
    render(<DsoExplorer />);
    await screen.findByPlaceholderText('Search concepts…');
    await userEvent.click(screen.getByRole('button', { name: /Works/ }));
    await userEvent.click(await screen.findByText('Kappen'));

    expect(await screen.findByText('Werkzaamheid detail')).toBeTruthy();
    expect(getWerkzaamheidDetail).toHaveBeenCalledWith('w1', 'pre');
  });

  test('pagination behaves the same as the Concepts tab', async () => {
    zoekWerkzaamheden.mockResolvedValue({
      items: [{ urn: 'w1', omschrijving: 'Kappen' }],
      page: { number: 1, size: 1 },
      hasNext: true,
    });
    searchBegrippen.mockResolvedValue(emptyResult());
    render(<DsoExplorer />);
    await screen.findByPlaceholderText('Search concepts…');
    await userEvent.click(screen.getByRole('button', { name: /Works/ }));
    await screen.findByText('Kappen');

    expect(screen.getByText('Page 1')).toBeTruthy();
  });
});

describe('DsoExplorer — Activities tab', () => {
  async function openActivitiesTab() {
    searchBegrippen.mockResolvedValue(emptyResult());
    getActiviteiten.mockResolvedValue(emptyResult());
    render(<DsoExplorer />);
    await screen.findByPlaceholderText('Search concepts…');
    await userEvent.click(screen.getByRole('button', { name: /Activities/ }));
    await screen.findByText('Valid on');
  }

  test('loads on mount and renders results', async () => {
    getActiviteiten.mockResolvedValue({
      items: [{ urn: 'a1', omschrijving: 'Kapvergunning' }],
      page: { number: 1, size: 10 },
      hasNext: false,
    });
    searchBegrippen.mockResolvedValue(emptyResult());
    render(<DsoExplorer />);
    await screen.findByPlaceholderText('Search concepts…');
    await userEvent.click(screen.getByRole('button', { name: /Activities/ }));

    expect(await screen.findByText('Kapvergunning')).toBeTruthy();
  });

  test('a location preset switches to OIN mode and reveals the name filter', async () => {
    getActiviteitenByOin.mockResolvedValue({
      items: [{ urn: 'a1', omschrijving: 'Kapvergunning' }],
      page: { number: 1, size: 10 },
      hasNext: false,
    });
    await openActivitiesTab();

    await userEvent.click(screen.getByRole('button', { name: 'Lelystad' }));

    expect(await screen.findByPlaceholderText(/Filter Lelystad activities/)).toBeTruthy();
    expect(getActiviteitenByOin).toHaveBeenCalledWith(
      '00000001005024249000',
      'pre',
      expect.any(String)
    );
  });

  test('the name filter narrows the OIN-mode result set client-side', async () => {
    getActiviteitenByOin.mockResolvedValue({
      items: [
        { urn: 'a1', omschrijving: 'Kapvergunning' },
        { urn: 'a2', omschrijving: 'Bouwvergunning' },
      ],
      page: { number: 1, size: 10 },
      hasNext: false,
    });
    await openActivitiesTab();
    await userEvent.click(screen.getByRole('button', { name: 'Lelystad' }));
    await screen.findByText('Kapvergunning');

    await userEvent.type(screen.getByPlaceholderText(/Filter Lelystad activities/), 'Kap');

    expect(screen.getByText('Kapvergunning')).toBeTruthy();
    expect(screen.queryByText('Bouwvergunning')).toBeNull();
  });

  test('pasting a URN and pressing Enter opens the detail panel directly', async () => {
    getActiviteitDetail.mockResolvedValue({
      urn: 'urn:manual',
      omschrijving: 'Manual activity',
      verfijnbaar: false,
    });
    await openActivitiesTab();

    await userEvent.type(
      screen.getByPlaceholderText('Paste URN to inspect directly…'),
      'urn:manual{Enter}'
    );

    expect(await screen.findByText('Manual activity')).toBeTruthy();
    expect(getActiviteitDetail).toHaveBeenCalledWith('urn:manual', undefined, 'pre');
  });

  test('selecting an activity shows its detail: authority, validity, refinable, and rule types', async () => {
    getActiviteiten.mockResolvedValue({
      items: [{ urn: 'a1', omschrijving: 'Kapvergunning' }],
      page: { number: 1, size: 10 },
      hasNext: false,
    });
    getActiviteitDetail.mockResolvedValue({
      urn: 'a1',
      omschrijving: 'Kapvergunning',
      beginDatum: '2020-01-01',
      verfijnbaar: true,
      bestuursorgaan: {
        oin: '00000001005024249000',
        organisatieType: 'GM',
        organisatieCode: '0995',
        bestuurslaag: 'Gemeente',
      },
      regelBeheerObjecten: [{ typering: 'conclusie', functioneleStructuurRef: 'fs-1' }],
    });
    fetchToepasbareRegels.mockResolvedValue({ items: [] });
    searchBegrippen.mockResolvedValue(emptyResult());
    render(<DsoExplorer />);
    await screen.findByPlaceholderText('Search concepts…');
    await userEvent.click(screen.getByRole('button', { name: /Activities/ }));
    await userEvent.click(await screen.findByText('Kapvergunning'));

    expect(await screen.findByText('Activity detail')).toBeTruthy();
    expect(screen.getByText('Yes', { selector: 'strong' })).toBeTruthy();
    expect(screen.getAllByText('Decision criteria').length).toBeGreaterThan(0);
  });

  test('a "conclusie" applicable rule offers STTR, Extract DMN, and Publish via CPSV Editor links', async () => {
    getActiviteiten.mockResolvedValue({
      items: [{ urn: 'a1', omschrijving: 'Kapvergunning' }],
      page: { number: 1, size: 10 },
      hasNext: false,
    });
    getActiviteitDetail.mockResolvedValue({
      urn: 'a1',
      omschrijving: 'Kapvergunning',
      verfijnbaar: true,
      regelBeheerObjecten: [{ typering: 'conclusie', functioneleStructuurRef: 'fs-1' }],
    });
    fetchToepasbareRegels.mockResolvedValue({
      items: [{ identifier: 42, sttrVersie: 1 }],
    });
    searchBegrippen.mockResolvedValue(emptyResult());
    render(<DsoExplorer />);
    await screen.findByPlaceholderText('Search concepts…');
    await userEvent.click(screen.getByRole('button', { name: /Activities/ }));
    await userEvent.click(await screen.findByText('Kapvergunning'));

    expect(await screen.findByText('↓ STTR')).toBeTruthy();
    expect(screen.getByText('↓ Extract DMN')).toBeTruthy();
    expect(screen.getByText('Publish via CPSV Editor')).toBeTruthy();
  });

  test('an "indieningsvereisten" rule\'s "Import into LDE" saves a form and flips to "Imported"', async () => {
    getActiviteiten.mockResolvedValue({
      items: [{ urn: 'a1', omschrijving: 'Kapvergunning' }],
      page: { number: 1, size: 10 },
      hasNext: false,
    });
    getActiviteitDetail.mockResolvedValue({
      urn: 'a1',
      omschrijving: 'Kapvergunning',
      verfijnbaar: true,
      regelBeheerObjecten: [{ typering: 'indieningsvereisten', functioneleStructuurRef: 'fs-2' }],
    });
    fetchToepasbareRegels.mockResolvedValue({ items: [{ identifier: 7 }] });
    fetchFormScaffold.mockResolvedValue({ id: 'scaffold-1', components: [], type: 'default' });
    searchBegrippen.mockResolvedValue(emptyResult());
    render(<DsoExplorer />);
    await screen.findByPlaceholderText('Search concepts…');
    await userEvent.click(screen.getByRole('button', { name: /Activities/ }));
    await userEvent.click(await screen.findByText('Kapvergunning'));

    await userEvent.click(await screen.findByText(/Import into LDE/));

    expect(await screen.findByText('Imported')).toBeTruthy();
    expect(saveForm).toHaveBeenCalledWith(expect.objectContaining({ id: 'form_dso_7' }));
  });

  test('child activities can be navigated into, updating the detail panel', async () => {
    getActiviteiten.mockResolvedValue({
      items: [{ urn: 'a1', omschrijving: 'Parent activity' }],
      page: { number: 1, size: 10 },
      hasNext: false,
    });
    getActiviteitDetail.mockImplementation(async (urn: string) => {
      if (urn === 'a1') {
        return {
          urn: 'a1',
          omschrijving: 'Parent activity',
          verfijnbaar: false,
          _links: { onderliggendeActiviteiten: [{ href: 'https://x/activiteiten/child-1' }] },
        };
      }
      return { urn: 'child-1', omschrijving: 'Child activity', verfijnbaar: false };
    });
    searchBegrippen.mockResolvedValue(emptyResult());
    render(<DsoExplorer />);
    await screen.findByPlaceholderText('Search concepts…');
    await userEvent.click(screen.getByRole('button', { name: /Activities/ }));
    await userEvent.click(await screen.findByText('Parent activity'));
    await screen.findByText('Activity detail');

    const childLink = await screen.findByText('Child activity');
    await userEvent.click(childLink);

    expect(getActiviteitDetail).toHaveBeenCalledWith('child-1', undefined, 'pre');
  });
});

// ─── Shared helpers for the added suites ────────────────────────────────────

async function openTab(name: RegExp | string) {
  searchBegrippen.mockResolvedValue(emptyResult());
  render(<DsoExplorer />);
  await screen.findByPlaceholderText('Search concepts…');
  if (name !== 'Concepts') {
    await userEvent.click(screen.getByRole('button', { name }));
  }
}

describe('DsoExplorer — concept cards', () => {
  test('renders validity date, definition, and keywords', async () => {
    searchBegrippen.mockResolvedValue({
      items: [
        {
          uri: 'urn:begrip:1',
          naam: 'Kapvergunning',
          definitie: 'Toestemming om te kappen',
          begindatumGeldigheid: '2024-01-01',
          trefwoorden: ['kap', 'boom', 'vergunning', 'groen', 'natuur', 'extra'],
        },
      ],
      page: { number: 1, size: 10 },
      hasNext: false,
    });
    render(<DsoExplorer />);

    expect(await screen.findByText('Kapvergunning')).toBeTruthy();
    expect(screen.getByText('Toestemming om te kappen')).toBeTruthy();
    expect(screen.getByText('2024-01-01')).toBeTruthy();
    // Only the first five keywords are shown.
    expect(screen.getByText('natuur')).toBeTruthy();
    expect(screen.queryByText('extra')).toBeNull();
  });

  test('falls back to the explanation when no definition is given', async () => {
    searchBegrippen.mockResolvedValue({
      items: [{ uri: 'urn:begrip:2', naam: 'Boom', uitleg: 'Een houtachtig gewas' }],
      page: { number: 1, size: 10 },
      hasNext: false,
    });
    render(<DsoExplorer />);

    expect(await screen.findByText('Een houtachtig gewas')).toBeTruthy();
  });

  test('prefers the definition over the explanation when both are present', async () => {
    searchBegrippen.mockResolvedValue({
      items: [
        { uri: 'urn:begrip:3', naam: 'Boom', definitie: 'De definitie', uitleg: 'De uitleg' },
      ],
      page: { number: 1, size: 10 },
      hasNext: false,
    });
    render(<DsoExplorer />);

    expect(await screen.findByText('De definitie')).toBeTruthy();
    expect(screen.queryByText('De uitleg')).toBeNull();
  });

  test('renders a bare concept with neither dates, text nor keywords', async () => {
    searchBegrippen.mockResolvedValue({
      items: [{ uri: 'urn:begrip:4', naam: 'Kaal begrip', trefwoorden: [] }],
      page: { number: 1, size: 10 },
      hasNext: false,
    });
    render(<DsoExplorer />);

    expect(await screen.findByText('Kaal begrip')).toBeTruthy();
    expect(screen.getByTitle('urn:begrip:4')).toBeTruthy();
  });

  test('a non-Error rejection surfaces the generic failure message', async () => {
    searchBegrippen.mockRejectedValue('boom');
    render(<DsoExplorer />);

    expect(await screen.findByText('Failed to load')).toBeTruthy();
  });
});

describe('DsoExplorer — Works detail panel', () => {
  async function openWithDetail(versies: unknown[]) {
    zoekWerkzaamheden.mockResolvedValue({
      items: [{ urn: 'urn:w:1', omschrijving: 'Kappen', functioneleStructuurRef: 'fs-1' }],
      page: { number: 1, size: 20 },
      hasNext: false,
    });
    getWerkzaamheidDetail.mockResolvedValue(versies);
    await openTab(/Works/);
    await userEvent.click(await screen.findByText('Kappen'));
  }

  test('shows the open version, its keywords and its relations', async () => {
    await openWithDetail([
      {
        urn: 'urn:w:1',
        omschrijving: 'Kappen van een boom',
        beginDatum: '2024-01-01',
        eindDatum: null,
        trefwoorden: ['kap', 'boom'],
        logischeRelaties: [{ urn: 'urn:rel:1', omschrijving: 'Snoeien' }, { urn: 'urn:rel:2' }],
      },
    ]);

    expect(await screen.findByText('Kappen van een boom')).toBeTruthy();
    expect(screen.getByText('∞')).toBeTruthy();
    expect(screen.getByText('kap')).toBeTruthy();
    expect(screen.getByText('Related werkzaamheden (2)')).toBeTruthy();
    expect(screen.getByText('Snoeien')).toBeTruthy();
    expect(screen.getByText('urn:rel:2')).toBeTruthy();
  });

  test('falls back to the first version when every version has ended', async () => {
    await openWithDetail([
      {
        urn: 'urn:w:1',
        omschrijving: 'Oude versie',
        beginDatum: '2020-01-01',
        eindDatum: '2022-01-01',
      },
      {
        urn: 'urn:w:1',
        omschrijving: 'Nog oudere',
        beginDatum: '2018-01-01',
        eindDatum: '2020-01-01',
      },
    ]);

    expect((await screen.findAllByText('Oude versie')).length).toBeGreaterThan(0);
    expect(screen.getByText('Version history (2)')).toBeTruthy();
    expect(screen.getAllByText(/2022-01-01/).length).toBeGreaterThan(0);
  });

  test('marks the still-open version as current in the history list', async () => {
    await openWithDetail([
      { urn: 'urn:w:1', omschrijving: 'Huidig', beginDatum: '2024-01-01', eindDatum: null },
      { urn: 'urn:w:1', omschrijving: 'Vorig', beginDatum: '2020-01-01', eindDatum: '2024-01-01' },
    ]);

    expect(await screen.findByText('current')).toBeTruthy();
  });

  test('shows the detail error when the lookup fails', async () => {
    zoekWerkzaamheden.mockResolvedValue({
      items: [{ urn: 'urn:w:1', omschrijving: 'Kappen' }],
      page: { number: 1, size: 20 },
      hasNext: false,
    });
    getWerkzaamheidDetail.mockRejectedValue(new Error('detail unavailable'));
    await openTab(/Works/);
    await userEvent.click(await screen.findByText('Kappen'));

    expect(await screen.findByText('detail unavailable')).toBeTruthy();
  });

  test('closing the detail panel returns to the list only', async () => {
    await openWithDetail([
      { urn: 'urn:w:1', omschrijving: 'Kappen van een boom', beginDatum: '2024-01-01' },
    ]);
    await screen.findByText('Werkzaamheid detail');

    await userEvent.click(
      screen.getByText('Werkzaamheid detail').nextElementSibling as HTMLElement
    );

    expect(screen.queryByText('Werkzaamheid detail')).toBeNull();
  });

  test('clicking the selected row again deselects it', async () => {
    await openWithDetail([
      { urn: 'urn:w:1', omschrijving: 'Kappen van een boom', beginDatum: '2024-01-01' },
    ]);
    await screen.findByText('Werkzaamheid detail');

    await userEvent.click(screen.getByText('Kappen'));

    expect(screen.queryByText('Werkzaamheid detail')).toBeNull();
  });

  test('a row falls back to its URN when it carries no description', async () => {
    zoekWerkzaamheden.mockResolvedValue({
      items: [{ urn: 'urn:w:bare' }],
      page: { number: 1, size: 20 },
      hasNext: false,
    });
    await openTab(/Works/);

    expect((await screen.findAllByText('urn:w:bare')).length).toBeGreaterThan(0);
  });

  test('the search error is surfaced above the list', async () => {
    zoekWerkzaamheden.mockRejectedValue(new Error('werk search down'));
    await openTab(/Works/);

    expect(await screen.findByText('werk search down')).toBeTruthy();
  });
});

describe('DsoExplorer — Works suggestions', () => {
  test('typing two or more characters shows suggestions, and picking one searches', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    zoekWerkzaamheden.mockResolvedValue(emptyResult());
    suggereerWerkzaamheden.mockResolvedValue(['kappen', 'kapvergunning']);
    await openTab(/Works/);
    await screen.findByPlaceholderText('Search werkzaamheden…');

    await userEvent.type(screen.getByPlaceholderText('Search werkzaamheden…'), 'ka');
    await act(() => vi.advanceTimersByTimeAsync(300));

    expect(await screen.findByRole('button', { name: 'kapvergunning' })).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'kapvergunning' }));

    expect(zoekWerkzaamheden).toHaveBeenLastCalledWith('kapvergunning', 1, 'pre');
    vi.useRealTimers();
  });

  test('a single character does not trigger a suggestion lookup', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    zoekWerkzaamheden.mockResolvedValue(emptyResult());
    await openTab(/Works/);
    await screen.findByPlaceholderText('Search werkzaamheden…');

    await userEvent.type(screen.getByPlaceholderText('Search werkzaamheden…'), 'k');
    await act(() => vi.advanceTimersByTimeAsync(500));

    expect(suggereerWerkzaamheden).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  test('an empty suggestion list leaves the dropdown closed', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    zoekWerkzaamheden.mockResolvedValue(emptyResult());
    suggereerWerkzaamheden.mockResolvedValue([]);
    await openTab(/Works/);
    await screen.findByPlaceholderText('Search werkzaamheden…');

    await userEvent.type(screen.getByPlaceholderText('Search werkzaamheden…'), 'ka');
    await act(() => vi.advanceTimersByTimeAsync(300));

    expect(screen.queryByRole('button', { name: 'kappen' })).toBeNull();
    vi.useRealTimers();
  });

  test('Escape dismisses the suggestion dropdown', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    zoekWerkzaamheden.mockResolvedValue(emptyResult());
    suggereerWerkzaamheden.mockResolvedValue(['kappen']);
    await openTab(/Works/);
    const field = await screen.findByPlaceholderText('Search werkzaamheden…');

    await userEvent.type(field, 'ka');
    await act(() => vi.advanceTimersByTimeAsync(300));
    await screen.findByRole('button', { name: 'kappen' });

    await userEvent.type(field, '{Escape}');

    expect(screen.queryByRole('button', { name: 'kappen' })).toBeNull();
    vi.useRealTimers();
  });
});

describe('DsoExplorer — activity detail', () => {
  async function openActivities() {
    getActiviteiten.mockResolvedValue(emptyResult());
    await openTab(/Activities/);
    await screen.findByText('Valid on');
  }

  async function inspect(urn: string) {
    await userEvent.type(
      screen.getByPlaceholderText('Paste URN to inspect directly…'),
      `${urn}{Enter}`
    );
  }

  test('an activity with no description shows a placeholder and no-rules notice', async () => {
    getActiviteitDetail.mockResolvedValue({ urn: 'urn:a:1', verfijnbaar: true });
    await openActivities();

    await inspect('urn:a:1');

    expect(await screen.findByText('No description')).toBeTruthy();
    expect(screen.getByText('None registered')).toBeTruthy();
    expect(screen.getByText('Yes')).toBeTruthy();
    expect(screen.getByText('—')).toBeTruthy();
  });

  test('a parent link can be navigated into', async () => {
    getActiviteitDetail
      .mockResolvedValueOnce({
        urn: 'urn:a:child',
        omschrijving: 'Child activity',
        verfijnbaar: false,
        _links: {
          bovenliggendeActiviteit: { href: 'https://dso.example/activiteiten/urn%3Aa%3Aparent' },
        },
      })
      .mockResolvedValue({
        urn: 'urn:a:parent',
        omschrijving: 'Parent activity',
        verfijnbaar: false,
      });
    await openActivities();

    await inspect('urn:a:child');
    await screen.findByText('Parent activity');

    await userEvent.click(screen.getByRole('button', { name: 'urn:a:parent' }));

    expect(await screen.findByText('Parent activity', { selector: 'p' })).toBeTruthy();
  });

  test('a child whose name cannot be resolved falls back to its URN', async () => {
    getActiviteitDetail.mockImplementation(async (urn: string) => {
      if (urn === 'urn:a:root') {
        return {
          urn: 'urn:a:root',
          omschrijving: 'Root',
          verfijnbaar: false,
          _links: {
            onderliggendeActiviteiten: [{ href: 'https://dso.example/activiteiten/urn%3Aa%3Akid' }],
          },
        };
      }
      throw new Error('child lookup failed');
    });
    await openActivities();

    await inspect('urn:a:root');

    expect(await screen.findByText('Child activities (1)')).toBeTruthy();
    expect(screen.getByText('urn:a:kid')).toBeTruthy();
  });

  test('a 404 is rephrased as an environment-specific message', async () => {
    getActiviteitDetail.mockRejectedValue(new Error('HTTP 404'));
    await openActivities();

    await inspect('urn:a:gone');

    expect(
      await screen.findByText(/not available in the pre-production DSO environment/)
    ).toBeTruthy();
  });

  test('a 404 names the production environment when env="prod"', async () => {
    searchBegrippen.mockResolvedValue(emptyResult());
    getActiviteiten.mockResolvedValue(emptyResult());
    getActiviteitDetail.mockRejectedValue(new Error('HTTP 404'));
    render(<DsoExplorer env="prod" />);
    await screen.findByPlaceholderText('Search concepts…');
    await userEvent.click(screen.getByRole('button', { name: /Activities/ }));
    await screen.findByText('Valid on');

    await inspect('urn:a:gone');

    expect(await screen.findByText(/not available in the production DSO environment/)).toBeTruthy();
  });

  test('a non-404 error is shown verbatim', async () => {
    getActiviteitDetail.mockRejectedValue(new Error('gateway timeout'));
    await openActivities();

    await inspect('urn:a:slow');

    expect(await screen.findByText('gateway timeout')).toBeTruthy();
  });

  test('locations and an unknown rule typering are rendered', async () => {
    fetchToepasbareRegels.mockResolvedValue({ items: [] });
    getActiviteitDetail.mockResolvedValue({
      urn: 'urn:a:2',
      omschrijving: 'Met locaties',
      verfijnbaar: false,
      beginDatum: '2024-01-01',
      eindDatum: '2030-01-01',
      regelBeheerObjecten: [{ typering: 'onbekend', functioneleStructuurRef: 'fs-x' }],
      locaties: [{ identificatie: 'loc-1' }, { identificatie: 'loc-2' }],
    });
    await openActivities();

    await inspect('urn:a:2');

    expect(await screen.findByText('Locations (2)')).toBeTruthy();
    expect(screen.getByText('loc-1')).toBeTruthy();
    expect(screen.getByText('onbekend')).toBeTruthy();
    expect(screen.getByText('2030-01-01')).toBeTruthy();
  });

  test('an authority outside the known presets is labelled by its bare code', async () => {
    fetchToepasbareRegels.mockResolvedValue({
      items: [{ identifier: 7, begindatum: '2024-02-01', sttrVersie: 3 }],
    });
    getActiviteitDetail.mockResolvedValue({
      urn: 'urn:a:3',
      omschrijving: 'Elders',
      verfijnbaar: false,
      bestuursorgaan: {
        oin: '99999999999999999999',
        bestuurslaag: 'gemeente',
        organisatieType: 'GM',
        organisatieCode: '0995',
      },
      regelBeheerObjecten: [{ typering: 'Conclusie', functioneleStructuurRef: 'fs-1' }],
    });
    await openActivities();

    await inspect('urn:a:3');

    expect((await screen.findAllByText('Decision criteria')).length).toBeGreaterThan(0);
    expect(screen.getByText(/Valid from:/)).toBeTruthy();
    expect(screen.getByText(/STTR version:/)).toBeTruthy();
    const publish = screen.getByRole('link', { name: /Publish via CPSV Editor/ });
    expect(publish.getAttribute('href')).toContain('authority=GM0995');
  });

  test('a rules lookup failure is shown inside the rule row', async () => {
    fetchToepasbareRegels.mockRejectedValue(new Error('rules unavailable'));
    getActiviteitDetail.mockResolvedValue({
      urn: 'urn:a:4',
      omschrijving: 'Met regels',
      verfijnbaar: false,
      regelBeheerObjecten: [{ typering: 'conclusie', functioneleStructuurRef: 'fs-1' }],
    });
    await openActivities();

    await inspect('urn:a:4');

    expect(await screen.findByText('rules unavailable')).toBeTruthy();
  });

  test('an empty rules list reports that none were found', async () => {
    fetchToepasbareRegels.mockResolvedValue({ items: [] });
    getActiviteitDetail.mockResolvedValue({
      urn: 'urn:a:5',
      omschrijving: 'Zonder regels',
      verfijnbaar: false,
      regelBeheerObjecten: [{ typering: 'conclusie', functioneleStructuurRef: 'fs-1' }],
    });
    await openActivities();

    await inspect('urn:a:5');

    expect(await screen.findByText('No toepasbare regels found.')).toBeTruthy();
  });

  test('a rule object without a functioneleStructuurRef is not offered as a candidate', async () => {
    getActiviteitDetail.mockResolvedValue({
      urn: 'urn:a:6',
      omschrijving: 'Zonder ref',
      verfijnbaar: false,
      regelBeheerObjecten: [{ typering: 'conclusie' }],
    });
    await openActivities();

    await inspect('urn:a:6');

    await screen.findByText('Rule types present');
    expect(screen.queryByText(/Applicable rules/)).toBeNull();
    expect(fetchToepasbareRegels).not.toHaveBeenCalled();
  });
});

describe('DsoExplorer — form scaffold actions', () => {
  async function openWithSubmissionRule() {
    getActiviteiten.mockResolvedValue(emptyResult());
    fetchToepasbareRegels.mockResolvedValue({ items: [{ identifier: 11 }] });
    getActiviteitDetail.mockResolvedValue({
      urn: 'urn:a:form',
      omschrijving: 'Aanvraag',
      verfijnbaar: false,
      regelBeheerObjecten: [{ typering: 'indieningsvereisten', functioneleStructuurRef: 'fs-1' }],
    });
    searchBegrippen.mockResolvedValue(emptyResult());
    render(<DsoExplorer />);
    await screen.findByPlaceholderText('Search concepts…');
    await userEvent.click(screen.getByRole('button', { name: /Activities/ }));
    await screen.findByText('Valid on');
    await userEvent.type(
      screen.getByPlaceholderText('Paste URN to inspect directly…'),
      'urn:a:form{Enter}'
    );
    await screen.findAllByText('Submission requirements');
  }

  test('downloading the scaffold builds a JSON blob', async () => {
    const createObjectURL = vi.fn().mockReturnValue('blob:mock');
    global.URL.createObjectURL = createObjectURL;
    global.URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    fetchFormScaffold.mockResolvedValue({ id: 'form-11', components: [] });

    await openWithSubmissionRule();
    await userEvent.click(screen.getByRole('button', { name: /Form scaffold/ }));

    await vi.waitFor(() => expect(createObjectURL).toHaveBeenCalled());
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    expect(JSON.parse(await blob.text())).toEqual({ id: 'form-11', components: [] });
  });

  test('a scaffold failure is reported next to the button', async () => {
    fetchFormScaffold.mockRejectedValue(new Error('scaffold unavailable'));

    await openWithSubmissionRule();
    await userEvent.click(screen.getByRole('button', { name: /Form scaffold/ }));

    expect(await screen.findByText('scaffold unavailable')).toBeTruthy();
  });

  test('an import failure is reported next to the button', async () => {
    fetchFormScaffold.mockRejectedValue(new Error('import blew up'));

    await openWithSubmissionRule();
    await userEvent.click(screen.getByRole('button', { name: /Import into LDE/ }));

    expect(await screen.findByText('import blew up')).toBeTruthy();
    expect(saveForm).not.toHaveBeenCalled();
  });

  test('the imported form is named after the activity and tagged Dutch', async () => {
    fetchFormScaffold.mockResolvedValue({ id: 'scaffold', components: [] });

    await openWithSubmissionRule();
    await userEvent.click(screen.getByRole('button', { name: /Import into LDE/ }));

    await vi.waitFor(() => expect(saveForm).toHaveBeenCalled());
    expect(saveForm).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'form_dso_11',
        name: 'Aanvraag — Submission requirements',
        language: 'nl',
        status: 'dso',
      })
    );
  });
});

describe('DsoExplorer — Activities toolbar', () => {
  async function openActivities() {
    getActiviteiten.mockResolvedValue(emptyResult());
    await openTab(/Activities/);
    await screen.findByText('Valid on');
  }

  test('a date is converted to the DSO day-month-year format on Load', async () => {
    await openActivities();

    const dateField = document.querySelector('input[type="date"]') as HTMLInputElement;
    await userEvent.type(dateField, '2026-03-14');
    await userEvent.click(screen.getByRole('button', { name: 'Load' }));

    await vi.waitFor(() =>
      expect(getActiviteiten).toHaveBeenLastCalledWith('14-03-2026', 1, 'pre')
    );
  });

  test('Load re-queries by OIN while a location preset is active', async () => {
    getActiviteitenByOin.mockResolvedValue(emptyResult());
    await openActivities();
    await userEvent.click(screen.getByRole('button', { name: 'Flevoland' }));
    getActiviteitenByOin.mockClear();

    await userEvent.click(screen.getByRole('button', { name: 'Load' }));

    await vi.waitFor(() => expect(getActiviteitenByOin).toHaveBeenCalled());
  });

  test('clicking the active preset again returns to the unfiltered list', async () => {
    getActiviteitenByOin.mockResolvedValue(emptyResult());
    await openActivities();

    await userEvent.click(screen.getByRole('button', { name: 'Ede' }));
    expect(await screen.findByPlaceholderText(/Filter Ede activities/)).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Ede' }));

    await vi.waitFor(() =>
      expect(screen.queryByPlaceholderText(/Filter Ede activities/)).toBeNull()
    );
  });

  test('the name filter can be cleared with its own button', async () => {
    getActiviteitenByOin.mockResolvedValue({
      items: [{ urn: 'a1', omschrijving: 'Kapvergunning' }],
      page: { number: 1, size: 10 },
      hasNext: false,
    });
    await openActivities();
    await userEvent.click(screen.getByRole('button', { name: 'Gelderland' }));
    await screen.findByText('Kapvergunning');

    await userEvent.type(screen.getByPlaceholderText(/Filter Gelderland/), 'zzz');
    expect(screen.getByText(/No activities matching/)).toBeTruthy();

    const clearFilter = screen
      .getByPlaceholderText(/Filter Gelderland/)
      .closest('div')!.parentElement!;
    await userEvent.click(within(clearFilter).getByRole('button', { name: 'Clear' }));

    expect(screen.getByText('Kapvergunning')).toBeTruthy();
  });

  test('an empty authority set gets its own message in OIN mode', async () => {
    getActiviteitenByOin.mockResolvedValue(emptyResult());
    await openActivities();

    await userEvent.click(screen.getByRole('button', { name: 'Lelystad' }));

    expect(
      await screen.findByText('No activities found for this authority on the selected date.')
    ).toBeTruthy();
  });

  test('OIN mode reports a count instead of a page number and hides pagination', async () => {
    getActiviteitenByOin.mockResolvedValue({
      items: [{ urn: 'a1', omschrijving: 'Kapvergunning' }],
      page: { number: 1, size: 10 },
      hasNext: true,
    });
    await openActivities();

    await userEvent.click(screen.getByRole('button', { name: 'Lelystad' }));

    expect(await screen.findByText('1 activities')).toBeTruthy();
    await userEvent.type(screen.getByPlaceholderText(/Filter Lelystad/), 'Kap');
    expect(screen.getByText('1 of 1 activities')).toBeTruthy();
  });

  test('the Inspect button opens the detail panel for a pasted URN', async () => {
    getActiviteitDetail.mockResolvedValue({
      urn: 'urn:manual',
      omschrijving: 'Manual activity',
      verfijnbaar: false,
    });
    await openActivities();

    const field = screen.getByPlaceholderText('Paste URN to inspect directly…');
    expect(screen.getByRole('button', { name: 'Inspect' })).toBeDisabled();

    await userEvent.type(field, 'urn:manual');
    await userEvent.click(screen.getByRole('button', { name: 'Inspect' }));

    expect(await screen.findByText('Manual activity')).toBeTruthy();
  });

  test('pressing Enter on a blank URN field does nothing', async () => {
    await openActivities();

    await userEvent.type(screen.getByPlaceholderText('Paste URN to inspect directly…'), '{Enter}');

    expect(screen.queryByText('Activity detail')).toBeNull();
  });

  test('a row shows its parent URN and can be deselected by clicking again', async () => {
    getActiviteiten.mockResolvedValue({
      items: [
        {
          urn: 'urn:a:kid',
          omschrijving: 'Kind',
          _links: {
            bovenliggendeActiviteit: { href: 'https://dso.example/activiteiten/urn%3Aa%3Aouder' },
          },
        },
      ],
      page: { number: 1, size: 10 },
      hasNext: false,
    });
    getActiviteitDetail.mockResolvedValue({
      urn: 'urn:a:kid',
      omschrijving: 'Kind',
      verfijnbaar: false,
    });
    await openTab(/Activities/);

    expect(await screen.findByText(/↳ urn:a:ouder/)).toBeTruthy();

    await userEvent.click(screen.getByText('Kind'));
    await screen.findByText('Activity detail');

    await userEvent.click(screen.getAllByText('Kind')[0]);
    await vi.waitFor(() => expect(screen.queryByText('Activity detail')).toBeNull());
  });

  test('the list error is surfaced when the activities query fails', async () => {
    getActiviteiten.mockRejectedValue(new Error('activities down'));
    await openTab(/Activities/);

    expect(await screen.findByText('activities down')).toBeTruthy();
  });

  test('paging forward reloads the list and clears the selection', async () => {
    getActiviteiten.mockResolvedValue({
      items: [{ urn: 'a1', omschrijving: 'Kapvergunning' }],
      page: { number: 1, size: 10 },
      hasNext: true,
    });
    await openTab(/Activities/);
    await screen.findByText('Kapvergunning');

    const [prev, next] = screen.getAllByRole('button').slice(-2);
    expect(prev).toBeDisabled();
    await userEvent.click(next);

    await vi.waitFor(() => expect(getActiviteiten).toHaveBeenLastCalledWith(undefined, 2, 'pre'));
    expect(screen.getByText('Page 2 · 1 items')).toBeTruthy();
  });
});
