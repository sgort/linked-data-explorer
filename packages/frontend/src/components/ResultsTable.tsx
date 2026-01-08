import React from 'react';

import { SparqlResponse } from '../types';

interface ResultsTableProps {
  data: SparqlResponse | null;
}

const ResultsTable: React.FC<ResultsTableProps> = ({ data }) => {
  if (!data) return <div className="text-slate-500 italic p-4">No results yet. Run a query.</div>;

  if (data.results.bindings.length === 0) {
    return <div className="text-slate-500 italic p-4">Query returned 0 results.</div>;
  }

  const vars = data.head.vars;

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
                ?{v}
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
              {vars.map((v) => {
                const cell = binding[v];
                return (
                  <td key={v} className="px-6 py-4 max-w-xs truncate" title={cell?.value || ''}>
                    {cell ? (
                      <div className="flex flex-col">
                        <span className={cell.type === 'uri' ? 'text-blue-600' : 'text-slate-700'}>
                          {cell.type === 'uri' ? (
                            <a
                              href={cell.value}
                              target="_blank"
                              rel="noreferrer"
                              className="hover:underline"
                            >
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
                    ) : (
                      <span className="text-slate-300">-</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default ResultsTable;
