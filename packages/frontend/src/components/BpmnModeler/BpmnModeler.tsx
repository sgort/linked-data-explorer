import { Workflow } from 'lucide-react';
import React, { useEffect, useState } from 'react';

import { BpmnService } from '../../services/bpmnService';
import { BpmnProcess } from '../../types';
import {
  ASYLUM_MIGRATION_EXAMPLE_XML,
  AWB_PROCESS_EXAMPLE_XML,
  DEFAULT_BPMN_XML,
  TREE_FELLING_EXAMPLE_XML,
} from '../../utils/bpmnTemplates';
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
   * Initialize example process on first visit
   */
  useEffect(() => {
    const existingProcesses = BpmnService.getProcesses();
    const existingIds = new Set(existingProcesses.map((p) => p.id));
    const added: BpmnProcess[] = [];

    if (!existingIds.has('example_tree_felling')) {
      const treeFellingExample: BpmnProcess = {
        id: 'example_tree_felling',
        name: 'Tree Felling Permit (Example)',
        description: 'Example BPMN process demonstrating DMN decision tasks with embedded forms',
        xml: TREE_FELLING_EXAMPLE_XML,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        linkedDmnTemplates: ['TreeFellingDecision', 'ReplacementTreeDecision'],
        readonly: true,
        status: 'example', // ADD THIS
      };
      BpmnService.saveProcess(treeFellingExample);
      added.push(treeFellingExample);
    }

    if (!existingIds.has('example_awb_process')) {
      const awbExample: BpmnProcess = {
        id: 'example_awb_process',
        name: 'AWB Generic Process (Example)',
        description:
          'AWB General Administrative Law Act shell: 8-phase procedural process reusable across all Dutch government public services',
        xml: AWB_PROCESS_EXAMPLE_XML,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        linkedDmnTemplates: ['AwbCompletenessCheck', 'ArchivesActRetention'],
        readonly: true,
        status: 'example', // ADD THIS
      };
      BpmnService.saveProcess(awbExample);
      added.push(awbExample);
    }

    if (!existingIds.has('wip_asylum_migration')) {
      // Changed ID
      const asylumMigration: BpmnProcess = {
        id: 'wip_asylum_migration', // Changed ID
        name: 'Migration & Asylum Procedure',
        description: 'Complex migration and asylum procedure - work in progress',
        xml: ASYLUM_MIGRATION_EXAMPLE_XML,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        linkedDmnTemplates: [],
        readonly: false, // Changed to false - it's editable
        status: 'wip', // ADD THIS - shows WIP badge
      };
      BpmnService.saveProcess(asylumMigration);
      added.push(asylumMigration);
    }

    if (added.length > 0) {
      const allProcesses = BpmnService.getProcesses();
      setProcesses(allProcesses);
      // Activate the first newly added example if nothing is active yet
      if (!activeProcessId) {
        setActiveProcessId(added[0].id);
        setCurrentXml(added[0].xml);
      }
    }
  }, [activeProcessId]);

  /**
   * Create new BPMN process
   */
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

  /**
   * Load existing process
   */
  const handleLoadProcess = (processId: string) => {
    const process = BpmnService.getProcess(processId);
    if (process) {
      setActiveProcessId(process.id);
      setCurrentXml(process.xml);
    }
  };

  /**
   * Save current process
   */
  const handleSaveProcess = (xml: string) => {
    if (!activeProcessId) return;

    const process = BpmnService.getProcess(activeProcessId);
    if (process) {
      const updatedProcess: BpmnProcess = {
        ...process,
        xml,
        updatedAt: new Date().toISOString(),
      };
      BpmnService.saveProcess(updatedProcess);
      setProcesses(BpmnService.getProcesses());
      setCurrentXml(xml);
    }
  };

  /**
   * Delete process
   */
  const handleDeleteProcess = (processId: string) => {
    const process = BpmnService.getProcess(processId);

    // Prevent deletion of readonly processes
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

  /**
   * Update process name
   */
  const handleUpdateProcessName = (processId: string, name: string) => {
    const process = BpmnService.getProcess(processId);
    if (process) {
      BpmnService.saveProcess({ ...process, name, updatedAt: new Date().toISOString() });
      setProcesses(BpmnService.getProcesses());
    }
  };

  /**
   * Close current process and return to empty state
   */
  const handleCloseProcess = () => {
    setActiveProcessId(null);
    setCurrentXml(DEFAULT_BPMN_XML);
  };

  return (
    <div className="flex h-full bg-slate-50">
      {/* Left Panel: Process List */}
      <ProcessList
        processes={processes}
        activeProcessId={activeProcessId}
        onCreateProcess={handleCreateProcess}
        onLoadProcess={handleLoadProcess}
        onDeleteProcess={handleDeleteProcess}
        onUpdateProcessName={handleUpdateProcessName}
      />

      {/* Middle Panel: BPMN Canvas */}
      <div className="flex-1 flex flex-col border-x border-slate-200">
        {activeProcess ? (
          <BpmnCanvas
            xml={currentXml}
            endpoint={endpoint}
            onSave={handleSaveProcess}
            onElementSelect={() => {
              // Element selection handled by properties panel
            }}
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
