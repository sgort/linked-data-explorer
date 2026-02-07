import Modeler from 'bpmn-js/lib/Modeler';
import camundaModdleDescriptor from 'camunda-bpmn-moddle/resources/camunda.json';
import { Download, Save } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';

interface BpmnCanvasProps {
  xml: string;
  onSave: (xml: string) => void;
  onElementSelect: (element: unknown) => void;
}

const BpmnCanvas: React.FC<BpmnCanvasProps> = ({ xml, onSave, onElementSelect }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const modelerRef = useRef<Modeler | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  // Memoize callback to satisfy exhaustive-deps
  const handleElementSelect = useCallback(
    (element: unknown) => {
      onElementSelect(element);
    },
    [onElementSelect]
  );

  useEffect(() => {
    if (!containerRef.current) return;

    // Initialize modeler
    const modeler = new Modeler({
      container: containerRef.current,
      keyboard: {
        bindTo: document,
      },
      moddleExtensions: {
        camunda: camundaModdleDescriptor,
      },
    });

    modelerRef.current = modeler;

    // Import XML
    modeler
      .importXML(xml)
      .then(() => {
        const canvas = modeler.get('canvas');
        canvas.zoom('fit-viewport');
      })
      .catch((err: Error) => {
        console.error('Failed to import BPMN:', err);
      });

    // Listen for changes
    const eventBus = modeler.get('eventBus');
    const handleChange = () => setHasChanges(true);

    eventBus.on('commandStack.changed', handleChange);

    // Listen for element selection
    eventBus.on('selection.changed', (event: { newSelection: unknown[] }) => {
      const element = event.newSelection[0];
      handleElementSelect(element || null);
    });

    // Cleanup
    return () => {
      modeler.destroy();
    };
  }, [xml, handleElementSelect]);

  /**
   * Save current diagram
   */
  const handleSave = async () => {
    if (!modelerRef.current) return;

    try {
      const { xml: savedXml } = await modelerRef.current.saveXML({ format: true });
      onSave(savedXml);
      setHasChanges(false);
    } catch (err) {
      console.error('Failed to save BPMN:', err);
    }
  };

  /**
   * Export as BPMN file
   */
  const handleExport = async () => {
    if (!modelerRef.current) return;

    try {
      const { xml: exportXml } = await modelerRef.current.saveXML({ format: true });
      const blob = new Blob([exportXml], { type: 'application/xml' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `process_${Date.now()}.bpmn`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export BPMN:', err);
    }
  };

  return (
    <>
      {/* Toolbar */}
      <div className="h-14 bg-slate-50 border-b border-slate-200 px-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">BPMN Modeler</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            disabled={!hasChanges}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              hasChanges
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
            }`}
          >
            <Save size={16} />
            Save
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-200 text-slate-700 hover:bg-slate-300 transition-colors"
          >
            <Download size={16} />
            Export
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div ref={containerRef} className="flex-1 bg-white" />
    </>
  );
};

export default BpmnCanvas;
