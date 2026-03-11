import { Workflow } from 'lucide-react';
import React, { useEffect, useState } from 'react';

import { BpmnService } from '../../services/bpmnService';
import { BpmnProcess } from '../../types';
import { ASYLUM_MIGRATION_EXAMPLE_XML, DEFAULT_BPMN_XML } from '../../utils/bpmnTemplates';
import { EXAMPLE_VERSIONS, getStoredVersion, setStoredVersion } from '../../utils/exampleVersions';
import BpmnCanvas from './BpmnCanvas';
import ProcessList from './ProcessList';

interface BpmnModelerProps {
  endpoint: string;
}

const BpmnModeler: React.FC<BpmnModelerProps> = ({ endpoint }) => {
  const [processes, setProcesses] = useState<BpmnProcess[]>(BpmnService.getProcesses());
  const [activeProcessId, setActiveProcessId] = useState<string | null>(null);
  const [currentXml, setCurrentXml] = useState<string>(DEFAULT_BPMN_XML);

  const activeProcess = processes.find((p) => p.id === activeProcessId) || null;

  /**
   * Seed / refresh versioned example processes on mount.
   * Re-fetches from public/examples/flevoland/ whenever EXAMPLE_VERSIONS
   * has been bumped above the version stored in localStorage.
   * Asylum Migration stays inline (WIP, not a reference deployment file).
   */
  useEffect(() => {
    const seed = async () => {
      const updated: BpmnProcess[] = [];

      // --- AWB Shell Process ---
      const awbId = 'example_awb_process';
      if (getStoredVersion(awbId) < EXAMPLE_VERSIONS[awbId]) {
        const xml = await fetch('/examples/flevoland/AwbShellProcess.bpmn').then((r) => r.text());
        const awbExample: BpmnProcess = {
          id: awbId,
          name: 'AWB Generic Process (Example)',
          description:
            'AWB General Administrative Law Act shell: 8-phase procedural process reusable across all Dutch government public services',
          xml,
          createdAt: '2026-02-10T14:30:00.000Z',
          updatedAt: new Date().toISOString(),
          linkedDmnTemplates: ['AwbCompletenessCheck', 'ArchivesActRetention'],
          readonly: true,
          status: 'example',
        };
        BpmnService.saveProcess(awbExample);
        setStoredVersion(awbId, EXAMPLE_VERSIONS[awbId]);
        updated.push(awbExample);
      }

      // --- Tree Felling Subprocess ---
      const treeId = 'example_tree_felling';
      if (getStoredVersion(treeId) < EXAMPLE_VERSIONS[treeId]) {
        const xml = await fetch('/examples/flevoland/TreeFellingPermitSubProcess.bpmn').then((r) =>
          r.text()
        );
        const treeFellingExample: BpmnProcess = {
          id: treeId,
          name: 'Tree Felling Permit (Example)',
          description: 'Example BPMN process demonstrating DMN decision tasks with embedded forms',
          xml,
          createdAt: '2026-01-15T10:00:00.000Z',
          updatedAt: new Date().toISOString(),
          linkedDmnTemplates: ['TreeFellingDecision', 'ReplacementTreeDecision'],
          readonly: true,
          status: 'example',
        };
        BpmnService.saveProcess(treeFellingExample);
        setStoredVersion(treeId, EXAMPLE_VERSIONS[treeId]);
        updated.push(treeFellingExample);
      }

      // --- Asylum Migration (inline WIP, no version tracking needed) ---
      const asylumId = 'wip_asylum_migration';
      if (!BpmnService.getProcess(asylumId)) {
        const asylumMigration: BpmnProcess = {
          id: asylumId,
          name: 'Migration & Asylum Procedure',
          description: 'Complex migration and asylum procedure - work in progress',
          xml: ASYLUM_MIGRATION_EXAMPLE_XML,
          createdAt: '2026-02-18T09:15:00.000Z',
          updatedAt: '2026-02-18T09:15:00.000Z',
          linkedDmnTemplates: [],
          readonly: false,
          status: 'wip',
        };
        BpmnService.saveProcess(asylumMigration);
        updated.push(asylumMigration);
      }

      if (updated.length > 0) {
        const allProcesses = BpmnService.getProcesses();
        setProcesses(allProcesses);
        if (!activeProcessId) {
          setActiveProcessId(updated[0].id);
          setCurrentXml(updated[0].xml);
        }
      }
    };

    seed();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreateProcess = () => {
    const newProcess: BpmnProcess = {
      id: `process_${Date.now()}`,
      name: 'New Process',
      xml: DEFAULT_BPMN_XML,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      linkedDmnTemplates: [],
    };
    BpmnService.saveProcess(newProcess);
    setProcesses(BpmnService.getProcesses());
    setActiveProcessId(newProcess.id);
    setCurrentXml(newProcess.xml);
  };

  const handleImportProcess = (xml: string, name: string) => {
    const newProcess: BpmnProcess = {
      id: `process_${Date.now()}`,
      name,
      xml,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      linkedDmnTemplates: [],
      status: 'wip',
    };
    BpmnService.saveProcess(newProcess);
    setProcesses(BpmnService.getProcesses());
    setActiveProcessId(newProcess.id);
    setCurrentXml(xml);
  };

  const handleLoadProcess = (processId: string) => {
    const process = BpmnService.getProcess(processId);
    if (process) {
      setActiveProcessId(process.id);
      setCurrentXml(process.xml);
    }
  };

  const handleSaveProcess = (xml: string) => {
    if (!activeProcessId) return;
    const process = BpmnService.getProcess(activeProcessId);
    if (process) {
      BpmnService.saveProcess({ ...process, xml, updatedAt: new Date().toISOString() });
      setProcesses(BpmnService.getProcesses());
      setCurrentXml(xml);
    }
  };

  const handleDeleteProcess = (processId: string) => {
    const process = BpmnService.getProcess(processId);
    if (process?.readonly) {
      alert('Cannot delete example processes');
      return;
    }
    if (confirm('Delete this process?')) {
      BpmnService.deleteProcess(processId);
      setProcesses(BpmnService.getProcesses());
      if (activeProcessId === processId) {
        setActiveProcessId(null);
        setCurrentXml(DEFAULT_BPMN_XML);
      }
    }
  };

  const handleUpdateProcessName = (processId: string, name: string) => {
    const process = BpmnService.getProcess(processId);
    if (process) {
      BpmnService.saveProcess({ ...process, name, updatedAt: new Date().toISOString() });
      setProcesses(BpmnService.getProcesses());
    }
  };

  const handleCloseProcess = () => {
    setActiveProcessId(null);
    setCurrentXml(DEFAULT_BPMN_XML);
  };

  return (
    <div className="flex h-full bg-slate-50">
      <ProcessList
        processes={processes}
        activeProcessId={activeProcessId}
        onCreateProcess={handleCreateProcess}
        onImportProcess={handleImportProcess}
        onLoadProcess={handleLoadProcess}
        onDeleteProcess={handleDeleteProcess}
        onUpdateProcessName={handleUpdateProcessName}
      />

      <div className="flex-1 flex flex-col border-x border-slate-200">
        {activeProcess ? (
          <BpmnCanvas
            xml={currentXml}
            endpoint={endpoint}
            onSave={handleSaveProcess}
            onElementSelect={() => {}}
            onClose={handleCloseProcess}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-32 h-32 mx-auto mb-4 rounded-full bg-slate-100 flex items-center justify-center">
                <Workflow size={48} className="text-slate-300" />
              </div>
              <h3 className="text-lg font-medium text-slate-600 mb-2">No process selected</h3>
              <p className="text-sm text-slate-400 mb-4">
                Create a new process or select an existing one
              </p>
              <button
                onClick={handleCreateProcess}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Create New Process
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default BpmnModeler;
