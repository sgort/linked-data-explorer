// packages/frontend/src/components/DsoExplorer/DsoExplorer.tsx

import { BookOpen, ChevronLeft, ChevronRight, Loader2, Search, TreePine } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import {
  ActiviteitenResult,
  BegrippenResult,
  DsoActiviteit,
  DsoActiviteitDetail,
  DsoBegrip,
  DsoEnv,
  DsoRegelbeheerobject,
  DsoWerkzaamheid,
  DsoWerkzaamheidVersie,
  getActiviteitDetail,
  getActiviteiten,
  getActiviteitenByOin,
  getWerkzaamheidDetail,
  searchBegrippen,
  suggereerWerkzaamheden,
  urnFromHref,
  WerkzaamhedenZoekResult,
  zoekActiviteiten,
  zoekWerkzaamheden,
} from '../../services/dsoService';

type Tab = 'begrippen' | 'werkzaamheden' | 'activiteiten';

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

const BegrippenTab: React.FC<{ env: DsoEnv }> = ({ env }) => {
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [result, setResult] = useState<BegrippenResult | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(
    async (term: string, p: number) => {
      setLoading(true);
      setError(null);
      try {
        setResult(await searchBegrippen(term, p, env));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        setLoading(false);
      }
    },
    [env]
  );

  // Load on mount with empty term to show something immediately
  useEffect(() => {
    setQuery('');
    setSubmitted('');
    setPage(1);
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

// ── Werkzaamheden tab ────────────────────────────────────────────────────────

const WerkzaamheidDetailPanel: React.FC<{
  urn: string;
  env: DsoEnv;
  onClose: () => void;
}> = ({ urn, env, onClose }) => {
  const [versies, setVersies] = useState<DsoWerkzaamheidVersie[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getWerkzaamheidDetail(urn, env)
      .then(setVersies)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [urn, env]);

  // Show most recent version first
  const current = versies.find((v) => !v.eindDatum) ?? versies[0];

  return (
    <div className="flex flex-col h-full border-l border-slate-200 bg-white w-1/3 flex-shrink-0">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50 flex-shrink-0">
        <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
          Werkzaamheid detail
        </span>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-700 transition-colors">
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {loading && (
          <div className="flex items-center justify-center py-16 text-slate-400">
            <Loader2 size={18} className="animate-spin mr-2" />
            <span className="text-sm">Loading…</span>
          </div>
        )}
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded text-xs text-red-700">
            {error}
          </div>
        )}
        {current && (
          <>
            <Section title="Werkzaamheid">
              <p className="text-sm font-semibold text-slate-800 break-words">
                {current.omschrijving}
              </p>
              <p className="text-[10px] text-slate-400 font-mono mt-1 break-all">{current.urn}</p>
            </Section>

            <Section title="Validity">
              <div className="flex gap-3 text-xs text-slate-600">
                <span>
                  From: <strong>{current.beginDatum}</strong>
                </span>
                <span>
                  Until: <strong>{current.eindDatum ?? '∞'}</strong>
                </span>
              </div>
            </Section>

            {current.trefwoorden && current.trefwoorden.length > 0 && (
              <Section title="Keywords">
                <div className="flex flex-wrap gap-1">
                  {current.trefwoorden.map((t) => (
                    <span
                      key={t}
                      className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs rounded"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </Section>
            )}

            {current.logischeRelaties && current.logischeRelaties.length > 0 && (
              <Section title={`Related werkzaamheden (${current.logischeRelaties.length})`}>
                <ul className="space-y-1">
                  {current.logischeRelaties.map((r) => (
                    <li key={r.urn} className="text-xs text-slate-600 break-all">
                      {r.omschrijving ?? r.urn}
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {versies.length > 1 && (
              <Section title={`Version history (${versies.length})`}>
                <ul className="space-y-2">
                  {versies.map((v, i) => (
                    <li key={i} className="text-xs text-slate-600">
                      <span className="font-medium">{v.beginDatum}</span>
                      {v.eindDatum && <span className="text-slate-400"> → {v.eindDatum}</span>}
                      {!v.eindDatum && (
                        <span className="ml-1.5 px-1.5 py-0.5 bg-green-100 text-green-700 text-[10px] rounded">
                          current
                        </span>
                      )}
                      <p className="text-slate-500 mt-0.5">{v.omschrijving}</p>
                    </li>
                  ))}
                </ul>
              </Section>
            )}
          </>
        )}
      </div>
    </div>
  );
};

const WerkzaamhedenTab: React.FC<{ env: DsoEnv }> = ({ env }) => {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<WerkzaamhedenZoekResult | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedUrn, setSelectedUrn] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(
    async (term: string, p: number) => {
      setLoading(true);
      setError(null);
      try {
        setResult(await zoekWerkzaamheden(term, p, env));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        setLoading(false);
      }
    },
    [env]
  );

  useEffect(() => {
    setSelectedUrn(null);
    setResult(null);
    setQuery('');
    load('', 1);
  }, [load]);

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    setShowSuggestions(false);
    if (suggestTimer.current) clearTimeout(suggestTimer.current);
    if (val.trim().length >= 2) {
      suggestTimer.current = setTimeout(async () => {
        const s = await suggereerWerkzaamheden(val.trim(), env);
        setSuggestions(s);
        setShowSuggestions(s.length > 0);
      }, 300);
    }
  };

  const handleSearch = () => {
    setShowSuggestions(false);
    setPage(1);
    setSelectedUrn(null);
    load(query, 1);
  };

  const handleSuggestion = (s: string) => {
    setQuery(s);
    setShowSuggestions(false);
    setPage(1);
    setSelectedUrn(null);
    load(s, 1);
  };

  const goPage = (p: number) => {
    setPage(p);
    setSelectedUrn(null);
    load(query, p);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Search bar */}
      <div className="p-3 border-b border-slate-200 bg-white flex-shrink-0 relative">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              ref={inputRef}
              value={query}
              onChange={handleQueryChange}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSearch();
                if (e.key === 'Escape') setShowSuggestions(false);
              }}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              placeholder="Search werkzaamheden…"
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
            {showSuggestions && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-20 max-h-48 overflow-y-auto">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onMouseDown={() => handleSuggestion(s)}
                    className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={handleSearch}
            disabled={loading}
            className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            Search
          </button>
        </div>
      </div>

      {/* Master-detail body */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-y-auto p-3 space-y-2 min-w-0">
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
            <p className="text-center text-slate-400 text-sm py-12">No werkzaamheden found.</p>
          )}
          {!loading &&
            !error &&
            result?.items.map((w) => (
              <button
                key={w.urn}
                onClick={() => setSelectedUrn(w.urn === selectedUrn ? null : w.urn)}
                className={`w-full text-left bg-white border rounded-lg p-3 transition-colors ${
                  selectedUrn === w.urn
                    ? 'border-blue-400 ring-1 ring-blue-400'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <p className="text-sm font-medium text-slate-800">{w.omschrijving ?? w.urn}</p>
                {w.functioneleStructuurRef && (
                  <p className="text-[10px] text-slate-400 font-mono mt-1 truncate">
                    ref: {w.functioneleStructuurRef}
                  </p>
                )}
                <p className="text-[10px] text-slate-300 font-mono mt-0.5 truncate" title={w.urn}>
                  {w.urn}
                </p>
              </button>
            ))}
        </div>

        {selectedUrn && (
          <WerkzaamheidDetailPanel
            urn={selectedUrn}
            env={env}
            onClose={() => setSelectedUrn(null)}
          />
        )}
      </div>

      {/* Pagination */}
      {result && (result.items.length > 0 || page > 1) && (
        <div className="p-3 border-t border-slate-200 bg-white flex items-center justify-between flex-shrink-0">
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

const TYPERING_META: Record<DsoRegelbeheerobject['typering'], { label: string; color: string }> = {
  indieningsvereisten: {
    label: 'Submission requirements',
    color: 'bg-blue-100 text-blue-700 border-blue-200',
  },
  conclusie: {
    label: 'Decision criteria',
    color: 'bg-purple-100 text-purple-700 border-purple-200',
  },
  maatregelen: { label: 'Measures', color: 'bg-amber-100 text-amber-700 border-amber-200' },
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div>
    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
      {title}
    </p>
    {children}
  </div>
);

const ActivityDetailPanel: React.FC<{
  urn: string;
  datum?: string;
  env: DsoEnv;
  onClose: () => void;
  onNavigate: (urn: string) => void;
}> = ({ urn, datum, env, onClose, onNavigate }) => {
  const [detail, setDetail] = useState<DsoActiviteitDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [childNames, setChildNames] = useState<Record<string, string>>({});

  useEffect(() => {
    setLoading(true);
    setError(null);
    setDetail(null);
    setChildNames({});
    getActiviteitDetail(urn, datum, env)
      .then((d) => {
        setDetail(d as DsoActiviteitDetail);
        // Fetch child names in parallel after parent loads
        const children = d._links?.onderliggendeActiviteiten ?? [];
        if (children.length > 0) {
          Promise.allSettled(
            children.map((c) =>
              getActiviteitDetail(urnFromHref(c.href), datum, env).then((child) => ({
                urn: urnFromHref(c.href),
                name: child.omschrijving ?? null,
              }))
            )
          ).then((results) => {
            const names: Record<string, string> = {};
            results.forEach((r) => {
              if (r.status === 'fulfilled' && r.value.name) {
                names[r.value.urn] = r.value.name;
              }
            });
            setChildNames(names);
          });
        }
      })
      .catch((e) => {
        const msg = e instanceof Error ? e.message : 'Failed to load';
        setError(
          msg.includes('404')
            ? `This activity is not available in the ${env === 'prod' ? 'production' : 'pre-production'} DSO environment.`
            : msg
        );
      })
      .finally(() => setLoading(false));
  }, [urn, datum, env]);

  return (
    <div className="flex flex-col h-full border-l border-slate-200 bg-white w-1/3 flex-shrink-0">
      {/* Panel header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50 flex-shrink-0">
        <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
          Activity detail
        </span>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-700 transition-colors"
          title="Close"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {loading && (
          <div className="flex items-center justify-center py-16 text-slate-400">
            <Loader2 size={18} className="animate-spin mr-2" />
            <span className="text-sm">Loading…</span>
          </div>
        )}
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded text-xs text-red-700">
            {error}
          </div>
        )}
        {detail && (
          <>
            {/* Description + URN */}
            <Section title="Activity">
              <p className="text-sm font-semibold text-slate-800 break-words">
                {detail.omschrijving ?? (
                  <span className="text-slate-400 italic">No description</span>
                )}
              </p>
              <p className="text-[10px] text-slate-400 font-mono mt-1 break-all">{detail.urn}</p>
            </Section>

            {/* Authority */}
            {detail.bestuursorgaan && (
              <Section title="Authority">
                <div className="text-xs text-slate-600 space-y-0.5">
                  <p>
                    <span className="text-slate-400">Type:</span>{' '}
                    {detail.bestuursorgaan.bestuurslaag} ({detail.bestuursorgaan.organisatieType})
                  </p>
                  <p>
                    <span className="text-slate-400">Code:</span>{' '}
                    {detail.bestuursorgaan.organisatieCode}
                  </p>
                  <p className="font-mono text-[10px] text-slate-400 break-all">
                    OIN: {detail.bestuursorgaan.oin}
                  </p>
                </div>
              </Section>
            )}

            {/* Parent — extracted from HAL link */}
            {detail._links?.bovenliggendeActiviteit?.href && (
              <Section title="Parent activity">
                <button
                  onClick={() =>
                    onNavigate(urnFromHref(detail._links!.bovenliggendeActiviteit!.href))
                  }
                  className="text-xs text-blue-600 hover:underline text-left break-all font-mono"
                >
                  {urnFromHref(detail._links.bovenliggendeActiviteit.href)}
                </button>
              </Section>
            )}

            {/* Validity */}
            <Section title="Validity">
              <div className="flex gap-3 text-xs text-slate-600">
                <span>
                  From: <strong>{detail.beginDatum ?? '—'}</strong>
                </span>
                <span>
                  Until: <strong>{detail.eindDatum ?? '∞'}</strong>
                </span>
              </div>
            </Section>

            {/* Refinable */}
            <Section title="Properties">
              <p className="text-xs text-slate-600">
                Refinable: <strong>{detail.verfijnbaar ? 'Yes' : 'No'}</strong>
              </p>
            </Section>

            {/* Rule objects */}
            {detail.regelBeheerObjecten && detail.regelBeheerObjecten.length > 0 ? (
              <Section title="Rule types present">
                <div className="flex flex-wrap gap-1.5">
                  {Array.from(new Set(detail.regelBeheerObjecten.map((r) => r.typering))).map(
                    (type) => {
                      const meta = TYPERING_META[type] ?? {
                        label: type,
                        color: 'bg-slate-100 text-slate-600 border-slate-200',
                      };
                      return (
                        <span
                          key={type}
                          className={`px-2 py-1 text-xs font-medium rounded border ${meta.color}`}
                        >
                          {meta.label}
                        </span>
                      );
                    }
                  )}
                </div>
              </Section>
            ) : (
              <Section title="Rule types present">
                <p className="text-xs text-slate-400 italic">None registered</p>
              </Section>
            )}

            {/* Child activities */}
            {detail._links?.onderliggendeActiviteiten &&
              detail._links.onderliggendeActiviteiten.length > 0 && (
                <Section
                  title={`Child activities (${detail._links.onderliggendeActiviteiten.length})`}
                >
                  <ul className="space-y-1.5">
                    {detail._links.onderliggendeActiviteiten.map((c) => {
                      const childUrn = urnFromHref(c.href);
                      const name = childNames[childUrn];
                      return (
                        <li key={c.href}>
                          <button
                            onClick={() => onNavigate(childUrn)}
                            className="w-full text-left group"
                          >
                            {name ? (
                              <span className="text-xs text-blue-600 group-hover:underline font-medium">
                                {name}
                              </span>
                            ) : (
                              <span className="text-[10px] text-blue-400 group-hover:underline font-mono break-all">
                                {childUrn}
                              </span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </Section>
              )}

            {/* Locations */}
            {detail.locaties && detail.locaties.length > 0 && (
              <Section title={`Locations (${detail.locaties.length})`}>
                <ul className="space-y-1">
                  {detail.locaties.map((l) => (
                    <li
                      key={l.identificatie}
                      className="text-[10px] text-slate-500 font-mono break-all"
                    >
                      {l.identificatie}
                    </li>
                  ))}
                </ul>
              </Section>
            )}
          </>
        )}
      </div>
    </div>
  );
};

const ActiviteitRow: React.FC<{
  act: DsoActiviteit;
  selected: boolean;
  onClick: () => void;
}> = ({ act, selected, onClick }) => (
  <button
    onClick={onClick}
    className={`w-full text-left bg-white border rounded-lg p-3 transition-colors ${
      selected ? 'border-blue-400 ring-1 ring-blue-400' : 'border-slate-200 hover:border-slate-300'
    }`}
  >
    <p className="text-sm font-medium text-slate-800 break-all">{act.omschrijving ?? act.urn}</p>
    {act._links?.bovenliggendeActiviteit?.href && (
      <p className="text-[10px] text-slate-400 font-mono mt-1 truncate">
        ↳ {urnFromHref(act._links.bovenliggendeActiviteit.href)}
      </p>
    )}
    <p className="text-[10px] text-slate-300 font-mono mt-1 truncate" title={act.urn}>
      {act.urn}
    </p>
  </button>
);

const ActiviteitenTab: React.FC<{ env: DsoEnv }> = ({ env }) => {
  // ── preset authorities ───────────────────────────────────────────────
  const PRESETS = [
    { label: 'Lelystad', oin: '00000001005024249000' },
    { label: 'Flevoland', oin: '00000001006203243000' },
  ] as const;

  const [datum, setDatum] = useState('');
  const [activeDatum, setActiveDatum] = useState<string | undefined>(undefined);
  const [result, setResult] = useState<ActiviteitenResult | null>(null);
  const [oinMode, setOinMode] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedUrn, setSelectedUrn] = useState<string | null>(null);
  const [urnInput, setUrnInput] = useState('');
  const [activePreset, setActivePreset] = useState<string | null>(null);

  const toDsoDate = (iso: string) => {
    if (!iso) return undefined;
    const [y, m, d] = iso.split('-');
    return `${d}-${m}-${y}`;
  };

  const load = useCallback(
    async (d: string, p: number) => {
      setLoading(true);
      setError(null);
      setOinMode(false);
      try {
        const dsoDate = toDsoDate(d);
        const res = await getActiviteiten(dsoDate, p, env);
        setResult(res);
        setActiveDatum(dsoDate);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        setLoading(false);
      }
    },
    [env]
  );

  const loadByOin = useCallback(
    async (oin: string, dsoDate?: string) => {
      setLoading(true);
      setError(null);
      try {
        const res = await getActiviteitenByOin(oin, env, dsoDate);
        setResult(res);
        setActiveDatum(dsoDate);
        setOinMode(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        setLoading(false);
      }
    },
    [env]
  );

  useEffect(() => {
    setSelectedUrn(null);
    setActivePreset(null);
    setOinMode(false);
    load('', 1);
  }, [load]);

  const handleLoad = () => {
    setPage(1);
    setSelectedUrn(null);
    if (activePreset) {
      const preset = PRESETS.find((p) => p.label === activePreset);
      if (preset) loadByOin(preset.oin, toDsoDate(datum));
    } else {
      setOinMode(false);
      load(datum, 1);
    }
  };

  const handlePreset = (preset: (typeof PRESETS)[number]) => {
    const isActive = activePreset === preset.label;
    setActivePreset(isActive ? null : preset.label);
    setSelectedUrn(null);
    if (isActive) {
      setOinMode(false);
      setDatum('');
      load('', 1);
    } else {
      // Show yesterday in the Valid on field so the user sees what date filters the preset
      const d = new Date();
      d.setDate(d.getDate() - 1);
      const yesterday = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      setDatum(yesterday);
      loadByOin(preset.oin, toDsoDate(yesterday));
    }
  };

  const goPage = (p: number) => {
    setPage(p);
    setSelectedUrn(null);
    load(datum, p);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="border-b border-slate-200 bg-white flex-shrink-0">
        {/* Row 1: date + load */}
        <div className="px-3 pt-3 pb-2 flex gap-2 items-center border-b border-slate-100">
          <label className="text-xs text-slate-500 shrink-0">Valid on</label>
          <input
            type="date"
            value={datum}
            placeholder="Today"
            onChange={(e) => setDatum(e.target.value)}
            className="flex-1 px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
          <button
            onClick={handleLoad}
            disabled={loading}
            className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            Load
          </button>
        </div>
        {/* Row 2: location presets */}
        <div className="px-3 py-2 flex items-center gap-2 border-b border-slate-100">
          <span className="text-xs text-slate-400 shrink-0">Location</span>
          {PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => handlePreset(p)}
              className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                activePreset === p.label
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-slate-600 border-slate-300 hover:border-blue-400 hover:text-blue-600'
              }`}
            >
              {p.label}
            </button>
          ))}
          {activePreset && (
            <>
              <span className="text-[10px] text-slate-400 italic">
                Showing {activePreset} activities only
              </span>
              <button
                onClick={() => {
                  setActivePreset(null);
                  setOinMode(false);
                  setSelectedUrn(null);
                  setDatum('');
                  load('', 1);
                }}
                className="ml-auto text-[10px] text-slate-400 hover:text-slate-600 underline transition-colors"
              >
                Clear
              </button>
            </>
          )}
        </div>
        {/* Row 3: URN paste */}
        <div className="px-3 py-2 flex gap-2 items-center">
          <input
            value={urnInput}
            onChange={(e) => setUrnInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && urnInput.trim()) setSelectedUrn(urnInput.trim());
            }}
            placeholder="Paste URN to inspect directly…"
            className="flex-1 px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
          <button
            onClick={() => {
              if (urnInput.trim()) setSelectedUrn(urnInput.trim());
            }}
            disabled={!urnInput.trim()}
            className="px-3 py-1.5 bg-slate-700 text-white text-xs rounded-lg hover:bg-slate-800 disabled:opacity-40 transition-colors"
          >
            Inspect
          </button>
        </div>
      </div>

      {/* Master-detail body */}
      <div className="flex-1 flex overflow-hidden">
        {/* List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2 min-w-0">
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
            <p className="text-center text-slate-400 text-sm py-12">
              {oinMode
                ? 'No activities found for this authority on the selected date.'
                : 'No activities found.'}
            </p>
          )}
          {!loading &&
            !error &&
            result?.items.map((a) => (
              <ActiviteitRow
                key={a.urn}
                act={a}
                selected={selectedUrn === a.urn}
                onClick={() => setSelectedUrn(a.urn === selectedUrn ? null : a.urn)}
              />
            ))}
        </div>

        {/* Detail panel */}
        {selectedUrn && (
          <ActivityDetailPanel
            urn={selectedUrn}
            datum={activeDatum}
            env={env}
            onClose={() => setSelectedUrn(null)}
            onNavigate={(urn) => setSelectedUrn(urn)}
          />
        )}
      </div>

      {/* Pagination */}
      {result && (result.items.length > 0 || page > 1) && (
        <div className="p-3 border-t border-slate-200 bg-white flex items-center justify-between flex-shrink-0">
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

interface DsoExplorerProps {
  env?: DsoEnv;
}

const DsoExplorer: React.FC<DsoExplorerProps> = ({ env = 'pre' }) => {
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
        <span
          className={`text-xs font-medium px-2 py-0.5 rounded ${
            env === 'prod' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
          }`}
        >
          {env === 'prod' ? 'production' : 'pre-production'}
        </span>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 bg-white px-2">
        <button className={tabCls('begrippen')} onClick={() => setTab('begrippen')}>
          <BookOpen size={14} />
          Concepts
        </button>
        <button className={tabCls('werkzaamheden')} onClick={() => setTab('werkzaamheden')}>
          <Search size={14} />
          Works
        </button>
        <button className={tabCls('activiteiten')} onClick={() => setTab('activiteiten')}>
          <TreePine size={14} />
          Activities
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {tab === 'begrippen' && <BegrippenTab env={env} />}
        {tab === 'werkzaamheden' && <WerkzaamhedenTab env={env} />}
        {tab === 'activiteiten' && <ActiviteitenTab env={env} />}
      </div>
    </div>
  );
};

export default DsoExplorer;
