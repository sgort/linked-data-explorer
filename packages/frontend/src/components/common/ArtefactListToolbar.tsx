// packages/frontend/src/components/common/ArtefactListToolbar.tsx
import { Search, X } from 'lucide-react';
import React from 'react';

import { LANGUAGE_OPTIONS, LanguageCode } from './LanguageSelector';

/** Filter value 'all' means no language filter; explicit codes narrow to that language.
 *  'none' matches only artefacts with no language tag (useful for cleanup). */
export type LanguageFilter = 'all' | 'none' | LanguageCode;

interface ArtefactListToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  languageFilter: LanguageFilter;
  onLanguageFilterChange: (value: LanguageFilter) => void;
  /** Optional total-match count; when provided, shown as a hint in the toolbar. */
  matchCount?: number;
  /** Optional total count before filtering, for "X of Y" display. */
  totalCount?: number;
}

const ArtefactListToolbar: React.FC<ArtefactListToolbarProps> = ({
  search,
  onSearchChange,
  languageFilter,
  onLanguageFilterChange,
  matchCount,
  totalCount,
}) => {
  return (
    <div className="px-3 py-2 border-b border-slate-200 bg-white space-y-2 shrink-0">
      {/* Search row */}
      <div className="relative">
        <Search
          size={12}
          className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
        />
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search name, description, key…"
          className="w-full pl-7 pr-7 py-1.5 border border-slate-300 rounded text-xs
                     focus:ring-2 focus:ring-indigo-500 focus:outline-none"
        />
        {search && (
          <button
            onClick={() => onSearchChange('')}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5
                       text-slate-400 hover:text-slate-700 rounded"
            title="Clear search"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/* Language filter + count row */}
      <div className="flex items-center gap-2">
        <select
          value={languageFilter}
          onChange={(e) => onLanguageFilterChange(e.target.value as LanguageFilter)}
          className="flex-1 px-2 py-1 border border-slate-300 rounded text-xs
                     focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
          title="Filter by language"
        >
          <option value="all">All languages</option>
          <option value="none">Untagged</option>
          {LANGUAGE_OPTIONS.map((opt) => (
            <option key={opt.code} value={opt.code}>
              {opt.label}
            </option>
          ))}
        </select>
        {typeof matchCount === 'number' && typeof totalCount === 'number' && (
          <span className="text-[10px] text-slate-500 font-mono shrink-0">
            {matchCount}/{totalCount}
          </span>
        )}
      </div>
    </div>
  );
};

export default ArtefactListToolbar;

/**
 * Utility — apply search + language filter to an array of artefacts.
 * Artefacts must expose `name` and optional `description`, `language`, plus whatever
 * search-key field the list cares about (passed via `extraSearchKeys`).
 */
// eslint-disable-next-line react-refresh/only-export-components
export function filterArtefacts<
  T extends { name: string; description?: string; language?: string },
>(
  items: T[],
  search: string,
  languageFilter: LanguageFilter,
  extraSearchKeys: (item: T) => string[] = () => []
): T[] {
  const q = search.trim().toLowerCase();

  return items.filter((item) => {
    // Language filter
    if (languageFilter === 'none') {
      if (item.language) return false;
    } else if (languageFilter !== 'all') {
      if (item.language !== languageFilter) return false;
    }

    // Search filter
    if (q === '') return true;
    const haystack = [item.name, item.description ?? '', ...extraSearchKeys(item)]
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  });
}
