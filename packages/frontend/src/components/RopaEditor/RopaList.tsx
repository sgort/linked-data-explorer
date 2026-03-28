import { Plus, Trash2 } from 'lucide-react';
import React from 'react';

import { RopaRecord, RopaStatus } from '../../types/ropa.types';

const STATUS_COLOUR: Record<RopaStatus, string> = {
  draft: 'bg-slate-100 text-slate-600',
  active: 'bg-green-100 text-green-700',
  archived: 'bg-amber-100 text-amber-700',
};

interface RopaListProps {
  records: RopaRecord[];
  activeId: string | null;
  loading: boolean;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
}

const RopaList: React.FC<RopaListProps> = ({
  records,
  activeId,
  loading,
  onSelect,
  onCreate,
  onDelete,
}) => {
  const shells = records.filter((r) => r.processLevel === 'shell');
  const subs = records.filter((r) => r.processLevel === 'subprocess');

  const renderCard = (record: RopaRecord, indented = false) => (
    <div
      key={record.id}
      onClick={() => onSelect(record.id)}
      className={`p-3 rounded-lg border cursor-pointer transition-all ${indented ? 'ml-4' : ''} ${
        activeId === record.id
          ? 'border-teal-500 bg-teal-50 shadow-sm'
          : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
      }`}
    >
      <div className="flex items-start justify-between gap-1">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-slate-800 truncate">{record.title}</p>
          <p className="text-[10px] text-slate-500 truncate mt-0.5">{record.bpmnProcessId}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span
            className={`text-[9px] font-semibold px-1.5 py-0.5 rounded uppercase ${STATUS_COLOUR[record.status]}`}
          >
            {record.status}
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(record.id);
            }}
            className="p-1 hover:bg-red-100 hover:text-red-600 text-slate-400 rounded"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="w-80 bg-white border-r border-slate-200 flex flex-col">
      <div className="h-14 bg-slate-50 border-b border-slate-200 px-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">ROPA RECORDS</h2>
        <button
          onClick={onCreate}
          className="p-2 rounded-lg bg-teal-600 text-white hover:bg-teal-700 transition-colors"
          title="New RoPA record"
        >
          <Plus size={16} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {loading ? (
          <p className="text-xs text-slate-400 text-center py-8">Loading…</p>
        ) : records.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-8">No records yet</p>
        ) : (
          <>
            {shells.map((s) => renderCard(s))}
            {subs.map((sub) => (
              <div key={sub.id} className="flex items-start gap-1">
                <div className="mt-3 ml-2 text-slate-300 select-none">└</div>
                <div className="flex-1">{renderCard(sub, true)}</div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
};

export default RopaList;
