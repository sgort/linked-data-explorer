/**
 * ContentLibrary
 *
 * Destination: packages/frontend/src/components/DocumentComposer/ContentLibrary.tsx
 *
 * Left panel — "Content" tab.
 * Each card is a useDraggable item that carries DragData { type: 'new-block', blockType }.
 * Follows the exact same pattern as DraggableDmnCard in DmnList.tsx.
 */

import { useDraggable } from '@dnd-kit/core';
import { Image as ImageIcon, Minus, Space, Type, Variable } from 'lucide-react';
import React from 'react';

import { BlockType } from '../../types/document.types';

interface ContentItem {
  blockType: BlockType;
  label: string;
  description: string;
  icon: React.ReactNode;
  color: string;
}

const CONTENT_ITEMS: ContentItem[] = [
  {
    blockType: 'text',
    label: 'Text',
    description: 'Free text with formatting',
    icon: <Type size={16} />,
    color: 'text-blue-600 bg-blue-50 border-blue-200',
  },
  {
    blockType: 'variable',
    label: 'Variable',
    description: 'Process value at this position',
    icon: <Variable size={16} />,
    color: 'text-purple-600 bg-purple-50 border-purple-200',
  },
  {
    blockType: 'image',
    label: 'Image',
    description: 'Logo or illustration',
    icon: <ImageIcon size={16} />,
    color: 'text-green-600 bg-green-50 border-green-200',
  },
  {
    blockType: 'separator',
    label: 'Separator',
    description: 'Horizontal line',
    icon: <Minus size={16} />,
    color: 'text-slate-600 bg-slate-50 border-slate-200',
  },
  {
    blockType: 'spacer',
    label: 'Spacer',
    description: 'Empty space',
    icon: <Space size={16} />,
    color: 'text-slate-500 bg-slate-50 border-slate-200',
  },
];

interface DraggableContentCardProps {
  item: ContentItem;
}

const DraggableContentCard: React.FC<DraggableContentCardProps> = ({ item }) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `new-block-${item.blockType}`,
    data: { type: 'new-block', blockType: item.blockType },
  });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        opacity: isDragging ? 0.5 : 1,
      }
    : undefined;

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      <div
        className={`
          flex items-center gap-3 p-3 rounded-lg border cursor-grab active:cursor-grabbing
          transition-all duration-150
          ${item.color}
          hover:shadow-sm hover:scale-[1.01]
        `}
      >
        <div className="flex-shrink-0">{item.icon}</div>
        <div>
          <div className="text-sm font-medium">{item.label}</div>
          <div className="text-xs opacity-70">{item.description}</div>
        </div>
      </div>
    </div>
  );
};

const ContentLibrary: React.FC = () => (
  <div className="space-y-2">
    <p className="text-xs text-slate-400 px-1 mb-3">Drag a block type to a zone in the document</p>
    {CONTENT_ITEMS.map((item) => (
      <DraggableContentCard key={item.blockType} item={item} />
    ))}
  </div>
);

export default ContentLibrary;
