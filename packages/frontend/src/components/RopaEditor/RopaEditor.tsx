import { ShieldCheck } from 'lucide-react';
import React, { useEffect, useState } from 'react';

import { RopaService } from '../../services/ropaService';
import { RopaRecord } from '../../types/ropa.types';
import RopaList from './RopaList';
import RopaRecordEditor from './RopaRecordEditor';

const RopaEditor: React.FC = () => {
  const [records, setRecords] = useState<RopaRecord[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setRecords(await RopaService.listRopa());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load RoPA records');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const active = records.find((r) => r.id === activeId) ?? null;

  // #156: unlike handleDelete below, this one was never actually
  // fire-and-forget — RopaRecordEditor's own handleSave already awaits
  // `onSave` (this function) in a try/catch and shows a rejection inline
  // next to its Save button (`saveError`). This must NOT catch here: doing
  // so (as an earlier pass of this fix did) swallows the rejection before
  // it ever reaches that existing handler and makes the inline display
  // unreachable. Left to reject, same as before #156 touched this file.
  const handleSave = async (record: RopaRecord) => {
    const id = await RopaService.upsertRopa(record);
    setError(null);
    await load();
    setActiveId(id);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this RoPA record? This cannot be undone.')) return;
    try {
      await RopaService.deleteRopa(id);
      setError(null);
      if (activeId === id) setActiveId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete RoPA record');
    }
  };

  const handleCreate = () => {
    // Open editor with a blank record — id is undefined (new)
    setActiveId('__new__');
  };

  return (
    <div className="flex h-full overflow-hidden relative">
      {error && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-50 text-xs px-3 py-1.5 rounded-lg bg-red-50 text-red-700 border border-red-200 shadow">
          ✗ {error}
        </div>
      )}
      <RopaList
        records={records}
        activeId={activeId}
        loading={loading}
        onSelect={setActiveId}
        onCreate={handleCreate}
        onDelete={handleDelete}
      />
      <div className="flex-1 overflow-hidden">
        {activeId === null ? (
          <div className="flex items-center justify-center h-full text-slate-400">
            <div className="text-center">
              <ShieldCheck size={48} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">Select a record or create a new one</p>
            </div>
          </div>
        ) : (
          <RopaRecordEditor
            key={activeId}
            record={active}
            onSave={handleSave}
            onCancel={() => setActiveId(null)}
          />
        )}
      </div>
    </div>
  );
};

export default RopaEditor;
