// packages/frontend/src/components/BpmnModeler/DsoActiviteitSelector.tsx

import { ExternalLink, Link2, Loader2, X } from 'lucide-react';
import React, { useEffect, useState } from 'react';

import { getActiviteitDetail } from '../../services/dsoService';

interface DsoActiviteitSelectorProps {
  bpmnProcessId: string;
  currentUrn: string | undefined;
  onUrnChange: (urn: string | undefined) => void;
}

const DsoActiviteitSelector: React.FC<DsoActiviteitSelectorProps> = ({
  bpmnProcessId,
  currentUrn,
  onUrnChange,
}) => {
  const [input, setInput] = useState(currentUrn ?? '');
  const [label, setLabel] = useState<string | null>(null);
  const [authority, setAuthority] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-verify on mount when a URN is already stored
  useEffect(() => {
    if (currentUrn) {
      setInput(currentUrn);
      verify(currentUrn);
    }
  }, [currentUrn]);

  const verify = async (urn: string) => {
    if (!urn.trim()) return;
    setVerifying(true);
    setError(null);
    setLabel(null);
    setAuthority(null);
    try {
      const detail = await getActiviteitDetail(urn.trim());
      setLabel(detail.omschrijving ?? null);
      if (detail.bestuursorgaan) {
        setAuthority(
          `${detail.bestuursorgaan.bestuurslaag} · ${detail.bestuursorgaan.organisatieType}${detail.bestuursorgaan.organisatieCode}`
        );
      }
    } catch {
      setError('URN not found in DSO');
    } finally {
      setVerifying(false);
    }
  };

  const handleSave = () => {
    const urn = input.trim() || undefined;
    onUrnChange(urn);
    if (urn) verify(urn);
  };

  const handleClear = () => {
    setInput('');
    setLabel(null);
    setAuthority(null);
    setError(null);
    onUrnChange(undefined);
  };

  const isDirty = input.trim() !== (currentUrn ?? '');

  return (
    <div className="p-3">
      <div className="flex items-center gap-1.5 mb-2">
        <Link2 size={12} className="text-blue-600 shrink-0" />
        <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
          DSO Activity
        </span>
      </div>

      <div className="flex gap-1.5">
        <input
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setLabel(null);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSave();
          }}
          placeholder="Paste activiteit URN…"
          className="flex-1 px-2 py-1.5 border border-slate-300 rounded text-[11px] font-mono
                     focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white min-w-0"
        />
        {input && (
          <button
            onClick={handleClear}
            className="text-slate-400 hover:text-slate-600 transition-colors"
            title="Clear"
          >
            <X size={14} />
          </button>
        )}
        <button
          onClick={handleSave}
          disabled={!isDirty && !input}
          className="px-2 py-1.5 bg-blue-600 text-white text-[11px] rounded hover:bg-blue-700
                     disabled:opacity-40 transition-colors shrink-0"
        >
          {isDirty ? 'Save' : 'Verify'}
        </button>
      </div>

      {verifying && (
        <div className="flex items-center gap-1.5 mt-1.5">
          <Loader2 size={11} className="animate-spin text-slate-400" />
          <span className="text-[10px] text-slate-400">Verifying with DSO…</span>
        </div>
      )}

      {error && !verifying && <p className="mt-1.5 text-[10px] text-red-600">{error}</p>}

      {label && !verifying && (
        <div className="mt-1.5 px-2 py-1.5 rounded bg-blue-50 border border-blue-100">
          <p className="text-[11px] font-medium text-blue-800">{label}</p>
          {authority && <p className="text-[10px] text-slate-500 mt-0.5">{authority}</p>}
          <p className="text-[10px] text-slate-400 font-mono mt-0.5 truncate" title={currentUrn}>
            {currentUrn}
          </p>
        </div>
      )}

      {!currentUrn && !label && !error && !verifying && bpmnProcessId && (
        <p className="mt-1 text-[10px] text-amber-600">
          No DSO activity linked — find one in DSO Explorer.
        </p>
      )}

      {currentUrn && label && (
        <a
          href={`https://omgevingswet.overheid.nl/registratie-toepasbare-regels/id/${currentUrn}`}
          target="_blank"
          rel="noreferrer"
          className="mt-1.5 flex items-center gap-1 text-[10px] text-blue-500 hover:underline"
        >
          <ExternalLink size={10} />
          View in RTR
        </a>
      )}
    </div>
  );
};

export default DsoActiviteitSelector;
