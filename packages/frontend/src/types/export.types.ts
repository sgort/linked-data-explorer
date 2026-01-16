/**
 * Export format types and interfaces
 */

export type ExportFormat = 'json' | 'bpmn' | 'package';

export interface ExportFormatDefinition {
  id: ExportFormat;
  name: string;
  description: string;
  extension: string;
  mimeType: string;
  icon: string;
}

export interface ChainExportData {
  version: string;
  name: string;
  description?: string;
  createdAt: string;
  chain: {
    dmnIds: string[];
    inputs: Record<string, unknown>;
  };
  metadata?: {
    complexity?: 'simple' | 'medium' | 'complex';
    estimatedTime?: number;
    author?: string;
    tags?: string[];
  };
}

export interface ExportOptions {
  format: ExportFormat;
  filename?: string;
  includeMetadata?: boolean;
  prettyPrint?: boolean;
}

export interface ExportResult {
  success: boolean;
  filename: string;
  content: string | Blob;
  error?: string;
}
