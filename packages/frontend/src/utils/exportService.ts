/**
 * Chain Export Service
 * Handles exporting chains in various formats
 */

import JSZip from 'jszip';

import { DmnModel } from '../types';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { ChainExportData, ExportFormat, ExportOptions, ExportResult } from '../types/export.types';
import { generateFilename, getFormatById } from './exportFormats';

// Get API base URL from environment
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

/**
 * Download a blob as a file
 */
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

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
  // Use stable process ID based on chain content (not timestamp)
  const processId = `chain-${data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
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
             exporterVersion="0.5.0"
             xsi:schemaLocation="http://www.omg.org/spec/BPMN/20100524/MODEL BPMN20.xsd">
  
  <process id="${processId}" name="${escapeXml(processName)}" isExecutable="true" operaton:historyTimeToLive="180">
    
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
    <businessRuleTask id="${taskId}" name="${escapeXml(taskName)}" operaton:decisionRef="${escapeXml(dmnId)}" operaton:resultVariable="decision_${index}_result" operaton:mapDecisionResult="singleEntry">`;

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
 * Fetch DMN XML from backend
 */
async function fetchDmnXml(definitionKey: string): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/api/dmns/${definitionKey}/xml`);

  if (!response.ok) {
    throw new Error(`Failed to fetch DMN ${definitionKey}: ${response.statusText}`);
  }

  return await response.text();
}

/**
 * Export chain as ZIP package with BPMN and DMN files
 */
async function exportAsPackage(
  data: ChainExportData,
  chainDmns: DmnModel[],
  options: ExportOptions
): Promise<ExportResult> {
  try {
    const zip = new JSZip();

    // 1. Add BPMN file
    const bpmnContent = exportToBpmn(data, chainDmns);
    zip.file('chain.bpmn', bpmnContent);

    // 2. Fetch and add all DMN files
    for (const dmnId of data.chain.dmnIds) {
      try {
        const dmnXml = await fetchDmnXml(dmnId);
        zip.file(`${dmnId}.dmn`, dmnXml);
      } catch (error) {
        console.error(`Failed to fetch DMN ${dmnId}:`, error);
        // Continue with other DMNs even if one fails
      }
    }

    // 3. Add README
    const readme = generateReadme(data, chainDmns);
    zip.file('README.md', readme);

    // 4. Generate ZIP
    const blob = await zip.generateAsync({ type: 'blob' });

    // 5. Download
    const filename = generateFilename(options.filename || 'chain', 'package');
    downloadBlob(blob, filename);

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
      error: error instanceof Error ? error.message : 'Export failed',
    };
  }
}

/**
 * Generate README for ZIP package
 */
function generateReadme(data: ChainExportData, chainDmns: DmnModel[]): string {
  // Get Operaton URL from environment (fallback to placeholder)
  const operatonUrl = import.meta.env.VITE_OPERATON_BASE_URL
    ? import.meta.env.VITE_OPERATON_BASE_URL.replace(/\/engine-rest$/, '')
    : '<YOUR_OPERATON_URL>';

  const operatonApiUrl = `${operatonUrl}/engine-rest`;

  // Generate process ID (same logic as in exportToBpmn)
  const processId = `chain-${data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

  // Individual deploy commands (used in Alternative section)
  const individualDeployCommands = chainDmns
    .map((dmn, i) => {
      return [
        `# ${i + 1}. Deploy ${dmn.identifier}`,
        `curl -X POST ${operatonApiUrl}/deployment/create \\`,
        `  -F "deployment-name=${dmn.identifier.toLowerCase()}-$(date +%Y%m%d)" \\`,
        `  -F "data=@${dmn.identifier}.dmn"`,
      ].join('\n');
    })
    .join('\n\n');

  return `# ${data.name}

## Chain Export Package

This package contains a complete DMN chain ready for deployment to Operaton.

### Contents

1. **chain.bpmn** - BPMN 2.0 process diagram
2. **DMN Files** - Decision model definitions:
${chainDmns.map((dmn) => `   - ${dmn.identifier}.dmn - ${dmn.title}`).join('\n')}
3. **README.md** - This file

---

## Deployment Instructions

### Important: Two-Step Deployment Required

The BPMN process references the DMN files, so they must be deployed first.

### Step 1: Deploy DMN Files

Deploy all DMN files first:

\`\`\`bash
# Navigate to extracted package directory
cd /path/to/extracted/package

# Deploy DMN files
curl -X POST ${operatonApiUrl}/deployment/create \\
  -F "deployment-name=${data.name.toLowerCase().replace(/\s+/g, '-')}-dmns-$(date +%Y%m%d-%H%M%S)" \\
  -F "enable-duplicate-filtering=true" \\
${chainDmns
  .map((dmn, i) =>
    i === chainDmns.length - 1
      ? `  -F "data=@${dmn.identifier}.dmn"`
      : `  -F "data=@${dmn.identifier}.dmn" \\`
  )
  .join('\n')}
\`\`\`

**Expected result:** All DMN decision definitions deployed.

### Step 2: Deploy BPMN Process

After DMNs are deployed, deploy the BPMN diagram:

\`\`\`bash
# Deploy BPMN process
curl -X POST ${operatonApiUrl}/deployment/create \\
  -F "deployment-name=${data.name.toLowerCase().replace(/\s+/g, '-')}-bpmn-$(date +%Y%m%d-%H%M%S)" \\
  -F "enable-duplicate-filtering=true" \\
  -F "data=@chain.bpmn"
\`\`\`

**Expected result:** Process definition deployed and visible in Operaton Cockpit.

### Why Two Steps?

The BPMN process contains references to the DMN files (via \`operaton:decisionRef\`). Operaton validates these references during deployment, so the DMNs must exist before the BPMN can be deployed.

### Alternative: Deploy Individual DMNs

If you prefer to deploy DMNs one at a time:

\`\`\`bash
${individualDeployCommands}
\`\`\`

Then deploy the BPMN as shown in Step 2 above.

### Verify Deployments

After both deployment steps:

\`\`\`bash
# Verify DMNs are deployed
curl ${operatonApiUrl}/decision-definition | jq

# Verify specific DMNs
${chainDmns.map((dmn) => `curl ${operatonApiUrl}/decision-definition/key/${dmn.identifier} | jq`).join('\n')}

# Verify BPMN process is deployed
curl ${operatonApiUrl}/process-definition/key/${processId} | jq
\`\`\`

---

## Test the Chain

### Option 1: Use Linked Data Explorer (Recommended)

1. Open: https://linkeddata.open-regels.nl
2. Navigate to "DMN Orchestration" tab
3. Build the chain or load from template
4. Use the test data below
5. Click "Execute Chain"

### Option 2: Direct API Testing

Test individual DMN execution:

\`\`\`bash
# Test first DMN (${chainDmns[0]?.identifier || 'DMN'})
curl -X POST ${operatonApiUrl}/decision-definition/key/${chainDmns[0]?.identifier || 'DMN_KEY'}/evaluate \\
  -H "Content-Type: application/json" \\
  -d '{
    "variables": {
${
  data.chain.inputs && chainDmns[0]?.inputs
    ? chainDmns[0].inputs
        .slice(0, 3)
        .map((input) => {
          const value = data.chain.inputs[input.identifier];
          return `      "${input.identifier}": {"value": ${JSON.stringify(value)}, "type": "${input.type || 'String'}"}`;
        })
        .join(',\n')
    : '      "example": {"value": "value", "type": "String"}'
}
    }
  }'
\`\`\`

---

## Test Data

### Input Variables

${
  data.chain.inputs
    ? Object.entries(data.chain.inputs)
        .map(([key, value]) => `- **${key}**: \`${JSON.stringify(value)}\``)
        .join('\n')
    : '(No test data included)'
}

### Expected Execution Flow

${chainDmns
  .map(
    (dmn, i) => `${i + 1}. **${dmn.identifier}** - ${dmn.title}
   - Inputs: ${dmn.inputs?.length || 0} variables
   - Outputs: ${dmn.outputs?.length || 0} variables`
  )
  .join('\n\n')}

### Expected Results

When executed with the provided test data, you should receive outputs from each DMN in sequence. Each DMN's outputs become available as inputs for subsequent DMNs in the chain.

**Final outputs** will include all variables from the last DMN (${chainDmns[chainDmns.length - 1]?.identifier || 'final DMN'}):
${
  chainDmns[chainDmns.length - 1]?.outputs
    ? chainDmns[chainDmns.length - 1].outputs
        .map((output) => `- ${output.identifier} (${output.type || 'unknown'})`)
        .join('\n')
    : '(See DMN definition for output variables)'
}

---

## Working with the BPMN Diagram

The included \`chain.bpmn\` file provides a visual representation of your DMN chain.

### After Deploying (Step 2)

✅ **BPMN is now in Operaton!**

View it in Operaton Cockpit:
1. Navigate to ${operatonUrl}/operaton/app/cockpit/
2. Go to "Processes" section
3. Find your process: \`${processId}\`
4. View the process diagram showing all DMN tasks

### Features

The deployed BPMN process:
- ✅ **Visualizes the chain** - See the flow from Start → DMN1 → DMN2 → ... → End
- ✅ **References DMNs** - Each task is linked to its DMN via \`operaton:decisionRef\`
- ✅ **Executable** - Can be started from Cockpit (requires input variables)
- ✅ **History tracking** - 180 days retention for audit

### Optional: View in Modeler

You can also open \`chain.bpmn\` in:
- **Operaton Modeler** (recommended)
- **Camunda Modeler**
- **bpmn.io** online editor

This allows you to:
- Edit the diagram
- Add additional tasks or logic
- Customize properties
- Re-deploy with changes

---

## Configuration

### Operaton Instance

This package is configured for:
- **URL:** ${operatonApiUrl}
- **Version:** Operaton 7.x / Camunda 7.x compatible

If deploying to a different Operaton instance, replace the URL in the commands above.

### Authentication

If your Operaton instance requires authentication, add credentials to curl commands:

\`\`\`bash
curl -u username:password -X POST ${operatonApiUrl}/deployment/create ...
\`\`\`

---

## Troubleshooting

### DMN Not Found (404)
- Verify DMN is deployed: \`curl ${operatonApiUrl}/decision-definition/key/<DMN_KEY>\`
- Check deployment name and definition key match

### Evaluation Error (500)
- Check input variable types match DMN definition
- Verify all required inputs are provided
- Review Operaton server logs

### Deployment Failed
- Ensure DMN XML is valid (open in modeler first)
- Check Operaton REST API is accessible
- Verify \`enable-duplicate-filtering\` setting

---

## Support

### Resources
- **Linked Data Explorer:** https://linkeddata.open-regels.nl
- **Operaton Documentation:** https://operaton.org/docs/
- **DMN Specification:** https://www.omg.org/spec/DMN/

### Chain Information
- **Generated:** ${new Date().toISOString()}
- **Version:** ${data.version}
- **DMN Count:** ${chainDmns.length}
- **Complexity:** ${data.metadata?.complexity || 'N/A'}
${data.metadata?.estimatedTime ? `- **Estimated Execution Time:** ~${data.metadata.estimatedTime}ms` : ''}

---

## Next Steps

1. ✅ Deploy DMN files (see "Quick Deploy" above)
2. ✅ Verify deployments (see "Verify Deployments")
3. ✅ Test execution (see "Test the Chain")
4. ✅ Review BPMN diagram (optional)
5. ✅ Integrate with your application

**Ready to use!** 🚀
`;
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

    // Handle package format differently
    if (options.format === 'package') {
      return await exportAsPackage(exportData, chainDmns, options);
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
    downloadBlob(blob, filename);

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
