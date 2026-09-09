// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';

import ArtefactListToolbar, { filterArtefacts } from './ArtefactListToolbar';

describe('ArtefactListToolbar', () => {
  test('renders the search value and the match/total count', () => {
    render(
      <ArtefactListToolbar
        search="zorg"
        onSearchChange={vi.fn()}
        languageFilter="all"
        onLanguageFilterChange={vi.fn()}
        matchCount={2}
        totalCount={5}
      />
    );

    expect(screen.getByPlaceholderText(/search name/i)).toHaveValue('zorg');
    expect(screen.getByText('2/5')).toBeTruthy();
  });

  test('omits the count when matchCount/totalCount are not provided', () => {
    render(
      <ArtefactListToolbar
        search=""
        onSearchChange={vi.fn()}
        languageFilter="all"
        onLanguageFilterChange={vi.fn()}
      />
    );
    expect(screen.queryByText(/\d+\/\d+/)).toBeNull();
  });

  test('the clear button only appears with a non-empty search, and clears it', async () => {
    const onSearchChange = vi.fn();
    const { rerender } = render(
      <ArtefactListToolbar
        search=""
        onSearchChange={onSearchChange}
        languageFilter="all"
        onLanguageFilterChange={vi.fn()}
      />
    );
    expect(screen.queryByTitle('Clear search')).toBeNull();

    rerender(
      <ArtefactListToolbar
        search="zorg"
        onSearchChange={onSearchChange}
        languageFilter="all"
        onLanguageFilterChange={vi.fn()}
      />
    );
    await userEvent.click(screen.getByTitle('Clear search'));
    expect(onSearchChange).toHaveBeenCalledWith('');
  });

  test('calls onLanguageFilterChange when the language filter changes', async () => {
    const onLanguageFilterChange = vi.fn();
    render(
      <ArtefactListToolbar
        search=""
        onSearchChange={vi.fn()}
        languageFilter="all"
        onLanguageFilterChange={onLanguageFilterChange}
      />
    );

    await userEvent.selectOptions(screen.getByTitle('Filter by language'), 'Untagged');
    expect(onLanguageFilterChange).toHaveBeenCalledWith('none');
  });
});

describe('filterArtefacts (pure)', () => {
  const items = [
    { name: 'Zorgtoeslag', description: 'AWIR toeslag', language: 'nl' },
    { name: 'Age verification', description: '', language: 'en' },
    { name: 'Untagged item', description: '' },
  ];

  test('returns everything when search is empty and filter is "all"', () => {
    expect(filterArtefacts(items, '', 'all')).toHaveLength(3);
  });

  test('filters by an explicit language code', () => {
    expect(filterArtefacts(items, '', 'nl')).toEqual([items[0]]);
  });

  test('"none" matches only items without a language tag', () => {
    expect(filterArtefacts(items, '', 'none')).toEqual([items[2]]);
  });

  test('search matches name or description, case-insensitively', () => {
    expect(filterArtefacts(items, 'ZORG', 'all')).toEqual([items[0]]);
    expect(filterArtefacts(items, 'awir', 'all')).toEqual([items[0]]);
  });

  test('search also checks extraSearchKeys when provided', () => {
    const result = filterArtefacts(items, 'shell', 'all', (item) =>
      item.name === 'Age verification' ? ['shell-process'] : []
    );
    expect(result).toEqual([items[1]]);
  });

  test('combines language filter and search', () => {
    expect(filterArtefacts(items, 'age', 'en')).toEqual([items[1]]);
    expect(filterArtefacts(items, 'age', 'nl')).toEqual([]);
  });
});
