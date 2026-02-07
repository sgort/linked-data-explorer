import './BpmnModeler.css';
import './bpmn-js.css';

import Modeler from 'bpmn-js/lib/Modeler';
import camundaModdleDescriptor from 'camunda-bpmn-moddle/resources/camunda.json';
import { Download, Save } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';

interface BpmnCanvasProps {
  xml: string;
  onSave: (xml: string) => void;
  onElementSelect: (element: unknown) => void;
  onClose: () => void;
}

const BpmnCanvas: React.FC<BpmnCanvasProps> = ({ xml, onSave, onElementSelect, onClose }) => {
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
      moddleExtensions: {
        camunda: camundaModdleDescriptor,
      },
    });

    modelerRef.current = modeler;

    // Import XML after modeler is ready
    const importDiagram = async () => {
      try {
        await modeler.importXML(xml);

        // Get canvas and enable interactions
        const canvas = modeler.get('canvas');

        // Zoom to fit viewport after successful import
        canvas.zoom('fit-viewport');
      } catch (err) {
        console.error('Failed to import BPMN:', err);
      }
    };

    // Small delay to ensure DOM is ready
    const timer = setTimeout(() => {
      importDiagram();
    }, 100);

    // Listen for changes
    const eventBus = modeler.get('eventBus');
    const handleChange = () => setHasChanges(true);

    eventBus.on('commandStack.changed', handleChange);

    // Listen for element selection
    eventBus.on('selection.changed', (event: { newSelection: unknown[] }) => {
      const element = event.newSelection[0];
      handleElementSelect(element || null);
    });

    // Add custom mouse wheel zoom handler
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();

      const canvas = modelerRef.current?.get('canvas');
      if (!canvas) return;

      const currentZoom = canvas.zoom();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;

      canvas.zoom(Math.max(0.2, Math.min(4, currentZoom + delta)));
    };

    const container = containerRef.current;
    if (container) {
      container.addEventListener('wheel', handleWheel, { passive: false });
    }

    // Cleanup
    return () => {
      clearTimeout(timer);
      if (container) {
        container.removeEventListener('wheel', handleWheel);
      }
      if (modelerRef.current) {
        modelerRef.current.destroy();
      }
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
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-slate-700">BPMN Modeler</h2>

          {/* Zoom Controls */}
          <div className="flex items-center gap-1 ml-4 border-l border-slate-300 pl-4">
            <button
              onClick={() => {
                const canvas = modelerRef.current?.get('canvas');
                canvas?.zoom(canvas.zoom() + 0.1);
              }}
              className="p-1.5 rounded hover:bg-slate-200 text-slate-600 transition-colors"
              title="Zoom In"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor">
                <circle cx="7" cy="7" r="5" strokeWidth="1.5" />
                <path d="M7 5v4M5 7h4M10.5 10.5l3.5 3.5" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
            <button
              onClick={() => {
                const canvas = modelerRef.current?.get('canvas');
                canvas?.zoom(canvas.zoom() - 0.1);
              }}
              className="p-1.5 rounded hover:bg-slate-200 text-slate-600 transition-colors"
              title="Zoom Out"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor">
                <circle cx="7" cy="7" r="5" strokeWidth="1.5" />
                <path d="M5 7h4M10.5 10.5l3.5 3.5" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
            <button
              onClick={() => {
                const canvas = modelerRef.current?.get('canvas');
                canvas?.zoom('fit-viewport');
              }}
              className="p-1.5 rounded hover:bg-slate-200 text-slate-600 transition-colors"
              title="Fit to Viewport"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor">
                <rect x="2" y="2" width="12" height="12" strokeWidth="1.5" rx="1" />
                <path d="M5 5l6 6M11 5l-6 6" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-200 text-slate-700 hover:bg-slate-300 transition-colors"
            title="Close Process"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor">
              <path d="M12 4L4 12M4 4l8 8" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            Close
          </button>
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
      <div ref={containerRef} className="flex-1 bg-white bpmn-container" />
    </>
  );
};

export default BpmnCanvas;
