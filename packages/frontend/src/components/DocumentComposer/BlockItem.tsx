/**
 * BlockItem
 *
 * Destination: packages/frontend/src/components/DocumentComposer/BlockItem.tsx
 *
 * A single sortable block rendered inside a ZonePanel.
 * Uses dnd-kit useSortable, following the exact same pattern as SortableChainItem in ChainComposer.tsx.
 */

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Image as ImageIcon, Minus, Space, Trash2, Variable } from 'lucide-react';
import React from 'react';

import { DocumentBlock, ZoneId } from '../../types/document.types';
import TextBlockEditor from './TextBlockEditor';

interface BlockItemProps {
  block: DocumentBlock;
  zoneId: ZoneId;
  readonly: boolean;
  onUpdate: (zoneId: ZoneId, blockId: string, updates: Partial<DocumentBlock>) => void;
  onDelete: (zoneId: ZoneId, blockId: string) => void;
}

const BlockItem: React.FC<BlockItemProps> = ({ block, zoneId, readonly, onUpdate, onDelete }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: block.id,
    data: { type: 'existing-block', blockId: block.id, sourceZoneId: zoneId },
    disabled: readonly,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="group relative">
      <div
        className={`
          border rounded-md bg-white transition-all duration-100
          ${isDragging ? 'border-blue-400 shadow-lg' : 'border-slate-200 hover:border-slate-300'}
        `}
      >
        {/* Block header bar */}
        <div className="flex items-center gap-1.5 px-2 py-1 border-b border-slate-100 bg-slate-50 rounded-t-md">
          {!readonly && (
            <button
              {...listeners}
              {...attributes}
              className="cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 p-0.5"
              title="Move"
            >
              <GripVertical size={13} />
            </button>
          )}
          <BlockTypeIcon type={block.type} />
          <span className="text-xs text-slate-500 flex-1 truncate">
            {block.label ?? block.type}
          </span>
          {!readonly && (
            <button
              onClick={() => onDelete(zoneId, block.id)}
              className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded text-slate-300 hover:text-red-500 hover:bg-red-50"
              title="Delete block"
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>

        {/* Block content */}
        <div className="rounded-b-md overflow-hidden">
          {block.type === 'text' && (
            <TextBlockEditor
              content={block.content}
              readonly={readonly}
              onChange={(doc) => onUpdate(zoneId, block.id, { content: doc })}
            />
          )}

          {block.type === 'image' && (
            <div className="p-3">
              {block.assetUrl ? (
                <img
                  src={block.assetUrl}
                  alt={block.label ?? 'Image'}
                  className="max-h-24 object-contain"
                  title={block.assetUrl}
                />
              ) : (
                <div className="flex items-center gap-2 text-slate-400 text-sm py-2">
                  <ImageIcon size={16} />
                  <span>No image selected</span>
                </div>
              )}
            </div>
          )}

          {block.type === 'variable' && (
            <div className="px-3 py-2 flex items-center gap-2">
              <Variable size={14} className="text-purple-500 flex-shrink-0" />
              <span className="text-xs font-mono text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                {`{{${block.variableKey ?? '?'}}}`}
              </span>
              {block.label && <span className="text-xs text-slate-400">{block.label}</span>}
            </div>
          )}

          {block.type === 'separator' && (
            <div className="px-3 py-2">
              <div className="border-t border-slate-300" />
            </div>
          )}

          {block.type === 'spacer' && (
            <div className="px-3 py-2 flex items-center gap-2 text-slate-300">
              <Space size={14} />
              <span className="text-xs">Empty space</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const BlockTypeIcon: React.FC<{ type: DocumentBlock['type'] }> = ({ type }) => {
  const cls = 'flex-shrink-0';
  switch (type) {
    case 'text':
      return <span className={`${cls} text-[10px] font-bold text-slate-400`}>ABC</span>;
    case 'image':
      return <ImageIcon size={11} className={`${cls} text-slate-400`} />;
    case 'variable':
      return <Variable size={11} className={`${cls} text-purple-400`} />;
    case 'separator':
      return <Minus size={11} className={`${cls} text-slate-400`} />;
    case 'spacer':
      return <Space size={11} className={`${cls} text-slate-400`} />;
  }
};

export default BlockItem;
