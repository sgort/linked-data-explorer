// packages/frontend/src/components/DsoExplorer/DsoExplorer.tsx

import { BookOpen, ChevronLeft, ChevronRight, Loader2, Search, TreePine } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import {
  ActiviteitenResult,
  BegrippenResult,
  DsoActiviteit,
  DsoBegrip,
  getActiviteiten,
  searchBegrippen,
} from '../../services/dsoService';

type Tab = 'begrippen' | 'activiteiten';

// ── Concepts tab ────────────────────────────────────────────────────────────

const BegripCard: React.FC<{ begrip: DsoBegrip }> = ({ begrip }) => (
  <div className="bg-white border border-slate-200 rounded-lg p-4 hover:border-slate-300 transition-colors">
    <div className="flex items-start justify-between gap-2">
      <h3 className="font-semibold text-slate-800 text-sm">{begrip.naam}</h3>
      {begrip.begindatumGeldigheid && (
        <span className="text-[10px] text-slate-400 shrink-0 mt-0.5">
          {begrip.begindatumGeldigheid}
        </span>
      )}
    </div>
    {begrip.definitie && (
      <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">{begrip.definitie}</p>
    )}
    {begrip.uitleg && !begrip.definitie && (
      <p className="text-xs text-slate-500 mt-1.5 leading-relaxed italic">{begrip.uitleg}</p>
    )}
    {begrip.trefwoorden && begrip.trefwoorden.length > 0 && (
      <div className="flex flex-wrap gap-1 mt-2">
        {begrip.trefwoorden.slice(0, 5).map((t) => (
          <span key={t} className="px-1.5 py-0.5 bg-slate-100 text-slate-500 text-[10px] rounded">
            {t}
          </span>
        ))}
      </div>
    )}
    <p className="text-[10px] text-slate-300 font-mono mt-2 truncate" title={begrip.uri}>
      {begrip.uri}
    </p>
  </div>
);

const BegrippenTab: React.FC = () => {
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [result, setResult] = useState<BegrippenResult | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async (term: string, p: number) => {
    setLoading(true);
    setError(null);
    try {
      setResult(await searchBegrippen(term, p));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  // Load on mount with empty term to show something immediately
  useEffect(() => {
    load('', 1);
  }, [load]);

  const handleSearch = () => {
    setPage(1);
    setSubmitted(query);
    load(query, 1);
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  const goPage = (p: number) => {
    setPage(p);
    load(submitted, p);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Search bar */}
      <div className="p-4 border-b border-slate-200 bg-white flex gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Search concepts…"
            className="w-full pl-8 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
        </div>
        <button
          onClick={handleSearch}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          Search
        </button>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading && (
          <div className="flex items-center justify-center py-12 text-slate-400">
            <Loader2 size={20} className="animate-spin mr-2" />
            <span className="text-sm">Loading…</span>
          </div>
        )}
        {error && !loading && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}
        {!loading && !error && result && result.items.length === 0 && (
          <p className="text-center text-slate-400 text-sm py-12">No concepts found.</p>
        )}
        {!loading && !error && result?.items.map((b) => <BegripCard key={b.uri} begrip={b} />)}
      </div>

      {/* Pagination */}
      {result && (result.items.length > 0 || page > 1) && (
        <div className="p-3 border-t border-slate-200 bg-white flex items-center justify-between">
          <span className="text-xs text-slate-500">Page {page}</span>
          <div className="flex gap-1">
            <button
              onClick={() => goPage(page - 1)}
              disabled={page <= 1 || loading}
              className="p-1.5 rounded border border-slate-200 disabled:opacity-40 hover:bg-slate-50 transition-colors"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              onClick={() => goPage(page + 1)}
              disabled={!result.hasNext || loading}
              className="p-1.5 rounded border border-slate-200 disabled:opacity-40 hover:bg-slate-50 transition-colors"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Activities tab ───────────────────────────────────────────────────────────

const ActiviteitRow: React.FC<{ act: DsoActiviteit }> = ({ act }) => (
  <div className="bg-white border border-slate-200 rounded-lg p-3 hover:border-slate-300 transition-colors">
    <div className="flex items-start justify-between gap-2">
      <p className="text-sm font-medium text-slate-800 break-all">{act.naam ?? act.urn}</p>
      {act.begindatumJuridischeGeldigheid && (
        <span className="text-[10px] text-slate-400 shrink-0 mt-0.5">
          {act.begindatumJuridischeGeldigheid}
        </span>
      )}
    </div>
    {act.bovenliggendeActiviteit && (
      <p className="text-[10px] text-slate-400 font-mono mt-1 truncate">
        ↳ {act.bovenliggendeActiviteit.urn}
      </p>
    )}
    <p className="text-[10px] text-slate-300 font-mono mt-1 truncate" title={act.urn}>
      {act.urn}
    </p>
  </div>
);

const ActiviteitenTab: React.FC = () => {
  const [datum, setDatum] = useState('');
  const [result, setResult] = useState<ActiviteitenResult | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Convert yyyy-mm-dd (HTML date input) → dd-MM-yyyy (DSO format)
  const toDsoDate = (iso: string) => {
    if (!iso) return undefined;
    const [y, m, d] = iso.split('-');
    return `${d}-${m}-${y}`;
  };

  const load = useCallback(async (d: string, p: number) => {
    setLoading(true);
    setError(null);
    try {
      setResult(await getActiviteiten(toDsoDate(d), p));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  // Load on mount with today's date
  useEffect(() => {
    load('', 1);
  }, [load]);

  const handleLoad = () => {
    setPage(1);
    load(datum, 1);
  };

  const goPage = (p: number) => {
    setPage(p);
    load(datum, p);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Date bar */}
      <div className="p-4 border-b border-slate-200 bg-white flex gap-2 items-center">
        <label className="text-xs text-slate-500 shrink-0">Valid on</label>
        <input
          type="date"
          value={datum}
          onChange={(e) => setDatum(e.target.value)}
          className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
        />
        <button
          onClick={handleLoad}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          Load
        </button>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {loading && (
          <div className="flex items-center justify-center py-12 text-slate-400">
            <Loader2 size={20} className="animate-spin mr-2" />
            <span className="text-sm">Loading…</span>
          </div>
        )}
        {error && !loading && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}
        {!loading && !error && result && result.items.length === 0 && (
          <p className="text-center text-slate-400 text-sm py-12">No activities found.</p>
        )}
        {!loading && !error && result?.items.map((a) => <ActiviteitRow key={a.urn} act={a} />)}
      </div>

      {/* Pagination */}
      {result && (result.items.length > 0 || page > 1) && (
        <div className="p-3 border-t border-slate-200 bg-white flex items-center justify-between">
          <span className="text-xs text-slate-500">
            Page {page} · {result.items.length} items
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => goPage(page - 1)}
              disabled={page <= 1 || loading}
              className="p-1.5 rounded border border-slate-200 disabled:opacity-40 hover:bg-slate-50 transition-colors"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              onClick={() => goPage(page + 1)}
              disabled={!result.hasNext || loading}
              className="p-1.5 rounded border border-slate-200 disabled:opacity-40 hover:bg-slate-50 transition-colors"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Panel shell ──────────────────────────────────────────────────────────────

const DsoExplorer: React.FC = () => {
  const [tab, setTab] = useState<Tab>('begrippen');

  const tabCls = (t: Tab) =>
    `flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
      tab === t
        ? 'border-blue-600 text-blue-700'
        : 'border-transparent text-slate-500 hover:text-slate-700'
    }`;

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3 bg-white border-b border-slate-200">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-blue-600 flex items-center justify-center">
            <span className="text-white text-[10px] font-bold">D</span>
          </div>
          <span className="font-semibold text-slate-800 text-sm">DSO Explorer</span>
        </div>
        <span className="text-xs text-slate-400">
          Digitaal Stelsel Omgevingswet · pre-production
        </span>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 bg-white px-2">
        <button className={tabCls('begrippen')} onClick={() => setTab('begrippen')}>
          <BookOpen size={14} />
          Concepts
        </button>
        <button className={tabCls('activiteiten')} onClick={() => setTab('activiteiten')}>
          <TreePine size={14} />
          Activities
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {tab === 'begrippen' && <BegrippenTab />}
        {tab === 'activiteiten' && <ActiviteitenTab />}
      </div>
    </div>
  );
};

export default DsoExplorer;
