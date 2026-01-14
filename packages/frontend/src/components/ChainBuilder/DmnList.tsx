import { useDraggable } from '@dnd-kit/core';
import { CheckCircle, Database, Loader2 } from 'lucide-react';
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
        opacity: isDragging ? 0.5 : 1,
      }
    : undefined;

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      <div
        className={`
        p-3 rounded-lg border-2 bg-white shadow-sm
        transition-all duration-150
        ${
          isUsed
            ? 'border-green-300 bg-green-50 cursor-not-allowed opacity-60'
            : 'border-slate-200 hover:border-blue-400 hover:shadow-md cursor-grab active:cursor-grabbing'
        }
      `}
      >
        {/* Icon */}
        <div className="flex items-start gap-3">
          <div
            className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${
              isUsed ? 'bg-green-500' : 'bg-blue-500'
            }`}
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
    </div>
  );
};

/**
 * Skeleton card for loading state
 */
const SkeletonCard: React.FC = () => {
  return (
    <div className="p-3 rounded-lg border-2 border-slate-200 bg-white shadow-sm animate-pulse">
      <div className="flex items-start gap-3">
        {/* Icon skeleton */}
        <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-slate-200"></div>

        {/* Content skeleton */}
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-slate-200 rounded w-3/4"></div>
          <div className="h-3 bg-slate-200 rounded w-1/2"></div>
          <div className="h-3 bg-slate-200 rounded w-full"></div>
        </div>
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
      <div className="w-80 bg-white border-r border-slate-200 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <Database size={20} className="text-blue-600" />
            <h2 className="font-semibold text-slate-900">Available DMNs</h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">Drag DMNs to build your chain</p>
        </div>

        {/* Loading State */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Centered Loading Indicator */}
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 size={40} className="text-blue-600 animate-spin mb-4" />
            <p className="text-sm font-medium text-slate-700">Loading DMNs...</p>
            <p className="text-xs text-slate-500 mt-1">Fetching from TriplyDB</p>
          </div>

          {/* Skeleton Cards */}
          <div className="space-y-2 mt-4">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50">
          <div className="text-xs text-slate-500 flex items-center gap-2">
            <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse"></div>
            Loading available DMNs...
          </div>
        </div>
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
