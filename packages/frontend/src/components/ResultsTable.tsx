// REPLACE: packages/frontend/src/components/ResultsTable.tsx

import React, { useEffect, useState } from 'react';

import { SparqlResponse } from '../types';
import { resolveLogo } from '../utils/logoResolver';

interface ResultsTableProps {
  data: SparqlResponse | null;
  endpoint?: string;
}

interface ResolvedLogos {
  [key: string]: string | null;
}

const ResultsTable: React.FC<ResultsTableProps> = ({ data, endpoint }) => {
  const [resolvedLogos, setResolvedLogos] = useState<ResolvedLogos>({});
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set());
  const [modalImage, setModalImage] = useState<{ url: string; alt: string } | null>(null);

  // Close modal on ESC key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setModalImage(null);
      }
    };

    if (modalImage) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [modalImage]);

  useEffect(() => {
    if (!data || !endpoint) return;

    // Find all logo values in the results
    const logoVars = data.head.vars.filter((v) => v === 'logo' || v.endsWith('Logo'));

    if (logoVars.length === 0) return;

    // Collect unique logo paths
    const logoPaths = new Set<string>();
    data.results.bindings.forEach((binding) => {
      logoVars.forEach((logoVar) => {
        const cell = binding[logoVar];
        if (cell?.value) {
          logoPaths.add(cell.value);
        }
      });
    });

    // Resolve all logo paths
    Promise.all(
      Array.from(logoPaths).map(async (path) => ({
        path,
        url: await resolveLogo(path, endpoint),
      }))
    ).then((results) => {
      const resolved: ResolvedLogos = {};
      results.forEach(({ path, url }) => {
        resolved[path] = url;
      });
      setResolvedLogos(resolved);
      // Reset errors when new data comes in
      setImageErrors(new Set());
    });
  }, [data, endpoint]);

  if (!data) return <div className="text-slate-500 italic p-4">No results yet. Run a query.</div>;

  if (data.results.bindings.length === 0) {
    return <div className="text-slate-500 italic p-4">Query returned 0 results.</div>;
  }

  const vars = data.head.vars;

  const isLogoColumn = (varName: string): boolean => {
    return varName === 'logo' || varName.endsWith('Logo') || varName === 'image';
  };

  const renderCell = (
    cell: { value: string; type?: string; 'xml:lang'?: string } | undefined,
    varName: string
  ) => {
    if (!cell) {
      return <span className="text-slate-300">-</span>;
    }

    // Logo column - show image if resolved
    if (isLogoColumn(varName)) {
      // Only use resolved URL from state, don't fall back to incomplete original URL
      const resolvedUrl = resolvedLogos[cell.value];

      // Check if original value is already a complete TriplyDB URL with version ID
      const completeUrlPattern =
        /^https?:\/\/api\..*\.triply\.cc\/datasets\/[^/]+\/[^/]+\/assets\/[^/]+\/[^/]+$/;
      const originalIsComplete = completeUrlPattern.test(cell.value);

      // Only display if we have resolved URL OR original is already complete
      const displayUrl = resolvedUrl || (originalIsComplete ? cell.value : null);
      const hasError = displayUrl ? imageErrors.has(displayUrl) : false;

      if (displayUrl && !hasError) {
        return (
          <div className="flex items-center gap-2">
            <img
              src={displayUrl}
              alt="Organization logo"
              className="w-8 h-8 object-contain rounded border border-slate-200 cursor-pointer hover:border-blue-400 transition-colors"
              title="Click to enlarge"
              onClick={() =>
                setModalImage({ url: displayUrl, alt: cell.value.split('/').pop() || 'Logo' })
              }
              onError={() => {
                setImageErrors((prev) => new Set(prev).add(displayUrl));
              }}
            />
            <a
              href={displayUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-blue-600 hover:underline truncate max-w-xs"
              title="Click to download image"
            >
              {cell.value.split('/').pop()}
            </a>
          </div>
        );
      }

      // Show error state or loading state
      if (hasError) {
        return (
          <div className="flex items-center gap-2">
            <span className="text-red-500 text-sm">❌</span>
            <a
              href={displayUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-red-600 hover:underline truncate max-w-xs"
              title={`Failed to load: ${displayUrl}`}
            >
              {cell.value.split('/').pop()}
            </a>
          </div>
        );
      }

      // Fallback for unresolved/loading logos
      return (
        <span className="text-xs text-slate-400 italic truncate" title={cell.value}>
          ⏳ {cell.value.split('/').pop()}
        </span>
      );
    }

    // Regular cell rendering
    return (
      <div className="flex flex-col">
        <span className={cell.type === 'uri' ? 'text-blue-600' : 'text-slate-700'}>
          {cell.type === 'uri' ? (
            <a href={cell.value} target="_blank" rel="noreferrer" className="hover:underline">
              {cell.value.startsWith('http')
                ? cell.value.split('/').pop()?.split('#').pop()
                : cell.value}
            </a>
          ) : (
            cell.value
          )}
        </span>
        {cell['xml:lang'] && (
          <span className="text-[10px] text-slate-400">@{cell['xml:lang']}</span>
        )}
        {cell.type === 'uri' && (
          <span className="text-[9px] text-slate-400 truncate opacity-0 hover:opacity-100 transition-opacity">
            {cell.value}
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="overflow-x-auto w-full h-full">
      <table className="min-w-full text-left text-sm whitespace-nowrap">
        <thead className="uppercase tracking-wider border-b-2 border-slate-200 bg-slate-100 sticky top-0">
          <tr>
            <th scope="col" className="px-6 py-3 text-slate-500 font-semibold w-16">
              #
            </th>
            {vars.map((v) => (
              <th key={v} scope="col" className="px-6 py-3 text-slate-500 font-semibold">
                {isLogoColumn(v) ? '🖼️ ' : '?'}
                {v}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {data.results.bindings.map((binding, idx) => (
            <tr key={idx} className="hover:bg-slate-50 transition-colors">
              <td className="px-6 py-4 text-slate-400 font-mono text-xs border-r border-slate-100">
                {idx + 1}
              </td>
              {vars.map((v) => (
                <td key={v} className="px-6 py-4 max-w-xs">
                  {renderCell(binding[v], v)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Image Modal */}
      {modalImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75 p-4"
          onClick={() => setModalImage(null)}
        >
          <div className="relative max-w-7xl max-h-full">
            <button
              onClick={() => setModalImage(null)}
              className="absolute -top-10 right-0 text-white hover:text-gray-300 text-2xl font-bold"
              title="Close (ESC)"
            >
              ✕
            </button>
            <img
              src={modalImage.url}
              alt={modalImage.alt}
              className="max-w-full max-h-[90vh] object-contain rounded shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
            <div className="text-center text-white mt-4 text-sm">{modalImage.alt}</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ResultsTable;
