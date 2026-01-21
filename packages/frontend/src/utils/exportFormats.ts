/**
 * Export format definitions
 * Centralized configuration for all supported export formats
 */

import { ExportFormat, ExportFormatDefinition } from '../types/export.types';

export const EXPORT_FORMATS: Record<ExportFormat, ExportFormatDefinition> = {
  json: {
    id: 'json',
    name: 'JSON',
    description: 'Chain configuration in JSON format',
    extension: 'json',
    mimeType: 'application/json',
    icon: '📄',
  },
  bpmn: {
    id: 'bpmn',
    name: 'BPMN 2.0',
    description: 'Business Process Model (BPMN 2.0 XML)',
    extension: 'bpmn',
    mimeType: 'application/xml',
    icon: '📊',
  },
  package: {
    id: 'package',
    name: 'Complete Package (ZIP)',
    description: 'BPMN diagram + all DMN files (ready to deploy)',
    extension: 'zip',
    mimeType: 'application/zip',
    icon: '📦',
  },
};

/**
 * Get all available export formats
 */
export function getAvailableFormats(): ExportFormatDefinition[] {
  return Object.values(EXPORT_FORMATS);
}

/**
 * Get format definition by ID
 */
export function getFormatById(formatId: ExportFormat): ExportFormatDefinition | null {
  return EXPORT_FORMATS[formatId] || null;
}

/**
 * Generate default filename for export
 */
export function generateFilename(
  chainName: string,
  format: ExportFormat,
  timestamp: Date = new Date()
): string {
  const formatDef = getFormatById(format);
  if (!formatDef) {
    throw new Error(`Unknown export format: ${format}`);
  }

  // Sanitize chain name for filename
  const sanitized = chainName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  const dateStr = timestamp.toISOString().split('T')[0];
  const timeStr = timestamp.toTimeString().split(' ')[0].replace(/:/g, '');

  return `chain-${sanitized}-${dateStr}-${timeStr}.${formatDef.extension}`;
}
