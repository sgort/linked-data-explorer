/**
 * packages/frontend/src/components/DmnValidator/DmnValidator.tsx
 *
 * "Validate DMN" view for the Linked Data Explorer.
 * Allows rule authors to validate a DMN file against the RONL DMN+ layers
 * without needing the CPSV Editor.
 *
 * Calls: POST /v1/dmns/validate
 */

import {
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  FileText,
  Info,
  ShieldCheck,
  Upload,
  X,
} from 'lucide-react';
import React, { useRef, useState } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ValidationIssue {
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  location?: string;
  line?: number;
  column?: number;
}

interface LayerResult {
  label: string;
  issues: ValidationIssue[];
}

interface ValidationResult {
  valid: boolean;
  parseError: string | null;
  layers: {
    base: LayerResult;
    business: LayerResult;
    execution: LayerResult;
    interaction: LayerResult;
    content: LayerResult;
  };
  summary: {
    errors: number;
    warnings: number;
    infos: number;
  };
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SeverityIcon({ severity, size = 14 }: { severity: string; size?: number }) {
  if (severity === 'error')
    return <AlertCircle size={size} className="text-red-500 flex-shrink-0 mt-0.5" />;
  if (severity === 'warning')
    return <AlertTriangle size={size} className="text-yellow-500 flex-shrink-0 mt-0.5" />;
  return <Info size={size} className="text-blue-400 flex-shrink-0 mt-0.5" />;
}

function IssueRow({ issue }: { issue: ValidationIssue }) {
  const bg =
    issue.severity === 'error'
      ? 'bg-red-50 border-red-100'
      : issue.severity === 'warning'
        ? 'bg-yellow-50 border-yellow-100'
        : 'bg-blue-50 border-blue-100';

  return (
    <div className={`flex items-start gap-2 px-3 py-2 rounded border text-xs ${bg}`}>
      <SeverityIcon severity={issue.severity} />
      <div className="flex-1 min-w-0">
        <span className="font-mono text-slate-400 mr-1.5">{issue.code}</span>
        <span className="text-slate-700">{issue.message}</span>
        {issue.location && (
          <span className="block mt-0.5 font-mono text-slate-400 truncate">{issue.location}</span>
        )}
        {issue.line && (
          <span className="block mt-0.5 text-slate-400">
            Line {issue.line}
            {issue.column ? `, col ${issue.column}` : ''}
          </span>
        )}
      </div>
    </div>
  );
}

function LayerSection({ layer }: { layer: LayerResult }) {
  const [open, setOpen] = useState(false);

  const errorCount = layer.issues.filter((i) => i.severity === 'error').length;
  const warningCount = layer.issues.filter((i) => i.severity === 'warning').length;
  const infoCount = layer.issues.filter((i) => i.severity === 'info').length;
  const allClear = layer.issues.length === 0;

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          {allClear ? (
            <CheckCircle size={14} className="text-green-500 flex-shrink-0" />
          ) : (
            <SeverityIcon
              severity={errorCount > 0 ? 'error' : warningCount > 0 ? 'warning' : 'info'}
            />
          )}
          <span className="text-sm font-medium text-slate-700 truncate">{layer.label}</span>
        </div>
        <div className="flex items-center gap-1.5 ml-2 flex-shrink-0">
          {allClear && <span className="text-xs text-green-600 font-medium">OK</span>}
          {errorCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-medium">
              {errorCount}E
            </span>
          )}
          {warningCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-yellow-100 text-yellow-700 text-xs font-medium">
              {warningCount}W
            </span>
          )}
          {infoCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-medium">
              {infoCount}I
            </span>
          )}
          {open ? (
            <ChevronUp size={14} className="text-slate-400" />
          ) : (
            <ChevronDown size={14} className="text-slate-400" />
          )}
        </div>
      </button>

      {open && (
        <div className="px-3 py-2 space-y-1.5 bg-white">
          {layer.issues.length === 0 ? (
            <p className="text-xs text-slate-400 italic">No issues found.</p>
          ) : (
            layer.issues.map((issue, idx) => (
              <IssueRow key={`${issue.code}-${idx}`} issue={issue} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

interface DmnValidatorProps {
  apiBaseUrl: string;
}

const DmnValidator: React.FC<DmnValidatorProps> = ({ apiBaseUrl }) => {
  const [file, setFile] = useState<{ name: string; size: number; content: string } | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (selected: File) => {
    if (!selected.name.endsWith('.dmn') && !selected.name.endsWith('.xml')) {
      setError('Please upload a .dmn or .xml file.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      setFile({ name: selected.name, size: selected.size, content: e.target?.result as string });
      setResult(null);
      setError(null);
    };
    reader.onerror = () => setError('Failed to read file.');
    reader.readAsText(selected);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const handleClear = () => {
    setFile(null);
    setResult(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleValidate = async () => {
    if (!file) return;
    setIsValidating(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch(`${apiBaseUrl}/v1/dmns/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: file.content }),
      });
      const data = (await response.json()) as {
        success: boolean;
        data?: ValidationResult;
        error?: { message: string };
      };
      if (!response.ok || !data.success) {
        throw new Error(data.error?.message ?? `Server error: ${response.status}`);
      }
      setResult(data.data!);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Validation request failed.');
    } finally {
      setIsValidating(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
      {/* Header */}
      <div className="px-6 py-4 bg-white border-b border-slate-200 flex-shrink-0">
        <div className="flex items-center gap-3">
          <ShieldCheck size={20} className="text-blue-600" />
          <div>
            <h2 className="text-lg font-semibold text-slate-800">DMN Validator</h2>
            <p className="text-sm text-slate-500">
              Validate a DMN file against the RONL DMN+ syntactic layers before publishing.
            </p>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto space-y-5">
          {/* Drop zone */}
          {!file ? (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors cursor-pointer ${
                isDragging
                  ? 'border-blue-400 bg-blue-50'
                  : 'border-slate-300 bg-white hover:border-blue-400 hover:bg-blue-50'
              }`}
            >
              <Upload size={36} className="mx-auto text-slate-400 mb-3" />
              <p className="text-slate-600 font-medium">Drop a DMN file here</p>
              <p className="text-slate-400 text-sm mt-1">or click to browse — .dmn or .xml</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".dmn,.xml"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
                className="hidden"
              />
            </div>
          ) : (
            /* File info card */
            <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileText size={20} className="text-slate-500" />
                <div>
                  <p className="font-medium text-slate-800 text-sm">{file.name}</p>
                  <p className="text-xs text-slate-500">{(file.size / 1024).toFixed(1)} KB</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleValidate}
                  disabled={isValidating}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isValidating ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Validating…
                    </>
                  ) : (
                    <>
                      <ShieldCheck size={16} />
                      Validate
                    </>
                  )}
                </button>
                <button
                  onClick={handleClear}
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
                  title="Clear file"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
              <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Results */}
          {result && (
            <div className="space-y-3">
              {/* Summary bar */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {result.valid ? (
                    <CheckCircle size={22} className="text-green-500" />
                  ) : (
                    <AlertCircle size={22} className="text-red-500" />
                  )}
                  <div>
                    <p className="font-semibold text-slate-800">
                      {result.valid ? 'File is valid' : 'Validation failed'}
                    </p>
                    {result.parseError && (
                      <p className="text-xs text-red-600 mt-0.5">{result.parseError}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  {result.summary.errors > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">
                      {result.summary.errors} error{result.summary.errors !== 1 ? 's' : ''}
                    </span>
                  )}
                  {result.summary.warnings > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 font-medium">
                      {result.summary.warnings} warning{result.summary.warnings !== 1 ? 's' : ''}
                    </span>
                  )}
                  {result.summary.infos > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
                      {result.summary.infos} info
                    </span>
                  )}
                  {result.valid && result.summary.warnings === 0 && (
                    <span className="text-green-600 font-medium">All checks passed</span>
                  )}
                </div>
              </div>

              {/* Layer details */}
              {Object.values(result.layers).map((layer) => (
                <LayerSection key={layer.label} layer={layer} />
              ))}

              <p className="text-xs text-slate-400 px-1">
                E = error · W = warning · I = informational. Click a layer to expand its issues.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DmnValidator;
