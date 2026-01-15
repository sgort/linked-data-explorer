/**
 * Chain Export Service
 * Handles exporting chains in various formats
 */

import { DmnModel } from '../types';
import { ChainExportData, ExportFormat, ExportOptions, ExportResult } from '../types/export.types';
import { generateFilename, getFormatById } from './exportFormats';

/**
 * Export chain to JSON format
 */
function exportToJson(data: ChainExportData, options: ExportOptions): string {
  const prettyPrint = options.prettyPrint !== false;
  return JSON.stringify(data, null, prettyPrint ? 2 : 0);
}

/**
 * Export chain to BPMN 2.0 XML format
 */
function exportToBpmn(data: ChainExportData, chainDmns: DmnModel[]): string {
  const processId = `chain-${Date.now()}`;
  const processName = data.name || 'Unnamed Chain';

  // Build BPMN XML with Operaton namespace for extensions
  let bpmn = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
             xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
             xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
             xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
             xmlns:operaton="http://operaton.org/schema/1.0/bpmn"
             xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
             id="definitions_${processId}"
             targetNamespace="http://bpmn.io/schema/bpmn"
             exporter="Linked Data Explorer"
             exporterVersion="0.4.0"
             xsi:schemaLocation="http://www.omg.org/spec/BPMN/20100524/MODEL BPMN20.xsd">
  
  <process id="${processId}" name="${escapeXml(processName)}" isExecutable="false">
    
    <!-- Start Event -->
    <startEvent id="start" name="Start">
      <outgoing>flow-start-dmn-0</outgoing>
    </startEvent>
`;

  // Add DMN tasks
  data.chain.dmnIds.forEach((dmnId, index) => {
    const dmn = chainDmns.find((d) => d.identifier === dmnId);
    const taskId = `dmn-${index}`;
    const taskName = dmn?.title || dmnId;
    const taskDescription = dmn?.description || '';

    bpmn += `
    <!-- DMN Task ${index + 1}: ${taskName} -->
    <businessRuleTask id="${taskId}" name="${escapeXml(taskName)}">`;

    if (taskDescription) {
      bpmn += `
      <documentation>${escapeXml(taskDescription)}</documentation>`;
    }

    bpmn += `
      <extensionElements>
        <operaton:properties>
          <operaton:property name="dmnId" value="${escapeXml(dmnId)}" />
          <operaton:property name="dmnTitle" value="${escapeXml(taskName)}" />
        </operaton:properties>
      </extensionElements>
      <incoming>flow-${index === 0 ? 'start' : `dmn-${index - 1}`}-${taskId}</incoming>
      <outgoing>flow-${taskId}-${index === data.chain.dmnIds.length - 1 ? 'end' : `dmn-${index + 1}`}</outgoing>
    </businessRuleTask>
`;
  });

  // Add End Event
  bpmn += `
    <!-- End Event -->
    <endEvent id="end" name="End">
      <incoming>flow-dmn-${data.chain.dmnIds.length - 1}-end</incoming>
    </endEvent>
`;

  // Add Sequence Flows
  bpmn += `
    <!-- Sequence Flows -->
    <sequenceFlow id="flow-start-dmn-0" sourceRef="start" targetRef="dmn-0" />
`;

  for (let i = 0; i < data.chain.dmnIds.length - 1; i++) {
    bpmn += `    <sequenceFlow id="flow-dmn-${i}-dmn-${i + 1}" sourceRef="dmn-${i}" targetRef="dmn-${i + 1}" />
`;
  }

  bpmn += `    <sequenceFlow id="flow-dmn-${data.chain.dmnIds.length - 1}-end" sourceRef="dmn-${data.chain.dmnIds.length - 1}" targetRef="end" />
`;

  bpmn += `  </process>
`;

  // Add visual layout (optional but makes it viewable in BPMN editors)
  bpmn += `
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="${processId}">
      
      <!-- Start Event Shape -->
      <bpmndi:BPMNShape id="start_di" bpmnElement="start">
        <dc:Bounds x="152" y="102" width="36" height="36" />
        <bpmndi:BPMNLabel>
          <dc:Bounds x="158" y="145" width="24" height="14" />
        </bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
`;

  // DMN task shapes
  data.chain.dmnIds.forEach((dmnId, index) => {
    const x = 250 + index * 200;
    const y = 80;

    bpmn += `
      <!-- DMN Task ${index + 1} Shape -->
      <bpmndi:BPMNShape id="dmn-${index}_di" bpmnElement="dmn-${index}">
        <dc:Bounds x="${x}" y="${y}" width="100" height="80" />
      </bpmndi:BPMNShape>
`;
  });

  // End event shape
  const endX = 250 + data.chain.dmnIds.length * 200;
  bpmn += `
      <!-- End Event Shape -->
      <bpmndi:BPMNShape id="end_di" bpmnElement="end">
        <dc:Bounds x="${endX}" y="102" width="36" height="36" />
        <bpmndi:BPMNLabel>
          <dc:Bounds x="${endX + 6}" y="145" width="20" height="14" />
        </bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
`;

  // Sequence flow edges
  bpmn += `
      <!-- Start to first DMN -->
      <bpmndi:BPMNEdge id="flow-start-dmn-0_di" bpmnElement="flow-start-dmn-0">
        <di:waypoint x="188" y="120" />
        <di:waypoint x="250" y="120" />
      </bpmndi:BPMNEdge>
`;

  for (let i = 0; i < data.chain.dmnIds.length - 1; i++) {
    const x1 = 350 + i * 200;
    const x2 = 250 + (i + 1) * 200;

    bpmn += `
      <!-- DMN ${i + 1} to DMN ${i + 2} -->
      <bpmndi:BPMNEdge id="flow-dmn-${i}-dmn-${i + 1}_di" bpmnElement="flow-dmn-${i}-dmn-${i + 1}">
        <di:waypoint x="${x1}" y="120" />
        <di:waypoint x="${x2}" y="120" />
      </bpmndi:BPMNEdge>
`;
  }

  // Last DMN to end
  const lastX = 350 + (data.chain.dmnIds.length - 1) * 200;
  bpmn += `
      <!-- Last DMN to End -->
      <bpmndi:BPMNEdge id="flow-dmn-${data.chain.dmnIds.length - 1}-end_di" bpmnElement="flow-dmn-${data.chain.dmnIds.length - 1}-end">
        <di:waypoint x="${lastX}" y="120" />
        <di:waypoint x="${endX}" y="120" />
      </bpmndi:BPMNEdge>
`;

  bpmn += `    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
  
</definitions>`;

  return bpmn;
}

/**
 * Escape XML special characters
 */
function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Main export function
 */
export async function exportChain(
  dmnIds: string[],
  inputs: Record<string, unknown>,
  chainDmns: DmnModel[],
  options: ExportOptions
): Promise<ExportResult> {
  try {
    const formatDef = getFormatById(options.format);
    if (!formatDef) {
      return {
        success: false,
        filename: '',
        content: '',
        error: `Unknown export format: ${options.format}`,
      };
    }

    // Build export data
    const exportData: ChainExportData = {
      version: '1.0',
      name: options.filename || 'Unnamed Chain',
      description: `Chain with ${dmnIds.length} DMN${dmnIds.length !== 1 ? 's' : ''}`,
      createdAt: new Date().toISOString(),
      chain: {
        dmnIds,
        inputs,
      },
    };

    // Add metadata if requested
    if (options.includeMetadata !== false) {
      exportData.metadata = {
        complexity: dmnIds.length <= 2 ? 'simple' : dmnIds.length <= 4 ? 'medium' : 'complex',
        estimatedTime: dmnIds.length * 150 + 50,
        tags: ['exported', 'chain'],
      };
    }

    // Generate content based on format
    let content: string;
    switch (options.format) {
      case 'json':
        content = exportToJson(exportData, options);
        break;

      case 'bpmn':
        content = exportToBpmn(exportData, chainDmns);
        break;

      default:
        return {
          success: false,
          filename: '',
          content: '',
          error: `Unsupported export format: ${options.format}`,
        };
    }

    // Generate filename
    const filename = options.filename || generateFilename(exportData.name, options.format);

    // Create blob
    const blob = new Blob([content], { type: formatDef.mimeType });

    // Trigger download
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    return {
      success: true,
      filename,
      content: blob,
    };
  } catch (error) {
    return {
      success: false,
      filename: '',
      content: '',
      error: error instanceof Error ? error.message : 'Unknown error during export',
    };
  }
}

/**
 * Validate chain before export
 */
export function validateChainForExport(dmnIds: string[]): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (dmnIds.length === 0) {
    errors.push('Chain is empty - add at least one DMN');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
