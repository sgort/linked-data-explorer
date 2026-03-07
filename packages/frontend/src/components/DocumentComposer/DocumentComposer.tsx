/**
 * DocumentComposer
 *
 * Destination: packages/frontend/src/components/DocumentComposer/DocumentComposer.tsx
 *
 * Top-level three-panel layout:
 *   Left  — DocumentList  (template list) + ContentLibrary / AssetLibrary tabs
 *   Middle — DocumentCanvas (editor)
 *   Right  — TemplateLibrary / BindingPanel tabs
 *
 * The DndContext wraps everything. dragEndEvent is passed down to DocumentCanvas
 * which owns the drop resolution logic (same pattern as ChainBuilder).
 */

import {
  closestCenter,
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { FileText, Image as ImageIcon, Layers, Variable } from 'lucide-react';
import React, { useEffect, useState } from 'react';

import { DocumentService } from '../../services/documentService';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { DocumentBlock, DocumentTemplate } from '../../types/document.types';
import AssetLibrary from './AssetLibrary';
import BindingPanel from './BindingPanel';
import ContentLibrary from './ContentLibrary';
import { DEFAULT_TEMPLATES } from './defaultTemplates';
import DocumentCanvas from './DocumentCanvas';
import DocumentList from './DocumentList';
import TemplateLibrary from './TemplateLibrary';

interface DocumentComposerProps {
  endpoint: string;
}

const DocumentComposer: React.FC<DocumentComposerProps> = ({ endpoint }) => {
  const [templates, setTemplates] = useState<DocumentTemplate[]>(DocumentService.getTemplates());
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [activeDragData, setActiveDragData] = useState<unknown>(null);

  // Drag events forwarded to DocumentCanvas
  const [lastDragEnd, setLastDragEnd] = useState<DragEndEvent | null>(null);
  const [lastDragOver, setLastDragOver] = useState<DragOverEvent | null>(null);

  // Left panel tab: 'content' | 'assets'
  const [leftTab, setLeftTab] = useState<'content' | 'assets'>('content');
  // Right panel tab: 'templates' | 'bindings'
  const [rightTab, setRightTab] = useState<'templates' | 'bindings'>('templates');

  // ─── Seed default templates on first load ──────────────────────────────
  useEffect(() => {
    const existing = DocumentService.getTemplates();
    const existingIds = new Set(existing.map((t) => t.id));
    let seeded = false;

    for (const tmpl of DEFAULT_TEMPLATES) {
      if (!existingIds.has(tmpl.id)) {
        DocumentService.saveTemplate(tmpl);
        seeded = true;
      }
    }

    if (seeded) {
      const all = DocumentService.getTemplates();
      setTemplates(all);
      setActiveTemplateId(DEFAULT_TEMPLATES[0].id);
    } else if (existing.length > 0) {
      setTemplates(existing);
    }
  }, []);

  const activeTemplate = templates.find((t) => t.id === activeTemplateId) ?? null;

  // ─── Template CRUD ─────────────────────────────────────────────────────

  const refreshTemplates = () => setTemplates(DocumentService.getTemplates());

  const handleCreateTemplate = () => {
    const now = new Date().toISOString();
    const newTemplate: DocumentTemplate = {
      id: `doc_${Date.now()}`,
      name: 'New document',
      schemaVersion: 1,
      status: 'wip',
      bindings: [],
      assets: [],
      createdAt: now,
      updatedAt: now,
      zones: {
        letterhead: { blocks: [] },
        contactInformation: { blocks: [] },
        reference: { blocks: [] },
        body: { blocks: [] },
        closing: { blocks: [] },
        signOff: { blocks: [] },
        annex: null,
      },
    };
    DocumentService.saveTemplate(newTemplate);
    refreshTemplates();
    setActiveTemplateId(newTemplate.id);
    setHasChanges(false);
  };

  const handleLoadTemplate = (id: string) => {
    setActiveTemplateId(id);
    setHasChanges(false);
  };

  const handleDeleteTemplate = (id: string) => {
    const t = DocumentService.getTemplate(id);
    if (t?.readonly) {
      alert('Example documents cannot be deleted.');
      return;
    }
    if (!confirm('Delete this document?')) return;
    DocumentService.deleteTemplate(id);
    refreshTemplates();
    if (activeTemplateId === id) setActiveTemplateId(null);
  };

  const handleUpdateTemplateName = (id: string, name: string) => {
    const t = DocumentService.getTemplate(id);
    if (!t) return;
    DocumentService.saveTemplate({ ...t, name, updatedAt: new Date().toISOString() });
    refreshTemplates();
  };

  const handleTemplateChange = (updated: DocumentTemplate) => {
    setHasChanges(true);
    // Optimistic UI — update in memory; only persist on explicit save
    setTemplates((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  };

  const handleSave = () => {
    if (!activeTemplate || activeTemplate.readonly) return;
    DocumentService.saveTemplate({ ...activeTemplate, updatedAt: new Date().toISOString() });
    refreshTemplates();
    setHasChanges(false);
  };

  const handleSaveAs = () => {
    if (!activeTemplate) return;
    const name = prompt('Name for the new document:', `${activeTemplate.name} (copy)`);
    if (!name?.trim()) return;
    const now = new Date().toISOString();
    const newTemplate: DocumentTemplate = {
      ...activeTemplate,
      id: `doc_${Date.now()}`,
      name: name.trim(),
      readonly: false,
      status: 'wip',
      createdAt: now,
      updatedAt: now,
    };
    DocumentService.saveTemplate(newTemplate);
    refreshTemplates();
    setActiveTemplateId(newTemplate.id);
    setHasChanges(false);
  };

  const handleExport = () => {
    if (!activeTemplate) return;
    const blob = new Blob([JSON.stringify(activeTemplate, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeTemplate.id}.document`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleClose = () => setActiveTemplateId(null);

  // ─── Binding panel callbacks ───────────────────────────────────────────

  const handleAddBinding = (binding: Omit<DocumentTemplate['bindings'][0], 'id'>) => {
    if (!activeTemplate) return;
    const updated = {
      ...activeTemplate,
      bindings: [...activeTemplate.bindings, { ...binding, id: `b_${Date.now()}` }],
    };
    handleTemplateChange(updated);
  };

  const handleDeleteBinding = (id: string) => {
    if (!activeTemplate) return;
    handleTemplateChange({
      ...activeTemplate,
      bindings: activeTemplate.bindings.filter((b) => b.id !== id),
    });
  };

  const handleUpdateProcessKey = (key: string) => {
    if (!activeTemplate) return;
    handleTemplateChange({ ...activeTemplate, processKey: key || undefined });
  };

  // ─── DnD ──────────────────────────────────────────────────────────────

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const handleDragStart = (e: DragStartEvent) => {
    setActiveDragData(e.active.data.current);
  };

  const handleDragOver = (e: DragOverEvent) => {
    setLastDragOver(e);
  };

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveDragData(null);
    setLastDragEnd(e);
    // Reset after one frame so DocumentCanvas effect fires
    setTimeout(() => setLastDragEnd(null), 0);
  };

  // ─── Render ──────────────────────────────────────────────────────────

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex h-full bg-slate-50">
        {/* ── Left: Document list ───────────────────────────────────── */}
        <DocumentList
          templates={templates}
          activeTemplateId={activeTemplateId}
          onCreateTemplate={handleCreateTemplate}
          onLoadTemplate={handleLoadTemplate}
          onDeleteTemplate={handleDeleteTemplate}
          onUpdateTemplateName={handleUpdateTemplateName}
        />

        {/* ── Left sub-panel: content / assets tabs ─────────────────── */}
        <div className="w-52 flex-shrink-0 flex flex-col border-r border-slate-200 bg-white">
          <div className="h-12 flex border-b border-slate-200 flex-shrink-0">
            <TabBtn active={leftTab === 'content'} onClick={() => setLeftTab('content')}>
              <Layers size={13} />
              Content
            </TabBtn>
            <TabBtn active={leftTab === 'assets'} onClick={() => setLeftTab('assets')}>
              <ImageIcon size={13} />
              Logos
            </TabBtn>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            {leftTab === 'content' && <ContentLibrary />}
            {leftTab === 'assets' && <AssetLibrary endpoint={endpoint} />}
          </div>
        </div>

        {/* ── Middle: Document canvas ───────────────────────────────── */}
        <div className="flex-1 flex flex-col border-x border-slate-200 min-w-0">
          {activeTemplate ? (
            <DocumentCanvas
              template={activeTemplate}
              hasChanges={hasChanges}
              onTemplateChange={handleTemplateChange}
              onSave={handleSave}
              onSaveAs={handleSaveAs}
              onExport={handleExport}
              onClose={handleClose}
              dragEndEvent={lastDragEnd}
              dragOverEvent={lastDragOver}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="w-24 h-24 mx-auto mb-4 rounded-full bg-slate-100 flex items-center justify-center">
                  <FileText size={36} className="text-slate-300" />
                </div>
                <h3 className="text-base font-medium text-slate-600 mb-1">No document open</h3>
                <p className="text-sm text-slate-400 mb-4">
                  Choose a template or create a new document
                </p>
                <button
                  onClick={handleCreateTemplate}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors"
                >
                  New document
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Right: Templates / Bindings ──────────────────────────── */}
        <div className="w-64 flex-shrink-0 flex flex-col bg-white border-l border-slate-200">
          <div className="h-12 flex border-b border-slate-200 flex-shrink-0">
            <TabBtn active={rightTab === 'templates'} onClick={() => setRightTab('templates')}>
              <FileText size={13} />
              Templates
            </TabBtn>
            <TabBtn active={rightTab === 'bindings'} onClick={() => setRightTab('bindings')}>
              <Variable size={13} />
              Bindings
            </TabBtn>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            {rightTab === 'templates' && (
              <TemplateLibrary
                templates={templates}
                activeTemplateId={activeTemplateId}
                onLoadTemplate={(t) => handleLoadTemplate(t.id)}
              />
            )}
            {rightTab === 'bindings' && activeTemplate && (
              <BindingPanel
                processKey={activeTemplate.processKey}
                bindings={activeTemplate.bindings}
                onAdd={handleAddBinding}
                onDelete={handleDeleteBinding}
                onUpdateProcessKey={handleUpdateProcessKey}
              />
            )}
            {rightTab === 'bindings' && !activeTemplate && (
              <p className="text-xs text-slate-400 px-1 mt-2">Open a document to link variables.</p>
            )}
          </div>
        </div>
      </div>

      {/* Drag overlay */}
      <DragOverlay>
        {activeDragData ? (
          <div className="px-3 py-2 bg-white rounded-lg border-2 border-blue-400 shadow-lg text-xs font-medium text-slate-700 opacity-90">
            Drag…
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
};

// ─── Shared tab button ───────────────────────────────────────────────────────

const TabBtn: React.FC<{
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ active, onClick, children }) => (
  <button
    onClick={onClick}
    className={`
      flex-1 flex items-center justify-center gap-1.5 text-xs font-medium transition-colors
      ${
        active
          ? 'text-blue-700 border-b-2 border-blue-600 bg-blue-50'
          : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
      }
    `}
  >
    {children}
  </button>
);

export default DocumentComposer;
