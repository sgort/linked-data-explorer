import { useDraggable } from '@dnd-kit/core';
import { CheckCircle, Database, GripVertical } from 'lucide-react';
import React from 'react';

import { DmnModel } from '../../types';

interface DmnListProps {
  dmns: DmnModel[];
  usedDmnIds: string[];
  isLoading: boolean;
}

interface DraggableDmnCardProps {
  dmn: DmnModel;
  isUsed: boolean;
}

const DraggableDmnCard: React.FC<DraggableDmnCardProps> = ({ dmn, isUsed }) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: dmn.identifier,
    disabled: isUsed,
  });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`
        p-3 bg-white rounded-lg border-2 shadow-sm
        transition-all duration-150
        ${isDragging ? 'border-blue-500 shadow-lg rotate-2 opacity-50' : 'border-slate-200'}
        ${isUsed ? 'opacity-50 cursor-not-allowed' : 'cursor-grab hover:border-blue-300 hover:shadow-md active:cursor-grabbing'}
      `}
    >
      <div className="flex items-start gap-2">
        {/* Drag Handle */}
        {!isUsed && (
          <div className="text-slate-400 mt-1">
            <GripVertical size={16} />
          </div>
        )}

        {/* Icon */}
        <div
          className={`
          w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5
          ${isUsed ? 'bg-green-500' : 'bg-blue-500'}
        `}
        >
          {isUsed ? (
            <CheckCircle size={16} className="text-white" />
          ) : (
            <span className="text-white text-xs font-bold">{dmn.identifier.substring(0, 2)}</span>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm text-slate-900 truncate">{dmn.identifier}</div>
          <div className="text-xs text-slate-500 mt-0.5">
            {dmn.inputs.length} input{dmn.inputs.length !== 1 ? 's' : ''} → {dmn.outputs.length}{' '}
            output{dmn.outputs.length !== 1 ? 's' : ''}
          </div>
          {dmn.description && (
            <div className="text-xs text-slate-400 mt-1 line-clamp-2">{dmn.description}</div>
          )}
        </div>

        {/* Status Badge */}
        {isUsed && (
          <div className="flex-shrink-0">
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
              In Chain
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * Left panel: List of draggable DMNs
 */
const DmnList: React.FC<DmnListProps> = ({ dmns, usedDmnIds, isLoading }) => {
  if (isLoading) {
    return (
      <div className="w-80 bg-white border-r border-slate-200 flex items-center justify-center">
        <div className="text-slate-400">Loading DMNs...</div>
      </div>
    );
  }

  return (
    <div className="w-80 bg-white border-r border-slate-200 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <Database size={20} className="text-blue-600" />
          <h2 className="font-semibold text-slate-900">Available DMNs</h2>
        </div>
        <p className="text-xs text-slate-500 mt-1">Drag DMNs to build your chain</p>
      </div>

      {/* DMN List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {dmns.map((dmn) => {
          const isUsed = usedDmnIds.includes(dmn.identifier);
          return <DraggableDmnCard key={dmn.identifier} dmn={dmn} isUsed={isUsed} />;
        })}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-slate-200 bg-slate-50">
        <div className="text-xs text-slate-500">
          {dmns.length} DMN{dmns.length !== 1 ? 's' : ''} available • {usedDmnIds.length} in chain
        </div>
      </div>
    </div>
  );
};

export default DmnList;
