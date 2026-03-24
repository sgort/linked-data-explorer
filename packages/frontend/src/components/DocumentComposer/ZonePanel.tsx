/**
 * ZonePanel
 *
 * Destination: packages/frontend/src/components/DocumentComposer/ZonePanel.tsx
 *
 * A named drop-zone for document blocks.
 * - useDroppable accepts new blocks dragged from ContentLibrary / AssetLibrary
 * - SortableContext / useSortable handles reordering within the zone
 */

import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { ChevronDown, ChevronUp } from 'lucide-react';
import React, { useState } from 'react';

import { DocumentBlock, ZONE_META, ZoneId } from '../../types/document.types';
import BlockItem from './BlockItem';

interface ZonePanelProps {
  zoneId: ZoneId;
  blocks: DocumentBlock[];
  readonly: boolean;
  onUpdateBlock: (zoneId: ZoneId, blockId: string, updates: Partial<DocumentBlock>) => void;
  onDeleteBlock: (zoneId: ZoneId, blockId: string) => void;
}

const ZONE_COLORS: Record<ZoneId, string> = {
  letterhead: 'border-l-blue-500',
  contactInformation: 'border-l-cyan-500',
  reference: 'border-l-amber-500',
  body: 'border-l-green-500',
  closing: 'border-l-orange-500',
  signOff: 'border-l-purple-500',
  annex: 'border-l-slate-400',
};

const ZonePanel: React.FC<ZonePanelProps> = ({
  zoneId,
  blocks,
  readonly,
  onUpdateBlock,
  onDeleteBlock,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const meta = ZONE_META[zoneId];
  const color = ZONE_COLORS[zoneId] ?? 'border-l-slate-300';

  const { setNodeRef, isOver } = useDroppable({
    id: `zone-${zoneId}`,
    data: { zoneId },
  });

  const blockIds = blocks.map((b) => b.id);

  return (
    <div
      className={`
        border border-slate-200 rounded-lg border-l-4 ${color}
        transition-colors duration-150
        ${isOver ? 'bg-blue-50 border-blue-300' : 'bg-white'}
      `}
    >
      {/* Zone header */}
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 transition-colors rounded-t-lg"
      >
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm text-slate-700">{meta.label}</span>
          <span className="text-xs text-slate-400">— {meta.description}</span>
          <span className="text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">
            {blocks.length} {blocks.length === 1 ? 'block' : 'blocks'}
          </span>
        </div>
        {collapsed ? (
          <ChevronDown size={14} className="text-slate-400" />
        ) : (
          <ChevronUp size={14} className="text-slate-400" />
        )}
      </button>

      {/* Zone body */}
      {!collapsed && (
        <div ref={setNodeRef} className="px-4 pb-4 pt-1 space-y-2 min-h-[48px]">
          <SortableContext items={blockIds} strategy={verticalListSortingStrategy}>
            {blocks.map((block) => (
              <BlockItem
                key={block.id}
                block={block}
                zoneId={zoneId}
                readonly={readonly}
                onUpdate={onUpdateBlock}
                onDelete={onDeleteBlock}
              />
            ))}
          </SortableContext>

          {blocks.length === 0 && (
            <div
              className={`
                border-2 border-dashed rounded-md py-4 text-center
                ${isOver ? 'border-blue-400 text-blue-500' : 'border-slate-200 text-slate-300'}
              `}
            >
              <p className="text-xs">Drag a block here</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ZonePanel;
