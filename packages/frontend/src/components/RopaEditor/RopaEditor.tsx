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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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

  const handleSave = async (record: RopaRecord) => {
    const id = await RopaService.upsertRopa(record);
    await load();
    setActiveId(id);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this RoPA record? This cannot be undone.')) return;
    await RopaService.deleteRopa(id);
    if (activeId === id) setActiveId(null);
    await load();
  };

  const handleCreate = () => {
    // Open editor with a blank record — id is undefined (new)
    setActiveId('__new__');
  };

  return (
    <div className="flex h-full overflow-hidden">
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
