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
      // Try resolved URL first, fallback to original value if it's already a full URL
      const resolvedUrl = resolvedLogos[cell.value] || cell.value;
      const isFullUrl = resolvedUrl.startsWith('http://') || resolvedUrl.startsWith('https://');

      console.log('[ResultsTable] Rendering logo:', {
        originalValue: cell.value,
        resolvedUrl,
        isFullUrl,
        inResolvedLogos: cell.value in resolvedLogos,
      });

      if (isFullUrl) {
        return (
          <div className="flex items-center gap-2">
            <img
              src={resolvedUrl}
              alt="Organization logo"
              className="w-8 h-8 object-contain rounded border border-slate-200"
              onError={(e) => {
                console.error('[ResultsTable] Image failed to load:', resolvedUrl);
                const img = e.target as HTMLImageElement;
                img.style.display = 'none';
                // Show error indicator next to link
                const parent = img.parentElement;
                if (parent) {
                  const errorSpan = document.createElement('span');
                  errorSpan.textContent = '❌';
                  errorSpan.className = 'text-red-500';
                  parent.insertBefore(errorSpan, parent.firstChild);
                }
              }}
              onLoad={() => {
                console.log('[ResultsTable] Image loaded successfully:', resolvedUrl);
              }}
            />
            <a
              href={resolvedUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-blue-600 hover:underline truncate max-w-xs"
              title={resolvedUrl}
            >
              {cell.value.split('/').pop()}
            </a>
          </div>
        );
      }

      // Fallback for unresolved logos
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
    </div>
  );
};

export default ResultsTable;
