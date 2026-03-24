/**
 * BindingPanel
 *
 * Destination: packages/frontend/src/components/DocumentComposer/BindingPanel.tsx
 *
 * Right panel — "Variabelen" tab.
 * Allows declaring {{placeholder}} → processVariableKey bindings.
 * "Ontdek variabelen" button fetches hints from Operaton via GET /v1/process/:key/variable-hints.
 */

import { Loader2, Plus, Search, Trash2, Variable } from 'lucide-react';
import React, { useState } from 'react';

import { fetchVariableHints } from '../../services/assetService';
import { ProcessVariableHint, VariableBinding } from '../../types/document.types';

interface BindingPanelProps {
  processKey: string | undefined;
  bindings: VariableBinding[];
  onAdd: (binding: Omit<VariableBinding, 'id'>) => void;
  onDelete: (id: string) => void;
  onUpdateProcessKey: (key: string) => void;
}

const BindingPanel: React.FC<BindingPanelProps> = ({
  processKey,
  bindings,
  onAdd,
  onDelete,
  onUpdateProcessKey,
}) => {
  const [hints, setHints] = useState<ProcessVariableHint[]>([]);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discovered, setDiscovered] = useState(false);
  const [newPlaceholder, setNewPlaceholder] = useState('');
  const [newVariableKey, setNewVariableKey] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newSource, setNewSource] = useState<'process' | 'dmn_output'>('process');

  const handleDiscover = async () => {
    if (!processKey) return;
    setIsDiscovering(true);
    const result = await fetchVariableHints(processKey);
    setHints(result);
    setDiscovered(true);
    setIsDiscovering(false);
  };

  const handleAddBinding = () => {
    const placeholder = newPlaceholder.trim();
    const variableKey = newVariableKey.trim();
    if (!placeholder || !variableKey) return;

    const finalPlaceholder = placeholder.startsWith('{{') ? placeholder : `{{${placeholder}}}`;
    onAdd({
      placeholder: finalPlaceholder,
      variableKey,
      source: newSource,
      label: newLabel.trim() || undefined,
    });
    setNewPlaceholder('');
    setNewVariableKey('');
    setNewLabel('');
  };

  const handleHintClick = (hint: ProcessVariableHint) => {
    setNewVariableKey(hint.name);
    setNewPlaceholder(`{{${hint.name}}}`);
  };

  return (
    <div className="space-y-5">
      {/* Process key */}
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">
          Process key (Operaton)
        </label>
        <input
          type="text"
          value={processKey ?? ''}
          onChange={(e) => onUpdateProcessKey(e.target.value)}
          placeholder="e.g. AwbShellProcess"
          className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
        />
      </div>

      {/* Discover button */}
      <button
        type="button"
        onClick={handleDiscover}
        disabled={!processKey || isDiscovering}
        className={`
          w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border transition-colors
          ${
            !processKey || isDiscovering
              ? 'bg-slate-50 text-slate-300 border-slate-200 cursor-not-allowed'
              : 'bg-white text-blue-700 border-blue-300 hover:bg-blue-50'
          }
        `}
      >
        {isDiscovering ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
        Discover variables in Operaton
      </button>

      {/* Variable hints from Operaton */}
      {discovered && hints.length > 0 && (
        <div>
          <p className="text-xs text-slate-500 mb-2">
            {hints.length} variables found — click to use:
          </p>
          <div className="flex flex-wrap gap-1.5">
            {hints.map((hint) => (
              <button
                key={hint.name}
                type="button"
                onClick={() => handleHintClick(hint)}
                title={`Type: ${hint.type}`}
                className="px-2 py-0.5 rounded-full border border-purple-200 bg-purple-50 text-purple-700 text-[10px] font-mono hover:bg-purple-100 transition-colors"
              >
                {hint.name}
                <span className="ml-1 text-purple-400 text-[9px]">{hint.type}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {discovered && hints.length === 0 && (
        <p className="text-xs text-slate-400">
          No variables found. Make sure there are completed process instances in Operaton.
        </p>
      )}

      {/* Add binding form */}
      <div className="border border-slate-200 rounded-lg p-3 space-y-2">
        <p className="text-xs font-medium text-slate-600 mb-2">Add binding</p>

        <div>
          <label className="text-[10px] text-slate-500 mb-0.5 block">Placeholder</label>
          <input
            value={newPlaceholder}
            onChange={(e) => setNewPlaceholder(e.target.value)}
            placeholder="{{dossierReference}}"
            className="w-full px-2 py-1 border border-slate-200 rounded text-xs font-mono focus:ring-1 focus:ring-blue-400 focus:outline-none"
          />
        </div>

        <div>
          <label className="text-[10px] text-slate-500 mb-0.5 block">Process variable</label>
          <input
            value={newVariableKey}
            onChange={(e) => setNewVariableKey(e.target.value)}
            placeholder="dossierReference"
            className="w-full px-2 py-1 border border-slate-200 rounded text-xs font-mono focus:ring-1 focus:ring-blue-400 focus:outline-none"
          />
        </div>

        <div>
          <label className="text-[10px] text-slate-500 mb-0.5 block">Label (optional)</label>
          <input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="Dossiernummer"
            className="w-full px-2 py-1 border border-slate-200 rounded text-xs focus:ring-1 focus:ring-blue-400 focus:outline-none"
          />
        </div>

        <div>
          <label className="text-[10px] text-slate-500 mb-0.5 block">Source</label>
          <select
            value={newSource}
            onChange={(e) => setNewSource(e.target.value as 'process' | 'dmn_output')}
            className="w-full px-2 py-1 border border-slate-200 rounded text-xs focus:ring-1 focus:ring-blue-400 focus:outline-none"
          >
            <option value="process">Process variable</option>
            <option value="dmn_output">DMN output</option>
          </select>
        </div>

        <button
          type="button"
          onClick={handleAddBinding}
          disabled={!newPlaceholder.trim() || !newVariableKey.trim()}
          className={`
            w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors
            ${
              !newPlaceholder.trim() || !newVariableKey.trim()
                ? 'bg-slate-50 text-slate-300 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }
          `}
        >
          <Plus size={12} />
          Add
        </button>
      </div>

      {/* Existing bindings */}
      {bindings.length > 0 && (
        <div>
          <p className="text-xs font-medium text-slate-600 mb-2">
            Linked variables ({bindings.length})
          </p>
          <div className="space-y-1.5">
            {bindings.map((b) => (
              <div
                key={b.id}
                className="flex items-center gap-2 px-2 py-1.5 bg-slate-50 rounded border border-slate-200 group"
              >
                <Variable size={11} className="text-purple-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-[10px] font-mono text-purple-700">{b.placeholder}</span>
                  <span className="text-[10px] text-slate-400 mx-1">→</span>
                  <span className="text-[10px] font-mono text-slate-600">{b.variableKey}</span>
                  {b.label && <span className="text-[10px] text-slate-400 ml-1">({b.label})</span>}
                </div>
                <button
                  onClick={() => onDelete(b.id)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 text-slate-300 hover:text-red-500"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default BindingPanel;
