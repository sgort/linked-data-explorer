import './BpmnModeler.css';
import './bpmn-js.css';
import '@bpmn-io/properties-panel/dist/assets/properties-panel.css';

import BpmnModeler from 'bpmn-js/lib/Modeler';
import {
  BpmnPropertiesPanelModule,
  BpmnPropertiesProviderModule,
  CamundaPlatformPropertiesProviderModule,
} from 'bpmn-js-properties-panel';
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
  const propertiesPanelRef = useRef<HTMLDivElement>(null);
  const modelerRef = useRef<BpmnModeler | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  const handleElementSelect = useCallback(
    (element: unknown) => {
      onElementSelect(element);
    },
    [onElementSelect]
  );

  useEffect(() => {
    if (!containerRef.current || !propertiesPanelRef.current) return;

    // Initialize modeler with properties panel modules
    const modeler = new BpmnModeler({
      container: containerRef.current,
      additionalModules: [
        BpmnPropertiesPanelModule,
        BpmnPropertiesProviderModule,
        CamundaPlatformPropertiesProviderModule,
      ],
      moddleExtensions: {
        camunda: camundaModdleDescriptor,
      },
    } as unknown);

    modelerRef.current = modeler;

    // Attach properties panel
    const propertiesPanel = modeler.get('propertiesPanel');
    propertiesPanel.attachTo(propertiesPanelRef.current);

    // Import XML after modeler is ready
    const importDiagram = async () => {
      try {
        await modeler.importXML(xml);
        const canvas = modeler.get('canvas');
        canvas.zoom('fit-viewport');
      } catch (err) {
        console.error('Failed to import BPMN:', err);
      }
    };

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
      const newZoom = Math.max(0.2, Math.min(4, currentZoom + delta));
      canvas.zoom(newZoom);
    };

    const container = containerRef.current;
    container.addEventListener('wheel', handleWheel, { passive: false });

    // Cleanup
    return () => {
      clearTimeout(timer);
      container.removeEventListener('wheel', handleWheel);
      eventBus.off('commandStack.changed', handleChange);
      propertiesPanel.detach();
      modeler.destroy();
    };
  }, [xml, handleElementSelect]);

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

  const handleZoomIn = () => {
    const canvas = modelerRef.current?.get('canvas');
    if (!canvas) return;
    canvas.zoom(Math.min(4, canvas.zoom() + 0.1));
  };

  const handleZoomOut = () => {
    const canvas = modelerRef.current?.get('canvas');
    if (!canvas) return;
    canvas.zoom(Math.max(0.2, canvas.zoom() - 0.1));
  };

  const handleZoomReset = () => {
    const canvas = modelerRef.current?.get('canvas');
    if (!canvas) return;
    canvas.zoom('fit-viewport');
  };

  return (
    <div className="flex-1 flex flex-col">
      {/* Toolbar */}
      <div className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            disabled={!hasChanges}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors
              ${
                hasChanges
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-slate-100 text-slate-400 cursor-not-allowed'
              }
            `}
          >
            <Save size={16} />
            Save
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
          >
            <Download size={16} />
            Export
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
          >
            Close
          </button>
        </div>

        {/* Zoom Controls */}
        <div className="flex items-center gap-1 border border-slate-300 rounded-lg overflow-hidden">
          <button
            onClick={handleZoomOut}
            className="px-3 py-1.5 text-slate-700 hover:bg-slate-50 transition-colors"
            title="Zoom Out"
          >
            −
          </button>
          <button
            onClick={handleZoomReset}
            className="px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 transition-colors border-x border-slate-300"
            title="Fit to Viewport"
          >
            Fit
          </button>
          <button
            onClick={handleZoomIn}
            className="px-3 py-1.5 text-slate-700 hover:bg-slate-50 transition-colors"
            title="Zoom In"
          >
            +
          </button>
        </div>
      </div>

      {/* Canvas and Properties Panel Container */}
      <div className="flex-1 flex overflow-hidden">
        {/* Canvas */}
        <div ref={containerRef} className="flex-1 bpmn-container" />

        {/* Properties Panel */}
        <div ref={propertiesPanelRef} className="bpmn-properties-panel" />
      </div>
    </div>
  );
};

export default BpmnCanvas;
