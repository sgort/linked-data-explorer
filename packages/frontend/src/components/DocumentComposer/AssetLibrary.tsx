/**
 * AssetLibrary
 *
 * Destination: packages/frontend/src/components/DocumentComposer/AssetLibrary.tsx
 *
 * Left panel — "Afbeeldingen" tab.
 * Fetches assets from /v1/triplydb/assets via assetService.
 * Each asset card is draggable; dropping onto a zone creates an image block.
 */

import { useDraggable } from '@dnd-kit/core';
import { Image as ImageIcon, Loader2, RefreshCw } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';

import { fetchAssets } from '../../services/assetService';
import { DocumentAsset } from '../../types/document.types';

interface AssetLibraryProps {
  endpoint: string;
}

const AssetLibrary: React.FC<AssetLibraryProps> = ({ endpoint }) => {
  const [assets, setAssets] = useState<DocumentAsset[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAssets = useCallback(
    async (force = false) => {
      if (!endpoint) return;
      setIsLoading(true);
      setError(null);
      try {
        const result = await fetchAssets(endpoint, force);
        // Filter to image types only
        setAssets(result.filter((a) => /\.(png|jpe?g|gif|svg|webp)$/i.test(a.name)));
      } catch {
        setError('Failed to load images');
      } finally {
        setIsLoading(false);
      }
    },
    [endpoint]
  );

  useEffect(() => {
    void loadAssets();
  }, [loadAssets]);

  if (!endpoint) {
    return (
      <p className="text-xs text-slate-400 px-1">Select a TriplyDB endpoint to load images.</p>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-slate-400 px-1">Drag a logo to a zone</p>
        <button
          onClick={() => loadAssets(true)}
          disabled={isLoading}
          className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          title="Refresh"
        >
          <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-slate-400 text-sm py-4 justify-center">
          <Loader2 size={14} className="animate-spin" />
          <span>Loading…</span>
        </div>
      )}

      {error && <p className="text-xs text-red-500 px-1">{error}</p>}

      {!isLoading && !error && assets.length === 0 && (
        <p className="text-xs text-slate-400 px-1">No images found in this dataset.</p>
      )}

      <div className="space-y-2">
        {assets.map((asset) => (
          <DraggableAssetCard key={asset.id} asset={asset} />
        ))}
      </div>
    </div>
  );
};

interface DraggableAssetCardProps {
  asset: DocumentAsset;
}

const DraggableAssetCard: React.FC<DraggableAssetCardProps> = ({ asset }) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `asset-${asset.id}`,
    data: { type: 'new-block', blockType: 'image', assetUrl: asset.url, label: asset.name },
  });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        opacity: isDragging ? 0.5 : 1,
      }
    : undefined;

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      <div className="flex items-center gap-2 p-2 rounded-lg border border-slate-200 bg-white cursor-grab active:cursor-grabbing hover:border-green-300 hover:bg-green-50 transition-all">
        <div className="w-10 h-10 flex-shrink-0 bg-slate-100 rounded flex items-center justify-center overflow-hidden">
          <img
            src={asset.url}
            alt={asset.name}
            className="w-full h-full object-contain"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-slate-700 truncate">{asset.name}</p>
          <p className="text-[10px] text-slate-400">
            {asset.size ? `${Math.round(asset.size / 1024)} KB` : 'Unknown size'}
          </p>
        </div>
        <ImageIcon size={12} className="text-slate-300 flex-shrink-0" />
      </div>
    </div>
  );
};

export default AssetLibrary;
