import { useDraggable } from '@dnd-kit/core';
import { CheckCircle, Database, Loader2, Search, X } from 'lucide-react';
import React, { useMemo, useState } from 'react';

import { DmnModel } from '../../types';
import ValidationBadge from './ValidationBadge';

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
        {/* Icon/Logo + Content */}
        <div className="flex items-start gap-3">
          {/* Icon/Logo */}
          <div
            className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center overflow-hidden ${
              isUsed ? 'bg-green-500' : 'bg-blue-500'
            }`}
          >
            {dmn.logoUrl ? (
              <img
                src={dmn.logoUrl}
                alt={dmn.organizationName || 'Organization logo'}
                className="w-full h-full object-contain p-1 bg-white"
                title={dmn.organizationName || 'Organization'}
                onError={(e) => {
                  // Fallback to initials if image fails to load
                  const img = e.target as HTMLImageElement;
                  img.style.display = 'none';
                  const parent = img.parentElement;
                  if (parent) {
                    parent.innerHTML = `<span class="text-white text-xs font-bold">${dmn.identifier.substring(0, 2)}</span>`;
                  }
                }}
              />
            ) : isUsed ? (
              <CheckCircle size={16} className="text-white" />
            ) : (
              <span className="text-white text-xs font-bold">{dmn.identifier.substring(0, 2)}</span>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm text-slate-900 truncate">{dmn.identifier}</div>

            {/* NEW: Validation Badge */}
            {dmn.validationStatus && dmn.validationStatus !== 'not-validated' && (
              <div className="mt-1">
                <ValidationBadge
                  status={dmn.validationStatus}
                  validatedByName={dmn.validatedByName}
                  validatedAt={dmn.validatedAt}
                  compact={true}
                />
              </div>
            )}

            <div className="text-xs text-slate-500 mt-0.5">
              {dmn.inputs.length} input{dmn.inputs.length !== 1 ? 's' : ''} → {dmn.outputs.length}{' '}
              output{dmn.outputs.length !== 1 ? 's' : ''}
            </div>
            {dmn.description && (
              <div className="text-xs text-slate-400 mt-1 line-clamp-2">{dmn.description}</div>
            )}
            {/* NEW: Show organization name if available */}
            {dmn.organizationName && (
              <div className="text-xs text-blue-600 mt-1 truncate" title={dmn.organizationName}>
                {dmn.organizationName}
              </div>
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
  const [searchTerm, setSearchTerm] = useState('');

  // Filter DMNs based on search term
  const filteredDmns = useMemo(() => {
    if (!searchTerm.trim()) {
      return dmns;
    }

    const searchLower = searchTerm.toLowerCase();
    return dmns.filter((dmn) => {
      // Search in identifier
      if (dmn.identifier.toLowerCase().includes(searchLower)) {
        return true;
      }

      // Search in description
      if (dmn.description?.toLowerCase().includes(searchLower)) {
        return true;
      }

      // Search in input variable names
      if (dmn.inputs.some((input) => input.identifier.toLowerCase().includes(searchLower))) {
        return true;
      }

      // Search in output variable names
      if (dmn.outputs.some((output) => output.identifier.toLowerCase().includes(searchLower))) {
        return true;
      }

      return false;
    });
  }, [dmns, searchTerm]);

  const clearSearch = () => {
    setSearchTerm('');
  };

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
        <div className="flex items-center gap-2 mb-3">
          <Database size={20} className="text-blue-600" />
          <h2 className="font-semibold text-slate-900">Available DMNs</h2>
        </div>
        <p className="text-xs text-slate-500 mb-3">Drag DMNs to build your chain</p>

        {/* Search Bar */}
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search size={16} className="text-slate-400" />
          </div>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search DMNs..."
            className="w-full pl-9 pr-9 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          {searchTerm && (
            <button
              onClick={clearSearch}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
              aria-label="Clear search"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* DMN List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {filteredDmns.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4">
            <Search size={40} className="text-slate-300 mb-3" />
            <p className="text-sm font-medium text-slate-700 text-center">No DMNs found</p>
            <p className="text-xs text-slate-500 mt-1 text-center">Try a different search term</p>
            {searchTerm && (
              <button
                onClick={clearSearch}
                className="mt-3 text-xs text-blue-600 hover:text-blue-700 font-medium"
              >
                Clear search
              </button>
            )}
          </div>
        ) : (
          filteredDmns.map((dmn) => {
            const isUsed = usedDmnIds.includes(dmn.identifier);
            return <DraggableDmnCard key={dmn.identifier} dmn={dmn} isUsed={isUsed} />;
          })
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-slate-200 bg-slate-50">
        <div className="text-xs text-slate-500">
          {searchTerm ? (
            <>
              Showing {filteredDmns.length} of {dmns.length} DMN{dmns.length !== 1 ? 's' : ''} •{' '}
              {usedDmnIds.length} in chain
            </>
          ) : (
            <>
              {dmns.length} DMN{dmns.length !== 1 ? 's' : ''} available • {usedDmnIds.length} in
              chain
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default DmnList;
