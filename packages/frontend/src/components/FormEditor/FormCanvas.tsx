import '@bpmn-io/form-js/dist/assets/form-js.css';
import '@bpmn-io/form-js/dist/assets/form-js-editor.css';

import { FormEditor as FormJsEditor } from '@bpmn-io/form-js';
import { Download, Save } from 'lucide-react';
import React, { useEffect, useRef } from 'react';

interface FormCanvasProps {
  schema: Record<string, unknown>;
  onSave: (schema: Record<string, unknown>) => void;
  onClose: () => void;
}

const FormCanvas: React.FC<FormCanvasProps> = ({ schema, onSave, onClose }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<FormJsEditor | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const editor = new FormJsEditor({ container: containerRef.current });
    editorRef.current = editor;

    editor.importSchema(schema).catch((err: unknown) => {
      console.error('Failed to import form schema:', err);
    });

    return () => {
      editor.destroy();
      editorRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async () => {
    if (!editorRef.current) return;
    const savedSchema = await editorRef.current.saveSchema();
    onSave(savedSchema as Record<string, unknown>);
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
            className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors bg-blue-600 text-white hover:bg-blue-700"
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
