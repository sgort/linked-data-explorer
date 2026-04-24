/* eslint-disable @typescript-eslint/no-explicit-any */
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
import { Download, Rocket, Save, X } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';

import { BpmnService } from '@/src/services/bpmnService';

import { DocumentService } from '../../services/documentService';
import { FormService } from '../../services/formService';
import { DocumentTemplate } from '../../types/document.types';
import DmnTemplateSelector from './DmnTemplateSelector';
import DocumentTemplateSelector from './DocumentTemplateSelector';
import FormTemplateSelector from './FormTemplateSelector';
import ronlModdleDescriptor from './ronlModdleDescriptor.json';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

interface BpmnCanvasProps {
  xml: string;
  endpoint: string;
  onSave: (xml: string) => void;
  onElementSelect: (element: unknown) => void;
  onClose: () => void;
}

const BpmnCanvas: React.FC<BpmnCanvasProps> = ({
  xml,
  endpoint,
  onSave,
  onElementSelect,
  onClose,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const propertiesPanelRef = useRef<HTMLDivElement>(null);
  const modelerRef = useRef<BpmnModeler | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [showDeployModal, setShowDeployModal] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployResult, setDeployResult] = useState<{ success: boolean; message: string } | null>(
    null
  );

  // Resources preview — populated when modal opens
  const [deployResources, setDeployResources] = useState<{
    processKey: string;
    bpmnFiles: string[];
    formFiles: string[];
    documentFiles: string[];
  }>({ processKey: '', bpmnFiles: [], formFiles: [], documentFiles: [] });

  // To make the endpoint user-configurable we need to thread it through the
  // full chain: modal state → request body → backend route → service method
  const [operatonUrl, setOperatonUrl] = useState<string>(
    import.meta.env.VITE_OPERATON_BASE_URL ?? ''
  );
  const [operatonUsername, setOperatonUsername] = useState<string>('');
  const [operatonPassword, setOperatonPassword] = useState<string>('');

  const [selectedElement, setSelectedElement] = useState<any>(null);

  const handleElementSelect = useCallback(
    (element: unknown) => {
      setSelectedElement(element);
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
        ronl: ronlModdleDescriptor,
      },
    } as unknown);

    modelerRef.current = modeler;

    // Attach properties panel
    const propertiesPanel = modeler.get('propertiesPanel') as any;
    propertiesPanel.attachTo(propertiesPanelRef.current);

    // Import XML after modeler is ready
    const importDiagram = async () => {
      try {
        await modeler.importXML(xml);
        const canvas = modeler.get('canvas') as any;
        canvas.zoom('fit-viewport');
        refreshDmnOverlays();
      } catch (err) {
        console.error('Failed to import BPMN:', err);
      }
    };

    const timer = setTimeout(() => {
      importDiagram();
    }, 100);

    // Listen for changes
    const eventBus = modeler.get('eventBus') as any;
    const handleChange = () => {
      setHasChanges(true);
      refreshDmnOverlays();
    };
    eventBus.on('commandStack.changed', handleChange);

    // Listen for element selection
    eventBus.on('selection.changed', (event: { newSelection: unknown[] }) => {
      const element = event.newSelection[0];
      handleElementSelect(element || null);
    });

    // Add custom mouse wheel zoom handler
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const canvas = modelerRef.current?.get('canvas') as any;
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

  // Render DMN Template Selector when BusinessRuleTask is selected
  useEffect(() => {
    if (!selectedElement || !modelerRef.current) return;

    const elementType = selectedElement.type;

    // Clean up any existing React roots in the properties panel
    const cleanupReactRoots = () => {
      const existingContainers = document.querySelectorAll(
        '[id^="dmn-template-custom-"], [id^="form-template-custom-"]'
      );
      existingContainers.forEach((container) => {
        if (container.parentElement) {
          container.parentElement.removeChild(container);
        }
      });
      document.querySelectorAll('[id^="document-template-custom-"]').forEach((el) => {
        try {
          ReactDOM.createRoot(el).unmount();
        } catch {
          /* empty */
        }
        el.remove();
      });
    };

    if (elementType === 'bpmn:BusinessRuleTask') {
      // Clean up first
      cleanupReactRoots();

      // Create a container for the DMN selector in the properties panel
      const propertiesPanel = document.querySelector('.bio-properties-panel-scroll-container');

      if (!propertiesPanel) return;

      const selectorContainer = document.createElement('div');
      selectorContainer.id = `dmn-template-custom-${selectedElement.id}`;
      propertiesPanel.appendChild(selectorContainer);

      const modeling = modelerRef.current.get('modeling');
      const businessObject = selectedElement.businessObject;
      const currentDecisionRef = businessObject.get('camunda:decisionRef');

      // Render React component into the properties panel
      const root = ReactDOM.createRoot(selectorContainer);
      root.render(
        <DmnTemplateSelector
          endpoint={endpoint}
          element={selectedElement}
          modeling={modeling}
          selectedDecisionRef={currentDecisionRef}
        />
      );
    } else if (elementType === 'bpmn:UserTask' || elementType === 'bpmn:StartEvent') {
      cleanupReactRoots();

      const propertiesPanel = document.querySelector('.bio-properties-panel-scroll-container');
      if (!propertiesPanel) return;

      // ── Form selector ──
      const selectorContainer = document.createElement('div');
      selectorContainer.id = `form-template-custom-${selectedElement.id}`;
      propertiesPanel.appendChild(selectorContainer);

      const modeling = modelerRef.current.get('modeling');
      const businessObject = selectedElement.businessObject;
      const currentFormRef = businessObject.get('camunda:formRef');

      const root = ReactDOM.createRoot(selectorContainer);
      root.render(
        <FormTemplateSelector
          element={selectedElement}
          modeling={modeling}
          selectedFormRef={currentFormRef}
        />
      );

      // ── Document selector (UserTask only — not StartEvent) ──
      if (elementType === 'bpmn:UserTask') {
        const docSelectorContainer = document.createElement('div');
        docSelectorContainer.id = `document-template-custom-${selectedElement.id}`;
        propertiesPanel.appendChild(docSelectorContainer);

        const currentDocumentRef = businessObject.get('ronl:documentRef');

        const docRoot = ReactDOM.createRoot(docSelectorContainer);
        docRoot.render(
          <DocumentTemplateSelector
            element={selectedElement}
            modeling={modeling}
            selectedDocumentRef={currentDocumentRef}
          />
        );
      }
    } else {
      cleanupReactRoots();
    }

    // Cleanup when element changes
    return () => {
      cleanupReactRoots();
    };
  }, [selectedElement, endpoint]);

  /**
   * Refresh DMN linked badges on all BusinessRuleTasks
   */
  const refreshDmnOverlays = () => {
    if (!modelerRef.current) return;

    const overlays = modelerRef.current.get('overlays') as any;
    const elementRegistry = modelerRef.current.get('elementRegistry') as any;

    overlays.remove({ type: 'dmn-linked' });
    overlays.remove({ type: 'form-linked' });
    overlays.remove({ type: 'document-linked' });

    elementRegistry.forEach((element: any) => {
      if (element.type === 'bpmn:BusinessRuleTask') {
        const decisionRef = element.businessObject.get('camunda:decisionRef');
        if (!decisionRef) return;
        const badgeWidth = 130;
        const leftOffset = Math.round((element.width - badgeWidth) / 2);
        overlays.add(element.id, 'dmn-linked', {
          position: { bottom: 8, left: leftOffset },
          html: `<div class="dmn-linked-badge" title="${decisionRef}">📋 ${decisionRef}</div>`,
        });
      }

      if (element.type === 'bpmn:UserTask') {
        const formRef = element.businessObject.get('camunda:formRef');
        if (!formRef) return;
        const badgeWidth = 130;
        const leftOffset = Math.round((element.width - badgeWidth) / 2);
        overlays.add(element.id, 'form-linked', {
          position: { bottom: 8, left: leftOffset },
          html: `<div class="form-linked-badge" title="${formRef}">📝 ${formRef}</div>`,
        });
      }

      if (element.type === 'bpmn:StartEvent') {
        const formRef = element.businessObject.get('camunda:formRef');
        if (!formRef) return;
        const badgeWidth = 110;
        const leftOffset = Math.round((element.width - badgeWidth) / 2);
        overlays.add(element.id, 'form-linked', {
          position: { bottom: -22, left: leftOffset },
          html: `<div class="form-linked-badge form-linked-badge--start" title="${formRef}">📝 ${formRef}</div>`,
        });
      }

      if (element.type === 'bpmn:UserTask') {
        const documentRef = element.businessObject.get('ronl:documentRef');
        if (!documentRef) return;
        const badgeWidth = 130;
        const leftOffset = Math.round((element.width - badgeWidth) / 2);
        overlays.add(element.id, 'document-linked', {
          position: { bottom: -36, left: leftOffset }, // below the form badge
          html: `<div class="document-linked-badge" title="${documentRef}">📄 ${documentRef}</div>`,
        });
      }
    });
  };

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

  const handleOpenDeployModal = async () => {
    if (!modelerRef.current) return;
    const { xml } = await modelerRef.current.saveXML({ format: true });

    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'text/xml');
    const processKey = doc.querySelector('process')?.getAttribute('id') ?? 'process';

    const extractFormRefs = (bpmnXml: string) => [
      ...new Set([...bpmnXml.matchAll(/camunda:formRef="([^"]+)"/g)].map((m) => m[1])),
    ];

    const extractDocumentRefs = (bpmnXml: string) => [
      ...new Set([...bpmnXml.matchAll(/ronl:documentRef="([^"]+)"/g)].map((m) => m[1])),
    ];

    const extractCalledElements = (bpmnXml: string) => [
      ...new Set([...bpmnXml.matchAll(/calledElement="([^"]+)"/g)].map((m) => m[1])),
    ];

    const allProcesses = BpmnService.getProcesses();
    const calledElements = extractCalledElements(xml);
    const subProcessXmls: { filename: string; xml: string }[] = [];

    for (const calledElement of calledElements) {
      const match = allProcesses.find((p) => {
        const d = new DOMParser().parseFromString(p.xml, 'text/xml');
        return d.querySelector('process')?.getAttribute('id') === calledElement;
      });
      if (match) subProcessXmls.push({ filename: `${calledElement}.bpmn`, xml: match.xml });
    }

    const allFormRefs = new Set([
      ...extractFormRefs(xml),
      ...subProcessXmls.flatMap((sp) => extractFormRefs(sp.xml)),
    ]);

    const allForms = FormService.getForms();
    const matchedForms = [...allFormRefs].filter((ref) =>
      allForms.some((f) => (f.schema as Record<string, unknown>).id === ref)
    );
    const unmatchedForms = [...allFormRefs].filter(
      (ref) => !allForms.some((f) => (f.schema as Record<string, unknown>).id === ref)
    );

    const ropaRefMissing = !xml.includes('ronl:ropaRef=');

    const allDocumentRefs = new Set([
      ...extractDocumentRefs(xml),
      ...subProcessXmls.flatMap((sp) => extractDocumentRefs(sp.xml)),
    ]);
    const allDocumentTemplates = DocumentService.getTemplates();
    const matchedDocuments = [...allDocumentRefs].filter((ref) =>
      allDocumentTemplates.some((d) => d.id === ref)
    );

    setDeployResources({
      processKey,
      bpmnFiles: [`${processKey}.bpmn`, ...subProcessXmls.map((sp) => sp.filename)],
      formFiles: matchedForms.map((ref) => `${ref}.form`),
      documentFiles: matchedDocuments.map((ref) => `${ref}.document`),
      ...(unmatchedForms.length ? { unmatchedForms } : {}),
      ropaRefMissing, // ← new field
    } as typeof deployResources & { unmatchedForms?: string[]; ropaRefMissing?: boolean });
    setDeployResult(null);
    setShowDeployModal(true);
  };

  const handleDeploy = async () => {
    if (!modelerRef.current) return;
    setIsDeploying(true);

    try {
      const { xml } = await modelerRef.current.saveXML({ format: true });

      const extractFormRefs = (bpmnXml: string) => [
        ...new Set([...bpmnXml.matchAll(/camunda:formRef="([^"]+)"/g)].map((m) => m[1])),
      ];

      const extractDocumentRefs = (bpmnXml: string) => [
        ...new Set([...bpmnXml.matchAll(/ronl:documentRef="([^"]+)"/g)].map((m) => m[1])),
      ];

      const extractCalledElements = (bpmnXml: string) => [
        ...new Set([...bpmnXml.matchAll(/calledElement="([^"]+)"/g)].map((m) => m[1])),
      ];

      const allProcesses = BpmnService.getProcesses();
      const subProcessXmls: { filename: string; xml: string }[] = [];

      for (const calledElement of extractCalledElements(xml)) {
        const match = allProcesses.find((p) => {
          const d = new DOMParser().parseFromString(p.xml, 'text/xml');
          return d.querySelector('process')?.getAttribute('id') === calledElement;
        });
        if (match) subProcessXmls.push({ filename: `${calledElement}.bpmn`, xml: match.xml });
      }

      const allFormRefs = new Set([
        ...extractFormRefs(xml),
        ...subProcessXmls.flatMap((sp) => extractFormRefs(sp.xml)),
      ]);

      const allForms = FormService.getForms();
      const forms: { id: string; schema: Record<string, unknown> }[] = [];
      for (const ref of allFormRefs) {
        const match = allForms.find((f) => (f.schema as Record<string, unknown>).id === ref);
        if (match) forms.push({ id: ref, schema: match.schema });
      }

      const allDocumentRefs = new Set([
        ...extractDocumentRefs(xml),
        ...subProcessXmls.flatMap((sp) => extractDocumentRefs(sp.xml)),
      ]);
      const allDocumentTemplates = DocumentService.getTemplates();
      const documents: { id: string; template: DocumentTemplate }[] = [];
      for (const ref of allDocumentRefs) {
        const match = allDocumentTemplates.find((d) => d.id === ref);
        if (match) documents.push({ id: ref, template: match });
      }

      const parser = new DOMParser();
      const doc = parser.parseFromString(xml, 'text/xml');
      const processKey =
        doc.querySelector('process')?.getAttribute('id') ?? `process-${Date.now()}`;

      // ─── Language consistency check ───────────────────────────────────
      // Warn if the bundle mixes languages (e.g. English BPMN + Dutch form).
      // DMNs are excluded because they are language-agnostic by design.
      const languageSet = new Set<string>();

      const extractBpmnLanguage = (bpmnXml: string): string | undefined =>
        bpmnXml.match(/ronl:language="([^"]+)"/)?.[1];

      const shellLang = extractBpmnLanguage(xml);
      if (shellLang) languageSet.add(shellLang);

      for (const sp of subProcessXmls) {
        const spLang = extractBpmnLanguage(sp.xml);
        if (spLang) languageSet.add(spLang);
      }

      for (const { id } of forms) {
        const f = allForms.find((x) => (x.schema as Record<string, unknown>).id === id);
        if (f?.language) languageSet.add(f.language);
      }

      for (const { template } of documents) {
        if (template.language) languageSet.add(template.language);
      }

      if (languageSet.size > 1) {
        const langs = [...languageSet].sort().join(', ');
        const proceed = window.confirm(
          `Bundle mixes languages: ${langs}. ` +
            `This is usually a mistake — a deployed bundle should be a single language. ` +
            `Continue anyway?`
        );
        if (!proceed) {
          setIsDeploying(false);
          return;
        }
      }
      // ──────────────────────────────────────────────────────────────────

      const response = await fetch(`${API_BASE_URL}/api/dmns/process/deploy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bpmnXml: xml,
          deploymentName: processKey,
          forms,
          documents,
          subProcesses: subProcessXmls,
          operatonUrl: operatonUrl.trim() || undefined,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setDeployResult({ success: true, message: `Deployment ID: ${data.data.deploymentId}` });

        // Write deployment metadata back to the process_definitions record
        const ldeId = BpmnService.getProcesses().find((p) => p.bpmnProcessId === processKey)?.id;
        if (ldeId) {
          fetch(`${API_BASE_URL}/v1/assets/bpmn/${ldeId}/deploy`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              deploymentId: data.data.deploymentId,
              operatonUrl: operatonUrl.trim() || undefined,
              formIds: forms.map((f) => f.id),
              documentIds: documents.map((d) => d.id),
            }),
          }).catch((err) => console.warn('[BpmnCanvas] Deploy record update failed:', err));
        }
      } else {
        setDeployResult({ success: false, message: data.error?.message ?? 'Deployment failed' });
      }
    } catch (err) {
      setDeployResult({
        success: false,
        message: err instanceof Error ? err.message : 'Deployment failed',
      });
    } finally {
      setIsDeploying(false);
    }
  };

  const handleZoomIn = () => {
    const canvas = modelerRef.current?.get('canvas') as any;
    if (!canvas) return;
    canvas.zoom(Math.min(4, canvas.zoom() + 0.1));
  };

  const handleZoomOut = () => {
    const canvas = modelerRef.current?.get('canvas') as any;
    if (!canvas) return;
    canvas.zoom(Math.max(0.2, canvas.zoom() - 0.1));
  };

  const handleZoomReset = () => {
    const canvas = modelerRef.current?.get('canvas') as any;
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
            onClick={handleOpenDeployModal}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          >
            <Rocket size={16} />
            Deploy
          </button>

          {deployResult && (
            <span
              className={`text-xs px-3 py-1.5 rounded-lg ${
                deployResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
              }`}
            >
              {deployResult.success ? '✓' : '✗'} {deployResult.message}
            </span>
          )}
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

      {showDeployModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Deploy to Operaton</h3>
              <button
                onClick={() => {
                  setShowDeployModal(false);
                  setDeployResult(null);
                }}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>

            {/* Resources preview */}
            <div className="mb-4 p-3 rounded-lg border-2 bg-blue-50 border-blue-200">
              <div className="font-semibold text-sm text-blue-800 mb-2">🚀 Resources to deploy</div>
              <ul className="space-y-1">
                {deployResources.bpmnFiles.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-slate-700">
                    <span className="text-blue-500">📄</span> {f}
                  </li>
                ))}
                {deployResources.formFiles.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-slate-700">
                    <span className="text-green-500">📝</span> {f}
                  </li>
                ))}
                {deployResources.documentFiles.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-slate-700">
                    <span className="text-purple-500">📄</span> {f}
                  </li>
                ))}
              </ul>
              {(deployResources as any).ropaRefMissing && (
                <div className="mb-3 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
                  ⚠️ No <code className="font-mono">ronl:ropaRef</code> found on the process
                  element. Link a RoPA record in the BPMN properties panel before deploying to
                  production.
                </div>
              )}
              <div className="mt-2 text-xs text-slate-500">
                {deployResources.bpmnFiles.length + deployResources.formFiles.length} resource(s) ·
                {deployResources.bpmnFiles.length +
                  deployResources.formFiles.length +
                  deployResources.documentFiles.length}{' '}
                resource(s) · process key:{' '}
                <span className="font-mono">{deployResources.processKey}</span>
              </div>
            </div>

            {/* Operaton REST endpoint */}
            <div className="mb-4">
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Operaton REST endpoint
              </label>
              <input
                type="text"
                value={operatonUrl}
                onChange={(e) => setOperatonUrl(e.target.value)}
                disabled={isDeploying || deployResult?.success === true}
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:bg-slate-50 disabled:text-slate-400"
                placeholder="https://operaton.open-regels.nl/engine-rest"
              />
            </div>

            {/* Operaton REST endpoint - Username & Password */}
            <div className="grid grid-cols-2 gap-2 mb-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Username <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={operatonUsername}
                  onChange={(e) => setOperatonUsername(e.target.value)}
                  disabled={isDeploying || deployResult?.success === true}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:bg-slate-50 disabled:text-slate-400"
                  placeholder="demo"
                  autoComplete="username"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Password <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <input
                  type="password"
                  value={operatonPassword}
                  onChange={(e) => setOperatonPassword(e.target.value)}
                  disabled={isDeploying || deployResult?.success === true}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:bg-slate-50 disabled:text-slate-400"
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
              </div>
            </div>

            {/* Result banner */}
            {deployResult && (
              <div
                className={`mb-4 p-3 rounded-lg text-sm ${
                  deployResult.success
                    ? 'bg-green-50 text-green-700 border border-green-200'
                    : 'bg-red-50 text-red-700 border border-red-200'
                }`}
              >
                {deployResult.success ? '✓ ' : '✗ '}
                {deployResult.message}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={handleDeploy}
                disabled={isDeploying || deployResult?.success === true}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
              >
                {isDeploying ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Deploying…
                  </>
                ) : (
                  <>
                    <Rocket size={16} />
                    {deployResult?.success ? 'Deployed' : 'Deploy'}
                  </>
                )}
              </button>
              <button
                onClick={() => {
                  setShowDeployModal(false);
                  setDeployResult(null);
                }}
                className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
              >
                {deployResult?.success ? 'Close' : 'Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BpmnCanvas;
