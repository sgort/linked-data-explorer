// packages/frontend/src/components/BpmnModeler/RopaSelector.tsx
import { ShieldCheck } from 'lucide-react';
import React, { useEffect, useState } from 'react';

import { RopaService } from '../../services/ropaService';
import { RopaRecord } from '../../types/ropa.types';

interface RopaSelectorProps {
  bpmnProcessId: string;
  currentRopaRef: string | undefined;
  onRopaRefChange: (ropaRef: string | undefined) => void;
}

const RopaSelector: React.FC<RopaSelectorProps> = ({
  bpmnProcessId,
  currentRopaRef,
  onRopaRefChange,
}) => {
  const [records, setRecords] = useState<RopaRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string>(currentRopaRef ?? '');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    RopaService.listRopa()
      .then(setRecords)
      .catch(() => setRecords([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setSelectedId(currentRopaRef ?? '');
  }, [currentRopaRef]);

  const handleSelect = async (id: string) => {
    setSelectedId(id);
    setSaving(true);
    try {
      onRopaRefChange(id || undefined);
    } finally {
      setSaving(false);
    }
  };

  const linked = records.find((r) => r.id === selectedId);

  return (
    <div className="p-3">
      <div className="flex items-center gap-1.5 mb-2">
        <ShieldCheck size={12} className="text-teal-600 shrink-0" />
        <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
          RoPA Record
        </span>
      </div>

      {loading ? (
        <p className="text-xs text-slate-400">Loading records…</p>
      ) : (
        <>
          <select
            value={selectedId}
            onChange={(e) => handleSelect(e.target.value)}
            disabled={saving}
            className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs
                       focus:ring-2 focus:ring-teal-500 focus:outline-none bg-white
                       disabled:opacity-50"
          >
            <option value="">— Not linked —</option>
            {records.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title}
              </option>
            ))}
          </select>

          {linked && (
            <div className="mt-1.5 px-2 py-1.5 rounded bg-teal-50 border border-teal-100">
              <p className="text-[10px] font-medium text-teal-700 truncate">
                {linked.controllerName}
              </p>
              <p className="text-[10px] text-slate-500 font-mono truncate">{linked.gdprArticle}</p>
            </div>
          )}

          {!linked && bpmnProcessId && (
            <p className="mt-1 text-[10px] text-amber-600">
              No RoPA record linked — required before production deploy.
            </p>
          )}
        </>
      )}
    </div>
  );
};

export default RopaSelector;
