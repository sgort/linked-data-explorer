// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
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
