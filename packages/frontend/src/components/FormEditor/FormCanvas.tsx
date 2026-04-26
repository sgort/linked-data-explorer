import '@bpmn-io/form-js/dist/assets/form-js.css';
import '@bpmn-io/form-js/dist/assets/form-js-editor.css';

import { FormEditor as FormJsEditor } from '@bpmn-io/form-js';
import { Download, Save } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';

interface FormCanvasProps {
  schema: Record<string, unknown>;
  /** True when the parent has pending footer (metadata) edits — enables the Save button. */
  hasFooterChanges?: boolean;
  /** Called when the canvas dirty state changes, so the parent can guard navigation. */
  onDirtyChange?: (dirty: boolean) => void;
  onSave: (schema: Record<string, unknown>) => void;
  onClose: () => void;
}

const FormCanvas: React.FC<FormCanvasProps> = ({
  schema,
  hasFooterChanges = false,
  onDirtyChange,
  onSave,
  onClose,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<FormJsEditor | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  // Keep latest onDirtyChange in a ref so the change listener stays stable across renders.
  const onDirtyChangeRef = useRef(onDirtyChange);
  useEffect(() => {
    onDirtyChangeRef.current = onDirtyChange;
  }, [onDirtyChange]);

  // Tracks whether we've already fired the dirty signal for the current edit session.
  // Reset on save so a subsequent edit can re-trigger it.
  const alreadyDirtyRef = useRef(false);

  useEffect(() => {
    if (!containerRef.current) return;

    const editor = new FormJsEditor({ container: containerRef.current });
    editorRef.current = editor;

    // Track dirty state via form-js's `changed` event. Listener is registered
    // AFTER importSchema completes so the import itself doesn't appear as a user edit.
    //
    // Once-true guard: only flip dirty on the first event; subsequent events
    // are no-ops. React would bail out anyway when setting the same value,
    // but this is explicit about intent.
    //
    // Note: form-js's properties panel loses input focus on its own debounced
    // commit (form-js issue #86, "wontfix"). That focus loss is independent of
    // our React state — it's form-js rebuilding its panel from schema on idle.
    // We can't fix it from this side without forking form-js.
    const handleChange = () => {
      if (alreadyDirtyRef.current) return;
      alreadyDirtyRef.current = true;
      setHasChanges(true);
      onDirtyChangeRef.current?.(true);
    };

    editor
      .importSchema(schema)
      .then(() => {
        (editor as unknown as { on: (e: string, cb: () => void) => void }).on(
          'changed',
          handleChange
        );
      })
      .catch((err: unknown) => {
        console.error('Failed to import form schema:', err);
      });

    return () => {
      try {
        (editor as unknown as { off?: (e: string, cb: () => void) => void }).off?.(
          'changed',
          handleChange
        );
      } catch {
        /* editor may already be destroyed */
      }
      editor.destroy();
      editorRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async () => {
    if (!editorRef.current) return;
    const savedSchema = await editorRef.current.saveSchema();
    onSave(savedSchema as Record<string, unknown>);
    setHasChanges(false);
    onDirtyChangeRef.current?.(false);
    // Resetting allows the next form-js `changed` event to re-trigger dirty.
    alreadyDirtyRef.current = false;
  };

  const handleExport = async () => {
    if (!editorRef.current) return;
    const exportSchema = await editorRef.current.saveSchema();
    const blob = new Blob([JSON.stringify(exportSchema, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const formId = (exportSchema as Record<string, unknown>).id ?? 'form';
    a.download = `${formId}.form`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="h-12 border-b border-slate-200 bg-white flex items-center justify-between px-4 flex-shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            disabled={!hasChanges && !hasFooterChanges}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              hasChanges || hasFooterChanges
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-slate-100 text-slate-400 cursor-not-allowed'
            }`}
          >
            <Save size={16} />
            Save
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
          >
            <Download size={16} />
            Export .form
          </button>
        </div>
        <button
          onClick={onClose}
          className="px-4 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
        >
          Close
        </button>
      </div>

      {/* Editor canvas */}
      <div ref={containerRef} className="flex-1 overflow-hidden" />
    </div>
  );
};

export default FormCanvas;
