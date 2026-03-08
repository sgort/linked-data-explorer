/**
 * DocumentCanvas
 *
 * Destination: packages/frontend/src/components/DocumentComposer/DocumentCanvas.tsx
 *
 * Middle panel. Renders all zones in order, handles incoming drops from the left panel,
 * and manages block state for the active template.
 */

import { DragEndEvent, DragOverEvent } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { Download, FilePlus, PlusCircle, Save, Trash2 } from 'lucide-react';
import React, { useCallback } from 'react';

import {
  DocumentBlock,
  DocumentTemplate,
  DocumentZones,
  DragData,
  ZONE_META,
  ZONE_ORDER,
  ZoneId,
} from '../../types/document.types';
import ZonePanel from './ZonePanel';

interface DocumentCanvasProps {
  template: DocumentTemplate;
  hasChanges: boolean;
  onTemplateChange: (updated: DocumentTemplate) => void;
  onSave: () => void;
  onSaveAs: () => void;
  onExport: () => void;
  onClose: () => void;
  // Called by parent DndContext via onDragEnd — passed down
  dragEndEvent: DragEndEvent | null;
  dragOverEvent: DragOverEvent | null;
}

/** Generate a stable short block ID */
function blockId(): string {
  return `blk_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

/** Create a new empty block from DragData */
function createBlock(dragData: DragData): DocumentBlock {
  const id = blockId();
  switch (dragData.blockType) {
    case 'text':
      return {
        id,
        type: 'text',
        label: 'Text block',
        content: { type: 'doc', content: [{ type: 'paragraph' }] },
      };
    case 'image':
      return {
        id,
        type: 'image',
        label: dragData.label ?? 'Image',
        assetUrl: dragData.assetUrl,
      };
    case 'variable':
      return {
        id,
        type: 'variable',
        label: dragData.label ?? 'Variable',
        variableKey: dragData.variableKey ?? '',
      };
    case 'separator':
      return { id, type: 'separator', label: 'Separator' };
    case 'spacer':
      return { id, type: 'spacer', label: 'Space' };
    default:
      return { id, type: 'text', label: 'Block' };
  }
}

const DocumentCanvas: React.FC<DocumentCanvasProps> = ({
  template,
  hasChanges,
  onTemplateChange,
  onSave,
  onSaveAs,
  onExport,
  onClose,
  dragEndEvent,
  dragOverEvent: _dragOverEvent, // reserved for future hover highlighting
}) => {
  const readonly = template.readonly === true;

  // ─── Zone helpers ────────────────────────────────────────────────────────

  const updateZones = useCallback(
    (updater: (zones: DocumentZones) => DocumentZones) => {
      onTemplateChange({ ...template, zones: updater(template.zones) });
    },
    [template, onTemplateChange]
  );

  const getZoneBlocks = (zoneId: ZoneId): DocumentBlock[] => {
    const zone = template.zones[zoneId];
    return zone?.blocks ?? [];
  };

  // ─── Block operations ────────────────────────────────────────────────────

  const handleUpdateBlock = (zoneId: ZoneId, blockId: string, updates: Partial<DocumentBlock>) => {
    updateZones((zones) => {
      const zone = zones[zoneId];
      if (!zone) return zones;
      return {
        ...zones,
        [zoneId]: {
          ...zone,
          blocks: zone.blocks.map((b) => (b.id === blockId ? { ...b, ...updates } : b)),
        },
      };
    });
  };

  const handleDeleteBlock = (zoneId: ZoneId, blockId: string) => {
    updateZones((zones) => {
      const zone = zones[zoneId];
      if (!zone) return zones;
      return {
        ...zones,
        [zoneId]: { ...zone, blocks: zone.blocks.filter((b) => b.id !== blockId) },
      };
    });
  };

  // ─── DnD drop resolution (called from parent DndContext via prop) ─────────

  React.useEffect(() => {
    if (!dragEndEvent || readonly) return;
    const { active, over } = dragEndEvent;
    if (!over) return;

    const activeData = active.data.current as DragData | undefined;
    const overId = String(over.id);

    // ── Drop new block from library onto a zone ──
    if (activeData?.type === 'new-block') {
      const targetZoneId = overId.startsWith('zone-') ? (overId.slice(5) as ZoneId) : null;

      if (!targetZoneId || !(targetZoneId in ZONE_META)) return;

      const newBlock = createBlock(activeData);
      updateZones((zones) => {
        const zone = zones[targetZoneId] ?? { blocks: [] };
        return { ...zones, [targetZoneId]: { blocks: [...zone.blocks, newBlock] } };
      });
      return;
    }

    // ── Reorder existing block within or across zones ──
    if (activeData?.type === 'existing-block') {
      const sourceZoneId = activeData.sourceZoneId!;
      const activeBlockId = activeData.blockId!;

      // Dropped onto a zone droppable (not a specific block) — move to end of zone
      if (overId.startsWith('zone-')) {
        const targetZoneId = overId.slice(5) as ZoneId;
        if (sourceZoneId === targetZoneId) return;

        updateZones((zones) => {
          const sourceZone = zones[sourceZoneId];
          const targetZone = zones[targetZoneId] ?? { blocks: [] };
          if (!sourceZone) return zones;

          const movingBlock = sourceZone.blocks.find((b) => b.id === activeBlockId);
          if (!movingBlock) return zones;

          return {
            ...zones,
            [sourceZoneId]: {
              blocks: sourceZone.blocks.filter((b) => b.id !== activeBlockId),
            },
            [targetZoneId]: {
              blocks: [...targetZone.blocks, movingBlock],
            },
          };
        });
        return;
      }

      // Dropped onto another block — find target zone and reorder
      updateZones((zones) => {
        // Find which zone contains the target block
        const targetZoneId = (Object.keys(zones) as ZoneId[]).find((zid) => {
          const z = zones[zid];
          return z?.blocks.some((b) => b.id === overId);
        });

        if (!targetZoneId) return zones;

        if (sourceZoneId === targetZoneId) {
          // Same zone — reorder
          const zone = zones[sourceZoneId]!;
          const oldIndex = zone.blocks.findIndex((b) => b.id === activeBlockId);
          const newIndex = zone.blocks.findIndex((b) => b.id === overId);
          if (oldIndex === -1 || newIndex === -1) return zones;
          return {
            ...zones,
            [sourceZoneId]: { blocks: arrayMove(zone.blocks, oldIndex, newIndex) },
          };
        }

        // Cross-zone move to specific position
        const sourceZone = zones[sourceZoneId]!;
        const targetZone = zones[targetZoneId]!;
        const movingBlock = sourceZone.blocks.find((b) => b.id === activeBlockId);
        if (!movingBlock) return zones;
        const targetIndex = targetZone.blocks.findIndex((b) => b.id === overId);

        const newTargetBlocks = [...targetZone.blocks];
        newTargetBlocks.splice(targetIndex, 0, movingBlock);

        return {
          ...zones,
          [sourceZoneId]: { blocks: sourceZone.blocks.filter((b) => b.id !== activeBlockId) },
          [targetZoneId]: { blocks: newTargetBlocks },
        };
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragEndEvent]);

  // ─── Annex toggle ────────────────────────────────────────────────────────

  const handleToggleAnnex = () => {
    onTemplateChange({
      ...template,
      zones: {
        ...template.zones,
        annex: template.zones.annex ? null : { blocks: [] },
      },
    });
  };

  // ─── Render ──────────────────────────────────────────────────────────────

  const visibleZones = ZONE_ORDER.filter((zid) => {
    if (zid === 'annex') return template.zones.annex != null;
    return true;
  });

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="h-12 border-b border-slate-200 bg-white flex items-center justify-between px-4 flex-shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={onSave}
            disabled={!hasChanges || readonly}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              hasChanges && !readonly
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-slate-100 text-slate-300 cursor-not-allowed'
            }`}
          >
            <Save size={14} />
            Save
          </button>

          <button
            onClick={onSaveAs}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
          >
            <FilePlus size={14} />
            Save as…
          </button>

          <button
            onClick={onExport}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
          >
            <Download size={14} />
            Export .document
          </button>
        </div>

        <div className="flex items-center gap-2">
          {readonly && (
            <span className="text-[10px] px-2 py-1 rounded bg-blue-100 text-blue-700 font-medium">
              READ-ONLY — use &quot;Save as&quot; to edit
            </span>
          )}
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors"
          >
            Close
          </button>
        </div>
      </div>

      {/* Zone canvas */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50">
        {/* A4-style document container */}
        <div className="max-w-3xl mx-auto space-y-3">
          {/* Briefhoofd + Contactgegevens side by side */}
          <div className="grid grid-cols-2 gap-3">
            <ZonePanel
              key="contactInformation"
              zoneId="contactInformation"
              blocks={getZoneBlocks('contactInformation')}
              readonly={readonly}
              onUpdateBlock={handleUpdateBlock}
              onDeleteBlock={handleDeleteBlock}
            />
            <ZonePanel
              key="letterhead"
              zoneId="letterhead"
              blocks={getZoneBlocks('letterhead')}
              readonly={readonly}
              onUpdateBlock={handleUpdateBlock}
              onDeleteBlock={handleDeleteBlock}
            />
          </div>

          {/* Remaining zones stacked */}
          {visibleZones
            .filter((zoneId) => zoneId !== 'letterhead' && zoneId !== 'contactInformation')
            .map((zoneId) => (
              <ZonePanel
                key={zoneId}
                zoneId={zoneId}
                blocks={getZoneBlocks(zoneId)}
                readonly={readonly}
                onUpdateBlock={handleUpdateBlock}
                onDeleteBlock={handleDeleteBlock}
              />
            ))}

          {/* Annex toggle */}
          {!readonly && (
            <button
              type="button"
              onClick={handleToggleAnnex}
              className={`
                w-full py-2.5 rounded-lg border-2 border-dashed text-xs transition-colors flex items-center justify-center gap-2
                ${
                  template.zones.annex
                    ? 'border-red-200 text-red-400 hover:bg-red-50'
                    : 'border-slate-200 text-slate-400 hover:border-slate-300 hover:bg-white'
                }
              `}
            >
              {template.zones.annex ? (
                <>
                  <Trash2 size={12} />
                  Remove annex
                </>
              ) : (
                <>
                  <PlusCircle size={12} />
                  Add annex
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default DocumentCanvas;
